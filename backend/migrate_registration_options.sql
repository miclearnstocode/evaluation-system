USE evaluation_system;

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

INSERT INTO registration_roles (code, name, sort_order) VALUES
  ('teaching_faculty', 'Teaching / Faculty', 1),
  ('non_teaching_staff', 'Non-Teaching / Administrative Staff', 2),
  ('student_leader', 'Student Leader', 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  sort_order = VALUES(sort_order);

INSERT INTO registration_service_years (code, name, sort_order) VALUES
  ('lt_1', 'Less than 1 year', 1),
  ('1_5', '1–5 years', 2),
  ('6_10', '6–10 years', 3),
  ('11_plus', '11+ years', 4)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  sort_order = VALUES(sort_order);
