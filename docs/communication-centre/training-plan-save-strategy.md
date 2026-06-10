# Training Plan Save Strategy

Production release steps for this persistence safety work are documented in [Training Plan Production Release Runbook](./training-plan-production-release-runbook.md).

## Current Legacy Behaviour

`POST /api/training-plan/` remains available as a protected legacy/admin/debug fallback. It requires an explicit internal/admin/debug flag, rejects migrated source labels, validates the submitted Training Plan version, rejects stale writes, rejects empty saves unless admin recovery is explicitly confirmed, and rejects suspicious partial payloads.

When accepted, the legacy endpoint still replaces the whole `Training_plan` table contents: it deletes all current rows inside a transaction and recreates rows from the frontend payload. That is why audit logs can show misleading summaries such as `117 added, 117 removed` even when a user changed one field.

This legacy flow is intentionally kept only as protected recovery/admin/debug code while normal UI actions use scoped endpoints or block unsafe saves.

## Model And Identifier Findings

The Training Plan backend uses an unmanaged Django model mapped to the existing `Training_plan` table. Serialization and validation are implemented as helper functions in `backend/api/views.py`; there are no DRF serializer classes for this area.

Stable identifiers found:

- Training Plan row/session block: `TrainingPlan.id` exists and is serialized as `id`.
- Tutor profile: `TutorProfile.id` exists.
- KSB profile: `KsbProfile.id` exists.
- Module catalogue: `Module.module_id` exists for catalogue modules, and `TrainingPlanModuleDefinition.module_id` exists for custom module definitions.
- Programme config: `TrainingPlanProgramConfig.program_id` exists.
- Cohort/group/module UI identifiers are persisted inside notes markers, but they are not independent database rows.
- Coverage data and KSB mappings are arrays stored inside one `Training_plan` row as JSON. They are addressed safely by Training Plan row id plus `sessionNumber`.

Limitation: there is no separate database table or primary key for an individual generated session occurrence, cohort, or group. Do not invent fake identifiers for those scopes.

Order persistence added in this phase:

- `Training_plan.programme_display_order` stores explicit programme display order.
- `Training_plan.cohort_display_order` stores explicit cohort display order within a programme.
- Both fields are nullable integers for backward compatibility.
- The migration backfills only rows where an order value is missing, using current row display order derived from programme/cohort identity and first existing row position.
- Existing rows are updated in place. The migration does not delete, recreate, recalculate, or rewrite session/module data.

This location was chosen because there is still no normalized programme/cohort instance table for generated timeline rows. Duplicating the same order value across rows in a programme/cohort is not ideal, but it is the safest compatible model until a dedicated cohort/programme persistence model exists.

Archive persistence added in this phase:

- `Training_plan.is_archived` marks rows hidden from the normal Training Plan view.
- `Training_plan.archived_at` stores when the archive happened.
- `Training_plan.archived_by` stores the available user header identity when present.
- `Training_plan.archive_reason` stores the archive reason used by the scoped endpoint.
- Normal `GET /api/training-plan/` excludes archived rows.
- `GET /api/training-plan/?includeArchived=1` can include archived rows for admin/debug inspection.
- Legacy full-save now deletes/recreates only non-archived rows, so previously archived rows are preserved if a broad legacy flow still runs.

This model was chosen because cohort and linked-module archive both operate on existing `Training_plan` rows. It preserves the original rows and all session/module data in place while hiding archived rows from normal timeline reconstruction.

## New Partial Update Behaviour

The following partial endpoints were added alongside the legacy full-save endpoint:

- `PATCH /api/training-plan/sessions/<id>/`
- `PATCH /api/training-plan/sessions/<id>/coverage/`
- `PATCH /api/training-plan/sessions/<id>/ksb/`
- `PATCH /api/training-plan/modules/<id>/`
- `PATCH /api/training-plan/reorder/programmes/`
- `PATCH /api/training-plan/reorder/cohorts/`
- `PATCH /api/training-plan/cohorts/<cohort_id>/`
- `PATCH /api/training-plan/cohorts/<cohort_id>/archive/`
- `PATCH /api/training-plan/modules/archive/`
- `PATCH /api/training-plan/cohorts/<cohort_id>/restore/`
- `PATCH /api/training-plan/modules/restore/`
- `PATCH /api/training-plan/programmes/<programme_id>/linked-rows/`
- `GET /api/health/`

Partial updates:

- require the current Training Plan version
- return `409 Conflict` for stale versions
- return the latest version after success
- lock and update only the target `Training_plan` row
- never call the legacy replace-all code
- never bulk delete or recreate unrelated Training Plan rows
- validate tutor profile ids and coverage tutor ids
- validate reorder ids, reject missing ids, duplicate ids, unknown ids, cross-scope cohort ids, and stale versions
- validate cohort edit scopes, reject missing stable ids, unknown row ids, cross-scope row ids, incomplete scope payloads, ambiguous module/session edits, and stale versions
- validate archive scopes, reject missing row ids, unknown row ids, cross-scope row ids, incomplete scope payloads, and stale versions
- validate restore scopes, reject missing or unsafe identifiers, reject stale versions, and never restore archived rows globally
- normalize empty values, coverage fields, and KSB codes
- deduplicate KSB codes
- write targeted audit logs such as `Tutor Coverage updated for session <id>`, `KSB Mapping updated for session <id>`, and `Session notes updated for session <id>`

## UI Actions Migrated

Migrated:

- Tutor Coverage modal save now uses `PATCH /api/training-plan/sessions/<id>/coverage/` when the existing Training Plan row id is available.
- Session Schedule `Edit Schedule` now uses `PATCH /api/training-plan/sessions/<id>/` when the existing Training Plan row id is available and the change is limited to direct row schedule fields: start date, end date, weekday, start time, end time, tutor, and coach.
- Session Schedule `Edit Notes` and `Edit KSB` are high-frequency isolated actions and use row-level partial endpoints when the existing Training Plan row id is available.
- Simple module edits in the cohort module editor now use `PATCH /api/training-plan/modules/<id>/` when the loaded module has a stable `trainingPlanId` and the draft changes are limited to module name, assigned tutor, module color, and module notes.
- Programme drag/drop reorder now uses `PATCH /api/training-plan/reorder/programmes/` for programmes represented by persisted Training Plan rows.
- Cohort drag/drop reorder within the same programme now uses `PATCH /api/training-plan/reorder/cohorts/`.
- Cross-programme cohort drag/drop is blocked because it changes programme membership, not just display order.
- Existing cohort metadata edits now use `PATCH /api/training-plan/cohorts/<cohort_id>/` when the edit is limited to cohort-level metadata and every active row in the cohort has a stable `trainingPlanId`.
- Cohort delete now archives all active rows in the requested programme/cohort scope with `PATCH /api/training-plan/cohorts/<cohort_id>/archive/`.
- Catalogue module delete now archives linked active Training Plan rows by module scope with `PATCH /api/training-plan/modules/archive/` when all linked blocks have stable `trainingPlanId` values.
- Catalogue module rename propagation now uses `PATCH /api/training-plan/modules/linked-rows/` for linked active Training Plan rows when each linked block has stable row, programme, cohort, and block identifiers.
- Add module for tutor now uses `POST /api/training-plan/modules/add-for-tutor/` to create only the new calculated module row when stable programme, cohort, group, block, module, and tutor identifiers are available.
- Cohort add now uses `POST /api/training-plan/cohorts/` to create only the new calculated cohort rows when stable programme, cohort, group, and block identifiers are available.
- Programme metadata propagation now uses `PATCH /api/training-plan/programmes/<programme_id>/linked-rows/` for linked active Training Plan rows when every active row in the programme has a stable `trainingPlanId` and matching `__program_id:<programme_id>` marker.

The frontend carries the serialized database row id into each loaded module block as `trainingPlanId`. Isolated partial actions for new/generated blocks without a stable database id are blocked and do not fall back to `POST /api/training-plan/`. The protected legacy function remains in the file for migration safety, but current normal Training Plan UI actions do not call it. If a future caller is introduced, migrated source labels are blocked and the legacy replace-all path requires an explicit internal/admin/debug flag.

Not migrated in the follow-up pass:

