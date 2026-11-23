CREATE DATABASE IF NOT EXISTS evaluation_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE evaluation_system;

CREATE TABLE campuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  location_code VARCHAR(50) NOT NULL UNIQUE,
  is_central TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vice_presidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE campus_administrators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  campus_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_campus_administrators_campus
    FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE RESTRICT
);

CREATE TABLE satellite_college_directors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  campus_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_satellite_directors_campus
    FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE RESTRICT
);

CREATE TABLE directors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rde_directors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rde_center_directors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE targets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  target_type ENUM(
    'vice_president',
    'campus_administrator',
    'satellite_college_director',
    'director',
    'rde_director',
    'rde_center_director'
  ) NOT NULL,
  vice_president_id INT NULL,
  campus_administrator_id INT NULL,
  satellite_college_director_id INT NULL,
  director_id INT NULL,
  rde_director_id INT NULL,
  rde_center_director_id INT NULL,
  target_ref_id INT GENERATED ALWAYS AS (
    COALESCE(
      vice_president_id,
      campus_administrator_id,
      satellite_college_director_id,
      director_id,
      rde_director_id,
      rde_center_director_id
    )
  ) STORED,
  campus_id INT NULL,
  office_head_name VARCHAR(255) NULL,
  is_central TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_target_type_ref (target_type, target_ref_id),
  CONSTRAINT fk_targets_vp
    FOREIGN KEY (vice_president_id) REFERENCES vice_presidents(id) ON DELETE CASCADE,
  CONSTRAINT fk_targets_campus_administrator
    FOREIGN KEY (campus_administrator_id) REFERENCES campus_administrators(id) ON DELETE CASCADE,
  CONSTRAINT fk_targets_satellite_director
    FOREIGN KEY (satellite_college_director_id) REFERENCES satellite_college_directors(id) ON DELETE CASCADE,
  CONSTRAINT fk_targets_director
    FOREIGN KEY (director_id) REFERENCES directors(id) ON DELETE CASCADE,
  CONSTRAINT fk_targets_rde_director
    FOREIGN KEY (rde_director_id) REFERENCES rde_directors(id) ON DELETE CASCADE,
  CONSTRAINT fk_targets_rde_center_director
    FOREIGN KEY (rde_center_director_id) REFERENCES rde_center_directors(id) ON DELETE CASCADE,
  CONSTRAINT fk_targets_campus
    FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE SET NULL,
  CONSTRAINT ck_targets_exactly_one_reference CHECK (
    (vice_president_id IS NOT NULL) +
    (campus_administrator_id IS NOT NULL) +
    (satellite_college_director_id IS NOT NULL) +
    (director_id IS NOT NULL) +
    (rde_director_id IS NOT NULL) +
    (rde_center_director_id IS NOT NULL) = 1
  ),
  CONSTRAINT ck_targets_type_reference CHECK (
    (target_type = 'vice_president' AND vice_president_id IS NOT NULL) OR
    (target_type = 'campus_administrator' AND campus_administrator_id IS NOT NULL) OR
    (target_type = 'satellite_college_director' AND satellite_college_director_id IS NOT NULL) OR
    (target_type = 'director' AND director_id IS NOT NULL) OR
    (target_type = 'rde_director' AND rde_director_id IS NOT NULL) OR
    (target_type = 'rde_center_director' AND rde_center_director_id IS NOT NULL)
  )
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  role ENUM('super_admin', 'evaluator', 'admin') NOT NULL DEFAULT 'evaluator',
  campus_id INT NULL,
  position_role ENUM(
    'teaching_faculty',
    'non_teaching_staff',
    'student_leader',
    'campus_administrator_satellite_director',
    'director',
    'vice_president'
  ) NULL,
  years_of_service ENUM('lt_1', '1_5', '6_10', '11_plus') NULL,
  is_central_staff TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_campus
    FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE SET NULL
);

CREATE TABLE user_office_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  target_id INT NOT NULL,
  assignment_role ENUM('head', 'member') NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_target (user_id, target_id),
  KEY idx_assignments_target_role (target_id, assignment_role),
  CONSTRAINT fk_assignments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_assignments_target
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
);

CREATE TABLE surveys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_sections_survey
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

CREATE TABLE questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  section_id INT NOT NULL,
  prompt TEXT NOT NULL,
  question_type ENUM('scale', 'rating', 'single_choice', 'multi_choice', 'yes_no', 'text') NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  scale_min TINYINT NULL,
  scale_max TINYINT NULL,
  weight DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  min_label VARCHAR(60) NULL,
  max_label VARCHAR(60) NULL,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_questions_survey
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  CONSTRAINT fk_questions_section
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

CREATE TABLE question_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  option_key VARCHAR(50) NOT NULL,
  option_text VARCHAR(255) NOT NULL,
  points DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_question_option_key (question_id, option_key),
  CONSTRAINT fk_question_options_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE eval_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  opens_at DATETIME NOT NULL,
  closes_at DATETIME NOT NULL,
  status ENUM('draft', 'open', 'closed') NOT NULL DEFAULT 'draft',
  min_responses INT NOT NULL DEFAULT 1,
  allow_same_campus TINYINT(1) NOT NULL DEFAULT 1,
  target_type ENUM(
    'all',
    'vice_president',
    'campus_administrator',
    'satellite_college_director',
    'director',
    'rde_director',
    'rde_center_director'
  ) NOT NULL DEFAULT 'all',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eval_cycles_survey
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE RESTRICT
);

