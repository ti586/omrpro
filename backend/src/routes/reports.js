// src/routes/reports.js
import { Router } from 'express';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { db } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ── GET /api/v1/reports/dashboard ────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const sid = req.user.schoolId;

    const [examStats, cardStats, activity] = await Promise.all([
      db.query(`SELECT status, COUNT(*)::int FROM exams WHERE school_id=$1 GROUP BY status`, [sid]),
      db.query(
        `SELECT ac.status, COUNT(*)::int,
                AVG(ac.total_score) FILTER (WHERE ac.status='graded') AS avg_score,
                AVG(ac.omr_confidence) FILTER (WHERE ac.status='graded') AS avg_confidence
         FROM answer_cards ac JOIN exams e ON e.id=ac.exam_id
         WHERE e.school_id=$1 GROUP BY ac.status`, [sid]
      ),
      db.query(
        `SELECT al.action, al.created_at, al.metadata, u.name AS user_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.user_id IN (SELECT id FROM users WHERE school_id=$1)
            OR al.user_id IS NULL
         ORDER BY al.created_at DESC LIMIT 20`, [sid]
      ),
    ]);

    res.json({
      examsByStatus:  Object.fromEntries(examStats.rows.map(r => [r.status, r.count])),
      cardsByStatus:  Object.fromEntries(cardStats.rows.map(r => [r.status, r.count])),
      avgScore:       cardStats.rows.find(r => r.status==='graded')?.avg_score ?? null,
      avgConfidence:  cardStats.rows.find(r => r.status==='graded')?.avg_confidence ?? null,
      recentActivity: activity.rows,
    });
  } catch (err) { next(err); }
});

// ── GET /api/v1/reports/exam/:id ─────────────────────────────
router.get('/exam/:id', async (req, res, next) => {
  try {
    const { classId } = req.query;
    let cardFilter = 'ac.exam_id = $1';
    const params = [req.params.id];
    if (classId) { cardFilter += ` AND ac.class_id = $2`; params.push(classId); }

    const [cardRows, questionRows, statsRows] = await Promise.all([
      db.query(
        `SELECT ac.id AS card_id, ac.total_score, ac.percentage,
                ac.correct_count, ac.wrong_count, ac.blank_count,
                ac.omr_confidence, ac.status,
                s.name AS student_name, s.enrollment_code,
                c.name AS class_name
         FROM answer_cards ac
         LEFT JOIN students s ON s.id=ac.student_id
         LEFT JOIN classes c ON c.id=ac.class_id
         WHERE ${cardFilter} AND ac.status='graded'
         ORDER BY c.name, ac.total_score DESC`, params
      ),
      db.query(
        `SELECT q.number, q.type, q.correct_answer, q.score, q.is_nullified,
                COUNT(sa.id)::int AS total_answers,
                COUNT(sa.id) FILTER (WHERE sa.is_correct)::int AS correct_count,
                COUNT(sa.id) FILTER (WHERE sa.is_blank)::int AS blank_count,
                ROUND(COUNT(sa.id) FILTER (WHERE NOT sa.is_correct AND NOT sa.is_blank)
                  * 100.0 / NULLIF(COUNT(sa.id),0), 1) AS error_rate
         FROM questions q
         LEFT JOIN student_answers sa ON sa.question_id=q.id
         WHERE q.exam_id=$1 GROUP BY q.id ORDER BY q.number`, [req.params.id]
      ),
      db.query(
        `SELECT avg_score, min_score, max_score, std_deviation,
                total_students, graded_count, pass_count, fail_count
         FROM exam_statistics WHERE exam_id=$1 AND class_id IS NULL LIMIT 1`,
        [req.params.id]
      ),
    ]);

    res.json({
      students:  cardRows.rows,
      questions: questionRows.rows,
      summary:   statsRows.rows[0] ?? null,
    });
  } catch (err) { next(err); }
});

