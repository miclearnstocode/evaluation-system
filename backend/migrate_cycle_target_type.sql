
USE evaluation_system;

ALTER TABLE eval_cycles
  ADD COLUMN target_type ENUM('office', 'administrator') NULL AFTER survey_id;

UPDATE eval_cycles c
JOIN surveys s ON s.id = c.survey_id
SET c.target_type = s.target_type;

ALTER TABLE eval_cycles
  MODIFY target_type ENUM('office', 'administrator') NOT NULL;

ALTER TABLE surveys
  DROP COLUMN target_type;

DROP TABLE IF EXISTS email_verifications;

ALTER TABLE users
  DROP COLUMN email_verified;
