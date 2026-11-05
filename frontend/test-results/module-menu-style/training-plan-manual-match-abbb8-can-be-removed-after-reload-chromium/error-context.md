# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-manual-matching.spec.ts >> manual matching persists, reserves the LMS module, compares dates and can be removed after reload
- Location: tests\ui\training-plan-manual-matching.spec.ts:73:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('option', { name: 'LMS Marketing Workshop', exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('option', { name: 'LMS Marketing Workshop', exact: true })

```

```yaml
- navigation:
  - link "KBC Crest Kent Business College Communication Centre":
    - /url: /
    - img "KBC Crest"
    - paragraph: Kent Business College
    - paragraph: Communication Centre
  - link "Home":
    - /url: /
  - link "News & Announcements":
    - /url: /news
  - link "Internal Dashboards":
    - /url: /dashboard
  - link "Risk Register":
    - /url: /risk-register
  - link "Departments":
    - /url: /departments
  - link "Policies":
    - /url: /documents
  - link "Events":
    - /url: /events
  - link "Training Plan":
    - /url: /training-plan
  - link "LMS":
    - /url: https://kentbusinesscollege.org/
  - link "APTEM":
    - /url: https://kentbusinesscollege.aptem.co.uk/pwa/auth/login?returnUrl=%2Fcaseload-dashboard
  - link "User Activity":
    - /url: /user-activity
  - text: Matcher
  - button " Logout"
- link "Home":
  - /url: /
- text: 
- link "Events":
  - /url: /events
- text:  Training Plan
- paragraph: Learning & delivery
- heading "Apprenticeships Training Plan" [level=1]
- paragraph: Programme Structure 2025 – 2027
- strong: "1"
- text: Programmes
- strong: "1"
- text: Cohorts
- strong: "3"
- text: Groups
- strong: "2"
- text: Modules
- strong: "9"
- text: Sessions
- strong: "0"
- text: Holidays
- main:
  - paragraph: Daily overview
  - heading "Today's Sessions" [level=2]
  - text: 0 scheduled
  - paragraph: No sessions scheduled for today.
  - button "Training Plan" [pressed]
  - button "Session Schedule"
  - button "Tutor Profiles"
  - button "Coach Profiles"
  - button " Holidays"
  - button " Add Module"
  - button " View Added Modules"
  - button " Add Programme"
  - button " KSB Profiles"
  - text: Timeline workspace Choose your plan source
  - tablist "Training Plan data source":
    - tab "Current Training Plan" [selected]
    - tab "LMS Training Plan"
  - tabpanel "Current Training Plan":
    - heading "Programme timeline" [level=3]
    - paragraph: Explore delivery dates across programmes and cohorts.
    - text: "Drag to explore Zoom:"
    - group "Timeline zoom":
      - button "Year"
      - button "Intake"
      - button "Month" [pressed]
      - button "Week"
      - button "Day"
    - button "Zoom out"
    - button "Zoom in"
    - button "Modules ending within 14 days"
    - button "Classes 3"
    - button "Export"
    - text: Now Workshop
    - button " Monthly Module Breakdown Click any module to view monthly sessions, holidays, tutors, and coaches. 3/3 modules"
    - text: 2025 2026 Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec
    - paragraph: ME L4
    - button ""
    - text: 
    - paragraph: 1 cohort
    - button ""
    - button ""
    - button ""
    - button ""
    - button "Go to today's line"
- contentinfo:
  - img "KBC Crest"
  - paragraph: Kent Business College
  - paragraph: Communication Centre
  - text: Internal Hub
  - paragraph: Kent Business College internal communication hub. Replacing email dependency with clarity, compliance and collaboration.
  - text:  Email Us  Call Support  Open Teams
  - heading "Platform" [level=4]
  - list:
    - listitem:
      - link "Home":
        - /url: /
    - listitem:
      - link "News & Announcements":
        - /url: /news
    - listitem:
      - link "Internal Dashboard":
        - /url: /dashboard
    - listitem:
      - link "Risk Register":
        - /url: /risk-register
    - listitem:
      - link "Departments":
        - /url: /departments
  - heading "Resources" [level=4]
  - list:
    - listitem:
      - link "Policies & Guides":
        - /url: /documents
    - listitem:
      - link "Training Plan":
        - /url: /training-plan
    - listitem:
      - link "Events":
        - /url: /events
    - listitem:
      - link "Project Hub":
        - /url: /dashboard
    - listitem:
      - link "IT Help":
        - /url: /departments/it
  - heading "Support" [level=4]
  - list:
    - listitem:
      - link "Feedback":
        - /url: /feedback
    - listitem:
      - link "Accessibility":
        - /url: /
    - listitem:
      - link "Privacy Notice":
        - /url: /
    - listitem:
      - link "Contact IT":
        - /url: /departments/it
    - listitem:
      - link "Help Centre":
        - /url: /
  - paragraph: © 2026 Kent Business College. Internal use only. All rights reserved.
  - text: Privacy Notice Accessibility Cookie Policy
- heading "View Added Modules" [level=2]
- paragraph: 1 module in the catalogue
- button ""
- paragraph: Marketing
- paragraph: 3 sessions - 0/3 named
- text: "3"
- button " Edit"
- button ""
- text: 1. Session 1 not named 2. Session 2 not named 3. Session 3 not named 1 module total
- button "Close"
- button " Add Module"
- heading "Edit Module" [level=3]
- paragraph: Changes apply to the module catalogue
- button ""
- group:
  - text: Compare with LMS modules
  - paragraph: Compare this saved Training Plan assignment with an LMS module. A unique match with the same name and start date is selected automatically. Choose a different LMS module to compare or save a manual match.
  - text: Current Training Plan module
  - combobox "Current module to match":
    - option "Choose a scheduled module"
    - option "Marketing" [selected]
    - option "Marketing"
  - text: LMS module
  - button "LMS module to match" [expanded]: LMS Marketing Workshop
  - button "Toggle options": 
  - status: Saved manual match
  - region "Module comparison details":
    - table "Selected module comparison":
      - rowgroup:
        - row "Field Current Training Plan LMS":
          - columnheader "Field"
          - columnheader "Current Training Plan"
          - columnheader "LMS"
      - rowgroup:
        - row "Programme ME L4 ME L4":
          - rowheader "Programme"
          - cell "ME L4"
          - cell "ME L4"
        - row "Cohort January cohort Not provided":
          - rowheader "Cohort"
          - cell "January cohort"
          - cell "Not provided"
        - row "Group Group 1 Not provided":
          - rowheader "Group"
          - cell "Group 1"
          - cell "Not provided"
        - row "Module Marketing LMS Marketing Workshop":
          - rowheader "Module"
          - cell "Marketing"
          - cell "LMS Marketing Workshop"
        - row "Start date 2026-01-05 2026-02-02":
          - rowheader "Start date"
          - cell "2026-01-05"
          - cell "2026-02-02"
        - row "End date 2026-01-19 2026-02-16":
          - rowheader "End date"
          - cell "2026-01-19"
          - cell "2026-02-16"
        - row "Tutor Plan Tutor LMS Tutor":
          - rowheader "Tutor"
          - cell "Plan Tutor"
          - cell "LMS Tutor"
  - paragraph: Dates and tutor differ
  - button "Save manual match"
  - button "Remove manual match"
- paragraph: Marketing
- paragraph: 3 sessions
- text: 3 Module Name
- textbox: Marketing
- text: Number of Sessions
- button ""
- spinbutton: "3"
- button ""
- text: Colour
- textbox: "#20869b"
- text: "#20869B Notes (optional)"
- textbox "Any notes about this module..."
- button " Session KSB Mapping Optional Map the KSBs covered by each session. Open "
- button "Cancel"
- button " Save"
- text: LMS modules 1 options 
- combobox "Search LMS match modules" [expanded]
- listbox "LMS modules":
  - option "LMS Marketing Workshop " [selected]
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | 
  3   | test.use({ channel: 'chrome' });
  4   | 
  5   | async function setup(page: Page, automatic = false) {
  6   |   const user = { id: 1, username: 'matcher', displayName: 'Matcher', groups: ['Admin Access'], access: { adminAccess: true, operationsAccess: true, canManageCohorts: true } };
  7   |   await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  8   |   let version = 'v1';
  9   |   let rejectSave = false;
  10  |   const writes: string[] = [];
  11  |   const items = [101, 102, 103].map((id, index) => ({
  12  |     id, programmeId: 'me-lvl4', cohortId: 'c1', cohortName: 'January cohort', program: 'ME L4', startingDateLabel: '2026-01-01',
  13  |     moduleName: index === 2 ? 'Other workshop' : 'Marketing', groupName: `Group ${index + 1}`, coachName: '', tutorName: 'Plan Tutor', tutorProfileId: '',
  14  |     startDate: automatic && index === 1 ? '2026-01-12' : '2026-01-05', endDate: '2026-01-19', sessionsNumber: '3', sessionWeekDay: 'monday', sessionStartTime: '09:00', sessionEndTime: '10:00',
  15  |     sessionKsbMappings: [], sessionCoverage: [], ksbProfileId: '', programmeDisplayOrder: 0, cohortDisplayOrder: 0,
  16  |     notes: `__program_id:me-lvl4\n__cohort_id:c1\n__group_id:g${index + 1}\n__block_id:b${id}\n__module_catalogue_id:${index === 2 ? 99 : 42}\n__module_color:#20869B\nOriginal notes`,
  17  |   }));
  18  |   const catalog = [{ id: 42, name: 'Marketing', colour: '#20869B', sessions: '3', notes: '', sessionNames: [], sessionDescriptions: [], sessionKsbMappings: [] }];
  19  |   const programmes = [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#115E59' }];
  20  |   await page.route('**/api/**', async route => {
  21  |     const path = new URL(route.request().url()).pathname;
  22  |     const method = route.request().method();
  23  |     const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  24  |     if (method !== 'GET' && path.startsWith('/api/training-plan')) writes.push(path);
  25  |     if (path === '/api/training-plan/modules/101/' && method === 'PATCH') {
  26  |       if (rejectSave) return json({ detail: 'The match could not be saved.' }, 400);
  27  |       const payload = route.request().postDataJSON();
  28  |       expect(payload.version).toBe(version);
  29  |       expect(Object.keys(payload).sort()).toEqual(['notes', 'version']);
  30  |       items[0].notes = payload.notes;
  31  |       version = 'v2';
  32  |       return json({ item: items[0], items, version, count: items.length });
  33  |     }
  34  |     if (path === '/api/auth/access/') return json(user);
  35  |     if (path === '/api/health/') return json({ status: 'ok' });
  36  |     if (path === '/api/training-plan/') return json({ items, version, count: items.length });
  37  |     if (path === '/api/training-plan-bootstrap/') return json({
  38  |       trainingPlan: { items, version, count: items.length }, programConfigs: programmes, catalogModules: catalog,
  39  |       moduleDefinitions: [], ksbProfiles: [], tutorProfiles: [], coachProfiles: [], holidays: { items: [], version: 'h1' },
  40  |       versions: { programConfigs: 'p1', moduleDefinitions: 'm1' },
  41  |     });
  42  |     if (path === '/api/training-plan-program-configs/') return json(programmes);
  43  |     if (path === '/api/modules/') return json(catalog);
  44  |     if (path === '/api/training-plan-holidays/') return json({ items: [], version: 'h1' });
  45  |     if (path === '/api/training-plan/lms-reference/') return json({ reference: {
  46  |       id: 1, createdAt: '2026-01-01T00:00:00Z', createdBy: { id: '1', name: 'Test' }, count: 1, contentSha256: 'test',
  47  |       records: [{ sourceModuleId: 'chosen', sourceProgrammeId: 'lms-me', programme: 'Marketing Executive Level 4', module: automatic ? 'Marketing' : 'LMS Marketing Workshop', startDate: automatic ? '2026-01-05' : '2026-02-02', endDate: '2026-02-16' }],
  48  |     } });
  49  |     if (path === '/api/training-plan/lms-reference/cohorts/') return json({ cohorts: { chosen: { cohortId: null, cohortName: '', groupName: '' } } });
  50  |     if (path === '/api/training-plan/lms-reference/tutors/') return json({ tutorNames: { chosen: 'LMS Tutor' } });
  51  |     return json([]);
  52  |   });
  53  |   const errors: string[] = [];
  54  |   page.on('pageerror', error => errors.push(error.message));
  55  |   return { items, writes, errors, failSave: () => { rejectSave = true; } };
  56  | }
  57  | 
  58  | async function openMatcher(page: Page) {
  59  |   await page.getByRole('button', { name: /View Added Modules/i }).last().click();
  60  |   await page.getByRole('button', { name: /Edit$/ }).first().click();
  61  |   await page.getByText('Compare with LMS modules', { exact: true }).click();
  62  |   await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  63  |   await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
> 64  |   await expect(page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true })).toBeVisible();
      |                                                                                           ^ Error: expect(locator).toBeVisible() failed
  65  |   await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).press('Escape');
  66  | }
  67  | 
  68  | async function chooseLmsModule(page: Page) {
  69  |   await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  70  |   await page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true }).click();
  71  | }
  72  | 
  73  | test('manual matching persists, reserves the LMS module, compares dates and can be removed after reload', async ({ page }) => {
  74  |   test.setTimeout(90_000);
  75  |   const api = await setup(page);
  76  |   await page.goto('/training-plan');
  77  |   await openMatcher(page);
  78  |   await expect(page.getByLabel('Current module to match').locator('option')).toHaveCount(3);
  79  |   await expect(page.getByLabel('Current module to match')).not.toContainText('Other workshop');
  80  |   await chooseLmsModule(page);
  81  |   const preview = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  82  |   await expect(preview).toContainText('2026-01-05');
  83  |   await expect(preview).toContainText('2026-02-02');
  84  |   await expect(preview).toContainText('LMS Tutor');
  85  |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  86  |   await expect(page.getByText('Manual match saved.', { exact: true })).toBeVisible();
  87  |   expect(api.items[0].notes).toContain('__lms_source_module_id:chosen');
  88  |   expect(api.items[0].notes).toContain('__module_catalogue_id:42');
  89  |   expect(api.items[0].notes).toContain('Original notes');
  90  |   await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b102']));
  91  |   await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  92  |   await expect(page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true })).toBeDisabled();
  93  |   await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).press('Escape');
  94  |   await page.reload();
  95  |   await openMatcher(page);
  96  |   const differences = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  97  |   await expect(page.getByText('Saved manual match', { exact: true })).toBeVisible();
  98  |   await expect(differences).toContainText('LMS Marketing Workshop');
  99  |   await expect(page.getByText('Dates and tutor differ', { exact: true })).toBeVisible();
  100 |   await expect(differences).toContainText('2026-02-02');
  101 |   await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toContainText('LMS Marketing Workshop');
  102 |   await page.getByRole('button', { name: 'Remove manual match', exact: true }).click();
  103 |   await expect(page.getByText('Manual match removed. Automatic matching applies again.', { exact: true })).toBeVisible();
  104 |   expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  105 |   expect(api.writes).toEqual(['/api/training-plan/modules/101/', '/api/training-plan/modules/101/']);
  106 |   expect(api.errors).toEqual([]);
  107 | });
  108 | 
  109 | test('a failed manual match save leaves the saved assignment unchanged', async ({ page }) => {
  110 |   const api = await setup(page);
  111 |   api.failSave();
  112 |   await page.goto('/training-plan');
  113 |   await openMatcher(page);
  114 |   await chooseLmsModule(page);
  115 |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  116 |   await expect(page.getByText('Module Not Saved', { exact: true })).toBeVisible();
  117 |   await page.getByRole('button', { name: 'OK', exact: true }).click();
  118 |   await expect(page.getByRole('alert')).toContainText('The match was not saved. Check the save message and retry.');
  119 |   expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  120 |   await expect(page.getByRole('button', { name: 'Remove manual match', exact: true })).toHaveCount(0);
  121 |   expect(api.errors).toEqual([]);
  122 | });
  123 | 
  124 | test('schedule assignment editor compares its own module and saves a manual pair without changing its schedule', async ({ page }) => {
  125 |   const api = await setup(page);
  126 |   await page.goto('/training-plan');
  127 |   await page.getByTitle('Expand programme', { exact: true }).click();
  128 |   await page.locator('[data-timeline-block-id="b101"]').click();
  129 |   await page.getByRole('button', { name: /Edit schedule assignment/ }).click();
  130 |   await expect(page.getByRole('heading', { name: 'Edit Module', exact: true })).toBeVisible();
  131 |   await page.getByText('Compare with LMS modules', { exact: true }).click();
  132 |   await expect(page.getByLabel('Current module to match', { exact: true })).toBeDisabled();
  133 |   await expect(page.getByLabel('Current module to match', { exact: true })).toHaveValue(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  134 |   await chooseLmsModule(page);
  135 |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  136 |   await expect(page.getByText('Manual match saved.', { exact: true })).toBeVisible();
  137 |   await page.getByRole('button', { name: 'Close module editor', exact: true }).click({ position: { x: 8, y: 8 } });
  138 |   await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  139 |   await expect(page.getByRole('button', { name: 'Compare plans', exact: true })).toHaveCount(0);
  140 |   expect(api.items[0].startDate).toBe('2026-01-05');
  141 |   expect(api.items[0].endDate).toBe('2026-01-19');
  142 |   expect(api.items[0].notes).toContain('__lms_source_module_id:chosen');
  143 |   expect(api.writes).toEqual(['/api/training-plan/modules/101/']);
  144 |   expect(api.errors).toEqual([]);
  145 | });
  146 | 
  147 | test('module editor selects automatic matches and compares sources side by side on desktop and mobile without writing', async ({ page }, testInfo) => {
  148 |   const api = await setup(page, true);
  149 |   await page.setViewportSize({ width: 1440, height: 1000 });
  150 |   await page.goto('/training-plan');
  151 |   await page.getByRole('button', { name: /View Added Modules/i }).last().click();
  152 |   await page.getByRole('button', { name: /Edit$/ }).first().click();
  153 |   await page.getByText('Compare with LMS modules', { exact: true }).click();
  154 |   await page.getByLabel('Current module to match').selectOption(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  155 |   await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toContainText('Marketing');
  156 |   await expect(page.getByText('Automatic match: same module name and start date.', { exact: true })).toBeVisible();
  157 |   const current = page.getByLabel('Current module to match');
  158 |   const lms = page.getByLabel('LMS module to match');
  159 |   const left = (await current.boundingBox())!;
  160 |   const right = (await lms.boundingBox())!;
  161 |   expect(right.x).toBeGreaterThan(left.x + left.width);
  162 |   expect(Math.abs(left.y - right.y)).toBeLessThan(3);
  163 |   const table = page.getByRole('table', { name: 'Selected module comparison' });
  164 |   await expect(table).toContainText('Plan Tutor');
```