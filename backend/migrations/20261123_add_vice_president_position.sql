USE evaluation_system;

ALTER TABLE users
  MODIFY COLUMN position_role ENUM(
    'teaching_faculty',
    'non_teaching_staff',
    'student_leader',
    'campus_administrator_satellite_director',
    'director',
    'vice_president'
  ) NULL DEFAULT NULL;


