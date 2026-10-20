# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: call-sheet-dates.spec.ts >> coach, cohort and module combine before contact grouping and preserve hidden drafts
- Location: tests\ui\call-sheet-dates.spec.ts:83:1

# Error details

```
Error: locator.fill: Error: strict mode violation: getByLabel('Notes and action for Learner 1') resolved to 11 elements:
    1) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 1" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 1', exact: true })
    2) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 10" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 10' })
    3) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 11" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 11' })
    4) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 12" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 12' })
    5) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 13" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 13' })
    6) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 14" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 14' })
    7) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 15" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 15' })
    8) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 16" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 16' })
    9) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 17" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 17' })
    10) <textarea rows="2" maxlength="3500" aria-label="Notes and action for Learner 18" placeholder="What was agreed? Who will do what, by when?"></textarea> aka getByRole('textbox', { name: 'Notes and action for Learner 18' })
    ...

Call log:
  - waiting for getByLabel('Notes and action for Learner 1')

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
        - button "Missed (27)" [ref=e19] [cursor=pointer]:
          - img [ref=e20]
          - generic [ref=e22]: Missed (27)
        - button "Due (0)" [ref=e23] [cursor=pointer]:
          - img [ref=e24]
          - generic [ref=e26]: Due (0)
        - button "Next Day (0)" [ref=e27] [cursor=pointer]:
          - img [ref=e28]
          - generic [ref=e30]: Next Day (0)
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
        - status
        - generic [ref=e124]:
          - paragraph [ref=e125]: Missed lectures, reviews that were booked but are not completed, and finished reviews waiting for a signature. Agree a catch-up or a new review time; for a signature, ask the learner to sign in the LMS (nothing to book).
          - navigation "Call types" [ref=e126]:
            - button "All (27)" [pressed] [ref=e127] [cursor=pointer]
            - button "Missed session (27)" [ref=e128] [cursor=pointer]
            - button "Missed monthly coaching (0)" [ref=e129] [cursor=pointer]
            - button "Missed progress review (0)" [ref=e130] [cursor=pointer]
            - button "Missing signature (0)" [ref=e131] [cursor=pointer]
          - generic [ref=e132]:
            - searchbox "Search the call sheet" [ref=e133]
            - combobox "Filter call reason" [ref=e134]:
              - option "All call reasons" [selected]
              - option "Missed lecture"
            - combobox "Follow-up timing" [ref=e135]:
              - option "All active" [selected]
              - option "Due now"
            - combobox "Ticket order" [ref=e136]:
              - option "Priority order" [selected]
              - option "Oldest first"
              - option "Newest first"
            - group "Ticket date filter" [ref=e137]:
              - combobox "Date filter" [ref=e138]:
                - option "All dates" [selected]
                - option "Specific day"
                - option "Date range"
          - group "Coach, cohort and module filters" [ref=e139]:
            - generic [ref=e140]:
              - text: Coach
              - combobox "Filter by coach" [ref=e141]:
                - option "All coaches" [selected]
                - option "Coach A"
                - option "Coach B"
                - option "Not recorded"
            - generic [ref=e142]:
              - text: Cohort
              - combobox "Filter by cohort" [ref=e143]:
                - option "All cohorts" [selected]
                - option "Cohort 1"
                - option "Cohort 2"
                - option "Not recorded"
            - generic [ref=e144]:
              - text: Module
              - combobox "Filter by module" [ref=e145]:
                - option "All modules" [selected]
                - option "Finance"
                - option "Marketing"
                - option "Not recorded"
          - paragraph [ref=e146]: Date filters and oldest / newest use the issue date, then the appointment date or ticket opened date if unavailable. Dates are UK calendar days; a range includes both days. Tickets with unsaved edits stay selected for their contact.
          - paragraph [ref=e147]: Call, update the row, then Save. Zoom Phone opens with your caller ID; keep the Zoom desktop app signed in. An outcome is saved against the call Zoom reports, so save once the call has synced.
          - generic [ref=e148]:
            - paragraph [ref=e149]: This section contains 28 open tickets across 27 contacts before the filters below. A contact can have multiple tickets.
            - generic [ref=e150]:
              - text: 1–20 of 27 contacts · Priority order · One row per contact
              - generic [ref=e151]: Tab between fields · Ctrl/⌘ + Enter to save a row
            - region "Quick call register" [ref=e152]:
              - table "Learner calls. Edit the outcome, notes and follow-up date, then save that row." [ref=e153]:
                - caption [ref=e154]: Learner calls. Edit the outcome, notes and follow-up date, then save that row.
                - rowgroup [ref=e155]:
                  - row "Learner / phone Call reason / coach Call Booking Outcome Notes / agreed action Follow-up Save" [ref=e156]:
                    - columnheader "Learner / phone" [ref=e157]
                    - columnheader "Call reason / coach" [ref=e158]
                    - columnheader "Call" [ref=e159]
                    - columnheader "Booking" [ref=e160]
                    - columnheader "Outcome" [ref=e161]
                    - columnheader "Notes / agreed action" [ref=e162]
                    - columnheader "Follow-up" [ref=e163]
                    - columnheader "Save" [ref=e164]
                - rowgroup [ref=e165]:
                  - 'row "Learner 1 No phone recorded All cases (2) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 1 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 1 Save" [ref=e166]':
                    - rowheader "Learner 1 No phone recorded All cases (2) Report technical issue" [ref=e167]:
                      - strong [ref=e168]: Learner 1
                      - generic [ref=e169]: No phone recorded
                      - button "All cases (2)" [ref=e170] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e172]
                      - group [ref=e173]:
                        - generic "Contact details" [ref=e174] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e175]':
                      - strong [ref=e176]: Missed lecture
                      - generic [ref=e177]: Coach A
                      - generic [ref=e178]: Test lecture
                      - generic [ref=e179]:
                        - generic [ref=e180]:
                          - text: "Missed lecture date:"
                          - time [ref=e181]: 15 Sept 2026
                        - generic [ref=e182]: "Lecture time: Not recorded in source"
                        - generic [ref=e183]:
                          - text: "Ticket opened:"
                          - time [ref=e184]: 1 Oct 2026
                        - generic [ref=e185]:
                          - text: "Call due by:"
                          - time [ref=e186]: 20 Sept 2026
                      - generic [ref=e187]: Due now
                      - button "Full case" [ref=e188] [cursor=pointer]
                      - group [ref=e189]:
                        - generic "Other matching tickets (1)" [ref=e190] [cursor=pointer]
                    - cell "Call Learner 1 No number recorded" [ref=e191]:
                      - button "Call Learner 1" [disabled] [ref=e193]: Call
                      - generic [ref=e194]: No number recorded
                    - cell "Coach A" [ref=e195]:
                      - strong [ref=e196]: Coach A
                    - cell "Choose outcome…" [ref=e197]:
                      - combobox "Outcome for Learner 1" [ref=e198]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e199]:
                      - textbox "Notes and action for Learner 1" [ref=e200]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 1" [ref=e201]:
                      - generic [ref=e202]: London time
                      - textbox "Follow-up date and time for Learner 1" [ref=e203]
                      - generic "Quick follow-up dates for Learner 1" [ref=e204]:
                        - button "+3 days" [ref=e205] [cursor=pointer]
                        - button "+5 days" [ref=e206] [cursor=pointer]
                    - cell "Save" [ref=e207]:
                      - button "Save" [disabled] [ref=e208]
                      - status
                  - 'row "Learner 2 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 2 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 2 Save" [ref=e209]':
                    - rowheader "Learner 2 No phone recorded All cases (1) Report technical issue" [ref=e210]:
                      - strong [ref=e211]: Learner 2
                      - generic [ref=e212]: No phone recorded
                      - button "All cases (1)" [ref=e213] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e215]
                      - group [ref=e216]:
                        - generic "Contact details" [ref=e217] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e218]':
                      - strong [ref=e219]: Missed lecture
                      - generic [ref=e220]: Coach A
                      - generic [ref=e221]: Test lecture
                      - generic [ref=e222]:
                        - generic [ref=e223]:
                          - text: "Missed lecture date:"
                          - time [ref=e224]: 15 Sept 2026
                        - generic [ref=e225]: "Lecture time: Not recorded in source"
                        - generic [ref=e226]:
                          - text: "Ticket opened:"
                          - time [ref=e227]: 1 Oct 2026
                        - generic [ref=e228]:
                          - text: "Call due by:"
                          - time [ref=e229]: 20 Sept 2026
                      - generic [ref=e230]: Due now
                      - button "Full case" [ref=e231] [cursor=pointer]
                    - cell "Call Learner 2 No number recorded" [ref=e232]:
                      - button "Call Learner 2" [disabled] [ref=e234]: Call
                      - generic [ref=e235]: No number recorded
                    - cell "Coach A" [ref=e236]:
                      - strong [ref=e237]: Coach A
                    - cell "Choose outcome…" [ref=e238]:
                      - combobox "Outcome for Learner 2" [ref=e239]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e240]:
                      - textbox "Notes and action for Learner 2" [ref=e241]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 2" [ref=e242]:
                      - generic [ref=e243]: London time
                      - textbox "Follow-up date and time for Learner 2" [ref=e244]
                      - generic "Quick follow-up dates for Learner 2" [ref=e245]:
                        - button "+3 days" [ref=e246] [cursor=pointer]
                        - button "+5 days" [ref=e247] [cursor=pointer]
                    - cell "Save" [ref=e248]:
                      - button "Save" [disabled] [ref=e249]
                      - status
                  - 'row "Learner 3 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 3 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 3 Save" [ref=e250]':
                    - rowheader "Learner 3 No phone recorded All cases (1) Report technical issue" [ref=e251]:
                      - strong [ref=e252]: Learner 3
                      - generic [ref=e253]: No phone recorded
                      - button "All cases (1)" [ref=e254] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e256]
                      - group [ref=e257]:
                        - generic "Contact details" [ref=e258] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e259]':
                      - strong [ref=e260]: Missed lecture
                      - generic [ref=e261]: Coach A
                      - generic [ref=e262]: Test lecture
                      - generic [ref=e263]:
                        - generic [ref=e264]:
                          - text: "Missed lecture date:"
                          - time [ref=e265]: 15 Sept 2026
                        - generic [ref=e266]: "Lecture time: Not recorded in source"
                        - generic [ref=e267]:
                          - text: "Ticket opened:"
                          - time [ref=e268]: 1 Oct 2026
                        - generic [ref=e269]:
                          - text: "Call due by:"
                          - time [ref=e270]: 20 Sept 2026
                      - generic [ref=e271]: Due now
                      - button "Full case" [ref=e272] [cursor=pointer]
                    - cell "Call Learner 3 No number recorded" [ref=e273]:
                      - button "Call Learner 3" [disabled] [ref=e275]: Call
                      - generic [ref=e276]: No number recorded
                    - cell "Coach A" [ref=e277]:
                      - strong [ref=e278]: Coach A
                    - cell "Choose outcome…" [ref=e279]:
                      - combobox "Outcome for Learner 3" [ref=e280]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e281]:
                      - textbox "Notes and action for Learner 3" [ref=e282]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 3" [ref=e283]:
                      - generic [ref=e284]: London time
                      - textbox "Follow-up date and time for Learner 3" [ref=e285]
                      - generic "Quick follow-up dates for Learner 3" [ref=e286]:
                        - button "+3 days" [ref=e287] [cursor=pointer]
                        - button "+5 days" [ref=e288] [cursor=pointer]
                    - cell "Save" [ref=e289]:
                      - button "Save" [disabled] [ref=e290]
                      - status
                  - 'row "Learner 4 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 4 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 4 Save" [ref=e291]':
                    - rowheader "Learner 4 No phone recorded All cases (1) Report technical issue" [ref=e292]:
                      - strong [ref=e293]: Learner 4
                      - generic [ref=e294]: No phone recorded
                      - button "All cases (1)" [ref=e295] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e297]
                      - group [ref=e298]:
                        - generic "Contact details" [ref=e299] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e300]':
                      - strong [ref=e301]: Missed lecture
                      - generic [ref=e302]: Coach A
                      - generic [ref=e303]: Test lecture
                      - generic [ref=e304]:
                        - generic [ref=e305]:
                          - text: "Missed lecture date:"
                          - time [ref=e306]: 15 Sept 2026
                        - generic [ref=e307]: "Lecture time: Not recorded in source"
                        - generic [ref=e308]:
                          - text: "Ticket opened:"
                          - time [ref=e309]: 1 Oct 2026
                        - generic [ref=e310]:
                          - text: "Call due by:"
                          - time [ref=e311]: 20 Sept 2026
                      - generic [ref=e312]: Due now
                      - button "Full case" [ref=e313] [cursor=pointer]
                    - cell "Call Learner 4 No number recorded" [ref=e314]:
                      - button "Call Learner 4" [disabled] [ref=e316]: Call
                      - generic [ref=e317]: No number recorded
                    - cell "Coach A" [ref=e318]:
                      - strong [ref=e319]: Coach A
                    - cell "Choose outcome…" [ref=e320]:
                      - combobox "Outcome for Learner 4" [ref=e321]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e322]:
                      - textbox "Notes and action for Learner 4" [ref=e323]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 4" [ref=e324]:
                      - generic [ref=e325]: London time
                      - textbox "Follow-up date and time for Learner 4" [ref=e326]
                      - generic "Quick follow-up dates for Learner 4" [ref=e327]:
                        - button "+3 days" [ref=e328] [cursor=pointer]
                        - button "+5 days" [ref=e329] [cursor=pointer]
                    - cell "Save" [ref=e330]:
                      - button "Save" [disabled] [ref=e331]
                      - status
                  - 'row "Learner 5 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 5 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 5 Save" [ref=e332]':
                    - rowheader "Learner 5 No phone recorded All cases (1) Report technical issue" [ref=e333]:
                      - strong [ref=e334]: Learner 5
                      - generic [ref=e335]: No phone recorded
                      - button "All cases (1)" [ref=e336] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e338]
                      - group [ref=e339]:
                        - generic "Contact details" [ref=e340] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e341]':
                      - strong [ref=e342]: Missed lecture
                      - generic [ref=e343]: Coach A
                      - generic [ref=e344]: Test lecture
                      - generic [ref=e345]:
                        - generic [ref=e346]:
                          - text: "Missed lecture date:"
                          - time [ref=e347]: 15 Sept 2026
                        - generic [ref=e348]: "Lecture time: Not recorded in source"
                        - generic [ref=e349]:
                          - text: "Ticket opened:"
                          - time [ref=e350]: 1 Oct 2026
                        - generic [ref=e351]:
                          - text: "Call due by:"
                          - time [ref=e352]: 20 Sept 2026
                      - generic [ref=e353]: Due now
                      - button "Full case" [ref=e354] [cursor=pointer]
                    - cell "Call Learner 5 No number recorded" [ref=e355]:
                      - button "Call Learner 5" [disabled] [ref=e357]: Call
                      - generic [ref=e358]: No number recorded
                    - cell "Coach A" [ref=e359]:
                      - strong [ref=e360]: Coach A
                    - cell "Choose outcome…" [ref=e361]:
                      - combobox "Outcome for Learner 5" [ref=e362]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e363]:
                      - textbox "Notes and action for Learner 5" [ref=e364]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 5" [ref=e365]:
                      - generic [ref=e366]: London time
                      - textbox "Follow-up date and time for Learner 5" [ref=e367]
                      - generic "Quick follow-up dates for Learner 5" [ref=e368]:
                        - button "+3 days" [ref=e369] [cursor=pointer]
                        - button "+5 days" [ref=e370] [cursor=pointer]
                    - cell "Save" [ref=e371]:
                      - button "Save" [disabled] [ref=e372]
                      - status
                  - 'row "Learner 6 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 6 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 6 Save" [ref=e373]':
                    - rowheader "Learner 6 No phone recorded All cases (1) Report technical issue" [ref=e374]:
                      - strong [ref=e375]: Learner 6
                      - generic [ref=e376]: No phone recorded
                      - button "All cases (1)" [ref=e377] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e379]
                      - group [ref=e380]:
                        - generic "Contact details" [ref=e381] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e382]':
                      - strong [ref=e383]: Missed lecture
                      - generic [ref=e384]: Coach A
                      - generic [ref=e385]: Test lecture
                      - generic [ref=e386]:
                        - generic [ref=e387]:
                          - text: "Missed lecture date:"
                          - time [ref=e388]: 15 Sept 2026
                        - generic [ref=e389]: "Lecture time: Not recorded in source"
                        - generic [ref=e390]:
                          - text: "Ticket opened:"
                          - time [ref=e391]: 1 Oct 2026
                        - generic [ref=e392]:
                          - text: "Call due by:"
                          - time [ref=e393]: 20 Sept 2026
                      - generic [ref=e394]: Due now
                      - button "Full case" [ref=e395] [cursor=pointer]
                    - cell "Call Learner 6 No number recorded" [ref=e396]:
                      - button "Call Learner 6" [disabled] [ref=e398]: Call
                      - generic [ref=e399]: No number recorded
                    - cell "Coach A" [ref=e400]:
                      - strong [ref=e401]: Coach A
                    - cell "Choose outcome…" [ref=e402]:
                      - combobox "Outcome for Learner 6" [ref=e403]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e404]:
                      - textbox "Notes and action for Learner 6" [ref=e405]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 6" [ref=e406]:
                      - generic [ref=e407]: London time
                      - textbox "Follow-up date and time for Learner 6" [ref=e408]
                      - generic "Quick follow-up dates for Learner 6" [ref=e409]:
                        - button "+3 days" [ref=e410] [cursor=pointer]
                        - button "+5 days" [ref=e411] [cursor=pointer]
                    - cell "Save" [ref=e412]:
                      - button "Save" [disabled] [ref=e413]
                      - status
                  - 'row "Learner 7 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 7 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 7 Save" [ref=e414]':
                    - rowheader "Learner 7 No phone recorded All cases (1) Report technical issue" [ref=e415]:
                      - strong [ref=e416]: Learner 7
                      - generic [ref=e417]: No phone recorded
                      - button "All cases (1)" [ref=e418] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e420]
                      - group [ref=e421]:
                        - generic "Contact details" [ref=e422] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e423]':
                      - strong [ref=e424]: Missed lecture
                      - generic [ref=e425]: Coach A
                      - generic [ref=e426]: Test lecture
                      - generic [ref=e427]:
                        - generic [ref=e428]:
                          - text: "Missed lecture date:"
                          - time [ref=e429]: 15 Sept 2026
                        - generic [ref=e430]: "Lecture time: Not recorded in source"
                        - generic [ref=e431]:
                          - text: "Ticket opened:"
                          - time [ref=e432]: 1 Oct 2026
                        - generic [ref=e433]:
                          - text: "Call due by:"
                          - time [ref=e434]: 20 Sept 2026
                      - generic [ref=e435]: Due now
                      - button "Full case" [ref=e436] [cursor=pointer]
                    - cell "Call Learner 7 No number recorded" [ref=e437]:
                      - button "Call Learner 7" [disabled] [ref=e439]: Call
                      - generic [ref=e440]: No number recorded
                    - cell "Coach A" [ref=e441]:
                      - strong [ref=e442]: Coach A
                    - cell "Choose outcome…" [ref=e443]:
                      - combobox "Outcome for Learner 7" [ref=e444]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e445]:
                      - textbox "Notes and action for Learner 7" [ref=e446]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 7" [ref=e447]:
                      - generic [ref=e448]: London time
                      - textbox "Follow-up date and time for Learner 7" [ref=e449]
                      - generic "Quick follow-up dates for Learner 7" [ref=e450]:
                        - button "+3 days" [ref=e451] [cursor=pointer]
                        - button "+5 days" [ref=e452] [cursor=pointer]
                    - cell "Save" [ref=e453]:
                      - button "Save" [disabled] [ref=e454]
                      - status
                  - 'row "Learner 8 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 8 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 8 Save" [ref=e455]':
                    - rowheader "Learner 8 No phone recorded All cases (1) Report technical issue" [ref=e456]:
                      - strong [ref=e457]: Learner 8
                      - generic [ref=e458]: No phone recorded
                      - button "All cases (1)" [ref=e459] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e461]
                      - group [ref=e462]:
                        - generic "Contact details" [ref=e463] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e464]':
                      - strong [ref=e465]: Missed lecture
                      - generic [ref=e466]: Coach A
                      - generic [ref=e467]: Test lecture
                      - generic [ref=e468]:
                        - generic [ref=e469]:
                          - text: "Missed lecture date:"
                          - time [ref=e470]: 15 Sept 2026
                        - generic [ref=e471]: "Lecture time: Not recorded in source"
                        - generic [ref=e472]:
                          - text: "Ticket opened:"
                          - time [ref=e473]: 1 Oct 2026
                        - generic [ref=e474]:
                          - text: "Call due by:"
                          - time [ref=e475]: 20 Sept 2026
                      - generic [ref=e476]: Due now
                      - button "Full case" [ref=e477] [cursor=pointer]
                    - cell "Call Learner 8 No number recorded" [ref=e478]:
                      - button "Call Learner 8" [disabled] [ref=e480]: Call
                      - generic [ref=e481]: No number recorded
                    - cell "Coach A" [ref=e482]:
                      - strong [ref=e483]: Coach A
                    - cell "Choose outcome…" [ref=e484]:
                      - combobox "Outcome for Learner 8" [ref=e485]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e486]:
                      - textbox "Notes and action for Learner 8" [ref=e487]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 8" [ref=e488]:
                      - generic [ref=e489]: London time
                      - textbox "Follow-up date and time for Learner 8" [ref=e490]
                      - generic "Quick follow-up dates for Learner 8" [ref=e491]:
                        - button "+3 days" [ref=e492] [cursor=pointer]
                        - button "+5 days" [ref=e493] [cursor=pointer]
                    - cell "Save" [ref=e494]:
                      - button "Save" [disabled] [ref=e495]
                      - status
                  - 'row "Learner 9 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 9 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 9 Save" [ref=e496]':
                    - rowheader "Learner 9 No phone recorded All cases (1) Report technical issue" [ref=e497]:
                      - strong [ref=e498]: Learner 9
                      - generic [ref=e499]: No phone recorded
                      - button "All cases (1)" [ref=e500] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e502]
                      - group [ref=e503]:
                        - generic "Contact details" [ref=e504] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e505]':
                      - strong [ref=e506]: Missed lecture
                      - generic [ref=e507]: Coach A
                      - generic [ref=e508]: Test lecture
                      - generic [ref=e509]:
                        - generic [ref=e510]:
                          - text: "Missed lecture date:"
                          - time [ref=e511]: 15 Sept 2026
                        - generic [ref=e512]: "Lecture time: Not recorded in source"
                        - generic [ref=e513]:
                          - text: "Ticket opened:"
                          - time [ref=e514]: 1 Oct 2026
                        - generic [ref=e515]:
                          - text: "Call due by:"
                          - time [ref=e516]: 20 Sept 2026
                      - generic [ref=e517]: Due now
                      - button "Full case" [ref=e518] [cursor=pointer]
                    - cell "Call Learner 9 No number recorded" [ref=e519]:
                      - button "Call Learner 9" [disabled] [ref=e521]: Call
                      - generic [ref=e522]: No number recorded
                    - cell "Coach A" [ref=e523]:
                      - strong [ref=e524]: Coach A
                    - cell "Choose outcome…" [ref=e525]:
                      - combobox "Outcome for Learner 9" [ref=e526]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e527]:
                      - textbox "Notes and action for Learner 9" [ref=e528]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 9" [ref=e529]:
                      - generic [ref=e530]: London time
                      - textbox "Follow-up date and time for Learner 9" [ref=e531]
                      - generic "Quick follow-up dates for Learner 9" [ref=e532]:
                        - button "+3 days" [ref=e533] [cursor=pointer]
                        - button "+5 days" [ref=e534] [cursor=pointer]
                    - cell "Save" [ref=e535]:
                      - button "Save" [disabled] [ref=e536]
                      - status
                  - 'row "Learner 10 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 10 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 10 Save" [ref=e537]':
                    - rowheader "Learner 10 No phone recorded All cases (1) Report technical issue" [ref=e538]:
                      - strong [ref=e539]: Learner 10
                      - generic [ref=e540]: No phone recorded
                      - button "All cases (1)" [ref=e541] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e543]
                      - group [ref=e544]:
                        - generic "Contact details" [ref=e545] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e546]':
                      - strong [ref=e547]: Missed lecture
                      - generic [ref=e548]: Coach A
                      - generic [ref=e549]: Test lecture
                      - generic [ref=e550]:
                        - generic [ref=e551]:
                          - text: "Missed lecture date:"
                          - time [ref=e552]: 15 Sept 2026
                        - generic [ref=e553]: "Lecture time: Not recorded in source"
                        - generic [ref=e554]:
                          - text: "Ticket opened:"
                          - time [ref=e555]: 1 Oct 2026
                        - generic [ref=e556]:
                          - text: "Call due by:"
                          - time [ref=e557]: 20 Sept 2026
                      - generic [ref=e558]: Due now
                      - button "Full case" [ref=e559] [cursor=pointer]
                    - cell "Call Learner 10 No number recorded" [ref=e560]:
                      - button "Call Learner 10" [disabled] [ref=e562]: Call
                      - generic [ref=e563]: No number recorded
                    - cell "Coach A" [ref=e564]:
                      - strong [ref=e565]: Coach A
                    - cell "Choose outcome…" [ref=e566]:
                      - combobox "Outcome for Learner 10" [ref=e567]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e568]:
                      - textbox "Notes and action for Learner 10" [ref=e569]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 10" [ref=e570]:
                      - generic [ref=e571]: London time
                      - textbox "Follow-up date and time for Learner 10" [ref=e572]
                      - generic "Quick follow-up dates for Learner 10" [ref=e573]:
                        - button "+3 days" [ref=e574] [cursor=pointer]
                        - button "+5 days" [ref=e575] [cursor=pointer]
                    - cell "Save" [ref=e576]:
                      - button "Save" [disabled] [ref=e577]
                      - status
                  - 'row "Learner 11 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 11 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 11 Save" [ref=e578]':
                    - rowheader "Learner 11 No phone recorded All cases (1) Report technical issue" [ref=e579]:
                      - strong [ref=e580]: Learner 11
                      - generic [ref=e581]: No phone recorded
                      - button "All cases (1)" [ref=e582] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e584]
                      - group [ref=e585]:
                        - generic "Contact details" [ref=e586] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e587]':
                      - strong [ref=e588]: Missed lecture
                      - generic [ref=e589]: Coach A
                      - generic [ref=e590]: Test lecture
                      - generic [ref=e591]:
                        - generic [ref=e592]:
                          - text: "Missed lecture date:"
                          - time [ref=e593]: 15 Sept 2026
                        - generic [ref=e594]: "Lecture time: Not recorded in source"
                        - generic [ref=e595]:
                          - text: "Ticket opened:"
                          - time [ref=e596]: 1 Oct 2026
                        - generic [ref=e597]:
                          - text: "Call due by:"
                          - time [ref=e598]: 20 Sept 2026
                      - generic [ref=e599]: Due now
                      - button "Full case" [ref=e600] [cursor=pointer]
                    - cell "Call Learner 11 No number recorded" [ref=e601]:
                      - button "Call Learner 11" [disabled] [ref=e603]: Call
                      - generic [ref=e604]: No number recorded
                    - cell "Coach A" [ref=e605]:
                      - strong [ref=e606]: Coach A
                    - cell "Choose outcome…" [ref=e607]:
                      - combobox "Outcome for Learner 11" [ref=e608]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e609]:
                      - textbox "Notes and action for Learner 11" [ref=e610]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 11" [ref=e611]:
                      - generic [ref=e612]: London time
                      - textbox "Follow-up date and time for Learner 11" [ref=e613]
                      - generic "Quick follow-up dates for Learner 11" [ref=e614]:
                        - button "+3 days" [ref=e615] [cursor=pointer]
                        - button "+5 days" [ref=e616] [cursor=pointer]
                    - cell "Save" [ref=e617]:
                      - button "Save" [disabled] [ref=e618]
                      - status
                  - 'row "Learner 12 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 12 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 12 Save" [ref=e619]':
                    - rowheader "Learner 12 No phone recorded All cases (1) Report technical issue" [ref=e620]:
                      - strong [ref=e621]: Learner 12
                      - generic [ref=e622]: No phone recorded
                      - button "All cases (1)" [ref=e623] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e625]
                      - group [ref=e626]:
                        - generic "Contact details" [ref=e627] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e628]':
                      - strong [ref=e629]: Missed lecture
                      - generic [ref=e630]: Coach A
                      - generic [ref=e631]: Test lecture
                      - generic [ref=e632]:
                        - generic [ref=e633]:
                          - text: "Missed lecture date:"
                          - time [ref=e634]: 15 Sept 2026
                        - generic [ref=e635]: "Lecture time: Not recorded in source"
                        - generic [ref=e636]:
                          - text: "Ticket opened:"
                          - time [ref=e637]: 1 Oct 2026
                        - generic [ref=e638]:
                          - text: "Call due by:"
                          - time [ref=e639]: 20 Sept 2026
                      - generic [ref=e640]: Due now
                      - button "Full case" [ref=e641] [cursor=pointer]
                    - cell "Call Learner 12 No number recorded" [ref=e642]:
                      - button "Call Learner 12" [disabled] [ref=e644]: Call
                      - generic [ref=e645]: No number recorded
                    - cell "Coach A" [ref=e646]:
                      - strong [ref=e647]: Coach A
                    - cell "Choose outcome…" [ref=e648]:
                      - combobox "Outcome for Learner 12" [ref=e649]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e650]:
                      - textbox "Notes and action for Learner 12" [ref=e651]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 12" [ref=e652]:
                      - generic [ref=e653]: London time
                      - textbox "Follow-up date and time for Learner 12" [ref=e654]
                      - generic "Quick follow-up dates for Learner 12" [ref=e655]:
                        - button "+3 days" [ref=e656] [cursor=pointer]
                        - button "+5 days" [ref=e657] [cursor=pointer]
                    - cell "Save" [ref=e658]:
                      - button "Save" [disabled] [ref=e659]
                      - status
                  - 'row "Learner 13 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 13 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 13 Save" [ref=e660]':
                    - rowheader "Learner 13 No phone recorded All cases (1) Report technical issue" [ref=e661]:
                      - strong [ref=e662]: Learner 13
                      - generic [ref=e663]: No phone recorded
                      - button "All cases (1)" [ref=e664] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e666]
                      - group [ref=e667]:
                        - generic "Contact details" [ref=e668] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e669]':
                      - strong [ref=e670]: Missed lecture
                      - generic [ref=e671]: Coach A
                      - generic [ref=e672]: Test lecture
                      - generic [ref=e673]:
                        - generic [ref=e674]:
                          - text: "Missed lecture date:"
                          - time [ref=e675]: 15 Sept 2026
                        - generic [ref=e676]: "Lecture time: Not recorded in source"
                        - generic [ref=e677]:
                          - text: "Ticket opened:"
                          - time [ref=e678]: 1 Oct 2026
                        - generic [ref=e679]:
                          - text: "Call due by:"
                          - time [ref=e680]: 20 Sept 2026
                      - generic [ref=e681]: Due now
                      - button "Full case" [ref=e682] [cursor=pointer]
                    - cell "Call Learner 13 No number recorded" [ref=e683]:
                      - button "Call Learner 13" [disabled] [ref=e685]: Call
                      - generic [ref=e686]: No number recorded
                    - cell "Coach A" [ref=e687]:
                      - strong [ref=e688]: Coach A
                    - cell "Choose outcome…" [ref=e689]:
                      - combobox "Outcome for Learner 13" [ref=e690]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e691]:
                      - textbox "Notes and action for Learner 13" [ref=e692]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 13" [ref=e693]:
                      - generic [ref=e694]: London time
                      - textbox "Follow-up date and time for Learner 13" [ref=e695]
                      - generic "Quick follow-up dates for Learner 13" [ref=e696]:
                        - button "+3 days" [ref=e697] [cursor=pointer]
                        - button "+5 days" [ref=e698] [cursor=pointer]
                    - cell "Save" [ref=e699]:
                      - button "Save" [disabled] [ref=e700]
                      - status
                  - 'row "Learner 14 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 14 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 14 Save" [ref=e701]':
                    - rowheader "Learner 14 No phone recorded All cases (1) Report technical issue" [ref=e702]:
                      - strong [ref=e703]: Learner 14
                      - generic [ref=e704]: No phone recorded
                      - button "All cases (1)" [ref=e705] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e707]
                      - group [ref=e708]:
                        - generic "Contact details" [ref=e709] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e710]':
                      - strong [ref=e711]: Missed lecture
                      - generic [ref=e712]: Coach A
                      - generic [ref=e713]: Test lecture
                      - generic [ref=e714]:
                        - generic [ref=e715]:
                          - text: "Missed lecture date:"
                          - time [ref=e716]: 15 Sept 2026
                        - generic [ref=e717]: "Lecture time: Not recorded in source"
                        - generic [ref=e718]:
                          - text: "Ticket opened:"
                          - time [ref=e719]: 1 Oct 2026
                        - generic [ref=e720]:
                          - text: "Call due by:"
                          - time [ref=e721]: 20 Sept 2026
                      - generic [ref=e722]: Due now
                      - button "Full case" [ref=e723] [cursor=pointer]
                    - cell "Call Learner 14 No number recorded" [ref=e724]:
                      - button "Call Learner 14" [disabled] [ref=e726]: Call
                      - generic [ref=e727]: No number recorded
                    - cell "Coach A" [ref=e728]:
                      - strong [ref=e729]: Coach A
                    - cell "Choose outcome…" [ref=e730]:
                      - combobox "Outcome for Learner 14" [ref=e731]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e732]:
                      - textbox "Notes and action for Learner 14" [ref=e733]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 14" [ref=e734]:
                      - generic [ref=e735]: London time
                      - textbox "Follow-up date and time for Learner 14" [ref=e736]
                      - generic "Quick follow-up dates for Learner 14" [ref=e737]:
                        - button "+3 days" [ref=e738] [cursor=pointer]
                        - button "+5 days" [ref=e739] [cursor=pointer]
                    - cell "Save" [ref=e740]:
                      - button "Save" [disabled] [ref=e741]
                      - status
                  - 'row "Learner 15 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 15 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 15 Save" [ref=e742]':
                    - rowheader "Learner 15 No phone recorded All cases (1) Report technical issue" [ref=e743]:
                      - strong [ref=e744]: Learner 15
                      - generic [ref=e745]: No phone recorded
                      - button "All cases (1)" [ref=e746] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e748]
                      - group [ref=e749]:
                        - generic "Contact details" [ref=e750] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e751]':
                      - strong [ref=e752]: Missed lecture
                      - generic [ref=e753]: Coach A
                      - generic [ref=e754]: Test lecture
                      - generic [ref=e755]:
                        - generic [ref=e756]:
                          - text: "Missed lecture date:"
                          - time [ref=e757]: 15 Sept 2026
                        - generic [ref=e758]: "Lecture time: Not recorded in source"
                        - generic [ref=e759]:
                          - text: "Ticket opened:"
                          - time [ref=e760]: 1 Oct 2026
                        - generic [ref=e761]:
                          - text: "Call due by:"
                          - time [ref=e762]: 20 Sept 2026
                      - generic [ref=e763]: Due now
                      - button "Full case" [ref=e764] [cursor=pointer]
                    - cell "Call Learner 15 No number recorded" [ref=e765]:
                      - button "Call Learner 15" [disabled] [ref=e767]: Call
                      - generic [ref=e768]: No number recorded
                    - cell "Coach A" [ref=e769]:
                      - strong [ref=e770]: Coach A
                    - cell "Choose outcome…" [ref=e771]:
                      - combobox "Outcome for Learner 15" [ref=e772]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e773]:
                      - textbox "Notes and action for Learner 15" [ref=e774]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 15" [ref=e775]:
                      - generic [ref=e776]: London time
                      - textbox "Follow-up date and time for Learner 15" [ref=e777]
                      - generic "Quick follow-up dates for Learner 15" [ref=e778]:
                        - button "+3 days" [ref=e779] [cursor=pointer]
                        - button "+5 days" [ref=e780] [cursor=pointer]
                    - cell "Save" [ref=e781]:
                      - button "Save" [disabled] [ref=e782]
                      - status
                  - 'row "Learner 16 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 16 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 16 Save" [ref=e783]':
                    - rowheader "Learner 16 No phone recorded All cases (1) Report technical issue" [ref=e784]:
                      - strong [ref=e785]: Learner 16
                      - generic [ref=e786]: No phone recorded
                      - button "All cases (1)" [ref=e787] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e789]
                      - group [ref=e790]:
                        - generic "Contact details" [ref=e791] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e792]':
                      - strong [ref=e793]: Missed lecture
                      - generic [ref=e794]: Coach A
                      - generic [ref=e795]: Test lecture
                      - generic [ref=e796]:
                        - generic [ref=e797]:
                          - text: "Missed lecture date:"
                          - time [ref=e798]: 15 Sept 2026
                        - generic [ref=e799]: "Lecture time: Not recorded in source"
                        - generic [ref=e800]:
                          - text: "Ticket opened:"
                          - time [ref=e801]: 1 Oct 2026
                        - generic [ref=e802]:
                          - text: "Call due by:"
                          - time [ref=e803]: 20 Sept 2026
                      - generic [ref=e804]: Due now
                      - button "Full case" [ref=e805] [cursor=pointer]
                    - cell "Call Learner 16 No number recorded" [ref=e806]:
                      - button "Call Learner 16" [disabled] [ref=e808]: Call
                      - generic [ref=e809]: No number recorded
                    - cell "Coach A" [ref=e810]:
                      - strong [ref=e811]: Coach A
                    - cell "Choose outcome…" [ref=e812]:
                      - combobox "Outcome for Learner 16" [ref=e813]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e814]:
                      - textbox "Notes and action for Learner 16" [ref=e815]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 16" [ref=e816]:
                      - generic [ref=e817]: London time
                      - textbox "Follow-up date and time for Learner 16" [ref=e818]
                      - generic "Quick follow-up dates for Learner 16" [ref=e819]:
                        - button "+3 days" [ref=e820] [cursor=pointer]
                        - button "+5 days" [ref=e821] [cursor=pointer]
                    - cell "Save" [ref=e822]:
                      - button "Save" [disabled] [ref=e823]
                      - status
                  - 'row "Learner 17 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 17 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 17 Save" [ref=e824]':
                    - rowheader "Learner 17 No phone recorded All cases (1) Report technical issue" [ref=e825]:
                      - strong [ref=e826]: Learner 17
                      - generic [ref=e827]: No phone recorded
                      - button "All cases (1)" [ref=e828] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e830]
                      - group [ref=e831]:
                        - generic "Contact details" [ref=e832] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e833]':
                      - strong [ref=e834]: Missed lecture
                      - generic [ref=e835]: Coach A
                      - generic [ref=e836]: Test lecture
                      - generic [ref=e837]:
                        - generic [ref=e838]:
                          - text: "Missed lecture date:"
                          - time [ref=e839]: 15 Sept 2026
                        - generic [ref=e840]: "Lecture time: Not recorded in source"
                        - generic [ref=e841]:
                          - text: "Ticket opened:"
                          - time [ref=e842]: 1 Oct 2026
                        - generic [ref=e843]:
                          - text: "Call due by:"
                          - time [ref=e844]: 20 Sept 2026
                      - generic [ref=e845]: Due now
                      - button "Full case" [ref=e846] [cursor=pointer]
                    - cell "Call Learner 17 No number recorded" [ref=e847]:
                      - button "Call Learner 17" [disabled] [ref=e849]: Call
                      - generic [ref=e850]: No number recorded
                    - cell "Coach A" [ref=e851]:
                      - strong [ref=e852]: Coach A
                    - cell "Choose outcome…" [ref=e853]:
                      - combobox "Outcome for Learner 17" [ref=e854]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e855]:
                      - textbox "Notes and action for Learner 17" [ref=e856]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 17" [ref=e857]:
                      - generic [ref=e858]: London time
                      - textbox "Follow-up date and time for Learner 17" [ref=e859]
                      - generic "Quick follow-up dates for Learner 17" [ref=e860]:
                        - button "+3 days" [ref=e861] [cursor=pointer]
                        - button "+5 days" [ref=e862] [cursor=pointer]
                    - cell "Save" [ref=e863]:
                      - button "Save" [disabled] [ref=e864]
                      - status
                  - 'row "Learner 18 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 18 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 18 Save" [ref=e865]':
                    - rowheader "Learner 18 No phone recorded All cases (1) Report technical issue" [ref=e866]:
                      - strong [ref=e867]: Learner 18
                      - generic [ref=e868]: No phone recorded
                      - button "All cases (1)" [ref=e869] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e871]
                      - group [ref=e872]:
                        - generic "Contact details" [ref=e873] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e874]':
                      - strong [ref=e875]: Missed lecture
                      - generic [ref=e876]: Coach A
                      - generic [ref=e877]: Test lecture
                      - generic [ref=e878]:
                        - generic [ref=e879]:
                          - text: "Missed lecture date:"
                          - time [ref=e880]: 15 Sept 2026
                        - generic [ref=e881]: "Lecture time: Not recorded in source"
                        - generic [ref=e882]:
                          - text: "Ticket opened:"
                          - time [ref=e883]: 1 Oct 2026
                        - generic [ref=e884]:
                          - text: "Call due by:"
                          - time [ref=e885]: 20 Sept 2026
                      - generic [ref=e886]: Due now
                      - button "Full case" [ref=e887] [cursor=pointer]
                    - cell "Call Learner 18 No number recorded" [ref=e888]:
                      - button "Call Learner 18" [disabled] [ref=e890]: Call
                      - generic [ref=e891]: No number recorded
                    - cell "Coach A" [ref=e892]:
                      - strong [ref=e893]: Coach A
                    - cell "Choose outcome…" [ref=e894]:
                      - combobox "Outcome for Learner 18" [ref=e895]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e896]:
                      - textbox "Notes and action for Learner 18" [ref=e897]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 18" [ref=e898]:
                      - generic [ref=e899]: London time
                      - textbox "Follow-up date and time for Learner 18" [ref=e900]
                      - generic "Quick follow-up dates for Learner 18" [ref=e901]:
                        - button "+3 days" [ref=e902] [cursor=pointer]
                        - button "+5 days" [ref=e903] [cursor=pointer]
                    - cell "Save" [ref=e904]:
                      - button "Save" [disabled] [ref=e905]
                      - status
                  - 'row "Learner 19 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 19 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 19 Save" [ref=e906]':
                    - rowheader "Learner 19 No phone recorded All cases (1) Report technical issue" [ref=e907]:
                      - strong [ref=e908]: Learner 19
                      - generic [ref=e909]: No phone recorded
                      - button "All cases (1)" [ref=e910] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e912]
                      - group [ref=e913]:
                        - generic "Contact details" [ref=e914] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e915]':
                      - strong [ref=e916]: Missed lecture
                      - generic [ref=e917]: Coach A
                      - generic [ref=e918]: Test lecture
                      - generic [ref=e919]:
                        - generic [ref=e920]:
                          - text: "Missed lecture date:"
                          - time [ref=e921]: 15 Sept 2026
                        - generic [ref=e922]: "Lecture time: Not recorded in source"
                        - generic [ref=e923]:
                          - text: "Ticket opened:"
                          - time [ref=e924]: 1 Oct 2026
                        - generic [ref=e925]:
                          - text: "Call due by:"
                          - time [ref=e926]: 20 Sept 2026
                      - generic [ref=e927]: Due now
                      - button "Full case" [ref=e928] [cursor=pointer]
                    - cell "Call Learner 19 No number recorded" [ref=e929]:
                      - button "Call Learner 19" [disabled] [ref=e931]: Call
                      - generic [ref=e932]: No number recorded
                    - cell "Coach A" [ref=e933]:
                      - strong [ref=e934]: Coach A
                    - cell "Choose outcome…" [ref=e935]:
                      - combobox "Outcome for Learner 19" [ref=e936]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e937]:
                      - textbox "Notes and action for Learner 19" [ref=e938]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 19" [ref=e939]:
                      - generic [ref=e940]: London time
                      - textbox "Follow-up date and time for Learner 19" [ref=e941]
                      - generic "Quick follow-up dates for Learner 19" [ref=e942]:
                        - button "+3 days" [ref=e943] [cursor=pointer]
                        - button "+5 days" [ref=e944] [cursor=pointer]
                    - cell "Save" [ref=e945]:
                      - button "Save" [disabled] [ref=e946]
                      - status
                  - 'row "Learner 20 No phone recorded All cases (1) Report technical issue Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 20 No number recorded Coach A Choose outcome… London time Quick follow-up dates for Learner 20 Save" [ref=e947]':
                    - rowheader "Learner 20 No phone recorded All cases (1) Report technical issue" [ref=e948]:
                      - strong [ref=e949]: Learner 20
                      - generic [ref=e950]: No phone recorded
                      - button "All cases (1)" [ref=e951] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e953]
                      - group [ref=e954]:
                        - generic "Contact details" [ref=e955] [cursor=pointer]
                    - 'cell "Missed lecture Coach A Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e956]':
                      - strong [ref=e957]: Missed lecture
                      - generic [ref=e958]: Coach A
                      - generic [ref=e959]: Test lecture
                      - generic [ref=e960]:
                        - generic [ref=e961]:
                          - text: "Missed lecture date:"
                          - time [ref=e962]: 15 Sept 2026
                        - generic [ref=e963]: "Lecture time: Not recorded in source"
                        - generic [ref=e964]:
                          - text: "Ticket opened:"
                          - time [ref=e965]: 1 Oct 2026
                        - generic [ref=e966]:
                          - text: "Call due by:"
                          - time [ref=e967]: 20 Sept 2026
                      - generic [ref=e968]: Due now
                      - button "Full case" [ref=e969] [cursor=pointer]
                    - cell "Call Learner 20 No number recorded" [ref=e970]:
                      - button "Call Learner 20" [disabled] [ref=e972]: Call
                      - generic [ref=e973]: No number recorded
                    - cell "Coach A" [ref=e974]:
                      - strong [ref=e975]: Coach A
                    - cell "Choose outcome…" [ref=e976]:
                      - combobox "Outcome for Learner 20" [ref=e977]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e978]:
                      - textbox "Notes and action for Learner 20" [ref=e979]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 20" [ref=e980]:
                      - generic [ref=e981]: London time
                      - textbox "Follow-up date and time for Learner 20" [ref=e982]
                      - generic "Quick follow-up dates for Learner 20" [ref=e983]:
                        - button "+3 days" [ref=e984] [cursor=pointer]
                        - button "+5 days" [ref=e985] [cursor=pointer]
                    - cell "Save" [ref=e986]:
                      - button "Save" [disabled] [ref=e987]
                      - status
            - navigation "Ticket pages" [ref=e988]:
              - button "Previous page" [disabled] [ref=e989]
              - generic [ref=e990]:
                - text: Page
                - combobox "Ticket page" [ref=e991]:
                  - option "1" [selected]
                  - option "2"
                - text: of 2
              - button "Next page" [ref=e992] [cursor=pointer]
              - generic [ref=e993]: 20 contacts per page
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import type { Overview, OverviewCase } from '../../src/pages/call-centre/api';
  3   | import { matchesTicketDate, orderTickets } from '../../src/pages/call-centre/engagement/ticketOrder';
  4   | import { contactKey } from '../../src/pages/call-centre/engagement/model';
  5   | 
  6   | function ticket(id: number, fields: Partial<OverviewCase> = {}): OverviewCase {
  7   |   return {
  8   |     id, source_type: 'attendance', source_id: null, learner_name: `Learner ${id}`,
  9   |     learner_email: `learner${id}@example.org`, learner_phone: '', coach: 'Test Coach',
  10  |     organisation: 'Test Company', programme: 'Test Programme', manager_name: '', manager_email: '',
  11  |     issue_name: 'Test lecture', issue_date: '2026-09-15', status: 'new', risk: 'amber',
  12  |     claimed_by: null, claimed_agent_id: null, last_actor: 'System', last_action_at: '2026-10-01T12:00:00Z',
  13  |     attempts: 0, next_followup_at: null, due_at: '2026-09-20T12:00:00Z',
  14  |     sla_breached: false, sla_days_overdue: 0, learner_days_overdue: 0, misses: 1,
  15  |     booking_at: null, ai_summary: '', ai_confidence: null, resolution_option: '', resolved_at: null,
  16  |     resolved_by: '', archived: false, escalated: false, created_at: '2026-10-01T12:00:00Z',
  17  |     purpose: '', requested_by: '', helpdesk: null, promised_at: null, promise_missed: false,
  18  |     promises: { catch_up_session: 7 }, specialist_closes: false, missed_call: false,
  19  |     bookable: [], booking_email: false, booking_links: {}, allocated_agent_id: null, ...fields,
  20  |   };
  21  | }
  22  | 
  23  | async function openSheet(page: Page, cases: OverviewCase[], section = 'missed', lastSync: string | null = null) {
  24  |   await page.addInitScript(() => {
  25  |     if (window.top !== window) return;
  26  |     localStorage.setItem('kbc-auth-user', JSON.stringify({
  27  |       id: 1, email: 'operator@example.org', username: 'operator', displayName: 'Operator',
  28  |       groups: [], access: {}, loggedInAt: new Date().toISOString(),
  29  |     }));
  30  |   });
  31  |   // No test traffic may reach the live API, external services or call providers.
  32  |   await page.routeWebSocket('**', socket => {
  33  |     if (['127.0.0.1', 'localhost'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
  34  |     else socket.close();
  35  |   });
  36  |   const writes: string[] = [];
  37  |   await page.route('**/*', route => {
  38  |     const request = route.request();
  39  |     const url = new URL(request.url());
  40  |     if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
  41  |     if (!url.pathname.startsWith('/api/')) return route.continue();
  42  |     const json = (body: unknown) => route.fulfill({ json: body });
  43  |     if (!['GET', 'HEAD'].includes(request.method())) writes.push(url.pathname);
  44  |     if (url.pathname === '/api/callcentre/config/') {
  45  |       return json({ csrf_token: 'test', agent_id: 1, is_manager: false, is_superuser: false,
  46  |         email_mode: 'dry_run', ai_enabled: false, agents: [], sources: [], cycle: null });
  47  |     }
  48  |     if (url.pathname === '/api/callcentre/overview/') {
  49  |       const overview: Overview = {
  50  |         today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10',
  51  |         generated_at: new Date().toISOString(),
  52  |         access: { role: 'operator', agent_id: 1, is_superuser: false, display_name: 'Operator', email: 'operator@example.org' },
  53  |         agents: [{ id: 1, display_name: 'Operator', zoom_account: 'student', zoom_phone_number: '',
  54  |           target_seconds: 10800, today: { attempts: 0, connected: 0, seconds: 0 },
  55  |           month: { attempts: 0, connected: 0, seconds: 0, resolved: 0, pending: 0,
  56  |             sla_breaches: 0, unique_learners: 0, emails: 0, daily: [] },
  57  |           sync: { last_success_at: null, error: '', recordings_error: '' } }],
  58  |         cases, cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0,
  59  |         sources: [], cycle: lastSync ? { last_success_at: lastSync, details: {} } : null,
  60  |         connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null,
  61  |       };
  62  |       return json(overview);
  63  |     }
  64  |     const detail = url.pathname.match(/^\/api\/callcentre\/tickets\/(\d+)\/$/);
  65  |     if (detail) {
  66  |       const selected = cases.find(c => c.id === Number(detail[1]));
  67  |       return json({ ticket: { ...selected, source_data: {}, priority_why: '' },
  68  |         issues: cases.filter(c => selected && c.status !== 'resolved' && contactKey(c) === contactKey(selected)),
  69  |         calls: [], events: [], emails: [], has_more_events: false });
  70  |     }
  71  |     if (url.pathname === '/api/auth/access/') return json({ id: 1, email: 'operator@example.org', access: {}, groups: [] });
  72  |     return json({});
  73  |   });
  74  |   const errors: string[] = [];
  75  |   page.on('pageerror', error => errors.push(error.message));
  76  |   await page.goto(`/dashboard/call-centre?view=operator&section=${section}`);
  77  |   await expect(page.getByLabel('Ticket order', { exact: true }), `Browser errors: ${errors.join('; ')}`).toBeVisible();
  78  |   return writes;
  79  | }
  80  | 
  81  | const rowIds = (page: Page) => page.locator('[data-sheet-row]').evaluateAll(rows => rows.map(row => Number(row.getAttribute('data-sheet-row'))));
  82  | 
  83  | test('coach, cohort and module combine before contact grouping and preserve hidden drafts', async ({ page }) => {
  84  |   const fields = (coach: string, cohort: string, module: string): Partial<OverviewCase> => ({
  85  |     coach, module, filter_contexts: [{ coach, cohort, module }],
  86  |   });
  87  |   const cases = Array.from({ length: 25 }, (_, index) =>
  88  |     ticket(index + 1, fields('Coach A', 'Cohort 1', 'Marketing')));
  89  |   cases.push(ticket(30, { ...fields('Coach B', 'Cohort 2', 'Finance'),
  90  |     learner_email: 'learner1@example.org', learner_name: 'Learner 1' }));
  91  |   cases.push(ticket(31, fields('Coach B', 'Cohort 1', 'Finance')));
  92  |   cases.push(ticket(32, fields('', '', '')));
  93  |   const writes = await openSheet(page, cases);
> 94  |   await page.getByLabel('Notes and action for Learner 1').fill('Keep these notes on the Marketing ticket.');
      |                                                           ^ Error: locator.fill: Error: strict mode violation: getByLabel('Notes and action for Learner 1') resolved to 11 elements:
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
  145 | test('one learner opens lectures, MCM, PR and other cases across filters without losing drafts', async ({ page }) => {
  146 |   await page.setViewportSize({ width: 1600, height: 1000 });
  147 |   const person = { learner_email: 'same@example.org', learner_name: 'Same Learner', learner_phone: '+447700900123' };
  148 |   const cases = [
  149 |     ticket(1, { ...person, issue_name: 'Risk management' }),
  150 |     ticket(2, { ...person, issue_name: 'Risk management', issue_date: '2026-09-01' }),
  151 |     ticket(3, { ...person, source_type: 'mcm', issue_name: 'Monthly coaching', issue_date: '2026-10-01' }),
  152 |     ticket(4, { ...person, source_type: 'pr', issue_name: 'Progress review', issue_date: '2026-10-05' }),
  153 |     ticket(5, { ...person, source_type: 'epa', issue_name: 'EPA preparation' }),
  154 |     ticket(6, { ...person, source_type: 'employer_feedback', learner_name: 'Same person as employer' }),
  155 |     ticket(7, { learner_name: 'Another learner' }),
  156 |   ];
  157 |   const writes = await openSheet(page, cases);
  158 |   await page.getByLabel('Date filter', { exact: true }).selectOption('day');
  159 |   await page.getByLabel('Ticket date', { exact: true }).fill('2026-09-15');
  160 |   const row = page.locator('[data-sheet-row="1"]');
  161 |   await row.getByRole('button', { name: 'All cases (5)', exact: true }).click();
  162 |   const modal = page.getByRole('dialog', { name: 'Full case', exact: true });
  163 |   const list = modal.getByRole('region', { name: 'All cases for this contact' });
  164 |   await expect(list.getByRole('heading', { name: 'All cases (5)', exact: true })).toBeVisible();
  165 |   await expect(list.locator('[data-contact-case]')).toHaveCount(5);
  166 |   await expect(list).toContainText('Lectures · Risk management');
  167 |   await expect(list).toContainText('Monthly coaching (MCM)');
  168 |   await expect(list).toContainText('Progress reviews (PR)');
  169 |   await expect(list.locator('[data-contact-case="2"]')).toContainText('1 Sept 2026');
  170 |   await expect(list.locator('[data-contact-case="6"]')).toHaveCount(0);
  171 |   await expect(list.locator('[data-contact-case="7"]')).toHaveCount(0);
  172 |   const note = modal.getByRole('textbox', { name: 'Outcome and agreed action', exact: true });
  173 |   await note.fill('Discuss every missed lecture during this single conversation.');
  174 |   await list.locator('[data-contact-case="3"]').click();
  175 |   await note.fill('Monthly coaching needs a separate agreed action.');
  176 |   await list.locator('[data-contact-case="4"]').click();
  177 |   await expect(modal.getByText('Review due: 5 Oct 2026', { exact: true })).toBeVisible();
  178 |   await list.locator('[data-contact-case="1"]').click();
  179 |   await expect(note).toHaveValue('Discuss every missed lecture during this single conversation.');
  180 |   await list.locator('[data-contact-case="3"]').click();
  181 |   await expect(note).toHaveValue('Monthly coaching needs a separate agreed action.');
  182 |   await page.screenshot({ path: test.info().outputPath('all-learner-cases.png') });
  183 |   // One dial request covers the learner; switching cases must not place another call.
  184 |   await modal.getByRole('button', { name: 'Call learner', exact: true }).click();
  185 |   await list.locator('[data-contact-case="4"]').click();
  186 |   expect(writes.filter(path => path.endsWith('/call/'))).toEqual(['/api/callcentre/tickets/3/call/']);
  187 |   await modal.getByRole('button', { name: 'Close full case', exact: true }).click();
  188 |   await expect(page.getByLabel('Ticket date', { exact: true })).toHaveValue('2026-09-15');
  189 |   await page.getByRole('link', { name: 'Due (1)', exact: true }).click();
  190 |   await expect(page.locator('[data-sheet-row]')).toHaveCount(1);
  191 |   await page.getByRole('button', { name: 'All cases (5)', exact: true }).click();
  192 |   await expect(page.locator('[data-contact-case]')).toHaveCount(5);
  193 | });
  194 | 
```