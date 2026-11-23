# Flask and XAMPP setup

## Database

1. Start MySQL in XAMPP.
2. In phpMyAdmin, import `database-schema.sql`. It creates the `evaluation_system` database and the new target-based schema.
3. Configure `backend/.env` for local development and set a long random `SECRET_KEY`.
4. Run `python backend\seed_admin.py` twice to create two distinct super-admin accounts. Add campuses and evaluation targets from the admin catalog pages.

For a visual relationship diagram and explanations of every table, view, and stored procedure, see [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

`database-schema.sql` is a fresh-install schema, not an in-place migration. Do not import it over a database containing existing tables or data. Back up the existing database and plan a data migration before switching an existing installation.

For an existing installation, apply `migrations/20261123_remove_cycle_survey_snapshots.sql` to remove the obsolete cycle snapshot tables. Evaluator forms and results read the current active survey sections and questions.

## Install and run

From the repository root in PowerShell:

```powershell
py -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python backend\seed_admin.py
python backend\seed_admin.py
python backend\app.py
```

Each admin seed run prompts for an email and a password of at least 12 characters. Create two distinct super-admin accounts. The API listens on `127.0.0.1:5000`.

You can also start it from the `backend` directory with `python app.py`.

In another terminal, configure the root `.env.development` and run `npm run dev`. It points the frontend to Flask at `http://localhost:5000`.

For production, build the frontend with the root `.env.production` and run Flask with `APP_ENV=production` so it loads `backend/.env.production`. The host at `https://gsu.capsu.edu.ph` must route `/api/*` to the Flask API. `NEXT_PUBLIC_API_BASE_URL` is included in the frontend build, so set it before building; do not put secrets in frontend environment files.

## Bluehost cPanel static frontend

Run `npm run build` from the repository root. Next.js writes the static site to `out/`. In cPanel File Manager, upload the **contents** of `out/` (including `_next/`) into the domain's document root, usually `public_html/`. The build uses trailing slashes so Apache can serve each route's `index.html`.

The static frontend does not host the Flask API. Configure Bluehost or your API host to serve `/api/*` at `https://gsu.capsu.edu.ph`, or set `NEXT_PUBLIC_API_BASE_URL` in `.env.production` to the actual API origin before building. The API's `FRONTEND_ORIGINS` must include `https://gsu.capsu.edu.ph`.

Visit `/register` or select **Create evaluator account** on the sign-in page. Registration is limited to `@capsu.edu.ph` addresses and activates the account immediately. Enter your first and last name, then choose the role, office/unit memberships, campus/location, and service range. Names are saved to the `users` table. Role and service-range choices are provided by the backend; active campuses and offices come from the database. Selected memberships are stored in `user_office_assignments` and determine which offices/units the evaluator can evaluate.

The evaluation page lists only the offices/units assigned to the evaluator in `user_office_assignments`; unassigned targets cannot be opened or submitted directly. Evaluators can search and scroll their assigned offices/units. Super administrators can review the account email associated with each submission and retract a submission; retraction updates its aggregate counts and results.

Administrators can view office-level mean scores only. Super administrators can also view section means and each evaluator's mean score. The live standing page refreshes open-cycle results every ten seconds.

## Backend layout

- `app.py` creates the Flask app and installs middleware.
- `routes/auth.py`, `routes/admin.py`, and `routes/evaluator.py` handle their respective HTTP endpoints.
- `database.py` owns MySQL connections and query helpers.
- `eligibility.py` contains cycle-rule matching for administrative participation reporting. Evaluator access is not filtered by profile, campus, or assignment.
- `core.py` provides shared validation and API helpers to route modules.

## API groups

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/auth/registration-options`, `POST /api/auth/register`
- `GET/POST/PATCH /api/admin/campuses`, `/offices`, `/administrators`
- `GET/POST/PATCH/DELETE /api/admin/users`
- Admin accounts manage campuses, offices, users, surveys, cycles, participation, comments, and audit records.
- `GET /api/admin/standing` (aggregate mean for admins; section and evaluator means for super admins)
- Super-admin accounts are results-only: `/super_admin/standing` and `/super_admin/results`.
- `GET /api/admin/results/options` and `/api/admin/results` provide the cycle and target selections and detailed results for super admins.
- `GET/POST/PUT /api/admin/surveys` plus publish; survey edits update the same survey row
- `GET/POST /api/admin/cycles` plus rule, open, and close actions
- `GET /api/evaluator/targets`, `GET /api/evaluator/targets/{id}/form`
- `POST /api/evaluator/submit` (final; response body and user are not logged)
- `GET /api/admin/participation`, `/submissions`, `/results`, `/comments`, `/audit-log`
- `POST /api/admin/submissions/review`, `DELETE /api/admin/submissions`
- `POST /api/admin/comments/{id}/moderate`

Management endpoints require the `admin` role. The `super_admin` role can access only office standing and detailed results; it cannot manage system configuration or submissions.

## Production privacy and database permissions

The participation ledger stores the evaluator account and a random submission token. Answers, comments, and score summaries refer to that token so they can be reviewed and retracted, but contain no user ID or email. The answer review endpoint queries answer/comment rows by token without joining `participation` or `users`; it redacts email addresses from free text and never returns the token with answer content. Only super admins can access evaluator-level mean scores and the office standing evaluator breakdown. The delete endpoint retracts aggregate counts and deletes the participation row, which cascades to its linked answer, comment, and score rows. The account deletion path performs the same retraction for each of the evaluator's submissions.

The admin database account needs the permissions required by admin endpoints, including participation-token listing/deletion and answer/comment review. Restrict direct database access because the token can link a submission back to a participation row. The submit account needs setup-table reads and write access for `cycle_targets`, participation, answers, scores, tallies, counts, and comments. Evaluator targets are loaded from each user's `member` rows in `user_office_assignments`, with display details from `target_catalog`; when an evaluation is submitted, its target is linked to that cycle so administrative reporting includes it. Configure these separately with `ADMIN_DB_*` and `SUBMIT_DB_*`.

Survey scoring is configurable: scale/rating and Yes answers use the selected value multiplied by the question weight; choice questions use configured option points; text answers are unscored. Section scores are summed for the total, and the mean is the total divided by the number of sections.

The survey builder creates question sets only. Evaluation cycles can include every active target, but evaluators can open and submit only targets assigned to them as `member` in `user_office_assignments`. No additional profile, campus, or cycle-target eligibility rules are applied.

Disable access/request logging for `/api/evaluator/submit` at every production proxy and server layer, and do not log its body, IP, user agent, or authenticated user. Restrict MySQL logs and backups. These controls reduce linkage but do not prevent timing correlation by a fully privileged server or database operator. Individual results are released after the first response as configured; free-text answers may identify their author by content, so email addresses are redacted before results are returned.

Run backend tests from the repository root:

```powershell
python -m unittest discover -s backend\tests -t . -v
```
