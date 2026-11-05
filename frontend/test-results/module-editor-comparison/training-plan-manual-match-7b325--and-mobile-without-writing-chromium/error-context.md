# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-manual-matching.spec.ts >> module editor selects automatic matches and compares sources side by side on desktop and mobile without writing
- Location: tests\ui\training-plan-manual-matching.spec.ts:137:1

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 3
Received:   16
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - generic [ref=e5]:
      - link "KBC Crest" [ref=e6]:
        - /url: /
        - img "KBC Crest" [ref=e8]
      - generic [ref=e9]:
        - text: 
        - button "" [ref=e10] [cursor=pointer]:
          - generic [ref=e11]: 
  - generic [ref=e14]:
    - generic [ref=e15]:
      - link "Home" [ref=e16] [cursor=pointer]:
        - /url: /
      - generic [ref=e17]: 
      - link "Events" [ref=e18] [cursor=pointer]:
        - /url: /events
      - generic [ref=e19]: 
      - generic [ref=e20]: Training Plan
    - generic [ref=e21]:
      - generic [ref=e22]:
        - img [ref=e24]
        - generic [ref=e27]:
          - paragraph [ref=e28]: Learning & delivery
          - heading "Apprenticeships Training Plan" [level=1] [ref=e29]
          - paragraph [ref=e30]: Programme Structure 2025 – 2027
      - generic "Training Plan overview" [ref=e31]:
        - generic [ref=e33]:
          - strong [ref=e34]: "1"
          - generic [ref=e35]: Programmes
        - generic [ref=e37]:
          - strong [ref=e38]: "1"
          - generic [ref=e39]: Cohorts
        - generic [ref=e41]:
          - strong [ref=e42]: "3"
          - generic [ref=e43]: Groups
        - generic [ref=e45]:
          - strong [ref=e46]: "3"
          - generic [ref=e47]: Modules
        - generic [ref=e49]:
          - strong [ref=e50]: "9"
          - generic [ref=e51]: Sessions
        - generic [ref=e53]:
          - strong [ref=e54]: "0"
          - generic [ref=e55]: Holidays
    - generic:    
  - main [ref=e56]:
    - generic [ref=e57]:
      - generic [ref=e58]:
        - generic [ref=e59]:
          - img [ref=e61]
          - generic [ref=e63]:
            - paragraph [ref=e64]: Daily overview
            - heading "Today's Sessions" [level=2] [ref=e65]
        - generic [ref=e66]: 0 scheduled
      - paragraph [ref=e67]: No sessions scheduled for today.
    - generic [ref=e68]:
      - generic "Training Plan views" [ref=e69]:
        - button "Training Plan" [pressed] [ref=e70] [cursor=pointer]:
          - img [ref=e71]
          - text: Training Plan
        - button "Session Schedule" [ref=e73] [cursor=pointer]:
          - img [ref=e74]
          - text: Session Schedule
        - button "Tutor Profiles" [ref=e76] [cursor=pointer]:
          - img [ref=e77]
          - text: Tutor Profiles
        - button "Coach Profiles" [ref=e80] [cursor=pointer]:
          - img [ref=e81]
          - text: Coach Profiles
      - generic [ref=e85]:
        - button " Holidays" [ref=e86] [cursor=pointer]:
          - generic [ref=e87]: 
          - text: Holidays
        - button " Add Module" [ref=e88] [cursor=pointer]:
          - generic [ref=e89]: 
          - text: Add Module
        - button " View Added Modules" [ref=e90] [cursor=pointer]:
          - generic [ref=e91]: 
          - text: View Added Modules
        - button " Add Programme" [ref=e92] [cursor=pointer]:
          - generic [ref=e93]: 
          - text: Add Programme
        - button " KSB Profiles" [ref=e94] [cursor=pointer]:
          - generic [ref=e95]: 
          - text: KSB Profiles
    - generic [ref=e96]:
      - generic [ref=e97]:
        - generic [ref=e98]: Timeline workspace
        - generic [ref=e99]: Choose your plan source
      - tablist "Training Plan data source" [ref=e100]:
        - tab "Current Training Plan" [selected] [ref=e101] [cursor=pointer]:
          - img [ref=e102]
          - text: Current Training Plan
        - tab "LMS Training Plan" [ref=e106] [cursor=pointer]:
          - img [ref=e107]
          - text: LMS Training Plan
    - tabpanel "Current Training Plan" [ref=e111]:
      - generic [ref=e114]:
        - generic [ref=e116]:
          - img [ref=e118]
          - generic [ref=e120]:
            - heading "Programme timeline" [level=3] [ref=e121]
            - paragraph [ref=e122]: Explore delivery dates across programmes and cohorts.
        - generic [ref=e123]:
          - generic [ref=e124]: "Zoom:"
          - group "Timeline zoom" [ref=e125]:
            - button "Year" [ref=e126] [cursor=pointer]
            - button "Intake" [ref=e127] [cursor=pointer]
            - button "Month" [pressed] [ref=e128] [cursor=pointer]
            - button "Week" [ref=e129] [cursor=pointer]
            - button "Day" [ref=e130] [cursor=pointer]
          - generic [ref=e131]:
            - button "Zoom out" [ref=e132] [cursor=pointer]:
              - img [ref=e133]
            - button "Zoom in" [ref=e134] [cursor=pointer]:
              - img [ref=e135]
          - generic [ref=e136]:
            - button "Modules ending within 14 days" [ref=e138] [cursor=pointer]:
              - img [ref=e139]
            - button "Classes 3" [ref=e143] [cursor=pointer]:
              - img [ref=e144]
              - text: Classes
              - generic [ref=e149]: "3"
            - button "Export" [ref=e150] [cursor=pointer]:
              - img [ref=e151]
              - text: Export
          - generic [ref=e154]:
            - generic [ref=e155]: Now
            - generic [ref=e157]: Workshop
        - generic [ref=e161]:
          - button " Monthly Module Breakdown Click any module to view monthly sessions, holidays, tutors, and coaches. 3/3 modules" [ref=e162] [cursor=pointer]:
            - generic [ref=e163]:
              - generic [ref=e165]: 
              - generic [ref=e166]:
                - generic [ref=e167]: Monthly Module Breakdown
                - generic [ref=e168]: Click any module to view monthly sessions, holidays, tutors, and coaches.
            - generic [ref=e169]: 3/3 modules
          - generic [ref=e170]:
            - generic [ref=e171]:
              - generic [ref=e172]: Search modules
              - generic [ref=e173]: 
              - textbox "Search modules " [ref=e174]:
                - /placeholder: Search module, group, tutor...
            - combobox [ref=e175]:
              - option "All programmes" [selected]
              - option "ME L4"
            - generic [ref=e176]:
              - button "All" [ref=e177] [cursor=pointer]
              - button "Clashes" [ref=e178] [cursor=pointer]
              - button "Clear" [ref=e179] [cursor=pointer]
            - button "Reset" [disabled] [ref=e180]
          - button "ME L4 3 modules 9 0 " [ref=e182] [cursor=pointer]:
            - generic [ref=e183]: 
            - generic [ref=e185]:
              - generic [ref=e186]: ME L4
              - generic [ref=e187]: 3 modules
            - generic [ref=e188]: "9"
            - generic "Holiday clashes" [ref=e189]: "0"
            - generic [ref=e191]: 
        - generic [ref=e193]:
          - generic [ref=e196]:
            - generic [ref=e197]: "2025"
            - generic [ref=e198]: "2026"
          - generic [ref=e201]:
            - generic [ref=e202]: Jan
            - generic [ref=e203]: Feb
            - generic [ref=e204]: Mar
            - generic [ref=e205]: Apr
            - generic [ref=e206]: May
            - generic [ref=e207]: Jun
            - generic [ref=e208]: Jul
            - generic [ref=e209]: Aug
            - generic [ref=e210]: Sep
            - generic [ref=e211]: Oct
            - generic [ref=e212]: Nov
            - generic [ref=e213]: Dec
            - generic [ref=e214]: Jan
            - generic [ref=e215]: Feb
            - generic [ref=e216]: Mar
            - generic [ref=e217]: Apr
            - generic [ref=e218]: May
            - generic [ref=e219]: Jun
            - generic [ref=e220]: Jul
            - generic [ref=e221]: Aug
            - generic [ref=e222]: Sep
            - generic [ref=e223]: Oct
            - generic [ref=e224]: Nov
            - generic [ref=e225]: Dec
        - generic [ref=e229]:
          - generic [ref=e231]:
            - generic [ref=e232]:
              - generic [ref=e234]: 
              - paragraph [ref=e235]: ME L4
              - button "" [ref=e236] [cursor=pointer]:
                - generic [ref=e237]: 
            - generic [ref=e238]:
              - generic [ref=e239]:
                - generic [ref=e241]: 
                - paragraph [ref=e242]: 1 cohort
              - generic [ref=e243]:
                - button "" [ref=e244] [cursor=pointer]:
                  - generic [ref=e245]: 
                - button "" [ref=e246] [cursor=pointer]:
                  - generic [ref=e247]: 
                - button "" [ref=e248] [cursor=pointer]:
                  - generic [ref=e249]: 
                - button "" [ref=e250] [cursor=pointer]:
                  - generic [ref=e251]: 
          - generic [ref=e253]:
            - generic [ref=e255]:
              - generic [ref=e257]:
                - generic [ref=e259]: 
                - paragraph: January cohort
                - generic [ref=e260]: 2026-01-01
              - generic [ref=e261]:
                - button "" [ref=e262] [cursor=pointer]:
                  - generic [ref=e263]: 
                - button "" [ref=e264] [cursor=pointer]:
                  - generic [ref=e265]: 
                - button "" [ref=e266] [cursor=pointer]:
                  - generic [ref=e267]: 
            - generic [ref=e269]:
              - generic [ref=e270]:
                - generic [ref=e273]:
                  - paragraph [ref=e276]: Group 1
                  - button "" [ref=e277] [cursor=pointer]:
                    - generic [ref=e278]: 
                - generic [ref=e280]:
                  - paragraph [ref=e283]: Group 2
                  - button "" [ref=e284] [cursor=pointer]:
                    - generic [ref=e285]: 
                - generic [ref=e287]:
                  - paragraph [ref=e290]: Group 3
                  - button "" [ref=e291] [cursor=pointer]:
                    - generic [ref=e292]: 
              - generic [ref=e293]:
                - generic [ref=e298]: Marketing
                - generic [ref=e303]: Marketing
                - generic [ref=e308]: Other workshop
                - generic:
                  - generic:
                    - generic: NOW
        - button "Go to today's line" [ref=e309] [cursor=pointer]:
          - img [ref=e310]
  - contentinfo [ref=e313]:
    - generic [ref=e314]:
      - generic [ref=e315]:
        - generic [ref=e317]:
          - generic [ref=e318]:
            - img "KBC Crest" [ref=e320]
            - generic [ref=e321]:
              - paragraph [ref=e322]: Kent Business College
              - paragraph [ref=e323]: Communication Centre
          - generic [ref=e325]: Internal Hub
          - paragraph [ref=e326]: Kent Business College internal communication hub. Replacing email dependency with clarity, compliance and collaboration.
          - generic [ref=e327]:
            - generic [ref=e328]:
              - generic [ref=e330] [cursor=pointer]: 
              - generic: Email Us
            - generic [ref=e331]:
              - generic [ref=e333] [cursor=pointer]: 
              - generic: Call Support
            - generic [ref=e334]:
              - generic [ref=e336] [cursor=pointer]: 
              - generic: Open Teams
        - generic [ref=e337]:
          - heading "Platform" [level=4] [ref=e338]
          - list [ref=e339]:
            - listitem [ref=e340]:
              - link "Home" [ref=e341] [cursor=pointer]:
                - /url: /
                - text: Home
            - listitem [ref=e343]:
              - link "News & Announcements" [ref=e344] [cursor=pointer]:
                - /url: /news
                - text: News & Announcements
            - listitem [ref=e346]:
              - link "Internal Dashboard" [ref=e347] [cursor=pointer]:
                - /url: /dashboard
                - text: Internal Dashboard
            - listitem [ref=e349]:
              - link "Risk Register" [ref=e350] [cursor=pointer]:
                - /url: /risk-register
                - text: Risk Register
            - listitem [ref=e352]:
              - link "Departments" [ref=e353] [cursor=pointer]:
                - /url: /departments
                - text: Departments
        - generic [ref=e355]:
          - heading "Resources" [level=4] [ref=e356]
          - list [ref=e357]:
            - listitem [ref=e358]:
              - link "Policies & Guides" [ref=e359] [cursor=pointer]:
                - /url: /documents
                - text: Policies & Guides
            - listitem [ref=e361]:
              - link "Training Plan" [ref=e362] [cursor=pointer]:
                - /url: /training-plan
                - text: Training Plan
            - listitem [ref=e364]:
              - link "Events" [ref=e365] [cursor=pointer]:
                - /url: /events
                - text: Events
            - listitem [ref=e367]:
              - link "Project Hub" [ref=e368] [cursor=pointer]:
                - /url: /dashboard
                - text: Project Hub
            - listitem [ref=e370]:
              - link "IT Help" [ref=e371] [cursor=pointer]:
                - /url: /departments/it
                - text: IT Help
        - generic [ref=e373]:
          - heading "Support" [level=4] [ref=e374]
          - list [ref=e375]:
            - listitem [ref=e376]:
              - link "Feedback" [ref=e377] [cursor=pointer]:
                - /url: /feedback
                - text: Feedback
            - listitem [ref=e379]:
              - link "Accessibility" [ref=e380] [cursor=pointer]:
                - /url: /
                - text: Accessibility
            - listitem [ref=e382]:
              - link "Privacy Notice" [ref=e383] [cursor=pointer]:
                - /url: /
                - text: Privacy Notice
            - listitem [ref=e385]:
              - link "Contact IT" [ref=e386] [cursor=pointer]:
                - /url: /departments/it
                - text: Contact IT
            - listitem [ref=e388]:
              - link "Help Centre" [ref=e389] [cursor=pointer]:
                - /url: /
                - text: Help Centre
      - generic [ref=e391]:
        - paragraph [ref=e392]: © 2026 Kent Business College. Internal use only. All rights reserved.
        - generic [ref=e393]:
          - generic [ref=e394] [cursor=pointer]: Privacy Notice
          - generic [ref=e395] [cursor=pointer]: Accessibility
          - generic [ref=e396] [cursor=pointer]: Cookie Policy
  - generic [ref=e397]:
    - generic [ref=e399]:
      - generic [ref=e400]:
        - generic [ref=e401]:
          - heading "View Added Modules" [level=2] [ref=e402]
          - paragraph [ref=e403]: 1 module in the catalogue
        - button "" [ref=e404] [cursor=pointer]:
          - generic [ref=e405]: 
      - generic [ref=e407]:
        - generic [ref=e409]:
          - paragraph [ref=e410]: Marketing
          - paragraph [ref=e411]: 3 sessions - 0/3 named
        - generic [ref=e412]: "3"
        - button " Edit" [ref=e413] [cursor=pointer]:
          - generic [ref=e414]: 
          - text: Edit
        - button "" [ref=e415] [cursor=pointer]:
          - generic [ref=e416]: 
        - generic [ref=e417]:
          - generic [ref=e418]: 1. Session 1 not named
          - generic [ref=e419]: 2. Session 2 not named
          - generic [ref=e420]: 3. Session 3 not named
      - generic [ref=e421]:
        - generic [ref=e422]: 1 module total
        - generic [ref=e423]:
          - button "Close" [ref=e424] [cursor=pointer]
          - button " Add Module" [ref=e425] [cursor=pointer]:
            - generic [ref=e426]: 
            - text: Add Module
    - generic [ref=e429]:
      - generic [ref=e430]:
        - generic [ref=e431]:
          - heading "Edit Module" [level=3] [ref=e432]
          - paragraph [ref=e433]: Changes apply to the module catalogue
        - button "" [ref=e434] [cursor=pointer]:
          - generic [ref=e435]: 
      - generic [ref=e436]:
        - group [ref=e437]:
          - generic "Compare with LMS modules" [active] [ref=e438] [cursor=pointer]
          - generic [ref=e439]:
            - paragraph [ref=e440]: Compare this saved Training Plan assignment with an LMS module. A unique match with the same name and start date is selected automatically. Choose a different LMS module to compare or save a manual match.
            - generic "Modules to compare" [ref=e441]:
              - generic [ref=e442]:
                - text: Current Training Plan module
                - combobox "Current module to match" [ref=e443]:
                  - option "Choose a scheduled module"
                  - 'option "Marketing / ME L4 / January cohort / Group 1 / 2026-01-05 / #101" [selected]'
                  - 'option "Marketing / ME L4 / January cohort / Group 2 / 2026-01-12 / #102"'
              - generic [ref=e444]:
                - generic [ref=e445]:
                  - text: LMS module
                  - combobox "LMS module to match" [ref=e446]:
                    - option "Choose an LMS module"
                    - option "Marketing / No cohort / No group / 2026-01-05 / chosen" [selected]
                - searchbox "Search LMS match modules" [ref=e447]
            - status [ref=e448]: "Automatic match: same module name and start date."
            - region "Module comparison details" [ref=e449]:
              - table "Selected module comparison" [ref=e450]:
                - rowgroup [ref=e451]:
                  - row "Field Current Training Plan LMS" [ref=e452]:
                    - columnheader "Field" [ref=e453]
                    - columnheader "Current Training Plan" [ref=e454]
                    - columnheader "LMS" [ref=e455]
                - rowgroup [ref=e456]:
                  - row "Programme ME L4 ME L4" [ref=e457]:
                    - rowheader "Programme" [ref=e458]
                    - cell "ME L4" [ref=e459]
                    - cell "ME L4" [ref=e460]
                  - row "Cohort January cohort Not provided" [ref=e461]:
                    - rowheader "Cohort" [ref=e462]
                    - cell "January cohort" [ref=e463]
                    - cell "Not provided" [ref=e464]
                  - row "Group Group 1 Not provided" [ref=e465]:
                    - rowheader "Group" [ref=e466]
                    - cell "Group 1" [ref=e467]
                    - cell "Not provided" [ref=e468]
                  - row "Module Marketing Marketing" [ref=e469]:
                    - rowheader "Module" [ref=e470]
                    - cell "Marketing" [ref=e471]
                    - cell "Marketing" [ref=e472]
                  - row "Start date 2026-01-05 2026-01-05" [ref=e473]:
                    - rowheader "Start date" [ref=e474]
                    - cell "2026-01-05" [ref=e475]
                    - cell "2026-01-05" [ref=e476]
                  - row "End date 2026-01-19 2026-02-16" [ref=e477]:
                    - rowheader "End date" [ref=e478]
                    - cell "2026-01-19" [ref=e479]
                    - cell "2026-02-16" [ref=e480]
                  - row "Tutor Plan Tutor LMS Tutor" [ref=e481]:
                    - rowheader "Tutor" [ref=e482]
                    - cell "Plan Tutor" [ref=e483]
                    - cell "LMS Tutor" [ref=e484]
            - paragraph [ref=e485]: Dates and tutor differ
            - button "Save manual match" [ref=e487] [cursor=pointer]
        - generic [ref=e488]:
          - generic [ref=e490]:
            - paragraph [ref=e491]: Marketing
            - paragraph [ref=e492]: 3 sessions
          - generic [ref=e493]: "3"
        - generic [ref=e494]:
          - generic [ref=e495]: Module Name
          - textbox [ref=e496]: Marketing
        - generic [ref=e497]:
          - generic [ref=e498]:
            - generic [ref=e499]: Number of Sessions
            - generic [ref=e500]:
              - button "" [ref=e501] [cursor=pointer]:
                - generic [ref=e502]: 
              - spinbutton [ref=e503]: "3"
              - button "" [ref=e504] [cursor=pointer]:
                - generic [ref=e505]: 
          - generic [ref=e506]:
            - generic [ref=e507]: Colour
            - generic [ref=e508]:
              - textbox [ref=e509] [cursor=pointer]: "#20869b"
              - generic [ref=e510]: "#20869B"
        - generic [ref=e511]:
          - generic [ref=e512]: Notes (optional)
          - textbox "Any notes about this module..." [ref=e513]
        - button " Session KSB Mapping Optional Map the KSBs covered by each session. Open " [ref=e514] [cursor=pointer]:
          - generic [ref=e516]: 
          - generic [ref=e517]:
            - generic [ref=e518]:
              - generic [ref=e519]: Session KSB Mapping
              - generic [ref=e520]: Optional
            - generic [ref=e521]: Map the KSBs covered by each session.
          - generic [ref=e522]:
            - text: Open
            - generic [ref=e523]: 
      - generic [ref=e524]:
        - button "Cancel" [ref=e525] [cursor=pointer]
        - button " Save" [ref=e526] [cursor=pointer]:
          - generic [ref=e527]: 
          - text: Save
