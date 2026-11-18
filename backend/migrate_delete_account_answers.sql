USE evaluation_system;

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

  DELETE ea
  FROM evaluator_answers ea
  JOIN submission_contributions sc ON sc.answer_id = ea.answer_id
  JOIN participation p ON p.submission_token = sc.submission_token
  WHERE p.user_id = p_user_id;

  DELETE FROM participation WHERE user_id = p_user_id;
  DELETE FROM users WHERE id = p_user_id;
END//
DELIMITER ;
