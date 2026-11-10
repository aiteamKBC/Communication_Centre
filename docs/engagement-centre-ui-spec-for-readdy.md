# KBC Engagement Centre: Complete UI & Feature Specification (for redesign in Readdy.ai)

> **Purpose of this document.** This is a complete inventory of the Kent Business College **Engagement Centre** as it exists in the code today: every page, panel, dialog, table, filter, tab, tag, button, link, empty state and error message. It is written so the UI/UX team and Readdy.ai can redesign the look and layout **without losing a single feature**.
>
> **Rules for the redesign**
> 1. **Every item in this document must exist in the new UI.** You can move it, regroup it, restyle it or rename the visual container, but do not drop it. If something seems unnecessary, flag it to the product owner instead of removing it.
> 2. **Keep the behaviour rules** in section 12 (who can do what, when a button is disabled, what is required before saving). They are business and compliance rules, not styling.
> 3. **Quoted text** ("like this") is the current wording. You may improve the wording but keep the meaning. Validation and safety messages must stay equally clear.
> 4. **All times are UK time (Europe/London).** The UI says so in several places; keep those cues.
> 5. Section 14 has a **master checklist**. Tick it off against the new design before handing it over.

---

## Table of contents

1. [What the Engagement Centre is](#1-what-the-engagement-centre-is)
2. [Users and roles](#2-users-and-roles)
3. [Current visual language (for reference)](#3-current-visual-language-for-reference)
4. [Entry point and the app shell (sidebar and top bar)](#4-entry-point-and-the-app-shell)
5. [Navigation map for each role](#5-navigation-map-for-each-role)
6. [Specialist calling desk: every page](#6-specialist-calling-desk)
7. [Full case (learner workspace)](#7-full-case-learner-workspace)
8. [Shared components and dialogs (used on many pages)](#8-shared-components-and-dialogs)
9. [Director workspace: every page](#9-director-workspace)
10. [Zoom Phone page (specialist and director views)](#10-zoom-phone-page)
11. [Reference lists: all labels, statuses, options](#11-reference-lists)
12. [Behaviour rules the new UI must keep](#12-behaviour-rules-the-new-ui-must-keep)
13. [Loading, empty, error and read-only states](#13-loading-empty-error-and-read-only-states)
14. [Master checklist](#14-master-checklist)

---

## 1. What the Engagement Centre is

A calling workspace for the college's **engagement specialists** (call-centre agents) and their **director**. The system automatically opens **cases** (tickets) for learners and employers who need a phone call. The cases come from the LMS, Aptem, the attendance register, Outlook calendars, the technical support system and Zoom Phone. For example:

- a learner missed a lecture
- a progress review or monthly coaching meeting is due, missed, or waiting for a signature
- a learner is past their programme end date (EPA)
- a next-day appointment needs confirming
- a learner or employer satisfaction review is due (every 3 months)
- an employer signature is missing
- a manager requested an extra call
- a technical issue needs a follow-up call

Specialists call through **Zoom Phone** (the Call button opens the Zoom desktop app). They record the outcome of each call, book sessions with coaches, send emails and correct attendance. Calls are then verified against Zoom records, recorded, transcribed and **rated by AI** (excellent / good / bad).

The director watches the team **live** (who is on a call, ringing, free). They see performance figures, approve AI suggestions, hand lists to other specialists, allocate learners, configure Zoom and change settings.

**Key concepts the UI must make clear:**

| Concept | Meaning |
|---|---|
| **Case / ticket** | One reason to call one person (e.g. "Missed lecture on 6 Oct"). A person can have many open cases. |
| **Contact** | The person called: a learner, or an employer / line manager. Lists show **one row per contact**; their other cases travel with them. |
| **List** | A group of cases by reason (Due, Next Day, Missed, Satisfaction…). Specialists work list by list. |
| **Call next** | The guided "one person at a time" calling screen. |
| **Outcome** | What happened on the call (Reached / agreed action, No answer, Wrong number, Callback, Refused…). |
| **Follow-up** | When the case comes back to the list. |
| **Promise** | Something the learner agreed to do by a deadline (e.g. book the review within 3 days). The case waits for proof. |
| **Shared queue** | Learners not allocated to any specialist; anyone can call them. |
| **Task / delegation** | The director hands a list (or part of it) from one specialist to another until recalled. |
| **Employer specialist** | A specialist chosen to make all employer satisfaction calls (they then see only employer calls). |
| **Do not call** | Learners taken off every call list. |
| **Dry run** | Emails are recorded on the case but not actually sent. |

---

## 2. Users and roles

| Role | What they see | Notes |
|---|---|---|
| **Specialist (agent)** | Their own **calling desk** (Today, My lists, Missed calls, My calls, How I'm doing, Booking links) plus the **Zoom Phone** page (non-manager view). | Has an agent profile linked to a Zoom number. |
| **Employer specialist** | Same desk, but their lists are **only** Employer Satisfaction and MISSING SIGNATURE. They get **Call a learner** instead of **Booking links**. | Chosen by the director (section 9.12). |
| **Viewer** (signed in, no agent profile) | Desk in **read-only** mode with an alert: "Ask a manager to set up your agent profile to call learners and record outcomes. This calling workspace is read-only until then." | Every action is disabled. |
| **Director** | The **Director workspace** (Monitor / Calls / Setup). Can open any specialist's desk ("Calling desk"). Can approve AI suggestions, archive cases, undo attendance edits, manage Do not call, configure everything. | Called "manager" in some messages. |
| **Director preview** | When a director opens a specialist's desk in read-only preview, a banner shows: "Director preview · {name} · Calls and edits are disabled. {name} signs in with their own account to use this calling workspace." with a **Return to director** button. | Today directors can also act and call from any desk (a temporary rule). Keep both states designed. |

Access to the whole centre requires sign-in. If the session expires, a full-page message is shown (section 13).

---

## 3. Current visual language (for reference)

This is the current look. The redesign may change it, but these are the brand cues in use today:

- **Primary purple** `#60359a`, deep purple `#4f2d7f` / `#493066`, lavender tints `#faf8fd`, `#f6f3fb`, `#efe9f7`, light purple `#ceb3eb`.
- **Teal** `#268a8b` ("answered" bars). **Gold** `#bb8a32` / `#c99b40` (target line, "not answered" bars). **Red / danger** `#963e48`. **Green / success** `#4c8e6c`, `#28614b`. Ink `#202139`, muted text `#66677b`, grid lines `#ece9f2`.
- **Per-specialist chart colours** (same order everywhere): `#60359a, #268a8b, #c0632b, #2f6db5, #a3326e, #5b8a2a, #8a6bc0, #1f5f63`.
- **Headings** use a serif display font. Big numbers (figures, tiles) also use the serif face with tabular numbers.
- **Tags / pills** come in 4 tones: green (good / done), amber (waiting / check), red (problem / late / declined), gold (employer step), plus neutral.
- The sidebar is **purple** with a "KBC" monogram.
- The dashboard tile that opens the centre uses a navy gradient (`#1B2A4A → #2E4482`) and a "customer service headset" icon.

---

## 4. Entry point and the app shell

### 4.1 Entry point
- On the main staff **Dashboard** there is a tile: **"Engagement Centre"**. Description: "Learner calling desk, Zoom Phone calls and engagement KPIs." Icon: headset. Only call-centre agents and directors can use it.
- URL: `/dashboard/call-centre`. Everything inside is driven by URL parameters (`view`, `section`, `operator`, `agent`, `case`, `month`), so every page and tab is **linkable / bookmarkable**. Keep this. Old links are redirected (e.g. old "imports" or "connections" links go to Settings, "quality" goes to Calls, "cases" goes to Overview; old desk sections "next" goes to Today, "reports" to This month, "history" / "progress" to Achievements).

### 4.2 Sidebar (left navigation)
- **Brand block**: "KBC" monogram + title **"Engagement Centre"** + subtitle **"Kent Business College"**.
- **Close navigation (×)** button (mobile drawer only).
- **Navigation groups**, each with a small heading and items. Each item has an **icon + label**, a tooltip (the label) and an "active / current page" state. The items depend on the role (section 5).
- **Account footer**: "Signed in as" + the user's email.
- **Collapse / expand**:
  - Desktop: the sidebar collapses to icons only. The choice is remembered per browser.
  - Keyboard shortcut **Ctrl + B / ⌘ + B** toggles it (ignored while typing in a field).
  - Mobile (≤ 767 px): the sidebar is a **drawer** with a dark **overlay**. Clicking the overlay closes it, **Escape** closes it, the page behind cannot scroll, and focus moves into the drawer and back to the toggle on close.

### 4.3 Top bar
- **Toggle navigation** icon button (panel icon).
- **"← Back to dashboard"** link (to the main staff dashboard).
- **"All times: London"** label, with tooltip "Europe/London — adjusts automatically for British Summer Time".
- The user's **email**.
- **Sign out** button (icon + "Sign out").

### 4.4 Global status / notification line
- One live message line (`role=status`) under the page header shows success messages ("Saved for Jane.", "Case resolved.") and errors (in red).
- It clears when you navigate.
- It must stay visible after every action. Many actions rely on it to confirm success.

### 4.5 Icons in use (map to the new icon set)
`grid` (Overview / Today), `people` (Specialists, Task delegation), `chart` (Scorecards, How I'm doing), `calendar` (Review meetings, Booking links), `clock` (Calls, My calls), `message` (Missed calls & voicemails), `check` (Attendance edits, Settings), `phone` (Calling desk, Call a learner, Missed calls), `settings` (Zoom Phone), `book` (Learner allocation), `file` (My lists), `back` (Return to director), `panel` (toggle), `logout`, `close`.

---

## 5. Navigation map for each role

### 5.1 Specialist (and viewer)
**Group "My calling day"**
1. **Today** (grid)
2. **My lists (N)**: N = number of people on all their call lists, each counted once (file)
3. **Missed calls (N)**: N = people who rang and are still waiting; the count is only shown when > 0 (phone)
4. **My calls** (clock)
5. **How I'm doing** (chart)
6. **Booking links** (calendar)

**Group "Engagement"**
7. **Zoom Phone** (settings)

### 5.2 Employer specialist
Same as 5.1, except **Booking links** is replaced by **Call a learner** (phone), placed after My lists.

### 5.3 Director
**Group "Monitor"**
1. **Overview** (grid)
2. **Specialists** (people)
3. **Scorecards** (chart)
4. **Review meetings** (calendar)

**Group "Calls"**
5. **Calls** (clock)
6. **Missed calls & voicemails** (message)
7. **Attendance edits** (check)
8. **Task delegation** (people)
9. **Calling desk** (phone): opens the desk view

**Group "Setup"**
10. **Zoom Phone** (settings)
11. **Learner allocation** (book)
12. **Coach booking links** (calendar)
13. **Settings** (check)

### 5.4 Director inside a calling desk
**Group "My calling day"**: the desk pages (as 5.1 or 5.2, depending on whose desk).
**Group "Director"**: **Return to director** (back icon).

---

## 6. Specialist calling desk

### 6.0 Desk-wide elements (on every desk page)

**System alerts at the top (red alert banners, shown when they apply):**
- **Data sources down:** "Some data sources are unavailable ({list of source names}). Lists may be incomplete; existing cases have been retained. Ask a manager to check Connections."
- **Sync late:** "Synchronization is overdue or has not completed. Refresh only reloads saved cases; it does not run synchronization." (Shown when the last successful sync is older than 30 minutes or has never happened.)
- **Truncated list:** "The case list is truncated. These counters do not include every case."
- **Viewer (no agent profile):** "Ask a manager to set up your agent profile to call learners and record outcomes. This calling workspace is read-only until then."

**Director preview banner** (when applicable): "**Director preview · {name}** · Calls and edits are disabled. {name} signs in with their own account to use this calling workspace." + **Return to director** button.

**Desk header:**
- Eyebrow: **{today's long date} · {specialist name}**
- H1: the page name (Today / My lists / Call a learner / Missed calls / My calls / How I'm doing / Booking links)
- Buttons on the right:
  - **Start focus session** / **End focus session** (only on the Follow-ups list; disabled when nobody is on the list)
  - **"Lists last updated {date time} (London)"** or "Lists last updated not recorded yet"
  - **Refresh**

**Page tabs** (under the header):
- On **My lists**: one tab per list, with its count, e.g. "Due (12)", "Next Day (4)", "Follow-ups (3)", plus a tab for each task given by the director (section 6.4).
- On **How I'm doing**: **This week**, **This month**, **Call reviews**, **Achievements**.

**Progress strip** (shown on My lists and Call a learner):
- **Connected call time**: "{h m} / {target h m}" with a progress bar. Tooltip: "Only Zoom-verified calls started from this system count." It includes the call in progress (live), so the bar moves while the specialist talks.
- **Connections**: number of answered calls today.
- **Points today**: "{n} / 300".
- **Call quality this month**: "{x} excellent · {y} good · {z} bad", or "Unscored" with "{n} calls today".

**Incoming call banner** (live, appears when someone rings this specialist's line):
- "{Name or number} is calling you" or "{Name} is on the line ({m:ss})".
- Sub-line: the number, or "Not a number we know", plus " · line manager" if relevant.
- **Open their case** button (if the caller has a case). If another case is already open: "Close the case you have open to see theirs (nothing you typed is lost until then)."
- **Hide** button (dismisses the banner for that call).
- Hidden while the specialist is on an outgoing call.

**Full case dialog**: almost anywhere on the desk, opening a person ("Full case", "All cases", "Open case to call back"…) opens the **Full case** (section 7) in a large modal titled **"Full case"** with a close (×) button. The page underneath keeps its state and scroll position.

---

### 6.1 Today (desk home)

Sections, top to bottom:

#### A. New tasks from the director (banner, only when there are unopened tasks)
For each task: "**New task from the director:** {count} of {Task label} (and its new learners), {first on your list / after your {List}}." + **Open** button (goes to that task's list). Opening the list marks the task as seen, and the director then sees it as opened.

#### B. My line (live status card)
- A status **lamp** + name + what they are doing now: "On a call · 3:42" / "Being rung" / "Ringing out" / Zoom presence ("Available", "Away"…) / "Status unknown". During a call it also shows the other party's name or number (and "(line manager)" when relevant).
- **Today's calls**: "{n} calls" with "{n} answered" below.
- **Talk-time meter** filling towards the daily target (turns "met" when the target is reached) + "{h m} of {target}".
- Footer: "Points today **{n}** of 300", "Call quality this month **x** excellent · **y** good · **z** bad" (or "**not scored yet**"), and, if live status is off, "Live status needs the Zoom webhook: ask a manager."

#### C. Rang you
- Eyebrow "Rang you · {n} waiting". Title **"Call them back first"**, or **"Nobody is waiting for a call back"**.
- **All missed calls** button (when > 0).
- Up to **4 "rang" cards**. Each card shows:
  - Caller name or number.
  - "{Learner / Line manager / Caller} · rang {12 min / 3 h / 2 days} ago" (tooltip: exact time). The card is highlighted when the caller has waited more than 4 hours.
  - Voicemail: the transcript as a quote, or "Voicemail left · transcript on its way" / "Voicemail left · no transcript". **▶ Play ({n} s)** button, which turns into an audio player.
  - Or "No voicemail".
  - **Open case to call back** (primary, if a case exists), otherwise **See in Missed calls**.

#### D. Call next
Eyebrow "One conversation at a time", title **"Call next"**. This contains the full **Call next** component (section 6.2).

#### E. Your lists
Eyebrow "Everyone to call, by reason", title **"Your lists"**. One **tile** per list (and per director task), in calling order. Each tile shows the **count** (large), the **list name**, and "Covering" for task tiles. Tiles with a count of 0 look "empty". Clicking a tile opens that list.

---

### 6.2 Call next (guided calling screen)

The calling screen that shows one person at a time. It works through the desk's lists **in the Today order** (tasks are placed where the director put them).

**Filter and order** (collapsed under a disclosure "Filter and order", which shows " · filters on" when filters are active):
- **Ticket order** select: Priority order / Oldest first / Newest first (default Newest first). Disabled during a call.
- **Coach / Cohort / Module filters** (section 8.13).

**Empty state:** "**Nobody else to call right now.** Learners come back here when their follow-up is due." (The filters stay visible if they are active.)

**Person view (before the call):**
- Status line: "Next call · learner {i} of {n} · {order}".
- **Name** (large).
- "{Programme or 'Programme not recorded'} · Coach: {coach or 'not recorded'} · {phone}".
- Flags (tags):
  - red: "Rang us {time} and nobody answered: call back now"
  - "Missed call · {n} unanswered"
  - "Promise missed: call again"
- **All cases ({n}[+])** link opens Full case.
- **Why you are calling**: a list of this person's due cases. For each case:
  - the case label, plus the lecture date for missed lectures, or "· {appointment name} · {Thu 15 Oct at 10:00}" for reminders
  - the dates block (section 8.12)
  - "Ask them to: {promise} or {promise}", or the case purpose text
  - **case tools** (only those that apply): Cancel or reschedule (meeting), Employer confirmation panel, **Book with coach**, **Book on coach's page**, **Booking email**, **Email** (learner satisfaction), **Report technical issue**
  - after a catch-up is booked during the call: tag "Catch-up booked: case closed"
- **📞 Call** (big primary button). It shows "Opening Zoom…" while busy. When it can't be used, it is disabled and the reason is shown as a tooltip and as text (see section 12.2).
- **Back** / **Next** (move through the queue without calling).
- **Full case** link.

**During the call:**
- Status line: "On the call".
- **End call** (big primary button). Help text: "Hang up in Zoom, then press End call to record the outcome. Nothing changes on the case until you save."
- **Cancel: the call did not go out** (secondary).

**After End call:**
- Status line: "Call ended: record what happened".
- The **Call outcome form** (section 8.1), with Save label **"Save and next"**.
- **Back to the call** button (the form keeps what was chosen).
- If the same call is saved from Full case meanwhile, this screen moves on by itself: "The call with {name} was saved in Full case."

---

### 6.3 My lists: the call sheets

Each tab is one list. **Which lists appear:**

| List (tab) | Shown on | What it contains (hint text shown at the top of the sheet) |
|---|---|---|
| **Due** | normal desks | "Progress reviews and monthly coaching that are due but not booked yet: send the booking email. EPA: learners past their end date; check their gateway and EPA position and agree the next step." Reason chips: **Monthly coaching**, **Progress review**, **EPA**. |
| **Next Day** | normal desks | "Appointments on the next working day. Confirm each learner will attend; if they cannot, ask them to contact their coach to rearrange." |
| **Missed** | normal desks | "Missed lectures, reviews that were booked but are not completed, and finished reviews waiting for a signature. Agree a catch-up or a new review time; for a signature, ask the learner to sign in the LMS (nothing to book)." Reason chips: **Missed session**, **Missed monthly coaching**, **Missed progress review**, **Missing signature**. |
| **Learner Satisfaction** | normal desks | "Active, Delivery and Onboarding learners: complete a satisfaction review every three calendar months. First reviews are due now. Unanswered calls and emails do not complete a review." |
| **Employer Satisfaction** | employer specialists (or everyone if no employer specialists are chosen) | "Each employer (line manager) with their learners: complete a feedback call every three calendar months. Unanswered calls do not complete a review." |
| **MISSING SIGNATURE** | employer specialists (or everyone if no employer specialists are chosen) | "Employer signatures confirmed missing in the LMS. Call the employer, ask them to sign the review, and use Email to send a reminder." |
| **Extra Calls by Manager** | normal desks | "Additional calls requested by a manager. Follow the request's purpose and record the agreed outcome; the case closes when a specialist resolves it." |
| **Technical issues** | normal desks | "Technical issues raised in the technical support system. A ticket waits there until support closes it; then call the learner to confirm it is fixed and resolve the case." |
| **Follow-ups** | all desks | The cases whose current follow-up was set by **this specialist's own call**. Uses the queue + tabs layout (section 6.4), not the sheet. |
| **{Task label}** e.g. "Sarah's Next Day" or "Shared queue · Missed" | the desk that received a director task | Note at the top: "Covering {Task label}, from the director{, with its new learners}. Your calls count for you." Then the call sheet of that task's people. |

(An "Off-the-job hours" list exists in the code but is paused. Leave room for it to return.)

#### Call sheet layout (applies to every list above except Follow-ups)

**Top:**
- Hint text for the list (table above).
- **Reason chips** (only for Due and Missed): "All (n)", plus one chip per reason with its count (people, not cases).

**Toolbar:**
- **Search** "Find a name, number or coach…". Searches learner / contact / manager name, email, phone, programme, coach and organisation.
- **Call reason** select: "All call reasons" + every reason present.
- **Follow-up timing** select: **All active** / **Due now**. Satisfaction lists default to "Due now".
- **Ticket order** select: Priority order / Oldest first / Newest first.
- **Date filter** select: **All dates** / **Specific day** (date picker "Day") / **Date range** ("From" and "To" date pickers; each limits the other). **Clear dates** button. Error message: "The end date must be on or after the start date."
- **Coach / Cohort / Module** filters (section 8.13).

**Help text lines:**
- "Date filters and oldest / newest use the issue date, then the appointment date or ticket opened date if unavailable. Dates are UK calendar days; a range includes both days. Tickets with unsaved edits stay selected for their contact."
- "Call, press End call when you hang up, choose the outcome, then Save." Followed by one of:
  - "Calls are disabled in the director preview. {name} must sign in to call."
  - "Ask a manager to set up your agent profile before calling."
  - "Zoom Phone opens with your caller ID; keep the Zoom desktop app signed in."
- "Nothing changes on the case until you save; saving moves it on straight away."
- "This section contains {n} open tickets across {n} contacts before the filters below. A contact can have multiple tickets."

**Count bar:** "{from}–{to} of {n} contacts · {order} · One row per contact". On the right: keyboard hint "Tab between fields · Ctrl/⌘ + Enter to save a row".

**Table** (scrollable region; one row per contact; 20 rows per page). **Columns:**

1. **Learner / phone**
   - name (bold)
   - tag "Covered by {name}" (case covered by someone else's task: the row is read-only and greyed) or "For {name}" (a task row)
   - phone, or "No phone recorded"
   - **All cases ({n}[+])** button (opens Full case; not on employer rows)
   - **Report technical issue** button (not on employer rows, employer-signature rows or tech-issue rows)
   - programme status (learner satisfaction rows)
   - **Employer rows:** "Employer email: {email or 'Email not recorded'}" + expandable "**{n} learners · {organisation}**" listing each learner and programme + "Email: …"
   - **Learner rows:** expandable "**Contact details**" with email; either "Learner: {name} · {email}" (when calling the employer about a signature) or "Phone source: {source} · Email source: {source}"; programme; employer; "Line manager: {name}"
2. **Call reason / coach**
   - reason label (bold), e.g. "Missed progress review: PR 3"
   - coach (or organisation for employer rows)
   - lecture / appointment name
   - **dates block** (section 8.12)
   - help-desk ticket "{ticket} · {status}", and "Last status check failed: …" if any
   - status line, one of: "In progress: {name}" / "AI suggests closing: waiting for a manager" / "Rang us: call back now" / "Promise missed: call again" / "Missed call · {n} unanswered" / "Due now" / "Follow-up {date}"
   - **Full case** link
   - expandable "**Other matching tickets ({n})**": each with label, lecture name, dates and a **Full case #{id}** link
3. **Call**
   - **Call** button (primary). In preview it reads **Preview**. Disabled with a reason tooltip when it can't be used.
   - Turns into **End call** while on the call.
   - **Email** button (satisfaction rows and missing-signature rows). Tooltip: "Review and send an email via Microsoft 365".
   - Status text: "On the call: press End call when you hang up" / "Call ended: choose the outcome and Save" / the disabled reason.
4. **Booking**
   - Employer rows: "No coach booking for employer calls".
   - Otherwise: coach name, plus the actions that apply: **meeting status tag + Cancel or reschedule** (section 8.8), **Employer confirmation panel** (8.7), **Book with coach** (8.3), **Book on coach's page** (8.4), **Booking email** (8.5), and a booking hint line (section 11.10).
5. **Outcome**
   - select "Choose outcome…" with this case's choices (section 11.4)
   - help text for the chosen outcome (what will happen to the case)
   - **Complete feedback** link (satisfaction rows; opens the feedback form in a dialog)
6. **Notes / agreed action**: textarea, placeholder "What was agreed? Who will do what, by when?" (max 3,500 characters).
7. **Follow-up**
   - caption "London time"
   - date-time picker
   - quick buttons **+3 days** and **+5 days** (working days, at 10:00 London; tooltip shows the exact date)
   - help: "Back in the list {date}", or "This outcome closes the case, so the date is not used.", or "Now: {current follow-up date}"
8. **Save**
   - **Save** button ("Saving…")
   - row status: "Saved" / "Unsaved" / an error message in red
   - **Discard edits** link (when the row has unsaved edits)
   - rows with unsaved edits are visually highlighted

**Keyboard:** Ctrl/⌘ + Enter saves the row. Pressing End call moves focus to the row's Outcome select.

**Pagination:** **Previous page** · "Page [select] of {n}" · **Next page** · "20 contacts per page" · "{n} unsaved rows across pages" (live warning).

**Empty states:**
- "**No calls in this view.** Correct the date range to see matching tickets." (invalid range)
- "No tickets match these filters. Try another date, call reason or search."
- "Calls appear when matching records are available. Check Connections & call rules for source coverage."

**Dialogs opened from the sheet:** Booking email (8.5), Satisfaction feedback (8.6), Satisfaction / employer email (8.5b).

**Row validation on Save** (show inline in the row):
- "Choose an outcome first."
- "Add a short note: what was agreed and the next action (at least 10 characters)."
- "Choose the date and time for the callback." (when the outcome is Callback)
- "Choose a follow-up time in the future."

---

### 6.4 Follow-ups list (queue + learner tabs workspace)

A two-pane layout.

**Focus session bar** (when active): "**Focus session · Priority calls** · {n} people worked through · {n} remaining" + checkbox **"Open next learner after saving"** (on by default).

**Left pane: the queue**
- Coach / Cohort / Module filters
- Search "Find a learner…"
- **Reason for calling** select: "All call reasons" + the reasons present
- Heading: "**{n} people with your follow-ups**" (or "people with active cases") · "Priority order"
- Person buttons (up to 200). Each shows the name, the reason label, "{coach or 'Coach not recorded'} · {date}" and "{status}{ · Due now}". The selected person is highlighted.
- Empty: "**No people in this list.** Follow-ups you set when saving a call appear here." / "Try another reason or clear the search."

**Right pane: open learner tabs**
- Up to **6 learner tabs** open at once. Each tab has the learner's name + a **×** close button. Opening a 7th shows the error "Close a learner tab before opening another. Your unsaved notes stay in their current tabs."
- Each tab shows a **Learner panel** (section 6.5). Unsaved notes stay in the hidden tabs.
- **Start card** (when no tab is selected):
  - eyebrow "One purposeful conversation at a time"
  - the next person's name (or "Your call desk is ready") and the purpose of their case (or "Choose another list.")
  - **Open next learner** (primary)
  - **Start focus session**
  - note: "Each learner appears once in this list. Their other open issues stay together in the workspace."
- At the end of the list: "You have reached the end of this list."

---

### 6.5 Learner panel (used in Follow-ups tabs)

- Eyebrow: case label. Title: learner name. Sub-line: "{programme} · {employer}", or "Employer · {organisation}" for employer cases. Status tag.
- **All cases ({n})** block (when the person has other cases), grouped as "Lectures · {module}", "Monthly coaching (MCM)", "Progress reviews (PR)" or by label. Intro text: "Review the learner's cases in one conversation. One call covers them all: record what happened for every case in one form." Each case is a button showing: label, "Issue: {date}" / "Appointment: {date}" / "Issue date not recorded", "Opened: {date}", "Follow-up: {date}", "#{id} · {status}".
- Phone line: phone (bold) + "Coach: {coach}". Employer cases show "Learners: {names}".
- Purpose text, dates block, help-desk ticket line.
- **Action buttons:** **Call learner** / **Call employer** (primary), **Book with coach**, **Book on coach's page**, **Booking email**, **Report technical issue**, **Email** (satisfaction).
- Disabled-call note (e.g. "Calls are disabled in this director preview…", or the reason).
- Lateness: "This call is {n} days past its due date. First confirm the learner's current position." or "Call due by {date}".
- Collapsible **Learner context & contacts**: Email, Employer, Line manager, Line manager email, Unanswered calls, In progress with; plus "Last call: {date} · {result} · {outcome}" or "No verified call yet."
- Collapsible **EPA readiness** (EPA cases; open by default): "Figures from the last Aptem sync — check the learner's current position before agreeing the next step." Rows: Gateway review, Programme end, KSBs, Off-the-job hours, Components, Progress variance, Coach RAG.
- Collapsible **Short call guide** (open by default): 3 numbered script lines (opening / what to say about this case / close), plus "AI case review: {summary}".
- **Record this call** section (after Call is pressed): the Call outcome form (8.1) with the Save label "Save the call".
- Otherwise the **Agree the next step** form (8.2).
- For open satisfaction cases: the **Complete feedback** form (8.6). For closed ones: "Next satisfaction review: {date}".
- **Next learner** button.
- Collapsible **Notes, recordings & evidence ({n})**: the list of calls (each "{date} · {result} · {duration}", with "{agent} · dialled manually", "Outcome: …", and a **Recording & transcript** button) + a timeline of the last 12 events + an "Email delivery" list (subject · status, expandable text, errors).

---

### 6.6 Call a learner (employer specialists only)

**List view**
- Title **"Call a learner"**. Intro: "Any learner, at any time. These calls are optional: they are on nobody's list and never overdue. If their satisfaction review is due, you can complete it on the call."
- Search: "Learner, email, employer, line manager or coach".
- Count: "Showing 50 of {n} learners: search to narrow down." or "{n} learners".
- Learner buttons. Each shows the name, "{employer} · {line manager} · {programme}" and "Satisfaction review due" / "Review done {date}" / "No review on record", plus " · no phone number".
- Empty: "No learners match."

**Chosen learner view**
- Name, "{programme} · {employer} · Line manager: {name} · Coach: {coach}", phone (bold).
- Review status sentence, e.g. "Satisfaction review due now; last done 3 Jun 2026 (score 4/5). 2 open cases with the other specialists."
- Note: "An optional call: it is on nobody's list and is never overdue. Saving the call closes it."
- **📞 Call** (primary) · **Back to the learners**
- After calling: the Call outcome form (Save label "Save the call"). Then tags "Call saved." and "Satisfaction feedback saved."
- Collapsible **Satisfaction feedback (optional)**: if the review is due, "Their review is due: this feedback counts as their review once Zoom confirms the call was answered, and it leaves the other agents' lists." + the feedback form. Otherwise the "extra feedback" version of the form, which is kept with the call only.
- **Call another learner** (primary), after saving.

---

### 6.7 Missed calls (desk)

The same **Missed calls** component as the director page (section 9.6). On a desk it shows only this specialist's line.

---

### 6.8 My calls

Three cards stacked:
1. **Calls and what they did** (call log, section 8.15), only the specialist's own calls.
2. **Search call transcripts** (section 8.17), own calls only.
3. **Calls without a recording** (section 8.18).

---

### 6.9 How I'm doing (4 tabs)

#### Tab "This week": **My scorecard**
The weekly scorecard (section 8.16), own row only.

#### Tab "This month": **Your month in calls**
- Eyebrow "{name} · {Month Year}". Title "Your month in calls".
- **Month** picker (cannot go into the future) · **Download my report** (downloads an HTML report: calls, answered, connected time, a daily table and a disclaimer).
- 5 **figures**:
  - Calls made ("{n} answered")
  - Answer rate ("Answered of calls made")
  - Talk time ("Target {x} a day")
  - Learners reached
  - Cases resolved ("{n} worked, still open")
- 2 **charts**: "Talk time per day" ("The gold line is your daily target.") and "Calls per day" ("Answered, and not answered."). See section 8.19.
- Disclaimer: "Covers your own Zoom-verified calls started from this system only. Missing telephone coverage must not be treated as poor performance."

#### Tab "Call reviews": **My call reviews**
- Intro: "The AI rates each of your call transcripts excellent, good or bad. Use the notes to improve your next calls."
- **Month** picker + **AI call rating** filter (All AI ratings / Excellent / Good / Bad / Not rated).
- Totals: Excellent / Good / Bad.
- **How the AI rates calls** (collapsible rules, section 11.13).
- Table: **Call** (time + summary) · **AI rating** tag · **What went wrong** · **What needs to change** · **Review call** button (opens the call review dialog, 8.14).
- Footer: "{n} calls rated this month. AI findings are a guide; talk to your manager if a rating looks wrong."
- No agent profile: "No agent profile is linked, so there are no call reviews to show."
- Empty: "No rated calls in {month}{ with this rating}."

#### Tab "Achievements"
- Card **"Today's badges"**: two badge cards, each "★ Earned" or "☆ In progress":
  - **Call-time target**: "{target} of verified connected calls"
  - **Ten connections**: "10 answered calls"
- Collapsible "How points are earned": "Up to 100 points for reaching your call-time target, and 5 points per answered call up to 100."
- Note: "Figures include only Zoom-verified calls started from this system." (or, with no agent profile: "No agent profile is linked, so no telephone activity is shown. Zero recorded activity is not evidence that no work took place.")
- **Monthly achievements** (history):
  - eyebrow "This month so far" / "Previous month"; title Month Year; "{name} · {email}"
  - **← (Previous month)**, **Achievement month** picker (from Jan 2020 to the current month), **→ (Next month)**, **Current month** button
  - 4 totals: Calls made ("All recorded attempts"), Answered ("{n} not answered · {n} other results"), Connected time ("Answered calls only"), Cases resolved ("{n} days with calls")
  - warning: "Duration is unavailable for {n} answered call(s). Their time is not included in the total."
  - collapsible **Daily breakdown** table: Day, Calls made, Answered, Connected time
  - **Calls made in {Month}** list ("{n} calls"; "Times in Europe/London. Connected durations are recorded by Zoom."). Each call card shows the time, contact name / number, email and number, a result tag, connected time ("Connected time · Zoom", or "No connected conversation"), outcome labels, and an expandable "**View linked cases ({n})**" with buttons "{label} · #{id}" (open Full case)
  - numbered pagination (section 8.20)
  - empty: "No recorded calls in {Month}."

---

### 6.10 Booking links (normal specialists)

The **Coach booking links** table (section 9.13 part A).

---

## 7. Full case (learner workspace)

Opens as a large dialog on the desk, or as a full page for the director (`case=` in the URL, title "Learner call workspace", with a **← Back** button). It shows **one person and everything about them**.

### 7.1 Header band
- Eyebrow: "Learner" / "Employer" · "{n} open case(s)".
- **Name** (large).
- Sub-line: "{programme} · {employer} · Coach {coach}", or the organisation for employers.
- **Flags** (coloured chips; only those that apply):
  - red: "{First name} rang {time}: call back first"
  - red: "Declined tomorrow's meeting in Outlook"
  - amber: "A promise was missed"
  - amber: "{n} call(s) is/are late"
  - gold: "Employer to confirm tomorrow's review"
  - neutral: "Last call went unanswered"
- **Call area** (right): phone number (large), or "No phone number".
  - **📞 Call · {n} cases** (one call covers every due case; disabled with a reason)
  - or "On the call: record it below"
  - or "No case is due for a call now."

### 7.2 Record this call (after Call is pressed)
"**Record this call · {n} cases**" + the **Call outcome form** (8.1), Save label "Save the call".

### 7.3 Left rail
- **Why you're calling**: one button per open case. Each shows the label, the "when" line (e.g. "Lecture 6 Oct · Module X", "PR 3 · Thu 15 Oct at 10:00"), and the due text ("Call by {date}", "{n} days late" in red, "Back on {date}"). Clicking scrolls to that case card and highlights it. Empty: "All of {name}'s cases are closed."
- **Contact**: Phone, Email (mailto link), Employer, Line manager (name + email link + phone), Coach, Unanswered calls, "Being called by" (when someone else is calling).
- Error: "Could not load everything. {error}" + **Retry**.

### 7.4 Case cards (main column, one per open case)
Each card:
- Small label: case type (e.g. "Missed lecture"). Title: the "when" line.
- **Status tag** (To call / Being worked / Callback booked / Waiting for proof / AI suggests closing / Closed / Unreachable / Escalated) + due text.
- Highlighted when selected. Red styling when late.
- **Purpose** text (what to achieve on the call).
- Late warning: "This call is {n} days late: first check where the learner is now."
- Dates block (8.12).
- Help-desk note: "Ticket {id} ({LMS / Aptem / Teams / Others}) · {status} · raised by {name}{ · last status check failed: …}".
- Employer case: "Learners: {names}".
- "AI case review: {summary}".
- **Steps** (open next-day reviews): **Meeting status + Cancel or reschedule** (8.8) and the **Employer confirmation** panel (8.7).
- **Actions** (open cases): **Book with coach**, **Book on coach's page**, **Booking email**, **Satisfaction email**, **Report technical issue**.
- Collapsible **EPA readiness** (open by default): same rows as 6.5, intro "From the last Aptem sync: check the learner's current position before agreeing the next step."
- Collapsible **Satisfaction feedback** (open satisfaction cases): the feedback form (8.6). Closed ones show "Next satisfaction review: {date}".
- Collapsible **Call guide**: the 3-line script.
- Collapsible "**Resolve, record by hand or add a note**" (or "Record an outcome by hand or add a note"): the **Agree the next step** form (8.2).
- **Missed-lecture cases** have an **Attendance panel** beside the card body (8.10).

### 7.5 History (bottom of the main column)
Title **History**, "All {n} cases, open and closed". Four tabs, each with a count:
1. **Calls**: an accordion per call.
   - Closed row: chevron, "{time} · {agent}{ · the learner rang}", result + duration (bold), "{outcomes} · {case labels}", an AI rating tag, and an **inline audio player** for the recording (or "No recording").
   - Open row: each case's outcome (a link to the case: "{label} #{id}" → its outcome), extra recordings ("Recording 2" players), and per recording a collapsible "**Transcript and AI review**" (8.14).
   - "No recording, so no transcript or AI review for this call."
   - Empty: "No calls yet. Calls made with the Call button appear here with their recordings."
2. **Missed calls & voicemails**: each shows the time, "{Missed / Left a voicemail / Hung up while ringing} · {role} · rang {line}", a status tag (amber "Waiting {time}", or green "{Called back / …} · {who}"), the voicemail transcript quote + **▶ Play voicemail ({n} s)**, and the note. Empty: "No missed calls from this person."
3. **Timeline**: every event, newest first: time, event name (section 11.6), "{case label} #{id}", detail text, actor. Empty: "Nothing recorded yet."
4. **Emails**: each email is collapsible: "{subject} · {status} · {time}", the full text, and any error in red. Empty: "No emails sent about this case."

---

## 8. Shared components and dialogs

### 8.1 Call outcome form (one form for the whole call)
Used in Call next, Full case, the Learner panel and Call a learner.

1. **"Did {name} answer?"** button group: **Answered** · **No answer** · **Wrong number** · **Asked for a callback**. The chosen one is highlighted.
   - For anything except Answered, this help text is shown and the answer applies to every case on the call:
     - No answer: "Saved as a missed call on every case. They come back on the follow-up date, or the next working morning."
     - Wrong number: "Recorded on every case with your note. They come back on the follow-up date, or the next working day."
     - Callback: "Every case comes back to the list at the time you choose."
     - Followed by: "This is saved for the case / all {n} cases."
2. **If Answered: "Outcome of each case"**
   - Header: "{n} cases · {x} of {n} recorded".
   - **Set every case to…** select (when there are 2+ cases): Reached: each case's first agreed action / Callback requested / Refused or problem / Not discussed: keep it open.
   - Cases of the same kind are **grouped** ("Missed lecture ×5"), with a toggle link **Answer them together** / **Answer each one**. Together: one select "Choose outcome for all {n}…". Separately: one row per case, labelled by date or name.
   - Each case row: a **select** "Choose outcome…". Choices:
     - the agreed actions (e.g. "Agreed: Book a catch-up session (within 3 days)", "Agreed: Attend this lecture with Group B on Thu 6 Nov at 14:00 (closes the case)"), or "Reached: complete the feedback after saving" for satisfaction cases
     - **Done: resolve the case** (cases the specialist can close)
     - Callback requested
     - Refused or problem
     - Not discussed: keep it open
   - Help text under each choice. For example, resolve on a review that still needs the employer step: "A progress review is confirmed with the employer too: save the employer step first, or choose another outcome."
   - Per-case collapsible "**Note for this case**" (or "**Note, booking and email**" when tools are available): textarea "Only for this case, added to the shared note" + that case's tools (book, email…).
3. Lines for cases closed during the call: "{label}: catch-up booked, case closed."
4. **Note** textarea: "Note (optional)" with placeholder "Anything to remember for the next call" (for No answer), or "Notes / agreed action" with placeholder "What was agreed? Who will do what, by when?".
5. **Follow-up** date-time: label "Callback date and time (London)" when a callback is chosen, otherwise "Follow-up (London time, optional)". Quick **+3 days** / **+5 days** buttons. Help: "Back in the list {date}" or "These outcomes close every case, so the date is not used."
6. Error / validation line + **Save** button ("Save and next" / "Save the call", "Saving…"). Validation messages:
   - "Choose whether {name} answered."
   - "{n} cases still need an outcome."
   - "Add a short note: what was agreed and the next action (at least 10 characters)." (not required for No answer)
   - "Choose the date and time for the callback."
   - "Choose a follow-up time in the future."
   - If the call was already saved on another screen: "The call with {name} was already saved."
7. **After saving with reached satisfaction cases**, a dialog opens with the **Complete feedback** form for each in turn, plus the note: "The call is saved. If Zoom has not reported it yet, close this and complete the feedback from the case later."
8. Empty: "Every case on this call is already closed."

### 8.2 "Agree the next step" form (record by hand / resolve / note)
- Title "Agree the next step" (compact version).
- **Outcome and agreed action** textarea (placeholder "What was agreed, who will act and by when?", max 5,000).
- **Call outcome** select (same choices as the sheet).
- Follow-up date-time ("Callback date and time (London)", required for callbacks, or "Follow-up date (London, optional)") + **+3 days** / **+5 days**. Hidden when the outcome closes the case.
- Help line (what happens next).
- **Buttons** (only those that apply):
  - **Save next step** (primary)
  - **Resolve case**, or **Approve and resolve** when the AI has suggested closing. Only for directors, or cases the specialist closes. Needs a note.
  - Satisfaction cases: a reason select (**Wrong number** / **Refused feedback** / **Could not be reached**) + **Close without feedback** (needs a note).
  - **Reject AI suggestion** (when the AI has suggested closing)
  - **Reopen case** (closed cases; needs a note)
  - **Archive** (directors, closed cases)
  - **Save as note** (needs a note)
- Footer message, one of:
  - "Preview is read-only. Specialists save outcomes for the cases they are working on."
  - "Ask a manager to set up your agent profile before recording outcomes."
  - "{name} is working on this case."
  - Promise line: "Waiting for the learner / Promise missed: {promise} by {date}."
  - "Use Complete feedback after the answered call; ordinary outcomes do not complete the review."
  - "The outcome goes with your last call to them; with no call from Zoom it is saved on the case without one."
  - "The case closes by itself when the learner's action shows up; if it does not by the deadline, it comes back to the queue."
- Success messages: "Next step saved.", "Case resolved.", "Review closed. The next one is due in three months.", "AI suggestion rejected.", "Case reopened.", "Case archived.", "Note saved."

### 8.3 Book with coach (button + dialog)
- Button **Book with coach**. Disabled in preview, with tooltip "Read-only preview".
- Dialog **"Book with coach"**:
  - "For {learner}. Goes straight into the coach's LMS calendar with a Teams meeting; both get the invitation. Times are UK time."
  - **Session** radio buttons (when there is more than one type, e.g. Catch-up session / Student support session).
  - Catch-up: "Missed lecture: **{title}** on {date}".
  - **Coach** (read-only field).
  - **Date** select: "{Tue 6 Oct} ({n} free)", or "No free times in the next 2 weeks".
  - **Time (UK)** select ("Pick a date first").
  - Catch-up only: **Reason for the absence (ask the learner)** select (reasons come from the server). If the reason is "Other": a text field "What was the reason?" (at least 3 characters).
  - **Book** button ("Booking…").
  - Loading: "Checking the coach's calendar…". If the slot was just taken, the times reload automatically.
  - Success message: "Booked with {coach} on {time}. The learner and coach have the Teams invitation. Confirmation email sent to {email} / recorded on the case (dry run: not sent) / not sent: {error}. Note: {warning}".
  - Booking a catch-up **closes** a missed-lecture case.

### 8.4 Book on coach's page (button)
Opens the coach's Microsoft Bookings page for this review in a new tab. Tooltip: "Opens the coach's {progress review / monthly coaching} booking page in a new tab. Book it under the learner's own name and email." Shown only when the coach has an https booking link for that review type.

### 8.5 Booking email (dialog)
- Title **"Booking email"**. "College template with only this case's booking link. Nothing is sent automatically."
- Two columns:
  - **Left, edit:**
    - **To** (read-only)
    - **Subject** (editable, max 180)
    - **Message** (editable, max 5,000)
    - note "The greeting, the "{link label}" button and the sign-off are added for you."
    - **Reset to the standard wording** link (after editing)
  - **Right, live preview:** the rendered HTML email (it updates shortly after typing stops). Note: "The booking page opens in a new tab. Your email draft stays here."
- **Buttons:**
  - **{Link label} ↗** (opens the booking page)
  - **Send email** / **Send (dry run: record only)** / **Check / retry this email** / **Sent** / **Recorded** (primary)
  - **Copy email** (copies rich HTML)
  - **Open in my mail app** (mailto)
- **Checks panel** "What this email needs before it can be sent", in two groups: "This email" (recipient, link) and "Sending it from the call centre" (gateway, quota…). Each check is **Ready** / **Check** / **Missing** + label + detail.
- Messages:
  - "Send needs: {missing thing}. {detail}"
  - "Email copied. Open a new email, then paste it in. Nothing has been sent."
  - "The browser blocked copying. Select the preview and copy it instead."
  - "Recorded on the case (dry run): nothing was sent to {email}."
  - "Accepted by Microsoft 365 for {email} and recorded on the case."
  - "{error} Pressing Send again checks this same email; it is never sent twice."
- After pressing Send, the wording is **locked** (a retry sends the identical email).
- For missing-signature cases, the email can go to the **learner** or to the **employer** (recipient role).

### 8.5b Satisfaction email (dialog)
- Title "**Learner satisfaction email**" / "**Employer satisfaction email**".
- "From: {sender}. The greeting and college sign-off are added automatically."
- If sending isn't possible: an alert with the reason.
- **To** (read-only), **Subject**, **Message**.
- **Send via Azure** button, then "Sending…" / "Check / retry request" / "Request recorded".
- "Only sends when you click. Sending an email does not complete a satisfaction review."
- Statuses:
  - "Sending to Microsoft 365…"
  - "Accepted by Microsoft 365 for {email}. Delivery is not yet confirmed. The review remains open."
  - "The email is still processing. Check status before sending another message."
  - "{error} Use "Check / retry request" to check this same request without duplicating it."

### 8.6 Complete satisfaction feedback (form)
- Title "**Complete learner feedback**" / "**Complete employer feedback**".
- Explanation: "{name}: saving completes this review once Zoom confirms the call was answered (you do not need to wait); the next is due in three calendar months." (Extra-feedback version: "…their review is already done for this period, so this feedback is kept with the call and changes no dates.")
- If earlier feedback was dropped: "The feedback saved {time} was not used: Zoom reported the call as not answered. Call again, then complete the review."
- **Fields (all required):**
  - **Satisfaction score**: 1 Very dissatisfied / 2 Dissatisfied / 3 Neutral / 4 Satisfied / 5 Very satisfied
  - **{Learner / Employer} feedback** (at least 10 characters)
  - **Issue raised (write None if there is no issue)**
  - **Agreed action, owner and date (or No action needed)**
- **Complete review** button ("Saving…").
- **Saved and waiting for Zoom** state: "**{Learner} feedback saved.** Saved {time} by {name}. It completes this review as soon as Zoom confirms the call was answered, usually within a few minutes. You do not need to wait here or save it again." + "If Zoom reports the call as not answered, the review stays open and this page says so." + **Change the feedback** button.
- Success messages: "Feedback completed. Next review is due in three calendar months." / "Feedback saved. It completes the review as soon as Zoom reports the call answered (usually within 10 minutes)."

### 8.7 Employer confirmation panel (next-day progress reviews)
- Header "**Employer confirmation**" + tag (green = confirmed, red = a negative final answer, amber = "Not confirmed yet").
- Line manager name · email (mailto) or "no email on record" · phone or "no phone in Aptem".
- Last result line: "{by} · {time} · "{note}" · {n} tries".
- While not done:
  - **📞 Call employer** (primary, only when a phone number exists)
  - select "What did the employer say…": Employer confirmed the review / Employer says the learner cannot attend / No answer: try again / Could not reach the employer / No line manager on record
  - note field: "What happened (needed)" for "cannot attend" and "could not reach", otherwise "Note (optional)"
  - **Save employer step**
- Success: "Employer step saved for {name}: {result}."
- The reminder case **cannot be resolved** until this step has a final answer.

### 8.8 Meeting status + Cancel or reschedule (next-day reminders)
- **Tag**: "Accepted in Outlook" (green), "Tentative in Outlook" (amber), "No reply in Outlook" (amber), "Declined in Outlook" (red), "Confirmed on a call" (green), "Cancelled in Outlook" / "Removed from Outlook" / "Cancelled from the Engagement Centre" (red).
- **Cancel or reschedule** link (when the meeting can be cancelled), which opens a dialog **"Cancel or reschedule"** (with title bar and ×):
  - "**{name}'s meeting.** Outlook tells {name} straight away, the LMS calendar entry changes with it, and the coach gets a note."
  - **What to do** (radio): "Cancel only: the learner books a new time with their coach" / "Cancel & reschedule: move it to a time the coach is free".
  - Reschedule: **Day** select (shows "Finding the coach's free times…" while loading, or "No free times in the next 2 weeks") + **Time (UK)** select.
  - **Why** (radio): The learner cannot attend / The learner asked to cancel / Rebooked for another time (cancel only) / Other.
  - **Note for the coach (optional)** (placeholder "For example: shift changed, mornings suit better").
  - Error notice (8.21).
  - **Cancel the meeting** / **Move the meeting** (primary) · **Keep it as it is**.
  - Success: "{name}'s meeting is cancelled. Outlook has told them and their coach has a note." / "…is moved to {time}. Outlook has sent them the new time and their coach has a note."

### 8.9 Report technical issue (button + dialog)
- Button **Report technical issue**. Disabled with a tooltip: "Read-only preview" / "Technical support is not connected on this server (CALLCENTRE_HELPDESK_URL)" / "Your account cannot act on this desk".
- Dialog "**Report a technical issue for {learner}**":
  - "This raises a ticket in the KBC technical support system for the learner's email. A Technical issues case follows it: when support closes the ticket, call the learner to confirm it is fixed."
  - **The issue is with** select: LMS / Aptem / Microsoft Teams / Something else
  - **What is wrong?** (at least 10 characters, max 3,000). Placeholder "What the learner was trying to do, what happened, any error message, and since when."
  - **Raise ticket** ("Raising ticket…")
- Success: "Ticket {id} raised in technical support. Follow it in Technical issues."

### 8.10 Attendance panel (beside missed-lecture cases)
- Header "**Attendance**" + summary "{n} attended · {n} absent · {n} not marked · **{rate}%**".
- If not set up: an alert with the server's reason.
- **Covering-lecture hint** (when the learner attended the same lecture with another group): "**Attended the same lecture with another group?** {lecture} of {module} on {date} shows as attended{, but this learner's lectures are usually on {weekday}}. Confirm with the learner that it covered the missed {date} lecture." + a one-click button: **"Learner confirmed: mark {missed date} attended, delete {covering date}"**.
- **Lecture list** (by default the 2 lectures before and 2 after the missed one). Each lecture shows:
  - the date
  - "{lecture} · {module}"
  - the source: "This case's missed lecture" / "Possible covering lecture" / "KBC register" / "Live register", plus " · corrected"
  - a status tag: Attended (green) / Absent (red) / Not marked
  - buttons **Mark attended** / **Mark absent** / **Delete** (only those that apply)
  - The missed and covering lectures are highlighted.
- **Inline correction form** under the lecture: "**{Action}:** {date}, {lecture}. This changes the LMS register too." **Reason** select (from the server) · "**What the learner said**" (required when the reason is Other) · **Save the correction** / **Cancel**.
- **Show all {n} lectures** / **Show the lectures around the missed one** toggle.
- Collapsible "**Corrections on this case ({n})**": "{action}: {date} · {reason}" · "{actor} · {time} · Not saved: {error} / Undone by {name} / AI check: {label}" · "{note}".
- Success: "Register corrected in the LMS." / "Register corrected in the LMS: both lectures changed."
- Empty: "No lectures in the register for this learner." Loading: "Loading the register…" (+ **Try again** on error).

### 8.11 Dialog behaviour (all dialogs)
- Modal. Closes with **Escape**, a click on the backdrop, or the **Close** button. Titled dialogs have a header with **×**; untitled ones have a **Close** button at the bottom.
- Closing a nested dialog (e.g. Booking email inside Full case) must **not** close the parent.
- The Full case dialog keeps the page scroll position and returns focus to the button that opened it.

### 8.12 Case dates block (shown on most case rows and cards)
Only the dates that exist are shown. Missing source dates are never invented.
- EPA cases: "Programme end: {date}", "Gateway review: {date}" (or "Not recorded").
- "{Missed lecture date / Review due / EPA follow-up from / Issue date}: {date}", or "Not recorded in source".
- Missed lectures: "Lecture: {title}", "Lecture time: 10:00–12:00 (London)", or "Multiple sessions — confirm in timetable" / "Timetable temporarily unavailable" / "Not recorded in source".
- "Appointment: {date time} (London)".
- "Ticket opened: {date}" (tooltip with the exact time).
- "Call due by: {date}".
- "Next follow-up: {date time} (London)".

### 8.13 Coach / Cohort / Module filters
Three selects, **Coach**, **Cohort**, **Module**, each with "All coaches / All cohorts / All modules", the values present in the list (sorted), and "Not recorded" last. **Clear coach / cohort / module** button when any filter is set. An active filter is kept even if a refresh removes its last matching case.

### 8.14 Call review / recording / transcript viewers
- **AI call review panel**: "**AI call review**" + rating tag + summary + "**What went wrong**" bullets + "**What needs to change**" bullets + "AI findings are a guide for coaching; a manager reviews them before any action." A bad rating is styled as an alert; otherwise as success. Without a review: "AI review: Awaiting AI review".
- **Call review dialog**: "Call review · {specialist}", the time, the review panel, and "**Call transcript**" (full text, or "The transcript is empty.").
- **Recording dialog** "**Call recording and transcript**":
  - a table of recordings: owner + "{type} · {n} seconds", transcript status (+ error), and the buttons **▶ Play** (inline audio; "Zoom could not play this recording. It may have been deleted in Zoom.") and **Read transcript**
  - then "Call transcript" + **Download text** + the AI review panel + the text, or "The transcript is pending. Check Zoom transcription settings and allow processing time."
  - "No recordings have been synced for this call."
- **Transcript and AI review** (collapsible, used in call lists): the label + status, loaded when opened. It shows the AI panel, the transcript text and **Download text**, or "The transcript is not ready yet. Zoom usually takes a few minutes after the call."

### 8.15 Call log ("Calls and what they did" / "Call monitor")
- Title: "Calls and what they did" (specialist) / "**Call monitor**" (director).
- Intro: "Every call started with Call, and what it did to each case: the outcome, cases closed, sessions booked and satisfaction feedback. A call made from the Zoom app directly is not here."
- Controls: **Specialist** select (director overview only: Everyone + each specialist) · **Period** (Today / Last 7 days / Last 30 days / Last 90 days) · **Refresh**.
- 5 totals:
  - Calls ("{n} answered")
  - Zoom has no call ("Not counted")
  - Cases closed ("By you" / "By specialists")
  - Sessions booked ("With coaches")
  - Satisfaction feedback ("Reviews completed")
- **Call accordion rows.** Closed row:
  - time (+ specialist name for the director)
  - contact name or number
  - "{n} cases · {n} closed · {n} booked{ · the learner rang}"
  - **Zoom result**: "Waiting for Zoom" (tooltip: "Zoom reports a call about 10 minutes after it ends."), "Zoom has no call" (red; tooltip explains why), or the result + duration (green when answered, red when it failed)
  - AI rating tag
  - "Form not saved" (red)
  - **inline audio player** (or "No recording yet" / "No recording")
- Open row:
  - facts: email, number, "Answered under 10 s: voicemail?", "Voicemail: saved as No answer / the transcript is a greeting · counted as not answered", "Form saved {m s} after the call", **Open the learner's case** (primary)
  - **per case**: a link "{label} · #{id}", a "Now: {status} · back {date}" tag, the outcome (bold) with tags ("Applies when Zoom reports the call" amber, "Not applied: {reason}" red, "Zoom says {result}: check this outcome" red), "Follow-up {time}", "Promise due {date}", the note, "Closed by this call: {note}", **Booked** boxes (session type, time, coach, join link, link warning), and a **Satisfaction feedback** box (state, a mismatch tag, score / 5, problem, agreed action, note)
  - extra recordings, and the transcript + AI review per recording
- Numbered pagination. Empty: "No calls in this period."

### 8.16 Weekly scorecard
- Title "My scorecard" / "Weekly scorecards" / "Week by week".
- "Monday to Sunday, from calls Zoom confirmed. The target counts the working days so far."
- **Previous week** · "Week of {date}" · **Next week** (cannot go into the future).
- Table columns:
  - **Specialist** (+ working days)
  - **Calls** (+ answered + reach %)
  - **Talk time** (+ target, + "incl. {time} with {n} who rang")
  - **Learners reached** (+ cases closed)
  - **Call-backs** ("{done} of {received}", "typically {n} min" / "none yet")
  - **After-call form** (typical time to save)
  - **Call quality** (excellent · good, bad in red)
  - **To look at**: red warnings such as "{n} answered under 10 s (voicemail?)", "{n} calls without a saved form", "{n} answered calls not recorded", "{n} still waiting for a call back", or a green "Nothing" tag
- Empty: "No active specialists."

### 8.17 Search call transcripts
- "Find every call / your calls where a phrase was said, e.g. "gateway", "withdraw" or a coach's name."
- **Phrase** input (3 to 100 characters) · **Period** (Last 7 / 30 / 90 days) · **Search** (primary).
- Results table:
  - **Call**: learner email, time (+ specialist), "{n} mentions"
  - **What was said**: snippets with the match **highlighted**
  - **Recording & transcript** button
- "Searching…". Empty: "No call in this period mentions "{phrase}"." Limit note: "Showing the 50 newest calls: narrow the phrase or the period."

### 8.18 Calls without a recording
- "Calls without a recording ({n})". "Answered calls of 30 seconds or more with no recording in Zoom three hours later: no transcript and no AI review. Usually automatic recording is off for that number: check it under Zoom Phone → Zoom accounts → Numbers."
- **Period**: Today / Last 7 days / Last 30 days.
- Table: **Call** (time, duration, "they rang" / "called") · **Specialist** · **Number** · **Learner**.
- Empty: "Every answered call in this period was recorded."

### 8.19 Charts
- **Talk time per day**: stacked bars per working day (weekends dropped), one colour per specialist, hours on the Y axis, a **gold dashed target line** labelled "Target {time}", a legend when there are several specialists, and tooltips. Empty: "Talk time appears here as Zoom confirms the month's calls."
- **Calls per day**: stacked teal "Answered" + lavender "Not answered" bars, legend, tooltips. Empty: "Calls appear here as Zoom confirms them."
- **Horizontal bar lists** (cases by reason, by stage): label + track + number, readable at any width. Empty: "Nothing to show."
- **Quality strip**: one proportional bar (excellent / good / bad) + "{x} excellent · {y} good · {z} bad". Empty: "No rated calls".
- **Figure tiles**: label, big number, hint. Optional "bad" (red) or "good" tone.

### 8.20 Pagination styles in use
- Numbered: **←** · 1 … 4 **5** 6 … 20 · **→** (call log, monthly history).
- Previous page / "Page [select] of n" / Next page (call sheet, review meetings).
- Previous page / "Page n" / Next page (Zoom call evidence, transcripts).

### 8.21 Error notice (form errors)
A red box: "**{Action} failed.**" + the message + "The field to fix is marked below." + "Reference for the server log: `{ref}`" + collapsible "Technical details" (developer only) + "HTTP {status}". It scrolls into view by itself. **Form fields** show their own error under the input and a hint line ("where to find this value").

---

## 9. Director workspace

### 9.0 Director page header (all director pages)
- Eyebrow: "Kent Business College · Engagement · Director".
- H1: the page title (Overview, Specialists, Scorecards, Calls, Coach booking links, Learner allocation, Zoom Phone, Settings, Review meetings, Missed calls & voicemails, Task delegation, Attendance edits), or "Learner call workspace" when a case is open.
- Sub-line: "{long date} · {director name}".
- Buttons:
  - **← Back** (when a case is open)
  - **+ Request a call** (primary; opens 9.16)
  - **Refresh**
  - For non-directors on Zoom Phone: **← Calling workspace**
- The global status line sits under the header.

### 9.1 Overview
1. **The board today (Switchboard).** Header: "{n} on a call now · live from Zoom", or "Live status needs the Zoom webhook (Zoom Phone → Zoom accounts)."
   - Key: ● On a call · ● Ringing · ● Available · ● Away or offline.
   - One line per specialist (clickable; opens their page). Each line has a lamp, the name, what they are doing ("On a call · 4:12 · Jane Smith", "Being rung", "Ringing out", presence label), "{n} calls" with "{n} answered", a talk-time meter towards the target, and "{h m} of {target}".
   - "Shared line: {caller} (on a call / ringing)". "Zoom status: {error}".
   - Empty: "No active specialists yet. Add one under Zoom Phone."
   - Updates every 5 seconds while visible; the timers tick every second.
2. **Needs you.** A list of action items, each "**{count}** {label} →", which opens the right page. Only items with a count above 0 are shown:
   - AI suggestions to approve or reject → Calls
   - learners waiting for a call back → Missed calls
   - cases past their call date → Specialists
   - calls rated bad this month → Calls
   - learners in the shared queue → Learner allocation
   - Zoom changes that stop matching or recording → Zoom Phone
   - answered calls Zoom did not record (7 days) → Zoom Phone
   - data sources not reading → Settings
   - Empty: "Nothing is waiting for you right now."
3. **The month in calls** (eyebrow "The month in calls so far"; title "October 2026"). **Month** picker (no future months). 6 figures:
   - Calls made ("{n} answered")
   - Answer rate
   - Talk time ("Confirmed by Zoom")
   - Learners reached ("Added up per specialist")
   - Cases resolved ("{n} by AI review · {n} by evidence")
   - Cases gone late ("Passed their call date this month"; red when > 0)
   - Plus 2 charts: **Talk time per day** ("Each colour is a specialist; the gold line is the team's daily target.") and **Calls per day** ("Answered, and not answered (voicemail, no answer, busy).").
4. **The team** (eyebrow "Ranked by talk time this month") + a **Weekly scorecards** button. Table:
   - **Specialist** (rank number + name; clickable)
   - **Today** ("{time} of {target}", live)
   - **Calls** (+ answered)
   - **Answer rate**
   - **Talk time**
   - **Resolved**
   - **Call quality** (strip)
   - **Their open cases** ("{n} past their date", red)
   - Empty: "No active specialists."

### 9.2 Specialists (index)
A grid of **specialist cards** (ranked by talk time). Each card is clickable (opens their page) and shows:
- the name and Zoom presence ("Status unknown")
- a today meter + "{time} of {target} today"
- "Now on **{list}**: {n} done, {n} to call · {n} done today" (or "Every list called")
- 4 figures: calls, answered %, talk, open cases
- a quality strip

Empty: "No active specialists yet. Add one under Zoom Phone."

### 9.3 Specialist page (one specialist up close)
- Breadcrumb: **← All specialists** + quick buttons for every other specialist.
- Title block: eyebrow "Specialist · {phone number}", name, "Ranked {n} of {n} by talk time this month · Zoom checked {time}" (or "Zoom not checked yet"). Button **See {first name}'s desk** (primary; opens their desk).
- Zoom error alert: "Zoom: {error}".
- **Now**: their switchboard line (live).
- **{Name}'s lists** (eyebrow "Today, list by list as Call next takes them"; legend "Done: a result saved today (any outcome). To call: due now. Waiting: on the list, not due yet."):
  - list tabs, each "{list}" (+ a "**Now**" badge on the current list), "**{n}** done", "{n} to call · {n} waiting"
  - two panels for the selected list:
    - "**Done today: {list}**": the person (link to Full case), the result ("Reached · closed", "Feedback completed", "Not discussed"…) and the time. Empty: "Nobody yet today."
    - "**Still to call: {list}**": the person (link) and "Last call not answered" / "{n} missed calls" / "Not called yet". Empty: "Nobody to call on this list now."
- **{Name}'s calls** (eyebrow "The month so far"): 5 figures (as 6.9 "This month") + Talk time per day / Calls per day charts ("The gold line is {name}'s daily target.").
- **Caseload and quality** (eyebrow "Learners allocated to {name}"), three panels:
  - **Why they are on the list**: horizontal bars by reason (top 8) + "**{n}** open cases"
  - **Where the cases stand**: bars for Due to call now, Past their call date, Waiting for the learner, Last call not answered, Promise broken
  - **Call quality this month**: quality strip + up to 4 "rated bad" calls (time + what went wrong; clickable to the review dialog), or "No calls rated bad this month."
- **Week by week**: the scorecard (8.16) for this specialist.
- **Call monitor**: the call log (8.15) for this specialist.
- If the specialist is inactive: "This specialist is not active any more." + **All specialists**.

### 9.4 Scorecards
- Card **"Monthly report · {month}"**: "{n} calls, {time} of talk time and {n} cases resolved, per specialist. Change the month on the Overview." + **Open the monthly report** (primary).
- **Weekly scorecards** (8.16) for all specialists.
- **Monthly report dialog**: "Monthly engagement report · {month}" containing:
  - a table: Specialist, Calls, Answered, Talk time, Resolved, Cases gone late
  - "Most talk time: {name}"
  - "Resolutions: By specialists {n} · by AI review {n} · by source evidence {n}. Unclaimed SLA breaches: {n}."
  - a disclaimer
  - **Download report** (an HTML file)

### 9.5 Review meetings (Outlook audit)
- Eyebrow "From the coaches' Outlook calendars". Title: the date range (e.g. "31 Oct – 14 Nov 2026"). "Outlook read {time}." (or "Outlook not read yet.") "Every progress review and monthly coaching meeting, kept in step with Outlook every few minutes."
- Controls: **From** date, **To** date (default today + 14 days), **Refresh**, **Download CSV** (disabled when empty).
- Sync error alert.
- **Status filter tabs**, each with a count: All · Going ahead · Confirmed on a call · Declined in Outlook · Cancelled · Cancelled by us · No learner matched.
- Search "Find a learner, coach or title…".
- Table:
  - **When** (day + time)
  - **Meeting** (Progress review / Monthly coaching + subject)
  - **Learner** (name + "invited by email / named in the title / surname, coach's learner", or an amber "No learner matched" tag)
  - **Coach** (email)
  - **Outlook reply** tag (Accepted / Tentative / Declined / No reply / "Not known")
  - **Status** tag (Going ahead / Confirmed on a call / Cancelled in Outlook / Removed from Outlook / Cancelled from the Engagement Centre) + by whom, when and why
  - **History** link
- Pagination: 25 per page, "{n} meetings · 25 per page". Empty: "No meetings match."
- **Meeting history dialog**: "{type} · {date time} · {learner} · {coach}", the subject, "Reminder case {ids}", and an event list (time, event label, detail, actor). Event labels are in section 11.8.

### 9.6 Missed calls & voicemails (also the desk "Missed calls" page)
- Title changes with the tab: "**Missed calls to call back**" / "**Enquiries**" / "**Voicemails**".
- Intro per tab:
  - Call-backs: "Learners and line managers who rang and nobody answered, with any voicemail they left. Call them back from their case (the Call button), so the call counts: it closes here by itself, and their cases sit at the top of the list until then."
  - Enquiries: "Numbers we do not know that rang and nobody answered: usually people asking about apprenticeships. Who rang, when, and what their voicemail said."
  - Voicemails: "Every voicemail left on the team's lines, from learners, line managers and numbers we do not know: who rang, when, the transcript, and a Play button."
- **Tabs**: **Call-backs** · **Enquiries** · **Voicemails**.
- **Show** select: Still to call back / Done (+ "All in the period" on Voicemails, which is its default).
- **Period**: Today / Last 7 days / Last 30 days / Last 90 days.
- **Refresh**.
- 4 totals:
  - Still to call back ("All time")
  - Missed ("In the period")
  - Called back ("{n} within an hour")
  - Typical wait ("Until called back")
- Table:
  - **Who rang**: name or number; "{number} / Not a number we know · {role}"; email
  - **When**: time, result (Missed / Left a voicemail / Hung up while ringing), the voicemail transcript quote or "Transcript on its way" / "No transcript", and a **Play voicemail ({n} s)** button that becomes an audio player
  - **Number they rang**: line + specialist (or "Shared line")
  - **Waiting / Done**: a wait-time tag (amber after 1 h, red after 4 h), or "{Called back / Rang again and got through / Marked done} · {who} · {when} · after {wait}" + the note
  - **Actions**: **Open case to call back** (primary, if there is a case); open items: an input "What happened (to mark done)" + **Mark done** (needs text); done items: **Reopen**
- Empty: "Nobody is waiting for a call back." / "None done in this period."

### 9.7 Calls
1. **Cases waiting for a manager ({n})** (only when there are any): "The AI read the call and suggests the case is done. Check its summary, then approve (the case closes) or reject (it goes back to the list)." Table:
   - **Learner** (+ case label)
   - **AI summary** (+ "Confidence {n}%")
   - **Your reason** textarea
   - **Approve and resolve** (primary; needs a reason, else "Add a short reason before approving.") · **Reject** · **Open case**
   - Empty: "No AI suggestions are waiting."
2. **Calls rated bad**: "The AI rates each call transcript excellent, good or bad as it arrives. Calls rated bad are listed here with what went wrong and what to change. AI findings require a human review."
   - Table: **Call** (specialist + time) · **What went wrong** · **What needs to change** · **Review call**
   - Plus "How the AI rates calls" rules
   - If AI is off: "AI call review is switched off, so transcripts are not being rated."
   - Empty: "No calls rated bad in {month}."
3. **Call monitor**: the call log (8.15) for everyone, with the specialist filter.
4. **Search call transcripts** (8.17), across all calls.

### 9.8 Attendance edits
- "Lectures marked attended or absent, or deleted, on missed-lecture calls. Each one changed the learner's register in the LMS. After the call the AI reads the transcript and says whether the learner confirmed it."
- Controls: **AI check** filter (All + the server's states) · **Period** (7 / 30 / 90 days) · **Refresh**.
- Not-set-up alert.
- 4 totals:
  - Corrections ("In the period")
  - Confirmed on the call ("By the AI")
  - To review ("Not confirmed, unclear or no call")
  - Waiting ("For the transcript")
- Table:
  - **When** (+ actor)
  - **Learner** (+ email)
  - **Lecture** (date, "{lecture} · {module}", "Live register" / "KBC register")
  - **Change and reason** (action, reason, note)
  - **AI check** tag (green confirmed; red not confirmed; amber unclear / no call / no recording) + the evidence quote
  - **Actions**: "Not saved in the LMS: {error}", or "Undone by {name} · {when}: {note}", or **Open case** + **Undo** (directors). Undo opens an inline "**Why undo it?**" textarea + **Undo in the LMS** / **Cancel**.
- Success: "Undone: {learner}'s {date} lecture is back as it was in the LMS."
- Empty: "No attendance corrections in this period."

### 9.9 Task delegation
1. **Hand over a list** (eyebrow "Until you recall it"): "Choose whose list, then the whole list or some of its learners, and who calls them. Their calls count for them; recalling gives everything back as it stands." Button **Mark someone absent…** (primary; opens the dialog).
   - **Step 1, Whose list** select: each specialist (" (absent)" when absent), **Shared queue**, **Employer calls** (when employer specialists exist).
   - **Step 2, Which list**: tiles (radio) for Next Day, Missed, Due, Learner Satisfaction, Employer Satisfaction, Extra Calls by Manager, Technical issues, Follow-ups. Each shows the count and the name, and "{n} already covered".
   - **Step 3, Which learners** (radio): "The whole list ({n}), and its new learners" / "Chosen learners". Chosen learners adds:
     - a **First** [n] number field + **Pick the first {n}** + **All** + **None** + "{n} chosen"
     - a checkbox list of people ("{n} cases", or "Covered by {name}", which is disabled)
     - Empty: "Nobody on this list right now."
   - **Step 4, Give it to** (one fieldset per part):
     - **Specialist** select
     - **Learners** count (when there are several parts; the last part shows "The rest ({n})")
     - **On their Today page** select: "First, before everything" / "After their {List}"
     - **Remove part** link
     - **Add another specialist** · **Split evenly**
     - **New learners on this list go to** select ("Stay with {from}" / each part)
   - **Delegate the whole {List}** / **Delegate {n} learners** (primary).
   - Validation: "Choose who receives each part." / "Choose the learners to hand over."
   - Success: "{List} delegated."
2. **Absent** (eyebrow "Away now"; only when someone is absent): a row per absent specialist with "Since {time} · line cover {name}", a checkbox "**Recall all their tasks now**" (on by default) and **Mark back in**. Success: "{name} is back{ and has their lists again}."
3. **Tasks** (eyebrow "What each task did") with a **Day** picker (no future dates) + **Refresh**. Table:
   - **List** (task label + "While absent · " + position)
   - **Covered by** (+ "Not opened yet")
   - **Learners** ("{n} + new ones" / "Whole list" / n)
   - **Open now** · **Called** · **Reached** · **Closed**
   - **Delegated** (by + when)
   - **Recall** button, or "Recalled {time}"
   - Recalled rows are dimmed. Empty: "No tasks on this day."
   - Success: "{Task} is back with {name}."
4. **History** (eyebrow "Every change, by whom"): entries **Delegated** / **Recalled** / **Marked absent** / **Marked back in**, with details (e.g. "Missed to Sam · 12 learners + new ones", "Alex · line cover Sam", "Alex · 3 tasks recalled") + actor + time. Empty: "Nothing delegated yet."
5. **Dialog "Mark someone absent"**:
   - **Who is absent** select (only those present)
   - **Who covers their phone line** ("Nobody (missed calls wait for them)" + each specialist)
   - For each of their lists that has people (Next Day is always shown): "**{List} · {n}**" + checkbox **Hand it over**. When ticked, the same "Give it to" parts builder appears; otherwise "Stays with {name}."
   - **Mark {name} absent** (primary)
   - Success: "Marked absent. Their lists are with the specialists you chose."
- Not-set-up alert from the server.

### 9.10 Calling desk (from the director)
Opens the desk (section 6) for the director's own agent profile, or for the specialist chosen via **See {name}'s desk** / **View calling workspace**. The sidebar switches to the desk menu + **Return to director**.

### 9.11 Zoom Phone
See section 10 (director view = everything). The director also gets the **Calls without a recording** card (8.18) at the bottom.

### 9.12 Learner allocation (three cards, top to bottom)

**A. Employer satisfaction**
- Status line: "Made by {names}. Nobody else sees employer satisfaction calls." or "Each employer is called by the specialist who looks after most of its learners." + " {n} open employer cases."
- Not-set-up alert.
- Checkbox: **"Employer satisfaction calls are made by employer specialists"**. When ticked:
  - explanation: "The specialists you tick see only employer satisfaction, with the usual calling: Next call goes through the employers. Everyone else no longer sees employer satisfaction."
  - a checkbox per specialist (empty: "No active specialists. Add one under Zoom Phone.")
  - alert: "{name} has {n} allocated learners… While they make the employer calls, those learners are in the shared queue for everyone else; they come back when this is switched off."
- When changed: **Reason for the change** textarea ("For example: Alice covers employer calls this term") + **Save** / **Cancel**.
- Collapsible **Changes** history: "On: {names}" / "Off" · actor · time · reason.
- Success: "Employer satisfaction calls now go to the employer specialists." / "Employer satisfaction calls follow the learner allocation again."

**B. Do not call**
- "Learners who stay on their programme but must not be phoned. Their cases are on no call list and nobody can call them; they can still be emailed. A learner who has withdrawn needs no entry: set Withdrawn in the LMS and they leave every list."
- Current list: "**{learner}** · {reason}", note, "Added by {name} · {time}", **Remove from the list** link. This opens "**Why can they be called again?**" + **Put back on the call lists** / **Cancel**.
- Empty: "Nobody is on the list."
- **+ Add a learner** (directors) opens:
  - **Find a learner** search ("Name, email, programme or coach")
  - **Learner** select ("Choose a learner ({n}+ shown)")
  - **Reason** select (from the server)
  - **Note for the team** ("What the team needs to know. No medical details.")
  - **Take off every call list** (primary) / **Cancel**
- Collapsible **Removed from the list** history.
- Success: "{name} is off every call list." / "{name} is back on the call lists."

**C. Allocate by employer**
- Intro: "An employer's learners stay with one specialist, who also makes that employer's satisfaction calls. Other specialists cannot claim an allocated learner." (A variant names the employer specialists.)
- Buttons: **Balance by learners** · **Balance by open cases** · **Refresh**.
- **Stat cards**:
  - per specialist: name, **{n}** learners, "learners · {n} employers · {n} open cases" + **View calling workspace**
  - employer specialists: "All employers" + an explanation
  - **Shared queue**: {n} "learners any specialist can call" + **Transfer to a specialist…**
- Alert per switched-off specialist: "{name} is switched off but still has {n} learners allocated. Until they are handed over, those learners are in the shared queue." + **Hand over their learners**.
- **Hand over all learners of** [select: specialist / Shared queue ({n}) / switched-off] **to** [select: specialist / Shared queue] + **Hand over**.
- Toolbar: search "Employer, organisation, learner or coach" + **Show** select (All employers ({n}) / Split between specialists ({n}) / With learners in the shared queue / With {specialist}).
- Split warning: "{n} employers have learners with different specialists: {names} and {n} more. Give each employer to one specialist, or save anyway."
- **Roster table**:
  - **Employer** (name, organisation or "No employer recorded", "{n} open cases")
  - **Learners** (one name, or an expandable "{n} learners", each with its own "Give {learner} to" select)
  - **Now with** ("Sam 4 · Shared queue 1")
  - **Give to** select (specialists / Shared queue / "Split between specialists" shown disabled when mixed)
  - Rows that are split are highlighted.
  - Empty: "No employers match."
- Footer: status message · **Undo changes** · **Save {n} changes** (primary; shows "No changes" when there are none). If the save would leave employers split, a confirmation dialog asks first.
- Collapsible **Recent allocation changes ({n})**: Learner (+ date) · Handover ("{from} → {to}") · By (+ reason). Empty: "No allocation changes yet."

### 9.13 Coach booking links (two cards)

**A. Coach booking links** (also the specialist "Booking links" page)
- "Open the coach's service while speaking with a learner, or copy its link into a booking invitation." + "Links come from each coach's page in the LMS Coach directory. The link that fits the case is included in each learner's booking email (missed-lecture catch-ups use the coach's support link)."
- Table: **Coach** · **Learners** (count) · **Booking services** (links: Monthly coaching / Progress review / Support session), or "No Microsoft Bookings page is mapped for this coach".
- Empty: "No coaches in the current register."

**B. Link LMS booking pages** (director)
- "Choose each coach's page in the LMS Coach directory once. Their links then follow that page: changes made in the LMS appear here within a minute. The LMS is only read."
- Alerts: not set up; "The LMS Coach directory cannot be read right now, so the original catalogue links are shown and pages cannot be linked."
- Table:
  - **Coach** (+ email or "No email recorded")
  - **LMS booking page** select ("Choose a page…" / "{Name} · /{slug}" / "{slug} (not in the directory)" / "No booking page")
  - **Status**: Linked / Confirmed: no booking page / Linked from the original catalogue / Suggested by name: confirm to use it / Not linked / This page is no longer in the LMS coach directory / No coach email in the enrolment records, so no page can be linked
  - **Confirm** (primary)
- Success: "{coach}: booking page linked / no booking page."

### 9.14 Settings (three parts)

**A. Settings form**
- Not-set-up alert: "{reason} The values below are the built-in defaults."
- Card **Sending email**:
  - status: "Microsoft 365 is ready. Emails go out as {sender}." (green) or "Microsoft 365 is not ready: add {settings} to the server settings (.env)."
  - note: "This server only records emails: CALLCENTRE_EMAIL_LIVE_ALLOWED is not set in its .env. Change the sending mode on the production server."
  - **When an email is due** (radio): "Record only (dry run): nothing is sent, the email is kept on the case" / "Send for real (live)" (disabled when not ready)
- Card **Automatic reminders** + a "**Coming soon**" amber tag. The whole section is locked: "Automatic reminders are not available yet. No reminder emails are sent." Keep it designed as a locked / coming-soon section. Its fields:
  - **Send automatic reminders** checkbox
  - **Email the learner on these days (0 = when the case opens)** (comma list; error "Up to 10 whole numbers from 0 to 60, separated by commas.")
  - **Email the line manager on day (0 = never)**
  - **Most emails per learner per day**
  - **Copy manager emails to (optional)** (email)
  - **Send reminders for**: a checkbox per case type
- Card **Save changes**:
  - the list of pending changes ("Sending: Record only (dry run) → Send for real") or "No changes yet."
  - a going-live warning: "Learners and line managers will receive real emails from {sender}. Only reminders that fall due from today are sent, not the backlog."
  - **Why are you changing this?** (at least 5 characters)
  - **Save settings** (primary) · **Undo changes**
  - "Settings saved."
- Card **Change history**: "{time} · {actor} · "{reason}"" + the list of changes. Empty: "No changes saved yet."

**B. Connections & case rules**
- A **source health card** per data source: name, tag (connected / error / pending), message ("Source read successfully in the last cycle." / "Awaiting the first successful read." / the error), "Last success {date}".
- A **case cycle** card: "The worker refreshes sources, opens and closes cases and sends emails ({dry run / live} mode)."
- **Case rules** table ("Reason for calling" → "What finishes the work"), see section 11.15, + the note "Only Zoom Phone records establish no answer, duration and call attempts. An operator note cannot alter these figures. Cases are prioritised by risk, overdue time, missed sessions and attempts."

**C. Import & export**
- Card "**Upload now, connect feeds later**": "Bring bookings, attendance reports, assignments, event confirmations and follow-up requests into the calling register." + **Allocate by employer** button (goes to Learner allocation).
  - Steps: 1. Download the learner and case lists… 2. Fill in a template and save it as **CSV UTF-8**… 3. Preview every row, then confirm…
  - "CSV import is not connected yet. Cases are generated automatically from Aptem, attendance and the Zoom Phone feeds."
- Card **1. Download**: **Learners & contacts** (CSV) · **Case register** (CSV) · **Uploaded records** (disabled) · **Template for** [Follow up] select (disabled) · **Download CSV template** (disabled).
- Card **2. Upload and preview**: **Choose CSV file** (disabled) · "Up to 1,000 records · 2 MB · .csv format" · **Preview import** (disabled) · "Import is not connected yet. Nothing is saved from this screen."
- Card **Recent imports** + **Refresh history** (disabled): "No manual imports yet."
- Confirmation: "Export downloaded."
- (The disabled items are placeholders for a future feature. Keep them, visibly marked "not connected yet".)

### 9.15 Learner call workspace (director, full page)
The Full case (section 7) as a page, opened from any "Open case" in the director pages. **← Back** returns to the previous page.

### 9.16 Request a call (dialog: "Extra call by manager")
- **Find a learner** search ("Name, email, programme or coach").
- **Learner** select (required; "Choose a learner ({n}+ shown)" / "Loading learners…").
- Info: "{email} · Coach: {coach} · {employer}".
- **Phone to call** ("+44…", pre-filled from the learner).
- **Due date** (required; today or later).
- **Call title** (required, 3–180 characters; "A supportive check-in").
- **Purpose and suggested approach** (required, 10–4,000 characters; "Explain the context, what to ask and the intended outcome.").
- Note: "The call joins the shared calling register under Extra Calls by Manager. A specialist claims it when they call; it closes when they resolve it."
- **Add to calling register** (primary) + **Close**.
- Success: "Call for {name} added to Extra Calls by Manager." / "This request was already added."

---

## 10. Zoom Phone page

Visible to specialists (basic view) and directors (full management view). Directors and specialists reach it from the sidebar.

### 10.1 Summary card (everyone)
- Eyebrow "Engagement calls", title **Zoom Phone**: "Call from the learner's record. Search saved call evidence, read transcripts and review call time here."
- Tag: **Zoom connected** (green) / **Zoom setup needed** (amber).
- 4 stats: Calls in this range · Answered calls · Connected hours · Not answered.
- "Last Zoom import: {time} · Last recordings import: {time}".
- Table: **Specialist** · **Zoom account** · **Phone number** · **Identity** ("Verified with Zoom" / "Awaiting first sync" / the error). Empty: "No active specialist profiles."

### 10.2 Director-only management (inside the summary card)

**A. Zoom accounts**
- "Each Zoom account the team calls from, with its Server-to-Server OAuth app. Calls, recordings and transcripts are read from these accounts every cycle. The Client Secret is stored encrypted and is never shown again."
- Alert when the server cannot store secrets, with a collapsible "How to add {setting}" (3 steps, a command and a warning).
- Success notice: "{name} added / saved. Press Test to check it works."
- Table:
  - **Account** (name + "Key {key}")
  - **App**: Account ID, Client ID, the secret state ("Secret saved · ends …1234" / "No Client Secret" / "The server cannot read the secret: Edit and enter it again"), and the webhook state:
    - Webhook URL (code)
    - "Last event {time} ({event})"
    - "URL validated by Zoom {time}; no event yet."
    - "Waiting for Zoom: paste the URL in the app's Event Subscriptions and press Validate."
    - "Webhooks off: calls arrive at the next cycle (Edit to add the Secret Token)."
    - red: "Last request refused {time}: {reason}"
  - **Status**: test result tag (Working / Partly working / Cannot sign in / Not tested) + the problem + each check "✓ / ✗ {label} ({used for}): {message}" + "Tested {time}"
  - Buttons **Test** ("Testing…") · **Numbers** (toggle) · **Edit** · **Remove**
  - A failed Test opens Edit with the wrong field marked.
  - Empty: "No Zoom accounts yet: nothing is synced from Zoom. Add the first one below."
- **Numbers on {account} ({n})** sub-panel (opened by **Numbers**):
  - "As Zoom lists them. Add puts a number in Phone numbers (below) on this account; then give it to a specialist."
  - Search (when more than 8 numbers) · **Add all {n} not listed** · **Close**
  - Table: **Number** (+ display name, site) · **Owner in Zoom** (+ type: User / Call queue / Auto receptionist / Common area / Shared line group, ext.) · **Status** (+ capabilities) · **Auto-recording** ("On · {calls}" green + "Zoom transcribes them / does not"; "Off" red + a warning with the fix; "Unknown" amber; or a reason) · **In our list** ("Not listed" amber / "Listed on {other}: Edit it below" red / "Listed" green + specialists) · **Add** button
  - "Asking Zoom for the numbers…" Empty: "Zoom lists no numbers on this account." / "No number matches the search."
- **Add a Zoom account / Edit {name}** form:
  - collapsible "**Where do I find these in Zoom?**" (5 steps)
  - **Name** (hint "Your own name for the account, e.g. Student or Office.")
  - **Account ID** (fixed when editing)
  - **Client ID**
  - **Client Secret** (password; "Leave empty to keep the saved secret.")
  - collapsible "**Webhooks (optional): calls reach the cases within a minute**" (4 steps incl. the endpoint URL)
  - **Secret Token (webhooks, optional)** (password)
  - Buttons **Add account** / **Save account** · **Turn webhooks off** (when a token is saved; message "Webhooks are off for {name}: delete the Event Subscription in the Zoom app too.") · **Cancel**
  - Validation per field: "Enter a name for the account." / "Enter the Account ID." / "Enter the Client ID." / "Enter the Client Secret."

**B. Changes in Zoom**
- "Numbers added or removed, given to someone else, renamed, or with automatic recording switched on or off. In red: a change that can stop calls being matched to a specialist or recorded. Last checked {time}."
- **Period** (7 / 30 / 90 days).
- Table: **When** · **Number** (+ account, specialists) · **What changed** (red when serious). Empty: "No changes in this period."

**C. Phone numbers**
- "Add every Zoom number the team calls from with its Zoom details, test it, then give each specialist one number (Edit on their profile below). A call on a number counts for the one specialist who has it, whatever email Zoom shows; a call made from the Zoom app directly is not counted, so always start calls with Call."
- **Refresh from Zoom** button ("Refreshing from Zoom…"; disabled with tooltip "Add a number first"). The result box shows: "Refreshed {n} numbers from Zoom and tested them all." + a list of changes / "Nothing had changed in Zoom.", "Not in Zoom any more: {numbers}…", "Could not read …", and **Dismiss**.
- Alert: "On a specialist's profile but not in the list yet: {number} ({names}) **Add**".
- **Add a number / Edit {number}** form (each field has a hint and its own error):
  - **Phone number** (fixed when editing; "+441622958989"; hint on where to find it)
  - **Label** ("e.g. Student line 2")
  - **Zoom account** select
  - **Zoom user email on its calls (if Zoom shows one)**
  - **Zoom user ID on its calls (if Zoom shows one)**
  - Buttons **Fill from Zoom** ("Looking in Zoom…") · **Add number** / **Save number** · **Cancel**
  - Messages: "Filled from Zoom and {n} calls on this number in the last 90 days. Check, then save." / "Zoom has sent no calls on this number yet…: choose the account yourself." / "{number} added. Press Test to check it, then give it to a specialist below."
  - Validation: "Enter the phone number first, for example +441622958989." / "Add the Zoom account first (Zoom accounts, above)." / "Choose the Zoom account this number is on."
- Scope alert: "Zoom did not let us look numbers up: the Zoom app needs the `{scope}` scope…"
- Table:
  - **Number** (+ label, "In Zoom: {name} · owner {owner} (read {time})")
  - **Zoom** (account, or red "Account not set" / "Account {x} is not in Zoom accounts: Edit"; + email and ID)
  - **Status** (test tag: Working / Ready / Unmatched / Check setup / No agent / Not found / Not tested; warnings in red; a test detail sentence + "Tested {time}")
  - **Specialist** (names, "(switched off)", or "Nobody yet")
  - Buttons **Test** · **Edit** · **Remove**
  - Empty: "No numbers yet. Add the first one above."

**D. Specialist profiles**
- **+ Add specialist** button.
- Table: **Specialist** (+ sign-in email) · **Zoom account** (email + account) · **Phone number** · **Daily target** ("{n} minutes" + Active / Inactive) · **Edit**. Empty: "No specialist profiles yet."
- **Add a specialist / Edit {name}** dialog:
  - **Sign-in account** (add only; select "{name} ({email})")
  - **Display name**
  - **Zoom account** (locked to the phone number's account when a number is chosen)
  - **Sign-in email for Zoom matching** ("Only used for calls not on a listed phone number.")
  - **Phone number** select (numbers held by another active specialist are disabled: "({name} has it)")
  - **Daily talk target (minutes)** (default 180)
  - **Active specialist** checkbox
  - **Save specialist** (primary)
  - Validation: "Choose the sign-in account." / "Enter a display name." / "Enter the sign-in email."

### 10.3 Information cards (everyone)
- **1. Zoom accounts**: "The Zoom accounts added above (Zoom accounts), with their sync. The worker imports call logs and recordings every cycle." Table: **Account** · **Status** (Setup needed / Syncing / Sync failed / Connected / Awaiting sync + error, "Missing: …", "Recordings: …") · **Calls** · **Call hours** (+ connected) · **Last sync**. Empty: "No Zoom accounts yet: add them above."
- **2. Save evidence**: "Only calls started from this system appear in reports and have their recordings transcribed and analysed. Transcript text is searchable by managers; each specialist can read their own calls." + "An archive copy in private Azure storage is not connected yet; recordings stay in Zoom under its retention policy."
- **3. Enable the call buttons**: "The Call button opens the Zoom desktop app with the learner's number and the specialist's engagement caller ID. Each specialist keeps the Zoom desktop app signed in with their college account." + "Outcomes are saved straight away; Zoom's call is attached when Zoom reports it, and flagged if its result does not match."

### 10.4 Call evidence (everyone)
- "{n} calls in this range."
- Buttons: **All transcripts** (directors) · **Refresh**.
- Filters: **From** / **To** dates (default: the first of this month to today; error "Choose a valid date range.") · **Zoom account** select (All accounts / each) · **Call direction** select (Outgoing calls (default) / Incoming calls / All directions).
- Note: "Times are in Europe/London. A call is linked to a learner only when the number matches the learner or line-manager directory. Recording length does not count as verified talk time."
- Table:
  - **Called** (time + duration or "Duration not supplied")
  - **Account** (+ "From {caller}" / "To {callee}")
  - **Contact** (name or "Unmatched number" + role Learner / Line manager / Unmatched number + number)
  - **Result** tag
  - **Evidence**: **Read transcript** (opens the Recording dialog, 8.14)
- Pagination: **Previous page** · "Page {n}" · **Next page**.
- Alert: "Duration unavailable for {n} calls; hours are incomplete."
- Empty: "No matching calls in this range."

### 10.5 Learner call activity (everyone)
- "Outbound Zoom calls matched to learners by phone number."
- **Month** select.
- 3 stats: Calls / Answered / Not answered.
- A **stacked bar chart** by day (answered purple, not answered gold) with the first and last dates under it and a legend.
- Collapsible **Recent learner calls ({n})** table: Date · Learner (+ email) · Coach · Number · Result tag (Answered / Not answered). Empty: "No learner calls this month."

### 10.6 All transcripts dialog (directors)
- "{from} to {to} · all Zoom accounts · {n} recordings, {n} transcripts ready".
- Filters: **Transcript status** (All / Ready / Processing / Transcription disabled / Transcript unavailable / Sync failed) · **AI call rating** (All / Excellent / Good / Bad / Not rated) · per-account tags "{account}: {ready} of {total} ready".
- "How the AI rates calls" rules.
- Table: **Recorded** (time + account) · **Specialist** (+ text preview) · **Transcript** status · **AI rating** · **Read**.
- Pagination: Previous page / "Page {n} · {n} results" / Next page.
- The selected transcript: "Call transcript" + **Download text** + the AI review panel + the text.
- Empty: "No transcripts match these filters."

### 10.7 Calls without a recording (directors, below)
See 8.18.

---

## 11. Reference lists

### 11.1 Case types (labels)
| Code | Label | Purpose shown to the specialist |
|---|---|---|
| attendance | Missed lecture | Find out why, then agree they attend the same lecture with another group (this closes the case), book a catch-up with their coach, or send the booking email. |
| pr | Progress review overdue | Agree when the learner will book it; send the booking email with the coach's progress review link. |
| mcm | Monthly coaching overdue | Agree when they will book it; send the booking email with the coaching link. |
| pr_missed | Missed progress review | Check whether it went ahead; if not, send the booking email to rebook. |
| mcm_missed | Missed monthly coaching | Same as above for coaching. |
| signature | Missing signature | Ask them to sign in the LMS; nothing to book. |
| otj | Off-the-job hours (paused) | Agree support to record and recover hours. |
| epa | EPA preparation | Past the end date; check gateway / EPA position; agree the next step; book support if needed. |
| reminder | Tomorrow's appointment | Confirm attendance (and with the employer for progress reviews); cancel or move it if they cannot come. |
| manual | Extra call by manager | Uses the manager's own title and purpose. |
| learner_satisfaction | Learner satisfaction | Record score, feedback, issue and agreed action after an answered call. |
| employer_feedback | Employer satisfaction | Same, for the employer. |
| tech_support | Technical issue | Confirm the issue is fixed, then resolve. |

Review cases show the LMS review name, e.g. "Missed progress review: PR 3".

### 11.2 Case statuses
To call (new) · Being worked (in_progress) · Callback booked (pending_learner) · Waiting for proof (pending_verification) · AI suggests closing (ai_suggested_close) · Closed (resolved) · Unreachable · Escalated. (In the call log, "new" reads "Back on the list".)

### 11.3 Call outcomes
Reached · No answer · Wrong number · Callback requested · Refused or problem. Plus, in the call form: **Done: resolve the case**, **Not discussed: keep it open**.

### 11.4 Agreed actions (promises)
Book a catch-up session · Watch the recording · Attend this lecture with another group · Attended this lecture with another group (covering lecture) · Book the progress review · Book the monthly coaching meeting · Log off-the-job hours · Complete the EPA step · Sign the review · Other.
Each one shows "(closes the case)" or "(within N days)".

### 11.5 Outcome help texts (shown after choosing)
- Reached + promise: "The case closes now: the learner has agreed to do it." / "The case waits {n} days for proof (or until the follow-up date, if you choose one). If nothing shows up, it comes back to the top of the list."
- Reached: "Resolve the case once the call's purpose is done." / "The case comes back next working morning (or on the follow-up date, if you choose one) unless the learner agrees something."
- No answer: "Marked as a missed call ({n} unanswered so far). Held until the next working morning (or the follow-up date, if you choose one), then back at the bottom of the list."
- Wrong number: "Recorded on the case; it comes back next working day (or on the follow-up date…). Say what happened in the note."
- Callback: "The case comes back to the list at the time you choose."
- Refused: "Recorded on the case; it comes back next working day (or on the follow-up date…). Say what the learner said in the note."
- Satisfaction, reached: "Save the call outcome, then use Complete feedback. Only a completed review starts the next three-month period."
- Satisfaction, no answer: "The review stays open. Follow up on the chosen date, or the next working morning. If it cannot be done, close it without feedback."

### 11.6 Timeline event names
Case opened · Call started · Call saved · Outcome recorded · Outcome waiting for Zoom · Outcome not applied · Zoom call attached · Outcome does not match Zoom · Feedback on a call Zoom reports not answered · Not discussed · Closed · Reopened · Note · Taken · Released · Session booked · Meeting cancelled · Meeting moved · Employer step · Employer rung · Email (dry run) · Email sent · Reminder changed · Satisfaction feedback completed · Employer feedback completed.

### 11.7 Employer step results
Employer confirmed (the review) · Employer says the learner cannot attend · No answer (try again) · Employer could not be reached · No line manager on record.

### 11.8 Meeting (Outlook) states and history events
- Replies: Accepted in Outlook · Tentative in Outlook · Declined in Outlook · No reply in Outlook.
- Cancelled: Cancelled in Outlook · Removed from Outlook · Cancelled from the Engagement Centre.
- Cancel reasons: The learner cannot attend · The learner asked to cancel · Rebooked for another time · Other.
- Learner matched by: invited by email · named in the title · surname, coach's learner.
- History events: Found in Outlook · Moved · Learner matched · Learner replied · Confirmed on the call · Cancelled in Outlook · Removed from Outlook · Back in Outlook · Cancelled from the Engagement Centre · Cancel failed · Rescheduled from the Engagement Centre · Reschedule failed · LMS calendar entry moved · LMS calendar entry not changed · Employer step · LMS calendar entry cancelled · LMS calendar entry not cancelled · Coach note.

### 11.9 Missed calls
- Results: Missed · Left a voicemail · Hung up while ringing.
- Done how: Called back · Rang again and got through · Marked done.
- Caller roles: Learner · Line manager (or unknown: "Not a number we know").
- Wait format: "{n} min" under 1 h, "{n} h" under 1 day, otherwise "{n} days".

### 11.10 Booking hints (Booking column)
- "Already booked. If the learner cannot attend, cancel it or move it to a time the coach is free."
- "Book a catch-up or support session in the coach's LMS calendar, or send the booking email."
- "Book a support session in the coach's LMS calendar, or send the booking email."
- "Book it with the learner on the coach's page (use the learner's own name and email), or send the booking email. The coach links it to the LMS review."
- "The learner books the review / meeting from the coach's page in the booking email."
- "The learner rebooks the review from the coach's page in the booking email."
- "Nothing to book: the learner signs the review in the LMS."
- "Nothing to book: call or email the employer and ask them to sign the review in the LMS."
- "Already booked. If the learner cannot attend, they contact their coach to rearrange."
- "No booking for a satisfaction call."
- "No booking: technical support has the issue."

### 11.11 Satisfaction score scale
1 Very dissatisfied · 2 Dissatisfied · 3 Neutral · 4 Satisfied · 5 Very satisfied.

### 11.12 Technical issue categories
LMS · Aptem · Microsoft Teams · Something else.

### 11.13 AI call rating rules (shown in "How the AI rates calls")
- **Excellent**: Polite greeting, says who they are and that they are from KBC, explains why they are calling, listens and answers correctly, agrees a clear next step with a date, closes politely.
- **Good**: Professional and the call did its job, but one or two of the excellent points were missed (for example no date for the next step).
- **Bad**: Rude or impatient, wrong or confusing information, no reason given for the call, ignores the learner, no next step, or personal details shared without checking who answered.
- **Not rated**: No real conversation: no answer, voicemail only, wrong number, or too short to judge.
- No rating yet: "Awaiting AI review".
- Tag tones: Excellent green, Good amber, Bad red.

### 11.14 Other statuses
- Transcript status: Ready · Processing · Transcription disabled · Transcript unavailable · Sync failed.
- Zoom call results: answered, no answer, missed, busy, voicemail, rejected, **cut off · under 10 s**, "Waiting for Zoom", "Zoom has no call".
- Specialist live lamp: **On a call** (talking) · **Ringing** · **Available** (free) · **Away or offline**.
- Source health: connected / error / pending.

### 11.15 Case rules (Connections page table)
| Reason for calling | What finishes the work |
|---|---|
| Missed lecture: due within 2 working days | A catch-up session booked in the LMS calendar, attendance evidence, or the learner agreeing on the call to attend the same lecture with another group. Lectures appear as soon as the register shows the absence. |
| Progress review or monthly coaching overdue: 3 working days | The review or meeting is booked and completed in the LMS. |
| Off-the-job hours or EPA preparation: 5 working days | The source shows the learner back on track. |
| Tomorrow's appointment | Attendance confirmed or the session rebooked before it starts. |
| Learner satisfaction: every three calendar months, 10 working days | Active, Delivery and Onboarding learners (LMS status first). Complete feedback after an answered Zoom call. Failed calls and emails do not restart the clock. A review that cannot be done is closed without feedback; the next is due three months later. |
| Employer satisfaction: every three calendar months, 10 working days | One call per line manager (from Aptem) who has a current learner, made by the specialist who looks after those learners. Same feedback form and rules as learner satisfaction. |
| Unanswered calls | The learner is held until 9am the next working day (or the follow-up date chosen), then comes back at the bottom of the list. No calls at weekends or on bank holidays. |

### 11.16 Call guide script (3 lines, generated per case)
1. Opening: "Hello, could I speak to {first name}? It's {specialist} from Kent Business College. Is now a good time? Calls are recorded for quality and follow-up; check they are comfortable before you continue."
2. Case-specific question (different for each case type; e.g. the missed lecture asks why they were absent, offers the other group's session or a catch-up with the coach).
3. Close: "Agree what happens next, who does it and by when. Repeat it back to check they understand, and tell them what they will receive (for example the booking email)."

---

## 12. Behaviour rules the new UI must keep

### 12.1 Lists and people
- **One row / one entry per contact** on every list. Their other cases appear as "All cases (n)" or "Other matching tickets".
- One **Call covers all of the person's due cases**, and the outcome form records each case.
- **Call next** follows the Today list order; director tasks sit where the director placed them.
- A case **covered** by another specialist's task stays on its owner's list, **read-only**, with a "Covered by {name}" tag.
- Satisfaction lists count only people **due now**.
- Follow-ups shows only follow-ups set by **this specialist's own call**.
- The Follow-ups workspace allows at most **6 learner tabs** open at once.

### 12.2 When the Call button is disabled (show the reason as a tooltip and/or text)
Read-only preview · Case is not active · Covered by {name} · Follow-up not due yet · In progress with {name} · No number recorded · Agent profile needed · Calls go out from your own Zoom account: call from your own desk.

### 12.3 Call flow
Call → (Zoom desktop app opens) → **End call** → choose outcome → **Save**. **Nothing changes on the case until Save.** There is always a way back: **Back to the call** and **Cancel: the call did not go out**.

### 12.4 Validation (keep these rules)
- A note of **at least 10 characters** is needed for every saved outcome except No answer.
- **Callback** needs a date and time; any follow-up must be **in the future**.
- Quick follow-ups **+3 / +5 days** are **working days** (they skip weekends and bank holidays) at **10:00 London**.
- An outcome that closes the case **ignores** the follow-up date (and the UI says so).
- Resolve / Reopen / Close without feedback / Save as note / Approve need a note.
- Satisfaction feedback: score + feedback (at least 10 characters) + issue + agreed action are all required.
- A progress-review reminder cannot be resolved before the **employer step** is final.
- Tech issue description: at least 10 characters. Catch-up booking with reason "Other": at least 3 characters.
- Request a call: title 3–180 characters, purpose 10–4,000 characters, due date today or later.
- Settings change reason: at least 5 characters.

### 12.5 Safety (no double actions)
Bookings, emails, tech tickets and manager requests use one-time request IDs, so **double clicks never book or send twice**. After pressing Send, the email wording is **locked**, and retrying checks the same email. Keep the "Check / retry" labels.

### 12.6 Emails
- Nothing is sent automatically. Every send is an explicit click with a **preview**.
- **Dry run** mode records the email on the case instead of sending it; the button says "Send (dry run: record only)".
- Sending an email **never** completes a satisfaction review; only an answered call + feedback does.

### 12.7 Zoom verification
- Figures (talk time, answered, points) count **only Zoom-verified calls started from the system**. Show the disclaimers ("Missing telephone coverage is not evidence of inactivity").
- Outcomes and feedback can be "held" until Zoom reports the call. Show the "waiting / not applied / mismatch" states.

### 12.8 Points and badges
Points = up to 100 for the talk-time target + 5 per answered call (up to 100). Shown out of 300. Badges: Call-time target, Ten connections.

### 12.9 Live data
- The board (switchboard), the incoming call banner and the specialist live status are polled every **5 seconds** while the page is visible. Timers tick every second.
- Talk-time bars include the call in progress.

### 12.10 Permissions summary
| Action | Specialist (own desk) | Viewer / preview | Director |
|---|---|---|---|
| Call, save outcomes, book, email, report issue, correct attendance | ✓ | ✗ (disabled) | ✓ (also on any desk, for now) |
| Resolve a case by hand | only cases the specialist closes | ✗ | ✓ |
| Approve / reject AI suggestion | ✗ | ✗ | ✓ |
| Archive a closed case | ✗ | ✗ | ✓ |
| Undo an attendance edit | ✗ | ✗ | ✓ |
| Do not call add / remove | ✗ | ✗ | ✓ |
| Allocation, delegation, employer specialists, settings, coach pages, Zoom setup | ✗ | ✗ | ✓ |
| See all transcripts / everyone's calls | own only | own only | ✓ |

### 12.11 Time and dates
Everything is shown in **London time**, with "(London)" or "UK time" cues where people pick times. Dates use UK format ("6 Oct 2026", "Thu 15 Oct at 10:00").

### 12.12 Exports and downloads
- My call report (HTML), Monthly engagement report (HTML), Review meetings (CSV), Learners & contacts (CSV), Case register (CSV), Transcript (TXT).
- CSV exports are protected against spreadsheet formula injection. Keep the exports server- / logic-equivalent.

---

## 13. Loading, empty, error and read-only states

**Whole-app states**
- **Loading:** "Loading your Engagement Centre…"
- **Session expired:** heading "**Please sign in again**", "The Engagement Centre needs a fresh sign-in to confirm who you are." + **Sign in** button.
- **Load error:** the error message + **Try again**.
- **Refresh failed** (data still shown): "Could not refresh: {error} Showing the last loaded list."
- **Settings failed to load:** "The Engagement Centre settings could not load ({error}). Saving will fail until you reload the page."

**Per-component states.** Every data card has a loading line, e.g. "Loading the case…", "Loading the history…", "Loading calls…", "Loading missed calls…", "Loading the scorecards…", "Loading the meetings…", "Loading learner allocation…", "Loading settings…", "Loading coach booking pages…", "Checking the coach's calendar…", "Preparing the email…", "Loading email settings…", "Finding the coach's free times…", "Asking Zoom for the numbers…", "Loading the register…", "Loading call reviews…", "Loading monthly achievements…", "Loading attendance corrections…", "Loading learners…", "Searching…". Each also has an **error** state (usually with **Retry / Try again**) and an **empty** state (the texts are listed with each component above). **Design all three for every card.**

**Read-only mode.** In preview / viewer mode, every action button is visibly disabled with a reason, the read-only banners are shown, and forms are greyed.

**Not-set-up states.** Several features show a server message when their database table or integration is not set up yet: delegation, do not call, employer specialists, attendance, coach pages, settings. Design an alert style for "not set up".

---

## 14. Master checklist

Tick every line in the new design.

### Shell
- [ ] Dashboard tile "Engagement Centre"
- [ ] Sidebar: KBC monogram, title, subtitle, nav groups with icons, active state, tooltips, "Signed in as" email
- [ ] Sidebar collapse (desktop, remembered) + Ctrl/⌘+B + mobile drawer with overlay, Escape, close ×
- [ ] Top bar: toggle, ← Back to dashboard, "All times: London" (+ tooltip), email, Sign out
- [ ] Global status / notification line (success + error)
- [ ] Sign-in-again screen, app loading, app error + Try again, refresh-failed message
- [ ] Desk alerts: sources down, sync overdue, truncated list, viewer read-only
- [ ] Director preview banner + Return to director

### Specialist desk
- [ ] Nav: Today, My lists (count), Call a learner (employer specialists), Missed calls (count), My calls, How I'm doing, Booking links, Zoom Phone
- [ ] Desk header: date · name, page title, Start/End focus session, Lists last updated, Refresh
- [ ] Page tabs (lists with counts; How I'm doing tabs)
- [ ] Progress strip: connected time bar, connections, points /300, quality
- [ ] Incoming call banner: Open their case, Hide
- [ ] Today: new task banner + Open; My line card; Rang you (4 cards, Play, Open case / See in Missed calls, All missed calls); Call next; list tiles
- [ ] Call next: filter & order disclosure, order select, coach/cohort/module filters, name, details, flags, All cases link, Why you are calling list with tools, 📞 Call, Back, Next, Full case, End call, Cancel: the call did not go out, outcome form, Back to the call, empty state
- [ ] Call sheets for: Due (+3 reason chips), Next Day, Missed (+4 reason chips), Learner Satisfaction, Employer Satisfaction, MISSING SIGNATURE, Extra Calls by Manager, Technical issues, director task lists (+ covering note)
- [ ] Sheet toolbar: search, call reason, follow-up timing, ticket order, date filter (all / day / range) + Clear dates, coach/cohort/module
- [ ] Sheet help lines, counts, keyboard hint
- [ ] Sheet columns 1–8 with every element (All cases, Report technical issue, Contact details, employer learners, status line, Full case, Other matching tickets, Call / Preview / End call, Email, booking tools, outcome select + help, Complete feedback, notes, follow-up + +3/+5, Save, row status, Discard edits)
- [ ] Covered / task / dirty row styles
- [ ] Sheet pagination + unsaved rows warning + empty states
- [ ] Follow-ups: focus session bar + "Open next learner after saving", queue (filters, search, reason, person buttons), learner tabs (max 6) with ×, start card (Open next learner, Start focus session)
- [ ] Learner panel: all cases block, phone line, purpose, dates, Call learner / Call employer, booking/email/tech/email buttons, lateness line, context & contacts, EPA readiness, short call guide, Record this call, Agree the next step, feedback, Next learner, Notes/recordings/evidence
- [ ] Call a learner: search list, chosen view, 📞 Call, Back to the learners, outcome form, optional feedback, Call another learner
- [ ] Missed calls page (desk)
- [ ] My calls: call log, transcript search, calls without a recording
- [ ] How I'm doing: This week (scorecard), This month (month picker, Download my report, 5 figures, 2 charts), Call reviews (month, rating filter, totals, rules, table, Review call), Achievements (badges, how points work, monthly history with ←/→/month picker/Current month, totals, daily breakdown, calls list, linked cases, pagination)
- [ ] Booking links table

### Full case
- [ ] Header band: type · open cases, name, details, flags, phone, 📞 Call · n cases / states
- [ ] Record this call section
- [ ] Rail: Why you're calling buttons, Contact list (mailto links), Retry
- [ ] Case cards: label, when, status tag, due text, purpose, late warning, dates, help-desk note, employer learners, AI summary, meeting + employer steps, action buttons, EPA readiness, satisfaction feedback, call guide, record by hand / resolve / note, attendance panel
- [ ] History tabs: Calls (accordion + audio + transcript/AI), Missed calls & voicemails, Timeline, Emails

### Shared dialogs and parts
- [ ] Call outcome form (answer buttons, per-case selects, groups + Answer together/each, Set every case to, per-case notes & tools, note, follow-up + quick dates, validation, save, feedback chain)
- [ ] Agree the next step form (all buttons: Save next step, Resolve / Approve and resolve, Close without feedback + reason, Reject AI suggestion, Reopen case, Archive, Save as note)
- [ ] Book with coach dialog
- [ ] Book on coach's page button
- [ ] Booking email dialog (edit, preview, Reset wording, link button, Send / dry run / retry, Copy email, Open in my mail app, checks panel)
- [ ] Satisfaction email dialog (Send via Azure / Check / retry)
- [ ] Complete feedback form + saved/waiting state + Change the feedback
- [ ] Employer confirmation panel (Call employer, result select, note, Save employer step)
- [ ] Meeting tag + Cancel or reschedule dialog
- [ ] Report technical issue dialog
- [ ] Attendance panel (summary, covering hint + one-click fix, lecture list + Mark attended / Mark absent / Delete, correction form, show all toggle, corrections history)
- [ ] Recording dialog (Play, Read transcript, Download text), Transcript & AI review accordion, Call review dialog, AI review panel, rating tags, "How the AI rates calls"
- [ ] Case dates block, Coach/Cohort/Module filters
- [ ] Charts: talk time per day (target line), calls per day, bar lists, quality strip, figure tiles
- [ ] Three pagination styles
- [ ] Error notice + field errors + hints
- [ ] Dialog behaviour (Escape, backdrop, ×/Close, nested dialogs)

### Director
- [ ] Nav: Monitor (Overview, Specialists, Scorecards, Review meetings), Calls (Calls, Missed calls & voicemails, Attendance edits, Task delegation, Calling desk), Setup (Zoom Phone, Learner allocation, Coach booking links, Settings)
- [ ] Header: eyebrow, title, date · name, ← Back, + Request a call, Refresh
- [ ] Overview: switchboard (key, lines, shared line, errors), Needs you (8 item types), month figures (6) + month picker + 2 charts, team table + Weekly scorecards
- [ ] Specialists index cards
- [ ] Specialist page: crumbs + other specialists, title + See desk, Zoom error, Now line, lists progress (tabs, done / still to call), month figures + charts, caseload & quality (3 panels), week by week, call monitor
- [ ] Scorecards: monthly report card + dialog + Download report, weekly scorecards
- [ ] Review meetings: from/to, Refresh, Download CSV, 7 status tabs with counts, search, table, History dialog, pagination
- [ ] Missed calls & voicemails: 3 tabs, Show, Period, Refresh, 4 totals, table with Play, Open case to call back, Mark done + note, Reopen
- [ ] Calls: cases waiting for a manager (Approve and resolve, Reject, Open case), calls rated bad (Review call), call monitor with specialist filter, transcript search
- [ ] Attendance edits: AI check filter, Period, Refresh, 4 totals, table, Open case, Undo + reason
- [ ] Task delegation: Mark someone absent…, whose list, list tiles, whole/chosen, pick first n / All / None, people checkboxes, parts (specialist, learners, position, Remove part), Add another specialist, Split evenly, new learners go to, Delegate; Absent list (Recall all tasks checkbox, Mark back in); Tasks table (day picker, Refresh, Recall); History; Absence dialog
- [ ] Calling desk access
- [ ] Learner allocation: Employer satisfaction card, Do not call card, Allocate by employer (balance ×2, Refresh, stat cards, View calling workspace, Transfer to a specialist…, switched-off alerts, hand over, search, show filter, split warning, roster with per-learner selects, Undo changes, Save n changes, history)
- [ ] Coach booking links + Link LMS booking pages (select + Confirm)
- [ ] Settings: sending email (dry run / live), automatic reminders (Coming soon, locked), save changes (reason, Save, Undo), change history; Connections cards + case rules; Import & export (2 working CSV exports + disabled placeholders)
- [ ] Request a call dialog
- [ ] Learner call workspace page

### Zoom Phone
- [ ] Summary card: status tag, 4 stats, last import line, specialists table
- [ ] (Director) Zoom accounts table + Test / Numbers / Edit / Remove, numbers sub-panel (search, Add all, Add, Close), account form (+ two help accordions, Turn webhooks off, Cancel), secrets alert
- [ ] (Director) Changes in Zoom table + period
- [ ] (Director) Phone numbers: Refresh from Zoom + result box + Dismiss, unlisted alert + Add, number form (Fill from Zoom, Add/Save number, Cancel), scope alert, table (Test / Edit / Remove)
- [ ] (Director) Specialist profiles table + + Add specialist + Edit dialog
- [ ] Info cards 1–3
- [ ] Call evidence: All transcripts (director), Refresh, From/To, account, direction, table + Read transcript, pagination, missing-duration alert
- [ ] Learner call activity: month, 3 stats, chart, legend, recent calls table
- [ ] All transcripts dialog
- [ ] Calls without a recording (director)

---

*Source of truth: `frontend/src/pages/call-centre/` (page.tsx and the `engagement/` folder). Generated from the code on 31 Oct 2026. If the code changes, update this file before the next design round.*
