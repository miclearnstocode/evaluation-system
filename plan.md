# Anonymous Office and Administrator Evaluation System

Planning and implementation document · November 17, 2026

## 1. Purpose

Students, faculty, and staff evaluate offices and administrators through a survey. The super admin builds surveys, manages campuses and offices, and reads the results. The main requirement is anonymity: nobody, including the super admin and the database administrator, can tell who gave which answer.

## 2. Core privacy design

Google Forms stores one row per submission with the respondent's email and all answers. This system never stores a per-person answer record.

|                                 | Google Forms                    | This system                                   |
| ------------------------------- | ------------------------------- | --------------------------------------------- |
| Stored per submission           | One row: email plus all answers | No row. Only counters per question and answer |
| User linked to answers          | Yes                             | No                                            |
| Admin sees one person's answers | Yes                             | No, none are stored                           |
| Results                         | Live, row by row                | Totals only, after the cycle closes           |

Three stores, none linked to each other:

1. **Participation ledger**: who submitted for which target and cycle. It stops double submissions. It holds no answers.
2. **Answer tallies**: counters per cycle, target, question, and answer value. No user.
3. **Comments**: free-text answers, each a standalone row tied to its survey question. No user, no shared response id.

Rules that keep this true:

- No shared ID, timestamp, or insert order between the stores. Comment ids are random UUIDs. The ledger stores a date only.
- Comments from the same person are never grouped (no response id).
- No logging on the submit route: no IP, user agent, user id, or request body.
- Results are released only after the cycle closes, so nobody can compare tallies before and after one submission.
- A minimum count **k** (default 5) is required before any result, breakdown, or comment list is shown.
- Submissions are final: no edit, no delete, no server-side drafts (drafts stay in the browser).
- No identifying fields in surveys: no name, email, ID number, date of birth, or file upload questions.

## 3. Roles

| Role                                | Can do                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Super admin                         | Manage campuses, offices, administrators, surveys, cycles, eligibility rules, and users. Moderate comments. View results per office or administrator. |
| Evaluator (student, faculty, staff) | Submit evaluations on targets they are eligible for.                                                                                                  |

There is no separate result viewer. Results viewing belongs to the super admin, and every view is written to an audit log. Keep at least two super admin accounts.

## 4. Evaluator assignment and eligibility

The system assigns each evaluator automatically from their account: campus, group (student, faculty, staff), and a central-staff flag. The evaluator cannot choose or edit these.

User data comes from one of: an import from university records (best), SSO attributes, or admin CRUD as a fallback.

| Evaluator                      | Can evaluate                                                                                      | Cannot evaluate                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| Campus student, faculty, staff | Central admin offices and administrators. Their own campus offices too, if enabled for the cycle. | Other campuses' offices           |
| Central admin staff            | Central admin offices and administrators                                                          | Campus offices and administrators |

Evaluation proceeds only when all of these are true, checked server-side on every request:

1. The cycle is open (now is between opens_at and closes_at).
2. The target is in the cycle's target list.
3. An eligibility rule allows it. Deny rules win over allow rules.
4. No ledger row exists yet for this user, cycle, and target.

Default rules seeded for each cycle:

| #   | Effect | Evaluator        | Target                                   |
| --- | ------ | ---------------- | ---------------------------------------- |
| 1   | allow  | campus evaluator | central admin targets                    |
| 2   | allow  | campus evaluator | targets of own campus (toggle per cycle) |
| 3   | allow  | central staff    | central admin targets                    |
| 4   | deny   | central staff    | campus targets                           |

## 5. Survey builder (like Google Forms)

- Survey title and description, sections, and questions.
- Add, edit, duplicate, delete, and drag to reorder. Required or optional per question. Preview before publishing.
- A survey is for office targets or administrator targets.
- Draft, then Published (locked). Tallies are keyed by question and option, so editing a published survey would corrupt counts. To change one, clone it into a new version. Questions that were published are archived, never deleted.
- No branching logic in v1.

