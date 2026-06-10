# Communication Centre Training Plan Documentation

## 1. Overview

The Training Plan module is the scheduling and planning area for apprenticeship and programme delivery inside the Communication Centre. It helps users plan programmes, cohorts, groups, modules, and sessions in one connected view.

Training Plan exists to answer practical delivery questions:

- Which programme is being delivered?
- Which cohorts and groups are active?
- Which modules are scheduled?
- Who is the assigned tutor?
- Which sessions are upcoming, current, completed, affected by holidays, or at risk?
- Which KSBs are covered?
- Which tutor coverage actions are still required?

The module connects scheduling, tutor workload, holiday planning, KSB mapping, timeline review, and monthly breakdown reporting. It is designed for non-technical users, administrators, coaches, tutors, and quality reviewers who need a reliable view of planned delivery.

Training Plan is the source of most delivery schedule information used by related areas such as Tutor Profiles, Tutor Coverage summaries, KSB coverage summaries, Timeline, and Monthly Breakdown.

### Who Should Use This Documentation

This guide is intended for several types of users:

| User type | Why they use Training Plan | Typical tasks |
|---|---|---|
| Administrator | Maintains programmes, cohorts, holidays, module catalogue, tutor profiles, and saved plan data. | Create programmes, add cohorts, manage holidays, maintain modules, check save warnings. |
| Coach | Reviews delivery plans and learner group schedules. | Check group structure, session dates, module sequence, and tutor allocation. |
| Tutor | Checks assigned modules, upcoming sessions, coverage, and conflicts. | Review assigned sessions, confirm availability, check coverage requests. |
| Coverage coordinator | Manages tutor unavailability and cover arrangements. | Mark tutors unavailable, assign coverage tutors, review Coverage Required. |
| Quality reviewer | Checks that the plan is complete, accurate, and mapped to KSB requirements. | Review KSB coverage, monthly breakdown, clashes, and final end dates. |
| Senior manager | Reviews programme delivery health and risk. | Use Timeline and Monthly Breakdown to identify schedule pressure, conflicts, and extensions. |

### What Training Plan Is Not

Training Plan is a planning and scheduling tool. It is not a learner attendance register, payroll system, HR absence calendar, or automatic tutor leave tracker. Some information, such as tutor unavailability, must be entered manually by users.

This distinction matters because the system can detect schedule conflicts from saved Training Plan data, but it does not automatically know that a tutor is sick, on annual leave, or unavailable unless a user records that information in the session Coverage modal.

### Communication Centre Navigation

The Communication Centre uses a top navigation bar so users can move between the main areas of the system. The active page is highlighted so users can confirm where they are. On smaller screens, the same areas may appear inside a mobile menu.

Some navigation items open internal Communication Centre pages. Other items, such as LMS and APTEM, open external systems in a new browser tab. External systems may support learner or operational records, but users should not assume that changes made in those systems automatically update the Training Plan unless an integration has been confirmed and documented.

| Navigation item | What it is used for | Relationship to Training Plan |
|---|---|---|
| Home | Main starting area for the Communication Centre. It gives users a quick entry point into daily work and system content. | Users may start here before opening Training Plan to review upcoming delivery or operational updates. |
| News & Announcements | Internal news, updates, notices, and organisation-wide messages. | Delivery changes may be announced here, but the actual schedule should still be updated in Training Plan. |
| Internal Dashboards | Internal reporting and dashboard views used to monitor activity, performance, or operational status. | Dashboards may help users understand delivery context, but Training Plan remains the working schedule source. |
| Risk Register | Controlled area for recording and reviewing operational risks. | Repeated tutor conflicts, unresolved coverage gaps, or schedule extensions may need to be recorded as risks according to internal process. |
| Departments | Department and team information. | Useful when users need to identify ownership, escalation routes, tutors, coaches, or support contacts. |
| Policies | Policy and document area. | Users should refer to policies when Training Plan decisions depend on quality rules, holiday handling, delivery standards, or internal approval requirements. |
| Events | Events calendar or event management area. | Events are separate from Training Plan sessions unless they are specifically added to the plan or considered during scheduling. |
| Training Plan | The delivery planning module documented in this guide. | This is where programmes, cohorts, groups, modules, sessions, tutor coverage, clashes, KSB mapping, timeline, and monthly breakdown are reviewed. |
| LMS | External learning management system link. | LMS records may support learning delivery, but LMS changes should not be assumed to update Training Plan automatically. |
| APTEM | External APTEM system link. | APTEM may contain learner/apprenticeship records. It is separate from Training Plan unless a documented integration exists. |
| User Activity | Admin/IT area for reviewing user activity and system usage. | Useful for support, audit review, and checking system activity. It is permission-controlled and may not appear for every user. |
| Logout | Ends the current signed-in session. | Users should save Training Plan changes before logging out. Unsaved changes may be lost. |

#### Additional Pages and Entry Points

Some Communication Centre pages are not always shown as permanent top navigation tabs. They may appear from buttons, forms, mobile menu items, admin actions, or direct links.

| Page or entry point | What it is used for | User/support note |
|---|---|---|
| Login | Allows users to sign in before using protected areas. | If a user cannot access Training Plan, first confirm they are signed in with the correct account. |
| Submit Feedback | Allows users to send feedback, issues, or improvement requests. | Feedback should include the page name, cohort, group, module, session date, and screenshot where possible. |
| Urgent Notice creation | Used to create important notices when the user has permission. | This is for communication. It does not replace updating the Training Plan schedule. |
| Leadership Message creation | Used to create leadership or organisation messages when the user has permission. | This is separate from programme delivery planning. |
| Department detail pages | Open a specific department view. | Useful when users need more detailed ownership or team context. |
| Apprenticeships Timeline | Timeline-focused entry point for apprenticeship delivery planning. | This may show the same Training Plan planning data through a timeline-oriented route or view. |
| Not Found page | Appears when a route or link does not match an available page. | Users should check the link, permissions, and whether the page has moved. |

#### Page-by-Page Operational Reference

This table gives users, administrators, and developers a shared language for each Communication Centre page. It is especially useful when reporting an issue, writing release notes, or checking whether a problem belongs to Training Plan or another area of the system.

| Page/tab | Internal route or link | Main users | What users should check | What developers/support should check |
|---|---|---|---|---|
| Home | `/` | All signed-in users | Daily context, quick links, events, risk summaries, notices, and high-level updates. | Whether home widgets are loading, whether links point to the correct pages, and whether visible data is current. |
| News & Announcements | `/news` | All users, managers, communications users | Internal messages, notices, and announcements that may affect delivery. | Whether news content, filters, permissions, and published status are correct. |
| Internal Dashboards | `/dashboard` | Managers, administrators, reviewers | Operational summaries and dashboard information. | Whether dashboard data is refreshed, whether metrics are calculated from the correct source, and whether role access is correct. |
| Risk Register | `/risk-register` | Managers, quality reviewers, risk owners | Active risks, owners, status, severity, and actions. | Whether risk records save correctly, whether permissions protect sensitive risk information, and whether filters/status values work. |
| Departments | `/departments` | All users | Team ownership, department context, contacts, and escalation route. | Whether department cards and department detail links resolve correctly. |
| Department Details | `/departments/:dept` | Users looking for a specific team | Detailed information for one department. | Whether the department identifier maps to the correct page and missing departments show a safe fallback. |
| Policies | `/documents` | All users, reviewers, administrators | Current policy documents and approved guidance. | Whether files, categories, links, and access controls are correct. |
| Events | `/events` | All users, planners, administrators | Events that may affect scheduling, availability, or operational planning. | Whether shared events load, save, and display correctly across views. |
| Training Plan | `/training-plan` | Administrators, coaches, tutors, reviewers | Programmes, cohorts, groups, modules, sessions, tutors, coverage, KSBs, holidays, clashes, timeline, and monthly breakdown. | Training Plan data load/save, version conflicts, session generation, clash detection, KSB mapping, coverage records, and export behaviour. |
| Apprenticeships Timeline | `/apprenticeships-timeline` | Training Plan users | Timeline-based review of apprenticeship delivery planning. | Whether it shows the expected Training Plan/timeline component and preserves route-specific navigation behaviour. |
| User Activity | `/user-activity` | Admin and IT users | User access and activity context for support or audit review. | Whether only permitted users can access it and whether activity tracking records the expected user/session details. |
| Feedback | `/feedback` | All users | Submit issues, suggestions, or improvement requests. | Whether feedback includes enough diagnostic detail and whether the feedback workflow reaches the correct owner. |
| Login | `/login` | Users who need access | Sign in using the expected account. | Authentication state, stored user details, access-control mapping, and redirect behaviour. |
| Microsoft login popup | `/login/microsoft-popup` | Users signing in through Microsoft | Complete the Microsoft authentication popup flow. | Popup callback handling, auth event handling, and failed login messaging. |
| Urgent Notice | `/urgent-notice/new` | Authorised communications/admin users | Create a time-sensitive notice. | Permission checks, validation, publishing behaviour, and safe handling of urgent content. |
| Leadership Message | `/leadership-message/new` | Authorised leadership/admin users | Create a leadership message. | Permission checks, content validation, and publishing workflow. |
| LMS | `https://kentbusinesscollege.org/` | Users who need LMS records | Learner learning records held in the LMS. | Link availability only. LMS content and access are handled outside Communication Centre unless an integration exists. |
| APTEM | `https://kentbusinesscollege.aptem.co.uk/...` | Users who need APTEM records | Learner/apprenticeship records held in APTEM. | Link availability only. APTEM content and access are handled outside Communication Centre unless an integration exists. |
| Not Found | `*` | Any user with an invalid route | Confirm the URL is correct or return to a known page. | Whether broken links exist and whether missing routes are intentional. |

#### Source of Truth by Information Type

Users should know where information is maintained. Looking at the wrong page can lead to confusion, especially when Training Plan, Tutor Profiles, LMS, APTEM, and dashboards show related but different information.

| Information type | Primary place to maintain it | Where it may be displayed or referenced | Important note |
|---|---|---|---|
| Programme, cohort, group, module, and session schedule | Training Plan | Timeline, Session Schedule, Monthly Breakdown, Tutor Profiles, exports | Update the schedule in Training Plan, not only in news, email, LMS, or APTEM. |
| Tutor assignment to a planned session/module | Training Plan | Tutor Profiles, Session Schedule, Monthly Breakdown | Tutor Profiles display assignments and may provide an Add module shortcut for authorised users. When used, the new module is still saved into the Training Plan schedule. |
| Assigned tutor unavailable | Session-level Tutor Coverage modal in Training Plan | Tutor Profile Coverage Required section | This is manual. Holidays or absence calendars do not automatically mark a tutor unavailable. |
| Coverage Tutor | Session-level Tutor Coverage modal in Training Plan | Tutor Profile Sessions Covered By This Tutor section | Selecting a coverage tutor affects that coverage summary. |
| KSB Profile selection | Cohort-level Training Plan setup | KSB coverage summary, session/module KSB indicators | If the wrong KSB Profile is selected, coverage summaries can look wrong even if session mapping exists. |
| KSB codes mapped to sessions/modules | Training Plan and module/session mapping data | KSB indicators, KSB coverage summary, exports | Codes should be normalised, deduplicated, and reviewed for missing or repeated coverage. |
| Holidays | Holiday Manager and cohort holiday selection | Training Plan holiday clashes, replacement sessions, effective end date | A holiday affects a cohort only when selected for that cohort. |
| Events | Events page | Home widgets and planning context | Events are not the same as holidays unless the system or user treats them as non-teaching dates through the correct process. |
| Policies | Policies page | Referenced during decision-making | Policies guide decisions but do not change the Training Plan by themselves. |
| Risks | Risk Register | Dashboard summaries or management review | A Training Plan issue may become a risk, but it still needs to be fixed in the appropriate source area. |
| User activity | User Activity page and activity tracking | Admin/IT review | Use it for investigation context, not as a replacement for user confirmation. |
| Learner LMS records | LMS | External LMS | LMS is external. Do not assume it updates Training Plan. |
| Learner/apprenticeship records | APTEM | External APTEM | APTEM is external. Do not assume it updates Training Plan. |

#### Navigation Issue Reporting Checklist

When a user reports that a page, tab, button, or link is wrong, ask for:

1. The visible page or tab name.
2. The URL or route shown in the browser.
3. Whether the user was on desktop or mobile.
4. Whether the user was signed in, and which account name was shown.
5. Whether the missing item is expected for their access level.
6. The exact action they clicked before the issue appeared.
7. A screenshot showing the top navigation and the affected area.
8. Whether the issue happens after signing out and signing back in.

For Training Plan issues, also collect the programme, cohort, group, module, session date, tutor, and expected result.

#### Role-Based Navigation Expectations

Different users may use the same page for different reasons. This table explains what each role normally expects from the Communication Centre navigation.

