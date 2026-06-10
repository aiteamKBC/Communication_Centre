# Training Plan Deployment Safety Checklist

This checklist is for the final Training Plan persistence hardening deployment. It should not introduce any normal user-facing UI change.

## Before Deployment

1. Record the git commit/hash being deployed: `<commit-hash>`.
2. Take a database backup before deployment: `<backup command or backup location>`.
3. Check pending migrations in the target environment:
   ```bash
   python manage.py migrate --plan
   ```
4. Confirm the required Training Plan migrations are pending or already applied:
   - `api.0021_training_plan_display_order`
   - `api.0022_training_plan_archive_fields`
5. Apply required migrations in the target environment before using order/archive behavior:
   ```bash
   python manage.py migrate api
   ```
6. Confirm migration state:
   ```bash
   python manage.py showmigrations api
   ```
7. Restart the backend cleanly.
8. Deploy the frontend build.

Do not run `makemigrations` as part of production deployment. Existing unrelated model drift may still cause `makemigrations --check --dry-run` to propose a later `0023...` migration; that drift is not part of this deployment.

## Browser Smoke Test

Use test or non-critical Training Plan data where a write is needed.

1. Open Training Plan.
2. Confirm the initial load uses `GET /api/training-plan/`.
3. Reorder a harmless row if safe; confirm it uses the scoped reorder endpoint.
4. Edit cohort metadata; confirm it persists after refresh.
5. Add a module for a tutor on test/non-critical data.
6. Edit a linked module name on test/non-critical data.
7. Add a test cohort if safe.
8. Archive/delete a test cohort if safe.
9. Call a restore endpoint manually only if needed for recovery/testing.
10. Edit programme metadata on test/non-critical data.
11. Refresh the page and confirm the changed data persists.

During smoke testing, no normal UI action should call `POST /api/training-plan/`.

## Expected User Impact

- No UI changes.
- No new confirmation steps.
- No new visible archive/restore wording for normal users.
- Old open browser tabs may need a refresh after deployment.
- Stale saves should return `409` instead of overwriting newer data.

## Monitoring

After deployment, monitor backend and frontend logs for:

- `500`
- `409`
- blocked-save warnings
- `LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED`

Any `LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED` entry should be investigated. Normal migrated Training Plan UI flows should use scoped endpoints and should not trigger replace-all persistence.

## Rollback Preparation

- Database backup: `<backup command or backup location>`.
- Deployed git commit/hash: `<commit-hash>`.
- Code rollback: revert the frontend/backend deployment to the previous known-good commit and redeploy both services.
- Database rollback: plan carefully if migrations have already been applied. Do not assume code rollback and database rollback are interchangeable.
