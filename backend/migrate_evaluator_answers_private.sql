USE evaluation_system;

-- One-time migration for the legacy evaluator_answers table containing submission_token.
-- Do not run again after success; the migrated table no longer has submission_token.
-- IF NOT EXISTS handles the contribution ALTER having been run separately already.
ALTER TABLE submission_contributions
  ADD COLUMN IF NOT EXISTS answer_id CHAR(36) NULL,
  ADD UNIQUE INDEX IF NOT EXISTS one_stored_answer (answer_id);

ALTER TABLE evaluator_answers
  ADD COLUMN IF NOT EXISTS answer_id CHAR(36) NULL FIRST,
  ADD COLUMN IF NOT EXISTS response_id CHAR(36) NULL AFTER answer_id;

CREATE TEMPORARY TABLE answer_response_migration (
  submission_token CHAR(36) PRIMARY KEY,
  response_id CHAR(36) NOT NULL
);

INSERT INTO answer_response_migration (submission_token, response_id)
SELECT DISTINCT submission_token, UUID()
FROM evaluator_answers;

UPDATE evaluator_answers
JOIN answer_response_migration USING (submission_token)
SET evaluator_answers.answer_id = UUID(),
    evaluator_answers.response_id = answer_response_migration.response_id;

INSERT INTO submission_contributions
  (submission_token, question_id, option_key, comment_id, answer_id)
SELECT submission_token, question_id, NULL, NULL, answer_id
FROM evaluator_answers;

DROP TEMPORARY TABLE answer_response_migration;

ALTER TABLE evaluator_answers
  DROP FOREIGN KEY fk_evaluator_answers_submission,
  DROP PRIMARY KEY,
  DROP COLUMN submission_token,
  MODIFY answer_id CHAR(36) NOT NULL,
  MODIFY response_id CHAR(36) NOT NULL,
  ADD PRIMARY KEY (answer_id),
  ADD KEY by_response (response_id);

ALTER TABLE submission_contributions
  ADD CONSTRAINT fk_submission_contributions_answer
    FOREIGN KEY (answer_id) REFERENCES evaluator_answers(answer_id) ON DELETE CASCADE;
