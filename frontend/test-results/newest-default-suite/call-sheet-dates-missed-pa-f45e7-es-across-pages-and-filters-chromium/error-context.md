# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: call-sheet-dates.spec.ts >> missed paginates twenty contacts and retains notes across pages and filters
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
        - button "Due (0)" [ref=e19] [cursor=pointer]:
          - img [ref=e20]
          - generic [ref=e22]: Due (0)
        - button "Next Day (0)" [ref=e23] [cursor=pointer]:
          - img [ref=e24]
          - generic [ref=e26]: Next Day (0)
        - button "Missed (45)" [ref=e27] [cursor=pointer]:
          - img [ref=e28]
          - generic [ref=e30]: Missed (45)
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
            - button "All (45)" [pressed] [ref=e127] [cursor=pointer]
            - button "Missed session (45)" [ref=e128] [cursor=pointer]
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
              - option "Priority order"
              - option "Oldest first"
              - option "Newest first" [selected]
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
                - option "Test Coach"
            - generic [ref=e142]:
              - text: Cohort
              - combobox "Filter by cohort" [ref=e143]:
                - option "All cohorts" [selected]
                - option "Not recorded"
            - generic [ref=e144]:
              - text: Module
              - combobox "Filter by module" [ref=e145]:
                - option "All modules" [selected]
                - option "Not recorded"
          - paragraph [ref=e146]: Date filters and oldest / newest use the issue date, then the appointment date or ticket opened date if unavailable. Dates are UK calendar days; a range includes both days. Tickets with unsaved edits stay selected for their contact.
          - paragraph [ref=e147]: Call, update the row, then Save. Zoom Phone opens with your caller ID; keep the Zoom desktop app signed in. An outcome is saved against the call Zoom reports, so save once the call has synced.
          - generic [ref=e148]:
            - paragraph [ref=e149]: This section contains 45 open tickets across 45 contacts before the filters below. A contact can have multiple tickets.
            - generic [ref=e150]:
              - text: 1–20 of 45 contacts · Newest first · One row per contact
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
                  - 'row "Learner 28 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 28 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 28 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 28 Save" [ref=e166]':
                    - rowheader "Learner 28 No phone recorded All cases (1) Report technical issue" [ref=e167]:
                      - strong [ref=e168]: Learner 28
                      - generic [ref=e169]: No phone recorded
                      - button "All cases (1)" [ref=e170] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e172]
                      - group [ref=e173]:
                        - generic "Contact details" [ref=e174] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 28 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e175]':
                      - strong [ref=e176]: Missed lecture
                      - generic [ref=e177]: Test Coach
                      - generic [ref=e178]: Test lecture
                      - generic [ref=e179]:
                        - generic [ref=e180]:
                          - text: "Missed lecture date:"
                          - time [ref=e181]: 28 Sept 2026
                        - generic [ref=e182]: "Lecture time: Not recorded in source"
                        - generic [ref=e183]:
                          - text: "Ticket opened:"
                          - time [ref=e184]: 1 Oct 2026
                        - generic [ref=e185]:
                          - text: "Call due by:"
                          - time [ref=e186]: 20 Sept 2026
                      - generic [ref=e187]: Due now
                      - button "Full case" [ref=e188] [cursor=pointer]
                    - cell "Call Learner 28 No number recorded" [ref=e189]:
                      - button "Call Learner 28" [disabled] [ref=e191]: Call
                      - generic [ref=e192]: No number recorded
                    - cell "Test Coach" [ref=e193]:
                      - strong [ref=e194]: Test Coach
                    - cell "Choose outcome…" [ref=e195]:
                      - combobox "Outcome for Learner 28" [ref=e196]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e197]:
                      - textbox "Notes and action for Learner 28" [ref=e198]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 28" [ref=e199]:
                      - generic [ref=e200]: London time
                      - textbox "Follow-up date and time for Learner 28" [ref=e201]
                      - generic "Quick follow-up dates for Learner 28" [ref=e202]:
                        - button "+3 days" [ref=e203] [cursor=pointer]
                        - button "+5 days" [ref=e204] [cursor=pointer]
                    - cell "Save" [ref=e205]:
                      - button "Save" [disabled] [ref=e206]
                      - status
                  - 'row "Learner 27 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 27 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 27 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 27 Save" [ref=e207]':
                    - rowheader "Learner 27 No phone recorded All cases (1) Report technical issue" [ref=e208]:
                      - strong [ref=e209]: Learner 27
                      - generic [ref=e210]: No phone recorded
                      - button "All cases (1)" [ref=e211] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e213]
                      - group [ref=e214]:
                        - generic "Contact details" [ref=e215] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 27 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e216]':
                      - strong [ref=e217]: Missed lecture
                      - generic [ref=e218]: Test Coach
                      - generic [ref=e219]: Test lecture
                      - generic [ref=e220]:
                        - generic [ref=e221]:
                          - text: "Missed lecture date:"
                          - time [ref=e222]: 27 Sept 2026
                        - generic [ref=e223]: "Lecture time: Not recorded in source"
                        - generic [ref=e224]:
                          - text: "Ticket opened:"
                          - time [ref=e225]: 1 Oct 2026
                        - generic [ref=e226]:
                          - text: "Call due by:"
                          - time [ref=e227]: 20 Sept 2026
                      - generic [ref=e228]: Due now
                      - button "Full case" [ref=e229] [cursor=pointer]
                    - cell "Call Learner 27 No number recorded" [ref=e230]:
                      - button "Call Learner 27" [disabled] [ref=e232]: Call
                      - generic [ref=e233]: No number recorded
                    - cell "Test Coach" [ref=e234]:
                      - strong [ref=e235]: Test Coach
                    - cell "Choose outcome…" [ref=e236]:
                      - combobox "Outcome for Learner 27" [ref=e237]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e238]:
                      - textbox "Notes and action for Learner 27" [ref=e239]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 27" [ref=e240]:
                      - generic [ref=e241]: London time
                      - textbox "Follow-up date and time for Learner 27" [ref=e242]
                      - generic "Quick follow-up dates for Learner 27" [ref=e243]:
                        - button "+3 days" [ref=e244] [cursor=pointer]
                        - button "+5 days" [ref=e245] [cursor=pointer]
                    - cell "Save" [ref=e246]:
                      - button "Save" [disabled] [ref=e247]
                      - status
                  - 'row "Learner 26 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 26 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 26 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 26 Save" [ref=e248]':
                    - rowheader "Learner 26 No phone recorded All cases (1) Report technical issue" [ref=e249]:
                      - strong [ref=e250]: Learner 26
                      - generic [ref=e251]: No phone recorded
                      - button "All cases (1)" [ref=e252] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e254]
                      - group [ref=e255]:
                        - generic "Contact details" [ref=e256] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 26 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e257]':
                      - strong [ref=e258]: Missed lecture
                      - generic [ref=e259]: Test Coach
                      - generic [ref=e260]: Test lecture
                      - generic [ref=e261]:
                        - generic [ref=e262]:
                          - text: "Missed lecture date:"
                          - time [ref=e263]: 26 Sept 2026
                        - generic [ref=e264]: "Lecture time: Not recorded in source"
                        - generic [ref=e265]:
                          - text: "Ticket opened:"
                          - time [ref=e266]: 1 Oct 2026
                        - generic [ref=e267]:
                          - text: "Call due by:"
                          - time [ref=e268]: 20 Sept 2026
                      - generic [ref=e269]: Due now
                      - button "Full case" [ref=e270] [cursor=pointer]
                    - cell "Call Learner 26 No number recorded" [ref=e271]:
                      - button "Call Learner 26" [disabled] [ref=e273]: Call
                      - generic [ref=e274]: No number recorded
                    - cell "Test Coach" [ref=e275]:
                      - strong [ref=e276]: Test Coach
                    - cell "Choose outcome…" [ref=e277]:
                      - combobox "Outcome for Learner 26" [ref=e278]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e279]:
                      - textbox "Notes and action for Learner 26" [ref=e280]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 26" [ref=e281]:
                      - generic [ref=e282]: London time
                      - textbox "Follow-up date and time for Learner 26" [ref=e283]
                      - generic "Quick follow-up dates for Learner 26" [ref=e284]:
                        - button "+3 days" [ref=e285] [cursor=pointer]
                        - button "+5 days" [ref=e286] [cursor=pointer]
                    - cell "Save" [ref=e287]:
                      - button "Save" [disabled] [ref=e288]
                      - status
                  - 'row "Learner 25 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 25 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 25 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 25 Save" [ref=e289]':
                    - rowheader "Learner 25 No phone recorded All cases (1) Report technical issue" [ref=e290]:
                      - strong [ref=e291]: Learner 25
                      - generic [ref=e292]: No phone recorded
                      - button "All cases (1)" [ref=e293] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e295]
                      - group [ref=e296]:
                        - generic "Contact details" [ref=e297] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 25 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e298]':
                      - strong [ref=e299]: Missed lecture
                      - generic [ref=e300]: Test Coach
                      - generic [ref=e301]: Test lecture
                      - generic [ref=e302]:
                        - generic [ref=e303]:
                          - text: "Missed lecture date:"
                          - time [ref=e304]: 25 Sept 2026
                        - generic [ref=e305]: "Lecture time: Not recorded in source"
                        - generic [ref=e306]:
                          - text: "Ticket opened:"
                          - time [ref=e307]: 1 Oct 2026
                        - generic [ref=e308]:
                          - text: "Call due by:"
                          - time [ref=e309]: 20 Sept 2026
                      - generic [ref=e310]: Due now
                      - button "Full case" [ref=e311] [cursor=pointer]
                    - cell "Call Learner 25 No number recorded" [ref=e312]:
                      - button "Call Learner 25" [disabled] [ref=e314]: Call
                      - generic [ref=e315]: No number recorded
                    - cell "Test Coach" [ref=e316]:
                      - strong [ref=e317]: Test Coach
                    - cell "Choose outcome…" [ref=e318]:
                      - combobox "Outcome for Learner 25" [ref=e319]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e320]:
                      - textbox "Notes and action for Learner 25" [ref=e321]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 25" [ref=e322]:
                      - generic [ref=e323]: London time
                      - textbox "Follow-up date and time for Learner 25" [ref=e324]
                      - generic "Quick follow-up dates for Learner 25" [ref=e325]:
                        - button "+3 days" [ref=e326] [cursor=pointer]
                        - button "+5 days" [ref=e327] [cursor=pointer]
                    - cell "Save" [ref=e328]:
                      - button "Save" [disabled] [ref=e329]
                      - status
                  - 'row "Learner 24 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 24 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 24 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 24 Save" [ref=e330]':
                    - rowheader "Learner 24 No phone recorded All cases (1) Report technical issue" [ref=e331]:
                      - strong [ref=e332]: Learner 24
                      - generic [ref=e333]: No phone recorded
                      - button "All cases (1)" [ref=e334] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e336]
                      - group [ref=e337]:
                        - generic "Contact details" [ref=e338] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 24 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e339]':
                      - strong [ref=e340]: Missed lecture
                      - generic [ref=e341]: Test Coach
                      - generic [ref=e342]: Test lecture
                      - generic [ref=e343]:
                        - generic [ref=e344]:
                          - text: "Missed lecture date:"
                          - time [ref=e345]: 24 Sept 2026
                        - generic [ref=e346]: "Lecture time: Not recorded in source"
                        - generic [ref=e347]:
                          - text: "Ticket opened:"
                          - time [ref=e348]: 1 Oct 2026
                        - generic [ref=e349]:
                          - text: "Call due by:"
                          - time [ref=e350]: 20 Sept 2026
                      - generic [ref=e351]: Due now
                      - button "Full case" [ref=e352] [cursor=pointer]
                    - cell "Call Learner 24 No number recorded" [ref=e353]:
                      - button "Call Learner 24" [disabled] [ref=e355]: Call
                      - generic [ref=e356]: No number recorded
                    - cell "Test Coach" [ref=e357]:
                      - strong [ref=e358]: Test Coach
                    - cell "Choose outcome…" [ref=e359]:
                      - combobox "Outcome for Learner 24" [ref=e360]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e361]:
                      - textbox "Notes and action for Learner 24" [ref=e362]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 24" [ref=e363]:
                      - generic [ref=e364]: London time
                      - textbox "Follow-up date and time for Learner 24" [ref=e365]
                      - generic "Quick follow-up dates for Learner 24" [ref=e366]:
                        - button "+3 days" [ref=e367] [cursor=pointer]
                        - button "+5 days" [ref=e368] [cursor=pointer]
                    - cell "Save" [ref=e369]:
                      - button "Save" [disabled] [ref=e370]
                      - status
                  - 'row "Learner 23 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 23 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 23 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 23 Save" [ref=e371]':
                    - rowheader "Learner 23 No phone recorded All cases (1) Report technical issue" [ref=e372]:
                      - strong [ref=e373]: Learner 23
                      - generic [ref=e374]: No phone recorded
                      - button "All cases (1)" [ref=e375] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e377]
                      - group [ref=e378]:
                        - generic "Contact details" [ref=e379] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 23 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e380]':
                      - strong [ref=e381]: Missed lecture
                      - generic [ref=e382]: Test Coach
                      - generic [ref=e383]: Test lecture
                      - generic [ref=e384]:
                        - generic [ref=e385]:
                          - text: "Missed lecture date:"
                          - time [ref=e386]: 23 Sept 2026
                        - generic [ref=e387]: "Lecture time: Not recorded in source"
                        - generic [ref=e388]:
                          - text: "Ticket opened:"
                          - time [ref=e389]: 1 Oct 2026
                        - generic [ref=e390]:
                          - text: "Call due by:"
                          - time [ref=e391]: 20 Sept 2026
                      - generic [ref=e392]: Due now
                      - button "Full case" [ref=e393] [cursor=pointer]
                    - cell "Call Learner 23 No number recorded" [ref=e394]:
                      - button "Call Learner 23" [disabled] [ref=e396]: Call
                      - generic [ref=e397]: No number recorded
                    - cell "Test Coach" [ref=e398]:
                      - strong [ref=e399]: Test Coach
                    - cell "Choose outcome…" [ref=e400]:
                      - combobox "Outcome for Learner 23" [ref=e401]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e402]:
                      - textbox "Notes and action for Learner 23" [ref=e403]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 23" [ref=e404]:
                      - generic [ref=e405]: London time
                      - textbox "Follow-up date and time for Learner 23" [ref=e406]
                      - generic "Quick follow-up dates for Learner 23" [ref=e407]:
                        - button "+3 days" [ref=e408] [cursor=pointer]
                        - button "+5 days" [ref=e409] [cursor=pointer]
                    - cell "Save" [ref=e410]:
                      - button "Save" [disabled] [ref=e411]
                      - status
                  - 'row "Learner 22 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 22 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 22 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 22 Save" [ref=e412]':
                    - rowheader "Learner 22 No phone recorded All cases (1) Report technical issue" [ref=e413]:
                      - strong [ref=e414]: Learner 22
                      - generic [ref=e415]: No phone recorded
                      - button "All cases (1)" [ref=e416] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e418]
                      - group [ref=e419]:
                        - generic "Contact details" [ref=e420] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 22 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e421]':
                      - strong [ref=e422]: Missed lecture
                      - generic [ref=e423]: Test Coach
                      - generic [ref=e424]: Test lecture
                      - generic [ref=e425]:
                        - generic [ref=e426]:
                          - text: "Missed lecture date:"
                          - time [ref=e427]: 22 Sept 2026
                        - generic [ref=e428]: "Lecture time: Not recorded in source"
                        - generic [ref=e429]:
                          - text: "Ticket opened:"
                          - time [ref=e430]: 1 Oct 2026
                        - generic [ref=e431]:
                          - text: "Call due by:"
                          - time [ref=e432]: 20 Sept 2026
                      - generic [ref=e433]: Due now
                      - button "Full case" [ref=e434] [cursor=pointer]
                    - cell "Call Learner 22 No number recorded" [ref=e435]:
                      - button "Call Learner 22" [disabled] [ref=e437]: Call
                      - generic [ref=e438]: No number recorded
                    - cell "Test Coach" [ref=e439]:
                      - strong [ref=e440]: Test Coach
                    - cell "Choose outcome…" [ref=e441]:
                      - combobox "Outcome for Learner 22" [ref=e442]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e443]:
                      - textbox "Notes and action for Learner 22" [ref=e444]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 22" [ref=e445]:
                      - generic [ref=e446]: London time
                      - textbox "Follow-up date and time for Learner 22" [ref=e447]
                      - generic "Quick follow-up dates for Learner 22" [ref=e448]:
                        - button "+3 days" [ref=e449] [cursor=pointer]
                        - button "+5 days" [ref=e450] [cursor=pointer]
                    - cell "Save" [ref=e451]:
                      - button "Save" [disabled] [ref=e452]
                      - status
                  - 'row "Learner 21 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 21 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 21 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 21 Save" [ref=e453]':
                    - rowheader "Learner 21 No phone recorded All cases (1) Report technical issue" [ref=e454]:
                      - strong [ref=e455]: Learner 21
                      - generic [ref=e456]: No phone recorded
                      - button "All cases (1)" [ref=e457] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e459]
                      - group [ref=e460]:
                        - generic "Contact details" [ref=e461] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 21 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e462]':
                      - strong [ref=e463]: Missed lecture
                      - generic [ref=e464]: Test Coach
                      - generic [ref=e465]: Test lecture
                      - generic [ref=e466]:
                        - generic [ref=e467]:
                          - text: "Missed lecture date:"
                          - time [ref=e468]: 21 Sept 2026
                        - generic [ref=e469]: "Lecture time: Not recorded in source"
                        - generic [ref=e470]:
                          - text: "Ticket opened:"
                          - time [ref=e471]: 1 Oct 2026
                        - generic [ref=e472]:
                          - text: "Call due by:"
                          - time [ref=e473]: 20 Sept 2026
                      - generic [ref=e474]: Due now
                      - button "Full case" [ref=e475] [cursor=pointer]
                    - cell "Call Learner 21 No number recorded" [ref=e476]:
                      - button "Call Learner 21" [disabled] [ref=e478]: Call
                      - generic [ref=e479]: No number recorded
                    - cell "Test Coach" [ref=e480]:
                      - strong [ref=e481]: Test Coach
                    - cell "Choose outcome…" [ref=e482]:
                      - combobox "Outcome for Learner 21" [ref=e483]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e484]:
                      - textbox "Notes and action for Learner 21" [ref=e485]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 21" [ref=e486]:
                      - generic [ref=e487]: London time
                      - textbox "Follow-up date and time for Learner 21" [ref=e488]
                      - generic "Quick follow-up dates for Learner 21" [ref=e489]:
                        - button "+3 days" [ref=e490] [cursor=pointer]
                        - button "+5 days" [ref=e491] [cursor=pointer]
                    - cell "Save" [ref=e492]:
                      - button "Save" [disabled] [ref=e493]
                      - status
                  - 'row "Learner 20 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 20 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 20 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 20 Save" [ref=e494]':
                    - rowheader "Learner 20 No phone recorded All cases (1) Report technical issue" [ref=e495]:
                      - strong [ref=e496]: Learner 20
                      - generic [ref=e497]: No phone recorded
                      - button "All cases (1)" [ref=e498] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e500]
                      - group [ref=e501]:
                        - generic "Contact details" [ref=e502] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 20 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e503]':
                      - strong [ref=e504]: Missed lecture
                      - generic [ref=e505]: Test Coach
                      - generic [ref=e506]: Test lecture
                      - generic [ref=e507]:
                        - generic [ref=e508]:
                          - text: "Missed lecture date:"
                          - time [ref=e509]: 20 Sept 2026
                        - generic [ref=e510]: "Lecture time: Not recorded in source"
                        - generic [ref=e511]:
                          - text: "Ticket opened:"
                          - time [ref=e512]: 1 Oct 2026
                        - generic [ref=e513]:
                          - text: "Call due by:"
                          - time [ref=e514]: 20 Sept 2026
                      - generic [ref=e515]: Due now
                      - button "Full case" [ref=e516] [cursor=pointer]
                    - cell "Call Learner 20 No number recorded" [ref=e517]:
                      - button "Call Learner 20" [disabled] [ref=e519]: Call
                      - generic [ref=e520]: No number recorded
                    - cell "Test Coach" [ref=e521]:
                      - strong [ref=e522]: Test Coach
                    - cell "Choose outcome…" [ref=e523]:
                      - combobox "Outcome for Learner 20" [ref=e524]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e525]:
                      - textbox "Notes and action for Learner 20" [ref=e526]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 20" [ref=e527]:
                      - generic [ref=e528]: London time
                      - textbox "Follow-up date and time for Learner 20" [ref=e529]
                      - generic "Quick follow-up dates for Learner 20" [ref=e530]:
                        - button "+3 days" [ref=e531] [cursor=pointer]
                        - button "+5 days" [ref=e532] [cursor=pointer]
                    - cell "Save" [ref=e533]:
                      - button "Save" [disabled] [ref=e534]
                      - status
                  - 'row "Learner 19 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 19 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 19 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 19 Save" [ref=e535]':
                    - rowheader "Learner 19 No phone recorded All cases (1) Report technical issue" [ref=e536]:
                      - strong [ref=e537]: Learner 19
                      - generic [ref=e538]: No phone recorded
                      - button "All cases (1)" [ref=e539] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e541]
                      - group [ref=e542]:
                        - generic "Contact details" [ref=e543] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 19 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e544]':
                      - strong [ref=e545]: Missed lecture
                      - generic [ref=e546]: Test Coach
                      - generic [ref=e547]: Test lecture
                      - generic [ref=e548]:
                        - generic [ref=e549]:
                          - text: "Missed lecture date:"
                          - time [ref=e550]: 19 Sept 2026
                        - generic [ref=e551]: "Lecture time: Not recorded in source"
                        - generic [ref=e552]:
                          - text: "Ticket opened:"
                          - time [ref=e553]: 1 Oct 2026
                        - generic [ref=e554]:
                          - text: "Call due by:"
                          - time [ref=e555]: 20 Sept 2026
                      - generic [ref=e556]: Due now
                      - button "Full case" [ref=e557] [cursor=pointer]
                    - cell "Call Learner 19 No number recorded" [ref=e558]:
                      - button "Call Learner 19" [disabled] [ref=e560]: Call
                      - generic [ref=e561]: No number recorded
                    - cell "Test Coach" [ref=e562]:
                      - strong [ref=e563]: Test Coach
                    - cell "Choose outcome…" [ref=e564]:
                      - combobox "Outcome for Learner 19" [ref=e565]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e566]:
                      - textbox "Notes and action for Learner 19" [ref=e567]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 19" [ref=e568]:
                      - generic [ref=e569]: London time
                      - textbox "Follow-up date and time for Learner 19" [ref=e570]
                      - generic "Quick follow-up dates for Learner 19" [ref=e571]:
                        - button "+3 days" [ref=e572] [cursor=pointer]
                        - button "+5 days" [ref=e573] [cursor=pointer]
                    - cell "Save" [ref=e574]:
                      - button "Save" [disabled] [ref=e575]
                      - status
                  - 'row "Learner 18 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 18 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 18 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 18 Save" [ref=e576]':
                    - rowheader "Learner 18 No phone recorded All cases (1) Report technical issue" [ref=e577]:
                      - strong [ref=e578]: Learner 18
                      - generic [ref=e579]: No phone recorded
                      - button "All cases (1)" [ref=e580] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e582]
                      - group [ref=e583]:
                        - generic "Contact details" [ref=e584] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 18 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e585]':
                      - strong [ref=e586]: Missed lecture
                      - generic [ref=e587]: Test Coach
                      - generic [ref=e588]: Test lecture
                      - generic [ref=e589]:
                        - generic [ref=e590]:
                          - text: "Missed lecture date:"
                          - time [ref=e591]: 18 Sept 2026
                        - generic [ref=e592]: "Lecture time: Not recorded in source"
                        - generic [ref=e593]:
                          - text: "Ticket opened:"
                          - time [ref=e594]: 1 Oct 2026
                        - generic [ref=e595]:
                          - text: "Call due by:"
                          - time [ref=e596]: 20 Sept 2026
                      - generic [ref=e597]: Due now
                      - button "Full case" [ref=e598] [cursor=pointer]
                    - cell "Call Learner 18 No number recorded" [ref=e599]:
                      - button "Call Learner 18" [disabled] [ref=e601]: Call
                      - generic [ref=e602]: No number recorded
                    - cell "Test Coach" [ref=e603]:
                      - strong [ref=e604]: Test Coach
                    - cell "Choose outcome…" [ref=e605]:
                      - combobox "Outcome for Learner 18" [ref=e606]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e607]:
                      - textbox "Notes and action for Learner 18" [ref=e608]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 18" [ref=e609]:
                      - generic [ref=e610]: London time
                      - textbox "Follow-up date and time for Learner 18" [ref=e611]
                      - generic "Quick follow-up dates for Learner 18" [ref=e612]:
                        - button "+3 days" [ref=e613] [cursor=pointer]
                        - button "+5 days" [ref=e614] [cursor=pointer]
                    - cell "Save" [ref=e615]:
                      - button "Save" [disabled] [ref=e616]
                      - status
                  - 'row "Learner 17 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 17 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 17 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 17 Save" [ref=e617]':
                    - rowheader "Learner 17 No phone recorded All cases (1) Report technical issue" [ref=e618]:
                      - strong [ref=e619]: Learner 17
                      - generic [ref=e620]: No phone recorded
                      - button "All cases (1)" [ref=e621] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e623]
                      - group [ref=e624]:
                        - generic "Contact details" [ref=e625] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 17 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e626]':
                      - strong [ref=e627]: Missed lecture
                      - generic [ref=e628]: Test Coach
                      - generic [ref=e629]: Test lecture
                      - generic [ref=e630]:
                        - generic [ref=e631]:
                          - text: "Missed lecture date:"
                          - time [ref=e632]: 17 Sept 2026
                        - generic [ref=e633]: "Lecture time: Not recorded in source"
                        - generic [ref=e634]:
                          - text: "Ticket opened:"
                          - time [ref=e635]: 1 Oct 2026
                        - generic [ref=e636]:
                          - text: "Call due by:"
                          - time [ref=e637]: 20 Sept 2026
                      - generic [ref=e638]: Due now
                      - button "Full case" [ref=e639] [cursor=pointer]
                    - cell "Call Learner 17 No number recorded" [ref=e640]:
                      - button "Call Learner 17" [disabled] [ref=e642]: Call
                      - generic [ref=e643]: No number recorded
                    - cell "Test Coach" [ref=e644]:
                      - strong [ref=e645]: Test Coach
                    - cell "Choose outcome…" [ref=e646]:
                      - combobox "Outcome for Learner 17" [ref=e647]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e648]:
                      - textbox "Notes and action for Learner 17" [ref=e649]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 17" [ref=e650]:
                      - generic [ref=e651]: London time
                      - textbox "Follow-up date and time for Learner 17" [ref=e652]
                      - generic "Quick follow-up dates for Learner 17" [ref=e653]:
                        - button "+3 days" [ref=e654] [cursor=pointer]
                        - button "+5 days" [ref=e655] [cursor=pointer]
                    - cell "Save" [ref=e656]:
                      - button "Save" [disabled] [ref=e657]
                      - status
                  - 'row "Learner 45 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 17 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 45 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 45 Save" [ref=e658]':
                    - rowheader "Learner 45 No phone recorded All cases (1) Report technical issue" [ref=e659]:
                      - strong [ref=e660]: Learner 45
                      - generic [ref=e661]: No phone recorded
                      - button "All cases (1)" [ref=e662] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e664]
                      - group [ref=e665]:
                        - generic "Contact details" [ref=e666] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 17 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e667]':
                      - strong [ref=e668]: Missed lecture
                      - generic [ref=e669]: Test Coach
                      - generic [ref=e670]: Test lecture
                      - generic [ref=e671]:
                        - generic [ref=e672]:
                          - text: "Missed lecture date:"
                          - time [ref=e673]: 17 Sept 2026
                        - generic [ref=e674]: "Lecture time: Not recorded in source"
                        - generic [ref=e675]:
                          - text: "Ticket opened:"
                          - time [ref=e676]: 1 Oct 2026
                        - generic [ref=e677]:
                          - text: "Call due by:"
                          - time [ref=e678]: 20 Sept 2026
                      - generic [ref=e679]: Due now
                      - button "Full case" [ref=e680] [cursor=pointer]
                    - cell "Call Learner 45 No number recorded" [ref=e681]:
                      - button "Call Learner 45" [disabled] [ref=e683]: Call
                      - generic [ref=e684]: No number recorded
                    - cell "Test Coach" [ref=e685]:
                      - strong [ref=e686]: Test Coach
                    - cell "Choose outcome…" [ref=e687]:
                      - combobox "Outcome for Learner 45" [ref=e688]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e689]:
                      - textbox "Notes and action for Learner 45" [ref=e690]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 45" [ref=e691]:
                      - generic [ref=e692]: London time
                      - textbox "Follow-up date and time for Learner 45" [ref=e693]
                      - generic "Quick follow-up dates for Learner 45" [ref=e694]:
                        - button "+3 days" [ref=e695] [cursor=pointer]
                        - button "+5 days" [ref=e696] [cursor=pointer]
                    - cell "Save" [ref=e697]:
                      - button "Save" [disabled] [ref=e698]
                      - status
                  - 'row "Learner 16 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 16 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 16 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 16 Save" [ref=e699]':
                    - rowheader "Learner 16 No phone recorded All cases (1) Report technical issue" [ref=e700]:
                      - strong [ref=e701]: Learner 16
                      - generic [ref=e702]: No phone recorded
                      - button "All cases (1)" [ref=e703] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e705]
                      - group [ref=e706]:
                        - generic "Contact details" [ref=e707] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 16 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e708]':
                      - strong [ref=e709]: Missed lecture
                      - generic [ref=e710]: Test Coach
                      - generic [ref=e711]: Test lecture
                      - generic [ref=e712]:
                        - generic [ref=e713]:
                          - text: "Missed lecture date:"
                          - time [ref=e714]: 16 Sept 2026
                        - generic [ref=e715]: "Lecture time: Not recorded in source"
                        - generic [ref=e716]:
                          - text: "Ticket opened:"
                          - time [ref=e717]: 1 Oct 2026
                        - generic [ref=e718]:
                          - text: "Call due by:"
                          - time [ref=e719]: 20 Sept 2026
                      - generic [ref=e720]: Due now
                      - button "Full case" [ref=e721] [cursor=pointer]
                    - cell "Call Learner 16 No number recorded" [ref=e722]:
                      - button "Call Learner 16" [disabled] [ref=e724]: Call
                      - generic [ref=e725]: No number recorded
                    - cell "Test Coach" [ref=e726]:
                      - strong [ref=e727]: Test Coach
                    - cell "Choose outcome…" [ref=e728]:
                      - combobox "Outcome for Learner 16" [ref=e729]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e730]:
                      - textbox "Notes and action for Learner 16" [ref=e731]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 16" [ref=e732]:
                      - generic [ref=e733]: London time
                      - textbox "Follow-up date and time for Learner 16" [ref=e734]
                      - generic "Quick follow-up dates for Learner 16" [ref=e735]:
                        - button "+3 days" [ref=e736] [cursor=pointer]
                        - button "+5 days" [ref=e737] [cursor=pointer]
                    - cell "Save" [ref=e738]:
                      - button "Save" [disabled] [ref=e739]
                      - status
                  - 'row "Learner 44 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 16 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 44 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 44 Save" [ref=e740]':
                    - rowheader "Learner 44 No phone recorded All cases (1) Report technical issue" [ref=e741]:
                      - strong [ref=e742]: Learner 44
                      - generic [ref=e743]: No phone recorded
                      - button "All cases (1)" [ref=e744] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e746]
                      - group [ref=e747]:
                        - generic "Contact details" [ref=e748] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 16 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e749]':
                      - strong [ref=e750]: Missed lecture
                      - generic [ref=e751]: Test Coach
                      - generic [ref=e752]: Test lecture
                      - generic [ref=e753]:
                        - generic [ref=e754]:
                          - text: "Missed lecture date:"
                          - time [ref=e755]: 16 Sept 2026
                        - generic [ref=e756]: "Lecture time: Not recorded in source"
                        - generic [ref=e757]:
                          - text: "Ticket opened:"
                          - time [ref=e758]: 1 Oct 2026
                        - generic [ref=e759]:
                          - text: "Call due by:"
                          - time [ref=e760]: 20 Sept 2026
                      - generic [ref=e761]: Due now
                      - button "Full case" [ref=e762] [cursor=pointer]
                    - cell "Call Learner 44 No number recorded" [ref=e763]:
                      - button "Call Learner 44" [disabled] [ref=e765]: Call
                      - generic [ref=e766]: No number recorded
                    - cell "Test Coach" [ref=e767]:
                      - strong [ref=e768]: Test Coach
                    - cell "Choose outcome…" [ref=e769]:
                      - combobox "Outcome for Learner 44" [ref=e770]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e771]:
                      - textbox "Notes and action for Learner 44" [ref=e772]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 44" [ref=e773]:
                      - generic [ref=e774]: London time
                      - textbox "Follow-up date and time for Learner 44" [ref=e775]
                      - generic "Quick follow-up dates for Learner 44" [ref=e776]:
                        - button "+3 days" [ref=e777] [cursor=pointer]
                        - button "+5 days" [ref=e778] [cursor=pointer]
                    - cell "Save" [ref=e779]:
                      - button "Save" [disabled] [ref=e780]
                      - status
                  - 'row "Learner 15 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 15 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 15 Save" [ref=e781]':
                    - rowheader "Learner 15 No phone recorded All cases (1) Report technical issue" [ref=e782]:
                      - strong [ref=e783]: Learner 15
                      - generic [ref=e784]: No phone recorded
                      - button "All cases (1)" [ref=e785] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e787]
                      - group [ref=e788]:
                        - generic "Contact details" [ref=e789] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e790]':
                      - strong [ref=e791]: Missed lecture
                      - generic [ref=e792]: Test Coach
                      - generic [ref=e793]: Test lecture
                      - generic [ref=e794]:
                        - generic [ref=e795]:
                          - text: "Missed lecture date:"
                          - time [ref=e796]: 15 Sept 2026
                        - generic [ref=e797]: "Lecture time: Not recorded in source"
                        - generic [ref=e798]:
                          - text: "Ticket opened:"
                          - time [ref=e799]: 1 Oct 2026
                        - generic [ref=e800]:
                          - text: "Call due by:"
                          - time [ref=e801]: 20 Sept 2026
                      - generic [ref=e802]: Due now
                      - button "Full case" [ref=e803] [cursor=pointer]
                    - cell "Call Learner 15 No number recorded" [ref=e804]:
                      - button "Call Learner 15" [disabled] [ref=e806]: Call
                      - generic [ref=e807]: No number recorded
                    - cell "Test Coach" [ref=e808]:
                      - strong [ref=e809]: Test Coach
                    - cell "Choose outcome…" [ref=e810]:
                      - combobox "Outcome for Learner 15" [ref=e811]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e812]:
                      - textbox "Notes and action for Learner 15" [ref=e813]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 15" [ref=e814]:
                      - generic [ref=e815]: London time
                      - textbox "Follow-up date and time for Learner 15" [ref=e816]
                      - generic "Quick follow-up dates for Learner 15" [ref=e817]:
                        - button "+3 days" [ref=e818] [cursor=pointer]
                        - button "+5 days" [ref=e819] [cursor=pointer]
                    - cell "Save" [ref=e820]:
                      - button "Save" [disabled] [ref=e821]
                      - status
                  - 'row "Learner 43 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 43 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 43 Save" [ref=e822]':
                    - rowheader "Learner 43 No phone recorded All cases (1) Report technical issue" [ref=e823]:
                      - strong [ref=e824]: Learner 43
                      - generic [ref=e825]: No phone recorded
                      - button "All cases (1)" [ref=e826] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e828]
                      - group [ref=e829]:
                        - generic "Contact details" [ref=e830] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 15 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e831]':
                      - strong [ref=e832]: Missed lecture
                      - generic [ref=e833]: Test Coach
                      - generic [ref=e834]: Test lecture
                      - generic [ref=e835]:
                        - generic [ref=e836]:
                          - text: "Missed lecture date:"
                          - time [ref=e837]: 15 Sept 2026
                        - generic [ref=e838]: "Lecture time: Not recorded in source"
                        - generic [ref=e839]:
                          - text: "Ticket opened:"
                          - time [ref=e840]: 1 Oct 2026
                        - generic [ref=e841]:
                          - text: "Call due by:"
                          - time [ref=e842]: 20 Sept 2026
                      - generic [ref=e843]: Due now
                      - button "Full case" [ref=e844] [cursor=pointer]
                    - cell "Call Learner 43 No number recorded" [ref=e845]:
                      - button "Call Learner 43" [disabled] [ref=e847]: Call
                      - generic [ref=e848]: No number recorded
                    - cell "Test Coach" [ref=e849]:
                      - strong [ref=e850]: Test Coach
                    - cell "Choose outcome…" [ref=e851]:
                      - combobox "Outcome for Learner 43" [ref=e852]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e853]:
                      - textbox "Notes and action for Learner 43" [ref=e854]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 43" [ref=e855]:
                      - generic [ref=e856]: London time
                      - textbox "Follow-up date and time for Learner 43" [ref=e857]
                      - generic "Quick follow-up dates for Learner 43" [ref=e858]:
                        - button "+3 days" [ref=e859] [cursor=pointer]
                        - button "+5 days" [ref=e860] [cursor=pointer]
                    - cell "Save" [ref=e861]:
                      - button "Save" [disabled] [ref=e862]
                      - status
                  - 'row "Learner 14 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 14 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 14 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 14 Save" [ref=e863]':
                    - rowheader "Learner 14 No phone recorded All cases (1) Report technical issue" [ref=e864]:
                      - strong [ref=e865]: Learner 14
                      - generic [ref=e866]: No phone recorded
                      - button "All cases (1)" [ref=e867] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e869]
                      - group [ref=e870]:
                        - generic "Contact details" [ref=e871] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 14 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e872]':
                      - strong [ref=e873]: Missed lecture
                      - generic [ref=e874]: Test Coach
                      - generic [ref=e875]: Test lecture
                      - generic [ref=e876]:
                        - generic [ref=e877]:
                          - text: "Missed lecture date:"
                          - time [ref=e878]: 14 Sept 2026
                        - generic [ref=e879]: "Lecture time: Not recorded in source"
                        - generic [ref=e880]:
                          - text: "Ticket opened:"
                          - time [ref=e881]: 1 Oct 2026
                        - generic [ref=e882]:
                          - text: "Call due by:"
                          - time [ref=e883]: 20 Sept 2026
                      - generic [ref=e884]: Due now
                      - button "Full case" [ref=e885] [cursor=pointer]
                    - cell "Call Learner 14 No number recorded" [ref=e886]:
                      - button "Call Learner 14" [disabled] [ref=e888]: Call
                      - generic [ref=e889]: No number recorded
                    - cell "Test Coach" [ref=e890]:
                      - strong [ref=e891]: Test Coach
                    - cell "Choose outcome…" [ref=e892]:
                      - combobox "Outcome for Learner 14" [ref=e893]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e894]:
                      - textbox "Notes and action for Learner 14" [ref=e895]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 14" [ref=e896]:
                      - generic [ref=e897]: London time
                      - textbox "Follow-up date and time for Learner 14" [ref=e898]
                      - generic "Quick follow-up dates for Learner 14" [ref=e899]:
                        - button "+3 days" [ref=e900] [cursor=pointer]
                        - button "+5 days" [ref=e901] [cursor=pointer]
                    - cell "Save" [ref=e902]:
                      - button "Save" [disabled] [ref=e903]
                      - status
                  - 'row "Learner 42 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 14 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 42 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 42 Save" [ref=e904]':
                    - rowheader "Learner 42 No phone recorded All cases (1) Report technical issue" [ref=e905]:
                      - strong [ref=e906]: Learner 42
                      - generic [ref=e907]: No phone recorded
                      - button "All cases (1)" [ref=e908] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e910]
                      - group [ref=e911]:
                        - generic "Contact details" [ref=e912] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 14 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e913]':
                      - strong [ref=e914]: Missed lecture
                      - generic [ref=e915]: Test Coach
                      - generic [ref=e916]: Test lecture
                      - generic [ref=e917]:
                        - generic [ref=e918]:
                          - text: "Missed lecture date:"
                          - time [ref=e919]: 14 Sept 2026
                        - generic [ref=e920]: "Lecture time: Not recorded in source"
                        - generic [ref=e921]:
                          - text: "Ticket opened:"
                          - time [ref=e922]: 1 Oct 2026
                        - generic [ref=e923]:
                          - text: "Call due by:"
                          - time [ref=e924]: 20 Sept 2026
                      - generic [ref=e925]: Due now
                      - button "Full case" [ref=e926] [cursor=pointer]
                    - cell "Call Learner 42 No number recorded" [ref=e927]:
                      - button "Call Learner 42" [disabled] [ref=e929]: Call
                      - generic [ref=e930]: No number recorded
                    - cell "Test Coach" [ref=e931]:
                      - strong [ref=e932]: Test Coach
                    - cell "Choose outcome…" [ref=e933]:
                      - combobox "Outcome for Learner 42" [ref=e934]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e935]:
                      - textbox "Notes and action for Learner 42" [ref=e936]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 42" [ref=e937]:
                      - generic [ref=e938]: London time
                      - textbox "Follow-up date and time for Learner 42" [ref=e939]
                      - generic "Quick follow-up dates for Learner 42" [ref=e940]:
                        - button "+3 days" [ref=e941] [cursor=pointer]
                        - button "+5 days" [ref=e942] [cursor=pointer]
                    - cell "Save" [ref=e943]:
                      - button "Save" [disabled] [ref=e944]
                      - status
                  - 'row "Learner 13 No phone recorded All cases (1) Report technical issue Missed lecture Test Coach Test lecture Missed lecture date: 13 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case Call Learner 13 No number recorded Test Coach Choose outcome… London time Quick follow-up dates for Learner 13 Save" [ref=e945]':
                    - rowheader "Learner 13 No phone recorded All cases (1) Report technical issue" [ref=e946]:
                      - strong [ref=e947]: Learner 13
                      - generic [ref=e948]: No phone recorded
                      - button "All cases (1)" [ref=e949] [cursor=pointer]
                      - button "Report technical issue" [disabled] [ref=e951]
                      - group [ref=e952]:
                        - generic "Contact details" [ref=e953] [cursor=pointer]
                    - 'cell "Missed lecture Test Coach Test lecture Missed lecture date: 13 Sept 2026 Lecture time: Not recorded in source Ticket opened: 1 Oct 2026 Call due by: 20 Sept 2026 Due now Full case" [ref=e954]':
                      - strong [ref=e955]: Missed lecture
                      - generic [ref=e956]: Test Coach
                      - generic [ref=e957]: Test lecture
                      - generic [ref=e958]:
                        - generic [ref=e959]:
                          - text: "Missed lecture date:"
                          - time [ref=e960]: 13 Sept 2026
                        - generic [ref=e961]: "Lecture time: Not recorded in source"
                        - generic [ref=e962]:
                          - text: "Ticket opened:"
                          - time [ref=e963]: 1 Oct 2026
                        - generic [ref=e964]:
                          - text: "Call due by:"
                          - time [ref=e965]: 20 Sept 2026
                      - generic [ref=e966]: Due now
                      - button "Full case" [ref=e967] [cursor=pointer]
                    - cell "Call Learner 13 No number recorded" [ref=e968]:
                      - button "Call Learner 13" [disabled] [ref=e970]: Call
                      - generic [ref=e971]: No number recorded
                    - cell "Test Coach" [ref=e972]:
                      - strong [ref=e973]: Test Coach
                    - cell "Choose outcome…" [ref=e974]:
                      - combobox "Outcome for Learner 13" [ref=e975]:
                        - option "Choose outcome…" [selected]
                        - 'option "Agreed: Book a catch-up session (within 7 days)"'
                        - option "No answer"
                        - option "Wrong number"
                        - option "Callback requested"
                        - option "Refused or problem"
                    - cell [ref=e976]:
                      - textbox "Notes and action for Learner 13" [ref=e977]:
                        - /placeholder: What was agreed? Who will do what, by when?
                    - cell "London time Quick follow-up dates for Learner 13" [ref=e978]:
                      - generic [ref=e979]: London time
                      - textbox "Follow-up date and time for Learner 13" [ref=e980]
                      - generic "Quick follow-up dates for Learner 13" [ref=e981]:
                        - button "+3 days" [ref=e982] [cursor=pointer]
                        - button "+5 days" [ref=e983] [cursor=pointer]
                    - cell "Save" [ref=e984]:
                      - button "Save" [disabled] [ref=e985]
                      - status
            - navigation "Ticket pages" [ref=e986]:
              - button "Previous page" [disabled] [ref=e987]
              - generic [ref=e988]:
                - text: Page
                - combobox "Ticket page" [ref=e989]:
                  - option "1" [selected]
                  - option "2"
                  - option "3"
                - text: of 3
              - button "Next page" [ref=e990] [cursor=pointer]
              - generic [ref=e991]: 20 contacts per page
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