| Question type                   | Stored as                 | Result shown                           |
| ------------------------------- | ------------------------- | -------------------------------------- |
| Linear scale or Likert (1 to 5) | Tally per value           | Count, mean, distribution              |
| Star rating                     | Tally per value           | Count, mean, distribution              |
| Multiple choice (one answer)    | Tally per option          | Count and percent                      |
| Checkboxes (many answers)       | Tally per selected option | Count per option                       |
| Yes or No                       | Tally per value           | Count and percent                      |
| Short answer or paragraph       | Comment row               | Moderated comments under that question |

## 6. Evaluation cycles

A cycle ties a published survey to a set of targets and a time window.

1. Pick the survey, targets (offices and administrators), and opens_at and closes_at.
2. Review or edit the eligibility rules.
3. Open the cycle. During the cycle the super admin sees participation counts only (for example, 37 of 120 eligible), never names and never results.
4. At close, results and comments become available, subject to k.

## 7. Data model (MySQL)

CREATE TABLE campuses (  
id INT AUTO_INCREMENT PRIMARY KEY,  
code VARCHAR(20) NOT NULL UNIQUE,  
name VARCHAR(150) NOT NULL,  
is_central TINYINT(1) NOT NULL DEFAULT 0,  
active TINYINT(1) NOT NULL DEFAULT 1  
);  
<br/>CREATE TABLE offices (  
id INT AUTO_INCREMENT PRIMARY KEY,  
campus_id INT NOT NULL,  
name VARCHAR(150) NOT NULL,  
office_type ENUM('central_admin','campus_office') NOT NULL,  
active TINYINT(1) NOT NULL DEFAULT 1,  
FOREIGN KEY (campus_id) REFERENCES campuses(id)  
);  
<br/>CREATE TABLE administrators (  
id INT AUTO_INCREMENT PRIMARY KEY,  
office_id INT NOT NULL,  
name VARCHAR(150) NOT NULL,  
position VARCHAR(150),  
active TINYINT(1) NOT NULL DEFAULT 1,  
FOREIGN KEY (office_id) REFERENCES offices(id)  
);  
<br/>CREATE TABLE targets (  
id INT AUTO_INCREMENT PRIMARY KEY,  
target_type ENUM('office','administrator') NOT NULL,  
office_id INT NULL,  
administrator_id INT NULL,  
campus_id INT NOT NULL,  
is_central TINYINT(1) NOT NULL  
);  
<br/>CREATE TABLE users (  
id INT AUTO_INCREMENT PRIMARY KEY,  
email VARCHAR(190) NOT NULL UNIQUE,  
password_hash VARCHAR(255) NULL,  
role ENUM('super_admin','evaluator') NOT NULL,  
campus_id INT NULL,  
evaluator_group ENUM('student','faculty','staff') NULL,  
is_central_staff TINYINT(1) NOT NULL DEFAULT 0,  
active TINYINT(1) NOT NULL DEFAULT 1  
);  
<br/>CREATE TABLE surveys (  
id INT AUTO_INCREMENT PRIMARY KEY,  
title VARCHAR(200) NOT NULL,  
description TEXT,  
target_type ENUM('office','administrator') NOT NULL,  
version INT NOT NULL DEFAULT 1,  
status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft'  
);  
<br/>CREATE TABLE sections (  
id INT AUTO_INCREMENT PRIMARY KEY,  
survey_id INT NOT NULL,  
title VARCHAR(200) NOT NULL,  
sort_order INT NOT NULL DEFAULT 0,  
FOREIGN KEY (survey_id) REFERENCES surveys(id)  
);  
<br/>CREATE TABLE questions (  
id INT AUTO_INCREMENT PRIMARY KEY,  
survey_id INT NOT NULL,  
section_id INT NOT NULL,  
type ENUM('scale','rating','single_choice','multi_choice','yes_no','text') NOT NULL,  
text VARCHAR(500) NOT NULL,  
required TINYINT(1) NOT NULL DEFAULT 0,  
sort_order INT NOT NULL DEFAULT 0,  
scale_min TINYINT NULL,  
scale_max TINYINT NULL,  
min_label VARCHAR(60) NULL,  
max_label VARCHAR(60) NULL,  
archived TINYINT(1) NOT NULL DEFAULT 0,  
FOREIGN KEY (survey_id) REFERENCES surveys(id)  
);  
<br/>CREATE TABLE question_options (  
id INT AUTO_INCREMENT PRIMARY KEY,  
question_id INT NOT NULL,  
label VARCHAR(200) NOT NULL,  
sort_order INT NOT NULL DEFAULT 0,  
FOREIGN KEY (question_id) REFERENCES questions(id)  
);  
<br/>CREATE TABLE eval_cycles (  
id INT AUTO_INCREMENT PRIMARY KEY,  
survey_id INT NOT NULL,  
name VARCHAR(150) NOT NULL,  
opens_at DATETIME NOT NULL,  
closes_at DATETIME NOT NULL,  
status ENUM('draft','open','closed') NOT NULL DEFAULT 'draft',  
FOREIGN KEY (survey_id) REFERENCES surveys(id)  
);  
<br/>CREATE TABLE cycle_targets (  
cycle_id INT NOT NULL,  
target_id INT NOT NULL,  
PRIMARY KEY (cycle_id, target_id)  
);  
<br/>CREATE TABLE eligibility_rules (  
id INT AUTO_INCREMENT PRIMARY KEY,  
cycle_id INT NOT NULL,  
evaluator_is_central TINYINT(1) NULL,  
evaluator_group ENUM('student','faculty','staff') NULL,  
target_is_central TINYINT(1) NULL,  
same_campus TINYINT(1) NULL,  
effect ENUM('allow','deny') NOT NULL  
);  
<br/>\-- Store 1: ledger. Who participated. No answers.  
CREATE TABLE participation (  
id INT AUTO_INCREMENT PRIMARY KEY,  
user_id INT NOT NULL,  
cycle_id INT NOT NULL,  
target_id INT NOT NULL,  
submitted_on DATE NOT NULL,  
UNIQUE KEY one_per_target (user_id, cycle_id, target_id)  
);  
<br/>\-- Store 2: tallies. Counts only. No user.  
CREATE TABLE answer_tallies (  
cycle_id INT NOT NULL,  
target_id INT NOT NULL,  
question_id INT NOT NULL,  
evaluator_group ENUM('student','faculty','staff') NOT NULL,  
option_key INT NOT NULL,  
cnt INT NOT NULL DEFAULT 0,  
PRIMARY KEY (cycle_id, target_id, question_id, evaluator_group, option_key)  
);  
<br/>CREATE TABLE response_counts (  
cycle_id INT NOT NULL,  
target_id INT NOT NULL,  
evaluator_group ENUM('student','faculty','staff') NOT NULL,  
total INT NOT NULL DEFAULT 0,  
PRIMARY KEY (cycle_id, target_id, evaluator_group)  
);  
<br/>\-- Store 3: comments. Standalone rows. No user, no response id, no timestamp.  
CREATE TABLE comments (  
id CHAR(36) PRIMARY KEY,  
cycle_id INT NOT NULL,  
target_id INT NOT NULL,  
question_id INT NOT NULL,  
body TEXT NOT NULL,  
status ENUM('pending','approved','hidden') NOT NULL DEFAULT 'pending',  
KEY by_question (cycle_id, target_id, question_id, status)  
);  
<br/>CREATE TABLE admin_audit_log (  
id INT AUTO_INCREMENT PRIMARY KEY,  
admin_id INT NOT NULL,  
action VARCHAR(60) NOT NULL,  
entity VARCHAR(60) NOT NULL,  
entity_id VARCHAR(60) NULL,  
created_at DATETIME NOT NULL  
);