| Role | Pages they normally rely on | What they should avoid |
|---|---|---|
| Standard user | Home, News & Announcements, Departments, Policies, Events, LMS, APTEM | Do not assume they can see admin-only pages such as User Activity. |
| Tutor | Training Plan, Tutor Profiles, Session Schedule, Policies, LMS, APTEM | Do not edit planning data unless their role gives them management access. |
| Coach | Training Plan, Session Schedule, Monthly Breakdown, Departments, Events | Do not treat Tutor Profile as a separate schedule source. If an authorised user adds a module from Tutor Profile, it is added into the Training Plan schedule and should be checked in Timeline and Session Schedule. |
| Coverage coordinator | Training Plan, Tutor Coverage modal, Tutor Profiles, Monthly Breakdown | Do not record tutor absence only in notes if the Coverage modal fields are required. |
| Administrator | Training Plan, User Activity, Policies, Risk Register, Departments, Events | Do not make large changes from an old browser tab or without checking latest saved data. |
| Quality reviewer | Training Plan, KSB Mapping, Monthly Breakdown, Policies, Risk Register | Do not approve a plan using only one view or an old export. |
| Developer/support | User Activity, Training Plan, Feedback reports, browser route, logs if available | Do not decide business rules such as acceptable coverage or holiday policy without the process owner. |

#### Page Ownership and Escalation Guide

When a user has a problem, first identify which page owns the data and which team should respond.

| Problem reported by user | First place to check | Likely owner |
|---|---|---|
| "My session date is wrong." | Training Plan Session Schedule and Timeline. | Training Plan administrator or delivery planner. |
| "The tutor profile summary is wrong." | Training Plan session data and Tutor Coverage modal entries. | Training Plan administrator, then technical support if the source data is correct. |
| "A holiday is not moving the session." | Cohort holiday selection and Holiday Manager. | Training Plan administrator or holiday manager owner. |
| "I cannot see User Activity." | User permissions and access control. | Admin/IT support. |
| "LMS/APTEM information is wrong." | LMS or APTEM directly. | External-system owner unless a Communication Centre integration is documented. |
| "A policy document is missing." | Policies page. | Document/policy administrator. |
| "A risk needs to be logged." | Risk Register. | Risk owner or manager. |
| "A dashboard number looks wrong." | Dashboard source data and calculation rule. | Dashboard/report owner, then developer if calculation is faulty. |
| "The navigation link is broken." | Top navigation route or external URL. | Developer/support. |
| "Feedback was submitted but no one responded." | Feedback workflow and assigned owner. | Support/admin owner. |

#### Cross-Page Data Flow

Training Plan information may appear in multiple places, but that does not mean every place can edit the same data.

| Data flow | What it means for users |
|---|---|
| Training Plan -> Tutor Profiles | Tutor Profiles display assignments, in-progress modules, coverage required, and covered sessions based on Training Plan session and coverage data. |
| Training Plan -> Timeline | Timeline visualises the sequence and duration of modules and sessions. |
| Training Plan -> Monthly Breakdown | Monthly Breakdown groups the planned sessions by month and helps review delivery pressure. |
| Training Plan -> Exports | Exports are snapshots of the saved plan at the time of export. |
| Holiday Manager + cohort holiday selection -> Training Plan | Holidays only affect a cohort when they exist and are selected for that cohort. |
| KSB Profile + session/module KSB mapping -> KSB Coverage Summary | The summary depends on both the selected profile and mapped KSB codes. |
| Training Plan issue -> Risk Register | A scheduling issue may be recorded as a risk, but recording the risk does not automatically fix the schedule. |
| Events -> Planning context | Events may help planners make decisions, but they are not automatically Training Plan sessions or holidays. |
| LMS/APTEM -> User reference only | Users may compare external learner records with Training Plan, but external-system edits should not be assumed to change Training Plan. |

#### Common Wrong Assumptions

These assumptions cause many support issues:

| Wrong assumption | Correct understanding |
|---|---|
| "If a holiday exists, it affects every cohort." | A holiday affects only cohorts where that holiday is selected. |
| "Tutor Profile is where I fix assigned modules." | Assigned modules come from Training Plan schedule data. Tutor Profile may offer an authorised Add module shortcut, but that shortcut writes the module into Training Plan rather than creating a separate Tutor Profile-only record. |
| "Coverage Required appears automatically when a tutor is on leave." | Coverage Required appears when the session is manually marked as assigned tutor unavailable and no coverage tutor is selected. |
| "Selecting a coverage tutor changes the original assigned tutor." | Coverage Tutor records who covers the session; it does not necessarily replace the original assigned tutor on the module. |
| "LMS/APTEM changes update the Training Plan." | LMS and APTEM are external links unless an integration is documented. |
| "A dashboard value is the source record." | Dashboards usually summarise data; users should check the source page before changing records. |
| "An exported file will stay up to date." | Exports are snapshots and must be regenerated after changes. |
| "A 409 Conflict is a bug to ignore." | A 409 Conflict is a protection warning. Reload and review latest data before saving again. |

#### Developer Pre-Change Checklist

Before changing any Communication Centre page or Training Plan tab, developers should confirm:

1. Which visible page/tab the user is talking about.
2. Which route or component is responsible for that page.
3. Whether the page edits source data or only displays a summary.
4. Whether the change affects permissions, saving, exports, or audit activity.
5. Whether the same data is also shown in Timeline, Session Schedule, Tutor Profiles, Monthly Breakdown, or dashboards.
6. Whether existing user-facing documentation needs to be updated.
7. Whether the change could alter saved Training Plan data, holiday behaviour, KSB coverage, tutor coverage, or end-date calculation.
8. Whether old browser tabs, cached data, or exports could confuse users after the change.

#### User Acceptance Checks After a Change

After support or a developer updates a page, users should verify the result in the system rather than relying only on a message that the change is complete.

| Change area | User acceptance check |
|---|---|
| Navigation | The correct tab appears, opens the expected page, and highlights correctly. |
| Training Plan save | Changes remain visible after reload. |
| Session Schedule | Session dates, times, tutors, coverage, and clash badges appear as expected. |
| Tutor Profile | Assigned modules, in-progress modules, coverage required, and covered sessions match the Training Plan source data. |
| Holidays | Only selected cohort holidays affect the cohort schedule. |
| KSB Mapping | Required KSBs show as covered, missing, or repeated correctly. |
| Monthly Breakdown | Sessions appear in the correct month with the expected status and end-date impact. |
| Export | The exported file matches the latest saved Training Plan, not an older version. |
| Permissions | Users with and without admin/IT access see the correct pages and actions. |

#### Permission-Sensitive Navigation

Not every user sees every page or action. For example, User Activity is normally shown only to users with the correct admin or IT access. Some buttons inside Training Plan may also be hidden or disabled depending on the user's permissions.

If a user cannot see a page, tab, or action they expected, check:

| Check | Why it matters |
|---|---|
| Signed-in user | Visible navigation can depend on who is logged in. |
| Access level | Admin, IT, manager, coach, and standard user access may expose different pages or actions. |
| Current page | Some actions only appear inside the relevant module, such as coverage actions inside Training Plan. |
| Browser/session state | A stale session can show outdated access until the user signs out and signs in again. |
| Support/admin confirmation | Access changes may need to be granted by an authorised administrator. |

#### Internal Training Plan Tabs and Views

Inside Training Plan, users may see several tabs, buttons, or view areas. The exact wording can vary by release, but the purpose should remain consistent.

| Training Plan area | Main purpose | Typical user question |
|---|---|---|
| Timeline | Shows the planned delivery sequence across time. | What is happening first, next, and later? |
| Session Schedule | Shows session-level details such as date, time, tutor, coverage, clash status, and KSB indicators. | Which session is happening on this date, and who is responsible? |
| Monthly Breakdown | Groups planned delivery into months for easier review. | What does this cohort look like month by month? |
| Tutor Profiles | Shows tutor-related summaries derived from Training Plan and tutor/session data. | What is this tutor assigned to, what coverage is required, and what are they covering? |
| KSB Mapping | Shows Knowledge, Skills, and Behaviours mapped to sessions and compared against the selected KSB Profile. | Are the required KSBs covered, missing, or repeated? |
| Tutor Coverage | Session-level modal used to record unavailable tutors and coverage tutors. | Who cannot deliver this session, and who will cover it? |
| Module editor | Used to create or update module delivery details. | What is this module, when does it run, and how many sessions does it contain? |

#### How Users Should Move Between Pages

A common working pattern is:

1. Start from Home to understand the current day or general system context.
2. Check News & Announcements for important operational updates.
3. Open Training Plan to review cohort, module, session, coverage, clash, and KSB information.
4. Use Events and holiday context when checking date clashes or unusual scheduling.
5. Use Departments to identify the right person or team if ownership is unclear.
6. Use Policies when a decision depends on an internal rule or quality requirement.
7. Use LMS or APTEM only for records held in those external systems.
8. Use User Activity, if permitted, when support or audit review needs activity context.

#### Developer and Support Notes for Navigation

For developers and support users, navigation matters because users often describe problems by the tab they clicked rather than by a technical route name. When investigating an issue, record both the visible navigation item and the underlying page or route if available.

| User wording | Likely area to check |
|---|---|
| Training Plan tab | Training Plan route and related schedule data. |
| Session Schedule | Session list, table, card rendering, and session data. |
| Tutor Profile | Tutor profile summary calculations and tutor/session links. |
| Coverage popup or Coverage modal | Session-level Tutor Coverage data entry. |
| Monthly view | Monthly Breakdown grouping and date calculations. |
| Timeline | Timeline ordering, date range, and status indicators. |
| User Activity tab | Permission-controlled activity or audit area. |
| LMS or APTEM | External system link or external-system access issue. |

Support should avoid assuming that a problem in an external system is a Training Plan issue. Likewise, a Training Plan schedule issue should be fixed in Training Plan rather than only noted in LMS, APTEM, news, or email.

## 2. Training Plan Structure

Training Plan uses this hierarchy:

`Programme -> Cohort -> Group -> Module -> Session`

Each level controls or explains the level below it.

| Level | What it represents | What it contains | Effect on lower levels | Example |
|---|---|---|---|---|
| Programme | The top-level course or qualification area. | Programme name, subtitle/date range, colour, and cohorts. | Cohorts belong to a programme. Reports and filters group data by programme. | `PCP L4`, `Marketing Executive L3` |
| Cohort | A learner intake or class population within a programme. | Cohort name, starting date label, optional end date label, selected holidays, selected KSB Profile, and groups/modules. | Holidays and KSB Profile selected at cohort level affect modules and sessions inside that cohort. | `Cohort 1 - Jan 2026` |
| Group | A delivery group inside a cohort. | Group name, coach, weekly delivery days, session start/end time, and modules. | Modules inside the group inherit the group's delivery pattern unless changed through module setup. | `G1 - Monday`, `Friday PM Group` |
| Module | A scheduled block of learning. | Module name, tutor, tutor profile, start date, calculated end date, number of sessions, colour, notes, KSB mapping, and coverage data. | Session dates are generated from module start date, session count, selected weekdays, times, and selected cohort holidays. | `Risk Management`, `PMP`, `Social Media` |
| Session | A single delivery occurrence within a module. | Session number, date, time, tutor, coach, KSB mapping, coverage status, and clash status. | Sessions are used for monthly review, tutor profile summaries, coverage records, and completion/progress indicators. | `Session 3 on Monday 2026-02-09, 09:00-11:00` |

### Important Structure Notes

- A programme can have many cohorts.
- A cohort can have multiple groups.
- A group can contain multiple modules.
- A module can contain one or more sessions.
- A session is not usually created manually one by one. It is generated from the module schedule.
- Cohort-level selections, especially holidays and KSB Profile, are important because they affect the sessions shown below that cohort.

## 3. Training Plan Screen

The Training Plan screen brings together planning, schedule review, and risk indicators.

### Main UI Areas

| Area | Purpose | Typical user action |
|---|---|---|
| Programme filters | Focus the view on one or more programmes. | Select the programme you want to review or manage. |
| Cohort/group filtering | Helps users narrow the schedule to a specific cohort or group. | Review one cohort, one class group, or a specific delivery stream. |
| Timeline | Visual Gantt-style view of modules over time. | Check sequencing, overlaps, end dates, and visible clashes. |
| Monthly Breakdown | Month-by-month module/session review. | Check session dates, holidays, tutors, coaches, KSBs, and affected sessions. |
| Session schedule table | Session-focused view by programme, cohort, module, and weekday. | Check current session, upcoming sessions, progress, and coverage. |
| Session cards/rows | Detailed session information. | Open session details or coverage actions. |
| Add/Edit module actions | Create or update scheduled modules. | Add a module to a cohort/group, edit dates, tutor, notes, or KSB mapping. |
| Coverage button | Opens the Tutor Coverage modal for a session. | Mark a tutor unavailable and optionally assign a coverage tutor. |
| KSB indicators | Show planned KSB codes for modules and sessions. | Confirm whether knowledge, skills, and behaviours are mapped. |
| Clash indicators | Highlight schedule risks. | Investigate Holiday Clash, Tutor Conflict, or Replacement Clash. |
| Save/reload behaviour | Protects the saved Training Plan data. | Save changes after reviewing them; reload if the system warns about newer data. |

### Save and Reload Behaviour

When a user saves Training Plan changes, the system checks whether the data on screen is still the latest version. If another user saved changes first, the system may block the save and ask the user to reload. This protects the Training Plan from being overwritten by an older page.

### Main Tabs

Training Plan is normally reviewed through three main working views.

| Tab | Main purpose | Best for |
|---|---|---|
| Timeline | Visual planning and clash review. | Programme sequencing, cohort planning, holiday clashes, tutor conflicts, replacement clashes, and end date review. |
| Session Schedule | Session-level operational schedule. | Current sessions, progress, weekly delivery days, tutor/coach/time checks, coverage actions, and next module review. |
| Tutor Profiles | Tutor-centred workload and coverage view. | Tutor assignments, conflicts, coverage required, sessions covered by a tutor, coach relationships, and upcoming session breakdown. |

