"""
layout_builder.py — Exam → OMR Bubble Layout
=============================================
Given a list of questions (number + type), computes the exact
pixel coordinates of every bubble on the printed A4 card.

The layout MUST match what pdfService.js renders, so both files
share the same geometry constants.

Card at 300 DPI → 2480 × 3508 px (A4 portrait)
Margins: left=24px, right=24px, top=24px, bottom=24px
"""

from dataclasses import dataclass, field, asdict
from typing import Literal
import math


# ── Constants (mirror pdfService.js geometry) ─────────────────
DPI            = 300
PT_TO_PX       = DPI / 72.0          # 1 point = 1/72 inch

# A4 in points (PDFKit units) → pixels
PAGE_W_PT = 595.28
PAGE_H_PT = 841.89
PAGE_W    = round(PAGE_W_PT * PT_TO_PX)  # ≈ 2480
PAGE_H    = round(PAGE_H_PT * PT_TO_PX)  # ≈ 3508

MARGIN_L  = round(20 * PT_TO_PX)   # 83 px
MARGIN_R  = PAGE_W - MARGIN_L
CONTENT_W = MARGIN_R - MARGIN_L

# Header block
HEADER_H  = round(52 * PT_TO_PX)
FIELD_H   = round(28 * PT_TO_PX)
SEP_H     = round(10 * PT_TO_PX)   # section separator

# Row heights (points → px)
MC_ROW_H  = round(14 * PT_TO_PX)
CE_ROW_H  = round(13 * PT_TO_PX)
NUM_ROW_H = round(12 * PT_TO_PX)   # per digit bubble

# Bubble geometry
MC_BUBBLE_R  = round(4.5 * PT_TO_PX)
CE_BUBBLE_R  = round(4.5 * PT_TO_PX)
NUM_BUBBLE_R = round(4.0 * PT_TO_PX)

MC_OPT_STEP  = round(16 * PT_TO_PX)   # horizontal spacing between A/B/C/D
CE_OPT_STEP  = round(14 * PT_TO_PX)
NUM_COL_STEP = round(13 * PT_TO_PX)   # centena/dezena/unidade column spacing
NUM_Q_STEP   = round(52 * PT_TO_PX)   # horizontal spacing between numeric questions

MC_NUM_W  = round(14 * PT_TO_PX)   # width of question number label
CE_NUM_W  = round(14 * PT_TO_PX)

# ── Data structures ───────────────────────────────────────────

@dataclass
class BubbleSpec:
    label: str          # 'A','B','C','D' / 'C','E' / '0'..'9'
    x: int              # center px
    y: int              # center px
    r: int              # radius px
    row: int = 0        # digit row (numeric only)
    col: int = 0        # digit column index (numeric only)

@dataclass
class QuestionRegion:
    number: int
    q_type: str
    x: int
    y: int
    w: int
    h: int
    bubbles: list[BubbleSpec] = field(default_factory=list)

@dataclass
class CardLayout:
    page_w: int
    page_h: int
    dpi: int
    sections: dict              # {'multiple_choice': [...], 'true_false': [...], 'numeric': [...]}
    questions: list[QuestionRegion]
    alignment_corners: list[dict]  # TL, TR, BL, BR corner squares


# ── Builder ───────────────────────────────────────────────────

