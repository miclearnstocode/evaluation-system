-- 1. Vice Presidents (e.g., Academic Affairs, Admin & Finance, etc.)
CREATE TABLE vice_presidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE, 
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Campus Administrators (Linked to campuses)
CREATE TABLE campus_administrators (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    campus_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE
);

-- 3. Satellite College Directors (Linked to campuses)
CREATE TABLE satellite_college_directors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    campus_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE
);

-- 4. Directors (General/Business/QA/GAD, etc.)
CREATE TABLE directors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. RDE Directors (Research, Development, Extension)
CREATE TABLE rde_directors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. RDE Center Directors (FITRDC, FMRDC, CSRDC, etc.)
CREATE TABLE rde_center_directors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE targets
MODIFY COLUMN target_type ENUM(
    'office', 
    'administrator',
    'vice_president',
    'campus_administrator',
    'satellite_college_director',
    'director',
    'rde_director',
    'rde_center_director'
) NOT NULL;

-- Add the new foreign keys
ALTER TABLE targets
ADD COLUMN vice_president_id INT NULL,
ADD COLUMN campus_administrator_id INT NULL,
ADD COLUMN satellite_college_director_id INT NULL,
ADD COLUMN director_id INT NULL,
ADD COLUMN rde_director_id INT NULL,
ADD COLUMN rde_center_director_id INT NULL;

-- Add foreign key constraints
ALTER TABLE targets
ADD CONSTRAINT fk_target_vp FOREIGN KEY (vice_president_id) REFERENCES vice_presidents(id) ON DELETE CASCADE,
ADD CONSTRAINT fk_target_ca FOREIGN KEY (campus_administrator_id) REFERENCES campus_administrators(id) ON DELETE CASCADE,
ADD CONSTRAINT fk_target_scd FOREIGN KEY (satellite_college_director_id) REFERENCES satellite_college_directors(id) ON DELETE CASCADE,
ADD CONSTRAINT fk_target_dir FOREIGN KEY (director_id) REFERENCES directors(id) ON DELETE CASCADE,
ADD CONSTRAINT fk_target_rde_dir FOREIGN KEY (rde_director_id) REFERENCES rde_directors(id) ON DELETE CASCADE,
ADD CONSTRAINT fk_target_rde_center FOREIGN KEY (rde_center_director_id) REFERENCES rde_center_directors(id) ON DELETE CASCADE;


ALTER TABLE users
ADD COLUMN assigned_vp_id INT NULL,
ADD COLUMN assigned_ca_id INT NULL,
ADD COLUMN assigned_scd_id INT NULL,
ADD COLUMN assigned_director_id INT NULL,
ADD COLUMN assigned_rde_dir_id INT NULL,
ADD COLUMN assigned_rde_center_id INT NULL;


-- Vice Presidents
INSERT INTO vice_presidents (code, title) VALUES 
('VP_ACAD', 'Office of the Vice President for Academic Affairs'),
('VP_ADMIN', 'Office of the Vice President for Admin & Finance'),
('VP_RDE', 'Office of the Vice President for Research Dev\'t. & Extension'),
('VP_EXTERNAL', 'Office of the Vice President for External Affairs & Linkages');

-- Campus Administrators
INSERT INTO campus_administrators (code, title, campus_id) VALUES 
('CA_ROXAS', 'Office of the Campus Focal, Roxas City Campus', 1),
('CA_PONTEVEDRA', 'Office of the Campus Administrator, Pontevedra Campus', 2),
('CA_BURIAS', 'Office of the Campus Administrator, Burias Campus', 3);

-- Satellite College Directors
INSERT INTO satellite_college_directors (code, title, campus_id) VALUES 
('SCD_DUMARAO', 'Office of the Satellite College Director, Dumarao', 4),
('SCD_TAPAZ', 'Office of the Satellite College Director, Tapaz', 5),
('SCD_SIGMA', 'Office of the Satellite College Director, Sigma', 6),
('SCD_MAMBUSAO', 'Office of the Satellite College Director, Mambusao', 7),
('SCD_DAYAO', 'Office of the Satellite College Director, Dayao', 8),
('SCD_PILAR', 'Office of the Satellite College Director, Pilar', 9);

-- Directors
INSERT INTO directors (code, title) VALUES 
('DIR_BAC', 'Office of the Bids and Awards Committee (BAC)'),
('DIR_QMR', 'Quality Management Representative (QMR)'),
('DIR_GRIEVANCE', 'Grievance and Complaint Management Office'),
('DIR_UBAO', 'University Business Affairs Office (UBAO)'),
('DIR_GAD', 'Gender & Development (GAD)'),
('DIR_QA', 'Quality Assurance (QA)'),
('DIR_INSTRUCTION', 'Instruction'),
('DIR_PUBLICATION', 'Publication, Instructional Materials, and Creative Works'),
('DIR_SAS', 'Student Affairs and Services (SAS)'),
('DIR_DRRM', 'Disaster Risk Reduction and Management (DRRM)'),
('DIR_CLIMATE', 'Climate Change Management'),
('DIR_NSTP', 'National Services Training Program (NSTP)'),
('DIR_SPORTS', 'Sports Services'),
('DIR_CULTURAL', 'Cultural Services'),
('DIR_INTERNATIONAL', 'International and National Affairs'),
('DIR_ALUMNI', 'Alumni and Community Affairs'),
('DIR_ECO', 'Eco Tourism, Landholdings & Physical Resources'),
('DIR_IPMO', 'Intellectual Property Management Office (IPMO)'),
('DIR_HRDT', 'Human Resource Training and Development (HRDT)');

-- RDE Directors
INSERT INTO rde_directors (code, title) VALUES 
('RDE_RESEARCH', 'Research Office'),
('RDE_EXTENSION', 'Extension Office');

-- RDE Center Directors
INSERT INTO rde_center_directors (code, title) VALUES 
('RDE_FITRDC', 'Food Industrial Technology Research and Development Center (FITRDC)'),
('RDE_FMRDC', 'Fisheries & Aqua-Marine Research and Development Center (FMRDC)'),
('RDE_CSRDC', 'Crop Science Research & Development Center (CSRDC)'),
('RDE_SSRDC', 'Social Science Research Development Center (SSRDC)'),
('RDE_LRDC', 'Livestock Research & Development Center (LRDC)'),
('RDE_COCORDC', 'Coconut Research Development Center (COCORDC)'),
('RDE_MATEC', 'Machinery and Agricultural Technology Engineering Center (MATEC)');s

