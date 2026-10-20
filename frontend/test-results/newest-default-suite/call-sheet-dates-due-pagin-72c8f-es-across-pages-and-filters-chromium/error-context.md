# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: call-sheet-dates.spec.ts >> due paginates twenty contacts and retains notes across pages and filters
- Location: tests\ui\call-sheet-dates.spec.ts:384:3

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.fill: Test timeout of 45000ms exceeded.
Call log:
  - waiting for getByLabel('Notes and action for Learner 1', { exact: true })

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
        - button "Due (45)" [ref=e19] [cursor=pointer]:
          - img [ref=e20]
          - generic [ref=e22]: Due (45)
        - button "Next Day (0)" [ref=e23] [cursor=pointer]:
          - img [ref=e24]
          - generic [ref=e26]: Next Day (0)
        - button "Missed (0)" [ref=e27] [cursor=pointer]:
          - img [ref=e28]
          - generic [ref=e30]: Missed (0)
        - button "Learner Satisfaction (0)" [ref=e31] [cursor=pointer]:
          - img [ref=e32]
          - generic [ref=e34]: Learner Satisfaction (0)
        - button "Employer Satisfaction (0)" [ref=e35] [cursor=pointer]:
          - img [ref=e36]
          - generic [ref=e38]: Employer Satisfaction (0)
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
            - heading "Due" [level=1] [ref=e104]
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
        - status
        - generic [ref=e124]:
          - paragraph [ref=e125]: "Progress reviews and monthly coaching that are due but not booked yet: send the booking email. EPA: learners past their end date; check their gateway and EPA position and agree the next step."
          - navigation "Call types" [ref=e126]:
            - button "All (45)" [pressed] [ref=e127] [cursor=pointer]
            - button "Monthly coaching (0)" [ref=e128] [cursor=pointer]
            - button "Progress review (45)" [ref=e129] [cursor=pointer]
            - button "EPA (0)" [ref=e130] [cursor=pointer]
          - generic [ref=e131]:
            - searchbox "Search the call sheet" [ref=e132]
            - combobox "Filter call reason" [ref=e133]:
              - option "All call reasons" [selected]
              - option "Progress review overdue"
            - combobox "Follow-up timing" [ref=e134]:
              - option "All active" [selected]
              - option "Due now"
            - combobox "Ticket order" [ref=e135]:
              - option "Priority order"
              - option "Oldest first"
              - option "Newest first" [selected]
            - group "Ticket date filter" [ref=e136]:
              - combobox "Date filter" [ref=e137]:
                - option "All dates" [selected]
                - option "Specific day"
                - option "Date range"
          - group "Coach, cohort and module filters" [ref=e138]:
            - generic [ref=e139]:
              - text: Coach
              - combobox "Filter by coach" [ref=e140]:
                - option "All coaches" [selected]
                - option "Test Coach"
            - generic [ref=e141]:
              - text: Cohort
              - combobox "Filter by cohort" [ref=e142]:
                - option "All cohorts" [selected]
                - option "Not recorded"
            - generic [ref=e143]:
              - text: Module
              - combobox "Filter by module" [ref=e144]:
                - option "All modules" [selected]
                - option "Not recorded"
          - paragraph [ref=e145]: Date filters and oldest / newest use the issue date, then the appointment date or ticket opened date if unavailable. Dates are UK calendar days; a range includes both days. Tickets with unsaved edits stay selected for their contact.
          - paragraph [ref=e146]: Call, update the row, then Save. Zoom Phone opens with your caller ID; keep the Zoom desktop app signed in. An outcome is saved against the call Zoom reports, so save once the call has synced.
          - generic [ref=e147]:
            - paragraph [ref=e148]: This section contains 45 open tickets across 45 contacts before the filters below. A contact can have multiple tickets.
            - generic [ref=e149]:
              - text: 1–20 of 45 contacts · Newest first · One row per contact
              - generic [ref=e150]: Tab between fields · Ctrl/⌘ + Enter to save a row
            - region "Quick call register" [ref=e151]:
              - table "Learner calls. Edit the outcome, notes and follow-up date, then save that row." [ref=e152]:
                - caption [ref=e153]: Learner calls. Edit the outcome, notes and follow-up date, then save that row.
                - rowgroup [ref=e154]:
                  - row "Learner / phone Call reason / coach Call Booking Outcome Notes / agreed action Follow-up Save" [ref=e155]:
                    - columnheader "Learner / phone" [ref=e156]
                    - columnheader "Call reason / coach" [ref=e157]
                    - columnheader "Call" [ref=e158]
                    - columnheader "Booking" [ref=e159]
                    - columnheader "Outcome" [ref=e160]
                    - columnheader "Notes / agreed action" [ref=e161]
                    - columnheader "Follow-up" [ref=e162]
                    - columnheader "Save" [ref=e163]
                - rowgroup [ref=e164]:
                  - 'row "Learner 28 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 28 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 28 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 28 Save" [ref=e165]':
                    - rowheader "Learner 28 No phone recorded All cases (1) Report technical issue" [ref=e166]:
                      - strong [ref=e167]: Learner 28
                      - generic [ref=e168]: No phone recorded
                      - button "All cases (1)" [ref=e169] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e171]
                      - group [ref=e172]:
                        - generic "Contact details" [ref=e173] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 28 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e174]':
                      - strong [ref=e175]: "Progress review overdue: Test lecture"
                      - generic [ref=e176]: Test Coach
                      - generic [ref=e177]:
                        - generic [ref=e178]:
                          - text: "Review due:"
                          - time [ref=e179]: 28 Sept 2026
                        - generic [ref=e180]:
                          - text: "Ticket opened:"
                          - time [ref=e181]: 1 Oct 2026
                        - generic [ref=e182]:
                          - text: "Call due by:"
                          - time [ref=e183]: 20 Sept 2026
                      - generic [ref=e184]: Due now
                      - button "Full case" [ref=e185] [cursor=pointer]
                    - cell "Call Learner 28 No number recorded" [ref=e186]:
                      - button "Call Learner 28" [disabled] [ref=e188]: Call
                      - generic [ref=e189]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e190]:
                      - strong [ref=e191]: Test Coach
                      - generic [ref=e192]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e193]:
                      - combobox "Outcome for Learner 28" [ref=e194]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e195]:
                      - textbox "Notes and action for Learner 28" [ref=e196]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 28" [ref=e197]:
                      - generic [ref=e198]: London time
                      - textbox "Follow-up date and time for Learner 28" [ref=e199]
                      - generic "Quick follow-up dates for Learner 28" [ref=e200]:
                        - button "+3 days" [ref=e201] [cursor=pointer]
                        - button "+5 days" [ref=e202] [cursor=pointer]
                    - cell "Save" [ref=e203]:
                      - button "Save" [disabled] [ref=e204]
                      - status
                  - 'row "Learner 27 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 27 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 27 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 27 Save" [ref=e205]':
                    - rowheader "Learner 27 No phone recorded All cases (1) Report technical issue" [ref=e206]:
                      - strong [ref=e207]: Learner 27
                      - generic [ref=e208]: No phone recorded
                      - button "All cases (1)" [ref=e209] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e211]
                      - group [ref=e212]:
                        - generic "Contact details" [ref=e213] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 27 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e214]':
                      - strong [ref=e215]: "Progress review overdue: Test lecture"
                      - generic [ref=e216]: Test Coach
                      - generic [ref=e217]:
                        - generic [ref=e218]:
                          - text: "Review due:"
                          - time [ref=e219]: 27 Sept 2026
                        - generic [ref=e220]:
                          - text: "Ticket opened:"
                          - time [ref=e221]: 1 Oct 2026
                        - generic [ref=e222]:
                          - text: "Call due by:"
                          - time [ref=e223]: 20 Sept 2026
                      - generic [ref=e224]: Due now
                      - button "Full case" [ref=e225] [cursor=pointer]
                    - cell "Call Learner 27 No number recorded" [ref=e226]:
                      - button "Call Learner 27" [disabled] [ref=e228]: Call
                      - generic [ref=e229]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e230]:
                      - strong [ref=e231]: Test Coach
                      - generic [ref=e232]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e233]:
                      - combobox "Outcome for Learner 27" [ref=e234]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e235]:
                      - textbox "Notes and action for Learner 27" [ref=e236]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 27" [ref=e237]:
                      - generic [ref=e238]: London time
                      - textbox "Follow-up date and time for Learner 27" [ref=e239]
                      - generic "Quick follow-up dates for Learner 27" [ref=e240]:
                        - button "+3 days" [ref=e241] [cursor=pointer]
                        - button "+5 days" [ref=e242] [cursor=pointer]
                    - cell "Save" [ref=e243]:
                      - button "Save" [disabled] [ref=e244]
                      - status
                  - 'row "Learner 26 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 26 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 26 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 26 Save" [ref=e245]':
                    - rowheader "Learner 26 No phone recorded All cases (1) Report technical issue" [ref=e246]:
                      - strong [ref=e247]: Learner 26
                      - generic [ref=e248]: No phone recorded
                      - button "All cases (1)" [ref=e249] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e251]
                      - group [ref=e252]:
                        - generic "Contact details" [ref=e253] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 26 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e254]':
                      - strong [ref=e255]: "Progress review overdue: Test lecture"
                      - generic [ref=e256]: Test Coach
                      - generic [ref=e257]:
                        - generic [ref=e258]:
                          - text: "Review due:"
                          - time [ref=e259]: 26 Sept 2026
                        - generic [ref=e260]:
                          - text: "Ticket opened:"
                          - time [ref=e261]: 1 Oct 2026
                        - generic [ref=e262]:
                          - text: "Call due by:"
                          - time [ref=e263]: 20 Sept 2026
                      - generic [ref=e264]: Due now
                      - button "Full case" [ref=e265] [cursor=pointer]
                    - cell "Call Learner 26 No number recorded" [ref=e266]:
                      - button "Call Learner 26" [disabled] [ref=e268]: Call
                      - generic [ref=e269]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e270]:
                      - strong [ref=e271]: Test Coach
                      - generic [ref=e272]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e273]:
                      - combobox "Outcome for Learner 26" [ref=e274]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e275]:
                      - textbox "Notes and action for Learner 26" [ref=e276]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 26" [ref=e277]:
                      - generic [ref=e278]: London time
                      - textbox "Follow-up date and time for Learner 26" [ref=e279]
                      - generic "Quick follow-up dates for Learner 26" [ref=e280]:
                        - button "+3 days" [ref=e281] [cursor=pointer]
                        - button "+5 days" [ref=e282] [cursor=pointer]
                    - cell "Save" [ref=e283]:
                      - button "Save" [disabled] [ref=e284]
                      - status
                  - 'row "Learner 25 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 25 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 25 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 25 Save" [ref=e285]':
                    - rowheader "Learner 25 No phone recorded All cases (1) Report technical issue" [ref=e286]:
                      - strong [ref=e287]: Learner 25
                      - generic [ref=e288]: No phone recorded
                      - button "All cases (1)" [ref=e289] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e291]
                      - group [ref=e292]:
                        - generic "Contact details" [ref=e293] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 25 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e294]':
                      - strong [ref=e295]: "Progress review overdue: Test lecture"
                      - generic [ref=e296]: Test Coach
                      - generic [ref=e297]:
                        - generic [ref=e298]:
                          - text: "Review due:"
                          - time [ref=e299]: 25 Sept 2026
                        - generic [ref=e300]:
                          - text: "Ticket opened:"
                          - time [ref=e301]: 1 Oct 2026
                        - generic [ref=e302]:
                          - text: "Call due by:"
                          - time [ref=e303]: 20 Sept 2026
                      - generic [ref=e304]: Due now
                      - button "Full case" [ref=e305] [cursor=pointer]
                    - cell "Call Learner 25 No number recorded" [ref=e306]:
                      - button "Call Learner 25" [disabled] [ref=e308]: Call
                      - generic [ref=e309]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e310]:
                      - strong [ref=e311]: Test Coach
                      - generic [ref=e312]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e313]:
                      - combobox "Outcome for Learner 25" [ref=e314]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e315]:
                      - textbox "Notes and action for Learner 25" [ref=e316]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 25" [ref=e317]:
                      - generic [ref=e318]: London time
                      - textbox "Follow-up date and time for Learner 25" [ref=e319]
                      - generic "Quick follow-up dates for Learner 25" [ref=e320]:
                        - button "+3 days" [ref=e321] [cursor=pointer]
                        - button "+5 days" [ref=e322] [cursor=pointer]
                    - cell "Save" [ref=e323]:
                      - button "Save" [disabled] [ref=e324]
                      - status
                  - 'row "Learner 24 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 24 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 24 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 24 Save" [ref=e325]':
                    - rowheader "Learner 24 No phone recorded All cases (1) Report technical issue" [ref=e326]:
                      - strong [ref=e327]: Learner 24
                      - generic [ref=e328]: No phone recorded
                      - button "All cases (1)" [ref=e329] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e331]
                      - group [ref=e332]:
                        - generic "Contact details" [ref=e333] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 24 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e334]':
                      - strong [ref=e335]: "Progress review overdue: Test lecture"
                      - generic [ref=e336]: Test Coach
                      - generic [ref=e337]:
                        - generic [ref=e338]:
                          - text: "Review due:"
                          - time [ref=e339]: 24 Sept 2026
                        - generic [ref=e340]:
                          - text: "Ticket opened:"
                          - time [ref=e341]: 1 Oct 2026
                        - generic [ref=e342]:
                          - text: "Call due by:"
                          - time [ref=e343]: 20 Sept 2026
                      - generic [ref=e344]: Due now
                      - button "Full case" [ref=e345] [cursor=pointer]
                    - cell "Call Learner 24 No number recorded" [ref=e346]:
                      - button "Call Learner 24" [disabled] [ref=e348]: Call
                      - generic [ref=e349]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e350]:
                      - strong [ref=e351]: Test Coach
                      - generic [ref=e352]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e353]:
                      - combobox "Outcome for Learner 24" [ref=e354]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e355]:
                      - textbox "Notes and action for Learner 24" [ref=e356]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 24" [ref=e357]:
                      - generic [ref=e358]: London time
                      - textbox "Follow-up date and time for Learner 24" [ref=e359]
                      - generic "Quick follow-up dates for Learner 24" [ref=e360]:
                        - button "+3 days" [ref=e361] [cursor=pointer]
                        - button "+5 days" [ref=e362] [cursor=pointer]
                    - cell "Save" [ref=e363]:
                      - button "Save" [disabled] [ref=e364]
                      - status
                  - 'row "Learner 23 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 23 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 23 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 23 Save" [ref=e365]':
                    - rowheader "Learner 23 No phone recorded All cases (1) Report technical issue" [ref=e366]:
                      - strong [ref=e367]: Learner 23
                      - generic [ref=e368]: No phone recorded
                      - button "All cases (1)" [ref=e369] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e371]
                      - group [ref=e372]:
                        - generic "Contact details" [ref=e373] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 23 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e374]':
                      - strong [ref=e375]: "Progress review overdue: Test lecture"
                      - generic [ref=e376]: Test Coach
                      - generic [ref=e377]:
                        - generic [ref=e378]:
                          - text: "Review due:"
                          - time [ref=e379]: 23 Sept 2026
                        - generic [ref=e380]:
                          - text: "Ticket opened:"
                          - time [ref=e381]: 1 Oct 2026
                        - generic [ref=e382]:
                          - text: "Call due by:"
                          - time [ref=e383]: 20 Sept 2026
                      - generic [ref=e384]: Due now
                      - button "Full case" [ref=e385] [cursor=pointer]
                    - cell "Call Learner 23 No number recorded" [ref=e386]:
                      - button "Call Learner 23" [disabled] [ref=e388]: Call
                      - generic [ref=e389]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e390]:
                      - strong [ref=e391]: Test Coach
                      - generic [ref=e392]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e393]:
                      - combobox "Outcome for Learner 23" [ref=e394]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e395]:
                      - textbox "Notes and action for Learner 23" [ref=e396]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 23" [ref=e397]:
                      - generic [ref=e398]: London time
                      - textbox "Follow-up date and time for Learner 23" [ref=e399]
                      - generic "Quick follow-up dates for Learner 23" [ref=e400]:
                        - button "+3 days" [ref=e401] [cursor=pointer]
                        - button "+5 days" [ref=e402] [cursor=pointer]
                    - cell "Save" [ref=e403]:
                      - button "Save" [disabled] [ref=e404]
                      - status
                  - 'row "Learner 22 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 22 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 22 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 22 Save" [ref=e405]':
                    - rowheader "Learner 22 No phone recorded All cases (1) Report technical issue" [ref=e406]:
                      - strong [ref=e407]: Learner 22
                      - generic [ref=e408]: No phone recorded
                      - button "All cases (1)" [ref=e409] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e411]
                      - group [ref=e412]:
                        - generic "Contact details" [ref=e413] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 22 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e414]':
                      - strong [ref=e415]: "Progress review overdue: Test lecture"
                      - generic [ref=e416]: Test Coach
                      - generic [ref=e417]:
                        - generic [ref=e418]:
                          - text: "Review due:"
                          - time [ref=e419]: 22 Sept 2026
                        - generic [ref=e420]:
                          - text: "Ticket opened:"
                          - time [ref=e421]: 1 Oct 2026
                        - generic [ref=e422]:
                          - text: "Call due by:"
                          - time [ref=e423]: 20 Sept 2026
                      - generic [ref=e424]: Due now
                      - button "Full case" [ref=e425] [cursor=pointer]
                    - cell "Call Learner 22 No number recorded" [ref=e426]:
                      - button "Call Learner 22" [disabled] [ref=e428]: Call
                      - generic [ref=e429]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e430]:
                      - strong [ref=e431]: Test Coach
                      - generic [ref=e432]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e433]:
                      - combobox "Outcome for Learner 22" [ref=e434]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e435]:
                      - textbox "Notes and action for Learner 22" [ref=e436]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 22" [ref=e437]:
                      - generic [ref=e438]: London time
                      - textbox "Follow-up date and time for Learner 22" [ref=e439]
                      - generic "Quick follow-up dates for Learner 22" [ref=e440]:
                        - button "+3 days" [ref=e441] [cursor=pointer]
                        - button "+5 days" [ref=e442] [cursor=pointer]
                    - cell "Save" [ref=e443]:
                      - button "Save" [disabled] [ref=e444]
                      - status
                  - 'row "Learner 21 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 21 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 21 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 21 Save" [ref=e445]':
                    - rowheader "Learner 21 No phone recorded All cases (1) Report technical issue" [ref=e446]:
                      - strong [ref=e447]: Learner 21
                      - generic [ref=e448]: No phone recorded
                      - button "All cases (1)" [ref=e449] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e451]
                      - group [ref=e452]:
                        - generic "Contact details" [ref=e453] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 21 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e454]':
                      - strong [ref=e455]: "Progress review overdue: Test lecture"
                      - generic [ref=e456]: Test Coach
                      - generic [ref=e457]:
                        - generic [ref=e458]:
                          - text: "Review due:"
                          - time [ref=e459]: 21 Sept 2026
                        - generic [ref=e460]:
                          - text: "Ticket opened:"
                          - time [ref=e461]: 1 Oct 2026
                        - generic [ref=e462]:
                          - text: "Call due by:"
                          - time [ref=e463]: 20 Sept 2026
                      - generic [ref=e464]: Due now
                      - button "Full case" [ref=e465] [cursor=pointer]
                    - cell "Call Learner 21 No number recorded" [ref=e466]:
                      - button "Call Learner 21" [disabled] [ref=e468]: Call
                      - generic [ref=e469]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e470]:
                      - strong [ref=e471]: Test Coach
                      - generic [ref=e472]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e473]:
                      - combobox "Outcome for Learner 21" [ref=e474]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e475]:
                      - textbox "Notes and action for Learner 21" [ref=e476]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 21" [ref=e477]:
                      - generic [ref=e478]: London time
                      - textbox "Follow-up date and time for Learner 21" [ref=e479]
                      - generic "Quick follow-up dates for Learner 21" [ref=e480]:
                        - button "+3 days" [ref=e481] [cursor=pointer]
                        - button "+5 days" [ref=e482] [cursor=pointer]
                    - cell "Save" [ref=e483]:
                      - button "Save" [disabled] [ref=e484]
                      - status
                  - 'row "Learner 20 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 20 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 20 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 20 Save" [ref=e485]':
                    - rowheader "Learner 20 No phone recorded All cases (1) Report technical issue" [ref=e486]:
                      - strong [ref=e487]: Learner 20
                      - generic [ref=e488]: No phone recorded
                      - button "All cases (1)" [ref=e489] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e491]
                      - group [ref=e492]:
                        - generic "Contact details" [ref=e493] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 20 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e494]':
                      - strong [ref=e495]: "Progress review overdue: Test lecture"
                      - generic [ref=e496]: Test Coach
                      - generic [ref=e497]:
                        - generic [ref=e498]:
                          - text: "Review due:"
                          - time [ref=e499]: 20 Sept 2026
                        - generic [ref=e500]:
                          - text: "Ticket opened:"
                          - time [ref=e501]: 1 Oct 2026
                        - generic [ref=e502]:
                          - text: "Call due by:"
                          - time [ref=e503]: 20 Sept 2026
                      - generic [ref=e504]: Due now
                      - button "Full case" [ref=e505] [cursor=pointer]
                    - cell "Call Learner 20 No number recorded" [ref=e506]:
                      - button "Call Learner 20" [disabled] [ref=e508]: Call
                      - generic [ref=e509]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e510]:
                      - strong [ref=e511]: Test Coach
                      - generic [ref=e512]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e513]:
                      - combobox "Outcome for Learner 20" [ref=e514]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e515]:
                      - textbox "Notes and action for Learner 20" [ref=e516]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 20" [ref=e517]:
                      - generic [ref=e518]: London time
                      - textbox "Follow-up date and time for Learner 20" [ref=e519]
                      - generic "Quick follow-up dates for Learner 20" [ref=e520]:
                        - button "+3 days" [ref=e521] [cursor=pointer]
                        - button "+5 days" [ref=e522] [cursor=pointer]
                    - cell "Save" [ref=e523]:
                      - button "Save" [disabled] [ref=e524]
                      - status
                  - 'row "Learner 19 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 19 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 19 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 19 Save" [ref=e525]':
                    - rowheader "Learner 19 No phone recorded All cases (1) Report technical issue" [ref=e526]:
                      - strong [ref=e527]: Learner 19
                      - generic [ref=e528]: No phone recorded
                      - button "All cases (1)" [ref=e529] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e531]
                      - group [ref=e532]:
                        - generic "Contact details" [ref=e533] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 19 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e534]':
                      - strong [ref=e535]: "Progress review overdue: Test lecture"
                      - generic [ref=e536]: Test Coach
                      - generic [ref=e537]:
                        - generic [ref=e538]:
                          - text: "Review due:"
                          - time [ref=e539]: 19 Sept 2026
                        - generic [ref=e540]:
                          - text: "Ticket opened:"
                          - time [ref=e541]: 1 Oct 2026
                        - generic [ref=e542]:
                          - text: "Call due by:"
                          - time [ref=e543]: 20 Sept 2026
                      - generic [ref=e544]: Due now
                      - button "Full case" [ref=e545] [cursor=pointer]
                    - cell "Call Learner 19 No number recorded" [ref=e546]:
                      - button "Call Learner 19" [disabled] [ref=e548]: Call
                      - generic [ref=e549]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e550]:
                      - strong [ref=e551]: Test Coach
                      - generic [ref=e552]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e553]:
                      - combobox "Outcome for Learner 19" [ref=e554]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e555]:
                      - textbox "Notes and action for Learner 19" [ref=e556]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 19" [ref=e557]:
                      - generic [ref=e558]: London time
                      - textbox "Follow-up date and time for Learner 19" [ref=e559]
                      - generic "Quick follow-up dates for Learner 19" [ref=e560]:
                        - button "+3 days" [ref=e561] [cursor=pointer]
                        - button "+5 days" [ref=e562] [cursor=pointer]
                    - cell "Save" [ref=e563]:
                      - button "Save" [disabled] [ref=e564]
                      - status
                  - 'row "Learner 18 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 18 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 18 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 18 Save" [ref=e565]':
                    - rowheader "Learner 18 No phone recorded All cases (1) Report technical issue" [ref=e566]:
                      - strong [ref=e567]: Learner 18
                      - generic [ref=e568]: No phone recorded
                      - button "All cases (1)" [ref=e569] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e571]
                      - group [ref=e572]:
                        - generic "Contact details" [ref=e573] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 18 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e574]':
                      - strong [ref=e575]: "Progress review overdue: Test lecture"
                      - generic [ref=e576]: Test Coach
                      - generic [ref=e577]:
                        - generic [ref=e578]:
                          - text: "Review due:"
                          - time [ref=e579]: 18 Sept 2026
                        - generic [ref=e580]:
                          - text: "Ticket opened:"
                          - time [ref=e581]: 1 Oct 2026
                        - generic [ref=e582]:
                          - text: "Call due by:"
                          - time [ref=e583]: 20 Sept 2026
                      - generic [ref=e584]: Due now
                      - button "Full case" [ref=e585] [cursor=pointer]
                    - cell "Call Learner 18 No number recorded" [ref=e586]:
                      - button "Call Learner 18" [disabled] [ref=e588]: Call
                      - generic [ref=e589]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e590]:
                      - strong [ref=e591]: Test Coach
                      - generic [ref=e592]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e593]:
                      - combobox "Outcome for Learner 18" [ref=e594]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e595]:
                      - textbox "Notes and action for Learner 18" [ref=e596]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 18" [ref=e597]:
                      - generic [ref=e598]: London time
                      - textbox "Follow-up date and time for Learner 18" [ref=e599]
                      - generic "Quick follow-up dates for Learner 18" [ref=e600]:
                        - button "+3 days" [ref=e601] [cursor=pointer]
                        - button "+5 days" [ref=e602] [cursor=pointer]
                    - cell "Save" [ref=e603]:
                      - button "Save" [disabled] [ref=e604]
                      - status
                  - 'row "Learner 17 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 17 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 17 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 17 Save" [ref=e605]':
                    - rowheader "Learner 17 No phone recorded All cases (1) Report technical issue" [ref=e606]:
                      - strong [ref=e607]: Learner 17
                      - generic [ref=e608]: No phone recorded
                      - button "All cases (1)" [ref=e609] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e611]
                      - group [ref=e612]:
                        - generic "Contact details" [ref=e613] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 17 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e614]':
                      - strong [ref=e615]: "Progress review overdue: Test lecture"
                      - generic [ref=e616]: Test Coach
                      - generic [ref=e617]:
                        - generic [ref=e618]:
                          - text: "Review due:"
                          - time [ref=e619]: 17 Sept 2026
                        - generic [ref=e620]:
                          - text: "Ticket opened:"
                          - time [ref=e621]: 1 Oct 2026
                        - generic [ref=e622]:
                          - text: "Call due by:"
                          - time [ref=e623]: 20 Sept 2026
                      - generic [ref=e624]: Due now
                      - button "Full case" [ref=e625] [cursor=pointer]
                    - cell "Call Learner 17 No number recorded" [ref=e626]:
                      - button "Call Learner 17" [disabled] [ref=e628]: Call
                      - generic [ref=e629]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e630]:
                      - strong [ref=e631]: Test Coach
                      - generic [ref=e632]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e633]:
                      - combobox "Outcome for Learner 17" [ref=e634]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e635]:
                      - textbox "Notes and action for Learner 17" [ref=e636]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 17" [ref=e637]:
                      - generic [ref=e638]: London time
                      - textbox "Follow-up date and time for Learner 17" [ref=e639]
                      - generic "Quick follow-up dates for Learner 17" [ref=e640]:
                        - button "+3 days" [ref=e641] [cursor=pointer]
                        - button "+5 days" [ref=e642] [cursor=pointer]
                    - cell "Save" [ref=e643]:
                      - button "Save" [disabled] [ref=e644]
                      - status
                  - 'row "Learner 45 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 17 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 45 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 45 Save" [ref=e645]':
                    - rowheader "Learner 45 No phone recorded All cases (1) Report technical issue" [ref=e646]:
                      - strong [ref=e647]: Learner 45
                      - generic [ref=e648]: No phone recorded
                      - button "All cases (1)" [ref=e649] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e651]
                      - group [ref=e652]:
                        - generic "Contact details" [ref=e653] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 17 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e654]':
                      - strong [ref=e655]: "Progress review overdue: Test lecture"
                      - generic [ref=e656]: Test Coach
                      - generic [ref=e657]:
                        - generic [ref=e658]:
                          - text: "Review due:"
                          - time [ref=e659]: 17 Sept 2026
                        - generic [ref=e660]:
                          - text: "Ticket opened:"
                          - time [ref=e661]: 1 Oct 2026
                        - generic [ref=e662]:
                          - text: "Call due by:"
                          - time [ref=e663]: 20 Sept 2026
                      - generic [ref=e664]: Due now
                      - button "Full case" [ref=e665] [cursor=pointer]
                    - cell "Call Learner 45 No number recorded" [ref=e666]:
                      - button "Call Learner 45" [disabled] [ref=e668]: Call
                      - generic [ref=e669]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e670]:
                      - strong [ref=e671]: Test Coach
                      - generic [ref=e672]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e673]:
                      - combobox "Outcome for Learner 45" [ref=e674]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e675]:
                      - textbox "Notes and action for Learner 45" [ref=e676]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 45" [ref=e677]:
                      - generic [ref=e678]: London time
                      - textbox "Follow-up date and time for Learner 45" [ref=e679]
                      - generic "Quick follow-up dates for Learner 45" [ref=e680]:
                        - button "+3 days" [ref=e681] [cursor=pointer]
                        - button "+5 days" [ref=e682] [cursor=pointer]
                    - cell "Save" [ref=e683]:
                      - button "Save" [disabled] [ref=e684]
                      - status
                  - 'row "Learner 16 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 16 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 16 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 16 Save" [ref=e685]':
                    - rowheader "Learner 16 No phone recorded All cases (1) Report technical issue" [ref=e686]:
                      - strong [ref=e687]: Learner 16
                      - generic [ref=e688]: No phone recorded
                      - button "All cases (1)" [ref=e689] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e691]
                      - group [ref=e692]:
                        - generic "Contact details" [ref=e693] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 16 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e694]':
                      - strong [ref=e695]: "Progress review overdue: Test lecture"
                      - generic [ref=e696]: Test Coach
                      - generic [ref=e697]:
                        - generic [ref=e698]:
                          - text: "Review due:"
                          - time [ref=e699]: 16 Sept 2026
                        - generic [ref=e700]:
                          - text: "Ticket opened:"
                          - time [ref=e701]: 1 Oct 2026
                        - generic [ref=e702]:
                          - text: "Call due by:"
                          - time [ref=e703]: 20 Sept 2026
                      - generic [ref=e704]: Due now
                      - button "Full case" [ref=e705] [cursor=pointer]
                    - cell "Call Learner 16 No number recorded" [ref=e706]:
                      - button "Call Learner 16" [disabled] [ref=e708]: Call
                      - generic [ref=e709]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e710]:
                      - strong [ref=e711]: Test Coach
                      - generic [ref=e712]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e713]:
                      - combobox "Outcome for Learner 16" [ref=e714]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e715]:
                      - textbox "Notes and action for Learner 16" [ref=e716]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 16" [ref=e717]:
                      - generic [ref=e718]: London time
                      - textbox "Follow-up date and time for Learner 16" [ref=e719]
                      - generic "Quick follow-up dates for Learner 16" [ref=e720]:
                        - button "+3 days" [ref=e721] [cursor=pointer]
                        - button "+5 days" [ref=e722] [cursor=pointer]
                    - cell "Save" [ref=e723]:
                      - button "Save" [disabled] [ref=e724]
                      - status
                  - 'row "Learner 44 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 16 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 44 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 44 Save" [ref=e725]':
                    - rowheader "Learner 44 No phone recorded All cases (1) Report technical issue" [ref=e726]:
                      - strong [ref=e727]: Learner 44
                      - generic [ref=e728]: No phone recorded
                      - button "All cases (1)" [ref=e729] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e731]
                      - group [ref=e732]:
                        - generic "Contact details" [ref=e733] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 16 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e734]':
                      - strong [ref=e735]: "Progress review overdue: Test lecture"
                      - generic [ref=e736]: Test Coach
                      - generic [ref=e737]:
                        - generic [ref=e738]:
                          - text: "Review due:"
                          - time [ref=e739]: 16 Sept 2026
                        - generic [ref=e740]:
                          - text: "Ticket opened:"
                          - time [ref=e741]: 1 Oct 2026
                        - generic [ref=e742]:
                          - text: "Call due by:"
                          - time [ref=e743]: 20 Sept 2026
                      - generic [ref=e744]: Due now
                      - button "Full case" [ref=e745] [cursor=pointer]
                    - cell "Call Learner 44 No number recorded" [ref=e746]:
                      - button "Call Learner 44" [disabled] [ref=e748]: Call
                      - generic [ref=e749]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e750]:
                      - strong [ref=e751]: Test Coach
                      - generic [ref=e752]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e753]:
                      - combobox "Outcome for Learner 44" [ref=e754]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e755]:
                      - textbox "Notes and action for Learner 44" [ref=e756]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 44" [ref=e757]:
                      - generic [ref=e758]: London time
                      - textbox "Follow-up date and time for Learner 44" [ref=e759]
                      - generic "Quick follow-up dates for Learner 44" [ref=e760]:
                        - button "+3 days" [ref=e761] [cursor=pointer]
                        - button "+5 days" [ref=e762] [cursor=pointer]
                    - cell "Save" [ref=e763]:
                      - button "Save" [disabled] [ref=e764]
                      - status
                  - 'row "Learner 15 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 15 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 15 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 15 Save" [ref=e765]':
                    - rowheader "Learner 15 No phone recorded All cases (1) Report technical issue" [ref=e766]:
                      - strong [ref=e767]: Learner 15
                      - generic [ref=e768]: No phone recorded
                      - button "All cases (1)" [ref=e769] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e771]
                      - group [ref=e772]:
                        - generic "Contact details" [ref=e773] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 15 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e774]':
                      - strong [ref=e775]: "Progress review overdue: Test lecture"
                      - generic [ref=e776]: Test Coach
                      - generic [ref=e777]:
                        - generic [ref=e778]:
                          - text: "Review due:"
                          - time [ref=e779]: 15 Sept 2026
                        - generic [ref=e780]:
                          - text: "Ticket opened:"
                          - time [ref=e781]: 1 Oct 2026
                        - generic [ref=e782]:
                          - text: "Call due by:"
                          - time [ref=e783]: 20 Sept 2026
                      - generic [ref=e784]: Due now
                      - button "Full case" [ref=e785] [cursor=pointer]
                    - cell "Call Learner 15 No number recorded" [ref=e786]:
                      - button "Call Learner 15" [disabled] [ref=e788]: Call
                      - generic [ref=e789]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e790]:
                      - strong [ref=e791]: Test Coach
                      - generic [ref=e792]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e793]:
                      - combobox "Outcome for Learner 15" [ref=e794]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e795]:
                      - textbox "Notes and action for Learner 15" [ref=e796]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 15" [ref=e797]:
                      - generic [ref=e798]: London time
                      - textbox "Follow-up date and time for Learner 15" [ref=e799]
                      - generic "Quick follow-up dates for Learner 15" [ref=e800]:
                        - button "+3 days" [ref=e801] [cursor=pointer]
                        - button "+5 days" [ref=e802] [cursor=pointer]
                    - cell "Save" [ref=e803]:
                      - button "Save" [disabled] [ref=e804]
                      - status
                  - 'row "Learner 43 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 15 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 43 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 43 Save" [ref=e805]':
                    - rowheader "Learner 43 No phone recorded All cases (1) Report technical issue" [ref=e806]:
                      - strong [ref=e807]: Learner 43
                      - generic [ref=e808]: No phone recorded
                      - button "All cases (1)" [ref=e809] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e811]
                      - group [ref=e812]:
                        - generic "Contact details" [ref=e813] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 15 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e814]':
                      - strong [ref=e815]: "Progress review overdue: Test lecture"
                      - generic [ref=e816]: Test Coach
                      - generic [ref=e817]:
                        - generic [ref=e818]:
                          - text: "Review due:"
                          - time [ref=e819]: 15 Sept 2026
                        - generic [ref=e820]:
                          - text: "Ticket opened:"
                          - time [ref=e821]: 1 Oct 2026
                        - generic [ref=e822]:
                          - text: "Call due by:"
                          - time [ref=e823]: 20 Sept 2026
                      - generic [ref=e824]: Due now
                      - button "Full case" [ref=e825] [cursor=pointer]
                    - cell "Call Learner 43 No number recorded" [ref=e826]:
                      - button "Call Learner 43" [disabled] [ref=e828]: Call
                      - generic [ref=e829]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e830]:
                      - strong [ref=e831]: Test Coach
                      - generic [ref=e832]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e833]:
                      - combobox "Outcome for Learner 43" [ref=e834]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e835]:
                      - textbox "Notes and action for Learner 43" [ref=e836]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 43" [ref=e837]:
                      - generic [ref=e838]: London time
                      - textbox "Follow-up date and time for Learner 43" [ref=e839]
                      - generic "Quick follow-up dates for Learner 43" [ref=e840]:
                        - button "+3 days" [ref=e841] [cursor=pointer]
                        - button "+5 days" [ref=e842] [cursor=pointer]
                    - cell "Save" [ref=e843]:
                      - button "Save" [disabled] [ref=e844]
                      - status
                  - 'row "Learner 14 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 14 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 14 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 14 Save" [ref=e845]':
                    - rowheader "Learner 14 No phone recorded All cases (1) Report technical issue" [ref=e846]:
                      - strong [ref=e847]: Learner 14
                      - generic [ref=e848]: No phone recorded
                      - button "All cases (1)" [ref=e849] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e851]
                      - group [ref=e852]:
                        - generic "Contact details" [ref=e853] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 14 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e854]':
                      - strong [ref=e855]: "Progress review overdue: Test lecture"
                      - generic [ref=e856]: Test Coach
                      - generic [ref=e857]:
                        - generic [ref=e858]:
                          - text: "Review due:"
                          - time [ref=e859]: 14 Sept 2026
                        - generic [ref=e860]:
                          - text: "Ticket opened:"
                          - time [ref=e861]: 1 Oct 2026
                        - generic [ref=e862]:
                          - text: "Call due by:"
                          - time [ref=e863]: 20 Sept 2026
                      - generic [ref=e864]: Due now
                      - button "Full case" [ref=e865] [cursor=pointer]
                    - cell "Call Learner 14 No number recorded" [ref=e866]:
                      - button "Call Learner 14" [disabled] [ref=e868]: Call
                      - generic [ref=e869]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e870]:
                      - strong [ref=e871]: Test Coach
                      - generic [ref=e872]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e873]:
                      - combobox "Outcome for Learner 14" [ref=e874]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e875]:
                      - textbox "Notes and action for Learner 14" [ref=e876]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 14" [ref=e877]:
                      - generic [ref=e878]: London time
                      - textbox "Follow-up date and time for Learner 14" [ref=e879]
                      - generic "Quick follow-up dates for Learner 14" [ref=e880]:
                        - button "+3 days" [ref=e881] [cursor=pointer]
                        - button "+5 days" [ref=e882] [cursor=pointer]
                    - cell "Save" [ref=e883]:
                      - button "Save" [disabled] [ref=e884]
                      - status
                  - 'row "Learner 42 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 14 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 42 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 42 Save" [ref=e885]':
                    - rowheader "Learner 42 No phone recorded All cases (1) Report technical issue" [ref=e886]:
                      - strong [ref=e887]: Learner 42
                      - generic [ref=e888]: No phone recorded
                      - button "All cases (1)" [ref=e889] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e891]
                      - group [ref=e892]:
                        - generic "Contact details" [ref=e893] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 14 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e894]':
                      - strong [ref=e895]: "Progress review overdue: Test lecture"
                      - generic [ref=e896]: Test Coach
                      - generic [ref=e897]:
                        - generic [ref=e898]:
                          - text: "Review due:"
                          - time [ref=e899]: 14 Sept 2026
                        - generic [ref=e900]:
                          - text: "Ticket opened:"
                          - time [ref=e901]: 1 Oct 2026
                        - generic [ref=e902]:
                          - text: "Call due by:"
                          - time [ref=e903]: 20 Sept 2026
                      - generic [ref=e904]: Due now
                      - button "Full case" [ref=e905] [cursor=pointer]
                    - cell "Call Learner 42 No number recorded" [ref=e906]:
                      - button "Call Learner 42" [disabled] [ref=e908]: Call
                      - generic [ref=e909]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e910]:
                      - strong [ref=e911]: Test Coach
                      - generic [ref=e912]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e913]:
                      - combobox "Outcome for Learner 42" [ref=e914]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e915]:
                      - textbox "Notes and action for Learner 42" [ref=e916]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 42" [ref=e917]:
                      - generic [ref=e918]: London time
                      - textbox "Follow-up date and time for Learner 42" [ref=e919]
                      - generic "Quick follow-up dates for Learner 42" [ref=e920]:
                        - button "+3 days" [ref=e921] [cursor=pointer]
                        - button "+5 days" [ref=e922] [cursor=pointer]
                    - cell "Save" [ref=e923]:
                      - button "Save" [disabled] [ref=e924]
                      - status
                  - 'row "Learner 13 No phone recorded All cases (1) Report technical issue Progress review overdue: Test lecture Test Coach Review due: 13 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 13 No number recorded Test Coach The learner books the review from the coach’s page in the booking email. Choose outcome… London time Quick follow-up dates for Learner 13 Save" [ref=e925]':
                    - rowheader "Learner 13 No phone recorded All cases (1) Report technical issue" [ref=e926]:
                      - strong [ref=e927]: Learner 13
                      - generic [ref=e928]: No phone recorded
                      - button "All cases (1)" [ref=e929] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e931]
                      - group [ref=e932]:
                        - generic "Contact details" [ref=e933] [cursor=pointer]
                    - 'cell "Progress review overdue: Test lecture Test Coach Review due: 13 Sept 2026 Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e934]':
                      - strong [ref=e935]: "Progress review overdue: Test lecture"
                      - generic [ref=e936]: Test Coach
                      - generic [ref=e937]:
                        - generic [ref=e938]:
                          - text: "Review due:"
                          - time [ref=e939]: 13 Sept 2026
                        - generic [ref=e940]:
                          - text: "Ticket opened:"
                          - time [ref=e941]: 1 Oct 2026
                        - generic [ref=e942]:
                          - text: "Call due by:"
                          - time [ref=e943]: 20 Sept 2026
                      - generic [ref=e944]: Due now
                      - button "Full case" [ref=e945] [cursor=pointer]
                    - cell "Call Learner 13 No number recorded" [ref=e946]:
                      - button "Call Learner 13" [disabled] [ref=e948]: Call
                      - generic [ref=e949]: No number recorded
                    - cell "Test Coach The learner books the review from the coach’s page in the booking email." [ref=e950]:
                      - strong [ref=e951]: Test Coach
                      - generic [ref=e952]: The learner books the review from the coach’s page in the booking email.
                    - cell "Choose outcome…" [ref=e953]:
                      - combobox "Outcome for Learner 13" [ref=e954]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e955]:
                      - textbox "Notes and action for Learner 13" [ref=e956]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 13" [ref=e957]:
                      - generic [ref=e958]: London time
                      - textbox "Follow-up date and time for Learner 13" [ref=e959]
                      - generic "Quick follow-up dates for Learner 13" [ref=e960]:
                        - button "+3 days" [ref=e961] [cursor=pointer]
                        - button "+5 days" [ref=e962] [cursor=pointer]
                    - cell "Save" [ref=e963]:
                      - button "Save" [disabled] [ref=e964]
                      - status
            - navigation "Ticket pages" [ref=e965]:
              - button "Previous page" [disabled] [ref=e966]
              - generic [ref=e967]:
                - text: Page
                - combobox "Ticket page" [ref=e968]:
                  - option "1" [selected]
                  - option "2"
                  - option "3"
                - text: of 3
              - button "Next page" [ref=e969] [cursor=pointer]
              - generic [ref=e970]: 20 contacts per page