Users should not rely on only one tab for final review. A good review normally starts in Timeline, checks session detail in Session Schedule, then confirms tutor workload and coverage in Tutor Profiles.

### Toolbar and Management Actions

Depending on permissions, users may see actions such as:

| Action | Purpose | Typical user |
|---|---|---|
| Add Programme | Creates a new programme area. | Administrator. |
| Manage Programme | Edits programme details and cohort list. | Administrator. |
| Add Cohort | Creates a new cohort under a programme. | Administrator or planning lead. |
| Edit Cohort | Updates cohort, group, module, holiday, KSB, tutor, and schedule details. | Administrator or planning lead. |
| Manage Modules | Maintains the module catalogue. | Administrator. |
| Add Module | Adds a reusable module definition. | Administrator. |
| Holidays | Opens Holiday Manager. | Administrator or planning lead. |
| KSB Profiles | Opens KSB Profile management. | Quality/admin user. |
| Export Excel | Exports Training Plan data to a workbook. | Administrator, reviewer, senior manager. |
| Coverage | Opens the Tutor Coverage modal for a session. | Coverage coordinator, administrator, planning lead. |

If an expected button is not visible, the user may not have management permissions, or the current view may not contain saved programmes yet.

### Read-Only vs Management Access

Some users may only be able to view Training Plan. Other users can manage cohorts, modules, tutor profiles, holidays, and KSB Profiles.

| Access type | Can do | Cannot normally do |
|---|---|---|
| Read-only | View Timeline, Session Schedule, Tutor Profiles, Monthly Breakdown, clashes, coverage summaries, and KSB mapping. | Save edits, add/delete cohorts, change module schedules, update coverage, manage holidays, or edit KSB Profiles. |
| Management access | Create/edit programmes, cohorts, groups, modules, tutor profiles, holidays, KSB profiles, coverage, and schedule assignments. | Should still avoid unrelated changes and should reload before major edits. |

Read-only users can still use the documentation to understand the plan and raise issues to an administrator.

### Empty States

Training Plan may show empty-state messages when required data does not exist yet.

| Empty state | Meaning | What to do |
|---|---|---|
| No programmes saved yet | The system has no saved programme configuration. | Add a programme first. |
| No session schedule yet | There are no saved programmes/modules to generate a schedule. | Add programme, cohort, groups, and modules. |
| No tutor profiles yet | There are no saved programmes/tutor assignments to summarise. | Create Tutor Profiles and assign them to modules. |
| No modules in catalogue | The module catalogue has not been populated. | Add module catalogue entries before scheduling modules. |
| No upcoming sessions for this tutor | The selected tutor has no future generated sessions. | Check assigned modules, dates, and tutor profile link. |

### Training Plan Field Reference

The following fields commonly appear when creating or editing programmes, cohorts, groups, and modules.

| Field | Level | Meaning | User guidance |
|---|---|---|---|
| Programme name | Programme | The display name of the programme. | Use a clear name that matches the qualification or internal programme label. |
| Programme subtitle/date range | Programme | Supporting programme description or date range. | Use it to identify the broad programme period or intake window. |
| Programme colour | Programme | Visual colour used in Timeline and summaries. | Choose a distinct colour so the programme is easy to scan. |
| Cohort name | Cohort | Name of the learner intake or cohort. | Use a naming convention that users can recognise, such as `Cohort 1 - Jan 2026`. |
| Starting date label | Cohort | A visible label for the cohort start period. | Keep it consistent with intake naming. |
| Cohort end date label | Cohort | Optional planned end label for the cohort. | Use when a cohort has a known high-level completion date. |
| Selected holidays | Cohort | Holidays/non-teaching periods that apply to this cohort. | Select only the holidays that should affect this cohort. |
| KSB Profile | Cohort | The expected KSB set for the cohort. | Select before reviewing KSB coverage. |
| Group name | Group | Name of the delivery group inside the cohort. | Use a name that reflects the class group or timetable pattern. |
| Coach | Group | Coach responsible for the group. | Check spelling because this appears in summaries. |
| Days | Group/module schedule | Weekly delivery day or days. | Multiple days mean multiple sessions per week. |
| Start time | Group/module schedule | Session start time. | Check it carefully because it is used for tutor conflict detection. |
| End time | Group/module schedule | Session end time. | Check it carefully because it is used for tutor conflict detection. |
| Module | Module | The learning block being scheduled. | Select from the module catalogue where possible. |
| Tutor/Lecturer | Module | Assigned tutor profile for the module. | Use an active Tutor Profile, not just a typed name. |
| Module start date | Module | First date the module can start from. | The first actual session is based on this date and selected weekdays. |
| Module end date | Module | Calculated date of the final counted session. | Review after changing days, sessions, or holidays. |
| Sessions | Module | Number of required sessions. | Confirm this matches the module catalogue and delivery plan. |
| Notes | Module | Optional operational notes. | Use for planning context, not private HR information. |
| Session KSB Mapping | Session | KSB codes planned for each session. | Use valid codes such as `K1`, `S2`, `B3`. |
| Session Coverage | Session | Tutor unavailability and cover arrangement. | Enter manually when a tutor cannot deliver a specific session. |

### Module Catalogue vs Scheduled Module

The module catalogue and the scheduled module are related but not the same thing.

| Item | Meaning | Example |
|---|---|---|
| Module catalogue item | Shared definition of a module, including name, colour, number of sessions, notes, session names, descriptions, and default KSB mapping. | `Risk Management`, 6 sessions, blue colour, saved session names. |
| Scheduled module | A module placed into a specific cohort/group with dates, tutor, time, coverage, and cohort-specific KSB mapping. | `Risk Management` for `PCP L4`, `Cohort 1`, `G1`, starting 2026-01-05. |

Changing a scheduled module affects that cohort/group schedule. Changing a module catalogue item affects the shared module definition and may influence how module names, session names, or catalogue details appear elsewhere.

## 4. Sessions

Sessions are generated from the module schedule. Users do not normally need to create every session manually.

### How Sessions Are Generated

A module's sessions are calculated from:

- Module start date.
- Number of sessions.
- Selected delivery weekday or weekdays.
- Session start time.
- Session end time.
- Holidays selected on the cohort.

The system walks forward from the module start date and counts matching weekdays until the required number of valid sessions has been reached.

### What Each Session Contains

Each generated session can include:

- Session number.
- Session date.
- Session title, if the module catalogue has saved session names.
- Optional session description.
- Assigned tutor.
- Coach.
- Group.
- Time range.
- KSB mapping.
- Coverage status.
- Holiday clash or replacement status.
- Completion/current/upcoming status.

### Weekly Recurrence

The selected weekdays control how often sessions happen.

| Selected days | Meaning |
|---|---|
| Monday | One session per week on Monday. |
| Wednesday | One session per week on Wednesday. |
| Monday + Wednesday | Two sessions per week, one on Monday and one on Wednesday. |
| Friday + Saturday | Two sessions per week, one on Friday and one on Saturday. |

If a module has 10 sessions and the selected days are Monday and Wednesday, the system schedules two sessions per week until 10 valid sessions have been counted. This usually finishes sooner than a 10-session module that only runs on Monday.

### How Session Count Affects Final Date

The session count defines how many valid sessions the module needs. The final module date is the date of the last counted session after holidays and replacements are considered.

Example:

- Module start date: Monday 5 January.
- Sessions: 6.
- Days: Monday.
- No holidays: the baseline end date is the sixth Monday.
- If one Monday is a selected cohort holiday, that session is skipped and a replacement Monday is added later.
- The effective end date becomes later than the baseline end date.

### Session Statuses

Session status is based on the current date and the saved session end time.

| Status | Meaning | What users should understand |
|---|---|---|
| Upcoming | The session is in the future. | It should still be checked for tutor, coverage, holiday, and KSB readiness. |
| Current | The next not-yet-ended session in a module. | This is the session users are most likely to act on. |
| Completed | The session end date/time has passed. | Completed sessions are normally used for progress display and should not usually need coverage editing. |
| Module finished | All planned sessions have passed. | The module is considered finished for schedule progress purposes. |

### Session Names and Descriptions

If the module catalogue contains saved session names and descriptions, Training Plan can show a more meaningful title for each session. If no session name exists, the system may display a generic title such as `Session 1` or show that no real session name has been saved.

For better user experience and quality review, administrators should keep module catalogue session names updated, especially for modules with many sessions.

### Session Schedule View

The Session Schedule view is the table-based view of Training Plan. It is designed for users who need to review what is happening now, what is coming next, who is delivering each session, and whether any session needs coverage.

Unlike the Timeline, which focuses on visual planning over time, the Session Schedule focuses on session delivery detail.

### Session Schedule Columns

| Column | What it shows | How to use it |
|---|---|---|
| Programme | The programme connected to the scheduled module. | Use it to confirm the row belongs to the correct programme. |
| Cohort | The cohort or date range connected to the module. | Use it to confirm the learner intake/group schedule. |
| Module | The module being delivered. | Use it to identify the learning block. |
| Module dates | The module start and end dates. | Use it to confirm the delivery window. |
| Current session | The current or next relevant session in the module. | Use it to quickly understand where the module is in its delivery sequence. |
| Progress | Completed sessions compared with total sessions. | Use it to check whether the module is not started, in progress, or finished. |
| Saturday to Friday columns | The weekly delivery day columns. | Use these to see which day the session normally runs on and who is delivering. |
| Next module | The next saved module after the current one in the cohort/module sequence. | Use it to prepare for handover, tutor planning, and upcoming delivery risk. |

The weekday columns normally show the tutor, coach, and time for the scheduled session pattern. If a module runs on more than one day, more than one weekday column may contain session information.

### Current Session

The Current Session field shows the session the system considers most relevant at the current point in time. It is usually the next not-yet-ended session. If all sessions have ended, the row can show the module as finished.

Current Session can include:

- Session number.
- Session name, if saved in the module catalogue.
- Session date.
- Session description, if available.
- Assigned tutor.
- Coach.
- Coverage status.
- Whether the session is completed, current, or upcoming.

If the module catalogue does not contain a saved session name, the system may show a generic session name and a warning that no real session name has been saved. This is not usually a scheduling error, but it is a catalogue data quality issue.

### Progress

Progress compares completed sessions with the total number of planned sessions.

| Example progress | Meaning |
|---|---|
| `0/6 completed` | The module has not delivered any sessions yet. |
| `3/6 completed` | Three sessions have ended and three are still remaining. |
| `6/6 completed` | The module is finished from a schedule-progress point of view. |

Progress is calculated from generated session dates and session end times. It is not the same as learner attendance or learner achievement.

### All Sessions Modal

When a user opens session details, the All Sessions area lists every generated session for that module.

It can show:

- Session number.
- Session title.
- Session date.
- Description.
- Status: completed, current, or upcoming.
- Primary Tutor badge.
- Unavailable badge.
- Coverage Required badge.
- Covered By badge.
- Coverage button for editable upcoming/current sessions.

Use All Sessions when you need to understand the full sequence, not only the current session.

### Next Module

The Next Module area shows the module saved after the current module in the same cohort/module sequence.

It may show:

- Next module name.
- Tutor.
- Coach.
- Dates.
- Number of sessions.
- Whether the next tutor already has other active modules.
- Whether the next tutor has overlapping sessions.

If there is no saved next module, the view may show that no scheduled next module block exists yet. This means the current module does not have a following module in the saved Training Plan sequence.

### Session Schedule and Tutor Conflicts

The Session Schedule helps identify tutor conflicts by comparing tutor, date, and time. A conflict can appear when the same tutor is assigned to overlapping sessions.

Users should check:

- Is the same tutor assigned to two sessions on the same date?
- Do the session times overlap?
- Is one session already completed?
- Should one module be rescheduled?
- Should another tutor be assigned?
- Should coverage be recorded manually?

### Session Schedule and Coverage

Coverage actions are entered at session level. In the Session Schedule, coverage indicators help users see whether action is needed.

| Indicator | Meaning |
|---|---|
| Unavailable | The assigned tutor has been manually marked unavailable. |
| Coverage Required | The assigned tutor is unavailable and no coverage tutor has been selected. |
| Covered By | A coverage tutor has been selected for the session. |

Completed sessions are normally not edited for coverage from the schedule view. Coverage is intended mainly for sessions that are current or upcoming.

### Suggested Coverage Tutors

When assigning coverage, the system can show suggested coverage tutors. Suggestions are based on Training Plan data such as tutor profiles, same-module experience, same-programme experience, and current schedule conflicts.

Suggested tutors may be marked:

| Suggestion status | Meaning |
|---|---|
| Available | The tutor does not appear to have a detected conflict for that session time. |
| Conflict | The tutor appears to have another assignment at that date/time and should not be selected without resolving the conflict. |
| Same module | The tutor has experience with the same module in Training Plan. |
| Same programme | The tutor has experience with the same programme in Training Plan. |
| Sessions count | Shows how many sessions are associated with that tutor in Training Plan. |

Suggestions are decision support only. Users should still apply operational judgement before selecting a coverage tutor.

## 5. Holidays

Holidays and non-teaching periods are managed separately in Holiday Manager.

### Key Rule

A holiday only affects a cohort if that holiday is selected on that cohort.

