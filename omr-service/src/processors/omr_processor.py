"""
omr_processor.py — OMR·Pro Core Optical Mark Recognition
========================================================
Pipeline:
  1. Load image (JPEG/PNG/TIFF)
  2. Pre-process: grayscale, denoise, adaptive threshold
  3. Find alignment markers (corner squares / QR box)
  4. Perspective correction (Homography)
  5. Locate bubble grid regions
  6. Analyse each bubble (filled / empty / ambiguous)
  7. Decode QR code
  8. Return structured result

Dependencies: opencv-python, numpy, pyzbar, scipy
"""

import cv2
import numpy as np
from pyzbar import pyzbar
from dataclasses import dataclass, field, asdict
from typing import Optional
import logging
import json
import math

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# Data structures
# ──────────────────────────────────────────────────────────────

@dataclass
class BubbleResult:
    row: int
    col: int
    label: str          # 'A','B','C','D' / 'C','E' / '0'..'9'
    filled: bool
    confidence: float   # 0.0 – 1.0
    fill_ratio: float   # raw pixel fill ratio

@dataclass
class QuestionResult:
    number: int
    q_type: str                     # 'multiple_choice' | 'true_false' | 'numeric'
    marked_answer: Optional[str]    # 'A','B','C','D' / 'C','E' / '158'
    has_multiple: bool = False
    is_blank: bool = False
    confidence: float = 1.0
    bubbles: list[BubbleResult] = field(default_factory=list)

@dataclass
class OMRResult:
    success: bool
    qr_data: Optional[str]
    exam_id: Optional[str]
    student_id: Optional[str]
    rotation_angle: float
    perspective_corners: list
    questions: list[QuestionResult]
    confidence: float               # overall scan confidence
    warnings: list[str] = field(default_factory=list)
    error: Optional[str] = None


# ──────────────────────────────────────────────────────────────
# Configuration (matches PDF layout)
# ──────────────────────────────────────────────────────────────

class OMRConfig:
    # Card dimensions (A4 at 300 DPI)
    CARD_WIDTH_PX  = 2480
    CARD_HEIGHT_PX = 3508

    # Bubble detection
    FILL_THRESHOLD  = 0.38   # ratio above = filled
    AMBIG_THRESHOLD = 0.25   # ratio between ambig and fill = ambiguous
    NOISE_MAX_PX    = 3      # blobs <= this size are noise

    # Alignment markers (4 corner squares, 20x20mm @ 300dpi = 236px)
    MARKER_SIZE   = 236
    MARKER_MARGIN = 80       # from card edge

    # Adaptive threshold params
    ADAPT_BLOCK  = 31
    ADAPT_C      = 10


# ──────────────────────────────────────────────────────────────
# Main processor
# ──────────────────────────────────────────────────────────────

