# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-manual-matching.spec.ts >> schedule assignment editor compares its own module and saves a manual pair without changing its schedule
- Location: tests\ui\training-plan-manual-matching.spec.ts:115:1

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.click: Test timeout of 45000ms exceeded.
Call log:
  - waiting for locator('[data-timeline-block-id="b101"]')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - generic [ref=e5]:
      - link "KBC Crest Kent Business College Communication Centre" [ref=e6]:
        - /url: /
        - img "KBC Crest" [ref=e8]
        - generic [ref=e9]:
          - paragraph [ref=e10]: Kent Business College
          - paragraph [ref=e11]: Communication Centre
      - generic [ref=e12]:
        - link "Home" [ref=e13] [cursor=pointer]:
          - /url: /
        - link "News & Announcements" [ref=e14] [cursor=pointer]:
          - /url: /news
        - link "Internal Dashboards" [ref=e15] [cursor=pointer]:
          - /url: /dashboard
        - link "Risk Register" [ref=e16] [cursor=pointer]:
          - /url: /risk-register
        - link "Departments" [ref=e17] [cursor=pointer]:
          - /url: /departments
        - link "Policies" [ref=e18] [cursor=pointer]:
          - /url: /documents
        - link "Events" [ref=e19] [cursor=pointer]:
          - /url: /events
        - link "Training Plan" [ref=e20] [cursor=pointer]:
          - /url: /training-plan
          - text: Training Plan
        - link "LMS" [ref=e22] [cursor=pointer]:
          - /url: https://kentbusinesscollege.org/
        - link "APTEM" [ref=e23] [cursor=pointer]:
          - /url: https://kentbusinesscollege.aptem.co.uk/pwa/auth/login?returnUrl=%2Fcaseload-dashboard
        - link "User Activity" [ref=e24] [cursor=pointer]:
          - /url: /user-activity
      - generic [ref=e25]:
        - generic [ref=e27]: Matcher
        - button " Logout" [ref=e28] [cursor=pointer]:
          - generic [ref=e29]: 
          - text: Logout
        - text: 
  - generic [ref=e32]:
    - generic [ref=e33]:
      - link "Home" [ref=e34] [cursor=pointer]:
        - /url: /
      - generic [ref=e35]: 
      - link "Events" [ref=e36] [cursor=pointer]:
        - /url: /events
      - generic [ref=e37]: 
      - generic [ref=e38]: Training Plan
    - generic [ref=e39]:
      - generic [ref=e40]:
        - img [ref=e42]
        - generic [ref=e45]:
          - paragraph [ref=e46]: Learning & delivery
          - heading "Apprenticeships Training Plan" [level=1] [ref=e47]
          - paragraph [ref=e48]: Programme Structure 2025 – 2027
      - generic "Training Plan overview" [ref=e49]:
        - generic [ref=e50]:
          - img [ref=e52]
          - generic [ref=e54]:
            - strong [ref=e55]: "1"
            - generic [ref=e56]: Programmes
        - generic [ref=e57]:
          - img [ref=e59]
          - generic [ref=e62]:
            - strong [ref=e63]: "1"
            - generic [ref=e64]: Cohorts
        - generic [ref=e65]:
          - img [ref=e67]
          - generic [ref=e72]:
            - strong [ref=e73]: "3"
            - generic [ref=e74]: Groups
        - generic [ref=e75]:
          - img [ref=e77]
          - generic [ref=e81]:
            - strong [ref=e82]: "2"
            - generic [ref=e83]: Modules
        - generic [ref=e84]:
          - img [ref=e86]
          - generic [ref=e89]:
            - strong [ref=e90]: "9"
            - generic [ref=e91]: Sessions
        - generic [ref=e92]:
          - img [ref=e94]
          - generic [ref=e96]:
            - strong [ref=e97]: "0"
            - generic [ref=e98]: Holidays
    - text:    
  - main [ref=e99]:
    - generic [ref=e100]:
      - generic [ref=e101]:
        - generic [ref=e102]:
          - img [ref=e104]
          - generic [ref=e106]:
            - paragraph [ref=e107]: Daily overview
            - heading "Today's Sessions" [level=2] [ref=e108]
        - generic [ref=e109]: 0 scheduled
      - paragraph [ref=e110]: No sessions scheduled for today.
    - generic [ref=e111]:
      - generic "Training Plan views" [ref=e112]:
        - button "Training Plan" [pressed] [ref=e113] [cursor=pointer]:
          - img [ref=e114]
          - text: Training Plan
        - button "Session Schedule" [ref=e116] [cursor=pointer]:
          - img [ref=e117]
          - text: Session Schedule
        - button "Tutor Profiles" [ref=e119] [cursor=pointer]:
          - img [ref=e120]
          - text: Tutor Profiles
        - button "Coach Profiles" [ref=e123] [cursor=pointer]:
          - img [ref=e124]
          - text: Coach Profiles
      - generic [ref=e128]:
        - button " Holidays" [ref=e129] [cursor=pointer]:
          - generic [ref=e130]: 
          - text: Holidays
        - button " Add Module" [ref=e131] [cursor=pointer]:
          - generic [ref=e132]: 
          - text: Add Module
        - button " View Added Modules" [ref=e133] [cursor=pointer]:
          - generic [ref=e134]: 
          - text: View Added Modules
        - button " Add Programme" [ref=e135] [cursor=pointer]:
          - generic [ref=e136]: 
          - text: Add Programme
        - button " KSB Profiles" [ref=e137] [cursor=pointer]:
          - generic [ref=e138]: 
          - text: KSB Profiles
    - generic [ref=e139]:
      - generic [ref=e140]:
        - generic [ref=e141]: Timeline workspace
        - generic [ref=e142]: Choose your plan source
      - tablist "Training Plan data source" [ref=e143]:
        - tab "Current Training Plan" [selected] [ref=e144] [cursor=pointer]:
          - img [ref=e145]
          - text: Current Training Plan
        - tab "LMS Training Plan" [ref=e149] [cursor=pointer]:
          - img [ref=e150]
          - text: LMS Training Plan
    - tabpanel "Current Training Plan" [ref=e154]:
      - generic [ref=e157]:
        - generic [ref=e158]:
          - generic [ref=e159]:
            - img [ref=e161]
            - generic [ref=e163]:
              - heading "Programme timeline" [level=3] [ref=e164]
              - paragraph [ref=e165]: Explore delivery dates across programmes and cohorts.
          - generic [ref=e166]:
            - img [ref=e167]
            - text: Drag to explore
        - generic [ref=e172]:
          - generic [ref=e173]: "Zoom:"
          - group "Timeline zoom" [ref=e174]:
            - button "Year" [ref=e175] [cursor=pointer]
            - button "Intake" [ref=e176] [cursor=pointer]
            - button "Month" [pressed] [ref=e177] [cursor=pointer]
            - button "Week" [ref=e178] [cursor=pointer]
            - button "Day" [ref=e179] [cursor=pointer]
          - generic [ref=e180]:
            - button "Zoom out" [ref=e181] [cursor=pointer]:
              - img [ref=e182]
            - button "Zoom in" [ref=e183] [cursor=pointer]:
              - img [ref=e184]
          - generic [ref=e185]:
            - button "Modules ending within 14 days" [ref=e187] [cursor=pointer]:
              - img [ref=e188]
            - button "Classes 3" [ref=e192] [cursor=pointer]:
              - img [ref=e193]
              - text: Classes
              - generic [ref=e198]: "3"
            - button "Export" [ref=e199] [cursor=pointer]:
              - img [ref=e200]
              - text: Export
          - generic [ref=e203]:
            - generic [ref=e204]: Now
            - generic [ref=e206]: Workshop
        - button " Monthly Module Breakdown Click any module to view monthly sessions, holidays, tutors, and coaches. 3/3 modules" [ref=e211] [cursor=pointer]:
          - generic [ref=e212]:
            - generic [ref=e214]: 
            - generic [ref=e215]:
              - generic [ref=e216]: Monthly Module Breakdown
              - generic [ref=e217]: Click any module to view monthly sessions, holidays, tutors, and coaches.
          - generic [ref=e218]: 3/3 modules
        - generic [ref=e220]:
          - generic [ref=e223]:
            - generic [ref=e224]: "2025"
            - generic [ref=e225]: "2026"
          - generic [ref=e228]:
            - generic [ref=e229]: Jan
            - generic [ref=e230]: Feb
            - generic [ref=e231]: Mar
            - generic [ref=e232]: Apr
            - generic [ref=e233]: May
            - generic [ref=e234]: Jun
            - generic [ref=e235]: Jul
            - generic [ref=e236]: Aug
            - generic [ref=e237]: Sep
            - generic [ref=e238]: Oct
            - generic [ref=e239]: Nov
            - generic [ref=e240]: Dec
            - generic [ref=e241]: Jan
            - generic [ref=e242]: Feb
            - generic [ref=e243]: Mar
            - generic [ref=e244]: Apr
            - generic [ref=e245]: May
            - generic [ref=e246]: Jun
            - generic [ref=e247]: Jul
            - generic [ref=e248]: Aug
            - generic [ref=e249]: Sep
            - generic [ref=e250]: Oct
            - generic [ref=e251]: Nov
            - generic [ref=e252]: Dec
        - generic [ref=e258]:
          - generic [ref=e259]:
            - generic [ref=e261]: 
            - paragraph [ref=e262]: ME L4
            - button "" [ref=e263] [cursor=pointer]:
              - generic [ref=e264]: 
          - generic [ref=e265]:
            - generic [ref=e266]:
              - generic [ref=e268]: 
              - paragraph [ref=e269]: 1 cohort
            - generic [ref=e270]:
              - button "" [ref=e271] [cursor=pointer]:
                - generic [ref=e272]: 
              - button "" [ref=e273] [cursor=pointer]:
                - generic [ref=e274]: 
              - button "" [ref=e275] [cursor=pointer]:
                - generic [ref=e276]: 
              - button "" [ref=e277] [cursor=pointer]:
                - generic [ref=e278]: 
        - button "Go to today's line" [ref=e280] [cursor=pointer]:
          - img [ref=e281]
  - contentinfo [ref=e284]:
    - generic [ref=e285]:
      - generic [ref=e286]:
        - generic [ref=e288]:
          - generic [ref=e289]:
            - img "KBC Crest" [ref=e291]
            - generic [ref=e292]:
              - paragraph [ref=e293]: Kent Business College
              - paragraph [ref=e294]: Communication Centre
          - generic [ref=e296]: Internal Hub
          - paragraph [ref=e297]: Kent Business College internal communication hub. Replacing email dependency with clarity, compliance and collaboration.
          - generic [ref=e298]:
            - generic [ref=e299]:
              - generic [ref=e301] [cursor=pointer]: 
              - generic: Email Us
            - generic [ref=e302]:
              - generic [ref=e304] [cursor=pointer]: 
              - generic: Call Support
            - generic [ref=e305]:
              - generic [ref=e307] [cursor=pointer]: 
              - generic: Open Teams
        - generic [ref=e308]:
          - heading "Platform" [level=4] [ref=e309]
          - list [ref=e310]:
            - listitem [ref=e311]:
              - link "Home" [ref=e312] [cursor=pointer]:
                - /url: /
                - text: Home
            - listitem [ref=e314]:
              - link "News & Announcements" [ref=e315] [cursor=pointer]:
                - /url: /news
                - text: News & Announcements
            - listitem [ref=e317]:
              - link "Internal Dashboard" [ref=e318] [cursor=pointer]:
                - /url: /dashboard
                - text: Internal Dashboard
            - listitem [ref=e320]:
              - link "Risk Register" [ref=e321] [cursor=pointer]:
                - /url: /risk-register
                - text: Risk Register
            - listitem [ref=e323]:
              - link "Departments" [ref=e324] [cursor=pointer]:
                - /url: /departments
                - text: Departments
        - generic [ref=e326]:
          - heading "Resources" [level=4] [ref=e327]
          - list [ref=e328]:
            - listitem [ref=e329]:
              - link "Policies & Guides" [ref=e330] [cursor=pointer]:
                - /url: /documents
                - text: Policies & Guides
            - listitem [ref=e332]:
              - link "Training Plan" [ref=e333] [cursor=pointer]:
                - /url: /training-plan
                - text: Training Plan
            - listitem [ref=e335]:
              - link "Events" [ref=e336] [cursor=pointer]:
                - /url: /events
                - text: Events
            - listitem [ref=e338]:
              - link "Project Hub" [ref=e339] [cursor=pointer]:
                - /url: /dashboard
                - text: Project Hub
            - listitem [ref=e341]:
              - link "IT Help" [ref=e342] [cursor=pointer]:
                - /url: /departments/it
                - text: IT Help
        - generic [ref=e344]:
          - heading "Support" [level=4] [ref=e345]
          - list [ref=e346]:
            - listitem [ref=e347]:
              - link "Feedback" [ref=e348] [cursor=pointer]:
                - /url: /feedback
                - text: Feedback
            - listitem [ref=e350]:
              - link "Accessibility" [ref=e351] [cursor=pointer]:
                - /url: /
                - text: Accessibility
            - listitem [ref=e353]:
              - link "Privacy Notice" [ref=e354] [cursor=pointer]:
                - /url: /
                - text: Privacy Notice
            - listitem [ref=e356]:
              - link "Contact IT" [ref=e357] [cursor=pointer]:
                - /url: /departments/it
                - text: Contact IT
            - listitem [ref=e359]:
              - link "Help Centre" [ref=e360] [cursor=pointer]:
                - /url: /
                - text: Help Centre
      - generic [ref=e362]:
        - paragraph [ref=e363]: © 2026 Kent Business College. Internal use only. All rights reserved.
        - generic [ref=e364]:
          - generic [ref=e365] [cursor=pointer]: Privacy Notice
          - generic [ref=e366] [cursor=pointer]: Accessibility
          - generic [ref=e367] [cursor=pointer]: Cookie Policy