Creating a holiday in Holiday Manager does not automatically apply it to every cohort. This is intentional. Different cohorts may follow different calendars, delivery models, or exception rules.

### How Holidays Affect Sessions

When a selected holiday overlaps a planned session date:

- The planned session is treated as a Holiday Clash.
- That clashed date does not count as a delivered session.
- The system continues looking for later valid delivery dates.
- A replacement session is added on the next valid matching weekday.
- The module may extend beyond its baseline end date.

### Holiday Clash

A Holiday Clash means a planned session falls on a holiday or non-teaching period selected for that cohort.

Users should review Holiday Clashes to confirm:

- The holiday is genuinely relevant to the cohort.
- The module extension is acceptable.
- Replacement sessions are visible and understood.
- Any affected tutor/coach arrangements are still valid.

### Original End Date, Baseline End Date, and Effective End Date

| Term | Meaning |
|---|---|
| Original end date | The saved end date currently held for the module. It may reflect a previous calculation or stored plan. |
| Baseline end date | The end date the module would have if the required sessions ran on the selected weekdays without holiday clashes. |
| Effective end date | The actual calculated end date after selected cohort holidays are considered and replacement sessions are added. |

If holidays cause replacement sessions, the effective end date may be later than the baseline end date.

### Holiday Manager Details

Holiday Manager is used to create and maintain holiday or non-teaching periods. A holiday period normally includes:

| Field | Meaning | Example |
|---|---|---|
| Name | The visible holiday/non-teaching period name. | `Christmas Break`, `Bank Holiday`, `Assessment Week`. |
| Type | Category of the period. | `holiday`, `term-break`, `non-teaching`. |
| Start date | First date of the period. | `2026-12-21`. |
| End date | Last date of the period. | `2027-01-03`. |
| Colour | Visual style used for the holiday type. | Used to make holiday types easier to identify. |

Holiday types help users distinguish different reasons for non-delivery, but the important scheduling rule remains the same: the holiday must be selected on the cohort before it affects that cohort's sessions.

### Holiday Selection Example

Suppose Holiday Manager contains `Christmas Break`, but there are two cohorts:

- Cohort A runs through Christmas and has `Christmas Break` selected.
- Cohort B is not affected and does not have `Christmas Break` selected.

Only Cohort A will have sessions shifted because of that holiday. Cohort B will continue to calculate sessions as if that holiday does not apply.

## 6. Clashes and Warnings

Training Plan highlights schedule issues so users can review them before relying on the plan.

### Clash Types

| Clash | What causes it | How it appears | What to do next |
|---|---|---|---|
| Holiday Clash | A session falls on a holiday selected for that cohort. | Red holiday indicators, affected session counts, `H` badges, or holiday clash details in Timeline/Monthly Breakdown. | Confirm the holiday should apply to the cohort. Review replacement sessions and the new effective end date. |
| Tutor Conflict | The same tutor is scheduled for another session at the same time. | Tutor conflict warning, connector/marker on the Timeline, `T` badge, or warning in Tutor Profile. | Edit one of the modules, change the tutor, change the session time, or assign suitable coverage where appropriate. |
| Replacement Clash | A replacement session also lands on a selected holiday/non-teaching period. | Orange replacement indicator, `R` badge, replacement clash count, or replacement warning. | Review whether the holiday selection is correct and whether the schedule extension remains acceptable. |

### System-Detected Conflicts vs Manual Coverage

System-detected conflicts are warnings produced from the saved Training Plan schedule. They alert users to possible problems, such as a tutor being double-booked.

Manual coverage is entered by a user from the session-level Tutor Coverage modal. It records that the assigned tutor is unavailable and, optionally, which tutor will cover that session.

Important: a system-detected conflict does not automatically create coverage. A user must still open the Coverage modal and record coverage decisions manually.

### Warning Review Priority

When several warnings appear, review them in this order:

1. Tutor Conflict, because it can mean the same tutor is expected to deliver two sessions at once.
2. Holiday Clash, because it changes the counted delivery dates.
3. Replacement Clash, because it may extend the module further than expected.
4. Coverage Required, because it means a tutor has been marked unavailable and no cover has been selected.
5. KSB missing or repeated warnings, because they affect quality review and evidence planning.

This order is only a practical recommendation. Local delivery priorities may require a different order.

## 7. Tutor Coverage

Tutor Coverage is managed at session level from Training Plan.

Open the relevant session, then use the Coverage button to open the Tutor Coverage modal.

### Tutor Coverage Fields

| Field | Meaning | Notes |
|---|---|---|
| Assigned tutor unavailable | Marks that the primary assigned tutor cannot deliver this specific session. | This is a manual action. |
| Unavailable Reason | Explains why the assigned tutor is unavailable. | Examples: sickness, annual leave, appointment, conflict. |
| Coverage Tutor | The tutor selected to cover the session. | The assigned tutor cannot be selected as their own coverage tutor. |
| Coverage Reason | Explains why the selected tutor is covering. | Required when a coverage tutor is selected. |
| Notes | Additional information about the coverage arrangement. | Useful for handover details or quality review notes. |

### Coverage Logic

- Coverage Required is populated when `Assigned tutor unavailable` is checked and no Coverage Tutor is selected.
- Sessions Covered By This Tutor is populated when that tutor is selected as the Coverage Tutor for another tutor's session.
- Tutor Profile displays these results, but the data is entered from the session-level Coverage modal in Training Plan.
- There is currently no automatic unavailable detection from holidays or an absence calendar. Tutor unavailability is recorded manually.

### Coverage Examples

Example 1: Coverage Required

- Ray is the assigned tutor for a session.
- A user opens the session Coverage modal.
- The user checks `Assigned tutor unavailable`.
- No Coverage Tutor is selected.
- The session appears under Coverage Required for Ray.

Example 2: Session Covered By This Tutor

- Juliane is the assigned tutor for a session.
- A user marks Juliane as unavailable.
- Ray is selected as the Coverage Tutor.
- The session appears under Sessions Covered By This Tutor for Ray.

### Coverage Decision Guide

| Situation | Recommended action |
|---|---|
| Tutor is available and will deliver the session | Do not tick Assigned tutor unavailable. |
| Tutor is unavailable and no cover has been found | Tick Assigned tutor unavailable, add the reason, leave Coverage Tutor blank, and save. |
| Tutor is unavailable and cover has been found | Tick Assigned tutor unavailable, select Coverage Tutor, enter Coverage Reason, and save. |
| Tutor has a system-detected conflict but will still deliver after schedule adjustment | Edit the Training Plan schedule rather than using coverage. |
| Tutor has a system-detected conflict and a different tutor will deliver this session | Record coverage if the assigned tutor remains unavailable for that session. |

### Coverage Data Quality

Coverage records are most useful when users enter clear reasons. Avoid vague notes such as `cover needed` without explanation. Better examples include:

- `Assigned tutor on annual leave.`
- `Tutor conflict with PCP L4 Cohort 2 at the same time.`
- `Sickness cover arranged for this session only.`
- `Ray covering due to same-module experience.`

## 8. Tutor Profile Relationship

Tutor Profile is both a tutor-centred summary view and, for authorised users, a shortcut for assigning an additional module to a tutor.

The important rule is that Tutor Profile does not create a separate private schedule. When an authorised user adds a module from Tutor Profile, the module is added into the Training Plan schedule for the selected programme/cohort/group. After it is saved, it should appear in the Timeline, Session Schedule, Monthly Breakdown, and the tutor's own profile summaries.

Tutor Profile displays summaries derived from Training Plan and tutor/session data. It helps users understand tutor workload, assignments, conflicts, and coverage, while the saved module/session schedule remains part of Training Plan.

### Tutor Profile Sections That Depend on Training Plan

| Tutor Profile section | Source |
|---|---|
| In Progress Modules | Modules in Training Plan where the current date is between the module start and end dates. |
| Assigned Modules | Future modules assigned to the tutor in Training Plan. |
| Completed Modules | Past modules where all planned sessions have ended. |
| Coaches Working With This Tutor | Coach names from Training Plan sessions linked to the tutor. |
| Coverage Required | Sessions where the tutor is assigned, marked unavailable, and no coverage tutor is selected. |
| Sessions Covered By This Tutor | Sessions where the tutor is selected as the coverage tutor for another assigned tutor's session. |
| Tutor Conflict warnings | Schedule overlaps from Training Plan where the same tutor is booked at the same time. |

If something looks wrong in Tutor Profile, check the Training Plan module/session first.

### Adding a Module From Tutor Profile

Authorised users may see an `Add module` control inside Tutor Profile module sections. This is useful when a planner is reviewing a tutor and wants to assign an additional module directly from that tutor-centred view.

This action should be understood as a shortcut into Training Plan scheduling, not as a separate Tutor Profile-only action.

Typical flow:

1. Open Training Plan.
2. Open the Tutor Profiles tab.
3. Select the tutor.
4. Use the `Add module` control if it is visible.
5. Choose the module from the module list.
6. Select the target cohort.
7. Select an existing group or create a new group.
8. Enter the module start date.
9. Confirm group details such as group name, coach, weekdays, start time, and end time if creating a new group.
10. Save the module.
11. Review Timeline, Session Schedule, Monthly Breakdown, and Tutor Profile again after the save.

When the module is added:

| Result | What users should expect |
|---|---|
| Tutor assignment | The selected tutor is assigned to the new module. |
| Cohort/group placement | The module is placed inside the selected cohort and group, or inside the newly created group. |
| Session generation | Sessions are generated from the module start date, session count, selected weekdays, session times, and selected cohort holidays. |
| Timeline visibility | The module appears on the Timeline as part of the relevant programme/cohort/group. |
| Session Schedule visibility | The generated sessions appear in the Session Schedule table. |
| Monthly Breakdown visibility | The sessions appear in the relevant monthly breakdown, including holiday/replacement effects where applicable. |
| Tutor Profile visibility | The module appears under the tutor's In Progress, Assigned, or Completed module sections depending on dates. |
| Save protection | The action still uses Training Plan save protection, including version checks and conflict handling. |

### Add Module From Tutor Profile vs Module Catalogue

There are two different ideas that users should not confuse:

| Action | What it does |
|---|---|
| Add or manage a module in the module catalogue | Creates or updates the reusable module definition, such as module name, colour, default session count, notes, session names, and KSB mapping. |
| Add module from Tutor Profile | Adds a scheduled instance of an existing module to a selected cohort/group and assigns it to the selected tutor. |

If a module is missing from the `Add module` list in Tutor Profile, check the module catalogue first. The tutor shortcut can only offer modules that exist in the available module list.

### When the Add Module Control Is Not Visible

The `Add module` control may not appear for every user or every tutor.

Common reasons include:

| Reason | Explanation |
|---|---|
| User does not have management access | Only authorised users should be able to add scheduled modules. |
| Tutor is a legacy/free-text tutor | The shortcut requires a real Tutor Profile, not only an old text name. |
| No modules are available in the module list | The module catalogue or module list may need to be populated first. |
| No saved programme/cohort exists | A module needs a target cohort/group before it can be scheduled. |
| Page is still loading | Wait for Training Plan and Tutor Profiles to finish loading before checking available actions. |

### Verifying a Module Added From Tutor Profile

After adding a module from Tutor Profile, users should not rely only on the success message. They should verify the result across the connected Training Plan views:

| View | What to verify |
|---|---|
| Tutor Profile | The module appears under the correct tutor and in the correct status section. |
| Timeline | The module appears under the correct programme, cohort, and group. |
| Session Schedule | Sessions show the expected dates, weekdays, times, tutor, and coach. |
| Monthly Breakdown | Sessions appear in the correct months and holiday/replacement effects are correct. |
| KSB Mapping | Session KSBs appear as expected if the catalogue module has KSB mappings. |
| Save/reload | The module remains after reload, confirming it was saved successfully. |

### Support Notes for Tutor Profile Module Adds

If a user says, "I added a module from Tutor Profile but it is not on the Timeline," support should check:

1. Whether the save completed successfully.
2. Whether the user selected the correct cohort.
3. Whether the user selected the correct existing group or created a new group.
4. Whether the module start date was entered.
5. Whether the current Timeline filters hide the programme/cohort/group.
6. Whether the module appears in Session Schedule.
7. Whether the module appears after reloading latest data.
8. Whether a `409 Conflict` or save warning appeared.
9. Whether the selected tutor was a real Tutor Profile rather than a legacy tutor name.
10. Whether the module exists in the module catalogue/module list.

### Why Tutor Profile May Look Different From the Timeline

Tutor Profile is summarised around one tutor. Timeline is summarised around programmes, cohorts, groups, and modules. This means the same session can appear differently depending on the view:

- In Timeline, the session appears inside its programme/cohort/module context.
- In Tutor Profile, the session appears inside the selected tutor's workload.
- In Coverage Required, the session appears for the assigned tutor when they are unavailable.
- In Sessions Covered By This Tutor, the session appears for the tutor selected as cover.

If the same session seems to appear under two tutors, check whether one tutor is assigned and the other is covering.

### Tutor Profile Detailed Guide

The Tutor Profile view is used to understand a tutor's Training Plan workload. It gathers assigned sessions, modules, coach relationships, conflicts, upcoming sessions, and coverage information into one tutor-centred view.

Tutor Profile is useful for:

- Checking what a tutor is currently delivering.
- Checking what modules are assigned in the future.
- Reviewing completed module history.
- Finding tutor conflicts.
- Reviewing coverage required for that tutor.
- Reviewing sessions the tutor is covering for someone else.
- Understanding which coaches work with the tutor.
- Checking upcoming session details.

