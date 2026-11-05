# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-manual-matching.spec.ts >> LMS search combines programme, cohort, group, tutor and dates and resets on mobile
- Location: tests\ui\training-plan-manual-matching.spec.ts:133:1

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator: getByLabel('LMS modules Programme filter', { exact: true })
Expected: focused
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeFocused" with timeout 10000ms
  - waiting for getByLabel('LMS modules Programme filter', { exact: true })

```

```yaml
- navigation:
  - link "KBC Crest":
    - /url: /
    - img "KBC Crest"
  - button ""
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
  - button "Compare"
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
    - text: "Zoom:"
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
- dialog "Compare modules":
  - heading "Compare modules" [level=2]
  - button "Close module comparison"
  - group:
    - text: Compare with LMS modules
    - paragraph: Choose any Current Training Plan module and any LMS module to compare their details, including modules from different programmes.
    - text: Current Training Plan module
    - button "Current module to compare": Marketing
    - button "Toggle options"
    - text: LMS module
    - button "LMS module to match": Choose an LMS module
    - button "Toggle options"
```

# Test source

```ts
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
  128 |   await expect(options).toHaveCount(3);
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
> 150 |   await expect(page.getByLabel('LMS modules Programme filter', { exact: true })).toBeFocused();
      |                                                                                  ^ Error: expect(locator).toBeFocused() failed
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
  229 |   test.setTimeout(90_000);
  230 |   const api = await setup(page);
  231 |   await page.goto('/training-plan');
  232 |   await openMatcher(page);
  233 |   await expect(page.getByLabel('Current module to match').locator('option')).toHaveCount(3);
  234 |   await expect(page.getByLabel('Current module to match')).not.toContainText('Other workshop');
  235 |   await chooseLmsModule(page);
  236 |   const preview = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  237 |   await expect(preview).toContainText('2026-01-05');
  238 |   await expect(preview).toContainText('2026-02-02');
  239 |   await expect(preview).toContainText('LMS Tutor');
  240 |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  241 |   await expect(page.getByText('Manual match saved.', { exact: true })).toBeVisible();
  242 |   expect(api.items[0].notes).toContain('__lms_source_module_id:chosen');
  243 |   expect(api.items[0].notes).toContain('__module_catalogue_id:42');
  244 |   expect(api.items[0].notes).toContain('Original notes');
  245 |   await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b102']));
  246 |   await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  247 |   await expect(page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true })).toBeDisabled();
  248 |   await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).press('Escape');
  249 |   await page.reload();
  250 |   await openMatcher(page);
```