class LayoutBuilder:
    """
    Builds pixel-precise bubble coordinates for every question.
    Call build(questions) where questions = [{'number': 1, 'type': 'multiple_choice'}, ...]
    Returns a dict suitable for JSON serialisation.
    """

    def build(self, questions: list[dict]) -> dict:
        mc_qs  = [q for q in questions if q['type'] == 'multiple_choice']
        ce_qs  = [q for q in questions if q['type'] == 'true_false']
        num_qs = [q for q in questions if q['type'] == 'numeric']

        # Starting Y after header + fields
        y = MARGIN_L + HEADER_H + FIELD_H + SEP_H

        regions: list[QuestionRegion] = []

        # ── Multiple choice ──────────────────────────────────
        if mc_qs:
            y += SEP_H  # section label height
            cols    = 3 if len(mc_qs) > 15 else (2 if len(mc_qs) > 8 else 1)
            per_col = math.ceil(len(mc_qs) / cols)
            col_w   = CONTENT_W // cols

            for i, q in enumerate(mc_qs):
                col_idx = i // per_col
                row_idx = i % per_col
                qx = MARGIN_L + col_idx * col_w
                qy = y + row_idx * MC_ROW_H

                bubbles = []
                for oi, opt in enumerate(['A', 'B', 'C', 'D']):
                    bx = qx + MC_NUM_W + oi * MC_OPT_STEP + MC_BUBBLE_R
                    by = qy + MC_ROW_H // 2
                    bubbles.append(BubbleSpec(label=opt, x=bx, y=by, r=MC_BUBBLE_R))

                regions.append(QuestionRegion(
                    number=q['number'], q_type='multiple_choice',
                    x=qx, y=qy, w=col_w, h=MC_ROW_H,
                    bubbles=bubbles,
                ))

            y += per_col * MC_ROW_H + SEP_H

        # ── True / False ─────────────────────────────────────
        if ce_qs:
            y += SEP_H
            cols    = 3 if len(ce_qs) > 12 else (2 if len(ce_qs) > 6 else 1)
            per_col = math.ceil(len(ce_qs) / cols)
            col_w   = CONTENT_W // cols

            for i, q in enumerate(ce_qs):
                col_idx = i // per_col
                row_idx = i % per_col
                qx = MARGIN_L + col_idx * col_w
                qy = y + row_idx * CE_ROW_H

                bubbles = []
                for oi, opt in enumerate(['C', 'E']):
                    bx = qx + CE_NUM_W + oi * CE_OPT_STEP + CE_BUBBLE_R
                    by = qy + CE_ROW_H // 2
                    bubbles.append(BubbleSpec(label=opt, x=bx, y=by, r=CE_BUBBLE_R))

                regions.append(QuestionRegion(
                    number=q['number'], q_type='true_false',
                    x=qx, y=qy, w=col_w, h=CE_ROW_H,
                    bubbles=bubbles,
                ))

            y += per_col * CE_ROW_H + SEP_H

        # ── Numeric ──────────────────────────────────────────
        if num_qs:
            y += SEP_H
            num_col_h = NUM_ROW_H * 10 + round(20 * PT_TO_PX)  # 10 digits + label

            for qi, q in enumerate(num_qs):
                qx = MARGIN_L + qi * NUM_Q_STEP

                bubbles = []
                for ci, col_lbl in enumerate(['C', 'D', 'U']):
                    dx = qx + round(14 * PT_TO_PX) + ci * NUM_COL_STEP

                    for digit in range(10):
                        by = y + round(18 * PT_TO_PX) + digit * NUM_ROW_H
                        bubbles.append(BubbleSpec(
                            label=str(digit), x=dx, y=by,
                            r=NUM_BUBBLE_R, row=digit, col=ci,
                        ))

                regions.append(QuestionRegion(
                    number=q['number'], q_type='numeric',
                    x=qx, y=y, w=NUM_Q_STEP, h=num_col_h,
                    bubbles=bubbles,
                ))

            y += num_col_h + SEP_H

        # ── Alignment corners (corner squares in PDF) ────────
        corner_sz = round(12 * PT_TO_PX)
        corners = [
            {'id': 'TL', 'x': MARGIN_L,             'y': round(20 * PT_TO_PX),  'w': corner_sz, 'h': corner_sz},
            {'id': 'TR', 'x': MARGIN_R - corner_sz,  'y': round(20 * PT_TO_PX),  'w': corner_sz, 'h': corner_sz},
            {'id': 'BL', 'x': MARGIN_L,              'y': PAGE_H - round(20 * PT_TO_PX) - corner_sz, 'w': corner_sz, 'h': corner_sz},
            {'id': 'BR', 'x': MARGIN_R - corner_sz,  'y': PAGE_H - round(20 * PT_TO_PX) - corner_sz, 'w': corner_sz, 'h': corner_sz},
        ]

        layout = CardLayout(
            page_w=PAGE_W, page_h=PAGE_H, dpi=DPI,
            sections={
                'multiple_choice': [q['number'] for q in mc_qs],
                'true_false':      [q['number'] for q in ce_qs],
                'numeric':         [q['number'] for q in num_qs],
            },
            questions=regions,
            alignment_corners=corners,
        )

        return self._to_dict(layout)

    def _to_dict(self, layout: CardLayout) -> dict:
        return {
            'page_w':             layout.page_w,
            'page_h':             layout.page_h,
            'dpi':                layout.dpi,
            'sections':           layout.sections,
            'alignment_corners':  layout.alignment_corners,
            'questions': [
                {
                    'number':  r.number,
                    'type':    r.q_type,
                    'region': {
                        'x': r.x, 'y': r.y, 'w': r.w, 'h': r.h,
                        'bubbles': [asdict(b) for b in r.bubbles],
                    },
                }
                for r in layout.questions
            ],
        }