// ── GET /api/v1/reports/exam/:id/export-excel ───────────────
router.get('/exam/:id/export-excel', async (req, res, next) => {
  try {
    const { rows: cards } = await db.query(
      `SELECT s.name AS "Aluno", s.enrollment_code AS "Matricula",
              c.name AS "Turma", ac.total_score AS "Nota",
              ac.percentage AS "Acerto %",
              ac.correct_count AS "Acertos", ac.wrong_count AS "Erros",
              ac.blank_count AS "Brancos"
       FROM answer_cards ac
       LEFT JOIN students s ON s.id=ac.student_id
       LEFT JOIN classes c ON c.id=ac.class_id
       WHERE ac.exam_id=$1 ORDER BY c.name, ac.total_score DESC`, [req.params.id]
    );
    const { rows: questions } = await db.query(
      `SELECT q.number AS "Questao", q.type AS "Tipo",
              q.correct_answer AS "Gabarito", q.score AS "Peso",
              COUNT(sa.id)::int AS "Respostas",
              COUNT(sa.id) FILTER (WHERE sa.is_correct)::int AS "Acertos",
              ROUND(COUNT(sa.id) FILTER (WHERE NOT sa.is_correct AND NOT sa.is_blank)
                *100.0/NULLIF(COUNT(sa.id),0),1) AS "Erro %"
       FROM questions q LEFT JOIN student_answers sa ON sa.question_id=q.id
       WHERE q.exam_id=$1 GROUP BY q.id ORDER BY q.number`, [req.params.id]
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cards), 'Alunos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(questions), 'Questoes');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="relatorio-${req.params.id.slice(0,8)}.xlsx"`,
    });
    res.send(buf);
  } catch (err) { next(err); }
});

// ── GET /api/v1/reports/exam/:id/export-pdf ─────────────────
router.get('/exam/:id/export-pdf', async (req, res, next) => {
  try {
    const { rows: [exam] } = await db.query(
      `SELECT title, exam_date, total_score FROM exams WHERE id=$1`, [req.params.id]
    );
    const { rows: cards } = await db.query(
      `SELECT s.name, s.enrollment_code, c.name AS class_name,
              ac.total_score, ac.percentage, ac.correct_count
       FROM answer_cards ac
       LEFT JOIN students s ON s.id=ac.student_id
       LEFT JOIN classes c ON c.id=ac.class_id
       WHERE ac.exam_id=$1 AND ac.status='graded' ORDER BY c.name, ac.total_score DESC`,
      [req.params.id]
    );
    const chunks = [];
    const doc = new PDFDocument({ size:'A4', margins:{top:40,bottom:40,left:40,right:40} });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio-${req.params.id.slice(0,8)}.pdf"`,
      });
      res.send(Buffer.concat(chunks));
    });
    doc.font('Helvetica-Bold').fontSize(18).text(exam?.title ?? 'Relatório', { align:'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#666')
       .text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, { align:'center' });
    doc.moveDown();
    let y = doc.y;
    doc.rect(40, y, 515, 18).fill('#1a1f35');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
    ['Aluno','Matrícula','Turma','Nota','% Acerto'].forEach((h, i) => {
      doc.text(h, 44 + i*100, y+4, { width:96 });
    });
    y += 20;
    cards.forEach((c, i) => {
      if (i%2===0) doc.rect(40, y, 515, 16).fill('#f9f9f9');
      doc.fillColor(c.total_score>=5?'#166534':'#dc2626').font('Helvetica-Bold').fontSize(8);
      doc.text(c.total_score?.toFixed(1)??'—', 44+300, y+3, {width:96});
      doc.fillColor('#111').font('Helvetica').fontSize(8);
      doc.text(c.name??'—', 44, y+3, {width:96});
      doc.text(c.enrollment_code??'—', 44+100, y+3, {width:96});
      doc.text(c.class_name??'—', 44+200, y+3, {width:96});
      doc.text(`${c.percentage?.toFixed(0)??0}%`, 44+400, y+3, {width:96});
      y += 16;
      if (y > 760) { doc.addPage(); y = 40; }
    });
    doc.end();
  } catch (err) { next(err); }
});

export default router;
