USE evaluation_system;

CREATE TABLE IF NOT EXISTS cycle_survey_snapshots (
  cycle_id INT PRIMARY KEY,
  survey_id INT NOT NULL,
  survey_title VARCHAR(255) NOT NULL,
  survey_description TEXT NULL,
  CONSTRAINT fk_cycle_survey_snapshots_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_cycle_survey_snapshots_survey
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cycle_survey_questions (
  cycle_id INT NOT NULL,
  question_id INT NOT NULL,
  section_id INT NOT NULL,
  section_title VARCHAR(255) NOT NULL,
  section_order INT NOT NULL,
  question_order INT NOT NULL,
  PRIMARY KEY (cycle_id, question_id),
  KEY ix_cycle_survey_questions_order (cycle_id, section_order, question_order),
  CONSTRAINT fk_cycle_survey_questions_cycle
    FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_cycle_survey_questions_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cycle_survey_questions_section
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT
);

INSERT IGNORE INTO cycle_survey_snapshots
  (cycle_id, survey_id, survey_title, survey_description)
SELECT c.id, s.id, s.title, s.description
FROM eval_cycles c
JOIN surveys s ON s.id = c.survey_id;

INSERT IGNORE INTO cycle_survey_questions
  (cycle_id, question_id, section_id, section_title, section_order, question_order)
SELECT c.id, q.id, sec.id, sec.title, sec.sort_order, q.sort_order
FROM eval_cycles c
JOIN sections sec ON sec.survey_id = c.survey_id
JOIN questions q ON q.section_id = sec.id AND q.is_archived = 0
ORDER BY c.id, sec.sort_order, sec.id, q.sort_order, q.id;
