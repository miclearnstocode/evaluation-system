USE evaluation_system;

ALTER TABLE eval_cycles
  MODIFY COLUMN target_type ENUM('office', 'administrator', 'all') NOT NULL;