### Tutor Profile Selector and Search

Users can select a tutor profile from the available tutor list. The list is built from saved Tutor Profiles and Training Plan assignments.

If a tutor does not appear:

- Confirm the tutor profile exists.
- Confirm the profile is active.
- Confirm the tutor is assigned to at least one module or has been created as a Tutor Profile.
- Check for spelling differences or duplicate profiles.

### Tutor Profile Summary Data

| Item | Meaning |
|---|---|
| Tutor name | The saved Tutor Profile name. |
| Email | Optional tutor contact email. |
| Phone | Optional tutor contact number. |
| Status | Whether the profile is active or inactive. |
| Notes | General notes saved on the Tutor Profile. |
| Modules This Tutor Can Deliver | A profile-level list of modules the tutor can deliver or is suitable for. |
| Session count | Summary count of sessions associated with this tutor in Training Plan. |

The Tutor Profile information helps with planning, but the actual module/session schedule still comes from Training Plan.

### In Progress Modules

In Progress Modules are modules where:

- The tutor is assigned.
- The current date is within the module delivery window.
- The module has not yet completed all planned sessions.

Each module card can show:

- Module name.
- Programme.
- Cohort.
- Group.
- Module start and end dates.
- Number of sessions.
- Coach.
- Weekly schedule.
- Warning count if conflicts exist.
- Edit action, if the user has permission.

### Assigned Modules

Assigned Modules are future modules assigned to the tutor. These are modules that have not started yet based on their planned start date.

Use Assigned Modules to prepare:

- Upcoming tutor workload.
- Future delivery clashes.
- Tutor availability checks.
- Coach handover.
- KSB or module preparation.

### Completed Modules

Completed Modules are modules where the planned sessions have ended. These are useful for reviewing delivery history, but they should not be treated as learner achievement records.

### Coverage Required in Tutor Profile

Coverage Required shows sessions where the selected tutor is the assigned tutor, has been marked unavailable, and does not yet have a coverage tutor selected.

This section depends on manual coverage data entered in the session Coverage modal.

Example:

- Ray is assigned to Session 4.
- Ray is marked unavailable.
- No Coverage Tutor is selected.
- Session 4 appears in Ray's Coverage Required section.

If Coverage Required is empty, it usually means there are no sessions where this tutor is both unavailable and uncovered.

### Sessions Covered By This Tutor

Sessions Covered By This Tutor shows sessions where the selected tutor is covering for another assigned tutor.

Example:

- Juliane is assigned to Session 2.
- Juliane is marked unavailable.
- Ray is selected as Coverage Tutor.
- The session appears in Ray's Sessions Covered By This Tutor section.

This helps users understand not only a tutor's own assigned teaching, but also extra coverage responsibilities.

### Coaches Working With This Tutor

This section summarises coaches linked to the tutor's sessions. It can show:

- Coach name.
- Number of sessions connected to that coach.
- Programmes connected to that coach/tutor relationship.
- Modules connected to that coach/tutor relationship.

Selecting a coach opens coach details for the selected tutor, showing the sessions contributing to that coach total.

### Coach Details Modal

The coach details view helps users inspect the relationship between one tutor and one coach.

It can show:

- Date.
- Time.
- Session.
- Module.
- Programme, cohort, and group.
- Module dates.
- Status.
- Edit action, if available.

Use this when a coach asks, "Which sessions am I working on with this tutor?"

### Upcoming Session Breakdown

Upcoming Session Breakdown lists the selected tutor's upcoming sessions in date order.

It can show:

- Date.
- Time.
- Session name or number.
- Module.
- Programme and group.
- Coach.
- Coverage badges.
- Pagination when there are many sessions.

This section is useful for weekly planning, tutor briefing, and identifying coverage actions before delivery day.

### Tutor Profile Edit Fields

When editing or creating a Tutor Profile, users may see:

| Field | Meaning | Guidance |
|---|---|---|
| Full name | Tutor's display name. | Use the tutor's real working name and avoid duplicates. |
| Email | Tutor's contact email. | Optional but useful for administration. |
| Phone | Tutor's contact phone number. | Optional. |
| Status | Active or inactive profile state. | Inactive tutors should not normally be used for new assignments. |
| Modules This Tutor Can Deliver | Modules the tutor can deliver or is suitable to cover. | Keep this updated to improve coverage planning. |
| Notes | General tutor notes. | Keep notes professional and relevant to planning. |

### Tutor Profile Data Quality

Tutor Profile data is only useful if profiles are clean and consistent.

Recommended practices:

- Create one profile per tutor.
- Avoid spelling variations for the same person.
- Use active/inactive status correctly.
- Do not assign modules to inactive tutors unless there is a specific reason.
- Keep Modules This Tutor Can Deliver updated.
- Use coverage notes to explain operational decisions.

### Legacy Tutor Names

Some older Training Plan data may contain tutor names that are not linked to a formal Tutor Profile. These may appear as legacy tutor names. Where possible, users should select or create a proper Tutor Profile before saving new assignments.

Using Tutor Profiles improves:

- Tutor conflict detection.
- Coverage assignment.
- Tutor workload summaries.
- Search and filtering.
- Data quality in reports.

## 9. KSB Mapping

KSB means:

- Knowledge.
- Skills.
- Behaviours.

KSB mapping records which apprenticeship or programme standards are planned to be covered by each session.

### Purpose of KSB Mapping

KSB mapping helps users and reviewers confirm:

- Which required KSBs are covered.
- Which KSBs are missing.
- Which KSBs are repeated.
- Whether session planning is aligned with the selected KSB Profile.

### KSB Profile

A KSB Profile is selected at cohort level. It defines the expected K, S, and B codes for that cohort or programme.

Only relevant active KSB Profile codes should be used for the cohort. The selected profile gives the system a reference list for coverage summaries.

### Session-Level KSB Mapping

Each module can have KSBs mapped per session.

| KSB field | Meaning | Example |
|---|---|---|
| Knowledge covered | Knowledge codes planned for the session. | `K1`, `K3` |
| Skills covered | Skill codes planned for the session. | `S2`, `S5` |
| Behaviours covered | Behaviour codes planned for the session. | `B1`, `B4` |

Codes should be entered clearly in the expected format, such as `K1`, `S2`, or `B3`.

The system normalizes KSB codes by trimming spaces, converting to uppercase, removing duplicates, and ignoring invalid formats. This means `k1` and `K1` are treated as the same code.

### KSB Coverage Summary

The KSB coverage summary helps users see:

- Covered KSBs: codes mapped to one or more sessions.
- Missing KSBs: expected profile codes that have not been mapped.
- Repeated KSBs: codes mapped multiple times.

Use the summary before final review or quality approval.

### KSB Mapping Good Practice

- Map KSBs at session level, not only at module level.
- Use the selected KSB Profile as the reference list.
- Avoid adding codes that are not part of the selected profile unless there is a clear reason.
- Do not duplicate codes unnecessarily across every session.
- Use repeated KSBs intentionally, for example when a behaviour is reinforced across multiple sessions.
- Review missing KSBs before relying on the Training Plan for quality checks.

### KSB Mapping Example

For a three-session module:

| Session | Knowledge | Skills | Behaviours | Interpretation |
|---|---|---|---|---|
| Session 1 | `K1`, `K2` | `S1` | `B1` | Introduces core knowledge and first skill. |
| Session 2 | `K3` | `S2`, `S3` | `B1` | Builds skill application and reinforces behaviour. |
| Session 3 | `K4` | `S4` | `B2` | Completes planned coverage for the module. |

If the selected KSB Profile expects `K1` to `K4`, `S1` to `S4`, and `B1` to `B2`, this module example covers the full expected set. If the profile also expects `S5`, the summary should show `S5` as missing.

## 10. Monthly Breakdown and Timeline

Timeline and Monthly Breakdown are designed to work together.

### Timeline

The Timeline is the visual planning view. It is best used to review:

- Programme and cohort layout.
- Module sequence.
- Module overlap.
- Current date marker.
- Tutor conflicts.
- Holiday clashes.
- Replacement clashes.
- Module extension caused by holidays.
- Overall start and end pattern.

The Timeline supports different zoom levels such as year, intake, month, week, and day. Use broader zoom levels for long-term planning and closer zoom levels for detailed delivery checks.

### Monthly Breakdown

Monthly Breakdown is the detailed review view. It is best used to review:

- Monthly session lists.
- Session dates.
- Tutor and coach names.
- Session totals.
- Holiday clashes.
- Replacement sessions.
- KSB mapping per session.
- Effective end date.
- Exportable monthly module details.

### How To Use Both Together

Use Timeline first to identify the shape of the plan and any visible risks. Then open Monthly Breakdown to inspect the exact sessions and dates behind those risks.

Example:

1. Timeline shows a module extension badge.
2. Open Monthly Breakdown for that module.
3. Review which session clashed with a selected holiday.
4. Confirm the replacement session date.
5. Confirm the effective end date is acceptable.

### Badges and Status Indicators

| Indicator | Meaning |
|---|---|
| `H` | Holiday Clash. |
| `R` | Replacement Clash. |
| `T` | Tutor Conflict. |
| Finished | All planned sessions for the module have ended. |
| Coverage marker | A session has tutor unavailability or coverage information. |
| Extension marker | The module has been extended because affected sessions required replacement. |

### Monthly Breakdown Review Fields

When reviewing a module in Monthly Breakdown, users should pay attention to:

| Field or item | Why it matters |
|---|---|
| Counted session number | Confirms how many valid sessions have been counted toward the module total. |
| Session date | Confirms the actual delivery date after holidays are considered. |
| Shifted from | Shows that a replacement session came from a holiday-affected original session. |
| Holiday details | Explains why a session was skipped or affected. |
| Tutor and coach | Confirms delivery responsibility. |
| Time | Helps detect operational timetable problems. |
| KSB codes | Confirms planned standards coverage. |
| Effective end date | Shows the final calculated module end date. |
| Export PDF | Produces a reviewable copy for meetings or quality checks. |

### Timeline Review Tips

- Use month view for most planning reviews.
- Use week or day view when investigating a specific clash.
- Use year or intake view when checking broad programme sequencing.
- Hover or open module details to understand extension and clash markers.
- Compare the Timeline with Monthly Breakdown before making final decisions.

### Reports, Exports, and Review Copies

Training Plan can support formal review by exporting data or producing reviewable breakdowns.

| Output | Where it comes from | What it is used for |
|---|---|---|
| Training Plan Excel export | Timeline/Training Plan export action. | Full programme/cohort/module schedule review. |
| Monthly Breakdown PDF | Monthly Breakdown modal. | Module-level monthly session review for meetings or quality checks. |
| Tutor Profile view | Tutor Profiles tab. | Tutor workload, conflicts, coverage, and coach relationship review. |
| Session Schedule view | Session Schedule tab. | Operational daily/weekly delivery review. |

### Excel Export Contents

The Training Plan Excel export is useful when users need to review or share the plan outside the system. It can include data such as:

- Programme.
- Cohort.
- Cohort start label.
- Cohort end label.
- Group.
- Coach.
- Module.
- Tutor.
- Start date.
- End date.
- Number of sessions.
- Session days.
- Session start time.
- Session end time.
- KSB Profile.
- Knowledge codes.
- Skill codes.
- Behaviour codes.
- Notes.

Exported data is a snapshot at the time of export. If the Training Plan changes after export, the file will not update automatically.

### PDF Monthly Breakdown

The Monthly Breakdown PDF is best used for module-level review. It helps users discuss:

- Which sessions happen in each month.
- Which sessions are normal sessions.
- Which sessions were shifted.
- Which sessions are replacements.
- Which holidays caused clashes.
- Which KSBs are planned.
- Which tutor and coach are linked to each session.
- What the effective end date is.

For formal sign-off, reviewers should always confirm that the PDF was generated after the latest Training Plan save.

## 11. Saving and Data Protection

Training Plan includes user-facing protections to reduce the risk of accidental data loss.

### Version Checking

When Training Plan loads, it receives a version of the saved data. When the user saves, the system checks that the version on screen still matches the latest saved version.

If another user saved changes first, the system may show a `409 Conflict` message and block the save. The user should reload, review the latest data, and then make changes again if needed.

### Empty Save Protection

If the local Training Plan is empty, the save is rejected. This prevents an accidental blank page or failed load from wiping saved Training Plan data.

### Suspicious Partial Save Protection

If the saved Training Plan is large and the incoming save contains much less data than expected, the system may reject it as a suspicious partial save. This protects against partial page loads or incomplete data being saved over the full plan.

### Transaction Safety

Saves are handled safely. If a save fails, the existing saved data should not be wiped. Users should still reload and confirm the latest saved state before making further changes.

### User Guidance

- Reload latest data before major changes.
- Save after completing a clear set of edits.
- If a conflict warning appears, do not keep editing from the older page.
- Reload, review, then reapply the intended change.

### What To Do After a Failed Save

If a save fails:

1. Read the warning message carefully.
2. Do not assume the change was saved.
3. Reload the latest Training Plan if the message mentions version conflict, latest data, or `409 Conflict`.
4. Check whether another user changed the same programme, cohort, or module.
5. Reapply only the changes that are still needed.
6. Save again and wait for confirmation.

If the save fails repeatedly, stop editing and ask an administrator or technical support user to check the latest saved data.

