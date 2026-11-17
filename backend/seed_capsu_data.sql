USE evaluation_system;

START TRANSACTION;

INSERT INTO campuses (code, name, location_code, is_central) VALUES
  ('MAIN', 'Main / Roxas', 'MAIN', 0),
  ('PILAR', 'Pilar', 'PILAR', 0),
  ('BURIAS', 'Burias', 'BURIAS', 0),
  ('DAYAO', 'Dayao', 'DAYAO', 0),
  ('SIGMA', 'Sigma', 'SIGMA', 0),
  ('DUMARAO', 'Dumarao', 'DUMARAO', 0),
  ('MAMBUSAO', 'Mambusao', 'MAMBUSAO', 0),
  ('PONTEVEDRA', 'Pontevedra', 'PONTEVEDRA', 0),
  ('TAPAZ', 'Tapaz', 'TAPAZ', 0),
  ('CENTRAL', 'Central Office', 'CENTRAL', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_central = VALUES(is_central);

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

INSERT INTO registration_units (code, name, category, location_code, office_type) VALUES
  ('VP_ACADEMIC', 'Office of the Vice President for Academic Affairs', 'vp', 'CENTRAL', 'central_admin'),
  ('VP_ADMIN_FINANCE', 'Office of the Vice President for Admin & Finance', 'vp', 'CENTRAL', 'central_admin'),
  ('VP_RESEARCH', 'Office of the Vice President for Research Dev’t. & Extension', 'vp', 'CENTRAL', 'central_admin'),
  ('VP_EXTERNAL', 'Office of the Vice President for External Affairs & Linkages', 'vp', 'CENTRAL', 'central_admin'),
  ('CAMPUS_FOCAL_ROXAS', 'Office of the Campus Focal, Roxas City Campus', 'campus_head', 'MAIN', 'campus_office'),
  ('CAMPUS_ADMIN_PONTEVEDRA', 'Office of the Campus Administrator, Pontevedra Campus', 'campus_head', 'PONTEVEDRA', 'campus_office'),
  ('CAMPUS_ADMIN_BURIAS', 'Office of the Campus Administrator, Burias Campus', 'campus_head', 'BURIAS', 'campus_office'),
  ('SATELLITE_DIRECTOR_DUMARAO', 'Office of the Satellite College Director, Dumarao', 'campus_head', 'DUMARAO', 'campus_office'),
  ('SATELLITE_DIRECTOR_TAPAZ', 'Office of the Satellite College Director, Tapaz', 'campus_head', 'TAPAZ', 'campus_office'),
  ('SATELLITE_DIRECTOR_SIGMA', 'Office of the Satellite College Director, Sigma', 'campus_head', 'SIGMA', 'campus_office'),
  ('SATELLITE_DIRECTOR_MAMBUSAO', 'Office of the Satellite College Director, Mambusao', 'campus_head', 'MAMBUSAO', 'campus_office'),
  ('SATELLITE_DIRECTOR_DAYAO', 'Office of the Satellite College Director, Dayao', 'campus_head', 'DAYAO', 'campus_office'),
  ('SATELLITE_DIRECTOR_PILAR', 'Office of the Satellite College Director, Pilar', 'campus_head', 'PILAR', 'campus_office'),
  ('BAC', 'Office of the Bids and Awards Committee (BAC)', 'director', 'CENTRAL', 'central_admin'),
  ('QMR', 'Quality Management Representative (QMR)', 'director', 'CENTRAL', 'central_admin'),
  ('GRIEVANCE', 'Grievance and Complaint Management Office', 'director', 'CENTRAL', 'central_admin'),
  ('BUSINESS_AFFAIRS', 'University Business Affairs Office (UBAO)', 'director', 'CENTRAL', 'central_admin'),
  ('GENDER_DEVELOPMENT', 'Gender & Development (GAD)', 'director', 'CENTRAL', 'central_admin'),
  ('QUALITY_ASSURANCE', 'Quality Assurance (QA)', 'director', 'CENTRAL', 'central_admin'),
  ('INSTRUCTION', 'Instruction', 'director', 'CENTRAL', 'central_admin'),
  ('PUBLICATION', 'Publication, Instructional Materials, and Creative Works', 'director', 'CENTRAL', 'central_admin'),
  ('STUDENT_AFFAIRS', 'Student Affairs and Services (SAS)', 'director', 'CENTRAL', 'central_admin'),
  ('DISASTER_RISK', 'Disaster Risk Reduction and Management (DRRM)', 'director', 'CENTRAL', 'central_admin'),
  ('CLIMATE_CHANGE', 'Climate Change Management', 'director', 'CENTRAL', 'central_admin'),
  ('NSTP', 'National Services Training Program (NSTP)', 'director', 'CENTRAL', 'central_admin'),
  ('SPORTS', 'Sports Services', 'director', 'CENTRAL', 'central_admin'),
  ('CULTURAL', 'Cultural Services', 'director', 'CENTRAL', 'central_admin'),
  ('INTERNATIONAL_AFFAIRS', 'International and National Affairs', 'director', 'CENTRAL', 'central_admin'),
  ('ALUMNI_COMMUNITY', 'Alumni and Community Affairs', 'director', 'CENTRAL', 'central_admin'),
  ('ECO_TOURISM', 'Eco Tourism, Landholdings & Physical Resources', 'director', 'CENTRAL', 'central_admin'),
  ('IPMO', 'Intellectual Property Management Office (IPMO)', 'director', 'CENTRAL', 'central_admin'),
  ('HR_TRAINING', 'Human Resource Training and Development (HRDT)', 'director', 'CENTRAL', 'central_admin'),
  ('RESEARCH_OFFICE', 'Research Office', 'director', 'CENTRAL', 'central_admin'),
  ('EXTENSION_OFFICE', 'Extension Office', 'director', 'CENTRAL', 'central_admin'),
  ('FOOD_TECH_CENTER', 'Food Industrial Technology Research and Development Center (FITRDC)', 'director', 'CENTRAL', 'central_admin'),
  ('FISHERIES_CENTER', 'Fisheries & Aqua-Marine Research and Development Center (FMRDC)', 'director', 'CENTRAL', 'central_admin'),
  ('CROP_SCIENCE_CENTER', 'Crop Science Research & Development Center (CSRDC)', 'director', 'CENTRAL', 'central_admin'),
  ('SOCIAL_SCIENCE_CENTER', 'Social Science Research Development Center (SSRDC)', 'director', 'CENTRAL', 'central_admin'),
  ('LIVESTOCK_CENTER', 'Livestock Research & Development Center (LRDC)', 'director', 'CENTRAL', 'central_admin'),
  ('COCONUT_CENTER', 'Coconut Research Development Center (COCORDC)', 'director', 'CENTRAL', 'central_admin'),
  ('MACHINERY_CENTER', 'Machinery and Agricultural Technology Engineering Center (MATEC)', 'director', 'CENTRAL', 'central_admin')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  location_code = VALUES(location_code),
  office_type = VALUES(office_type);

INSERT INTO offices (campus_id, name, office_type, unit_code)
SELECT c.id, r.name, r.office_type, r.code
FROM registration_units AS r
JOIN campuses AS c ON c.location_code = r.location_code
ON DUPLICATE KEY UPDATE
  campus_id = VALUES(campus_id),
  name = VALUES(name),
  office_type = VALUES(office_type);

INSERT INTO administrators (office_id, name)
SELECT o.id, seed.name
FROM (
  SELECT 'VP_ACADEMIC' AS unit_code, 'Dr. Annalie G. Campos' AS name
  UNION ALL SELECT 'VP_ADMIN_FINANCE', 'Atty. Toche Vic B. Doce -OIC'
  UNION ALL SELECT 'VP_RESEARCH', 'Dr. Leo Andrew B. Biclar'
  UNION ALL SELECT 'VP_EXTERNAL', 'Dr. Salvacion J. Legaspi'
  UNION ALL SELECT 'CAMPUS_FOCAL_ROXAS', 'Dr. Cleo Jude A. Joaquin'
  UNION ALL SELECT 'CAMPUS_ADMIN_PONTEVEDRA', 'Dr. Honey Lee E. Casa'
  UNION ALL SELECT 'CAMPUS_ADMIN_BURIAS', 'Dr. Rodyard B. Madiclum'
  UNION ALL SELECT 'SATELLITE_DIRECTOR_DUMARAO', 'Dr. Marie Jean P. Penson'
  UNION ALL SELECT 'SATELLITE_DIRECTOR_TAPAZ', 'Dr. Ricky D. Fecara'
  UNION ALL SELECT 'SATELLITE_DIRECTOR_SIGMA', 'Dr. Eimee D. Potato'
  UNION ALL SELECT 'SATELLITE_DIRECTOR_MAMBUSAO', 'Dr. Ramy Lloyd L. Lotilla'
  UNION ALL SELECT 'SATELLITE_DIRECTOR_DAYAO', 'Dr. Nilo D. Delfin'
  UNION ALL SELECT 'SATELLITE_DIRECTOR_PILAR', 'Dr. Jennifer P. Benliro'
  UNION ALL SELECT 'BAC', 'Dr. Salvacion J. Legaspi'
  UNION ALL SELECT 'QMR', 'Dr. Matilde A. Perez'
  UNION ALL SELECT 'GRIEVANCE', 'Atty. Joey B. Balatayo'
  UNION ALL SELECT 'BUSINESS_AFFAIRS', 'Dr. Cleo Jude A. Joaquin'
  UNION ALL SELECT 'GENDER_DEVELOPMENT', 'Dr. Jesusa L. Luda'
  UNION ALL SELECT 'QUALITY_ASSURANCE', 'Dr. Rossandrew B. Villaruel'
  UNION ALL SELECT 'INSTRUCTION', 'Dr. Hazel D. Joaquin'
  UNION ALL SELECT 'PUBLICATION', 'Dr. Hazel D. Joaquin'
  UNION ALL SELECT 'STUDENT_AFFAIRS', 'Dr. Jay Ann B. Gregorio'
  UNION ALL SELECT 'DISASTER_RISK', 'Prof. Arnel Van Aleligay'
  UNION ALL SELECT 'CLIMATE_CHANGE', 'Dr. Amel L. Magallanes'
  UNION ALL SELECT 'NSTP', 'Dr. Elmer M. Albaladejo'
  UNION ALL SELECT 'SPORTS', 'Dr. Eduardo I. Diosalan, Jr.'
  UNION ALL SELECT 'CULTURAL', 'Prof. Angelyn L. Vestidas'
  UNION ALL SELECT 'INTERNATIONAL_AFFAIRS', 'Dr. Malou B. Albor'
  UNION ALL SELECT 'ALUMNI_COMMUNITY', 'Prof. Davidica L. Avelino'
  UNION ALL SELECT 'ECO_TOURISM', 'Dr. Aldin D. Lorenzo'
  UNION ALL SELECT 'IPMO', 'Mr. French A. Dampog'
  UNION ALL SELECT 'HR_TRAINING', 'Dr. Ronilo G. Berondo'
  UNION ALL SELECT 'RESEARCH_OFFICE', 'Dr. Stephanie S. Pimentel'
  UNION ALL SELECT 'EXTENSION_OFFICE', 'Dr. Jocelyn S. Legaspi'
  UNION ALL SELECT 'FOOD_TECH_CENTER', 'Dr. Marife R. Hilapad'
  UNION ALL SELECT 'FISHERIES_CENTER', 'Dr. Rey Dela Calzado'
  UNION ALL SELECT 'CROP_SCIENCE_CENTER', 'Dr. Ramonita C. Verano'
  UNION ALL SELECT 'SOCIAL_SCIENCE_CENTER', 'Dr. Emmanuel D. Dayalo'
  UNION ALL SELECT 'LIVESTOCK_CENTER', 'Dr. Emely J. Escala'
  UNION ALL SELECT 'COCONUT_CENTER', 'Dr. Roger L. Berganio'
  UNION ALL SELECT 'MACHINERY_CENTER', 'Engr. Monalyn L. Oloroso'
) AS seed
JOIN offices AS o ON o.unit_code = seed.unit_code
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  active = 1;

INSERT INTO targets (target_type, office_id, campus_id, is_central)
SELECT 'office', o.id, o.campus_id, o.office_type = 'central_admin'
FROM offices AS o
WHERE o.unit_code IS NOT NULL
ON DUPLICATE KEY UPDATE
  campus_id = VALUES(campus_id),
  is_central = VALUES(is_central);

INSERT INTO targets (target_type, administrator_id, campus_id, is_central)
SELECT 'administrator', a.id, o.campus_id, o.office_type = 'central_admin'
FROM administrators AS a
JOIN offices AS o ON o.id = a.office_id
WHERE o.unit_code IS NOT NULL
ON DUPLICATE KEY UPDATE
  campus_id = VALUES(campus_id),
  is_central = VALUES(is_central);

COMMIT;

SELECT
  (SELECT COUNT(*) FROM campuses WHERE location_code IS NOT NULL) AS campus_locations,
  (SELECT COUNT(*) FROM registration_units) AS registration_units,
  (SELECT COUNT(*) FROM offices WHERE unit_code IS NOT NULL) AS seeded_offices,
  (SELECT COUNT(*) FROM administrators a JOIN offices o ON o.id = a.office_id WHERE o.unit_code IS NOT NULL) AS seeded_administrators,
  (SELECT COUNT(*) FROM targets WHERE target_type = 'office') AS office_targets,
  (SELECT COUNT(*) FROM targets WHERE target_type = 'administrator') AS administrator_targets;