```

# Test source

```ts
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
  79  |   await expect(page.getByText('Manual match saved. The comparison is shown below.', { exact: true })).toBeVisible();
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
  118 |   await page.locator('[data-timeline-block-id="b101"]').click();
  119 |   await page.getByRole('button', { name: /Edit schedule assignment/ }).click();
  120 |   await expect(page.getByRole('heading', { name: 'Edit Module', exact: true })).toBeVisible();
  121 |   await page.getByText('Compare with LMS modules', { exact: true }).click();
  122 |   await expect(page.getByLabel('Current module to match', { exact: true })).toBeDisabled();
  123 |   await expect(page.getByLabel('Current module to match', { exact: true })).toHaveValue(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  124 |   await page.getByLabel('LMS module to match', { exact: true }).selectOption('chosen');
  125 |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  126 |   await expect(page.getByText('Manual match saved. The comparison is shown below.', { exact: true })).toBeVisible();
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
> 161 |   expect(Math.abs(mobileLeft.y - mobileRight.y)).toBeLessThan(3);
      |                                                  ^ Error: expect(received).toBeLessThan(expected)
  162 |   const scroll = page.getByRole('region', { name: 'Module comparison details' });
  163 |   expect(await scroll.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  164 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  165 |   expect(api.writes).toEqual([]);
  166 |   expect(api.errors).toEqual([]);
  167 | });
  168 | 
```