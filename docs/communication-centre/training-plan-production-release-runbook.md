# Training Plan Production Release Runbook

## Purpose

This release completes the Training Plan persistence safety migration for normal UI flows.

- Normal Training Plan UI actions no longer use replace-all persistence through `POST /api/training-plan/`.
- `persistTrainingPlan` remains only as protected legacy/admin/debug code and migrated labels are blocked from using it.
- Normal user-facing UI, labels, modals, buttons, confirmations, archive/restore wording, ordering behavior, timeline calculations, KSB logic, tutor coverage logic, holiday logic, and display-order semantics should remain unchanged.
- Target environments must have these database migrations applied before order/archive behavior is used:
  - `api.0021_training_plan_display_order`
  - `api.0022_training_plan_archive_fields`

Do not create or apply the unrelated proposed `api.0023...` migration drift as part of this release.

## Deployment Setup Detected

- Backend: Django project under `backend/`, with `backend/manage.py`.
- Backend dependencies: `backend/req.txt`.
- Backend local helper: `backend/start_backend_8000.ps1`, which runs Django `runserver` locally. This is not a production service definition.
- Database config: `backend/backend/settings.py` loads `DATABASE_URL` for the default database, with PostgreSQL/Neon-compatible server-side cursor disabling.
- Additional database env vars may exist for routed external databases: `login_DATABASE_URL`, `safe_gaurding_database_url`, `SUPPORT_TICKETS_DATABASE_URL`, and `ofested_command_database_url`.
- Environment loading: default mode loads `backend/.env` and `backend/login/.env.login`; `DJANGO_ENV=local` loads local env files.
- Static files: `STATIC_ROOT = backend/staticfiles`; WhiteNoise is configured for static files.
- Frontend: Vite React app under `frontend/`.
- Frontend build output: `frontend/out/`, produced by `vite build`.
- Frontend scripts: `npm run type-check`, `npm run build`; on Windows dev machines use `npm.cmd run type-check` and `npm.cmd run build`.
- No Dockerfile, docker-compose file, nginx config, systemd service file, or Gunicorn config was found in this repo. Use the production host's existing service manager/deploy pipeline.

## Pre-Deployment Checks

Run these against the exact code and environment intended for staging/production.

```bash
git branch --show-current
git rev-parse HEAD
git status --short
```

Confirm the working tree contains only intended release changes.

Confirm the backend virtual environment:

```bash
cd backend
python --version
python -m pip freeze
python manage.py check
```

Confirm frontend dependencies:

```bash
cd frontend
npm ci
npm run type-check
npm run build
```

On Windows development verification:

```powershell
cd frontend
npm.cmd run type-check
npm.cmd run build
```

Confirm target environment variables before running migrations:

- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG=0` for production
- `DJANGO_ALLOWED_HOSTS`
- `DATABASE_URL`
- `login_DATABASE_URL` if login DB routing is used
- `safe_gaurding_database_url` or `SUPPORT_TICKETS_DATABASE_URL` if support ticket routing is used
- `ofested_command_database_url` if Ofsted DB routing is used
- any existing hosting-specific frontend/API proxy variables

Confirm the database target is the intended staging/production database:

```bash
cd backend
python manage.py dbshell
```

If possible, confirm no users are actively editing Training Plan during the deployment window. Tell users with old browser tabs open to refresh after deployment if they see stale-save or conflict messages.

## Database Backup

Take a backup before applying migrations.

For Neon-hosted Postgres, use the Neon dashboard or CLI workflow already approved for the environment:

- Confirm the project and branch are the intended production/staging branch.
- Create a restore point/backup before migrations.
- Record the backup/restore point identifier: `<backup id or URL>`.

Generic Postgres backup template using `DATABASE_URL`:

```bash
cd backend
pg_dump "$DATABASE_URL" --format=custom --file="<backup-directory>/communication-centre-$(date +%Y%m%d-%H%M%S).dump"
```

Windows PowerShell template:

```powershell
cd backend
pg_dump $env:DATABASE_URL --format=custom --file "<backup-directory>\communication-centre-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
```

Do not continue to migrations until the backup has completed and its location is recorded.

## Migration Plan

Preview planned migrations:

```bash
cd backend
python manage.py migrate --plan
```

Expected Training Plan migrations:

- `api.0021_training_plan_display_order`
- `api.0022_training_plan_archive_fields`

Apply migrations:

```bash
python manage.py migrate
```

Confirm migration state:

```bash
python manage.py showmigrations api
```

Confirm both are marked `[X]`:

- `[X] 0021_training_plan_display_order`
- `[X] 0022_training_plan_archive_fields`

Do not run `python manage.py makemigrations` in production. Existing unrelated model/migration drift may propose `api.0023_employee_eventdata_feedback_module_news_and_more.py`; do not create or apply that migration as part of this release.

## Backend Deployment Commands

Use the production host's normal process. Non-Docker template:

```bash
cd <release-root>/backend
source <venv-path>/bin/activate
python -m pip install -r req.txt
python manage.py check
python manage.py migrate --plan
python manage.py migrate
python manage.py showmigrations api
python manage.py collectstatic --noinput
sudo systemctl restart <backend-service>
sudo systemctl reload nginx
```

If the host uses Gunicorn directly, adapt the existing service command. Template only:

```bash
gunicorn backend.wsgi:application --chdir <release-root>/backend --bind 127.0.0.1:<port>
```

No Docker files were found in this repo. If the real production environment wraps this project in Docker outside the repo, use that external pipeline and run the same Django checks/migrations inside the release container:

```bash
python manage.py check
python manage.py migrate --plan
python manage.py migrate
python manage.py showmigrations api
```

## Frontend Deployment Commands

Build from `frontend/`:

```bash
cd frontend
npm ci
npm run type-check
npm run build
```

Windows development verification:

```powershell
cd frontend
npm.cmd run type-check
npm.cmd run build
```

Deploy the generated `frontend/out/` assets according to the existing hosting setup, CDN, static host, or reverse proxy. Do not deploy stale assets from a previous build.

## Browser Smoke Test Checklist

Use staging or test/non-critical Training Plan data where writes are needed.

1. Log in as a user who can manage Training Plan data.
2. Open the Training Plan page.
3. In browser Network tools, confirm `GET /api/training-plan/` returns `200`.
4. Confirm the timeline loads.
5. Edit cohort metadata on test/non-critical data.
6. Add a module for a tutor on test/non-critical data.
7. Edit a linked module name on test/non-critical data.
8. Add a test cohort if safe.
9. Archive/delete a test cohort if safe.
10. Restore manually only if needed using the backend restore endpoint.
11. Edit programme metadata on test/non-critical data.
12. Reorder a harmless row if safe.
13. Refresh the page and confirm data persists.
14. Confirm no unexpected UI wording or behavior changed.
15. Confirm no normal UI action calls `POST /api/training-plan/`.

Manual restore endpoint examples, only if needed:

```bash
curl -X PATCH "<base-url>/api/training-plan/cohorts/<cohort_id>/restore/" \
  -H "Content-Type: application/json" \
  -d '{"programmeId":"<programme_id>","version":"<current-version>"}'
