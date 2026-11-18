# Flask and XAMPP setup

## Database

1. Start MySQL in XAMPP.
2. In phpMyAdmin, import `database-schema.sql`. It creates the `evaluation_system` database and the new target-based schema.
3. Configure `backend/.env` for local development and set a long random `SECRET_KEY`.
4. Run `python backend\seed_admin.py` twice to create two distinct super-admin accounts. Add campuses and evaluation targets from the admin catalog pages.

For a visual relationship diagram and explanations of every table, view, and stored procedure, see [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

`database-schema.sql` is a fresh-install schema, not an in-place migration. Do not import it over a database containing existing tables or data. Back up the existing database and plan a data migration before switching an existing installation.

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

Visit `/register` or select **Create evaluator account** on the sign-in page. Registration is limited to `@capsu.edu.ph` addresses and activates the account immediately. Choose the role, up to three target assignments, campus/location, and service range. Role and service-range choices are provided by the backend; active campuses and targets come from the database. Assignments are stored in `user_office_assignments`.

The **Office Being Evaluated** list contains eligible targets in an open evaluation cycle. Create and publish a question survey, then open a cycle to include all active targets from the six target categories.

## Backend layout

- `app.py` creates the Flask app and installs middleware.
- `routes/auth.py`, `routes/admin.py`, and `routes/evaluator.py` handle their respective HTTP endpoints.
- `database.py` owns MySQL connections and query helpers.
- `eligibility.py` applies cycle rules and profile-based target eligibility.
- `registration.py` derives evaluator groups from the selected role and target assignments.
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
- `GET /api/admin/participation`, `/submissions`, `/results`, `/comments`, `/audit-log`
- `POST /api/admin/submissions/review`, `DELETE /api/admin/submissions`
- `POST /api/admin/comments/{id}/moderate`

## Production privacy and database permissions

The participation ledger stores the evaluator account and a random submission token. Answers, comments, and score summaries refer to that token so they can be reviewed and retracted, but contain no user ID or email. The review endpoint queries answer/comment rows by token without joining `participation` or `users`; it redacts email addresses from free text and never returns the token with answer content. The delete endpoint retracts aggregate counts and deletes the participation row, which cascades to its linked answer, comment, and score rows. The account deletion path performs the same retraction for each of the evaluator's submissions.

The admin database account needs the permissions required by admin endpoints, including participation-token listing/deletion and answer/comment review. Restrict direct database access because the token can link a submission back to a participation row. The submit account needs setup-table reads and write access for participation, answers, scores, tallies, counts, and comments. Configure these separately with `ADMIN_DB_*` and `SUBMIT_DB_*`.

Survey scoring is configurable: scale/rating and Yes answers use the selected value multiplied by the question weight; choice questions use configured option points; text answers are unscored. Section scores are summed for the total, and the mean is the total divided by the number of sections.

The survey builder creates question sets only. Evaluation cycles can include every active target, with eligibility controlled by cycle rules, campus, central status, evaluator role, and target assignments.

Disable access/request logging for `/api/evaluator/submit` at every production proxy and server layer, and do not log its body, IP, user agent, or authenticated user. Restrict MySQL logs and backups. These controls reduce linkage but do not prevent timing correlation by a fully privileged server or database operator. Individual results are released after the first response as configured; free-text answers may identify their author by content, so email addresses are redacted before results are returned.

Run backend tests from the repository root:

```powershell
python -m unittest discover -s backend\tests -t . -v
```