- KSB Mapping controls inside the cohort/module draft editor and module catalogue editor were inspected but left on legacy/full catalogue paths. Those controls can be bundled with session count, dates, tutor, group time, catalogue names, session names, or generated end dates before the outer save button, so they are not isolated single-row actions.
- Notes controls inside the cohort/module draft editor were inspected but left on their existing broader paths when bundled with unsafe module/cohort changes. The isolated Schedule Table notes action is already partial.
- Tutor/coach assignment inside group-level cohort editing was inspected but left legacy because changing a group coach/time/day can affect multiple module blocks and generated rows. The isolated Schedule Table tutor/coach assignment action is partial.

Even though loaded blocks now carry `trainingPlanId`, these UI flows can include multiple pending changes in one draft. Sending only KSB or notes through a partial endpoint from those modals would risk saving one part while silently leaving other draft changes unsaved.

## Release Summary - Partial Save Milestone

Ready-for-release scope:

- Migrated high-frequency isolated actions to partial endpoints: Session Schedule edits, Schedule Table tutor/coach assignment, Session Notes, Session KSB Mapping, Tutor Coverage for persisted rows, and isolated existing-module edits including module color metadata.
- Browser Network verification passed for migrated high-frequency actions. Each verified action called its PATCH endpoint and did not call `POST /api/training-plan/`.
- `tutor_coverage_missing_trainingPlanId` is fixed by blocking the missing-id case with `TUTOR_COVERAGE_PARTIAL_SAVE_BLOCKED_MISSING_TRAINING_PLAN_ID`; it no longer falls back to legacy full save.
- Programme and same-programme cohort reorder now use scoped PATCH endpoints backed by explicit order columns. Browser Network verification for these newest reorder endpoints still needs to be performed in Chrome.
- Cohort delete and linked module Training Plan row removal now archive rows in place instead of removing them from a replace-all payload.
- No normal frontend Training Plan action currently calls `POST /api/training-plan/`. Programme metadata propagation no longer uses replace-all. Cross-programme cohort moves are blocked rather than saved.

Production deployment notes:

- Deploy backend and frontend together so the new PATCH endpoints, frontend save routing, stale-version handling, and audit labels are aligned.
- Backward-compatible schema migrations add nullable order columns, backfill missing order values in place, and add archive fields with safe defaults.
- Keep the legacy full-save endpoint available as protected migration/recovery code until it can be removed safely.
- After deployment, use browser Network verification on a safe cohort to confirm migrated actions use PATCH only, and monitor audit logs for `LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED` source labels.

## UI Actions Not Using Legacy Full-Save

Current normal Training Plan UI actions either use scoped endpoints, save non-`Training_plan` support tables, or block when required stable identifiers are missing. They do not use the legacy replace-all endpoint.

- cross-programme cohort moves
- broad module regeneration
- holiday changes
- Session KSB Mapping in the cohort/module editor
- session/module notes in the cohort/module editor when bundled with broader unsafe module changes
- session date/time/tutor edits made through the full cohort editor, when bundled with broader module, group, holiday, or recalculation changes
- module metadata edits that change dates, session count, KSB mapping, placement, generated end date, or any broader cohort/group data
- module color changes made through catalogue/shared-module flows that propagate to existing timeline rows

TODO: continue introducing narrower editing surfaces for remaining module metadata after the UI can target a stable database row or persisted database-backed entity without triggering generated timeline recalculation.

## Backend Restart Protection

`GET /api/health/` returns:

```json
{
  "status": "ok",
  "service": "communication-centre-backend"
}
```

Training Plan frontend requests treat network failures and `502`, `503`, or `504` as temporary backend unavailability. The UI separates those outages from `409 Conflict`, explains that Training Plan data has not been deleted, disables edit/save entry points while the backend is unavailable, checks `/api/health/` for recovery, and shows `Reload latest data` after recovery. Failed saves are not retried automatically.

## Test Notes

Backend tests cover partial KSB, coverage, notes, module edits, programme reorder, cohort reorder, cohort metadata edit, cohort archive, module archive, cohort restore, module restore, normal GET excluding archived rows before restore and including restored rows after restore, `includeArchived=1`, missing/duplicate/unknown/cross-scope ids, stale version, unknown id, health, and legacy full-save protections. The backend test runner now provisions the unmanaged legacy `News`, `Training_plan`, and `Modules` tables only inside disposable `test_*` databases, so the suite can start and execute Training Plan regression tests safely.

## Data Safety Confirmation

The partial update endpoints must not affect existing production data beyond the targeted row and allowed fields. Reorder endpoints update only `programme_display_order` or `cohort_display_order`. Cohort metadata edit updates only `cohort_name`, `starting_date_lable`, `group_name`, `coach_name`, `ksb_profile_id`, and cohort/group notes metadata markers for active rows in the target cohort. Archive endpoints update only `is_archived`, `archived_at`, `archived_by`, and `archive_reason`. Restore endpoints update only the same archive fields in reverse for already archived rows. They do not include destructive schema changes, table truncation, data regeneration, field removal, row deletion, row recreation, timeline recalculation, or catalogue propagation.

The legacy full-save endpoint remains only as a protected fallback during migration.

This high-frequency action pass added backward-compatible order/archive migrations, no destructive migration, no row deletion, no replace-all behavior for migrated reorder/archive actions, and no GitHub push. Broader recalculation-sensitive flows remain intentionally untouched.

## Legacy Full-Save Map

### Definition

In this project, "legacy full-save" means the frontend sends a complete Training Plan payload to `POST /api/training-plan/`. The backend validates the payload and version, enters a transaction, deletes all existing `Training_plan` records, and recreates rows from the submitted payload.

This means the delete/recreate-all problem is not fully solved for every Training Plan save. It is solved only for the specific UI action currently migrated to a partial endpoint.

### Backend Code Path

- URL: `POST /api/training-plan/`
- Route: `backend/api/urls.py` -> `path('training-plan/', training_plan, name='training-plan')`
- Handler: `backend/api/views.py` -> `training_plan(request)`
- Replace-all path:
  - validates request body contains `items`
  - calculates `current_version`
  - checks submitted `version`
  - rejects missing/stale versions with `409 Conflict`
  - rejects empty payloads unless admin recovery is confirmed
  - rejects suspicious partial payloads when current count is large and incoming count is too small
  - enters `transaction.atomic()`
  - locks current rows with `TrainingPlan.objects.select_for_update().order_by('id')`
  - re-checks locked version
  - calls `TrainingPlan.objects.all().delete()`
  - recreates rows with `TrainingPlan.objects.create(**item)` in a loop
  - writes legacy audit action `replace` with added/removed diff counts

The exact destructive operation is `TrainingPlan.objects.all().delete()` inside the transaction. No partial endpoint calls this code path.

### Legacy Safeguards

The legacy endpoint is protected by:

- required Training Plan version
- stale update `409 Conflict`
- locked-row version re-check with `select_for_update`
- empty payload rejection
- suspicious partial-save rejection
- transaction wrapping with `transaction.atomic`
- admin recovery token requirement for intentional empty recovery
- audit rejection logs for blocked saves

These safeguards reduce data-loss risk, but they do not change the fact that accepted legacy saves still delete and recreate all `Training_plan` rows.

### Legacy Visibility Added

Backend logging now emits warning-level metadata whenever the legacy full-save endpoint is triggered. The log label is:

- `LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED`

The backend log includes only operational metadata, not the full payload and not learner data:

- user id/name/email/display name from request headers when available
- request path and method
- frontend save source header when available
- incoming item count
- current `Training_plan` row count before delete
- submitted payload version
- current server version
- accepted/rejected state
- rejection reason when rejected
- row count after recreate when accepted

The frontend now blocks `persistTrainingPlan` unless a caller explicitly opts into the protected legacy/admin/debug path. Migrated source labels are rejected before a network request. If the protected path is ever intentionally used, the frontend emits a developer-facing console warning before `POST /api/training-plan/`:

- `LEGACY_TRAINING_PLAN_FULL_SAVE_USED`

The warning includes the source label, payload item count, reason/source, and a reminder that the endpoint deletes and recreates Training Plan rows after safeguards pass. The request also sends `X-KBC-Training-Plan-Save-Source` and the explicit legacy replace-all flag so backend logs can correlate the trigger. This warning is not shown to normal users.

Tutor Coverage now has an additional blocked-save warning when it cannot use the partial endpoint because a stable row id is missing:

