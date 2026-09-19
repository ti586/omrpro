// src/db/seed.js
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function seed() {
  await client.connect();
  console.log('Inserindo dados de demonstracao...');

  const { rows: [school] } = await client.query(`
    INSERT INTO schools (name, code, city, state, plan)
    VALUES ('Colegio Modelo', 'DEMO001', 'Brasilia', 'DF', 'pro')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id
  `);
  const sid = school.id;
  console.log('Escola criada:', sid);

  const adminHash = await bcrypt.hash('Admin@2025', 12);
  await client.query(`
    INSERT INTO users (school_id, name, email, password_hash, role)
    VALUES ($1, 'Administrador', 'admin@escola.com', $2, 'admin')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `, [sid, adminHash]);

  const teacherHash = await bcrypt.hash('Prof@2025', 12);
  const { rows: [teacher] } = await client.query(`
    INSERT INTO users (school_id, name, email, password_hash, role)
    VALUES ($1, 'Prof. Carlos Santos', 'prof@escola.com', $2, 'teacher')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id
  `, [sid, teacherHash]);

  const coordHash = await bcrypt.hash('Coord@2025', 12);
  await client.query(`
    INSERT INTO users (school_id, name, email, password_hash, role)
    VALUES ($1, 'Maria Coordenadora', 'coord@escola.com', $2, 'coordinator')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `, [sid, coordHash]);

  console.log('Usuarios criados: admin, professor, coordenador');

  const subjects = [['Matematica','MAT'],['Fisica','FIS'],['Quimica','QUI'],
                    ['Biologia','BIO'],['Historia','HIS'],['Portugues','POR']];
  const subjectIds = {};
  for (const [name, code] of subjects) {
    try {
      const { rows: [s] } = await client.query(
        `INSERT INTO subjects (school_id, name, code) VALUES ($1, $2, $3) RETURNING id, code`,
        [sid, name, code]
      );
      if (s) subjectIds[s.code] = s.id;
    } catch (_) {}
  }
  const { rows: existSubs } = await client.query(
    `SELECT id, code FROM subjects WHERE school_id = $1`, [sid]
  );
  existSubs.forEach(s => { subjectIds[s.code] = s.id; });
  console.log('Disciplinas criadas');

  const classData = [['3EM A','3 Ensino Medio'],['3EM B','3 Ensino Medio'],
                     ['2EM A','2 Ensino Medio'],['9A','9 Ano']];
  const classIds = [];
  for (const [name, grade] of classData) {
    const { rows: [cls] } = await client.query(
      `INSERT INTO classes (school_id, teacher_id, name, grade) VALUES ($1, $2, $3, $4) RETURNING id, name`,
      [sid, teacher?.id, name, grade]
    );
    if (cls) classIds.push(cls);
  }
  console.log('Turmas criadas: 3EM A, 3EM B, 2EM A, 9A');

  const studentNames = [
    'Ana Silva','Bruno Oliveira','Carla Souza','Diego Lima','Elena Costa',
    'Felipe Martins','Gabriela Santos','Henrique Rocha','Isabela Fernandes',
    'Joao Pereira','Karen Alves','Lucas Nunes','Marina Castro','Nicolas Gomes','Olivia Ramos',
  ];
  const turma3EMA = classIds.find(c => c.name === '3EM A');
  if (turma3EMA) {
    for (let i = 0; i < studentNames.length; i++) {
      const enrollment = `2025${String(i+1).padStart(3,'0')}`;
      const { rows: [student] } = await client.query(
        `INSERT INTO students (school_id, name, enrollment_code)
         VALUES ($1, $2, $3) ON CONFLICT (enrollment_code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [sid, studentNames[i], enrollment]
      );
      if (student) {
        await client.query(
          `INSERT INTO student_classes (student_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [student.id, turma3EMA.id]
        );
      }
    }
    console.log('15 alunos criados na turma 3EM A');
  }

  const matId = subjectIds['MAT'];
  if (matId && turma3EMA) {
    const { rows: [exam] } = await client.query(
      `INSERT INTO exams (school_id, subject_id, created_by, title, status, exam_date, total_score, passing_score)
       VALUES ($1, $2, $3, 'Matematica - Bimestral Demo', 'published', CURRENT_DATE, 10.0, 5.0) RETURNING id`,
      [sid, matId, teacher?.id]
    );
    if (exam) {
      await client.query(
        `INSERT INTO exam_classes (exam_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [exam.id, turma3EMA.id]
      );
      const mcAnswers = ['A','C','B','D','A','B','C','A','D','B'];
      for (let n = 1; n <= 10; n++) {
        await client.query(
          `INSERT INTO questions (exam_id, number, type, correct_answer, score) VALUES ($1,$2,'multiple_choice',$3,0.5)`,
          [exam.id, n, mcAnswers[n-1]]
        );
      }
      const ceAnswers = ['C','E','C','E'];
      for (let n = 11; n <= 14; n++) {
        await client.query(
          `INSERT INTO questions (exam_id, number, type, correct_answer, score) VALUES ($1,$2,'true_false',$3,0.5)`,
          [exam.id, n, ceAnswers[n-11]]
        );
      }
      await client.query(
        `INSERT INTO questions (exam_id, number, type, correct_answer, score) VALUES ($1,15,'numeric','158',3.0)`,
        [exam.id]
      );
      console.log('Prova demo criada com 15 questoes (ID: ' + exam.id + ')');
    }
  }

  await client.end();
  console.log('\n=== SEED CONCLUIDO ===');
  console.log('  admin@escola.com  / Admin@2025');
  console.log('  prof@escola.com   / Prof@2025');
  console.log('  coord@escola.com  / Coord@2025');
}

seed().catch(err => {
  console.error('Seed falhou:', err.message);
  client.end().catch(() => {});
  process.exit(1);
});
