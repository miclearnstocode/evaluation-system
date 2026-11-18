# Flask and XAMPP setup

## Database

1. Start MySQL in XAMPP.
2. In phpMyAdmin, import `schema.sql`. It creates the `evaluation_system` database.
3. Configure `backend/.env` for local development and set a long random `SECRET_KEY`.
4. In phpMyAdmin, select `evaluation_system` and import `seed_capsu_data.sql`. The last query reports counts so you can verify the seeded records.

For an existing database, import `migrate_registration_options.sql`, `migrate_evaluator_answers.sql`, `migrate_delete_account_answers.sql`, and `seed_capsu_data.sql` to add the database-backed registration choices and individual-answer storage. If you already created the earlier token-linked `evaluator_answers` draft table, import `migrate_evaluator_answers_private.sql` instead of `migrate_evaluator_answers.sql`. If `eval_cycles.target_type` is missing, import `migrate_cycle_target_type.sql` first; then import `migrate_cycle_all_targets.sql` so each cycle can include offices and administrators together.

## Install and run

From the repository root in PowerShell:

```powershell
py -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m backend.seed_admin
python -m backend.seed_admin
python -m backend.app
```

Each admin seed run prompts for an email and a password of at least 12 characters. Create two distinct super-admin accounts. The API listens on `127.0.0.1:5000`.

You can also start it from the `backend` directory with `python app.py`.

In another terminal, configure the root `.env.development` and run `npm run dev`. It points the frontend to Flask at `http://localhost:5000`.

For production, build the frontend with the root `.env.production` and run Flask with `APP_ENV=production` so it loads `backend/.env.production`. The host at `https://gsu.capsu.edu.ph` must route `/api/*` to the Flask API. `NEXT_PUBLIC_API_BASE_URL` is included in the frontend build, so set it before building; do not put secrets in frontend environment files.

## Bluehost cPanel static frontend

Run `npm run build` from the repository root. Next.js writes the static site to `out/`. In cPanel File Manager, upload the **contents** of `out/` (including `_next/`) into the domain's document root, usually `public_html/`. The build uses trailing slashes so Apache can serve each route's `index.html`.

The static frontend does not host the Flask API. Configure Bluehost or your API host to serve `/api/*` at `https://gsu.capsu.edu.ph`, or set `NEXT_PUBLIC_API_BASE_URL` in `.env.production` to the actual API origin before building. The API's `FRONTEND_ORIGINS` must include `https://gsu.capsu.edu.ph`.

Visit `/register` or select **Create evaluator account** on the sign-in page. Registration is limited to `@capsu.edu.ph` addresses and activates the account immediately. Choose the role, up to three Office/Unit memberships, campus/location, and service range. Registration choices are loaded from the database, and the backend stores memberships in `office_memberships` and derives which targets the evaluator can access.

The **Office Being Evaluated** list contains eligible targets in an open evaluation cycle. Create and publish a question survey, then choose the target type (office or administrator) when creating and opening a cycle.

## Backend layout

- `app.py` creates the Flask app and installs middleware.
- `routes/auth.py`, `routes/admin.py`, and `routes/evaluator.py` handle their respective HTTP endpoints.
- `database.py` owns MySQL connections and query helpers.
- `eligibility.py` applies cycle rules and profile-based target eligibility.
- `registration.py` defines CAPSU role, unit, location, and administrator seed data.
- `core.py` provides shared validation and API helpers to route modules.

## API groups

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/auth/registration-options`, `POST /api/auth/register`
- `GET/POST/PATCH /api/admin/campuses`, `/offices`, `/administrators`
- `GET/POST/PATCH/DELETE /api/admin/users`
- `GET/POST/PUT /api/admin/surveys` plus publish and clone actions
- `GET/POST /api/admin/cycles` plus rule, open, and close actions
- `GET /api/evaluator/targets`, `GET /api/evaluator/targets/{id}/form`
- `POST /api/evaluator/submit` (final; response body and user are not logged)
- `GET /api/admin/participation`, `/results`, `/comments`, `/audit-log`
- `POST /api/admin/comments/{id}/moderate`

## Production privacy and database permissions

Participation and evaluator answers are stored separately. `evaluator_answers` contains random response/answer IDs, but no evaluator email, user ID, or participation token. Admin result queries may show individual answers without identity; never return those random IDs or join them to `participation`. The identity-to-answer mapping remains in the restricted `submission_contributions` ledger. The admin DB account must not have `SELECT` on `participation` or `submission_contributions`; grant it `SELECT` on `participation_counts` and `evaluator_answers`. It also needs `EXECUTE` on the `delete_evaluator_account` stored procedure. Create the procedure by running `schema.sql` as the database owner, then grant the app admin user permission, for example:

```sql
GRANT SELECT ON evaluation_system.evaluator_answers
  TO 'evaluation_admin'@'localhost';
GRANT EXECUTE ON PROCEDURE evaluation_system.delete_evaluator_account
  TO 'evaluation_admin'@'localhost';
```

The procedure retracts the evaluator's aggregate contributions, individual answers, and comments, then removes their account and participation rows. It returns no response content. The submit account needs the setup-table reads used to validate eligibility and insert access to the ledger, individual answers, tallies, response counts, and comments. Configure these separately using `ADMIN_DB_*` and `SUBMIT_DB_*`.

The survey builder creates question sets only. Select the evaluation target type (office or administrator) when creating an evaluation cycle. On an existing installation, run `migrate_cycle_target_type.sql` once after backing up the database. It moves existing survey target types onto their cycles and removes the obsolete email-verification fields.

Disable access/request logging for `/api/evaluator/submit` at every production proxy and server layer, and do not log its body, IP, user agent, or authenticated user. Restrict MySQL logs and backups. These controls reduce linkage but do not prevent timing correlation by a fully privileged server or database operator. Individual results are released after the first response as configured; free-text answers may identify their author by content, so email addresses are redacted before results are returned.

Run backend tests from the repository root:

```powershell
python -m unittest discover -s backend\tests -t . -v
```
