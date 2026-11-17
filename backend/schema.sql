CREATE DATABASE IF NOT EXISTS evaluation_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE evaluation_system;

CREATE TABLE IF NOT EXISTS campuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  location_code VARCHAR(20) NULL UNIQUE,
  is_central TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS registration_roles (
  code VARCHAR(40) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS registration_service_years (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS registration_units (
  code VARCHAR(40) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category ENUM('vp', 'campus_head', 'director') NOT NULL,
  location_code VARCHAR(20) NOT NULL,
  office_type ENUM('central_admin', 'campus_office') NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_registration_units_location FOREIGN KEY (location_code) REFERENCES campuses(location_code)
);

CREATE TABLE IF NOT EXISTS offices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campus_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  office_type ENUM('central_admin', 'campus_office') NOT NULL,
  unit_code VARCHAR(40) NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_offices_campus FOREIGN KEY (campus_id) REFERENCES campuses(id),
  CONSTRAINT fk_offices_unit FOREIGN KEY (unit_code) REFERENCES registration_units(code)
);

CREATE TABLE IF NOT EXISTS administrators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  office_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  position VARCHAR(150) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT uq_administrators_office UNIQUE (office_id),
  CONSTRAINT fk_administrators_office FOREIGN KEY (office_id) REFERENCES offices(id)
);

CREATE TABLE IF NOT EXISTS targets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  target_type ENUM('office', 'administrator') NOT NULL,
  office_id INT NULL,
  administrator_id INT NULL,
  campus_id INT NOT NULL,
  is_central TINYINT(1) NOT NULL,
  CONSTRAINT fk_targets_office FOREIGN KEY (office_id) REFERENCES offices(id),
  CONSTRAINT fk_targets_administrator FOREIGN KEY (administrator_id) REFERENCES administrators(id),
  CONSTRAINT fk_targets_campus FOREIGN KEY (campus_id) REFERENCES campuses(id),
  CONSTRAINT uq_targets_office UNIQUE (office_id),
  CONSTRAINT uq_targets_administrator UNIQUE (administrator_id)
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  role ENUM('super_admin', 'evaluator') NOT NULL,
  campus_id INT NULL,
  evaluator_group ENUM('faculty', 'student_leader', 'campus_staff', 'office_staff') NULL,
  position_role ENUM('teaching_faculty', 'non_teaching_staff', 'student_leader') NULL,
  office_unit_code VARCHAR(40) NULL,
  years_of_service ENUM('lt_1', '1_5', '6_10', '11_plus') NULL,
  is_central_staff TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_users_campus FOREIGN KEY (campus_id) REFERENCES campuses(id)
);

CREATE TABLE IF NOT EXISTS surveys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_sections_survey FOREIGN KEY (survey_id) REFERENCES surveys(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  section_id INT NOT NULL,
  type ENUM('scale', 'rating', 'single_choice', 'multi_choice', 'yes_no', 'text') NOT NULL,
  question_text VARCHAR(500) NOT NULL,
  required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  scale_min TINYINT NULL,
  scale_max TINYINT NULL,
  min_label VARCHAR(60) NULL,
  max_label VARCHAR(60) NULL,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_questions_survey FOREIGN KEY (survey_id) REFERENCES surveys(id),
  CONSTRAINT fk_questions_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  label VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_question_options_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS eval_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  target_type ENUM('office', 'administrator', 'all') NOT NULL,
  name VARCHAR(150) NOT NULL,
  opens_at DATETIME NOT NULL,
  closes_at DATETIME NOT NULL,
  status ENUM('draft', 'open', 'closed') NOT NULL DEFAULT 'draft',
  min_responses INT NOT NULL DEFAULT 5,
  allow_same_campus TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_eval_cycles_survey FOREIGN KEY (survey_id) REFERENCES surveys(id)
);

CREATE TABLE IF NOT EXISTS cycle_targets (
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  PRIMARY KEY (cycle_id, target_id),
  CONSTRAINT fk_cycle_targets_cycle FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id),
  CONSTRAINT fk_cycle_targets_target FOREIGN KEY (target_id) REFERENCES targets(id)
);

CREATE TABLE IF NOT EXISTS eligibility_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  evaluator_is_central TINYINT(1) NULL,
  evaluator_group ENUM('faculty', 'student_leader', 'campus_staff', 'office_staff') NULL,
  target_is_central TINYINT(1) NULL,
  same_campus TINYINT(1) NULL,
  effect ENUM('allow', 'deny') NOT NULL,
  CONSTRAINT fk_eligibility_rules_cycle FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id)
);

-- This ledger records participation only; it must never be joined to answer data.
CREATE TABLE IF NOT EXISTS participation (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_token CHAR(36) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  submitted_on DATE NOT NULL,
  UNIQUE KEY one_per_target (user_id, cycle_id, target_id),
  CONSTRAINT fk_participation_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_participation_cycle FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id),
  CONSTRAINT fk_participation_target FOREIGN KEY (target_id) REFERENCES targets(id)
);