- `TUTOR_COVERAGE_PARTIAL_SAVE_BLOCKED_MISSING_TRAINING_PLAN_ID`

The missing-id case does not call `persistTrainingPlan` and does not call `POST /api/training-plan/`.

Current frontend legacy source labels:

- `unknown_legacy_save` for future or unclear call sites. The known programme-linked source `programme_edit_linked_timeline_rows` is now a scoped PATCH source header, not a legacy full-save caller.

### Partial Update Endpoints

Partial endpoints currently available:

- `PATCH /api/training-plan/sessions/<id>/`
  - Allowed fields: `startDate`, `endDate`, `sessionStartTime`, `sessionEndTime`, `sessionWeekDay`, `tutorProfileId`, `tutorName`, `notes`, `coachName`
  - Updates only the target `Training_plan` row.
  - Returns latest Training Plan version.
  - Stale version returns `409 Conflict`.
  - Unknown id returns `404`.
  - Schedule-field audit label is `SESSION_SCHEDULE_PARTIAL_UPDATE session <id>`.
  - Assignment-only audit label is `SESSION_ASSIGNMENT_PARTIAL_UPDATE session <id>`.
  - Notes-only audit label is `SESSION_NOTES_PARTIAL_UPDATE session <id>`.
  - Notes updates preserve existing metadata markers such as `__module_color:`.

- `PATCH /api/training-plan/sessions/<id>/coverage/`
  - Allowed fields: `sessionNumber`, `assignedTutorProfileId`, `coverageTutorProfileId`, `coverageStatus`, `tutorUnavailable`, `tutorUnavailableReason`, `tutorUnavailableNotes`, `coverageReason`, `coverageNotes`
  - Updates only `session_coverage_json` on the target `Training_plan` row.
  - Does not delete or recreate unrelated rows.
  - Audit label is `Tutor Coverage updated for session <id>`.

- `PATCH /api/training-plan/sessions/<id>/ksb/`
  - Allowed fields: `sessionNumber`, `knowledgeCodes`, `skillCodes`, `behaviourCodes`
  - Updates only `session_ksb_json` on the target `Training_plan` row.
  - Normalizes and deduplicates KSB codes.
  - Audit label is `SESSION_KSB_PARTIAL_UPDATE session <id>`.

- `PATCH /api/training-plan/modules/<id>/`
  - Allowed fields: `moduleName`, `tutorProfileId`, `tutorName`, `notes`, `color`
  - Updates only the target `Training_plan` row.
  - Module color is persisted through the existing `__module_color:` notes marker because there is no standalone `Training_plan` color column.
  - The frontend preserves notes metadata markers when sending module notes, so row/block identifiers, colors, and holiday metadata are not stripped.
  - Does not update dates, session counts, KSB mappings, group/cohort metadata, or generated timeline calculations.
  - Audit label is `MODULE_PARTIAL_UPDATE module <id>`.

- `PATCH /api/training-plan/modules/linked-rows/`
  - Used by `module_edit_linked_timeline_rows` when a catalogue module rename needs to update linked timeline rows.
  - Allowed fields: `version`, `moduleCatalogueId`, `previousModuleName`, `moduleName`, `linkedRows`.
  - Required identifiers in each `linkedRows[]` item: `trainingPlanId`, `programmeId`, `cohortId`, and `blockId`; `groupId` is also checked when present.
  - Updates only `module_name` on existing active, non-archived `Training_plan` rows whose row id, previous module name, programme id, cohort id, block id, and optional group id match the submitted identifiers.
  - Preserves row ids, cohort/programme fields, dates, times, weekdays, session counts, display order, archive fields, KSB JSON, coverage JSON, visible notes, and unrelated cohort/group metadata.
  - Rejects missing, duplicate, ambiguous, unknown, archived, cross-scope, and stale-version requests with no legacy `POST /api/training-plan/` fallback.
  - Returns `updated_count`, identifiers used for matching, latest items, and latest Training Plan version.
  - Audit label is `MODULE_LINKED_ROWS_PARTIAL_UPDATE`; backend metadata/log action name is `module_edit_linked_timeline_rows_partial_update`.
  - Normal user-facing UI, labels, modal behavior, confirmation flow, ordering, timeline calculations, and success experience are unchanged.

- `PATCH /api/training-plan/programmes/<programme_id>/linked-rows/`
  - Used by `programme_edit_linked_timeline_rows` when an existing programme edit needs to propagate the programme display label to linked timeline rows.
  - Allowed fields: `version`, `programmeId`, `program`, and `trainingPlanIds`.
  - Required identifiers: stable URL `programme_id`, matching payload `programmeId` when supplied, every active linked row's `trainingPlanId`, and matching `__program_id:<programme_id>` marker on every active row in that programme scope.
  - Updates only `program` and the existing programme metadata marker `__program_id:<programme_id>` on matching active, non-archived `Training_plan` rows.
  - Preserves row ids, cohort/group/module/tutor/session/schedule fields, display order, archive fields, KSB JSON, coverage JSON, visible notes, module color markers, cohort color markers, holiday markers, and cohort end-date markers.
  - Rejects missing or inconsistent programme markers, stale versions, archived/unknown/cross-scope row ids, incomplete scope payloads, full-save-shaped payloads, and unrelated mutation/archive/restore fields.
  - Returns `programme_id`, `updated_count`, identifiers used, `allowedFieldsUpdated`, latest items, and latest Training Plan version.
  - Audit label is `PROGRAMME_LINKED_ROWS_PARTIAL_UPDATE`; backend metadata/log action name is `programme_edit_linked_timeline_rows_partial_update`.
  - Normal user-facing UI, labels, modal behavior, confirmation flow, ordering, timeline calculations, validation behavior, and success experience are unchanged. There is no legacy `POST /api/training-plan/` fallback.

- `POST /api/training-plan/modules/add-for-tutor/`
  - Used by `module_add_for_tutor` from the Tutor Profiles add-module flow.
  - Allowed fields: `version`, `programmeId`, `cohortId`, `groupId`, `blockId`, `moduleCatalogueId` or `moduleStableId`, `tutorProfileId`, and one generated `row`.
  - Required identifiers: `programmeId`, `cohortId`, `groupId`, `blockId`, module identity, `tutorProfileId`, and current Training Plan version.
  - The submitted `row` must be a single new flattened Training Plan row with no existing row id and matching metadata markers: `__program_id:`, `__cohort_id:`, `__group_id:`, and `__block_id:`.
  - Creates only one new active `Training_plan` row using the same frontend-calculated values the legacy flow produced: programme/cohort/group metadata, module name, tutor/coach fields, dates, times, weekdays, session count, KSB JSON, coverage JSON, KSB profile id, notes metadata markers, module color marker, and display order for the new row.
  - Does not update, delete, recreate, archive, restore, or reorder existing rows. Existing display order values are preserved.
  - Duplicate safety: if an identical active row already exists for the same programme/cohort/group/block identifiers, the endpoint returns `created_count: 0` and `skipped_count: 1` with the latest items instead of creating a duplicate. If the same identifiers exist with different values, it returns `400`.
  - Rejects missing identifiers, full-save-shaped payloads, unrelated existing row ids, archive/restore intent, unknown tutor profiles, missing cohort scope, and stale versions.
  - Returns `created_count`, `skipped_count`, created/skipped row ids, identifiers used, latest items, and latest Training Plan version.
  - Audit label is `MODULE_ADD_FOR_TUTOR_SCOPED_CREATE`; backend metadata/log action name is `module_add_for_tutor_scoped_create`.
  - Normal user-facing UI, labels, modal behavior, confirmation flow, ordering, timeline calculations, and success experience are unchanged. There is no legacy `POST /api/training-plan/` fallback.