class OMRProcessor:
    def __init__(self, config: OMRConfig = None):
        self.cfg = config or OMRConfig()

    def process(self, image_path: str, exam_layout: dict) -> OMRResult:
        """
        exam_layout = {
          "questions": [
            {"number": 1, "type": "multiple_choice", "region": {...}},
            ...
          ]
        }
        """
        try:
            img = self._load_image(image_path)
            if img is None:
                return OMRResult(False, None, None, None, 0.0, [], [], 0.0,
                                 error='Não foi possível carregar a imagem.')

            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

            # Step 1: Detect rotation and correct
            angle = self._detect_rotation(gray)
            if abs(angle) > 0.5:
                img  = self._rotate_image(img, angle)
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

            # Step 2: Perspective correction
            corners, warped = self._correct_perspective(gray, img)

            # Step 3: Adaptive threshold
            thresh = cv2.adaptiveThreshold(
                warped, 255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV,
                self.cfg.ADAPT_BLOCK,
                self.cfg.ADAPT_C,
            )

            # Step 4: Decode QR code
            qr_data, exam_id, student_id = self._decode_qr(img)

            # Step 5: Analyse all questions
            questions = []
            warnings  = []
            confidences = []

            for q_spec in exam_layout.get('questions', []):
                q_result = self._process_question(thresh, q_spec)
                questions.append(q_result)
                confidences.append(q_result.confidence)

                if q_result.has_multiple:
                    warnings.append(f'Q.{q_result.number}: múltiplas marcações detectadas')
                if q_result.is_blank:
                    warnings.append(f'Q.{q_result.number}: questão em branco')
                if q_result.confidence < 0.6:
                    warnings.append(f'Q.{q_result.number}: baixa confiança ({q_result.confidence:.0%})')

            overall_confidence = float(np.mean(confidences)) if confidences else 0.0

            return OMRResult(
                success=True,
                qr_data=qr_data,
                exam_id=exam_id,
                student_id=student_id,
                rotation_angle=angle,
                perspective_corners=corners,
                questions=questions,
                confidence=overall_confidence,
                warnings=warnings,
            )

        except Exception as exc:
            logger.exception('OMR processing failed: %s', exc)
            return OMRResult(False, None, None, None, 0.0, [], [], 0.0,
                             error=str(exc))

    # ── Private helpers ──────────────────────────────────────

    def _load_image(self, path: str):
        img = cv2.imread(path, cv2.IMREAD_COLOR)
        if img is None:
            return None
        # Resize to standard size if needed
        h, w = img.shape[:2]
        scale = min(self.cfg.CARD_WIDTH_PX / w, self.cfg.CARD_HEIGHT_PX / h)
        if abs(scale - 1.0) > 0.05:
            img = cv2.resize(img, None, fx=scale, fy=scale,
                             interpolation=cv2.INTER_LANCZOS4)
        return img

    def _detect_rotation(self, gray) -> float:
        """Detect skew angle using Hough lines on edges."""
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, np.pi / 180, 200)
        if lines is None:
            return 0.0

        angles = []
        for line in lines[:30]:
            rho, theta = line[0]
            angle_deg = np.degrees(theta) - 90
            if abs(angle_deg) < 45:
                angles.append(angle_deg)

        return float(np.median(angles)) if angles else 0.0

    def _rotate_image(self, img, angle: float):
        h, w = img.shape[:2]
        M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        return cv2.warpAffine(img, M, (w, h),
                              flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_REPLICATE)

    def _correct_perspective(self, gray, color_img):
        """
        Find the 4 alignment corner markers and apply homography.
        Falls back to identity if markers not found.
        """
        # Find corner markers (black squares)
        _, binary = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL,
                                        cv2.CHAIN_APPROX_SIMPLE)

        candidates = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 1000 or area > 100000:
                continue
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
            if len(approx) == 4:
                x, y, w, h = cv2.boundingRect(approx)
                aspect = w / max(h, 1)
                if 0.7 < aspect < 1.3:   # roughly square
                    cx, cy = x + w // 2, y + h // 2
                    candidates.append((cx, cy))

        h_img, w_img = gray.shape[:2]

        if len(candidates) >= 4:
            # Sort into TL, TR, BL, BR
            candidates.sort(key=lambda p: p[0] + p[1])
            tl = candidates[0]
            candidates.sort(key=lambda p: -p[0] + p[1])
            bl = candidates[0]
            candidates.sort(key=lambda p: p[0] - p[1])
            tr = candidates[0]
            candidates.sort(key=lambda p: -p[0] - p[1])
            br_cand = candidates[0]

            src = np.float32([tl, tr, br_cand, bl])
            dst = np.float32([
                [0, 0],
                [w_img - 1, 0],
                [w_img - 1, h_img - 1],
                [0, h_img - 1],
            ])
            M = cv2.getPerspectiveTransform(src, dst)
            warped = cv2.warpPerspective(color_img[:,:,0] if len(color_img.shape)==3
                                         else color_img, M, (w_img, h_img))
            corners = [list(map(int, p)) for p in src]
            return corners, warped

        # No markers found — return as-is
        return [], gray

    def _decode_qr(self, img):
        """Decode QR code containing exam + student metadata."""
        decoded = pyzbar.decode(img)
        for obj in decoded:
            if obj.type in ('QRCODE', 'QR_CODE'):
                raw = obj.data.decode('utf-8')
                try:
                    data = json.loads(raw)
                    return raw, data.get('examId'), data.get('studentId')
                except json.JSONDecodeError:
                    return raw, None, None
        return None, None, None

    def _process_question(self, thresh, q_spec: dict) -> QuestionResult:
        q_num  = q_spec['number']
        q_type = q_spec['type']
        region = q_spec['region']  # {x, y, w, h, bubbles: [{label, x, y, r}]}

        bubbles: list[BubbleResult] = []
        filled_labels: list[str] = []

        for bubble_spec in region.get('bubbles', []):
            bx, by, br = bubble_spec['x'], bubble_spec['y'], bubble_spec['r']
            label = bubble_spec['label']

            # Create circular mask
            mask = np.zeros(thresh.shape, dtype=np.uint8)
            cv2.circle(mask, (bx, by), br - 2, 255, -1)

            # Count filled pixels within bubble
            total_px  = np.pi * (br - 2) ** 2
            filled_px = cv2.countNonZero(cv2.bitwise_and(thresh, thresh, mask=mask))
            fill_ratio = filled_px / max(total_px, 1)

            filled     = fill_ratio >= self.cfg.FILL_THRESHOLD
            ambiguous  = self.cfg.AMBIG_THRESHOLD <= fill_ratio < self.cfg.FILL_THRESHOLD
            confidence = self._bubble_confidence(fill_ratio, filled)

            b = BubbleResult(
                row=bubble_spec.get('row', 0),
                col=bubble_spec.get('col', 0),
                label=label,
                filled=filled,
                confidence=confidence,
                fill_ratio=round(fill_ratio, 3),
            )
            bubbles.append(b)

            if filled:
                filled_labels.append(label)
            elif ambiguous:
                b.confidence = 0.4  # flag for manual review

        # Determine answer
        has_multiple = len(filled_labels) > 1
        is_blank     = len(filled_labels) == 0

        if q_type == 'numeric':
            # Group by digit column (centena/dezena/unidade)
            digit_cols: dict[int, list[BubbleResult]] = {}
            for b in bubbles:
                col = b.col
                digit_cols.setdefault(col, [])
                if b.filled:
                    digit_cols[col].append(b)
            digits = ''
            for col_idx in sorted(digit_cols.keys()):
                filled_in_col = digit_cols[col_idx]
                digits += filled_in_col[0].label if len(filled_in_col) == 1 else '?'
            marked = digits if len(digits) == 3 and '?' not in digits else None
            has_multiple = any(len(v) > 1 for v in digit_cols.values())
        else:
            marked = filled_labels[0] if len(filled_labels) == 1 else None

        avg_conf = float(np.mean([b.confidence for b in bubbles])) if bubbles else 0.0

        return QuestionResult(
            number=q_num,
            q_type=q_type,
            marked_answer=marked,
            has_multiple=has_multiple,
            is_blank=is_blank,
            confidence=avg_conf,
            bubbles=bubbles,
        )

    def _bubble_confidence(self, ratio: float, filled: bool) -> float:
        """Confidence is highest when ratio is clearly above or below threshold."""
        if filled:
            # Max confidence at ratio = 0.70+
            return min(1.0, (ratio - self.cfg.FILL_THRESHOLD) / 0.30 + 0.7)
        else:
            # Max confidence at ratio = 0.05 or less
            return min(1.0, 1.0 - ratio / self.cfg.FILL_THRESHOLD)


