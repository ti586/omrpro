// src/services/pdfService.js
// Generates printable answer card PDFs using PDFKit
// Each card = 1 A4 page, auto-adapts to question count

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const PAGE_W = 595.28;  // A4 points
const PAGE_H = 841.89;

const COLORS = {
  headerBg:  '#1a1f35',
  headerText:'#ffffff',
  labelGray: '#6b7280',
  lineGray:  '#374151',
  bubbleFg:  '#374151',
  accent:    '#1a1f35',
  border:    '#d1d5db',
};

/**
 * generateCardPDF(exam, cards) → Buffer
 *
 * exam  = { title, total_score, questions: [...], card_config: {...} }
 * cards = [{ student: {...}, qrCode: Buffer }]
 */
export async function generateCardPDF(exam, cards) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 20, bottom: 20, left: 20, right: 20 },
      autoFirstPage: false,
      bufferPages: true,
    });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (const { student, qrCode } of cards) {
      doc.addPage();
      renderCard(doc, exam, student, qrCode);
    }

    doc.end();
  });
}

function renderCard(doc, exam, student, qrCodeBuffer) {
  const cfg     = exam.card_config ?? {};
  const questions = exam.questions ?? [];
  const mcQs   = questions.filter((q) => q.type === 'multiple_choice');
  const ceQs   = questions.filter((q) => q.type === 'true_false');
  const numQs  = questions.filter((q) => q.type === 'numeric');

  let y = 20;
  const L = 20;   // left margin
  const R = PAGE_W - 20; // right bound
  const W = R - L;

  // ── Alignment corners ──────────────────────────────────────
  const cornerSz = 12;
  [[L, y], [R - cornerSz, y], [L, PAGE_H - 20 - cornerSz], [R - cornerSz, PAGE_H - 20 - cornerSz]]
    .forEach(([cx, cy]) => {
      doc.rect(cx, cy, cornerSz, cornerSz).lineWidth(2).stroke('#000000');
    });

  // ── Header ────────────────────────────────────────────────
  const hH = 52;
  doc.rect(L, y, W, hH).fill(COLORS.headerBg);

  if (qrCodeBuffer) {
    try {
      doc.image(qrCodeBuffer, R - 52, y + 4, { width: 44, height: 44 });
    } catch (_) { /* QR draw failed gracefully */ }
  }

  doc.fillColor(COLORS.headerText)
    .font('Helvetica')
    .fontSize(7)
    .text('COLÉGIO MODELO — OMR·Pro', L + 8, y + 8, { width: W - 60 })
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(exam.title ?? 'Cartão-Resposta', L + 8, y + 19, { width: W - 60 });

  y += hH + 4;

  // ── Student fields ────────────────────────────────────────
  const fieldH = 28;
  const fieldDefs = [
    { label: 'NOME DO ALUNO', w: 0.5 },
    { label: 'MATRÍCULA',     w: 0.25 },
    { label: 'TURMA · DATA',  w: 0.25 },
  ];
  let fx = L;
  for (const fd of fieldDefs) {
    const fw = W * fd.w;
    doc.rect(fx, y, fw, fieldH).lineWidth(0.4).stroke(COLORS.border);
    doc.fillColor(COLORS.labelGray).font('Helvetica').fontSize(6)
      .text(fd.label, fx + 4, y + 4, { width: fw - 8 });
    if (fd.label === 'NOME DO ALUNO' && student?.name) {
      doc.fillColor(COLORS.lineGray).font('Helvetica-Bold').fontSize(9)
        .text(student.name, fx + 4, y + 14, { width: fw - 8 });
    }
    if (fd.label === 'MATRÍCULA' && student?.enrollment_code) {
      doc.fillColor(COLORS.lineGray).font('Helvetica').fontSize(9)
        .text(student.enrollment_code, fx + 4, y + 14, { width: fw - 8 });
    }
    fx += fw;
  }
  y += fieldH + 6;

  // ── Separator ─────────────────────────────────────────────
  doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).stroke(COLORS.border);
  y += 6;

  // ── Multiple choice section ───────────────────────────────
  if (mcQs.length > 0) {
    doc.fillColor(COLORS.labelGray).font('Helvetica').fontSize(6)
      .text('QUESTÕES DE MÚLTIPLA ESCOLHA — Marque apenas uma alternativa (A, B, C ou D)', L, y);
    y += 10;

    const cols      = mcQs.length > 15 ? 3 : mcQs.length > 8 ? 2 : 1;
    const colW      = W / cols;
    const rowH      = 14;
    const perCol    = Math.ceil(mcQs.length / cols);
    const opts      = ['A', 'B', 'C', 'D'];
    const bR        = 4.5;

    for (let i = 0; i < mcQs.length; i++) {
      const col   = Math.floor(i / perCol);
      const row   = i % perCol;
      const qx    = L + col * colW;
      const qy    = y + row * rowH;
      const q     = mcQs[i];

      doc.fillColor(COLORS.lineGray).font('Helvetica-Bold').fontSize(7)
        .text(String(q.number).padStart(2, ' '), qx + 2, qy + 3, { width: 14 });

      opts.forEach((opt, oi) => {
        const bx = qx + 20 + oi * 16;
        const by = qy + rowH / 2;
        doc.circle(bx, by, bR).lineWidth(0.8).stroke(COLORS.bubbleFg);
        doc.fillColor(COLORS.bubbleFg).font('Helvetica').fontSize(5.5)
          .text(opt, bx - 2.5, by - 3.5);
      });
    }

    y += perCol * rowH + 8;
  }

  // ── True/False section ────────────────────────────────────
  if (ceQs.length > 0) {
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.3).stroke(COLORS.border);
    y += 4;
    doc.fillColor(COLORS.labelGray).font('Helvetica').fontSize(6)
      .text('CERTO (C) / ERRADO (E)', L, y);
    y += 8;

    const cols   = ceQs.length > 12 ? 3 : ceQs.length > 6 ? 2 : 1;
    const colW   = W / cols;
    const rowH   = 13;
    const perCol = Math.ceil(ceQs.length / cols);

    ceQs.forEach((q, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const qx  = L + col * colW;
      const qy  = y + row * rowH;

      doc.fillColor(COLORS.lineGray).font('Helvetica-Bold').fontSize(7)
        .text(String(q.number).padStart(2, ' '), qx + 2, qy + 2, { width: 14 });

      ['C', 'E'].forEach((opt, oi) => {
        const bx = qx + 20 + oi * 14;
        const by = qy + rowH / 2;
        doc.circle(bx, by, 4.5).lineWidth(0.8).stroke(COLORS.bubbleFg);
        doc.fillColor(COLORS.bubbleFg).font('Helvetica').fontSize(5.5)
          .text(opt, bx - 2.5, by - 3.5);
      });
    });

    y += perCol * rowH + 8;
  }

  // ── Numeric section ───────────────────────────────────────
  if (numQs.length > 0) {
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.3).stroke(COLORS.border);
    y += 4;
    doc.fillColor(COLORS.labelGray).font('Helvetica').fontSize(6)
      .text('QUESTÕES NUMÉRICAS — Preencha os dígitos de 0 a 9 (Centena · Dezena · Unidade)', L, y);
    y += 8;

    const bR  = 4;
    const colH = 12 * 11 + 20;   // 10 digits + label
    let nx = L;

    numQs.forEach((q, qi) => {
      const qx = nx + qi * (colH + 8 > W ? 0 : 52);
      // Question number label
      doc.fillColor(COLORS.lineGray).font('Helvetica-Bold').fontSize(7)
        .text(`Q.${q.number}`, qx, y);

      ['C', 'D', 'U'].forEach((colLbl, ci) => {
        const dx = qx + 14 + ci * 13;
        doc.fillColor(COLORS.labelGray).font('Helvetica').fontSize(5.5)
          .text(colLbl, dx - 2, y + 9);

        for (let d = 0; d <= 9; d++) {
          const by = y + 18 + d * 11;
          doc.circle(dx, by, bR).lineWidth(0.6).stroke(COLORS.bubbleFg);
          doc.fillColor(COLORS.bubbleFg).font('Helvetica').fontSize(5)
            .text(String(d), dx - 2.5, by - 3.5);
        }
      });
    });

    y += colH + 4;
  }

  // ── Footer ────────────────────────────────────────────────
  const footerY = PAGE_H - 22;
  doc.moveTo(L, footerY - 4).lineTo(R, footerY - 4).lineWidth(0.3).stroke(COLORS.border);
  doc.fillColor(COLORS.labelGray).font('Helvetica').fontSize(6)
    .text(
      `OMR·Pro · Prova: ${exam.title} · Aluno: ${student?.enrollment_code ?? '—'} · gerado automaticamente`,
      L, footerY, { width: W, align: 'center' },
    );
}