- `POST /api/training-plan/cohorts/`
  - Used by `cohort_add` from the existing Add New Cohort modal flow.
  - Allowed fields: `version`, `programmeId`, `cohortId`, and generated `rows`.
  - Required identifiers: current Training Plan `version`, `programmeId`, generated stable `cohortId`, and for every submitted row matching notes metadata markers `__program_id:`, `__cohort_id:`, `__group_id:`, and `__block_id:`.
  - `rows` must contain only the newly generated flattened Training Plan rows for that cohort. Rows must not include existing Training Plan row ids.
  - Creates only new active `Training_plan` rows using the same frontend-calculated values the legacy flow produced: programme metadata, cohort metadata, group metadata, module names, tutor/coach fields, dates, times, weekdays, session counts, KSB JSON, coverage JSON, KSB profile id, notes metadata markers, cohort/module color markers, holiday markers, cohort end-date marker, and display order values for the new rows.
  - Does not update, delete, recreate, archive, restore, or reorder existing rows. Existing display order values are preserved.
  - Duplicate safety: if identical active rows already exist for the same programme/cohort/group/block identifiers, the endpoint returns `created_count: 0` and `skipped_count` equal to the duplicate row count with latest items instead of creating duplicates. If the same identity exists with different values, it returns `400`.
  - Rejects missing identifiers, duplicate row identities, full-save-shaped payloads, existing-row mutation intent, archive/restore intent, missing programme scope, unknown tutor profiles, and stale versions.
  - Returns `created_count`, `skipped_count`, created/skipped row ids, identifiers used, latest items, and latest Training Plan version.
  - Audit label is `COHORT_ADD_SCOPED_CREATE`; backend metadata/log action name is `cohort_add_scoped_create`.
  - Normal user-facing UI, labels, modal behavior, confirmation flow, ordering, timeline calculations, validation behavior, and success experience are unchanged. There is no legacy `POST /api/training-plan/` fallback.

- `PATCH /api/training-plan/reorder/programmes/`
  - Allowed fields: `version`, `programmeIds`
  - Updates only `programme_display_order` on existing `Training_plan` rows.
  - Requires every existing programme id represented in `Training_plan`.
  - Rejects missing, duplicate, and unknown ids.
  - Stale version returns `409 Conflict`.
  - Audit label is `PROGRAMME_REORDER_PARTIAL_UPDATE`.

- `PATCH /api/training-plan/reorder/cohorts/`
  - Allowed fields: `version`, `programmeId`, `cohortIds`
  - Updates only `cohort_display_order` for rows in the requested programme.
  - Requires every existing cohort id in that programme.
  - Rejects missing, duplicate, unknown, and cross-programme cohort ids.
  - Stale version returns `409 Conflict`.
  - Audit label is `COHORT_REORDER_PARTIAL_UPDATE`.

- `PATCH /api/training-plan/cohorts/<cohort_id>/`
  - Allowed fields: `version`, `programmeId`, `cohortName`, `startingDateLabel`, `cohortColor`, `cohortEndDate`, `holidayIds`, `ksbProfileId`, `blocks`.
  - Updates only active, non-archived rows in the requested programme/cohort scope.
  - Updates only `cohort_name`, `starting_date_lable`, `group_name`, `coach_name`, `ksb_profile_id`, and cohort/group notes metadata markers.
  - Preserves module names, tutors, session dates/times, session counts, weekdays, KSB JSON, coverage JSON, display order, archive fields, visible module notes, and module color markers.
  - Requires every active Training Plan row id in that cohort scope through `blocks[].trainingPlanId`.
  - Rejects missing stable cohort ids, missing/duplicate/unknown row ids, incomplete cohort scope payloads, cross-scope row ids, and stale versions.
  - Frontend blocks edits that include module/session/programme membership changes; there is no legacy POST fallback for `cohort_edit`.
  - Audit label is `COHORT_EDIT_PARTIAL_UPDATE`.

- `PATCH /api/training-plan/cohorts/<cohort_id>/archive/`
  - Allowed fields: `version`, `programmeId`, `trainingPlanIds`, `archiveReason`
  - Updates only archive fields on active rows in the requested programme/cohort scope.
  - Requires every active Training Plan row id in that cohort scope.
  - Rejects missing, duplicate, unknown, incomplete, and cross-scope row ids.
  - Stale version returns `409 Conflict`.
  - Audit label is `COHORT_ARCHIVE_PARTIAL_UPDATE`.

- `PATCH /api/training-plan/modules/archive/`
  - Allowed fields: `version`, `moduleName`, `trainingPlanIds`, `archiveReason`
  - Updates only archive fields on active rows whose `module_name` matches the requested module name.
  - Requires every active Training Plan row id in that module scope.
  - Rejects missing, duplicate, unknown, incomplete, and cross-scope row ids.
  - Stale version returns `409 Conflict`.
  - Audit label is `MODULE_ARCHIVE_PARTIAL_UPDATE`.

- `PATCH /api/training-plan/cohorts/<cohort_id>/restore/`
  - Allowed fields: `version`, `programmeId`
  - Intended for admin/debug recovery only; there is no normal user-facing restore control.
  - Updates only archive fields on archived rows matching the requested programme/cohort scope.
  - Returns `restored_count`, `cohort_id`, latest items, and latest version.
  - If no archived rows match the requested scope, returns `restored_count: 0` without modifying rows.
  - Rejects missing `programmeId` and stale versions.
  - Audit label is `COHORT_RESTORE_PARTIAL_UPDATE` with metadata only.

- `PATCH /api/training-plan/modules/restore/`
  - Allowed fields: `version`, `moduleName`, optional `trainingPlanIds`
  - Intended for admin/debug recovery only; there is no normal user-facing restore control.
  - Updates only archive fields on archived rows whose `module_name` matches the requested module name, optionally narrowed by row ids.
  - Returns `restored_count`, `moduleName`, latest items, and latest version.
  - If no archived rows match the requested scope, returns `restored_count: 0` without modifying rows.
  - Rejects missing `moduleName`, duplicate ids, unknown ids, active/non-archived ids, cross-scope ids, and stale versions.
  - Audit label is `MODULE_RESTORE_PARTIAL_UPDATE` with metadata only.

None of the partial endpoints call `TrainingPlan.objects.all().delete()`, queryset delete, bulk delete, or recreate loops.

### Frontend Save Action Map