# ──────────────────────────────────────────────────────────────
# Grader
# ──────────────────────────────────────────────────────────────

class OMRGrader:
    """Applies the answer key to an OMRResult and computes scores."""

    def grade(self, omr: OMRResult, answer_key: dict, total_score: float = 10.0) -> dict:
        """
        answer_key = {question_number: {'correct_answer': str, 'score': float, 'is_nullified': bool}}
        Returns: {scores per question, total, percentage, summary}
        """
        results = []
        earned = 0.0
        max_possible = 0.0

        q_map = {q.number: q for q in omr.questions}

        for q_num, spec in answer_key.items():
            q_result = q_map.get(q_num)
            correct   = spec['correct_answer']
            q_score   = float(spec.get('score', 1.0))
            nullified = spec.get('is_nullified', False)

            if nullified:
                # Nullified: everyone gets full score
                is_correct    = True
                score_earned  = q_score
            elif q_result is None or q_result.is_blank:
                is_correct    = False
                score_earned  = 0.0
            elif q_result.has_multiple:
                is_correct    = False
                score_earned  = 0.0
            else:
                is_correct   = (q_result.marked_answer == correct)
                score_earned = q_score if is_correct else 0.0

            earned        += score_earned
            max_possible  += q_score

            results.append({
                'question_number': q_num,
                'correct_answer':  correct,
                'marked_answer':   q_result.marked_answer if q_result else None,
                'is_correct':      is_correct,
                'score_earned':    round(score_earned, 2),
                'is_nullified':    nullified,
                'confidence':      q_result.confidence if q_result else 0.0,
            })

        percentage   = (earned / max_possible * 100) if max_possible > 0 else 0
        final_score  = (earned / max_possible * total_score) if max_possible > 0 else 0

        return {
            'question_results': results,
            'total_score':      round(final_score, 2),
            'percentage':       round(percentage, 2),
            'correct_count':    sum(1 for r in results if r['is_correct'] and not r['is_nullified']),
            'wrong_count':      sum(1 for r in results if not r['is_correct'] and not r['is_nullified']),
            'blank_count':      sum(1 for q in omr.questions if q.is_blank),
            'nullified_count':  sum(1 for r in results if r['is_nullified']),
            'omr_confidence':   round(omr.confidence, 3),
        }