-- Tallies contain counts only: no user identifier, timestamp, or submission id.
CREATE TABLE IF NOT EXISTS answer_tallies (
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  question_id INT NOT NULL,
  option_key INT NOT NULL,
  cnt INT NOT NULL DEFAULT 0,
  PRIMARY KEY (cycle_id, target_id, question_id, option_key),
  CONSTRAINT fk_answer_tallies_cycle FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id),
  CONSTRAINT fk_answer_tallies_target FOREIGN KEY (target_id) REFERENCES targets(id),
  CONSTRAINT fk_answer_tallies_question FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS response_counts (
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  total INT NOT NULL DEFAULT 0,
  PRIMARY KEY (cycle_id, target_id),
  CONSTRAINT fk_response_counts_cycle FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id),
  CONSTRAINT fk_response_counts_target FOREIGN KEY (target_id) REFERENCES targets(id)
);

-- Comments are independent rows with random IDs; they have no author or timestamp.
CREATE TABLE IF NOT EXISTS comments (
  id CHAR(36) PRIMARY KEY,
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  question_id INT NOT NULL,
  body TEXT NOT NULL,
  status ENUM('pending', 'approved', 'hidden') NOT NULL DEFAULT 'pending',
  KEY by_question (cycle_id, target_id, question_id, status),
  CONSTRAINT fk_comments_cycle FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id),
  CONSTRAINT fk_comments_target FOREIGN KEY (target_id) REFERENCES targets(id),
  CONSTRAINT fk_comments_question FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- A retraction-only link, readable only by the submit service DB account.
CREATE TABLE IF NOT EXISTS submission_contributions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_token CHAR(36) NOT NULL,
  question_id INT NOT NULL,
  option_key INT NULL,
  comment_id CHAR(36) NULL,
  UNIQUE KEY one_answer_contribution (submission_token, question_id, option_key),
  UNIQUE KEY one_comment_contribution (comment_id),
  CONSTRAINT fk_submission_contributions_ledger
    FOREIGN KEY (submission_token) REFERENCES participation(submission_token) ON DELETE CASCADE,
  CONSTRAINT fk_submission_contributions_question
    FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_submission_contributions_comment
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS office_memberships (
  user_id INT NOT NULL,
  office_id INT NOT NULL,
  PRIMARY KEY (user_id, office_id),
  CONSTRAINT fk_office_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_memberships_office FOREIGN KEY (office_id) REFERENCES offices(id)
);

CREATE TABLE IF NOT EXISTS office_head_claims (
  id CHAR(36) PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  office_id INT NOT NULL UNIQUE,
  administrator_id INT NOT NULL UNIQUE,
  reports_to_vp_office_id INT NULL,
  CONSTRAINT fk_office_head_claims_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_head_claims_office FOREIGN KEY (office_id) REFERENCES offices(id),
  CONSTRAINT fk_office_head_claims_administrator FOREIGN KEY (administrator_id) REFERENCES administrators(id),
  CONSTRAINT fk_office_head_claims_vp FOREIGN KEY (reports_to_vp_office_id) REFERENCES offices(id)
);

CREATE TABLE IF NOT EXISTS supervisor_claims (
  supervisor_user_id INT PRIMARY KEY,
  head_user_id INT NOT NULL UNIQUE,
  CONSTRAINT fk_supervisor_claims_supervisor FOREIGN KEY (supervisor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervisor_claims_head FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  entity_id VARCHAR(60) NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_admin_audit_user FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- Admins receive only aggregate participation counts, never ledger rows.
CREATE OR REPLACE
  SQL SECURITY DEFINER VIEW participation_counts AS
  SELECT cycle_id, target_id, COUNT(*) AS submitted
  FROM participation
  GROUP BY cycle_id, target_id;

DELIMITER //
DROP PROCEDURE IF EXISTS delete_evaluator_account//
CREATE PROCEDURE delete_evaluator_account(IN p_user_id INT)
SQL SECURITY DEFINER
MODIFIES SQL DATA
BEGIN
  DECLARE account_role VARCHAR(20) DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET account_role = NULL;

  SELECT role INTO account_role
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF account_role IS NULL OR account_role <> 'evaluator' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Only existing evaluator accounts can be deleted.';
  END IF;

  UPDATE answer_tallies tally
  JOIN (
    SELECT p.cycle_id, p.target_id, sc.question_id, sc.option_key, COUNT(*) AS contribution_count
    FROM participation p
    JOIN submission_contributions sc ON sc.submission_token = p.submission_token
    WHERE p.user_id = p_user_id AND sc.option_key IS NOT NULL
    GROUP BY p.cycle_id, p.target_id, sc.question_id, sc.option_key
  ) contributions
    ON contributions.cycle_id = tally.cycle_id
    AND contributions.target_id = tally.target_id
    AND contributions.question_id = tally.question_id
    AND contributions.option_key = tally.option_key
  SET tally.cnt = GREATEST(0, tally.cnt - contributions.contribution_count);

  DELETE FROM answer_tallies WHERE cnt = 0;

  UPDATE response_counts counts
  JOIN (
    SELECT cycle_id, target_id, COUNT(*) AS submission_count
    FROM participation
    WHERE user_id = p_user_id
    GROUP BY cycle_id, target_id
  ) submissions
    ON submissions.cycle_id = counts.cycle_id
    AND submissions.target_id = counts.target_id
  SET counts.total = GREATEST(0, counts.total - submissions.submission_count);

  DELETE FROM response_counts WHERE total = 0;

  DELETE cm
  FROM comments cm
  JOIN submission_contributions sc ON sc.comment_id = cm.id
  JOIN participation p ON p.submission_token = sc.submission_token
  WHERE p.user_id = p_user_id;

  DELETE FROM participation WHERE user_id = p_user_id;
  DELETE FROM users WHERE id = p_user_id;
END//
DELIMITER ;