| UI action | Component/file | Function called | Endpoint called | Current save type | Reason | Safe to migrate later? | Notes/TODO |
|---|---|---|---|---|---|---|---|
| Initial Training Plan load | `page.tsx` | `reloadTrainingPlan` | `GET /api/training-plan/` | Read-only | Reads latest rows/version | N/A | No save. |
| Export latest data refresh | `page.tsx` | `exportTrainingPlanExcel` | `GET /api/training-plan/` | Read-only | Reads latest rows before export | N/A | No save. |
| Tutor Coverage modal save for loaded block with `trainingPlanId` | `ScheduleTable.tsx` -> `page.tsx` | `saveCoverageDraft` -> `updateSessionCoverage` -> `updateTrainingPlanSessionCoverage` | `PATCH /api/training-plan/sessions/<id>/coverage/` | Partial update | Stable backend row id exists | Already migrated | Updates one row's coverage JSON only. |
| Tutor Coverage modal save without `trainingPlanId` | `ScheduleTable.tsx` -> `page.tsx` | `openCoverageEditor`; defensive check in `updateSessionCoverage` | N/A | Blocked partial action | New/generated block lacks stable backend id | Yes, after reload/id exists | Logs `TUTOR_COVERAGE_PARTIAL_SAVE_BLOCKED_MISSING_TRAINING_PLAN_ID`; no full-save fallback. |
| Isolated session schedule edit with `trainingPlanId` | `ScheduleTable.tsx` -> `page.tsx` | `saveScheduleDraft` -> `updateSessionSchedule` -> `updateTrainingPlanSession` | `PATCH /api/training-plan/sessions/<id>/` | Partial update | Stable backend row id and changed fields are direct row schedule fields | Already migrated | Updates start/end date, weekday, time, tutor, and coach on one row only. No delivery-method or session-title save exists because those are not direct `Training_plan` fields. |
| Isolated session schedule edit without `trainingPlanId` | `ScheduleTable.tsx` | `openScheduleEditor` | N/A | Blocked partial action | Missing stable backend row id | Yes, after reload/id exists | Logs `SESSION_SCHEDULE_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID`; no full-save fallback. |
| Isolated current-session KSB edit with `trainingPlanId` | `ScheduleTable.tsx` -> `page.tsx` | `saveKsbDraft` -> `updateSessionKsb` -> `updateTrainingPlanSessionKSB` | `PATCH /api/training-plan/sessions/<id>/ksb/` | Partial update | Stable backend row id plus current `sessionNumber` exists | Already migrated | No legacy fallback; updates only target session KSB JSON. |
| Isolated current-session KSB edit without `trainingPlanId` | `ScheduleTable.tsx` | `openKsbEditor` | N/A | Blocked partial action | Missing stable backend row id | Yes, after reload/id exists | Logs `KSB_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID`; no full-save fallback. |
| Isolated session notes edit with `trainingPlanId` | `ScheduleTable.tsx` -> `page.tsx` | `saveNotesDraft` -> `updateSessionNotes` -> `updateTrainingPlanSession` | `PATCH /api/training-plan/sessions/<id>/` | Partial update | Stable backend row id exists | Already migrated | Sends only `notes`; no legacy fallback. |
| Isolated session notes edit without `trainingPlanId` | `ScheduleTable.tsx` | `openNotesEditor` | N/A | Blocked partial action | Missing stable backend row id | Yes, after reload/id exists | Logs `NOTES_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID`; no full-save fallback. |
| Simple existing module edit with `trainingPlanId` | `CohortModal.tsx` -> `page.tsx` | `saveModuleDraft` -> `updateModulePartial` -> `updateTrainingPlanModule` | `PATCH /api/training-plan/modules/<id>/` | Partial update | Stable backend row id and changed fields are limited to module name, tutor, color, and notes | Already migrated for this narrow case | No legacy fallback for the isolated partial path; notes metadata markers are preserved. |
| Simple existing module edit without `trainingPlanId` | `CohortModal.tsx` | `saveModuleDraft` | N/A | Blocked partial action | Missing stable backend row id | Yes, after reload/id exists | Logs `MODULE_COLOR_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID` when color is part of the blocked payload, otherwise `MODULE_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID`; no full-save fallback for the isolated path. |
| Module edits with dates/session count/KSB/placement/generated end-date changes | `CohortModal.tsx` -> `page.tsx` | Action-specific scoped save or blocked when unsafe | No `POST /api/training-plan/` normal path | No replace-all | These changes can affect generated timeline structure or existing calculations | Maybe, later | Keep adding scoped contracts before allowing broader recalculation saves. |
| KSB Mapping in cohort/module editor | `CohortModal.tsx` -> `page.tsx` | Action-specific scoped save or blocked when unsafe | No `POST /api/training-plan/` normal path | No replace-all | KSB edits can be bundled with broader module drafts | Yes | Needs isolated session-level KSB editor tied to `trainingPlanId` plus `sessionNumber` for every path. |
| KSB Mapping in module catalogue editor | `ManageModulesModal.tsx` -> `page.tsx` | `updateSessionKsbMapping`, `handleSave`, `handleUpdateCatalogModule` | `PATCH /api/modules/<id>/` | Catalogue table update only | KSB mappings are stored on the catalogue module record; linked Training Plan rows are not recalculated here. | Maybe, later | Training Plan KSB JSON is unchanged by catalogue edit propagation. |
| Session/module notes in cohort/module editor | `CohortModal.tsx` -> `page.tsx` | Action-specific scoped save or blocked when unsafe | No `POST /api/training-plan/` normal path | No replace-all | Notes can be inside broad module draft save | Yes | Keep isolated notes action tied to one loaded row with `trainingPlanId`. |
| Date/time edit in cohort/module editor | `CohortModal.tsx` -> `page.tsx` | Action-specific scoped save or blocked when unsafe | No `POST /api/training-plan/` normal path | No replace-all | Can affect end-date and generated schedule calculations | Maybe | Add scoped recalculation support before allowing generated changes. |
| Tutor edit in cohort/module editor | `CohortModal.tsx` -> `page.tsx` | Action-specific scoped save or blocked when unsafe | No `POST /api/training-plan/` normal path | No replace-all | Can be bundled with broader module draft and tutor profile validation | Maybe | Migrate only with isolated row-level tutor editor. |
| Cohort add | `CohortModal.tsx` -> `page.tsx` | `handleSave` -> `createTrainingPlanCohort` | `POST /api/training-plan/cohorts/` | Scoped create | Stable programme/cohort/group/block identifiers and generated rows exist | Already migrated | Creates only the new calculated cohort rows. Missing identifiers log `COHORT_ADD_SCOPED_CREATE_BLOCKED`; no full-save fallback. |
| Existing cohort metadata edit | `CohortModal.tsx` -> `page.tsx` | `handleSave` -> `updateTrainingPlanCohort` | `PATCH /api/training-plan/cohorts/<cohort_id>/` | Partial update | Stable programme/cohort scope and row ids exist | Already migrated for metadata-only edits | Updates cohort name, start label, KSB profile id, cohort color/end-date/holiday notes markers, and group/coach metadata only. Blocks missing ids or module/session/programme changes with `COHORT_EDIT_PARTIAL_BLOCKED_MISSING_ID` for missing stable ids and no full-save fallback. |
| Cohort delete/archive | `GanttTimeline`/choice modal -> `page.tsx` | `handleDeleteRow` -> `archiveTrainingPlanCohort` | `PATCH /api/training-plan/cohorts/<cohort_id>/archive/` | Partial archive | Stable programme/cohort scope and row ids exist | Already migrated | Updates archive fields only; normal GET hides archived rows. Missing ids log `COHORT_ARCHIVE_BLOCKED_MISSING_ID`; no full-save fallback. |
| Cohort reorder within one programme | `GanttTimeline` -> `page.tsx` | `handleReorderRow` -> `updateTrainingPlanCohortOrder` | `PATCH /api/training-plan/reorder/cohorts/` | Partial update | Explicit `cohort_display_order` exists | Already migrated | Does not move cohorts across programmes. Cross-programme cohort moves are blocked. |
| Programme reorder for programmes with persisted rows | `GanttTimeline` -> `page.tsx` | `handleReorderGroup` -> `updateTrainingPlanProgrammeOrder` | `PATCH /api/training-plan/reorder/programmes/` | Partial update | Explicit `programme_display_order` exists | Already migrated | Empty programmes have no `Training_plan` rows to carry order. |
| Add module for tutor | `TutorProfiles`/pending modal -> `page.tsx` | `savePendingTutorModule` -> `addTrainingPlanModuleForTutor` | `POST /api/training-plan/modules/add-for-tutor/` | Scoped create | Stable programme/cohort/group/block/module/tutor identifiers and one generated row exist | Already migrated | Creates only the new calculated row. Missing identifiers log `MODULE_ADD_FOR_TUTOR_SCOPED_CREATE_BLOCKED`; no full-save fallback. |
| Catalogue module rename affecting timeline rows | `ManageModulesModal.tsx` -> `page.tsx` | `handleUpdateCatalogModule` -> `updateTrainingPlanLinkedModuleRows` when linked blocks change | `PATCH /api/modules/<id>/`, then `PATCH /api/training-plan/modules/linked-rows/` if needed | Partial update for linked Training Plan rows | Stable `moduleCatalogueId`, previous module name, new module name, and linked row identifiers exist | Already migrated | Updates only `module_name` on matching active rows. Missing identifiers log `MODULE_EDIT_LINKED_ROWS_PARTIAL_BLOCKED_MISSING_ID`; no full-save fallback. |
| Catalogue module delete affecting timeline rows | `ManageModulesModal.tsx` -> `page.tsx` | `handleDeleteCatalogModule` -> `archiveTrainingPlanModule` before catalogue delete when linked blocks exist | `PATCH /api/training-plan/modules/archive/`, then `DELETE /api/modules/<id>/` | Partial archive for Training Plan rows; catalogue delete unchanged | Linked Training Plan rows are archived, not removed from a full payload | Already migrated for Training Plan rows | Missing ids log `MODULE_ARCHIVE_BLOCKED_MISSING_ID`; no full-save fallback. Catalogue row deletion itself remains the existing catalogue behavior. |
| Programme edit with existing rows | `ManageProgramModal.tsx`/`AddProgramModal.tsx` -> `page.tsx` | `handleAddProgram` -> `persistProgramConfigs`, then `updateTrainingPlanLinkedProgrammeRows` when linked rows exist | `POST /api/training-plan-program-configs/`, then `PATCH /api/training-plan/programmes/<programme_id>/linked-rows/` if needed | Partial update for linked Training Plan rows | Stable programme id, all active linked row ids, and matching programme markers exist | Migrated | Updates only programme display label and programme id marker on matching active rows. Missing ids/markers log `PROGRAMME_EDIT_LINKED_ROWS_PARTIAL_BLOCKED` or return generic save error; no full-save fallback. |
| Programme add/delete with no rows | `AddProgramModal.tsx`/`ManageProgramModal.tsx` -> `page.tsx` | `handleAddProgram`, `handleDeleteProgram` | `POST /api/training-plan-program-configs/` | Not Training Plan full-save | Updates programme config table, not `Training_plan` rows | N/A | Separate endpoint also replace-saves config catalogue. |
| Holiday changes | `HolidayManager.tsx` -> `page.tsx` | `handleSave` -> `persistHolidays` | `POST /api/training-plan-holidays/` | Not Training Plan full-save | Updates holiday table, not `Training_plan`; impacts future recalculation/display | N/A | Existing holiday logic unchanged. |
| Holiday/replacement/recalculation through cohort editor | `CohortModal.tsx` -> `page.tsx` | Support-table save or blocked until scoped recalculation exists | No `POST /api/training-plan/` normal path | No replace-all | Recalculates dates/end dates before save | No, not as-is | Add scoped recalculation support before allowing generated changes. |
| Custom module definitions | `AddModuleModal.tsx` -> `page.tsx` | `handleAddModule` -> `persistCustomModules` | `POST /api/training-plan-modules/` | Not Training Plan full-save | Updates module definition table, not `Training_plan` | N/A | Backend endpoint replaces module definitions table, separate from `Training_plan`. |
| Global save button | N/A | N/A | N/A | Unknown/not present | No standalone global Training Plan save button found | N/A | Saves are modal/action-specific. |