## 12. Common Workflows

### Create a New Module

1. Open Training Plan.
2. Select or locate the correct programme.
3. Open the relevant cohort, or create the cohort first if it does not exist.
4. Choose the correct group or create a new group.
5. Select the module from the module catalogue.
6. Enter the module start date.
7. Confirm the selected delivery day or days.
8. Confirm start and end time.
9. Select a valid Tutor Profile.
10. Add notes if required.
11. Open Session KSB Mapping if KSBs need to be mapped.
12. Save the module.
13. Review the Timeline and Monthly Breakdown to confirm the generated sessions and effective end date.

### Add a Module From Tutor Profile

1. Open Training Plan.
2. Select the Tutor Profiles tab.
3. Select the tutor who should be assigned to the new module.
4. Use the `Add module` control if it is visible.
5. Choose the required module.
6. Select the target cohort.
7. Select an existing group, or choose to create a new group.
8. If creating a new group, enter group name, coach if known, delivery weekdays, start time, and end time.
9. Enter the module start date.
10. Save the module.
11. Confirm the module appears in the tutor's profile.
12. Open Timeline and confirm the module appears under the correct programme/cohort/group.
13. Open Session Schedule and confirm the generated sessions, dates, times, tutor, coach, and clashes.
14. Open Monthly Breakdown if holidays or end dates need review.

Important: adding a module from Tutor Profile is still a Training Plan schedule change. It should be treated with the same care as adding a module from the main module editor.

### Edit an Existing Module

1. Find the module on the Timeline or in the schedule view.
2. Select Edit schedule assignment.
3. Update dates, tutor, coach, time, notes, KSB mapping, or group details as needed.
4. Review the calculated module end date.
5. Save changes.
6. Recheck clashes, coverage markers, KSB summary, and Monthly Breakdown.

### Review Holiday Clashes

1. Open Training Plan.
2. Look for Holiday Clash indicators or `H` badges.
3. Open the affected module details or Monthly Breakdown.
4. Confirm which holiday caused the clash.
5. Check whether the holiday is selected on the correct cohort.
6. Review replacement session dates.
7. Confirm the effective end date.

### Fix Tutor Conflicts

1. Locate the Tutor Conflict marker or `T` badge.
2. Open the conflict details.
3. Identify the tutor, date, time, and conflicting sessions.
4. Decide whether to change tutor, change time, edit the module schedule, or record manual coverage.
5. Save the change.
6. Recheck the Timeline and Tutor Profile to confirm the warning is resolved or documented.

### Mark Assigned Tutor Unavailable

1. Open the session in the schedule view.
2. Select Coverage.
3. Tick Assigned tutor unavailable.
4. Enter the Unavailable Reason.
5. Leave Coverage Tutor blank if coverage has not yet been arranged.
6. Save Coverage.
7. Confirm the session appears as Coverage Required for the assigned tutor.

### Select a Coverage Tutor

1. Open the session Coverage modal.
2. Tick Assigned tutor unavailable.
3. Enter the Unavailable Reason.
4. Select a Coverage Tutor.
5. Enter the Coverage Reason.
6. Add notes if useful.
7. Save Coverage.
8. Check the coverage tutor's Tutor Profile under Sessions Covered By This Tutor.

### Review KSB Coverage

1. Confirm the cohort has the correct KSB Profile selected.
2. Open each module's Session KSB Mapping.
3. Check Knowledge, Skills, and Behaviours for each session.
4. Save any changes.
5. Open the KSB coverage summary.
6. Review covered, missing, and repeated codes.
7. Update mapping until the plan is clear and review-ready.

### Review the Monthly Breakdown

1. Open Training Plan.
2. Use Monthly Module Breakdown.
3. Search or filter to the relevant programme/module.
4. Open the module.
5. Review session dates, tutor, coach, KSBs, holidays, replacement sessions, and status.
6. Export PDF if a formal review copy is needed.

### Check Final Cohort or Module End Date

1. Open the module on the Timeline.
2. Compare baseline end date and effective end date.
3. Open Monthly Breakdown for detailed session dates.
4. Check whether selected holidays caused replacement sessions.
5. Confirm whether the final effective end date is acceptable for delivery planning.

### Create a New Programme

1. Open Training Plan.
2. Use the programme management action.
3. Enter the programme name.
4. Add a subtitle or date range if useful.
5. Choose a programme colour.
6. Save the programme.
7. Add the first cohort to the programme.
8. Review the Timeline to confirm the programme appears correctly.

### Create a New Cohort

1. Open the correct programme.
2. Select Add Cohort.
3. Enter the cohort name and start label.
4. Select applicable holidays.
5. Select the correct KSB Profile if available.
6. Add one or more groups.
7. Add modules to the relevant groups.
8. Save the cohort.
9. Review generated sessions and final end dates.

### Add or Update a Holiday

1. Open Holiday Manager.
2. Add or edit the holiday period.
3. Confirm the name, type, start date, and end date.
4. Save Holiday Manager changes.
5. Edit any cohort that should use that holiday.
6. Select the holiday on the cohort.
7. Save the cohort.
8. Review Timeline and Monthly Breakdown for affected sessions.

### Add a Tutor Profile

1. Open the Tutor Profile area or create a tutor from the module assignment flow.
2. Enter the tutor's full name.
3. Add email, phone, and notes if needed.
4. Mark the profile as active.
5. Save the profile.
6. Assign the Tutor Profile to modules in Training Plan.

### Review a Plan Before a Quality Meeting

1. Filter to the relevant programme.
2. Confirm all expected cohorts are visible.
3. Check each group has modules.
4. Review Timeline for `H`, `R`, and `T` indicators.
5. Open Monthly Breakdown for affected modules.
6. Review selected holidays and replacement sessions.
7. Check Tutor Profile summaries for conflicts and coverage.
8. Review KSB coverage summary.
9. Export Monthly Breakdown PDF if required.
10. Confirm the plan has saved successfully.

### Worked Example: Monday and Wednesday Module With One Holiday

Scenario:

- Module starts on Monday 5 January 2026.
- Delivery days are Monday and Wednesday.
- Session count is 6.
- A holiday is selected on Wednesday 14 January 2026.

Expected interpretation:

1. The module should normally create two sessions per week.
2. Planned sessions would fall on Monday 5 Jan, Wednesday 7 Jan, Monday 12 Jan, Wednesday 14 Jan, Monday 19 Jan, and Wednesday 21 Jan.
3. The Wednesday 14 Jan session clashes with the selected holiday.
4. That clashed session does not count.
5. The system continues to the next matching weekday and adds a replacement.
6. The final counted session may move to Monday 26 Jan or the next valid matching day, depending on the exact schedule and any other selected holidays.
7. Monthly Breakdown should show the holiday-affected session and the replacement relationship.

This example shows why multiple weekdays can shorten the normal schedule, while holidays can extend it again.

### Daily Session Review Routine

Use this routine at the start of a delivery day:

1. Open Session Schedule.
2. Check current sessions for the day.
3. Confirm tutor, coach, and time.
4. Check for Coverage Required badges.
5. Check for Tutor Conflict warnings.
6. Open Tutor Profiles for any tutor with a warning.
7. Confirm whether coverage has already been selected.
8. Save any coverage changes.
9. Recheck the schedule after saving.

### Weekly Planning Routine

Use this routine before each delivery week:

1. Open Timeline in week or month view.
2. Review holiday and replacement indicators.
3. Open Session Schedule and review current/upcoming sessions.
4. Open Tutor Profiles and check upcoming sessions for key tutors.
5. Review Coverage Required.
6. Confirm tutors assigned to upcoming modules.
7. Check the next module for cohorts approaching the end of a module.
8. Export or share a review copy if required.

### Monthly Quality Review Routine

Use this routine for quality or management review:

1. Open Monthly Breakdown.
2. Filter to the relevant programme.
3. Review modules with holiday or replacement clashes.
4. Confirm effective end dates.
5. Review KSB coverage for the cohort.
6. Check Tutor Profile conflict warnings.
7. Review coverage records.
8. Export Monthly Breakdown PDFs for modules requiring formal discussion.
9. Record any follow-up actions outside Training Plan if your process requires it.

### End-of-Module Review Routine

When a module is finishing:

1. Confirm progress shows all planned sessions completed.
2. Review Monthly Breakdown to confirm counted sessions.
3. Check whether any sessions were shifted due to holidays.
4. Confirm replacement sessions were included.
5. Review KSB mapping for all sessions.
6. Check coverage notes for any session delivered by a coverage tutor.
7. Confirm the next module is scheduled if one is expected.
8. Update the plan if the next module is missing or incorrect.

## 13. Administrator Reference

Administrators are responsible for keeping the planning data clean and usable.

### Admin Areas Connected to Training Plan

| Admin area | What it controls | Why it matters |
|---|---|---|
| Programme management | Programme names, subtitles, colours, and cohort structure. | Drives top-level filtering and timeline grouping. |
| Cohort setup | Cohort labels, holidays, KSB Profile, groups, and modules. | Controls delivery plan structure and holiday/KSB behaviour. |
| Module catalogue | Shared module definitions, session count, colours, session names, descriptions, and catalogue KSB mapping. | Improves consistency across scheduled modules. |
| Holiday Manager | Holiday and non-teaching periods. | Provides the holiday list that cohorts can select from. |
| Tutor Profiles | Tutor identity, contact details, active status, and module availability notes. | Enables reliable tutor assignment, reporting, and coverage. |
| KSB Profiles | Expected Knowledge, Skills, and Behaviours for a programme/cohort. | Enables KSB coverage review. |

### Admin Data Quality Rules

- Avoid duplicate tutor profiles for the same person.
- Use consistent programme and cohort naming.
- Keep module catalogue session counts accurate.
- Keep holiday date ranges precise.
- Select holidays on cohorts intentionally.
- Keep KSB Profiles active and accurate.
- Use Tutor Profiles rather than free-text tutor names wherever possible.
- Review save warnings instead of bypassing them.

## 14. Quality Reviewer Notes

Quality reviewers should treat Training Plan as a planning evidence source, not the only evidence source. It shows what is planned and scheduled, including KSB mapping, but it does not by itself prove attendance, achievement, or assessment completion.

### What Reviewers Should Check

| Review area | What to check |
|---|---|
| Programme structure | Correct programme, cohort, and group naming. |
| Module sequencing | Modules appear in a logical order and do not create unnecessary overlaps. |
| Session count | Session counts match the intended module delivery model. |
| Tutor allocation | Tutors are assigned and conflicts are reviewed. |
| Holiday treatment | Relevant holidays are selected on the right cohorts only. |
| Replacement sessions | Affected sessions have clear replacement dates. |
| Coverage | Unavailable tutors and coverage tutors are recorded clearly. |
| KSB Profile | Correct profile is selected for the cohort. |
| KSB mapping | Missing and repeated KSBs are reviewed. |
| End date | Effective end date is understood and acceptable. |

### Evidence Limitations

Training Plan can show planned delivery and mapped KSB coverage. It does not automatically prove:

- Learner attendance.
- Learner achievement.
- Tutor absence from HR records.
- Assessment completion.
- Quality assurance sign-off.

Use Training Plan alongside the relevant attendance, assessment, and quality records where required.

## 15. Critical Controls, Sensitive Information, and Risk Areas

This section covers important points that users should understand before making changes that affect live delivery data.

### Access and Permission Sensitivity

Training Plan management actions are restricted. Users with view-only access can review the plan, but they should not be able to save changes. Users with management access can change schedule data, coverage records, holidays, KSB Profiles, module catalogue data, tutor profiles, and programme/cohort setup.

Management access should be treated carefully because one saved change can affect:

- Module end dates.
- Generated session dates.
- Tutor conflicts.
- Coverage Required lists.
- Tutor Profile summaries.
- Monthly Breakdown outputs.
- Excel exports and PDF review copies.
- KSB coverage review.

If a user unexpectedly has edit access, or unexpectedly cannot edit, raise this with the system administrator instead of sharing login details or asking another user to make changes without review.

### Typical Access Groups

The system distinguishes between general access and management permissions. In practice, users with administrative or operations-level access are usually the users who can manage cohorts and Training Plan data.

| Access area | What it normally allows |
|---|---|
| Admin-level access | Wider system management and administrative actions. |
| Operations-level access | Training Plan/cohort management actions. |
| Read-only access | Viewing and review without saving schedule changes. |

Exact access assignment should follow the organisation's internal access control process.

### Audit Trail Awareness

Important Training Plan-related actions are recorded for accountability. This can include actions such as creating, updating, deleting, replacing, rejecting, or saving records.

Users should assume that significant changes may be traceable, including:

- Training Plan saves.
- Save rejections.
- Programme changes.
- Holiday changes.
- Module catalogue changes.
- Tutor Profile changes.
- KSB Profile changes.
- Coverage updates.

The audit trail is there to protect the plan and support investigation if something changes unexpectedly. It should not be treated as a replacement for clear communication between planning users.

### Sensitive Data Guidance

Training Plan should only contain information needed for delivery planning. Do not enter unnecessary sensitive personal information.

| Area | Safe examples | Avoid entering |
|---|---|---|
| Tutor unavailable reason | `Annual leave`, `Sickness`, `Appointment`, `Schedule conflict`. | Detailed medical information, private HR notes, confidential personal circumstances. |
| Coverage notes | `Ray covering due to same-module experience`. | Sensitive HR explanations or informal comments about staff performance. |
| Module notes | Planning notes, delivery context, handover information. | Learner personal data, disciplinary notes, confidential assessment decisions. |
| Tutor Profile notes | Professional planning notes. | Medical records, private employment details, sensitive personal comments. |