```

# Test source

```ts
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
  63  |   await expect(page.getByLabel('LMS module to match', { exact: true })).toContainText('LMS Marketing Workshop');
  64  | }
  65  | 
  66  | test('manual matching persists, reserves the LMS module, compares dates and can be removed after reload', async ({ page }) => {
  67  |   test.setTimeout(90_000);
  68  |   const api = await setup(page);
  69  |   await page.goto('/training-plan');
  70  |   await openMatcher(page);
  71  |   await expect(page.getByLabel('Current module to match').locator('option')).toHaveCount(3);
  72  |   await expect(page.getByLabel('Current module to match')).not.toContainText('Other workshop');
  73  |   await page.getByLabel('LMS module to match', { exact: true }).selectOption('chosen');
  74  |   const preview = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  75  |   await expect(preview).toContainText('2026-01-05');
  76  |   await expect(preview).toContainText('2026-02-02');
  77  |   await expect(preview).toContainText('LMS Tutor');
  78  |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  79  |   await expect(page.getByText('Manual match saved.', { exact: true })).toBeVisible();
  80  |   expect(api.items[0].notes).toContain('__lms_source_module_id:chosen');
  81  |   expect(api.items[0].notes).toContain('__module_catalogue_id:42');
  82  |   expect(api.items[0].notes).toContain('Original notes');
  83  |   await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b102']));
  84  |   await expect(page.getByLabel('LMS module to match', { exact: true }).locator('option[value="chosen"]')).toHaveAttribute('disabled', '');
  85  |   await page.reload();
  86  |   await openMatcher(page);
  87  |   const differences = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  88  |   await expect(page.getByText('Saved manual match', { exact: true })).toBeVisible();
  89  |   await expect(differences).toContainText('LMS Marketing Workshop');
  90  |   await expect(page.getByText('Dates and tutor differ', { exact: true })).toBeVisible();
  91  |   await expect(differences).toContainText('2026-02-02');
  92  |   await expect(page.getByLabel('LMS module to match', { exact: true })).toHaveValue('chosen');
  93  |   await page.getByRole('button', { name: 'Remove manual match', exact: true }).click();
  94  |   await expect(page.getByText('Manual match removed. Automatic matching applies again.', { exact: true })).toBeVisible();
  95  |   expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  96  |   expect(api.writes).toEqual(['/api/training-plan/modules/101/', '/api/training-plan/modules/101/']);
  97  |   expect(api.errors).toEqual([]);
  98  | });
  99  | 
  100 | test('a failed manual match save leaves the saved assignment unchanged', async ({ page }) => {
  101 |   const api = await setup(page);
  102 |   api.failSave();
  103 |   await page.goto('/training-plan');
  104 |   await openMatcher(page);
  105 |   await page.getByLabel('LMS module to match', { exact: true }).selectOption('chosen');
  106 |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  107 |   await expect(page.getByText('Module Not Saved', { exact: true })).toBeVisible();
  108 |   await page.getByRole('button', { name: 'OK', exact: true }).click();
  109 |   await expect(page.getByRole('alert')).toContainText('The match was not saved. Check the save message and retry.');
  110 |   expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  111 |   await expect(page.getByRole('button', { name: 'Remove manual match', exact: true })).toHaveCount(0);
  112 |   expect(api.errors).toEqual([]);
  113 | });
  114 | 
  115 | test('schedule assignment editor compares its own module and saves a manual pair without changing its schedule', async ({ page }) => {
  116 |   const api = await setup(page);
  117 |   await page.goto('/training-plan');
> 118 |   await page.locator('[data-timeline-block-id="b101"]').click();
      |                                                         ^ Error: locator.click: Test timeout of 45000ms exceeded.
  119 |   await page.getByRole('button', { name: /Edit schedule assignment/ }).click();
  120 |   await expect(page.getByRole('heading', { name: 'Edit Module', exact: true })).toBeVisible();
  121 |   await page.getByText('Compare with LMS modules', { exact: true }).click();
  122 |   await expect(page.getByLabel('Current module to match', { exact: true })).toBeDisabled();
  123 |   await expect(page.getByLabel('Current module to match', { exact: true })).toHaveValue(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  124 |   await page.getByLabel('LMS module to match', { exact: true }).selectOption('chosen');
  125 |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  126 |   await expect(page.getByText('Manual match saved.', { exact: true })).toBeVisible();
  127 |   await page.getByRole('button', { name: 'Close module editor', exact: true }).click({ position: { x: 8, y: 8 } });
  128 |   await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  129 |   await expect(page.getByRole('button', { name: 'Compare plans', exact: true })).toHaveCount(0);
  130 |   expect(api.items[0].startDate).toBe('2026-01-05');
  131 |   expect(api.items[0].endDate).toBe('2026-01-19');
  132 |   expect(api.items[0].notes).toContain('__lms_source_module_id:chosen');
  133 |   expect(api.writes).toEqual(['/api/training-plan/modules/101/']);
  134 |   expect(api.errors).toEqual([]);
  135 | });
  136 | 
  137 | test('module editor selects automatic matches and compares sources side by side on desktop and mobile without writing', async ({ page }, testInfo) => {
  138 |   const api = await setup(page, true);
  139 |   await page.setViewportSize({ width: 1440, height: 1000 });
  140 |   await page.goto('/training-plan');
  141 |   await page.getByRole('button', { name: /View Added Modules/i }).last().click();
  142 |   await page.getByRole('button', { name: /Edit$/ }).first().click();
  143 |   await page.getByText('Compare with LMS modules', { exact: true }).click();
  144 |   await page.getByLabel('Current module to match').selectOption(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  145 |   await expect(page.getByLabel('LMS module to match')).toHaveValue('chosen');
  146 |   await expect(page.getByText('Automatic match: same module name and start date.', { exact: true })).toBeVisible();
  147 |   const current = page.getByLabel('Current module to match');
  148 |   const lms = page.getByLabel('LMS module to match');
  149 |   const left = (await current.boundingBox())!;
  150 |   const right = (await lms.boundingBox())!;
  151 |   expect(right.x).toBeGreaterThan(left.x + left.width);
  152 |   expect(Math.abs(left.y - right.y)).toBeLessThan(3);
  153 |   const table = page.getByRole('table', { name: 'Selected module comparison' });
  154 |   await expect(table).toContainText('Plan Tutor');
  155 |   await expect(table).toContainText('LMS Tutor');
  156 |   await page.screenshot({ path: testInfo.outputPath('edit-module-lms-comparison.png') });
  157 |   await page.setViewportSize({ width: 390, height: 844 });
  158 |   const mobileLeft = (await current.boundingBox())!;
  159 |   const mobileRight = (await lms.boundingBox())!;
  160 |   expect(mobileRight.x).toBeGreaterThan(mobileLeft.x + mobileLeft.width);
  161 |   expect(Math.abs(mobileLeft.y - mobileRight.y)).toBeLessThan(3);
  162 |   const scroll = page.getByRole('region', { name: 'Module comparison details' });
  163 |   expect(await scroll.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  164 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  165 |   expect(api.writes).toEqual([]);
  166 |   expect(api.errors).toEqual([]);
  167 | });
  168 | 
```