## Remaining Training Plan Save Callers Audit

### Migrated Partial Paths

These high-frequency actions are no longer expected to call `POST /api/training-plan/`:

| User action | Frontend path | Endpoint | Classification | Verification label |
|---|---|---|---|---|
| Edit Session Schedule from Schedule Table | `ScheduleTable.tsx` -> `updateSessionSchedule` | `PATCH /api/training-plan/sessions/<id>/` | A. Already migrated partial path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Edit Tutor or Coach from Schedule Table | `ScheduleTable.tsx` -> `updateSessionSchedule` | `PATCH /api/training-plan/sessions/<id>/` | A. Already migrated partial path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Edit Session Notes from Schedule Table | `ScheduleTable.tsx` -> `updateSessionNotes` | `PATCH /api/training-plan/sessions/<id>/` | A. Already migrated partial path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Edit Session KSB Mapping from Schedule Table | `ScheduleTable.tsx` -> `updateSessionKsb` | `PATCH /api/training-plan/sessions/<id>/ksb/` | A. Already migrated partial path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Simple existing module edit: name, tutor, notes, color | `CohortModal.tsx` -> `updateModulePartial` | `PATCH /api/training-plan/modules/<id>/` | A. Already migrated partial path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Tutor Coverage with stable `trainingPlanId` | `ScheduleTable.tsx` -> `updateSessionCoverage` | `PATCH /api/training-plan/sessions/<id>/coverage/` | A. Already migrated partial path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Reorder programmes with persisted rows | `GanttTimeline.tsx` -> `handleReorderGroup` | `PATCH /api/training-plan/reorder/programmes/` | A. Migrated partial path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Reorder cohorts within one programme | `GanttTimeline.tsx` -> `handleReorderRow` | `PATCH /api/training-plan/reorder/cohorts/` | A. Migrated partial path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Archive/delete cohort | `GanttTimeline.tsx` -> `handleDeleteRow` | `PATCH /api/training-plan/cohorts/<cohort_id>/archive/` | A. Migrated partial archive path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Archive linked Training Plan rows during catalogue module delete | `ManageModulesModal.tsx` -> `handleDeleteCatalogModule` | `PATCH /api/training-plan/modules/archive/` | A. Migrated partial archive path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Rename linked Training Plan rows during catalogue module edit | `ManageModulesModal.tsx` -> `handleUpdateCatalogModule` | `PATCH /api/training-plan/modules/linked-rows/` | A. Migrated partial update path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Add module for tutor | `TutorProfiles`/pending modal -> `savePendingTutorModule` | `POST /api/training-plan/modules/add-for-tutor/` | A. Migrated scoped create path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Add cohort | `CohortModal.tsx` -> `handleSave` | `POST /api/training-plan/cohorts/` | A. Migrated scoped create path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |
| Edit programme metadata with existing rows | `ManageProgramModal.tsx`/`AddProgramModal.tsx` -> `handleAddProgram` | `PATCH /api/training-plan/programmes/<programme_id>/linked-rows/` | A. Migrated partial update path | `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` |

### Remaining Legacy Callers

`persistTrainingPlan` remains defined in `frontend/src/pages/apprenticeships-timeline/page.tsx` as protected legacy code, but source search shows no normal frontend caller. If it is ever called again without `allowLegacyReplaceAll`, the frontend blocks it. If it is intentionally called with the legacy/admin/debug flag, the frontend console warning includes `LEGACY_TRAINING_PLAN_FULL_SAVE_CALLER`, `LEGACY_TRAINING_PLAN_FULL_SAVE_USER_ACTION`, and the source below. The backend rejects migrated labels, requires `X-KBC-Legacy-Training-Plan-Full-Save: internal-admin-debug` and `confirmLegacyReplaceAll=true`, and logs `LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED` if the endpoint is called. There is no remaining legacy full-save source for `programme_edit_linked_timeline_rows`.

| Source label | User action | File/function | Classification | Why it remains full save | Safe to migrate later? | Risk | Recommended next step |
|---|---|---|---|---|---|---|---|
| None in normal UI | N/A | N/A | Protected legacy code only | `persistTrainingPlan` is retained but not called by normal Training Plan UI actions. | Review if a caller is reintroduced | Low while unused | Keep source-search verification in release checks. |

### Final Training Plan Flow Summary

| Flow | Current Training Plan persistence | Replace-all used by normal UI? |
|---|---|---|
| Session schedule, tutor, coach, and notes edits | `PATCH /api/training-plan/sessions/<id>/` | No |
| Session coverage edits | `PATCH /api/training-plan/sessions/<id>/coverage/` | No |
| Session KSB edits | `PATCH /api/training-plan/sessions/<id>/ksb/` | No |
| Simple loaded module edits | `PATCH /api/training-plan/modules/<id>/` | No |
| Programme reorder | `PATCH /api/training-plan/reorder/programmes/` | No |
| Cohort reorder | `PATCH /api/training-plan/reorder/cohorts/` | No |
| Cohort add | `POST /api/training-plan/cohorts/` scoped create | No |
| Cohort metadata edit | `PATCH /api/training-plan/cohorts/<cohort_id>/` | No |
| Cohort delete | `PATCH /api/training-plan/cohorts/<cohort_id>/archive/` | No |
| Linked catalogue module rename | `PATCH /api/training-plan/modules/linked-rows/` | No |
| Add module for tutor | `POST /api/training-plan/modules/add-for-tutor/` scoped create | No |
| Linked catalogue module delete | `PATCH /api/training-plan/modules/archive/` | No |
| Programme metadata edit with existing rows | `PATCH /api/training-plan/programmes/<programme_id>/linked-rows/` | No |
| Cohort/module restore | Backend-only `PATCH` restore endpoints | No normal UI path |
| Holiday/replacement/date recalculation bundled inside broad cohort/module editor saves | Blocked or handled outside `Training_plan` until a scoped recalculation contract exists | No |

At this point, `programme_edit_linked_timeline_rows` has no legacy `POST /api/training-plan/` fallback, and source search shows no normal Training Plan UI action reaches `persistTrainingPlan` or replace-all.

### Resolved Coverage Missing Id Path

Root cause: `trainingPlanId` was serialized correctly for persisted `Training_plan` rows and mapped into loaded module blocks, but the Tutor Coverage button did not gate on that id like Schedule, KSB, and Notes already did. A new/generated or not-yet-linked block could open the coverage modal; the parent handler then used the `tutor_coverage_missing_trainingPlanId` fallback to call the legacy full-save endpoint.

