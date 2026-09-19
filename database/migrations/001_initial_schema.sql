CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TYPE user_role AS ENUM ('superadmin','admin','coordinator','teacher','student');
CREATE TYPE question_type AS ENUM ('multiple_choice','true_false','numeric');
CREATE TYPE exam_status AS ENUM ('draft','published','reading','graded','archived');
CREATE TYPE card_status AS ENUM ('pending','processing','graded','error','manual_review','duplicate');
CREATE TYPE omr_error_type AS ENUM ('multiple_marks','no_mark','ambiguous','damaged','invalid_qr');

CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  city VARCHAR(100), state CHAR(2), logo_url TEXT,
  plan VARCHAR(20) DEFAULT 'free', is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL, email VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role user_role NOT NULL DEFAULT 'teacher',
  is_active BOOLEAN DEFAULT true, last_login_at TIMESTAMPTZ, refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_school ON users(school_id);
CREATE INDEX idx_users_email ON users(email);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL, entity VARCHAR(50), entity_id UUID,
  ip_address INET, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL, code VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL, grade VARCHAR(50),
  year SMALLINT DEFAULT EXTRACT(YEAR FROM NOW())::SMALLINT,
  is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_classes_school ON classes(school_id);

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL, enrollment_code VARCHAR(30) UNIQUE NOT NULL,
  birth_date DATE, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_students_school ON students(school_id);
CREATE INDEX idx_students_name ON students USING gin(name gin_trgm_ops);

CREATE TABLE student_classes (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, class_id)
);

CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(300) NOT NULL, description TEXT,
  status exam_status DEFAULT 'draft',
  exam_date DATE, duration_minutes SMALLINT,
  total_score DECIMAL(6,2) DEFAULT 10.0, passing_score DECIMAL(6,2) DEFAULT 5.0,
  card_config JSONB DEFAULT '{"show_name":true,"show_enrollment":true,"show_class":true,"show_date":true,"show_qr":true,"show_signature":false,"orientation":"portrait","alignment_marks":"4_corners"}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_exams_school ON exams(school_id);
CREATE INDEX idx_exams_status ON exams(status);

CREATE TABLE exam_classes (
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, class_id)
);

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  number SMALLINT NOT NULL, type question_type NOT NULL,
  score DECIMAL(5,2) DEFAULT 1.0, is_nullified BOOLEAN DEFAULT false,
  correct_answer VARCHAR(20) NOT NULL, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (exam_id, number)
);
CREATE INDEX idx_questions_exam ON questions(exam_id, number);

CREATE TABLE answer_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  qr_code VARCHAR(200) UNIQUE, card_key VARCHAR(5) DEFAULT 'A',
  status card_status DEFAULT 'pending',
  image_path TEXT, image_original TEXT, uploaded_at TIMESTAMPTZ, processed_at TIMESTAMPTZ,
  omr_confidence DECIMAL(4,3), rotation_angle DECIMAL(5,2), perspective_pts JSONB,
  total_score DECIMAL(6,2), percentage DECIMAL(5,2),
  correct_count SMALLINT, wrong_count SMALLINT, blank_count SMALLINT,
  error_type omr_error_type, error_details JSONB,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cards_exam ON answer_cards(exam_id);
CREATE INDEX idx_cards_student ON answer_cards(student_id);
CREATE INDEX idx_cards_status ON answer_cards(status);

CREATE TABLE student_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES answer_cards(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  marked_answer VARCHAR(20), is_correct BOOLEAN, score_earned DECIMAL(5,2) DEFAULT 0,
  omr_confidence DECIMAL(4,3), has_multiple BOOLEAN DEFAULT false, is_blank BOOLEAN DEFAULT false,
  UNIQUE (card_id, question_id)
);
CREATE INDEX idx_answers_card ON student_answers(card_id);
CREATE INDEX idx_answers_question ON student_answers(question_id);

CREATE TABLE exam_statistics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  total_students INTEGER DEFAULT 0, graded_count INTEGER DEFAULT 0,
  avg_score DECIMAL(6,2), min_score DECIMAL(6,2), max_score DECIMAL(6,2),
  std_deviation DECIMAL(6,3), pass_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0,
  score_dist JSONB DEFAULT '{}', question_stats JSONB DEFAULT '{}',
  computed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_exam_stats_no_class ON exam_statistics(exam_id) WHERE class_id IS NULL;
CREATE UNIQUE INDEX uq_exam_stats_with_class ON exam_statistics(exam_id, class_id) WHERE class_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schools_upd BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_upd   BEFORE UPDATE ON users   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_exams_upd   BEFORE UPDATE ON exams   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cards_upd   BEFORE UPDATE ON answer_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
