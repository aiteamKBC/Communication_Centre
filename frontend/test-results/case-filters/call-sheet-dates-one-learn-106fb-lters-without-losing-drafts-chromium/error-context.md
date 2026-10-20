# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: call-sheet-dates.spec.ts >> one learner opens lectures, MCM, PR and other cases across filters without losing drafts
- Location: tests\ui\call-sheet-dates.spec.ts:145:1

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.click: Test timeout of 45000ms exceeded.
Call log:
  - waiting for getByRole('link', { name: 'Due (1)', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - complementary "Engagement Centre navigation" [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e8]: KBC
      - generic [ref=e9]:
        - strong [ref=e10]: Engagement Centre
        - generic [ref=e11]: Kent Business College
    - navigation [ref=e12]:
      - generic [ref=e13]:
        - paragraph [ref=e14]: My calling day
        - button "Next call" [ref=e15] [cursor=pointer]:
          - img [ref=e16]
          - generic [ref=e18]: Next call
        - button "Missed (2)" [ref=e19] [cursor=pointer]:
          - img [ref=e20]
          - generic [ref=e22]: Missed (2)
        - button "Due (1)" [ref=e23] [cursor=pointer]:
          - img [ref=e24]
          - generic [ref=e26]: Due (1)
        - button "Next Day (0)" [ref=e27] [cursor=pointer]:
          - img [ref=e28]
          - generic [ref=e30]: Next Day (0)
        - button "Learner Satisfaction (0)" [ref=e31] [cursor=pointer]:
          - img [ref=e32]
          - generic [ref=e34]: Learner Satisfaction (0)
        - button "Employer Satisfaction (1)" [ref=e35] [cursor=pointer]:
          - img [ref=e36]
          - generic [ref=e38]: Employer Satisfaction (1)
        - button "Extra Calls by Manager (0)" [ref=e39] [cursor=pointer]:
          - img [ref=e40]
          - generic [ref=e42]: Extra Calls by Manager (0)
        - button "Technical issues (0)" [ref=e43] [cursor=pointer]:
          - img [ref=e44]
          - generic [ref=e46]: Technical issues (0)
        - button "Coach booking links" [ref=e47] [cursor=pointer]:
          - img [ref=e48]
          - generic [ref=e50]: Coach booking links
        - button "Follow-ups" [ref=e51] [cursor=pointer]:
          - img [ref=e52]
          - generic [ref=e54]: Follow-ups
        - button "Monthly achievements" [ref=e55] [cursor=pointer]:
          - img [ref=e56]
          - generic [ref=e58]: Monthly achievements
        - button "My progress" [ref=e59] [cursor=pointer]:
          - img [ref=e60]
          - generic [ref=e62]: My progress
        - button "My call reviews" [ref=e63] [cursor=pointer]:
          - img [ref=e64]
          - generic [ref=e66]: My call reviews
        - button "Reports" [ref=e67] [cursor=pointer]:
          - img [ref=e68]
          - generic [ref=e70]: Reports
      - generic [ref=e71]:
        - paragraph [ref=e72]: Engagement
        - button "Zoom Phone" [ref=e73] [cursor=pointer]:
          - img [ref=e74]
          - generic [ref=e76]: Zoom Phone
    - generic [ref=e77]:
      - text: Signed in as
      - strong [ref=e78]: operator@example.org
  - generic [ref=e79]:
    - banner [ref=e80]:
      - button "Toggle navigation" [expanded] [ref=e81] [cursor=pointer]:
        - img [ref=e82]
      - link "Back to dashboard" [ref=e84] [cursor=pointer]:
        - /url: /dashboard
        - img [ref=e85]
        - generic [ref=e87]: Back to dashboard
      - generic [ref=e88]:
        - generic "Europe/London — adjusts automatically for British Summer Time" [ref=e89]: "All times: London"
        - generic [ref=e90]: operator@example.org
        - button "Sign out" [ref=e91] [cursor=pointer]:
          - img [ref=e92]
          - generic [ref=e94]: Sign out
    - main [ref=e95]:
      - generic [ref=e98]:
        - paragraph [ref=e99]: "Workspace: Operator. Showing this specialist's allocated contacts plus the shared queue. Last successful cycle: Not recorded."
        - alert [ref=e100]: Synchronization is overdue or has not completed. Refresh only reloads saved cases; it does not run synchronization.
        - generic [ref=e101]:
          - generic [ref=e102]:
            - paragraph [ref=e103]: 20 Oct 2026 · Operator
            - heading "Missed" [level=1] [ref=e104]
          - button "Refresh" [ref=e106] [cursor=pointer]
        - generic [ref=e107]:
          - generic [ref=e108]:
            - generic "Only Zoom-verified calls started from this system count." [ref=e109]: Connected call time
            - strong [ref=e110]:
              - text: 0h 0m
              - generic [ref=e111]: / 3h 0m
            - progressbar "Daily connected call time" [ref=e112]
          - generic [ref=e113]:
            - generic [ref=e114]: Connections
            - strong [ref=e115]: "0"
          - generic [ref=e116]:
            - generic [ref=e117]: Points today
            - strong [ref=e118]:
              - text: "0"
              - generic [ref=e119]: / 300
          - generic [ref=e120]:
            - generic [ref=e121]: Call quality this month
            - strong [ref=e122]:
              - text: Unscored
              - generic [ref=e123]: 0 calls today
        - status [ref=e124]: Zoom Phone opened. Record the outcome once Zoom reports the call.
        - generic [ref=e125]:
          - paragraph [ref=e126]: Missed lectures, reviews that were booked but are not completed, and finished reviews waiting for a signature. Agree a catch-up or a new review time; for a signature, ask the learner to sign in the LMS (nothing to book).
          - navigation "Call types" [ref=e127]:
            - button "All (2)" [pressed] [ref=e128] [cursor=pointer]
            - button "Missed session (2)" [ref=e129] [cursor=pointer]
            - button "Missed monthly coaching (0)" [ref=e130] [cursor=pointer]
            - button "Missed progress review (0)" [ref=e131] [cursor=pointer]
            - button "Missing signature (0)" [ref=e132] [cursor=pointer]
          - generic [ref=e133]:
            - searchbox "Search the call sheet" [ref=e134]
            - combobox "Filter call reason" [ref=e135]:
              - option "All call reasons" [selected]
              - option "Missed lecture"
            - combobox "Follow-up timing" [ref=e136]:
              - option "All active" [selected]
              - option "Due now"
            - combobox "Ticket order" [ref=e137]:
              - option "Priority order" [selected]
              - option "Oldest first"
              - option "Newest first"
            - group "Ticket date filter" [ref=e138]:
              - combobox "Date filter" [ref=e139]:
                - option "All dates"
                - option "Specific day" [selected]
                - option "Date range"
              - generic [ref=e140]:
                - text: Day
                - textbox "Ticket date" [ref=e141]: 2026-09-15
              - button "Clear dates" [ref=e142] [cursor=pointer]
          - group "Coach, cohort and module filters" [ref=e143]:
            - generic [ref=e144]:
              - text: Coach
              - combobox "Filter by coach" [ref=e145]:
                - option "All coaches" [selected]
                - option "Test Coach"
            - generic [ref=e146]:
              - text: Cohort
              - combobox "Filter by cohort" [ref=e147]:
                - option "All cohorts" [selected]
                - option "Not recorded"
            - generic [ref=e148]:
              - text: Module
              - combobox "Filter by module" [ref=e149]:
                - option "All modules" [selected]
                - option "Not recorded"
          - paragraph [ref=e150]: Date filters and oldest / newest use the issue date, then the appointment date or ticket opened date if unavailable. Dates are UK calendar days; a range includes both days. Tickets with unsaved edits stay selected for their contact.
          - paragraph [ref=e151]: Call, update the row, then Save. Zoom Phone opens with your caller ID; keep the Zoom desktop app signed in. An outcome is saved against the call Zoom reports, so save once the call has synced.
          - generic [ref=e152]:
            - paragraph [ref=e153]: This section contains 3 open tickets across 2 contacts before the filters below. A contact can have multiple tickets.
            - generic [ref=e154]:
              - text: 1–2 of 2 contacts · Priority order · One row per contact
              - generic [ref=e155]: Tab between fields · Ctrl/⌘ + Enter to save a row
            - region "Quick call register" [ref=e156]:
              - table "Learner calls. Edit the outcome, notes and follow-up date, then save that row." [ref=e157]:
                - caption [ref=e158]: Learner calls. Edit the outcome, notes and follow-up date, then save that row.
                - rowgroup [ref=e159]:
                  - row "Learner / phone Call reason / coach Call Booking Outcome Notes / agreed action Follow-up Save" [ref=e160]:
                    - columnheader "Learner / phone" [ref=e161]
                    - columnheader "Call reason / coach" [ref=e162]
                    - columnheader "Call" [ref=e163]
                    - columnheader "Booking" [ref=e164]
                    - columnheader "Outcome" [ref=e165]
                    - columnheader "Notes / agreed action" [ref=e166]
                    - columnheader "Follow-up" [ref=e167]
                    - columnheader "Save" [ref=e168]
                - rowgroup [ref=e169]:
                  - 'row "Same Learner +447700900123 All cases (5) Report technical issue Missed lecture Test Coach Risk management Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Same Learner Test Coach Choose outcome… London time Quick follow-up dates for Same Learner Save" [ref=e170]':
                    - rowheader "Same Learner +447700900123 All cases (5) Report technical issue" [ref=e171]:
                      - strong [ref=e172]: Same Learner
                      - generic [ref=e173]: "+447700900123"
                      - button "All cases (5)" [active] [ref=e174] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e176]
                      - group [ref=e177]:
                        - generic "Contact details" [ref=e178] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Risk management Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e179]':
                      - strong [ref=e180]: Missed lecture
                      - generic [ref=e181]: Test Coach
                      - generic [ref=e182]: Risk management
                      - generic [ref=e183]:
                        - generic [ref=e184]:
                          - text: "Missed lecture date:"
                          - time [ref=e185]: 15 Sept 2026
                        - generic [ref=e186]: "Lecture time: Not recorded in source"
                        - generic [ref=e187]:
                          - text: "Ticket opened:"
                          - time [ref=e188]: 1 Oct 2026
                        - generic [ref=e189]:
                          - text: "Call due by:"
                          - time [ref=e190]: 20 Sept 2026
                      - generic [ref=e191]: Due now
                      - button "Full case" [ref=e192] [cursor=pointer]
                    - cell "Call Same Learner" [ref=e193]:
                      - button "Call Same Learner" [ref=e195] [cursor=pointer]: Call
                    - cell "Test Coach" [ref=e196]:
                      - strong [ref=e197]: Test Coach
                    - cell "Choose outcome…" [ref=e198]:
                      - combobox "Outcome for Same Learner" [ref=e199]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e200]:
                      - textbox "Notes and action for Same Learner" [ref=e201]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Same Learner" [ref=e202]:
                      - generic [ref=e203]: London time
                      - textbox "Follow-up date and time for Same Learner" [ref=e204]
                      - generic "Quick follow-up dates for Same Learner" [ref=e205]:
                        - button "+3 days" [ref=e206] [cursor=pointer]
                        - button "+5 days" [ref=e207] [cursor=pointer]
                    - cell "Save" [ref=e208]:
                      - button "Save" [disabled] [ref=e209]
                      - status
                  - 'row "Another learner No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Another learner No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Another learner Save" [ref=e210]':
                    - rowheader "Another learner No phone recorded All cases (1) Report technical issue" [ref=e211]:
                      - strong [ref=e212]: Another learner
                      - generic [ref=e213]: No phone recorded
                      - button "All cases (1)" [ref=e214] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e216]
                      - group [ref=e217]:
                        - generic "Contact details" [ref=e218] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e219]':
                      - strong [ref=e220]: Missed lecture
                      - generic [ref=e221]: Test Coach
                      - generic [ref=e222]: Test lecture
                      - generic [ref=e223]:
                        - generic [ref=e224]:
                          - text: "Missed lecture date:"
                          - time [ref=e225]: 15 Sept 2026
                        - generic [ref=e226]: "Lecture time: Not recorded in source"
                        - generic [ref=e227]:
                          - text: "Ticket opened:"
                          - time [ref=e228]: 1 Oct 2026
                        - generic [ref=e229]:
                          - text: "Call due by:"
                          - time [ref=e230]: 20 Sept 2026
                      - generic [ref=e231]: Due now
                      - button "Full case" [ref=e232] [cursor=pointer]
                    - cell "Call Another learner No number recorded" [ref=e233]:
                      - button "Call Another learner" [disabled] [ref=e235]: Call
                      - generic [ref=e236]: No number recorded
                    - cell "Test Coach" [ref=e237]:
                      - strong [ref=e238]: Test Coach
                    - cell "Choose outcome…" [ref=e239]:
                      - combobox "Outcome for Another learner" [ref=e240]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e241]:
                      - textbox "Notes and action for Another learner" [ref=e242]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Another learner" [ref=e243]:
                      - generic [ref=e244]: London time
                      - textbox "Follow-up date and time for Another learner" [ref=e245]
                      - generic "Quick follow-up dates for Another learner" [ref=e246]:
                        - button "+3 days" [ref=e247] [cursor=pointer]
                        - button "+5 days" [ref=e248] [cursor=pointer]
                    - cell "Save" [ref=e249]:
                      - button "Save" [disabled] [ref=e250]
                      - status
            - navigation "Ticket pages" [ref=e251]:
              - button "Previous page" [disabled] [ref=e252]
              - generic [ref=e253]:
                - text: Page
                - combobox "Ticket page" [ref=e254]:
                  - option "1" [selected]
                - text: of 1
              - button "Next page" [disabled] [ref=e255]
              - generic [ref=e256]: 20 contacts per page