Final behavior: Tutor Coverage now blocks before opening the modal when the selected row has no stable `trainingPlanId`. The parent save handler also defensively blocks the same missing-id case. The console warning is `TUTOR_COVERAGE_PARTIAL_SAVE_BLOCKED_MISSING_TRAINING_PLAN_ID`, and no `persistTrainingPlan` or `POST /api/training-plan/` fallback is used. This path is fixed by blocking until a safe row id exists; it does not need a backend/schema change.

### Reorder Flow Migration - 2026-06-10

`cohort_reorder` and `programme_reorder` were migrated after explicit order persistence was added.

Findings:

- `cohort_reorder` is triggered by dragging a cohort row in `GanttTimeline.tsx`; it calls `handleReorderRow` in `page.tsx`.
- `programme_reorder` is triggered by dragging a programme section in `GanttTimeline.tsx`; it calls `handleReorderGroup` in `page.tsx`.
- The handlers reorder the in-memory `groups` array and then call scoped PATCH reorder endpoints.
- `Training_plan` now has nullable `programme_display_order` and `cohort_display_order` columns.
- `training_plan_program_configs` still has no programme order/display-order column; order for programmes represented by timeline rows is carried on `Training_plan`.
- Notes metadata markers persist identifiers and display metadata such as `__program_id:`, `__cohort_id:`, `__group_id:`, `__block_id:`, colors, group name, coach name, holiday ids, and cohort end date. There is no existing order marker.
- Frontend reconstruction sorts programmes and cohorts by serialized order fields when present.

Decision:

- Same-programme `cohort_reorder` is migrated to `PATCH /api/training-plan/reorder/cohorts/`.
- `programme_reorder` is migrated to `PATCH /api/training-plan/reorder/programmes/`.
- Cross-programme cohort moves are blocked because they are membership changes, not pure order changes.
- No legacy POST fallback was added.
- Manual browser Network verification still needs to be performed for the reorder endpoints.

### Archive Flow Migration - 2026-06-10

`cohort_delete` and Training Plan row removal from `module_delete_linked_timeline_rows` were migrated after archive fields were added.

Investigation:

- `cohort_delete` was triggered by deleting a cohort from `GanttTimeline` or programme management. It removed the row from local `groups`, then called `persistTrainingPlan(..., 'cohort_delete')`, causing `POST /api/training-plan/` to delete/recreate active rows.
- `module_delete_linked_timeline_rows` was triggered when deleting a catalogue module that had linked Training Plan blocks. The frontend deleted the catalogue module, filtered matching blocks out of local `groups`, then called `persistTrainingPlan(..., 'module_delete_linked_timeline_rows')`.
- Both flows removed rows from local state and relied on the legacy full-save endpoint to make the removal persistent.
- Both flows could be scoped safely only when stable `trainingPlanId` values were available for every affected row.

Decision:

- Cohort delete now archives all active `Training_plan` rows matching `programmeId + cohortId + trainingPlanIds`.
- Linked catalogue module delete now archives all active `Training_plan` rows matching `moduleName + trainingPlanIds` before the catalogue row is deleted.
- Normal Training Plan GET excludes archived rows.
- Archive changes only `is_archived`, `archived_at`, `archived_by`, and `archive_reason`.
- No session dates, times, tutors, coaches, notes, KSBs, holidays, replacements, module names, or timeline calculation logic are changed.
- Missing stable IDs are blocked with `COHORT_ARCHIVE_BLOCKED_MISSING_ID` or `MODULE_ARCHIVE_BLOCKED_MISSING_ID`; there is no legacy POST fallback.
- Catalogue module deletion itself remains the existing catalogue behavior. The migrated part is the linked Training Plan row removal, which is now archive instead of full-save removal.

Restore:

- Backend-only restore endpoints were added for admin/debug recovery after the archive phase.
- `PATCH /api/training-plan/cohorts/<cohort_id>/restore/` restores archived rows only when scoped by `programmeId + cohortId`.
- `PATCH /api/training-plan/modules/restore/` restores archived linked module rows only when scoped by `moduleName`, optionally narrowed with `trainingPlanIds`.
- Restore changes only `is_archived`, `archived_at`, `archived_by`, and `archive_reason`; it does not delete, recreate, recalculate, reorder, or edit session/module fields.
- Archived rows can still be inspected with `GET /api/training-plan/?includeArchived=1` before restore.
- Restore must remain scoped. Do not add a global restore-all endpoint or a payload shape that silently broadens recovery scope.
- Normal user-facing delete behavior remains unchanged. There is no normal Training Plan UI button, layout change, confirmation change, or visual restore flow in this phase.

### Not Training Plan Full-Save

These calls use `POST`, but they do not send the complete `Training_plan` payload:

- `GET /api/training-plan/` in Training Plan, Home, and Today's Sessions is read-only.
- `POST /api/training-plan-holidays/` updates holiday records, not `Training_plan`; holiday effects remain recalculation-sensitive.
- `POST /api/training-plan-modules/` updates module definitions, not `Training_plan`.
- `POST /api/training-plan-program-configs/` updates programme config, not `Training_plan`.
- `POST /api/modules/` updates the module catalogue. Linked Training Plan module-name propagation uses `PATCH /api/training-plan/modules/linked-rows/` when needed.

### Recommended Migration Order

1. Add more isolated row-level editors only for fields already persisted directly on one `Training_plan` row.
2. Migrate remaining broad recalculation-sensitive saves only after scoped recalculation contracts exist.
3. Defer remaining holiday/replacement/end-date recalculation until dedicated endpoints and audit semantics exist.

### Manual Browser Verification Checklist

1. Open Training Plan and keep DevTools Network and Console visible.
2. Edit Session Schedule from Schedule Table and confirm only `PATCH /api/training-plan/sessions/<id>/` appears.
3. Edit Tutor or Coach from Schedule Table and confirm only `PATCH /api/training-plan/sessions/<id>/` appears.
4. Edit Session Notes and confirm only `PATCH /api/training-plan/sessions/<id>/` appears.
5. Edit Session KSB Mapping and confirm only `PATCH /api/training-plan/sessions/<id>/ksb/` appears.
6. Reorder programmes and confirm only `PATCH /api/training-plan/reorder/programmes/` appears.
7. Refresh and confirm programme order persists.
8. Reorder cohorts within one programme and confirm only `PATCH /api/training-plan/reorder/cohorts/` appears.
9. Refresh and confirm cohort order persists.
10. Archive/delete a cohort and confirm only `PATCH /api/training-plan/cohorts/<cohort_id>/archive/` appears.
11. Refresh and confirm the cohort is hidden from the normal Training Plan view.
12. Archive/delete a linked catalogue module if safe test data exists and confirm only `PATCH /api/training-plan/modules/archive/` appears for Training Plan rows.
13. Refresh and confirm archived module rows are hidden from the normal Training Plan view.
14. Confirm the console shows `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` for the partial actions.
15. Confirm none of those partial actions call `POST /api/training-plan/`.
16. Confirm no normal browser action calls `POST /api/training-plan/`. Do not intentionally trigger legacy replace-all during normal smoke testing.

### Manual Browser Network Verification - 2026-06-10

Verification was performed against the local browser page at `http://127.0.0.1:3000/training-plan` with Django running on `127.0.0.1:8000`. The browser Network capture was filtered to Training Plan requests and cleared before each action. Partial actions were saved with their current values to avoid intentional data edits. Older verification included an intercepted broad legacy attempt; current smoke testing should instead confirm normal UI actions do not call `POST /api/training-plan/`.

| Action tested | Endpoint called | `POST /api/training-plan/` appeared? | Result | Unexpected console warning |
|---|---|---:|---|---|
| Edit Session Schedule from Schedule Table | `PATCH /api/training-plan/sessions/60416/` | No | Pass | None; `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` appeared. |
| Edit Tutor or Coach from Schedule Table | `PATCH /api/training-plan/sessions/60416/` | No | Pass | None; `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` appeared. |
| Edit Session Notes | `PATCH /api/training-plan/sessions/60416/` | No | Pass | None; `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` appeared. |
| Edit Session KSB Mapping | `PATCH /api/training-plan/sessions/60416/ksb/` | No | Pass | None; `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` appeared. |
| Edit Tutor Coverage on a persisted row | `PATCH /api/training-plan/sessions/60416/coverage/` | No | Pass | None; `PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED` appeared. |
| Try Tutor Coverage on a row/block without `trainingPlanId` | None | No | Not reproducible in current loaded data | No visible Schedule Table coverage row without `trainingPlanId`; all visible coverage controls were linked to persisted rows. |
| Normal broad legacy cohort edit | No normal legacy POST path expected | No | Superseded by hardening | Current code blocks migrated labels and requires explicit legacy/admin/debug flags. |
| Reorder programmes | Not performed in this coding run | Not verified | Pending | Needs Chrome Network verification after deployment/local manual run. |
| Reorder cohorts | Not performed in this coding run | Not verified | Pending | Needs Chrome Network verification after deployment/local manual run. |