If sensitive information is required for HR, safeguarding, assessment, or quality processes, record it in the correct approved system, not in Training Plan.

### High-Risk Changes

Some changes have a wider impact than they first appear.

| Change | Why it is high-risk | What to verify after saving |
|---|---|---|
| Changing module start date | Regenerates session dates and may change end date. | Timeline, Monthly Breakdown, Session Schedule, tutor conflicts. |
| Changing delivery weekdays | Changes recurrence and may shorten or extend the module. | Session count, final date, tutor availability, holidays. |
| Changing session time | Can create or remove tutor conflicts. | Tutor Conflict indicators and Tutor Profile warnings. |
| Changing session count | Changes final counted session and module end date. | Progress, Monthly Breakdown, KSB mapping row count. |
| Selecting/removing holidays on a cohort | Can create/remove holiday clashes and replacement sessions. | Effective end date, replacement sessions, Monthly Breakdown. |
| Changing assigned tutor | Changes Tutor Profile summaries and conflict checks. | Tutor Profile, Session Schedule, coverage records. |
| Deleting a tutor profile | Can unlink that tutor from Training Plan records and coverage references. | Affected modules, Tutor Profiles, coverage records. |
| Deleting or changing module catalogue data | Can affect displayed module/session names and catalogue details. | Session names, module names, KSB mapping, schedule view. |
| Deleting a cohort | Removes the cohort schedule from the plan. | Confirm export/review copy exists if needed before removal. |
| Deleting a programme | Should only happen when it no longer has cohorts. | Confirm no cohorts still belong to it. |

### Deleting Tutor Profiles

Deleting a Tutor Profile is sensitive because Training Plan modules and coverage records may reference that tutor. When a tutor profile is deleted, linked Training Plan records may be unlinked from that profile.

Before deleting a tutor profile:

1. Check assigned modules.
2. Check coverage records.
3. Check whether the profile is a duplicate.
4. Decide whether deactivating or correcting the profile is safer than deleting.
5. Export or record affected assignments if your process requires it.
6. Recheck Training Plan after deletion.

If a tutor has left the organisation but historical records still matter, consider whether the profile should be inactive rather than removed.

### KSB Profile Deletion or Deactivation

KSB Profiles may be deleted or deactivated depending on usage and system rules. This is important because a cohort's KSB coverage summary depends on the selected KSB Profile.

Before changing a KSB Profile:

- Check which programmes or cohorts use it.
- Confirm whether the profile is being replaced by a newer version.
- Export or document the current coverage if needed.
- Recheck KSB summaries after the change.

### Module Catalogue Change Risk

The module catalogue provides shared module information, including session names, descriptions, colour, session count, and KSB mapping. Changing catalogue data can affect how scheduled modules are displayed and reviewed.

Before changing catalogue data:

- Confirm whether the module is already used in live cohorts.
- Check whether session names are used in Session Schedule or Monthly Breakdown.
- Confirm whether KSB mapping should be changed in the catalogue, scheduled module, or both.
- Recheck affected scheduled modules after saving.

### Version Conflict and Reload Risk

A `409 Conflict` is not just a technical message. It means the system is protecting saved Training Plan data from being overwritten by an older screen or suspicious save.

When a `409 Conflict` appears:

1. Stop editing from the current page.
2. Read the message.
3. Reload the latest Training Plan.
4. Check whether another user has made changes.
5. Reapply only the changes that are still correct.
6. Save again.

Do not try to work around conflict warnings by repeatedly saving without reviewing the latest data.

### Suspicious Partial Save Risk

The system may reject saves that look much smaller than the current saved Training Plan. This is a protection against accidentally replacing a full Training Plan with partial data.

Users may see this if:

- The page did not finish loading.
- Network issues interrupted data loading.
- A browser tab is stale.
- The user is saving from an outdated view.

The safest response is to reload, check that all expected programmes/cohorts/modules are visible, then save again only after review.

### Browser Tabs and Multi-User Editing

Training Plan can be affected by multiple users or multiple browser tabs.

Best practice:

- Do not edit the same programme in two tabs.
- Do not keep an old Training Plan tab open for long periods and then save from it.
- Coordinate with other administrators before large schedule changes.
- Reload before changing a cohort that another person may also be editing.
- Save one clear set of changes at a time.

### Source of Truth Rules

| Information | Source of truth inside Communication Centre |
|---|---|
| Programme/cohort/module schedule | Training Plan. |
| Session dates and effective end date | Generated from Training Plan module settings and selected cohort holidays. |
| Tutor assignment | Training Plan module tutor profile. |
| Tutor workload summary | Tutor Profile view, derived from Training Plan. |
| Coverage Required | Session Coverage data entered in Training Plan. |
| Sessions Covered By This Tutor | Session Coverage data entered in Training Plan. |
| Holiday periods | Holiday Manager. |
| Whether a holiday affects a cohort | Cohort holiday selection in Training Plan. |
| Expected KSB list | Selected KSB Profile. |
| Planned KSB coverage | Session KSB Mapping. |
| Attendance or achievement | Not Training Plan; use the approved attendance/assessment process. |

### Known Non-Automatic Behaviours

The following are not automatic and must be handled by users:

- Tutor unavailability is not automatically detected from HR, leave, or absence systems.
- Holiday Manager does not automatically apply holidays to every cohort.
- Tutor conflicts do not automatically create coverage.
- KSB Profiles do not automatically map all session KSBs.
- Excel exports do not update after later changes.
- Monthly Breakdown PDFs do not update after later changes.
- Tutor Profile is not a separate source of schedule data. If a module is added from Tutor Profile, it is saved into the Training Plan schedule and should then appear in Timeline and Session Schedule.
- Progress is not attendance or achievement.

### Escalation Guidance

Escalate to an administrator, operations lead, or technical support if:

- A save conflict keeps appearing after reload.
- A large part of the Training Plan appears missing.
- A user has the wrong access level.
- A tutor profile deletion affected more records than expected.
- A module end date appears wrong after checking holidays and weekdays.
- KSB Profiles or KSB mappings do not match the expected standard.
- Coverage records appear under the wrong tutor.
- An export was used for a formal review but the live plan has since changed.

When escalating, include:

- Programme name.
- Cohort name.
- Group name.
- Module name.
- Tutor name.
- Session date.
- Screenshot or export if available.
- What changed and when.
- Whether a `409 Conflict` or save warning appeared.

### Pre-Change Risk Checklist

Use this before making a major Training Plan change:

- I am editing the latest loaded Training Plan.
- I know which programme/cohort/module will be affected.
- I understand whether holidays are selected on this cohort.
- I checked tutor conflicts before changing tutor or time.
- I understand whether KSB mapping will be affected.
- I know whether the change affects exports or review documents.
- I have informed other users if this is a large schedule change.
- I am ready to review Timeline, Session Schedule, Tutor Profiles, and Monthly Breakdown after saving.

### Post-Change Verification Checklist

After saving a significant change:

- Confirm the save completed successfully.
- Reload if the system asks you to.
- Check Timeline for clashes and extension markers.
- Check Session Schedule for current session, progress, tutor, coach, and next module.
- Check Tutor Profile for workload, conflicts, and coverage.
- Check Monthly Breakdown for replacement sessions and effective end date.
- Check KSB coverage if KSB mapping or KSB Profile changed.
- Regenerate exports or PDFs if they are needed for review.

## 16. User Guide for Working With Developers and Support

This section explains what a user should understand before contacting a developer, system administrator, or technical support person about Training Plan.

The developer or support person can investigate the system, but they need clear information from the user. A message such as "Training Plan is wrong" is usually not enough. A useful report should explain what the user expected, what actually happened, where it happened, and what changed recently.

### When To Contact a Developer or Support

Contact a developer, system administrator, or support person when:

- A save fails repeatedly after reload.
- A `409 Conflict` keeps appearing even after reviewing the latest data.
- A programme, cohort, module, or tutor profile appears to be missing.
- The calculated end date still looks wrong after checking session count, weekdays, and selected holidays.
- Tutor conflicts appear incorrect after checking date, time, and assigned tutor.
- Coverage Required or Sessions Covered By This Tutor does not match the session Coverage modal.
- KSB codes are not saving, not showing, or not matching the selected KSB Profile.
- A deleted Tutor Profile unlinked more records than expected.
- The Session Schedule and Monthly Breakdown appear to disagree.
- Excel export or Monthly Breakdown PDF appears to show outdated or incorrect data.
- The user believes they have the wrong access level.

### What the User Should Check First

Before escalating, users should do these quick checks:

1. Reload the page.
2. Confirm the correct programme is selected.
3. Confirm the correct cohort and group are being reviewed.
4. Check whether the issue also appears in another tab, such as Timeline, Session Schedule, or Tutor Profiles.
5. Check whether a holiday is selected on the cohort.
6. Check whether the tutor is linked to a real Tutor Profile.
7. Check whether a recent save completed successfully.
8. Check whether another user may have changed the plan.

If the issue remains after these checks, escalate it with details.

### Information To Send to the Developer or Support

Include as much of the following as possible:

| Information | Example |
|---|---|
| Programme | `PCP L4` |
| Cohort | `Cohort 1 - Jan 2026` |
| Group | `G1 - Monday/Wednesday` |
| Module | `Risk Management` |
| Session number/date | `Session 4 - 2026-01-14` |
| Tutor | `Ray` |
| Coach | `Juliane` |
| Tab/view | `Timeline`, `Session Schedule`, `Tutor Profiles`, or `Monthly Breakdown` |
| Action taken | `Changed module start date`, `selected holiday`, `saved coverage`, `exported PDF` |
| Expected result | `The module should end on 2026-01-21` |
| Actual result | `The module ends on 2026-01-26` |
| Warning message | `409 Conflict`, `Coverage Required`, `Tutor Conflict`, or screenshot text |
| Time of issue | Approximate date/time the user saw the issue |
| Recent changes | Any holiday, tutor, module, cohort, or KSB changes made recently |

### Useful Bug Report Template

Users can copy this template when reporting an issue:

```text
Training Plan issue report

Programme:
Cohort:
Group:
Module:
Session number/date:
Tutor:
Coach:
View/tab affected:

What I expected:
What actually happened:
Steps I took:
Warning or error message:
Did I reload before trying again? Yes/No
Did another user edit this plan recently? Yes/No/Not sure
Screenshot/export attached? Yes/No

Business impact:
Urgency:
```

### How To Describe the Issue Clearly

Good issue descriptions compare expected behaviour with actual behaviour.

| Less useful | More useful |
|---|---|
| `The dates are wrong.` | `Risk Management in PCP L4 Cohort 1 should have 6 Monday sessions, but Monthly Breakdown shows the final session one week later after Christmas Break was selected.` |
| `Tutor Profile is broken.` | `Ray's Tutor Profile does not show Session 4 under Coverage Required, but Session Schedule shows Ray marked unavailable with no Coverage Tutor selected.` |
| `KSBs disappeared.` | `Cohort 1 has KSB Profile PCP Standard selected. Session 2 had K1 and S2 mapped yesterday, but today the KSB Summary shows them missing.` |
| `I cannot save.` | `After editing G1 Module Start Date, save shows 409 Conflict even after one reload.` |

### What Screenshots Should Show

If sending screenshots, include:

- The programme/cohort/module name where possible.
- The visible warning or badge.
- The date/time/session involved.
- The tab name or modal title.
- The save warning if one appears.

Do not include unnecessary personal, HR, medical, safeguarding, or confidential learner information in screenshots.

### What Developers Can Investigate

A developer or technical support user can usually investigate:

- Whether the Training Plan save was accepted or rejected.
- Whether a version conflict occurred.
- Whether the frontend loaded the latest data.
- Whether the session dates are being generated from the expected start date, days, sessions, and holidays.
- Whether a Tutor Profile is linked correctly.
- Whether coverage data exists for the session.
- Whether KSB mapping data exists and is in the expected format.
- Whether an export or PDF was generated before or after a later change.
- Whether delete/unlink behaviour affected related Training Plan records.

### What Developers Cannot Decide Alone

Developers can investigate system behaviour, but they should not decide business rules without the relevant owner.

Developers should not decide alone:

- Which tutor should deliver a session.
- Whether a holiday should apply to a cohort.
- Whether a module should be extended.
- Whether a KSB Profile is correct for a programme.
- Whether coverage is operationally acceptable.
- Whether historical delivery data should be changed.
- Whether sensitive notes should be retained.

Those decisions should come from operations, quality, administration, or management owners.

### User Responsibilities Before Asking for a Code Change

Before requesting a code change, users should confirm:

- The issue is not caused by wrong cohort holiday selection.
- The issue is not caused by wrong session count.
- The issue is not caused by wrong selected weekdays.
- The issue is not caused by a missing Tutor Profile.
- The issue is not caused by an old export or stale browser tab.
- The issue can be reproduced or clearly described.
- The expected business rule is agreed by the relevant owner.

### Severity Guide

