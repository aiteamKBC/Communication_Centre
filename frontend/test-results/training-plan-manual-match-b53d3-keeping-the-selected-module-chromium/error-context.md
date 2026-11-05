# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-manual-matching.spec.ts >> Compare filters current modules by group and inclusive overlapping dates while keeping the selected module
- Location: tests\ui\training-plan-manual-matching.spec.ts:103:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option')
Expected: 3
Received: 0
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option')
    23 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
          - button "Compare" [ref=e128] [cursor=pointer]:
            - img [ref=e129]
            - text: Compare
        - generic [ref=e132]:
          - button " Holidays" [ref=e133] [cursor=pointer]:
            - generic [ref=e134]: 
            - text: Holidays
          - button " Add Module" [ref=e135] [cursor=pointer]:
            - generic [ref=e136]: 
            - text: Add Module
          - button " View Added Modules" [ref=e137] [cursor=pointer]:
            - generic [ref=e138]: 
            - text: View Added Modules
          - button " Add Programme" [ref=e139] [cursor=pointer]:
            - generic [ref=e140]: 
            - text: Add Programme
          - button " KSB Profiles" [ref=e141] [cursor=pointer]:
            - generic [ref=e142]: 
            - text: KSB Profiles
      - generic [ref=e143]:
        - generic [ref=e144]:
          - generic [ref=e145]: Timeline workspace
          - generic [ref=e146]: Choose your plan source
        - tablist "Training Plan data source" [ref=e147]:
          - tab "Current Training Plan" [selected] [ref=e148] [cursor=pointer]:
            - img [ref=e149]
            - text: Current Training Plan
          - tab "LMS Training Plan" [ref=e153] [cursor=pointer]:
            - img [ref=e154]
            - text: LMS Training Plan
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
              - button "Classes 3" [ref=e196] [cursor=pointer]:
                - img [ref=e197]
                - text: Classes
                - generic [ref=e202]: "3"
              - button "Export" [ref=e203] [cursor=pointer]:
                - img [ref=e204]
                - text: Export
            - generic [ref=e207]:
              - generic [ref=e208]: Now
              - generic [ref=e210]: Workshop
          - button " Monthly Module Breakdown Click any module to view monthly sessions, holidays, tutors, and coaches. 3/3 modules" [ref=e215] [cursor=pointer]:
            - generic [ref=e216]:
              - generic [ref=e218]: 
              - generic [ref=e219]:
                - generic [ref=e220]: Monthly Module Breakdown
                - generic [ref=e221]: Click any module to view monthly sessions, holidays, tutors, and coaches.
            - generic [ref=e222]: 3/3 modules
          - generic [ref=e224]:
            - generic [ref=e227]:
              - generic [ref=e228]: "2025"
              - generic [ref=e229]: "2026"
            - generic [ref=e232]:
              - generic [ref=e233]: Jan
              - generic [ref=e234]: Feb
              - generic [ref=e235]: Mar
              - generic [ref=e236]: Apr
              - generic [ref=e237]: May
              - generic [ref=e238]: Jun
              - generic [ref=e239]: Jul
              - generic [ref=e240]: Aug
              - generic [ref=e241]: Sep
              - generic [ref=e242]: Oct
              - generic [ref=e243]: Nov
              - generic [ref=e244]: Dec
              - generic [ref=e245]: Jan
              - generic [ref=e246]: Feb
              - generic [ref=e247]: Mar
              - generic [ref=e248]: Apr
              - generic [ref=e249]: May
              - generic [ref=e250]: Jun
              - generic [ref=e251]: Jul
              - generic [ref=e252]: Aug
              - generic [ref=e253]: Sep
              - generic [ref=e254]: Oct
              - generic [ref=e255]: Nov
              - generic [ref=e256]: Dec
          - generic [ref=e262]:
            - generic [ref=e263]:
              - generic [ref=e265]: 
              - paragraph [ref=e266]: ME L4
              - button "" [ref=e267] [cursor=pointer]:
                - generic [ref=e268]: 
            - generic [ref=e269]:
              - generic [ref=e270]:
                - generic [ref=e272]: 
                - paragraph [ref=e273]: 1 cohort
              - generic [ref=e274]:
                - button "" [ref=e275] [cursor=pointer]:
                  - generic [ref=e276]: 
                - button "" [ref=e277] [cursor=pointer]:
                  - generic [ref=e278]: 
                - button "" [ref=e279] [cursor=pointer]:
                  - generic [ref=e280]: 
                - button "" [ref=e281] [cursor=pointer]:
                  - generic [ref=e282]: 
          - button "Go to today's line" [ref=e284] [cursor=pointer]:
            - img [ref=e285]
    - contentinfo [ref=e288]:
      - generic [ref=e289]:
        - generic [ref=e290]:
          - generic [ref=e292]:
            - generic [ref=e293]:
              - img "KBC Crest" [ref=e295]
              - generic [ref=e296]:
                - paragraph [ref=e297]: Kent Business College
                - paragraph [ref=e298]: Communication Centre
            - generic [ref=e300]: Internal Hub
            - paragraph [ref=e301]: Kent Business College internal communication hub. Replacing email dependency with clarity, compliance and collaboration.
            - generic [ref=e302]:
              - generic [ref=e303]:
                - generic [ref=e305] [cursor=pointer]: 
                - generic: Email Us
              - generic [ref=e306]:
                - generic [ref=e308] [cursor=pointer]: 
                - generic: Call Support
              - generic [ref=e309]:
                - generic [ref=e311] [cursor=pointer]: 
                - generic: Open Teams
          - generic [ref=e312]:
            - heading "Platform" [level=4] [ref=e313]
            - list [ref=e314]:
              - listitem [ref=e315]:
                - link "Home" [ref=e316] [cursor=pointer]:
                  - /url: /
                  - text: Home
              - listitem [ref=e318]:
                - link "News & Announcements" [ref=e319] [cursor=pointer]:
                  - /url: /news
                  - text: News & Announcements
              - listitem [ref=e321]:
                - link "Internal Dashboard" [ref=e322] [cursor=pointer]:
                  - /url: /dashboard
                  - text: Internal Dashboard
              - listitem [ref=e324]:
                - link "Risk Register" [ref=e325] [cursor=pointer]:
                  - /url: /risk-register
                  - text: Risk Register
              - listitem [ref=e327]:
                - link "Departments" [ref=e328] [cursor=pointer]:
                  - /url: /departments
                  - text: Departments
          - generic [ref=e330]:
            - heading "Resources" [level=4] [ref=e331]
            - list [ref=e332]:
              - listitem [ref=e333]:
                - link "Policies & Guides" [ref=e334] [cursor=pointer]:
                  - /url: /documents
                  - text: Policies & Guides
              - listitem [ref=e336]:
                - link "Training Plan" [ref=e337] [cursor=pointer]:
                  - /url: /training-plan
                  - text: Training Plan
              - listitem [ref=e339]:
                - link "Events" [ref=e340] [cursor=pointer]:
                  - /url: /events
                  - text: Events
              - listitem [ref=e342]:
                - link "Project Hub" [ref=e343] [cursor=pointer]:
                  - /url: /dashboard
                  - text: Project Hub
              - listitem [ref=e345]:
                - link "IT Help" [ref=e346] [cursor=pointer]:
                  - /url: /departments/it
                  - text: IT Help
          - generic [ref=e348]:
            - heading "Support" [level=4] [ref=e349]
            - list [ref=e350]:
              - listitem [ref=e351]:
                - link "Feedback" [ref=e352] [cursor=pointer]:
                  - /url: /feedback
                  - text: Feedback
              - listitem [ref=e354]:
                - link "Accessibility" [ref=e355] [cursor=pointer]:
                  - /url: /
                  - text: Accessibility
              - listitem [ref=e357]:
                - link "Privacy Notice" [ref=e358] [cursor=pointer]:
                  - /url: /
                  - text: Privacy Notice
              - listitem [ref=e360]:
                - link "Contact IT" [ref=e361] [cursor=pointer]:
                  - /url: /departments/it
                  - text: Contact IT
              - listitem [ref=e363]:
                - link "Help Centre" [ref=e364] [cursor=pointer]:
                  - /url: /
                  - text: Help Centre
        - generic [ref=e366]:
          - paragraph [ref=e367]: © 2026 Kent Business College. Internal use only. All rights reserved.
          - generic [ref=e368]:
            - generic [ref=e369] [cursor=pointer]: Privacy Notice
            - generic [ref=e370] [cursor=pointer]: Accessibility
            - generic [ref=e371] [cursor=pointer]: Cookie Policy
  - dialog "Compare modules" [ref=e373]:
    - generic [ref=e374]:
      - heading "Compare modules" [level=2] [ref=e375]
      - button "Close module comparison" [ref=e376] [cursor=pointer]:
        - img [ref=e377]
    - group [ref=e381]:
      - generic "Compare with LMS modules" [ref=e382] [cursor=pointer]
      - generic [ref=e383]:
        - paragraph [ref=e384]: Choose any Current Training Plan module and any LMS module to compare their details, including modules from different programmes.
        - generic "Modules to compare" [ref=e385]:
          - generic [ref=e386]:
            - generic [ref=e387]: Current Training Plan module
            - generic [ref=e389]:
              - button "Current module to compare" [ref=e390] [cursor=pointer]:
                - generic [ref=e393]: Marketing
              - button "Toggle options" [ref=e394] [cursor=pointer]:
                - generic [ref=e395]: 
          - generic [ref=e396]:
            - generic [ref=e397]: LMS module
            - generic [ref=e399]:
              - button "LMS module to match" [ref=e400] [cursor=pointer]:
                - generic [ref=e401]: Choose an LMS module
              - button "Toggle options" [ref=e402] [cursor=pointer]:
                - generic [ref=e403]: 
