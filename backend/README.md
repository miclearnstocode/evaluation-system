# Flask and XAMPP setup

## Database

1. Start MySQL in XAMPP.
2. In phpMyAdmin, import `schema.sql`. It creates the `evaluation_system` database.
3. Copy `.env.example` to `.env` and set a long random `SECRET_KEY`.
4. In phpMyAdmin, select `evaluation_system` and import `seed_capsu_data.sql`. The last query reports counts so you can verify the seeded records.

For an existing database, import `migrate_registration_options.sql` and `seed_capsu_data.sql` to add the database-backed registration choices. If `eval_cycles.target_type` is missing, import `migrate_cycle_target_type.sql` first; then import `migrate_cycle_all_targets.sql` so each cycle can include offices and administrators together.

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

In another terminal, run `npm run dev`. By default, Next.js proxies `/api/*` to `http://127.0.0.1:5000`. Override the upstream by setting `BACKEND_API_URL` before starting Next.js.

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

Participation, answer tallies, and comments are independent stores. Do not expose the participation ledger or join it to answer data in admin APIs. The admin DB account must not have `SELECT` on `participation`; grant it `SELECT` on the `participation_counts` view instead. It also needs `EXECUTE` on the `delete_evaluator_account` stored procedure. Create the procedure by running `schema.sql` as the database owner, then grant the app admin user permission, for example:

```sql
GRANT EXECUTE ON PROCEDURE evaluation_system.delete_evaluator_account
  TO 'evaluation_admin'@'localhost';
```

The procedure retracts the evaluator's aggregate contributions and comments, then removes their account and participation rows in one transaction. It returns no response content. The submit account needs the setup-table reads used to validate eligibility and insert access to the ledger, tallies, response counts, and comments. Configure these separately using `ADMIN_DB_*` and `SUBMIT_DB_*`.

The survey builder creates question sets only. Select the evaluation target type (office or administrator) when creating an evaluation cycle. On an existing installation, run `migrate_cycle_target_type.sql` once after backing up the database. It moves existing survey target types onto their cycles and removes the obsolete email-verification fields.

Disable access/request logging for `/api/evaluator/submit` at every production proxy and server layer, and do not log its body, IP, user agent, or authenticated user. Restrict MySQL logs and backups. These controls reduce linkage but do not prevent timing correlation by a fully privileged server or database operator. Free-text comments may identify their author by content.

Run backend tests from the repository root:

```powershell
python -m unittest discover -s backend\tests -t . -v
```