| Severity | Meaning | Example | Recommended action |
|---|---|---|---|
| Critical | Delivery data may be lost, overwritten, or widely incorrect. | Large parts of the Training Plan disappear or repeated save conflicts block all planning. | Stop editing and escalate immediately. |
| High | A live delivery decision may be wrong. | Tutor conflict, missing coverage, wrong end date for an active cohort. | Escalate promptly with details. |
| Medium | Review or planning is affected but delivery can continue temporarily. | KSB summary mismatch, export issue, missing session name. | Report with examples and screenshots. |
| Low | Cosmetic or wording issue. | Label, colour, or minor display inconsistency. | Report when convenient. |

### After a Developer Fix or Support Action

After support says the issue is fixed:

1. Reload Training Plan.
2. Recheck the exact programme/cohort/module/session.
3. Check Timeline.
4. Check Session Schedule.
5. Check Tutor Profile if tutor data was involved.
6. Check Monthly Breakdown if dates or holidays were involved.
7. Regenerate exports or PDFs if they were affected.
8. Confirm the result with the operations or quality owner if the issue affected official review.

## 17. Frequently Asked Questions

### Is Training Plan the official source for session schedules?

Training Plan is the Communication Centre source for planned programme, cohort, module, and session scheduling. Users should still follow local operational processes for attendance, assessment, HR absence, and quality sign-off.

### Does adding a holiday affect every cohort?

No. A holiday only affects a cohort when it is selected on that cohort. This prevents one holiday record from changing every delivery plan automatically.

### Why did the module end date move?

The end date may move because of selected holidays, replacement sessions, multiple delivery days, or replacement clashes. Check Monthly Breakdown for the exact session-by-session explanation.

### Why is a tutor conflict showing?

A Tutor Conflict appears when the same tutor appears to have overlapping sessions. Check the date, start time, end time, module, programme, and group before changing the plan.

### Does a tutor conflict automatically create coverage?

No. Tutor conflicts are system-detected warnings. Coverage is a manual record entered from the session Coverage modal.

### Why is Coverage Required not showing?

Coverage Required only appears when the assigned tutor is marked unavailable and no Coverage Tutor is selected. If a Coverage Tutor has already been selected, the session should be shown as covered instead.

### Why does Tutor Profile show a session under another tutor?

One tutor may be the assigned tutor and another tutor may be the coverage tutor. Check whether the session appears under Coverage Required for one tutor or Sessions Covered By This Tutor for the other.

### Can I add a module from Tutor Profile?

Yes, if you have the correct management access and the selected tutor is linked to a real Tutor Profile. The `Add module` control lets you choose a module, cohort, group, and start date. After saving, the module is added to the Training Plan schedule and should appear in Timeline, Session Schedule, Monthly Breakdown, and the tutor's profile.

### Why did a module I added from Tutor Profile not appear on the Timeline?

Check that the save completed successfully, the correct cohort/group was selected, the Timeline filters are not hiding the item, and the module still appears after reload. Also check whether a `409 Conflict` or save warning appeared.

### Why are KSBs missing from the summary?

The cohort may not have a KSB Profile selected, or the relevant session KSB mapping may be incomplete. KSB codes also need to match the expected format such as `K1`, `S2`, or `B3`.

### Can I edit completed sessions?

Completed sessions are generally treated as past schedule records. Coverage editing is normally focused on upcoming or current sessions. If a completed session is wrong, follow your internal correction process carefully.

### Why does the Excel export not match the screen after changes?

The export is a snapshot. If someone changes Training Plan after the export, the exported file will not update. Export again after the latest save.

## 18. Do and Don't Guide

| Do | Don't |
|---|---|
| Reload before major changes. | Continue editing after a 409 Conflict warning. |
| Use Tutor Profiles for tutor assignment. | Rely on old free-text tutor names for new planning. |
| Select holidays only on cohorts they affect. | Assume Holiday Manager applies holidays to every cohort. |
| Review Monthly Breakdown after holiday changes. | Trust the old end date without checking replacement sessions. |
| Add clear coverage reasons. | Save vague coverage notes that reviewers cannot understand. |
| Keep module catalogue session names updated. | Leave all sessions as generic `Session 1`, `Session 2` if formal review needs real names. |
| Review KSB missing/repeated codes. | Assume a module is quality-ready just because it has a KSB Profile selected. |
| Use exports as review snapshots. | Treat old exported files as live data. |
| Check Tutor Profile for workload and coverage, and use its Add module shortcut only when authorised. | Treat a Tutor Profile module add as separate from Training Plan or skip checking Timeline and Session Schedule after saving. |
| Treat `409 Conflict` as a protection warning. | Ignore conflict messages and keep saving from an old tab. |
| Keep sensitive personal information out of notes. | Store medical, HR, safeguarding, or confidential learner details in Training Plan notes. |
| Verify after deleting profiles or catalogue data. | Assume deletion only affects the screen currently open. |
| Send developers clear issue details. | Report only "it is broken" without programme, cohort, module, and expected result. |

## 19. Troubleshooting

| Issue | Likely cause | What to check |
|---|---|---|
| Holiday is not affecting the cohort | The holiday exists in Holiday Manager but is not selected on that cohort. | Edit the cohort and confirm the holiday is selected. |
| Unexpected end date | Multiple weekdays, selected holidays, replacement sessions, or replacement clashes changed the effective end date. | Check session count, selected days, selected holidays, and Monthly Breakdown. |
| Tutor conflict appears | The same tutor has overlapping sessions on the same date/time. | Review the conflict marker, compare sessions, then change tutor/time or record coverage. |
| Coverage Required is missing | Assigned tutor unavailable may not be checked, or the session may already have a Coverage Tutor selected. | Open the session Coverage modal and check the fields. |
| Sessions Covered By This Tutor is missing | The tutor may not be selected as the Coverage Tutor for another session. | Open the other session's Coverage modal and confirm the Coverage Tutor. |
| KSBs are not showing | No KSB Profile is selected, codes are not mapped, or codes do not match the expected format/profile. | Select a cohort KSB Profile and check session KSB mapping. |
| 409 Conflict while saving | Another user saved first, or the current page is using an older Training Plan version. | Reload latest data, review changes, and save again. |
| Monthly Breakdown does not look correct | The module schedule, holidays, KSB Profile, or session count may not be set as expected. | Review module start date, weekdays, session count, selected cohort holidays, and KSB mapping. |
| Session Schedule row looks wrong | The module dates, selected days, tutor profile, or catalogue session names may be incomplete. | Edit the scheduled module and check start date, end date, days, tutor, session count, and module catalogue. |
| Module added from Tutor Profile does not show on Timeline | The save may not have completed, filters may hide the programme/cohort/group, or the wrong cohort/group may have been selected. | Reload latest data, check Timeline filters, check Session Schedule, and confirm the module was added to the intended cohort/group. |
| Add module control is missing in Tutor Profile | The user may not have management access, the tutor may be a legacy/free-text tutor, or no modules are available. | Check permissions, confirm the tutor is a real Tutor Profile, and check the module catalogue/module list. |
| Current Session is not what was expected | The system selects the next not-yet-ended session based on date and end time. | Check session dates, end time, current date, and whether previous sessions have already ended. |
| Next Module is blank | There may be no saved module after the current one in that cohort sequence. | Review the cohort module order and add the next module if needed. |
| Tutor Profile does not show a tutor | The tutor may not have an active profile or may only exist as an old free-text name. | Create or select a Tutor Profile and assign it to the relevant module. |
| Tutor Profile module count looks wrong | The tutor may be assigned to multiple sessions, coverage sessions, or duplicate/legacy profiles may exist. | Check assigned modules, coverage sessions, and duplicate tutor profiles. |
| Suggested coverage tutor is unavailable | The suggestion may have a detected schedule conflict. | Choose another tutor or resolve the conflicting assignment first. |
| A large part of the plan disappeared after reload | The plan may have been changed, deleted, filtered, or affected by a failed/stale workflow. | Stop editing, check filters, reload, and escalate with programme/cohort/module details. |
| Tutor was deleted and modules lost tutor links | Deleting a Tutor Profile can unlink related Training Plan records. | Review affected modules and reassign the correct Tutor Profile if needed. |
| Sensitive information was entered in notes | Notes may contain information that belongs in another approved system. | Remove unnecessary sensitive detail and follow internal data handling policy. |
| Export was used but live data changed | Exports are snapshots and do not update automatically. | Regenerate the export after the latest save. |
| Developer cannot reproduce the issue | The report may not include enough detail, or the issue depends on a specific cohort/module/session. | Send programme, cohort, group, module, session date, expected result, actual result, and screenshot. |

## 20. Glossary

| Term | Definition |
|---|---|
| Programme | The top-level course or qualification area in Training Plan. |
| Cohort | A learner intake or class population within a programme. |
| Group | A delivery group within a cohort, usually with its own coach, weekly days, and session times. |
| Module | A scheduled block of learning containing a defined number of sessions. |
| Session | A single planned delivery occurrence generated from a module schedule. |
| Session Schedule | The table view that shows modules, current session, progress, weekday delivery, tutor, coach, and next module information. |
| Assigned Tutor | The primary tutor assigned to deliver a module/session. |
| Coverage Tutor | A different tutor selected to cover a session when the assigned tutor is unavailable. |
| Suggested Coverage Tutor | A tutor suggested by the system based on Training Plan experience and apparent availability. |
| Coach | The person linked to the group or session for coaching/support responsibility. |
| Next Module | The next saved module after the current module in the same cohort/module sequence. |
| Current Session | The session currently most relevant based on date, end time, and completion progress. |
| Upcoming Session Breakdown | Tutor Profile section listing future sessions for the selected tutor. |
| Assigned tutor unavailable | A manual session-level checkbox showing the assigned tutor cannot deliver that session. |
| Coverage Required | A status shown when the assigned tutor is unavailable but no coverage tutor has been selected. |
| Sessions Covered By This Tutor | Tutor Profile section showing sessions where the tutor is covering for another tutor. |
| In Progress Modules | Tutor Profile section showing modules currently within their delivery window. |
| Assigned Modules | Tutor Profile section showing future modules assigned to the tutor. |
| Completed Modules | Tutor Profile section showing modules where planned sessions have ended. |
| Add module from Tutor Profile | Authorised shortcut in Tutor Profile that adds a scheduled module instance to a selected cohort/group and assigns it to the selected tutor. The saved result is part of Training Plan. |
| Holiday Clash | A planned session date that falls during a selected cohort holiday or non-teaching period. |
| Tutor Conflict | A warning that the same tutor is scheduled for overlapping sessions. |
| Replacement Clash | A replacement session that also falls during a selected holiday or non-teaching period. |
| Replacement Session | A later valid session added because an original planned session clashed with a selected holiday. |
| Extension | Extra time added to a module schedule because replacement sessions are needed. |
| KSB | Knowledge, Skills, and Behaviours. |
| KSB Profile | The expected set of KSB codes selected at cohort level. |
| Monthly Breakdown | A detailed month-by-month view of module sessions, holidays, tutors, coaches, KSBs, and replacement status. |
| Timeline | The visual Gantt-style planning view of programmes, cohorts, groups, and modules over time. |
| Excel Export | A spreadsheet snapshot of the Training Plan at the time of export. |
| Monthly Breakdown PDF | A printable/exportable module-level breakdown of monthly sessions, holidays, KSBs, tutor, coach, and end date details. |
| Read-only access | Access that allows users to view Training Plan without saving changes. |
| Management access | Access that allows authorised users to create, edit, and save Training Plan data. |
| Audit trail | A record of important system actions used for accountability and investigation. |
| High-risk change | A change that can affect multiple sessions, dates, tutors, coverage records, KSBs, or review outputs. |
| Source of truth | The place where a specific piece of data should be maintained and trusted. |
| Sensitive data | Personal, HR, medical, safeguarding, or confidential information that should not be stored unnecessarily in Training Plan notes. |
| Stale tab | An old browser tab showing Training Plan data that may no longer be the latest saved version. |
| Developer/support issue report | A clear description of a system problem including location, expected result, actual result, steps, warning messages, and impact. |
| Reproduce | To repeat the same steps and see the same issue again. |
| Severity | The operational urgency and impact level of an issue. |
| 409 Conflict | A save warning meaning the data on screen is not the latest saved version or the save was blocked for data protection. |

## 21. Final Checklist

Use this checklist before approving, publishing, or relying on a Training Plan:

- Programmes are correct.
- Cohorts are correct.
- Groups are correct.
- Modules are complete.
- Session count is correct.
- Dates and times are correct.
- Tutors are assigned.
- Holidays are selected correctly on each relevant cohort.
- Holiday clashes are reviewed.
- Tutor conflicts are reviewed.
- Replacement clashes are reviewed.
- Coverage Required is reviewed.
- Coverage Tutor selections are reviewed.
- Session Schedule has been reviewed.
- Current Session and Progress values make sense.
- Next Module information is understood.
- Tutor Profile summaries have been checked.
- Upcoming Session Breakdown has been reviewed for key tutors.
- Coaches Working With This Tutor has been checked where relevant.
- KSB Profile is selected.
- KSBs are mapped at session level.
- KSB coverage summary is reviewed.
- Monthly Breakdown is reviewed.
- Required exports or PDFs have been regenerated after the latest save.
- Timeline is reviewed.
- End date is understood, including baseline and effective end dates.
- High-risk changes have been verified after save.
- Sensitive notes have been checked and kept appropriate.
- No one is relying on an old export or stale browser tab.
- Any access issue or unresolved save warning has been escalated.
- Any developer/support issue has been reported with programme, cohort, module, expected result, actual result, and impact.
- Save completed successfully.