```

# Test source

```ts
  28  |       const payload = route.request().postDataJSON();
  29  |       expect(payload.version).toBe(version);
  30  |       expect(Object.keys(payload).sort()).toEqual(['notes', 'version']);
  31  |       items[0].notes = payload.notes;
  32  |       version = 'v2';
  33  |       return json({ item: items[0], items, version, count: items.length });
  34  |     }
  35  |     if (path === '/api/auth/access/') return json(user);
  36  |     if (path === '/api/health/') return json({ status: 'ok' });
  37  |     if (path === '/api/training-plan/') return json({ items, version, count: items.length });
  38  |     if (path === '/api/training-plan-bootstrap/') return json({
  39  |       trainingPlan: { items, version, count: items.length }, programConfigs: programmes, catalogModules: catalog,
  40  |       moduleDefinitions: [], ksbProfiles: [], tutorProfiles: [], coachProfiles: [], holidays: { items: [], version: 'h1' },
  41  |       versions: { programConfigs: 'p1', moduleDefinitions: 'm1' },
  42  |     });
  43  |     if (path === '/api/training-plan-program-configs/') return json(programmes);
  44  |     if (path === '/api/modules/') return json(catalog);
  45  |     if (path === '/api/training-plan-holidays/') return json({ items: [], version: 'h1' });
  46  |     if (path === '/api/training-plan/lms-reference/') return json({ reference: {
  47  |       id: 1, createdAt: '2026-01-01T00:00:00Z', createdBy: { id: '1', name: 'Test' }, count: 1, contentSha256: 'test',
  48  |       records: [{ sourceModuleId: 'chosen', sourceProgrammeId: 'lms-me', programme: 'Marketing Executive Level 4', module: automatic ? 'Marketing' : 'LMS Marketing Workshop', startDate: automatic ? '2026-01-05' : '2026-02-02', endDate: '2026-02-16' },
  49  |         ...additionalModules.map(module => ({ sourceProgrammeId: 'lms-me', programme: 'Marketing Executive Level 4', startDate: '2026-02-02', endDate: '2026-02-16', ...module }))],
  50  |     } });
  51  |     if (path === '/api/training-plan/lms-reference/cohorts/') return json({ cohorts: { chosen: { cohortId: null, cohortName: '', groupName: '' } } });
  52  |     if (path === '/api/training-plan/lms-reference/tutors/') return json({ tutorNames: { chosen: 'LMS Tutor' } });
  53  |     return json([]);
  54  |   });
  55  |   const errors: string[] = [];
  56  |   page.on('pageerror', error => errors.push(error.message));
  57  |   return { items, writes, errors, failSave: () => { rejectSave = true; } };
  58  | }
  59  | 
  60  | async function openMatcher(page: Page) {
  61  |   await page.getByRole('button', { name: /View Added Modules/i }).last().click();
  62  |   await page.getByRole('button', { name: /Edit$/ }).first().click();
  63  |   await page.getByText('Compare with LMS modules', { exact: true }).click();
  64  |   await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  65  |   await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  66  |   await expect(page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true })).toBeVisible();
  67  |   await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).press('Escape');
  68  | }
  69  | 
  70  | async function chooseLmsModule(page: Page) {
  71  |   await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  72  |   await page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true }).click();
  73  | }
  74  | 
  75  | test('LMS recommendations include a single shared word and keep unrelated modules available without selecting or saving', async ({ page }) => {
  76  |   const api = await setup(page, false, [
  77  |     { sourceModuleId: 'unrelated', module: 'AAA Finance' },
  78  |     { sourceModuleId: 'punctuation', module: 'MARKETING-strategy' },
  79  |     { sourceModuleId: 'substring', module: 'Remarketing overview' },
  80  |     { sourceModuleId: 'other-programme', module: 'Marketing elsewhere', programme: 'Marketing Manager Level 6' },
  81  |   ]);
  82  |   await page.goto('/training-plan');
  83  |   await openMatcher(page);
  84  |   await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toContainText('Choose an LMS module');
  85  |   await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  86  |   const options = page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option');
  87  |   await expect(options).toHaveCount(4);
  88  |   await expect(options.nth(0)).toContainText('LMS Marketing Workshop');
  89  |   await expect(options.nth(1)).toContainText('MARKETING-strategy');
  90  |   await expect(options.nth(2)).toContainText('AAA Finance');
  91  |   await expect(options.nth(3)).toContainText('Remarketing overview');
  92  |   await expect(options.nth(0)).toContainText('Recommended');
  93  |   await expect(options.nth(1)).toContainText('Recommended');
  94  |   await expect(options.nth(2)).not.toContainText('Recommended');
  95  |   await expect(options.nth(3)).not.toContainText('Recommended');
  96  |   await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).fill('Finance');
  97  |   await expect(options).toHaveCount(1);
  98  |   await expect(options.first()).toContainText('AAA Finance');
  99  |   expect(api.writes).toEqual([]);
  100 |   expect(api.errors).toEqual([]);
  101 | });
  102 | 
  103 | test('Compare filters current modules by group and inclusive overlapping dates while keeping the selected module', async ({ page }) => {
  104 |   const api = await setup(page);
  105 |   await page.goto('/training-plan');
  106 |   await page.getByRole('button', { name: 'Compare', exact: true }).click();
  107 |   await page.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  108 |   const options = page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option');
  109 |   await page.getByLabel('Current modules Group filter', { exact: true }).selectOption({ label: 'Group 2' });
  110 |   await page.getByLabel('Current modules From', { exact: true }).fill('2026-01-19');
  111 |   await page.getByLabel('Current modules To', { exact: true }).fill('2026-01-19');
  112 |   await expect(options).toHaveCount(1);
  113 |   await expect(options.first()).toContainText('Group 2');
  114 |   await page.getByLabel('Current modules From', { exact: true }).fill('2026-01-20');
  115 |   await page.getByLabel('Current modules To', { exact: true }).fill('2026-01-21');
  116 |   await expect(options).toHaveCount(0);
  117 |   await page.getByLabel('Current modules From', { exact: true }).fill('2026-01-10');
  118 |   await expect(options).toHaveCount(1);
  119 |   await options.first().click();
  120 |   const trigger = page.getByRole('button', { name: 'Current module to compare', exact: true });
  121 |   await expect(trigger).toContainText('Marketing');
  122 |   await trigger.click();
  123 |   await page.getByLabel('Current modules Group filter', { exact: true }).selectOption({ label: 'Group 3' });
  124 |   await page.getByRole('combobox', { name: 'Search current comparison modules', exact: true }).press('Escape');
  125 |   await expect(trigger).toContainText('Marketing');
  126 |   await trigger.click();
  127 |   await page.getByRole('button', { name: 'Clear filters and search', exact: true }).click();
> 128 |   await expect(options).toHaveCount(3);
      |                         ^ Error: expect(locator).toHaveCount(expected) failed
  129 |   expect(api.writes).toEqual([]);
  130 |   expect(api.errors).toEqual([]);
  131 | });
  132 | 
  133 | test('LMS search combines programme, cohort, group, tutor and dates and resets on mobile', async ({ page }, testInfo) => {
  134 |   const api = await setup(page, false, [
  135 |     { sourceModuleId: 'target', module: 'Marketing February', groupName: 'Group 2', cohortName: 'Spring cohort', tutorName: 'Second Tutor', startDate: '2026-02-05', endDate: '2026-02-20' },
  136 |     { sourceModuleId: 'other', module: 'Marketing March', programme: 'Marketing Manager Level 6', groupName: 'Group 3', cohortName: 'Later cohort', tutorName: 'Other Tutor', startDate: '2026-03-01', endDate: '2026-03-20' },
  137 |     { sourceModuleId: 'undated', module: 'Undated module', startDate: null, endDate: null },
  138 |     { sourceModuleId: 'invalid', module: 'Invalid date module', startDate: '2026-02-30', endDate: '2026-03-10' },
  139 |   ]);
  140 |   await page.setViewportSize({ width: 390, height: 844 });
  141 |   await page.goto('/training-plan');
  142 |   await page.getByRole('button', { name: 'Compare', exact: true }).click();
  143 |   await page.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  144 |   await page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option').first().click();
  145 |   await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  146 |   const options = page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option');
  147 |   const search = page.getByRole('combobox', { name: 'Search LMS match modules', exact: true });
  148 |   await expect(options).toHaveCount(5);
  149 |   await search.press('Tab');
  150 |   await expect(page.getByLabel('LMS modules Programme filter', { exact: true })).toBeFocused();
  151 |   await page.getByLabel('LMS modules Programme filter', { exact: true }).selectOption({ label: 'ME L4' });
  152 |   await expect(options).toHaveCount(4);
  153 |   await page.getByLabel('LMS modules Cohort filter', { exact: true }).selectOption({ label: 'Spring cohort' });
  154 |   await page.getByLabel('LMS modules Group filter', { exact: true }).selectOption({ label: 'Group 2' });
  155 |   await page.getByLabel('LMS modules Tutor filter', { exact: true }).selectOption({ label: 'Second Tutor' });
  156 |   await page.getByLabel('LMS modules From', { exact: true }).fill('2026-02-20');
  157 |   await page.getByLabel('LMS modules To', { exact: true }).fill('2026-02-20');
  158 |   await search.fill('February');
  159 |   await expect(options).toHaveCount(1);
  160 |   await expect(options.first()).toContainText('Marketing February');
  161 |   await expect(options.first()).toBeInViewport();
  162 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  163 |   await page.screenshot({ path: testInfo.outputPath('module-search-filters-mobile.png') });
  164 |   await search.fill('no match');
  165 |   await expect(options).toHaveCount(0);
  166 |   await page.getByRole('button', { name: 'Clear filters and search', exact: true }).click();
  167 |   await expect(options).toHaveCount(5);
  168 |   await page.getByLabel('LMS modules From', { exact: true }).fill('2026-02-01');
  169 |   await expect(options).toHaveCount(3);
  170 |   await page.getByLabel('LMS modules To', { exact: true }).fill('2026-01-01');
  171 |   await expect(page.getByRole('alert')).toHaveText('From must be on or before To.');
  172 |   await expect(options).toHaveCount(0);
  173 |   await page.getByRole('button', { name: 'Clear filters and search', exact: true }).click();
  174 |   await expect(options).toHaveCount(5);
  175 |   expect(api.writes).toEqual([]);
  176 |   expect(api.errors).toEqual([]);
  177 | });
  178 | 
  179 | test('standalone Compare browses all assignments and LMS programmes without saving on desktop and mobile', async ({ page }, testInfo) => {
  180 |   const api = await setup(page, false, [{ sourceModuleId: 'cross', module: 'Cross programme module', programme: 'Marketing Manager Level 6' }]);
  181 |   api.items[1].notes += '\n__lms_source_module_id:chosen';
  182 |   const originalItems = JSON.stringify(api.items);
  183 |   await page.setViewportSize({ width: 1440, height: 1000 });
  184 |   await page.goto('/training-plan');
  185 |   const trigger = page.getByRole('button', { name: 'Compare', exact: true });
  186 |   await trigger.click();
  187 |   const dialog = page.getByRole('dialog', { name: 'Compare modules', exact: true });
  188 |   await expect(dialog).toBeVisible();
  189 |   await dialog.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  190 |   const currentOptions = page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option');
  191 |   await expect(currentOptions).toHaveCount(3);
  192 |   await expect(currentOptions.filter({ hasText: 'Group 2' })).toContainText('January cohort');
  193 |   await page.getByRole('combobox', { name: 'Search current comparison modules', exact: true }).fill('Other workshop');
  194 |   await currentOptions.first().click();
  195 |   await dialog.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  196 |   const lmsOptions = page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option');
  197 |   const claimed = lmsOptions.filter({ hasText: 'LMS Marketing Workshop' });
  198 |   await expect(claimed).toBeEnabled();
  199 |   await claimed.click();
  200 |   const table = dialog.getByRole('table', { name: 'Selected module comparison', exact: true });
  201 |   await expect(table).toContainText('Other workshop');
  202 |   await expect(table).toContainText('LMS Marketing Workshop');
  203 |   await dialog.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  204 |   await lmsOptions.filter({ hasText: 'Cross programme module' }).click();
  205 |   await expect(table).toContainText('MM LVL6');
  206 |   await expect(table).toContainText('ME L4');
  207 |   await expect(table).toContainText('2026-02-02');
  208 |   await expect(dialog.getByText('Dates and tutor differ', { exact: true })).toBeVisible();
  209 |   await expect(dialog.getByRole('button', { name: 'Save manual match', exact: true })).toHaveCount(0);
  210 |   await page.screenshot({ path: testInfo.outputPath('standalone-module-comparison.png') });
  211 |   await page.setViewportSize({ width: 390, height: 844 });
  212 |   await expect(dialog).toBeVisible();
  213 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  214 |   const scroll = dialog.getByRole('region', { name: 'Module comparison details' });
  215 |   expect(await scroll.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  216 |   await page.screenshot({ path: testInfo.outputPath('standalone-module-comparison-mobile.png') });
  217 |   await dialog.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  218 |   await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).press('Escape');
  219 |   await expect(dialog).toBeVisible();
  220 |   await page.keyboard.press('Escape');
  221 |   await expect(dialog).toHaveCount(0);
  222 |   await expect(trigger).toBeFocused();
  223 |   expect(api.writes).toEqual([]);
  224 |   expect(JSON.stringify(api.items)).toBe(originalItems);
  225 |   expect(api.errors).toEqual([]);
  226 | });
  227 | 
  228 | test('manual matching persists, reserves the LMS module, compares dates and can be removed after reload', async ({ page }) => {
```