```

```bash
curl -X PATCH "<base-url>/api/training-plan/modules/restore/" \
  -H "Content-Type: application/json" \
  -d '{"moduleName":"<module-name>","version":"<current-version>"}'
```

## Log Monitoring Checklist

Monitor backend, proxy, frontend hosting, and browser console logs for:

- HTTP `500`
- unexpected `400`
- unexpected `403`
- repeated `409` conflicts
- `LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED`
- `COHORT_ADD_SCOPED_CREATE_BLOCKED`
- `MODULE_ADD_FOR_TUTOR_SCOPED_CREATE_BLOCKED`
- `PROGRAMME_EDIT_LINKED_ROWS_PARTIAL_BLOCKED`
- archive/restore/order column errors, especially missing `programme_display_order`, `cohort_display_order`, `is_archived`, `archived_at`, `archived_by`, or `archive_reason`

## Expected Behavior

- A `409` may be expected from stale tabs and should protect newer data from overwrite.
- Blocked-save warnings mean an unsafe payload was prevented.
- `LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED` should not appear during normal UI use.
- Normal users should not see archive/restore wording.
- Old browser tabs may need refresh after deployment.
- Normal Training Plan UI wording and interaction behavior should remain unchanged.

## Rollback Plan

Record before deployment:

- Previous git commit/hash: `<previous-commit>`
- New git commit/hash: `<release-commit>`
- Database backup location/id: `<backup id or path>`
- Frontend artifact/build id: `<frontend build id>`

Code rollback:

```bash
git checkout <previous-commit>
```

Frontend rollback:

- Redeploy the previous known-good frontend artifact, or rebuild from `<previous-commit>` and redeploy `frontend/out/`.

Backend rollback:

- Redeploy backend code from `<previous-commit>`.
- Restart the backend service:
  ```bash
  sudo systemctl restart <backend-service>
  sudo systemctl reload nginx
  ```

Database rollback caution:

- Migrations `0021` and `0022` add columns needed by this release. Rolling code back after these migrations may be safer than rolling the database back.
- Prefer a forward fix for code issues when migrations have already been applied.
- Use the database backup only with care and only if data corruption occurs or the release owner explicitly approves database restore.
- If restoring the database, stop writes first and follow the hosting provider's approved Postgres/Neon restore procedure.

## Go/No-Go Checklist

Go only when every item is true:

- Backend tests pass.
- Frontend type-check passes.
- Frontend build passes.
- `python manage.py migrate --plan` has been reviewed and understood.
- Database backup is complete and recorded.
- `api.0021_training_plan_display_order` is applied and confirmed `[X]`.
- `api.0022_training_plan_archive_fields` is applied and confirmed `[X]`.
- Browser smoke tests pass.
- Logs are clean after smoke testing.
- No normal UI replace-all path is found.
- No `LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED` appears during normal UI smoke tests.

No-go if:

- `GET /api/training-plan/` returns `500`.
- Required columns are missing after migration.
- Normal UI actions call `POST /api/training-plan/`.
- Repeated unexpected `403` or `409` errors appear for fresh tabs.
- Any data corruption or unexpected archive/order behavior is observed.