```

# Test source

```ts
  89  |   cases.push(ticket(30, { ...fields('Coach B', 'Cohort 2', 'Finance'),
  90  |     learner_email: 'learner1@example.org', learner_name: 'Learner 1' }));
  91  |   cases.push(ticket(31, fields('Coach B', 'Cohort 1', 'Finance')));
  92  |   cases.push(ticket(32, fields('', '', '')));
  93  |   const writes = await openSheet(page, cases);
  94  |   await page.getByLabel('Notes and action for Learner 1', { exact: true }).fill('Keep these notes on the Marketing ticket.');
  95  |   await page.getByRole('button', { name: 'Next page', exact: true }).click();
  96  |   await page.getByLabel('Filter by coach', { exact: true }).selectOption({ label: 'Coach B' });
  97  |   expect(await rowIds(page)).toEqual([30, 31]);
  98  |   await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 2' });
  99  |   await page.getByLabel('Filter by module', { exact: true }).selectOption({ label: 'Finance' });
  100 |   expect(await rowIds(page)).toEqual([30]);
  101 |   await page.getByLabel('Search the call sheet').fill('nobody');
  102 |   expect(await rowIds(page)).toEqual([]);
  103 |   await page.getByLabel('Search the call sheet').fill('');
  104 |   await page.getByLabel('Filter by module', { exact: true }).selectOption({ label: 'Marketing' });
  105 |   expect(await rowIds(page)).toEqual([]);
  106 |   await page.getByRole('button', { name: 'Clear coach / cohort / module', exact: true }).click();
  107 |   await expect(page.locator('[data-sheet-row="1"] textarea')).toHaveValue('Keep these notes on the Marketing ticket.');
  108 |   await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Not recorded' });
  109 |   expect(await rowIds(page)).toEqual([32]);
  110 |   expect(writes.filter(path => path.startsWith('/api/callcentre/'))).toEqual([]);
  111 | });
  112 | 
  113 | for (const [section, source] of [
  114 |   ['due', 'pr'], ['nextday', 'reminder'], ['learner_satisfaction', 'learner_satisfaction'],
  115 |   ['employer_satisfaction', 'employer_feedback'], ['manager', 'manual'], ['tech', 'tech_support'],
  116 | ]) {
  117 |   test(`${section} supports coach, cohort and module filters`, async ({ page }) => {
  118 |     await openSheet(page, [
  119 |       ticket(1, { source_type: source, booking_at: '2026-10-21T10:00:00Z',
  120 |         filter_contexts: [{ coach: 'Coach A', cohort: 'Cohort 1', module: 'Module A' }] }),
  121 |       ticket(2, { source_type: source, booking_at: '2026-10-21T10:00:00Z',
  122 |         filter_contexts: [{ coach: 'Coach B', cohort: 'Cohort 2', module: 'Module B' }] }),
  123 |     ], section);
  124 |     await page.getByLabel('Filter by coach', { exact: true }).selectOption({ label: 'Coach B' });
  125 |     await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 2' });
  126 |     await page.getByLabel('Filter by module', { exact: true }).selectOption({ label: 'Module B' });
  127 |     expect(await rowIds(page)).toEqual([2]);
  128 |   });
  129 | }
  130 | 
  131 | test('employer filters must match the same learner', async ({ page }) => {
  132 |   await openSheet(page, [
  133 |     ticket(1, { source_type: 'employer_feedback', filter_contexts: [
  134 |       { coach: 'Coach A', cohort: 'Cohort 1', module: '' },
  135 |       { coach: 'Coach B', cohort: 'Cohort 2', module: '' },
  136 |     ] }),
  137 |   ], 'employer_satisfaction');
  138 |   await page.getByLabel('Filter by coach', { exact: true }).selectOption({ label: 'Coach A' });
  139 |   await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 2' });
  140 |   expect(await rowIds(page)).toEqual([]);
  141 |   await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 1' });
  142 |   expect(await rowIds(page)).toEqual([1]);
  143 | });
  144 | 
  145 | test('Next call and Follow-ups use the same filters and can recover from an empty result', async ({ page }) => {
  146 |   await openSheet(page, [
  147 |     ticket(1, { learner_phone: '+447700900001',
  148 |       filter_contexts: [{ coach: 'Coach A', cohort: 'Cohort 1', module: 'Marketing' }] }),
  149 |     ticket(2, { learner_phone: '+447700900002',
  150 |       filter_contexts: [{ coach: 'Coach B', cohort: 'Cohort 2', module: 'Finance' }] }),
  151 |   ]);
  152 |   await page.getByRole('button', { name: 'Next call', exact: true }).click();
  153 |   await page.getByLabel('Filter by coach', { exact: true }).selectOption({ label: 'Coach B' });
  154 |   await expect(page.locator('.ed-next-name')).toHaveText('Learner 2');
  155 |   await page.getByLabel('Filter by module', { exact: true }).selectOption({ label: 'Marketing' });
  156 |   await expect(page.getByRole('heading', { name: 'Nobody else to call right now', exact: true })).toBeVisible();
  157 |   await page.getByRole('button', { name: 'Clear coach / cohort / module', exact: true }).click();
  158 |   await expect(page.locator('.ed-next-name')).toHaveText('Learner 1');
  159 |   await page.getByRole('button', { name: 'Follow-ups', exact: true }).click();
  160 |   await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 2' });
  161 |   await expect(page.locator('.ed-person')).toHaveCount(1);
  162 |   await expect(page.locator('.ed-person')).toContainText('Learner 2');
  163 | });
  164 | 
  165 | test('one learner opens lectures, MCM, PR and other cases across filters without losing drafts', async ({ page }) => {
  166 |   await page.setViewportSize({ width: 1600, height: 1000 });
  167 |   const person = { learner_email: 'same@example.org', learner_name: 'Same Learner', learner_phone: '+447700900123' };
  168 |   const cases = [
  169 |     ticket(1, { ...person, issue_name: 'Risk management' }),
  170 |     ticket(2, { ...person, issue_name: 'Risk management', issue_date: '2026-09-01' }),
  171 |     ticket(3, { ...person, source_type: 'mcm', issue_name: 'Monthly coaching', issue_date: '2026-10-01' }),
  172 |     ticket(4, { ...person, source_type: 'pr', issue_name: 'Progress review', issue_date: '2026-10-05' }),
  173 |     ticket(5, { ...person, source_type: 'epa', issue_name: 'EPA preparation' }),
  174 |     ticket(6, { ...person, source_type: 'employer_feedback', learner_name: 'Same person as employer' }),
  175 |     ticket(7, { learner_name: 'Another learner' }),
  176 |   ];
  177 |   const writes = await openSheet(page, cases);
  178 |   await page.getByLabel('Date filter', { exact: true }).selectOption('day');
  179 |   await page.getByLabel('Ticket date', { exact: true }).fill('2026-09-15');
  180 |   const row = page.locator('[data-sheet-row="1"]');
  181 |   await row.getByRole('button', { name: 'All cases (5)', exact: true }).click();
  182 |   const modal = page.getByRole('dialog', { name: 'Full case', exact: true });
  183 |   const list = modal.getByRole('region', { name: 'All cases for this contact' });
  184 |   await expect(list.getByRole('heading', { name: 'All cases (5)', exact: true })).toBeVisible();
  185 |   await expect(list.locator('[data-contact-case]')).toHaveCount(5);
  186 |   await expect(list).toContainText('Lectures · Risk management');
  187 |   await expect(list).toContainText('Monthly coaching (MCM)');
  188 |   await expect(list).toContainText('Progress reviews (PR)');
> 189 |   await expect(list.locator('[data-contact-case="2"]')).toContainText('1 Sept 2026');
      |                                                                  ^ Error: locator.click: Test timeout of 45000ms exceeded.
  190 |   await expect(list.locator('[data-contact-case="6"]')).toHaveCount(0);
  191 |   await expect(list.locator('[data-contact-case="7"]')).toHaveCount(0);
  192 |   const note = modal.getByRole('textbox', { name: 'Outcome and agreed action', exact: true });
  193 |   await note.fill('Discuss every missed lecture during this single conversation.');
  194 |   await list.locator('[data-contact-case="3"]').click();
  195 |   await note.fill('Monthly coaching needs a separate agreed action.');
  196 |   await list.locator('[data-contact-case="4"]').click();
  197 |   await expect(modal.getByText('Review due: 5 Oct 2026', { exact: true })).toBeVisible();
  198 |   await list.locator('[data-contact-case="1"]').click();
  199 |   await expect(note).toHaveValue('Discuss every missed lecture during this single conversation.');
  200 |   await list.locator('[data-contact-case="3"]').click();
  201 |   await expect(note).toHaveValue('Monthly coaching needs a separate agreed action.');
  202 |   await page.screenshot({ path: test.info().outputPath('all-learner-cases.png') });
  203 |   // One dial request covers the learner; switching cases must not place another call.
  204 |   await modal.getByRole('button', { name: 'Call learner', exact: true }).click();
  205 |   await list.locator('[data-contact-case="4"]').click();
  206 |   expect(writes.filter(path => path.endsWith('/call/'))).toEqual(['/api/callcentre/tickets/3/call/']);
  207 |   await modal.getByRole('button', { name: 'Close full case', exact: true }).click();
  208 |   await expect(page.getByLabel('Ticket date', { exact: true })).toHaveValue('2026-09-15');
  209 |   await page.getByRole('button', { name: 'Due (1)', exact: true }).click();
  210 |   await expect(page.locator('[data-sheet-row]')).toHaveCount(1);
  211 |   await page.getByRole('button', { name: 'All cases (5)', exact: true }).click();
  212 |   await expect(page.locator('[data-contact-case]')).toHaveCount(5);
  213 | });
  214 | 
  215 | test.describe('London times on a Cairo computer', () => {
  216 |   test.use({ timezoneId: 'Africa/Cairo' });
  217 | 
  218 |   for (const [instant, expected] of [
  219 |     ['2026-10-20T12:00:00Z', '20/10/2026, 13:00:00'],
  220 |     ['2026-12-20T12:00:00Z', '20/12/2026, 12:00:00'],
  221 |   ]) {
  222 |     test(`sync display follows London daylight saving for ${instant}`, async ({ page }) => {
  223 |       await openSheet(page, [ticket(1)], 'missed', instant);
  224 |       await expect(page.getByText('All times: London', { exact: true })).toBeVisible();
  225 |       await expect(page.getByText(/Last successful cycle:/)).toContainText(`Last successful cycle: ${expected} (London)`);
  226 |       const displayed = await page.evaluate(async () => {
  227 |         const path = '/src/pages/call-centre/engagement/model.ts';
  228 |         const { longDate, shortDate, when, londonInput } = await import(path);
  229 |         return {
  230 |           day: longDate('2026-10-20T00:30'),
  231 |           short: shortDate('2026-10-20T00:30'),
  232 |           time: when('2026-10-20T00:30'),
  233 |           saved: londonInput('2026-10-20T00:30').toISOString(),
  234 |         };
  235 |       });
  236 |       expect(displayed).toEqual({
  237 |         day: '20 Oct 2026', short: '20 Oct', time: '20/10/2026, 00:30:00',
  238 |         saved: '2026-10-19T23:30:00.000Z',
  239 |       });
  240 |     });
  241 |   }
  242 | });
  243 | 
  244 | test('oldest/newest uses issue dates, chooses the matching ticket per contact, and preserves priority', async ({ page }) => {
  245 |   const writes = await openSheet(page, [
  246 |     ticket(1, { issue_date: '2026-09-20' }),
  247 |     ticket(2, { issue_date: '2026-09-10', source_type: 'mcm_missed', issue_name: 'Monthly review' }),
  248 |     ticket(3, { issue_date: '2026-09-30', source_type: 'pr_missed', issue_name: 'Progress review' }),
  249 |     ticket(4, { learner_email: 'learner1@example.org', learner_name: 'Learner 1', issue_date: '2026-09-01' }),
  250 |   ]);
  251 |   expect(await rowIds(page)).toEqual([1, 2, 3]);
  252 |   await page.getByLabel('Ticket order', { exact: true }).selectOption('oldest');
  253 |   expect(await rowIds(page)).toEqual([4, 2, 3]);
  254 |   await expect(page.locator('.ed-sheet-count')).toContainText('Oldest first');
  255 |   await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
  256 |   expect(await rowIds(page)).toEqual([3, 1, 2]);
  257 |   await page.getByLabel('Ticket order', { exact: true }).selectOption('priority');
  258 |   expect(await rowIds(page)).toEqual([1, 2, 3]);
  259 |   expect(writes.filter(path => path.startsWith('/api/callcentre/'))).toEqual([]);
  260 | });
  261 | 
  262 | test('every missed-ticket type and other tickets display source and opened dates', async ({ page }) => {
  263 |   await page.setViewportSize({ width: 1600, height: 1000 });
  264 |   await openSheet(page, [
  265 |     ticket(1),
  266 |     ticket(2, { source_type: 'mcm_missed', issue_date: '2026-09-12' }),
  267 |     ticket(3, { source_type: 'pr_missed', issue_date: '2026-09-13' }),
  268 |     ticket(4, { source_type: 'signature', issue_date: '2026-09-14' }),
  269 |     ticket(5, { learner_email: 'learner1@example.org', issue_date: '2026-09-02' }),
  270 |   ]);
  271 |   for (const [id, day] of [[1, 15], [2, 12], [3, 13], [4, 14]]) {
  272 |     const row = page.locator(`[data-sheet-row="${id}"]`);
  273 |     await expect(row.getByText(`${id === 1 ? 'Missed lecture date' : 'Issue date'}: ${day} Sept 2026`, { exact: true })).toBeVisible();
  274 |     await expect(row.getByText('Ticket opened: 1 Oct 2026', { exact: true }).first()).toBeVisible();
  275 |   }
  276 |   await page.getByText('Other matching tickets (1)', { exact: true }).click();
  277 |   await expect(page.locator('[data-related-ticket="5"]')).toContainText('Missed lecture date: 2 Sept 2026');
  278 |   await page.screenshot({ path: test.info().outputPath('ticket-dates.png'), fullPage: true });
  279 |   await page.locator('[data-sheet-row="2"]').getByRole('button', { name: 'Full case', exact: true }).click();
  280 |   await expect(page.locator('.ed-learner').getByText('Issue date: 12 Sept 2026', { exact: true })).toBeVisible();
  281 |   await expect(page.locator('.ed-learner').getByText('Ticket opened: 1 Oct 2026', { exact: true })).toBeVisible();
  282 | });
  283 | 
  284 | test('missed lecture shows London schedule separately from ticket dates, including missing and ambiguous times', async ({ page }) => {
  285 |   await openSheet(page, [
  286 |     ticket(1, { issue_date: '2026-10-16', missed_lecture: {
  287 |       module: 'Commercial Intelligence', title: 'Commercial Intelligence lecture', date: '2026-10-16',
  288 |       starts_at: '2026-10-16T11:00:00Z', ends_at: '2026-10-16T13:00:00Z', time_status: 'matched',
  289 |     } }),
```