### Reorder Browser Network Verification Attempt - 2026-06-10

Attempted against the local Chrome/Vite/Django setup:

- Frontend: `http://127.0.0.1:3000/training-plan`
- Backend: `http://127.0.0.1:8000`
- Database connected through current Django settings: PostgreSQL `neondb`

Result: blocked before drag/drop verification. `GET /api/training-plan/` returned `500 Internal Server Error` because the connected `Training_plan` table does not yet have the persisted order columns required by the current code:

```text
ProgrammingError at /api/training-plan/
column Training_plan.programme_display_order does not exist
```

The database column check also showed both order columns missing:

- `programme_display_order`: missing
- `cohort_display_order`: missing

No schema change was applied during this verification pass. No migration was run. No reorder action was performed because the page could not load Training Plan rows.

| Test | Expected endpoint | Actual browser/API result | `POST /api/training-plan/` appeared? | Persist-after-refresh result | Status |
|---|---|---|---:|---|---|
| Programme reorder | `PATCH /api/training-plan/reorder/programmes/` | Blocked; Training Plan load failed on `GET /api/training-plan/` with missing `programme_display_order` column. | No POST observed from this verification attempt. | Not testable. | Blocked by unapplied schema migration. |
| Cohort reorder within same programme | `PATCH /api/training-plan/reorder/cohorts/` | Blocked; Training Plan load failed before cohort rows rendered. | No POST observed from this verification attempt. | Not testable. | Blocked by unapplied schema migration. |
| Cross-programme cohort move | No save; blocked UI guard expected. | Not reproducible because Training Plan rows did not load. | No POST observed from this verification attempt. | N/A | Not reproducible. |
| Data sanity after reorder | Only visual/display order changes. | Not testable because no reorder was performed. | N/A | N/A | Blocked. |

Next verification requirement: apply the already-created order migration in the target environment, then rerun Chrome Network verification. Do not perform reorder verification against a database missing these columns.

### Archive Browser Network Verification Attempt - 2026-06-10

Attempted after implementing archive endpoints, but browser verification was blocked by the same unapplied schema state in the connected `neondb` database. `GET /api/training-plan/` returned `500 Internal Server Error` before any archive/delete UI action could be performed.

Database column check showed these required columns missing:

- `programme_display_order`
- `cohort_display_order`
- `is_archived`
- `archived_at`
- `archived_by`
- `archive_reason`

No migration was run during this verification pass. No cohort archive or module archive action was performed in the browser.

| Test | Expected endpoint | Actual browser/API result | `POST /api/training-plan/` appeared? | Persist-after-refresh result | Status |
|---|---|---|---:|---|---|
| Cohort archive/delete | `PATCH /api/training-plan/cohorts/<cohort_id>/archive/` | Blocked; Training Plan load failed on `GET /api/training-plan/` before cohorts rendered. | No POST observed from this verification attempt. | Not testable. | Blocked by unapplied schema migrations. |
| Linked module archive during catalogue delete | `PATCH /api/training-plan/modules/archive/` | Blocked; Training Plan load failed before linked module UI verification. | No POST observed from this verification attempt. | Not testable. | Blocked by unapplied schema migrations. |
| Archived rows remain in database | Rows should remain with `is_archived=true`. | Not testable against current DB because archive columns are missing. | N/A | N/A | Blocked. |

Next verification requirement: apply the already-created order and archive migrations in the target environment, restart the service, then rerun Chrome Network verification for reorder and archive flows.

### Main Answer

The original delete/recreate-all problem is partially solved, not fully solved.

Actions that no longer delete/recreate all `Training_plan` rows:

- Tutor Coverage modal save when the edited block has a stable `trainingPlanId`.
- Isolated Session Schedule `Edit Schedule` save when the edited row has a stable `trainingPlanId`.
- Isolated Session Schedule `Edit KSB` save when the edited row has a stable `trainingPlanId`.
- Isolated Session Schedule `Edit Notes` save when the edited row has a stable `trainingPlanId`.
- Cohort module editor `Save Module` when editing one existing module with a stable `trainingPlanId` and only module name, tutor, module color, or module notes changed.
- Programme reorder for programmes represented by persisted Training Plan rows.
- Cohort reorder within one programme.

Actions that can still trigger delete/recreate-all:

- cohort add/edit/delete
- KSB Mapping in the current cohort/module editor
- session/module notes in the current cohort/module editor when bundled with broader unsafe edits
- date/time edits in the current cohort/module editor
- tutor edits in the current cohort/module editor when bundled with broader unsafe edits or missing `trainingPlanId`
- add module for tutor
- catalogue module rename/delete when linked Training Plan rows are rewritten
- programme edit when linked Training Plan rows are rewritten
- any holiday/replacement/end-date recalculation saved through the cohort editor

No normal Training Plan UI action currently reaches legacy full-save. The protected endpoint still exists with version, stale-write, empty-payload, suspicious-partial-save, locking, and transaction safeguards, but `persistTrainingPlan` has no normal frontend call sites after this migration.

### Isolated KSB And Notes Entry Points

The Session Schedule now includes isolated row-level actions for persisted Training Plan rows:

- `Edit KSB` opens a small modal for the current displayed session only. It sends `PATCH /api/training-plan/sessions/<id>/ksb/` with `sessionNumber`, `knowledgeCodes`, `skillCodes`, and `behaviourCodes`.
- `Edit Notes` opens a small modal for the current displayed session/module row only. It sends `PATCH /api/training-plan/sessions/<id>/` with only the `notes` field.

Both actions are available only when the row has a stable `trainingPlanId`. They update one existing `Training_plan` row and do not call `persistTrainingPlan` or `POST /api/training-plan/`.

When `trainingPlanId` is missing, the row-level action shows the message: "Partial save unavailable for this session. Use the full editor until this row has a stable Training Plan ID." It also logs one of:

- `KSB_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID`
- `NOTES_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID`
- `SESSION_SCHEDULE_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID`

There is no legacy full-save fallback for isolated Schedule, KSB, or Notes edits.

Existing KSB, notes, date/time, tutor, holiday, and recalculation controls inside `CohortModal.tsx` and `ManageModulesModal.tsx` remain user-facing unchanged; they no longer have a normal `persistTrainingPlan` replace-all call path.

### Isolated Module Metadata Entry Point

The cohort module editor now has a narrow module-level partial path for existing loaded modules. When `Save Module` is used on an existing module and the only changed fields are module name, assigned tutor, module color, or module notes, the frontend calls:

- `PATCH /api/training-plan/modules/<id>/`

This path uses the module block's stable `trainingPlanId`, updates only that one `Training_plan` row, stores the returned Training Plan version, and updates only the affected module block in local state. It does not call `persistTrainingPlan` or `POST /api/training-plan/`.

If `trainingPlanId` is missing, the isolated module partial save is blocked and logs:

- `MODULE_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID`

The broad cohort/module editor remains the area to watch for future scoped recalculation work, but it does not currently call the legacy replace-all Training Plan endpoint.

### Recommended Safe Next Steps

1. Monitor use of the new isolated KSB and Notes actions and confirm no `LEGACY_TRAINING_PLAN_FULL_SAVE_USED` warning appears during those saves.
2. Keep source-search verification for accidental new `persistTrainingPlan` call sites.
3. Remove the protected legacy replace-all endpoint after all recovery/migration needs are retired.
4. Review backend `LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED` logs after release to identify highest-volume legacy sources.
5. Add frontend telemetry around `LEGACY_TRAINING_PLAN_FULL_SAVE_USED` if a telemetry pipeline becomes available.
6. Later, split broader cohort/module draft editors into safer scoped save actions.
