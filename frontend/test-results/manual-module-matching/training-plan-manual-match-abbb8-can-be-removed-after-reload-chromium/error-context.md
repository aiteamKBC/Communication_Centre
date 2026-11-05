# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-manual-matching.spec.ts >> manual matching persists, reserves the LMS module, compares dates and can be removed after reload
- Location: tests\ui\training-plan-manual-matching.spec.ts:66:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Edit', exact: true }).first()

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
            - strong [ref=e73]: "2"
            - generic [ref=e74]: Groups
        - generic [ref=e75]:
          - img [ref=e77]
          - generic [ref=e81]:
            - strong [ref=e82]: "1"
            - generic [ref=e83]: Modules
        - generic [ref=e84]:
          - img [ref=e86]
          - generic [ref=e89]:
            - strong [ref=e90]: "6"
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
        - button " View Added Modules" [active] [ref=e133] [cursor=pointer]:
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
      - button "Compare plans" [ref=e154] [cursor=pointer]:
        - img [ref=e155]
        - text: Compare plans
    - tabpanel "Current Training Plan" [ref=e158]:
      - generic [ref=e161]:
        - generic [ref=e162]:
          - generic [ref=e163]:
            - img [ref=e165]
            - generic [ref=e167]:
              - heading "Programme timeline" [level=3] [ref=e168]
              - paragraph [ref=e169]: Explore delivery dates across programmes and cohorts.
          - generic [ref=e170]:
            - img [ref=e171]
            - text: Drag to explore
        - generic [ref=e176]:
          - generic [ref=e177]: "Zoom:"
          - group "Timeline zoom" [ref=e178]:
            - button "Year" [ref=e179] [cursor=pointer]
            - button "Intake" [ref=e180] [cursor=pointer]
            - button "Month" [pressed] [ref=e181] [cursor=pointer]
            - button "Week" [ref=e182] [cursor=pointer]
            - button "Day" [ref=e183] [cursor=pointer]
          - generic [ref=e184]:
            - button "Zoom out" [ref=e185] [cursor=pointer]:
              - img [ref=e186]
            - button "Zoom in" [ref=e187] [cursor=pointer]:
              - img [ref=e188]
          - generic [ref=e189]:
            - button "Modules ending within 14 days" [ref=e191] [cursor=pointer]:
              - img [ref=e192]
            - button "Classes 2" [ref=e196] [cursor=pointer]:
              - img [ref=e197]
              - text: Classes
              - generic [ref=e202]: "2"
            - button "Export" [ref=e203] [cursor=pointer]:
              - img [ref=e204]
              - text: Export
          - generic [ref=e207]:
            - generic [ref=e208]: Now
            - generic [ref=e210]: Workshop
        - generic [ref=e214]:
          - button " Monthly Module Breakdown Click any module to view monthly sessions, holidays, tutors, and coaches. 2/2 modules" [ref=e215] [cursor=pointer]:
            - generic [ref=e216]:
              - generic [ref=e218]: 
              - generic [ref=e219]:
                - generic [ref=e220]: Monthly Module Breakdown
                - generic [ref=e221]: Click any module to view monthly sessions, holidays, tutors, and coaches.
            - generic [ref=e222]: 2/2 modules
          - generic [ref=e223]:
            - generic [ref=e224]:
              - generic [ref=e225]: Search modules
              - generic [ref=e226]: 
              - textbox "Search modules " [ref=e227]:
                - /placeholder: Search module, group, tutor...
            - combobox [ref=e228]:
              - option "All programmes" [selected]
              - option "ME L4"
            - generic [ref=e229]:
              - button "All" [ref=e230] [cursor=pointer]
              - button "Clashes" [ref=e231] [cursor=pointer]
              - button "Clear" [ref=e232] [cursor=pointer]
            - button "Reset" [disabled] [ref=e233]
          - button " ME L4 2 modules 6 0 " [ref=e235] [cursor=pointer]:
            - generic [ref=e237]: 
            - generic [ref=e239]:
              - generic [ref=e240]: ME L4
              - generic [ref=e241]: 2 modules
            - generic [ref=e242]: "6"
            - generic "Holiday clashes" [ref=e243]: "0"
            - generic [ref=e245]: 
        - generic [ref=e247]:
          - generic [ref=e250]:
            - generic [ref=e251]: "2025"
            - generic [ref=e252]: "2026"
          - generic [ref=e255]:
            - generic [ref=e256]: Jan
            - generic [ref=e257]: Feb
            - generic [ref=e258]: Mar
            - generic [ref=e259]: Apr
            - generic [ref=e260]: May
            - generic [ref=e261]: Jun
            - generic [ref=e262]: Jul
            - generic [ref=e263]: Aug
            - generic [ref=e264]: Sep
            - generic [ref=e265]: Oct
            - generic [ref=e266]: Nov
            - generic [ref=e267]: Dec
            - generic [ref=e268]: Jan
            - generic [ref=e269]: Feb
            - generic [ref=e270]: Mar
            - generic [ref=e271]: Apr
            - generic [ref=e272]: May
            - generic [ref=e273]: Jun
            - generic [ref=e274]: Jul
            - generic [ref=e275]: Aug
            - generic [ref=e276]: Sep
            - generic [ref=e277]: Oct
            - generic [ref=e278]: Nov
            - generic [ref=e279]: Dec
        - generic [ref=e283]:
          - generic [ref=e285]:
            - generic [ref=e286]:
              - generic [ref=e288]: 
              - paragraph [ref=e289]: ME L4
              - button "" [ref=e290] [cursor=pointer]:
                - generic [ref=e291]: 
            - generic [ref=e292]:
              - generic [ref=e293]:
                - generic [ref=e295]: 
                - paragraph [ref=e296]: 1 cohort
              - generic [ref=e297]:
                - button "" [ref=e298] [cursor=pointer]:
                  - generic [ref=e299]: 
                - button "" [ref=e300] [cursor=pointer]:
                  - generic [ref=e301]: 
                - button "" [ref=e302] [cursor=pointer]:
                  - generic [ref=e303]: 
                - button "" [ref=e304] [cursor=pointer]:
                  - generic [ref=e305]: 
          - generic [ref=e307]:
            - generic [ref=e309]:
              - generic [ref=e311]:
                - generic [ref=e313]: 
                - paragraph [ref=e314]: January cohort
                - generic [ref=e315]: 2026-01-01
              - generic [ref=e316]:
                - button "" [ref=e317] [cursor=pointer]:
                  - generic [ref=e318]: 
                - button "" [ref=e319] [cursor=pointer]:
                  - generic [ref=e320]: 
                - button "" [ref=e321] [cursor=pointer]:
                  - generic [ref=e322]: 
            - generic [ref=e324]:
              - generic [ref=e325]:
                - generic [ref=e328]:
                  - paragraph [ref=e331]: Group 1
                  - button "" [ref=e332] [cursor=pointer]:
                    - generic [ref=e333]: 
                - generic [ref=e335]:
                  - paragraph [ref=e338]: Group 2
                  - button "" [ref=e339] [cursor=pointer]:
                    - generic [ref=e340]: 
              - generic [ref=e341]:
                - generic [ref=e346]: Marketing
                - generic [ref=e351]: Marketing
                - generic:
                  - generic:
                    - generic: NOW
        - button "Go to today's line" [ref=e352] [cursor=pointer]:
          - img [ref=e353]
  - contentinfo [ref=e356]:
    - generic [ref=e357]:
      - generic [ref=e358]:
        - generic [ref=e360]:
          - generic [ref=e361]:
            - img "KBC Crest" [ref=e363]
            - generic [ref=e364]:
              - paragraph [ref=e365]: Kent Business College
              - paragraph [ref=e366]: Communication Centre
          - generic [ref=e368]: Internal Hub
          - paragraph [ref=e369]: Kent Business College internal communication hub. Replacing email dependency with clarity, compliance and collaboration.
          - generic [ref=e370]:
            - generic [ref=e371]:
              - generic [ref=e373] [cursor=pointer]: 
              - generic: Email Us
            - generic [ref=e374]:
              - generic [ref=e376] [cursor=pointer]: 
              - generic: Call Support
            - generic [ref=e377]:
              - generic [ref=e379] [cursor=pointer]: 
              - generic: Open Teams
        - generic [ref=e380]:
          - heading "Platform" [level=4] [ref=e381]
          - list [ref=e382]:
            - listitem [ref=e383]:
              - link "Home" [ref=e384] [cursor=pointer]:
                - /url: /
                - text: Home
            - listitem [ref=e386]:
              - link "News & Announcements" [ref=e387] [cursor=pointer]:
                - /url: /news
                - text: News & Announcements
            - listitem [ref=e389]:
              - link "Internal Dashboard" [ref=e390] [cursor=pointer]:
                - /url: /dashboard
                - text: Internal Dashboard
            - listitem [ref=e392]:
              - link "Risk Register" [ref=e393] [cursor=pointer]:
                - /url: /risk-register
                - text: Risk Register
            - listitem [ref=e395]:
              - link "Departments" [ref=e396] [cursor=pointer]:
                - /url: /departments
                - text: Departments
        - generic [ref=e398]:
          - heading "Resources" [level=4] [ref=e399]
          - list [ref=e400]:
            - listitem [ref=e401]:
              - link "Policies & Guides" [ref=e402] [cursor=pointer]:
                - /url: /documents
                - text: Policies & Guides
            - listitem [ref=e404]:
              - link "Training Plan" [ref=e405] [cursor=pointer]:
                - /url: /training-plan
                - text: Training Plan
            - listitem [ref=e407]:
              - link "Events" [ref=e408] [cursor=pointer]:
                - /url: /events
                - text: Events
            - listitem [ref=e410]:
              - link "Project Hub" [ref=e411] [cursor=pointer]:
                - /url: /dashboard
                - text: Project Hub
            - listitem [ref=e413]:
              - link "IT Help" [ref=e414] [cursor=pointer]:
                - /url: /departments/it
                - text: IT Help
        - generic [ref=e416]:
          - heading "Support" [level=4] [ref=e417]
          - list [ref=e418]:
            - listitem [ref=e419]:
              - link "Feedback" [ref=e420] [cursor=pointer]:
                - /url: /feedback
                - text: Feedback
            - listitem [ref=e422]:
              - link "Accessibility" [ref=e423] [cursor=pointer]:
                - /url: /
                - text: Accessibility
            - listitem [ref=e425]:
              - link "Privacy Notice" [ref=e426] [cursor=pointer]:
                - /url: /
                - text: Privacy Notice
            - listitem [ref=e428]:
              - link "Contact IT" [ref=e429] [cursor=pointer]:
                - /url: /departments/it
                - text: Contact IT
            - listitem [ref=e431]:
              - link "Help Centre" [ref=e432] [cursor=pointer]:
                - /url: /
                - text: Help Centre
      - generic [ref=e434]:
        - paragraph [ref=e435]: © 2026 Kent Business College. Internal use only. All rights reserved.
        - generic [ref=e436]:
          - generic [ref=e437] [cursor=pointer]: Privacy Notice
          - generic [ref=e438] [cursor=pointer]: Accessibility
          - generic [ref=e439] [cursor=pointer]: Cookie Policy
  - generic [ref=e442]:
    - generic [ref=e443]:
      - generic [ref=e444]:
        - heading "View Added Modules" [level=2] [ref=e445]
        - paragraph [ref=e446]: 1 module in the catalogue
      - button "" [ref=e447] [cursor=pointer]:
        - generic [ref=e448]: 
    - generic [ref=e450]:
      - generic [ref=e452]:
        - paragraph [ref=e453]: Marketing
        - paragraph [ref=e454]: 3 sessions - 0/3 named
      - generic [ref=e455]: "3"
      - button " Edit" [ref=e456] [cursor=pointer]:
        - generic [ref=e457]: 
        - text: Edit
      - button "" [ref=e458] [cursor=pointer]:
        - generic [ref=e459]: 
      - generic [ref=e460]:
        - generic [ref=e461]: 1. Session 1 not named
        - generic [ref=e462]: 2. Session 2 not named
        - generic [ref=e463]: 3. Session 3 not named
    - generic [ref=e464]:
      - generic [ref=e465]: 1 module total
      - generic [ref=e466]:
        - button "Close" [ref=e467] [cursor=pointer]
        - button " Add Module" [ref=e468] [cursor=pointer]:
          - generic [ref=e469]: 
          - text: Add Module
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | 
  3   | test.use({ channel: 'chrome' });
  4   | 
  5   | async function setup(page: Page) {
  6   |   const user = { id: 1, username: 'matcher', displayName: 'Matcher', groups: ['Admin Access'], access: { adminAccess: true, operationsAccess: true, canManageCohorts: true } };
  7   |   await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  8   |   let version = 'v1';
  9   |   let rejectSave = false;
  10  |   const writes: string[] = [];
  11  |   const items = [101, 102].map((id, index) => ({
  12  |     id, programmeId: 'me-lvl4', cohortId: 'c1', cohortName: 'January cohort', program: 'ME L4', startingDateLabel: '2026-01-01',
  13  |     moduleName: 'Marketing', groupName: `Group ${index + 1}`, coachName: '', tutorName: 'Plan Tutor', tutorProfileId: '',
  14  |     startDate: '2026-01-05', endDate: '2026-01-19', sessionsNumber: '3', sessionWeekDay: 'monday', sessionStartTime: '09:00', sessionEndTime: '10:00',
  15  |     sessionKsbMappings: [], sessionCoverage: [], ksbProfileId: '', programmeDisplayOrder: 0, cohortDisplayOrder: 0,
  16  |     notes: `__program_id:me-lvl4\n__cohort_id:c1\n__group_id:g${index + 1}\n__block_id:b${id}\n__module_catalogue_id:42\n__module_color:#20869B\nOriginal notes`,
  17  |   }));
  18  |   const catalog = [{ id: 42, name: 'Marketing', colour: '#20869B', sessions: '3', notes: '', sessionNames: [], sessionDescriptions: [], sessionKsbMappings: [] }];
  19  |   const programmes = [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#115E59' }];
  20  |   await page.route('**/api/**', async route => {
  21  |     const path = new URL(route.request().url()).pathname;
  22  |     const method = route.request().method();
  23  |     const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  24  |     if (method !== 'GET') writes.push(path);
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
  47  |       records: [{ sourceModuleId: 'chosen', sourceProgrammeId: 'lms-me', programme: 'Marketing Executive Level 4', module: 'LMS Marketing Workshop', startDate: '2026-02-02', endDate: '2026-02-16' }],
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
> 60  |   await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
      |                                                                         ^ Error: locator.click: Test timeout of 90000ms exceeded.
  61  |   await page.getByText('Match modules for comparison', { exact: true }).click();
  62  |   await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  63  |   await expect(page.getByLabel('LMS module to match', { exact: true })).toContainText('LMS Marketing Workshop');
  64  | }
  65  | 
  66  | test('manual matching persists, reserves the LMS module, compares dates and can be removed after reload', async ({ page }) => {
  67  |   test.setTimeout(90_000);
  68  |   const api = await setup(page);
  69  |   await page.goto('/training-plan');
  70  |   await openMatcher(page);
  71  |   await page.getByLabel('LMS module to match', { exact: true }).selectOption('chosen');
  72  |   const preview = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  73  |   await expect(preview).toContainText('2026-01-05');
  74  |   await expect(preview).toContainText('2026-02-02');
  75  |   await expect(preview).toContainText('LMS Tutor');
  76  |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  77  |   await expect(page.getByText('Manual match saved. Compare plans to review all differences.', { exact: true })).toBeVisible();
  78  |   expect(api.items[0].notes).toContain('__lms_source_module_id:chosen');
  79  |   expect(api.items[0].notes).toContain('__module_catalogue_id:42');
  80  |   expect(api.items[0].notes).toContain('Original notes');
  81  |   await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b102']));
  82  |   await expect(page.getByLabel('LMS module to match', { exact: true }).locator('option[value="chosen"]')).toBeDisabled();
  83  |   await page.reload();
  84  |   await page.getByRole('button', { name: 'Compare plans', exact: true }).click();
  85  |   const differences = page.getByRole('table', { name: 'Plan differences', exact: true });
  86  |   await expect(differences).toContainText('Manual match');
  87  |   await expect(differences).toContainText('LMS Marketing Workshop');
  88  |   await expect(differences).toContainText('Dates and tutor differ');
  89  |   await expect(differences).toContainText('2026-02-02');
  90  |   await page.getByRole('button', { name: 'Exit comparison', exact: true }).click();
  91  |   await openMatcher(page);
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
  109 |   await expect(page.getByText('The match was not saved. Check the save message and retry.', { exact: true })).toBeVisible();
  110 |   expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  111 |   await expect(page.getByRole('button', { name: 'Remove manual match', exact: true })).toHaveCount(0);
  112 |   expect(api.errors).toEqual([]);
  113 | });
  114 | 
```