```

# Test source

```ts
  292 |   for (const [id, day] of [[1, 15], [2, 12], [3, 13], [4, 14]]) {
  293 |     const row = page.locator(`[data-sheet-row="${id}"]`);
  294 |     await expect(row.getByText(`${id === 1 ? 'Missed lecture date' : 'Issue date'}: ${day} Sept 2026`, { exact: true })).toBeVisible();
  295 |     await expect(row.getByText('Ticket opened: 1 Oct 2026', { exact: true }).first()).toBeVisible();
  296 |   }
  297 |   await page.getByText('Other matching tickets (1)', { exact: true }).click();
  298 |   await expect(page.locator('[data-related-ticket="5"]')).toContainText('Missed lecture date: 2 Sept 2026');
  299 |   await page.screenshot({ path: test.info().outputPath('ticket-dates.png'), fullPage: true });
  300 |   await page.locator('[data-sheet-row="2"]').getByRole('button', { name: 'Full case', exact: true }).click();
  301 |   await expect(page.locator('.ed-learner').getByText('Issue date: 12 Sept 2026', { exact: true })).toBeVisible();
  302 |   await expect(page.locator('.ed-learner').getByText('Ticket opened: 1 Oct 2026', { exact: true })).toBeVisible();
  303 | });
  304 | 
  305 | test('missed lecture shows London schedule separately from ticket dates, including missing and ambiguous times', async ({ page }) => {
  306 |   await openSheet(page, [
  307 |     ticket(1, { issue_date: '2026-10-16', missed_lecture: {
  308 |       module: 'Commercial Intelligence', title: 'Commercial Intelligence lecture', date: '2026-10-16',
  309 |       starts_at: '2026-10-16T11:00:00Z', ends_at: '2026-10-16T13:00:00Z', time_status: 'matched',
  310 |     } }),
  311 |     ticket(2),
  312 |     ticket(3, { missed_lecture: {
  313 |       module: 'Test lecture', title: 'Test lecture', date: '2026-09-15',
  314 |       starts_at: null, ends_at: null, time_status: 'ambiguous',
  315 |     } }),
  316 |   ]);
  317 |   const first = page.locator('[data-sheet-row="1"]');
  318 |   await expect(first).toContainText('Missed lecture date: 16 Oct 2026');
  319 |   await expect(first).toContainText('Lecture time: 12:00–14:00 (London)');
  320 |   await expect(first).toContainText('Ticket opened: 1 Oct 2026');
  321 |   await expect(page.locator('[data-sheet-row="2"]')).toContainText('Lecture time: Not recorded in source');
  322 |   await expect(page.locator('[data-sheet-row="3"]')).toContainText('Multiple sessions — confirm in timetable');
  323 |   await first.getByRole('button', { name: 'Full case', exact: true }).click();
  324 |   await expect(page.locator('.ed-learner')).toContainText('Lecture time: 12:00–14:00 (London)');
  325 | });
  326 | 
  327 | test('changing order retains unsaved notes on their original ticket', async ({ page }) => {
  328 |   await openSheet(page, [
  329 |     ticket(1, { issue_date: '2026-09-20' }),
  330 |     ticket(2, { learner_email: 'learner1@example.org', learner_name: 'Learner 1', issue_date: '2026-09-01' }),
  331 |     ticket(3, { issue_date: '2026-09-10' }),
  332 |   ]);
  333 |   await page.getByLabel('Notes and action for Learner 1').fill('Keep this agreed action on the original ticket.');
  334 |   await page.getByLabel('Ticket order', { exact: true }).selectOption('oldest');
  335 |   expect(await rowIds(page)).toEqual([3, 1]);
  336 |   await expect(page.locator('[data-sheet-row="1"] textarea')).toHaveValue('Keep this agreed action on the original ticket.');
  337 |   await expect(page.locator('[data-sheet-row="2"]')).toHaveCount(0);
  338 |   await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
  339 |   expect(await rowIds(page)).toEqual([2, 3]);
  340 | });
  341 | 
  342 | test('missing source dates are labelled and use opened date; undated tickets stay last', async ({ page }) => {
  343 |   await openSheet(page, [
  344 |     ticket(1, { source_type: 'mcm', issue_date: null, created_at: '2026-09-03T12:00:00Z' }),
  345 |     ticket(2, { source_type: 'pr', issue_date: '2026-09-10' }),
  346 |     ticket(3, { source_type: 'epa', issue_date: null, created_at: '' }),
  347 |   ], 'due');
  348 |   const first = page.locator('[data-sheet-row="1"]');
  349 |   await expect(first).toContainText('Review due: Not recorded in source');
  350 |   await expect(first).toContainText('Ticket opened: 3 Sept 2026');
  351 |   await page.getByLabel('Ticket order', { exact: true }).selectOption('oldest');
  352 |   expect(await rowIds(page)).toEqual([1, 2, 3]);
  353 |   await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
  354 |   expect(await rowIds(page)).toEqual([2, 1, 3]);
  355 |   await page.getByLabel('Filter call reason', { exact: true }).selectOption('mcm');
  356 |   expect(await rowIds(page)).toEqual([1]);
  357 |   await page.getByLabel('Search the call sheet').fill('no such learner');
  358 |   await expect(page.getByText('No calls in this view', { exact: true })).toBeVisible();
  359 | });
  360 | 
  361 | test('appointment tickets retain their actual dates without inventing issue dates', async ({ page }) => {
  362 |   await openSheet(page, [
  363 |     ticket(1, { source_type: 'reminder', issue_date: null, booking_at: '2026-10-21T09:30:00Z' }),
  364 |   ], 'nextday');
  365 |   await expect(page.locator('[data-sheet-row="1"]')).toContainText('Appointment: 21/10/2026, 10:30:00 (London)');
  366 |   await expect(page.locator('[data-sheet-row="1"]')).toContainText('Ticket opened: 1 Oct 2026');
  367 |   await expect(page.locator('[data-sheet-row="1"]')).not.toContainText('Issue date:');
  368 | });
  369 | 
  370 | test('date ordering handles invalid legacy dates, appointment fallback, timestamps and stable ties', () => {
  371 |   const cases = [
  372 |     ticket(1, { issue_date: 'invalid', booking_at: '2026-09-02T09:00:00Z' }),
  373 |     ticket(2, { issue_date: null, created_at: '2026-09-02T08:00:00Z' }),
  374 |     ticket(3, { issue_date: '2026-09-01' }),
  375 |     ticket(4, { issue_date: '2026-09-01' }),
  376 |     ticket(5, { issue_date: null, booking_at: null, created_at: '' }),
  377 |   ];
  378 |   expect(orderTickets(cases, 'oldest').map(c => c.id)).toEqual([3, 4, 2, 1, 5]);
  379 |   expect(orderTickets(cases, 'newest').map(c => c.id)).toEqual([1, 2, 3, 4, 5]);
  380 |   expect(cases.map(c => c.id)).toEqual([1, 2, 3, 4, 5]);
  381 | });
  382 | 
  383 | for (const section of ['missed', 'due']) {
  384 |   test(`${section} paginates twenty contacts and retains notes across pages and filters`, async ({ page }) => {
  385 |     const cases = Array.from({ length: 45 }, (_, index) => ticket(index + 1, {
  386 |       source_type: section === 'due' ? 'pr' : 'attendance',
  387 |       issue_date: `2026-09-${String(index % 28 + 1).padStart(2, '0')}`,
  388 |     }));
  389 |     await openSheet(page, cases, section);
  390 |     await page.getByLabel('Ticket order', { exact: true }).selectOption('priority');
  391 |     await expect(page.locator('[data-sheet-row]')).toHaveCount(20);
> 392 |     await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
      |                                                                              ^ Error: locator.fill: Test timeout of 45000ms exceeded.
  393 |     await page.getByLabel('Notes and action for Learner 1', { exact: true }).fill('Keep the agreed follow-up while moving between pages.');
  394 |     await page.getByRole('button', { name: 'Next page', exact: true }).click();
  395 |     expect((await rowIds(page))[0]).toBe(21);
  396 |     await expect(page.locator('[data-sheet-row]')).toHaveCount(20);
  397 |     await page.getByRole('button', { name: 'Next page', exact: true }).click();
  398 |     await expect(page.locator('[data-sheet-row]')).toHaveCount(5);
  399 |     await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  400 |     await page.getByLabel('Ticket page', { exact: true }).selectOption('1');
  401 |     await expect(page.getByLabel('Notes and action for Learner 1', { exact: true })).toHaveValue('Keep the agreed follow-up while moving between pages.');
  402 |     await page.getByLabel('Ticket page', { exact: true }).selectOption('3');
  403 |     await page.getByLabel('Search the call sheet').fill('Learner 45');
  404 |     await expect(page.getByLabel('Ticket page', { exact: true })).toHaveValue('1');
  405 |     expect(await rowIds(page)).toEqual([45]);
  406 |     await page.getByLabel('Search the call sheet').fill('');
  407 |     await page.getByLabel('Ticket page', { exact: true }).selectOption('3');
  408 |     await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
  409 |     await expect(page.getByLabel('Ticket page', { exact: true })).toHaveValue('1');
  410 |     await expect(page.locator('[data-sheet-row]')).toHaveCount(20);
  411 |     expect((await rowIds(page))[0]).toBe(28);
  412 |   });
  413 | }
  414 | 
  415 | test('Due shows review deadlines, EPA programme and gateway dates, and call dates', async ({ page }) => {
  416 |   await openSheet(page, [
  417 |     ticket(1, { source_type: 'pr', issue_date: '2026-09-15' }),
  418 |     ticket(2, { source_type: 'mcm', issue_date: '2026-09-16' }),
  419 |     ticket(3, { source_type: 'epa', issue_date: '2026-09-07', programme_end_date: '2026-08-31',
  420 |       gateway_review_date: null, next_followup_at: '2026-10-22T09:00:00Z' }),
  421 |   ], 'due');
  422 |   await expect(page.locator('[data-sheet-row="1"]')).toContainText('Review due: 15 Sept 2026');
  423 |   await expect(page.locator('[data-sheet-row="2"]')).toContainText('Review due: 16 Sept 2026');
  424 |   const epa = page.locator('[data-sheet-row="3"]');
  425 |   await expect(epa).toContainText('Programme end: 31 Aug 2026');
  426 |   await expect(epa).toContainText('Gateway review: Not recorded');
  427 |   await expect(epa).toContainText('EPA follow-up from: 7 Sept 2026');
  428 |   await expect(epa).toContainText('Call due by: 20 Sept 2026');
  429 |   await expect(epa).toContainText('Next follow-up: 22/10/2026, 10:00:00 (London)');
  430 |   await page.getByLabel('Ticket order', { exact: true }).selectOption('oldest');
  431 |   expect(await rowIds(page)).toEqual([3, 1, 2]);
  432 |   await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
  433 |   expect(await rowIds(page)).toEqual([2, 1, 3]);
  434 | });
  435 | 
  436 | test('dashboard link stays available and the one-step back button is removed', async ({ page }) => {
  437 |   await openSheet(page, [ticket(1), ticket(2, { source_type: 'pr' })]);
  438 |   await expect(page.getByRole('button', { name: 'Go back one step', exact: true })).toHaveCount(0);
  439 |   await page.getByRole('button', { name: 'Due (1)', exact: true }).click();
  440 |   await expect(page).toHaveURL(/section=due/);
  441 |   await page.getByRole('link', { name: 'Back to dashboard', exact: true }).click();
  442 |   await expect(page).toHaveURL(/\/dashboard$/);
  443 | });
  444 | 
  445 | test('catch-up booking opens outside the email preview and keeps the draft without sending', async ({ page, context }) => {
  446 |   const writes = await openSheet(page, [ticket(1, { booking_email: true })]);
  447 |   const bookingUrl = 'https://booking.example.test/catch-up';
  448 |   await context.route('https://booking.example.test/**', route => route.fulfill({
  449 |     contentType: 'text/html',
  450 |     body: '<html><body><h1 id="calendar">Loading</h1><script>document.getElementById("calendar").textContent="Booking calendar ready";</script></body></html>',
  451 |   }));
  452 |   await page.route('**/api/callcentre/tickets/1/booking-email/', route => route.fulfill({ json: {
  453 |     recipient: 'learner1@example.org', subject: 'Catch-up booking', message: 'Choose a time with your coach.',
  454 |     text: 'Booking link', html: `<html><body><a href="${bookingUrl}" target="_blank" rel="noopener noreferrer">Book your catch-up session</a></body></html>`,
  455 |     link: { label: 'Book your catch-up session', url: bookingUrl }, mode: 'dry_run', checks: [],
  456 |   } }));
  457 |   await page.getByRole('button', { name: 'Booking email', exact: true }).click();
  458 |   const dialog = page.getByRole('dialog');
  459 |   await expect(dialog.getByLabel('Subject', { exact: true })).toHaveValue('Catch-up booking');
  460 |   const popupPromise = page.waitForEvent('popup');
  461 |   await page.frameLocator('iframe[title="Email preview"]').getByRole('link', { name: 'Book your catch-up session', exact: true }).click();
  462 |   const popup = await popupPromise;
  463 |   await expect(popup.getByRole('heading', { name: 'Booking calendar ready' })).toBeVisible();
  464 |   await popup.close();
  465 |   await page.bringToFront();
  466 |   await expect(dialog.getByLabel('Message')).toHaveValue('Choose a time with your coach.');
  467 |   await expect(page.frameLocator('iframe[title="Email preview"]').getByRole('link')).toBeVisible();
  468 |   const directPromise = page.waitForEvent('popup');
  469 |   await dialog.getByRole('link', { name: 'Book your catch-up session ↗', exact: true }).click();
  470 |   const direct = await directPromise;
  471 |   await expect(direct.getByRole('heading', { name: 'Booking calendar ready' })).toBeVisible();
  472 |   await direct.close();
  473 |   expect(writes.filter(path => path.endsWith('/send/') || path.endsWith('/booking/'))).toEqual([]);
  474 | });
  475 | 
  476 | for (const section of ['missed', 'due']) {
  477 |   test(`${section} filters a day or inclusive date range and combines with sorting, search and pagination`, async ({ page }) => {
  478 |     const cases = Array.from({ length: 25 }, (_, index) => ticket(index + 1, {
  479 |       source_type: section === 'due' ? 'pr' : 'attendance',
  480 |       issue_date: index === 0 ? '2026-09-10' : index >= 20 && index <= 22 ? `2026-09-${index - 9}` : '2026-09-01',
  481 |     }));
  482 |     const writes = await openSheet(page, cases, section);
  483 |     await page.getByLabel('Ticket order', { exact: true }).selectOption('priority');
  484 |     await page.getByLabel('Notes and action for Learner 1', { exact: true }).fill('Keep this note when filtering by date.');
  485 |     await page.getByRole('button', { name: 'Next page', exact: true }).click();
  486 |     await page.getByLabel('Date filter', { exact: true }).selectOption('day');
  487 |     await page.getByLabel('Ticket date', { exact: true }).fill('2026-09-11');
  488 |     await expect(page.getByLabel('Ticket page', { exact: true })).toHaveValue('1');
  489 |     expect(await rowIds(page)).toEqual([21]);
  490 |     await page.getByLabel('Date filter', { exact: true }).selectOption('range');
  491 |     await page.getByLabel('From date', { exact: true }).fill('2026-09-10');
  492 |     await page.getByLabel('To date', { exact: true }).fill('2026-09-12');
```