For a scale or rating question, option_key is the value picked (1 to 5). For choice questions, option_key is the option id. Yes or No uses 1 and 0. Evaluator campus is deliberately not stored on tallies. Add it only if the stakeholders need a per-campus breakdown, and keep the k rule on it.

## 8. Submission flow

1. The user logs in. The server loads campus, group, and central-staff flag.
2. The target list shows only eligible, open, not-yet-submitted targets.
3. The user fills the form. The draft stays in the browser.
4. On submit, the server re-checks the cycle window, target, eligibility, and validates every answer against the survey (right question, right type, value in range, required answered).
5. One transaction writes the ledger row, the tally increments, the response count, and each comment as its own row.
6. The user sees a confirmation. Nothing can be retrieved afterward.

function uuidv4(): string {  
\$b = random_bytes(16);  
\$b\[6\] = chr((ord(\$b\[6\]) & 0x0f) | 0x40);  
\$b\[8\] = chr((ord(\$b\[8\]) & 0x3f) | 0x80);  
return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex(\$b), 4));  
}  
<br/>function submitEvaluation(PDO \$db, array \$user, int \$cycleId, int \$targetId,  
array \$answers, array \$comments): string {  
assertCycleOpen(\$db, \$cycleId);  
assertTargetInCycle(\$db, \$cycleId, \$targetId);  
assertEligible(\$db, \$user, \$cycleId, \$targetId);  
\$clean = validateAnswers(\$db, \$cycleId, \$answers, \$comments);  
<br/>\$db->beginTransaction();  
try {  
\$db->prepare('INSERT INTO participation (user_id, cycle_id, target_id, submitted_on)  
VALUES (?, ?, ?, CURDATE())')  
\->execute(\[\$user\['id'\], \$cycleId, \$targetId\]);  
<br/>\$tally = \$db->prepare('INSERT INTO answer_tallies  
(cycle_id, target_id, question_id, evaluator_group, option_key, cnt)  
VALUES (?, ?, ?, ?, ?, 1)  
ON DUPLICATE KEY UPDATE cnt = cnt + 1');  
foreach (\$clean\['tallies'\] as \[\$questionId, \$optionKey\]) {  
\$tally->execute(\[\$cycleId, \$targetId, \$questionId, \$user\['evaluator_group'\], \$optionKey\]);  
}  
<br/>\$db->prepare('INSERT INTO response_counts (cycle_id, target_id, evaluator_group, total)  
VALUES (?, ?, ?, 1)  
ON DUPLICATE KEY UPDATE total = total + 1')  
\->execute(\[\$cycleId, \$targetId, \$user\['evaluator_group'\]\]);  
<br/>\$comment = \$db->prepare('INSERT INTO comments (id, cycle_id, target_id, question_id, body)  
VALUES (?, ?, ?, ?, ?)');  
foreach (\$clean\['comments'\] as \[\$questionId, \$body\]) {  
\$comment->execute(\[uuidv4(), \$cycleId, \$targetId, \$questionId, \$body\]);  
}  
<br/>\$db->commit();  
return 'ok';  
} catch (PDOException \$e) {  
\$db->rollBack();  
if (\$e->getCode() === '23000') {  
return 'already_submitted';  
}  
throw \$e;  
}  
}

The duplicate key on the ledger is what blocks a second submission. The submit endpoint must not log the request body or the user id.

## 9. Results (super admin)

Release rules:

- Only after the cycle status is closed.
- Per target, the total response count must be at least k. Otherwise show not enough responses.
- Any breakdown by evaluator group is hidden when that group has fewer than k responses.
- Super admin sees aggregates and moderated comments only. No raw rows, no per-person export.
- Every results view and export is written to admin_audit_log.

Results page: pick a cycle, then an office or administrator. For each question show:

- Scale, rating, choice, and yes or no: count, mean (scale and rating), and distribution.
- Text questions: the approved comments under that question.
- Comparison across cycles and across offices.

\-- k check  
SELECT SUM(total) AS n FROM response_counts WHERE cycle_id = ? AND target_id = ?;  
<br/>\-- distribution for one question  
SELECT option_key, SUM(cnt) AS cnt  
FROM answer_tallies  
WHERE cycle_id = ? AND target_id = ? AND question_id = ?  
GROUP BY option_key ORDER BY option_key;  
<br/>\-- mean for a scale or rating question  
SELECT SUM(option_key \* cnt) / SUM(cnt) AS mean  
FROM answer_tallies  
WHERE cycle_id = ? AND target_id = ? AND question_id = ?;

## 10. Comments

Comments are essential, so each one is stored against the question it answers, so the reader sees what it refers to.

- A comment row has only: random UUID, cycle, target, question, text, and moderation status. No user, group, campus, timestamp, or response id.
- Display after the cycle closes, only when the question has at least k approved comments, in random order, with no dates.
- The super admin approves or hides each comment. Hide any comment that names a person or gives identifying details. Log each moderation action (comment id, action, admin), never the author, because the author is not known.
- The form shows a warning under comment questions: do not include your name or details that could identify you.
- Comment questions are optional by default.

Comment text can still identify someone by its content. The k rule, moderation, random order, and the warning reduce this but cannot remove it. State this plainly to stakeholders.

## 11. Security hardening

| Leak                                                   | Fix                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Insert order or timestamps match ledger to rows        | UUIDs for comments, no timestamps on tallies or comments, date only on the ledger, random order on read |
| Web server and PHP logs record who submitted           | Turn off access logging for the submit route. Do not log request bodies or user ids.                    |
| MySQL general log and binlog record writes with timing | Disable the general log. Restrict or disable the binlog. Restrict who can read either.                  |
| Backups taken mid-cycle expose before and after states | Back up the results tables only after the cycle closes                                                  |
| Super admin or DBA reading both stores                 | Separate database users (see below)                                                                     |
| Small groups                                           | k rule on every result, breakdown, and comment list                                                     |
| Drafts or edits require a link                         | No server drafts, no edits                                                                              |

Database users:

| User                                | Permissions                                                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| app_submit (submit service only)    | INSERT and UPDATE on tallies, response_counts, comments. INSERT on participation. SELECT on participation for the duplicate check.                                                                               |
| app_admin (admin and results pages) | SELECT on tallies, response_counts, comments. UPDATE on comments.status. SELECT on surveys, offices, and setup tables. No SELECT on participation. Participation counts through a view that returns counts only. |

Optional hardening for later: write tally increments and comments in random-delayed batches so their timing does not match the ledger row. Stronger option: encrypt each submission with a cycle public key and keep the private key offline until the cycle closes.

## 12. Pages and endpoints

**Admin:** Campuses, Offices, Administrators, Users, Survey Builder, Cycles and Rules, Participation Monitor (counts only), Results Dashboard, Comment Moderation, Audit Log.

**Evaluator:** My Evaluations (eligible targets), Evaluation Form, Done.

GET /api/evaluator/targets  
GET /api/evaluator/targets/{id}/form  
POST /api/evaluator/submit (no logging, final)  
<br/>GET /api/admin/results?cycle=&target= (closed cycles, k enforced)  
GET /api/admin/comments?cycle=&target=&question=  
POST /api/admin/comments/{id}/moderate  
GET /api/admin/participation?cycle= (counts only)

## 13. Build phases

1. **Foundation.** Login, roles, user import, CRUD for campuses, offices, administrators, targets.
2. **Survey builder.** Sections, question types, preview, publish and lock, clone for new version, blocked identifying fields.
3. **Cycles and eligibility.** Windows, target selection, rule engine with default rules. Write tests for every row of the eligibility table in section 4.
4. **Anonymous submission.** The transaction in section 8, answer validation, duplicate block, no-log route, database users.
5. **Results and comments.** Close-cycle release, k enforcement, charts, comment moderation, audit log.
6. **Hardening and testing.**
   - Confirm no query or view joins participation to tallies or comments.
   - Check logs, backups, and exports contain no linkage.
   - Confirm app_admin cannot read participation rows.
   - Test a tiny group to confirm suppression works.
   - Test that central staff cannot evaluate campus targets through direct API calls.
   - Test double submission and out-of-window submission.

## 14. Open decisions

- The value of k (suggested 5).
- Whether campus evaluators can evaluate their own campus offices (assumed yes, configurable per cycle).
- Whether central staff can evaluate central offices (assumed yes).
- User data source: university import, SSO, or admin entry.
- Whether to keep a per-campus breakdown of results (adds re-identification risk in small campuses).
- Retention period for comments after a cycle closes.

## 15. Remaining risks

- A person with full database and server access could still try timing correlation. The mitigations are date-only ledger, UUIDs, no logs, separate database users, and optional batching.
- Comment text can identify its author by content. Moderation and k reduce, not remove, this.
- Trust drives honest answers. Show a short notice on the form explaining that answers are stored without the evaluator's identity.