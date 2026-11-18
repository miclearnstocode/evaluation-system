USE evaluation_system;

CREATE TABLE IF NOT EXISTS evaluator_answers (
  answer_id CHAR(36) PRIMARY KEY,
  response_id CHAR(36) NOT NULL,
  cycle_id INT NOT NULL,
  target_id INT NOT NULL,
  question_id INT NOT NULL,
  answer_value JSON NOT NULL,
  KEY by_response (response_id),
  KEY by_target (cycle_id, target_id, question_id),
  CONSTRAINT fk_evaluator_answers_cycle FOREIGN KEY (cycle_id) REFERENCES eval_cycles(id),
  CONSTRAINT fk_evaluator_answers_target FOREIGN KEY (target_id) REFERENCES targets(id),
  CONSTRAINT fk_evaluator_answers_question FOREIGN KEY (question_id) REFERENCES questions(id)
);

ALTER TABLE submission_contributions
  ADD COLUMN answer_id CHAR(36) NULL,
  ADD UNIQUE KEY one_stored_answer (answer_id),
  ADD CONSTRAINT fk_submission_contributions_answer
    FOREIGN KEY (answer_id) REFERENCES evaluator_answers(answer_id) ON DELETE CASCADE;
