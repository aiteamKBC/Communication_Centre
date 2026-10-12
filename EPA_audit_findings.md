# EPA Cases — Audit Findings (2026-10-06)

> ⚠️ Contains learner emails (PII) — keep local, do NOT commit.

## ✅ IMPLEMENTED (2026-10-06) — part 2: EPA readiness figures on the card
The EPA case card now shows **live EPA figures** pulled from `public.aptem_auto_extracting`
(the same table used for EPA detection — no new source). New `sources.refresh_epa_metrics()`
writes `source_data['epa_metrics']` for every open EPA case each cycle (wired in `cycle.py`),
and clears them for learners who have left the extract. Fields: Gateway Review Date, End-Date,
KSB completed/total + status, off-the-job hours completed/planned + status, components
completed/target + status, ProgressVariance, Coach-RAG.
Frontend renders an "EPA readiness" section in `CaseWorkspace.tsx` (reads `source_data.epa_metrics`;
`ticket_json` already returns full `source_data`, so no backend view change).
Note: there is **no dedicated EPA table** — the LMS schema has only Aptem_users/MCR/PR/non_active_users;
all the figures live in `aptem_auto_extracting`. Ran the refresh once to backfill the 1 open EPA case.
All changes uncommitted — need commit/deploy.

## ✅ IMPLEMENTED (2026-10-06) — part 1: recency window
**Rolling recency window for EPA.** `aptem_summaries.epa_overdue_rows` now raises an EPA case
only while the learner is **7 to 7+EPA_RECENCY_DAYS (=60) days** past their End-Date
(`EPA_RECENCY_DAYS = 30` in `aptem_summaries.py`). Previously there was no upper bound, so
EPA cases persisted forever. After the change the generator returns 1 recent EPA learner
(was effectively unbounded).

**Stale EPA cases closed.** 47 of 48 open EPA cases were outside the new window
(`overdue_since <= today - 30 days`) and were resolved via `services.close` with a
`resolved` audit event (`auto: epa_recency_window`). 1 case remains open (within window).

Code: `backend/callcentre/aptem_summaries.py` (uncommitted — needs commit/deploy).

---
_Original findings below (for context)._

## Trigger
Learners appear under **Due → EPA** with "No phone recorded" and "Coach not recorded",
even though their phone and coach exist in the live Aptem PWA and in the LMS PR/EPA
summary tables. Example: **Nick Bhattacharjee** (`nick@rustymonkey.com`) — EPA case id **1759**,
phone `07973257927` and coach `Omar Elshafey` visible in Aptem, but blank in the call sheet.

## How contact data is sourced (the mechanism)
The call-centre directory builds `learner_phone` / `coach` from only TWO places:
- **Aptem:** `public.aptem_auto_extracting` → `"Learner Phone"`, `"OwnerName"`
- **LMS:** `enrolment."Created_users"` → `"Phone_number"`, `"Coach_name"/"Coach_email"/"Case_owner"`

It does NOT read phone/coach from the LMS `PR` / `EPA` / `MCR` summary tables, nor from the live Aptem API.

Code path: `generate_risks` → `upsert_case(category, people[email], ...)`
(`backend/callcentre/sources.py`), profile from `learners.merge` (`backend/callcentre/learners.py`).
EPA source: `aptem_summaries.epa_overdue_rows` — "Active learners still open >7 days after their End-Date".

## Source table sizes (the key insight)
| Table | Rows | Notes |
|---|---|---|
| `aptem_auto_extracting` | 357 (339 active) | **100% have a phone** — but only holds currently-active learners |
| `Created_users` | 633 | only 417 have `Phone_number`, 521 have `Coach_name` |

➡️ **Root mechanism:** Aptem's table has a phone for everyone *in it*, but only keeps **active**
learners. Once a learner completes / withdraws / enters EPA, they drop out of
`aptem_auto_extracting`, so the directory falls back to `Created_users`, whose
`Phone_number` is often NULL → "No phone recorded".

## Audit of ALL open EPA cases (48 total)

### Problem 1 — Data gap (no phone): 12 of 48
EPA cases with no phone at all (cannot be called). All 12 dropped out of the active Aptem
table and have NULL `Phone_number` in `Created_users`.

IDs: 1734, 1736, 1746, 1733, 1748, 1749, 1758, 1759, 1760, 1767, 1768, 1773
(LMS status mix: EnteredEpa / blank / Withdrawn / Completed)

### Problem 2 — Stale cases: 45 of 48 learners are no longer in the active Aptem source
Breakdown by LMS `Programme_status`:
| LMS status | Count | Assessment |
|---|---|---|
| blank / not matched in Created_users | 34 | needs investigation |
| Completed | 5 | should close — finished |
| EnteredEpa | 4 | genuinely in EPA process |
| Withdrawn | 2 | should close — left |
| On break | 1 | paused, not closed |

**Safe-to-close subset (Completed + Withdrawn = 7 cases)** — learners who clearly should
not be chased for EPA anymore.

## Two underlying issues
1. **No auto-close for EPA/review cases when a learner leaves the active roster.** EPA cases
   close only via evidence or manual resolve, so completed/withdrawn learners keep open
   EPA call cases.
2. **Phone/coach evaporate when a learner leaves the active Aptem extraction**, because
   `Created_users` phone/coach are frequently NULL. The data still exists in Aptem PWA and
   the LMS PR/EPA summary tables, but the directory does not read those.

## Options for later (NOT yet done)
- (1) Close the 7 Completed/Withdrawn EPA cases (safe, direct).
- (2) Investigate the 34 blank/unmatched cases — who they really are and their true status.
- (3) Fix the phone/coach gap: add a fallback source (read `Created_users` + PR/EPA summary
      "Learner Phone", or the live Aptem) so contact data survives after a learner goes inactive.
- (4) Add maintenance that auto-closes EPA/review cases when the learner is no longer active.

## Scripts used (read-only, in scratchpad)
`epa_audit.py`, `aptem_size.py`, `nick.py` — all read-only diagnostics, no writes.