CREATE TABLE cycle_targets (
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  PRIMARY KEY (cycle_id, target_id),
  CONSTRAINT fk_cycle_targets_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_cycle_targets_target
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
);

CREATE TABLE eligibility_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  evaluator_is_central TINYINT(1) NULL,
  require_target_central TINYINT(1) NULL,
  require_same_campus TINYINT(1) NULL,
  action ENUM('allow', 'deny') NOT NULL DEFAULT 'allow',
  CONSTRAINT fk_eligibility_rules_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE
);

CREATE TABLE participation (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  submission_token CHAR(36) NOT NULL UNIQUE,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_participation_user_cycle_target (user_id, cycle_id, target_id),
  CONSTRAINT fk_participation_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_participation_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_participation_target
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
);

CREATE TABLE evaluator_answers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_token CHAR(36) NOT NULL,
  response_id CHAR(36) NOT NULL,
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  question_id INT NOT NULL,
  selected_option_id INT NULL,
  answer_value JSON NOT NULL,
  score DECIMAL(12,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_answers_response (response_id),
  KEY idx_answers_result (cycle_id, target_id, question_id),
  KEY idx_answers_submission (submission_token),
  CONSTRAINT fk_answers_participation
    FOREIGN KEY (submission_token) REFERENCES participation(submission_token) ON DELETE CASCADE,
  CONSTRAINT fk_answers_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_target
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_option
    FOREIGN KEY (selected_option_id) REFERENCES question_options(id) ON DELETE SET NULL
);

CREATE TABLE comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_token CHAR(36) NOT NULL,
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  question_id INT NOT NULL,
  comment_text TEXT NOT NULL,
  status ENUM('pending', 'approved', 'hidden') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_comments_target_status (cycle_id, target_id, status),
  KEY idx_comments_submission (submission_token),
  CONSTRAINT fk_comments_participation
    FOREIGN KEY (submission_token) REFERENCES participation(submission_token) ON DELETE CASCADE,
  CONSTRAINT fk_comments_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_target
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE answer_tallies (
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  question_id INT NOT NULL,
  option_key VARCHAR(50) NOT NULL,
  cnt INT NOT NULL DEFAULT 0,
  PRIMARY KEY (cycle_id, target_id, question_id, option_key),
  CONSTRAINT fk_answer_tallies_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_answer_tallies_target
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
  CONSTRAINT fk_answer_tallies_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE response_counts (
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  total_submissions INT NOT NULL DEFAULT 0,
  PRIMARY KEY (cycle_id, target_id),
  CONSTRAINT fk_response_counts_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_response_counts_target
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
);

CREATE TABLE evaluator_response_scores (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  response_id CHAR(36) NOT NULL UNIQUE,
  score_link_token CHAR(36) NOT NULL UNIQUE,
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  total_score DECIMAL(12,2) NOT NULL,
  mean_score DECIMAL(12,2) NOT NULL,
  section_count INT NOT NULL,
  section_scores JSON NOT NULL,
  KEY idx_scores_target (cycle_id, target_id),
  CONSTRAINT fk_scores_participation
    FOREIGN KEY (score_link_token) REFERENCES participation(submission_token) ON DELETE CASCADE,
  CONSTRAINT fk_scores_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_scores_target
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
);

CREATE TABLE admin_audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  entity_id VARCHAR(60) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_audit_created (created_at, id),
  CONSTRAINT fk_audit_user
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE OR REPLACE
  SQL SECURITY DEFINER VIEW participation_counts AS
SELECT cycle_id, target_id, COUNT(*) AS submitted
FROM participation
GROUP BY cycle_id, target_id;

CREATE OR REPLACE VIEW target_catalog AS
SELECT
  t.id,
  t.target_type,
  t.target_ref_id,
  t.campus_id,
  t.is_central,
  t.active,
  vp.code,
  vp.title AS name
FROM targets t
JOIN vice_presidents vp
  ON t.target_type = 'vice_president' AND t.vice_president_id = vp.id
UNION ALL
SELECT t.id, t.target_type, t.target_ref_id, t.campus_id, t.is_central, t.active, ca.code, ca.title
FROM targets t
JOIN campus_administrators ca
  ON t.target_type = 'campus_administrator' AND t.campus_administrator_id = ca.id
UNION ALL
SELECT t.id, t.target_type, t.target_ref_id, t.campus_id, t.is_central, t.active, scd.code, scd.title
FROM targets t
JOIN satellite_college_directors scd
  ON t.target_type = 'satellite_college_director' AND t.satellite_college_director_id = scd.id
UNION ALL
SELECT t.id, t.target_type, t.target_ref_id, t.campus_id, t.is_central, t.active, d.code, d.title
FROM targets t
JOIN directors d
  ON t.target_type = 'director' AND t.director_id = d.id
UNION ALL
SELECT t.id, t.target_type, t.target_ref_id, t.campus_id, t.is_central, t.active, rd.code, rd.title
FROM targets t
JOIN rde_directors rd
  ON t.target_type = 'rde_director' AND t.rde_director_id = rd.id
UNION ALL
SELECT t.id, t.target_type, t.target_ref_id, t.campus_id, t.is_central, t.active, rcd.code, rcd.title
FROM targets t
JOIN rde_center_directors rcd
  ON t.target_type = 'rde_center_director' AND t.rde_center_director_id = rcd.id;
