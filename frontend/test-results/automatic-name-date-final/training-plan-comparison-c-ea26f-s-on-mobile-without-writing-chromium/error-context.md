# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-comparison.spec.ts >> comparison shows both timelines above differences, keeps programme filtering and scrolls on mobile without writing
- Location: tests\ui\training-plan-comparison.spec.ts:608:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('region', { name: 'LMS reference timeline', exact: true }).getByTitle('January cohort', { exact: true })
Expected: visible
Error: strict mode violation: getByRole('region', { name: 'LMS reference timeline', exact: true }).getByTitle('January cohort', { exact: true }) resolved to 2 elements:
    1) <p title="January cohort" class="font-extrabold text-gray-800 truncate leading-tight">January cohort</p> aka getByText('January cohort').nth(1)
    2) <p title="January cohort" class="font-extrabold text-gray-800 truncate leading-tight">January cohort</p> aka getByText('January cohort').nth(2)

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('region', { name: 'LMS reference timeline', exact: true }).getByTitle('January cohort', { exact: true })

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
        - generic [ref=e27]: Comparison
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
            - strong [ref=e63]: "2"
            - generic [ref=e64]: Cohorts
        - generic [ref=e65]:
          - img [ref=e67]
          - generic [ref=e72]:
            - strong [ref=e73]: "5"
            - generic [ref=e74]: Groups
        - generic [ref=e75]:
          - img [ref=e77]
          - generic [ref=e81]:
            - strong [ref=e82]: "6"
            - generic [ref=e83]: Modules
        - generic [ref=e84]:
          - img [ref=e86]
          - generic [ref=e89]:
            - strong [ref=e90]: "18"
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
      - button "Exit comparison" [pressed] [ref=e154] [cursor=pointer]:
        - img [ref=e155]
        - text: Exit comparison
    - status [ref=e157]: Compare the current plan with the LMS capture. The zoom filter below applies to both timelines.
    - link "View matching results and differences" [ref=e158] [cursor=pointer]:
      - /url: "#training-plan-differences"
    - region "Comparison zoom filter" [ref=e159]:
      - generic [ref=e160]: "Zoom:"
      - group "Timeline zoom" [ref=e161]:
        - button "Year" [ref=e162] [cursor=pointer]
        - button "Intake" [ref=e163] [cursor=pointer]
        - button "Month" [pressed] [ref=e164] [cursor=pointer]
        - button "Week" [ref=e165] [cursor=pointer]
        - button "Day" [ref=e166] [cursor=pointer]
      - generic [ref=e167]:
        - button "Zoom out" [ref=e168] [cursor=pointer]:
          - img [ref=e169]
        - button "Zoom in" [ref=e170] [cursor=pointer]:
          - img [ref=e171]
    - generic [ref=e172]:
      - tabpanel "Current Training Plan" [ref=e173]:
        - generic [ref=e174]:
          - heading "Current Training Plan" [level=2] [ref=e175]
          - generic [ref=e176]: "Data source: Current plan"
        - generic [ref=e179]:
          - generic [ref=e181]:
            - img [ref=e183]
            - generic [ref=e185]:
              - heading "Programme timeline" [level=3] [ref=e186]
              - paragraph [ref=e187]: Explore delivery dates across programmes and cohorts.
          - generic [ref=e188]:
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
          - generic [ref=e212]:    
          - generic [ref=e214]:
            - generic [ref=e217]:
              - generic [ref=e218]: "2025"
              - generic [ref=e219]: "2026"
            - generic [ref=e222]:
              - generic [ref=e223]: Jan
              - generic [ref=e224]: Feb
              - generic [ref=e225]: Mar
              - generic [ref=e226]: Apr
              - generic [ref=e227]: May
              - generic [ref=e228]: Jun
              - generic [ref=e229]: Jul
              - generic [ref=e230]: Aug
              - generic [ref=e231]: Sep
              - generic [ref=e232]: Oct
              - generic [ref=e233]: Nov
              - generic [ref=e234]: Dec
              - generic [ref=e235]: Jan
              - generic [ref=e236]: Feb
              - generic [ref=e237]: Mar
              - generic [ref=e238]: Apr
              - generic [ref=e239]: May
              - generic [ref=e240]: Jun
              - generic [ref=e241]: Jul
              - generic [ref=e242]: Aug
              - generic [ref=e243]: Sep
              - generic [ref=e244]: Oct
              - generic [ref=e245]: Nov
              - generic [ref=e246]: Dec
          - generic [ref=e250]:
            - generic [ref=e252]:
              - generic [ref=e253]:
                - generic [ref=e255]: 
                - paragraph [ref=e256]: ME L4
                - button "" [ref=e257] [cursor=pointer]:
                  - generic [ref=e258]: 
              - generic [ref=e259]:
                - generic [ref=e260]:
                  - generic [ref=e262]: 
                  - paragraph [ref=e263]: 2 cohorts
                - generic [ref=e264]:
                  - button "" [ref=e265] [cursor=pointer]:
                    - generic [ref=e266]: 
                  - button "" [ref=e267] [cursor=pointer]:
                    - generic [ref=e268]: 
                  - button "" [ref=e269] [cursor=pointer]:
                    - generic [ref=e270]: 
                  - button "" [ref=e271] [cursor=pointer]:
                    - generic [ref=e272]: 
            - generic [ref=e274]:
              - generic [ref=e276]:
                - generic [ref=e278]:
                  - generic [ref=e280]: 
                  - paragraph [ref=e281]: January cohort
                  - generic [ref=e282]: 2026-01-01
                - generic [ref=e283]:
                  - button "" [ref=e284] [cursor=pointer]:
                    - generic [ref=e285]: 
                  - button "" [ref=e286] [cursor=pointer]:
                    - generic [ref=e287]: 
                  - button "" [ref=e288] [cursor=pointer]:
                    - generic [ref=e289]: 
              - generic [ref=e291]:
                - generic [ref=e292]:
                  - generic [ref=e295]:
                    - paragraph [ref=e298]: Group 1
                    - button "" [ref=e299] [cursor=pointer]:
                      - generic [ref=e300]: 
                  - generic [ref=e302]:
                    - paragraph [ref=e305]: Group 2
                    - button "" [ref=e306] [cursor=pointer]:
                      - generic [ref=e307]: 
                - generic [ref=e308]:
                  - generic [ref=e313]: Same module
                  - generic [ref=e318]: Current module
                  - generic [ref=e323]: Third overlapping module
                  - generic [ref=e328]: Changed module
                  - generic [ref=e333]: Partial module
                  - generic:
                    - generic:
                      - generic: NOW
            - generic [ref=e334]:
              - generic [ref=e336]:
                - generic [ref=e338]:
                  - generic [ref=e340]: 
                  - paragraph [ref=e341]: February cohort
                  - generic [ref=e342]: 2026-02-01
                - generic [ref=e343]:
                  - button "" [ref=e344] [cursor=pointer]:
                    - generic [ref=e345]: 
                  - button "" [ref=e346] [cursor=pointer]:
                    - generic [ref=e347]: 
                  - button "" [ref=e348] [cursor=pointer]:
                    - generic [ref=e349]: 
              - generic [ref=e351]:
                - generic [ref=e355]:
                  - paragraph [ref=e358]: Group 1
                  - button "" [ref=e359] [cursor=pointer]:
                    - generic [ref=e360]: 
                - generic [ref=e366]: Repeated module
          - button "Go to today's line" [ref=e367] [cursor=pointer]:
            - img [ref=e368]
      - tabpanel "LMS Training Plan" [ref=e371]:
        - generic [ref=e372]:
          - generic [ref=e373]:
            - img [ref=e375]
            - heading "LMS Training Plan" [level=2] [ref=e379]
            - generic [ref=e380]: "Data source: LMS"
          - paragraph [ref=e381]:
            - img [ref=e382]
            - text: Captured 1/1/2026, 2:00:00 AM · Read only
        - region "LMS reference timeline" [ref=e386]:
          - paragraph [ref=e387]: Group names use LMS labels or confirmed Training Plan matches. Session schedules, holidays, coaches and KSB mappings are not included in the LMS capture.
          - paragraph [ref=e389]:
            - text: 1 LMS module uses its creation date because start_date is missing. These dates are labelled
            - strong [ref=e390]: From created_at
            - text: .
          - generic [ref=e391]:
            - generic [ref=e393]:
              - img [ref=e395]
              - generic [ref=e397]:
                - heading "LMS reference timeline" [level=3] [ref=e398]
                - paragraph [ref=e399]: Captured module dates, preserved for comparison.
            - generic [ref=e400]:
              - generic [ref=e401]:
                - button "Modules ending within 14 days" [ref=e403] [cursor=pointer]:
                  - img [ref=e404]
                - button "Modules 6" [ref=e408] [cursor=pointer]:
                  - img [ref=e409]
                  - text: Modules
                  - generic [ref=e413]: "6"
                - button "Export" [ref=e414] [cursor=pointer]:
                  - img [ref=e415]
                  - text: Export
              - generic [ref=e418]:
                - generic [ref=e419]: Now
                - generic [ref=e421]: LMS · Read only
            - generic [ref=e424]:
              - button " Monthly Module Breakdown Review LMS modules by month, cohort, group and tutor. Session schedules were not captured. 6/6 modules" [ref=e425] [cursor=pointer]:
                - generic [ref=e426]:
                  - generic [ref=e428]: 
                  - generic [ref=e429]:
                    - generic [ref=e430]: Monthly Module Breakdown
                    - generic [ref=e431]: Review LMS modules by month, cohort, group and tutor. Session schedules were not captured.
                - generic [ref=e432]: 6/6 modules
              - generic [ref=e433]:
                - generic [ref=e434]:
                  - generic [ref=e435]: Search modules
                  - generic [ref=e436]: 
                  - textbox "Search modules " [ref=e437]:
                    - /placeholder: Search module, group, tutor...
                - combobox [ref=e438]:
                  - option "All programmes" [selected]
                  - option "ME L4"
                - generic [ref=e439]:
                  - button "All" [ref=e440] [cursor=pointer]
                  - button "Clashes" [ref=e441] [cursor=pointer]
                  - button "Clear" [ref=e442] [cursor=pointer]
                - button "Reset" [disabled] [ref=e443]
              - button " ME L4 6 modules N/A N/A " [ref=e445] [cursor=pointer]:
                - generic [ref=e447]: 
                - generic [ref=e449]:
                  - generic [ref=e450]: ME L4
                  - generic [ref=e451]: 6 modules
                - generic [ref=e452]: N/A
                - generic "Holiday clashes" [ref=e453]: N/A
                - generic [ref=e455]: 
            - generic [ref=e457]:
              - generic [ref=e460]:
                - generic [ref=e461]: "2024"
                - generic [ref=e462]: "2025"
                - generic [ref=e463]: "2026"
              - generic [ref=e466]:
                - generic [ref=e467]: Jan
                - generic [ref=e468]: Feb
                - generic [ref=e469]: Mar
                - generic [ref=e470]: Apr
                - generic [ref=e471]: May
                - generic [ref=e472]: Jun
                - generic [ref=e473]: Jul
                - generic [ref=e474]: Aug
                - generic [ref=e475]: Sep
                - generic [ref=e476]: Oct
                - generic [ref=e477]: Nov
                - generic [ref=e478]: Dec
                - generic [ref=e479]: Jan
                - generic [ref=e480]: Feb
                - generic [ref=e481]: Mar
                - generic [ref=e482]: Apr
                - generic [ref=e483]: May
                - generic [ref=e484]: Jun
                - generic [ref=e485]: Jul
                - generic [ref=e486]: Aug
                - generic [ref=e487]: Sep
                - generic [ref=e488]: Oct
                - generic [ref=e489]: Nov
                - generic [ref=e490]: Dec
                - generic [ref=e491]: Jan
                - generic [ref=e492]: Feb
                - generic [ref=e493]: Mar
                - generic [ref=e494]: Apr
                - generic [ref=e495]: May
                - generic [ref=e496]: Jun
                - generic [ref=e497]: Jul
                - generic [ref=e498]: Aug
                - generic [ref=e499]: Sep
                - generic [ref=e500]: Oct
                - generic [ref=e501]: Nov
                - generic [ref=e502]: Dec
            - generic [ref=e506]:
              - generic [ref=e508]:
                - generic [ref=e509]:
                  - paragraph [ref=e510]: ME L4
                  - button "" [ref=e511] [cursor=pointer]:
                    - generic [ref=e512]: 
                - generic [ref=e514]:
                  - generic [ref=e516]: 
                  - paragraph [ref=e517]: 6 LMS modules
              - generic [ref=e519]:
                - generic [ref=e523]:
                  - paragraph [ref=e524]: January cohort
                  - generic [ref=e525]: 2026-01-12
                - generic [ref=e527]:
                  - paragraph [ref=e534]: Group 1
                  - generic [ref=e535]:
                    - 'generic "LMS: Changed module. Start: 2026-01-12. End: 2026-02-02. Source module ID: 2. Tutor: LMS Tutor Two. From created_at (start_date missing)." [ref=e536]':
                      - generic [ref=e538]:
                        - generic [ref=e540]: Changed module
                        - 'generic "Tutor: LMS Tutor Two" [ref=e541]'
                    - generic:
                      - generic:
                        - generic: NOW
              - generic [ref=e542]:
                - generic [ref=e546]:
                  - paragraph [ref=e547]: February cohort
                  - generic [ref=e548]: 2026-01-05
                - generic [ref=e550]:
                  - paragraph [ref=e557]: Group not provided
                  - generic [ref=e558]:
                    - 'generic "LMS: Repeated module. Start: 2026-01-05. End: 2026-01-19. Source module ID: 4. Tutor: Not assigned." [ref=e559]':
                      - generic [ref=e561]:
                        - generic [ref=e563]: Repeated module
                        - 'generic "Tutor: Not assigned" [ref=e564]'
                    - 'generic "LMS: Repeated module. Start: 2026-01-05. End: 2026-01-19. Source module ID: 5. Tutor: Not assigned." [ref=e565]':
                      - generic [ref=e567]:
                        - generic [ref=e569]: Repeated module
                        - 'generic "Tutor: Not assigned" [ref=e570]'
              - generic [ref=e571]:
                - generic [ref=e575]:
                  - paragraph [ref=e576]: January cohort
                  - generic [ref=e577]: 2026-01-05
                - generic [ref=e579]:
                  - paragraph [ref=e586]: Group 1
                  - generic [ref=e587]:
                    - 'generic "LMS: Same module. Start: 2026-01-05. End: 2026-01-19. Source module ID: 1. Tutor: LMS Tutor One." [ref=e588]':
                      - generic [ref=e590]:
                        - generic [ref=e592]: Same module
                        - 'generic "Tutor: LMS Tutor One" [ref=e593]'
                    - 'generic "LMS: Third overlapping module. Start: 2026-01-05. End: 2026-01-19. Source module ID: 7. Tutor: Not assigned." [ref=e594]':
                      - generic [ref=e596]:
                        - generic [ref=e598]: Third overlapping module
                        - 'generic "Tutor: Not assigned" [ref=e599]'
              - generic [ref=e600]:
                - generic [ref=e604]:
                  - paragraph [ref=e605]: March 2024 LMS cohort
                  - generic [ref=e606]: 2024-03-01
                - generic [ref=e608]:
                  - paragraph [ref=e615]: Group not provided
                  - 'generic "LMS: LMS module. Start: 2024-03-01. End: 2024-03-15. Source module ID: 6. Tutor: Not assigned." [ref=e617]':
                    - generic [ref=e619]:
                      - generic [ref=e621]: LMS module
                      - 'generic "Tutor: Not assigned" [ref=e622]'
            - button "Go to today's line" [ref=e623] [cursor=pointer]:
              - img [ref=e624]
          - group [ref=e627]:
            - generic "LMS modules (7)" [ref=e628] [cursor=pointer]
            - generic [ref=e629]:
              - searchbox "Search LMS modules" [ref=e630]
              - combobox "LMS modules programme" [ref=e631]:
                - option "All programmes" [selected]
                - option "ME L4"
              - combobox "LMS modules dates" [ref=e632]:
                - option "All dates" [selected]
                - option "Missing or invalid dates"
              - button "Reset modules filters" [active] [ref=e633] [cursor=pointer]
            - region "LMS modules table" [ref=e634]:
              - table "All captured LMS modules, including missing or invalid dates" [ref=e635]:
                - caption [ref=e636]: All captured LMS modules, including missing or invalid dates
                - rowgroup [ref=e637]:
                  - row "Programme Cohort Group Module Tutor Start Date End Date" [ref=e638]:
                    - columnheader "Programme" [ref=e639]
                    - columnheader "Cohort" [ref=e640]
                    - columnheader "Group" [ref=e641]
                    - columnheader "Module" [ref=e642]
                    - columnheader "Tutor" [ref=e643]
                    - columnheader "Start Date" [ref=e644]
                    - columnheader "End Date" [ref=e645]
                - rowgroup [ref=e646]:
                  - 'row "ME L4 January cohort From Training Plan Group 1 From Training Plan Changed module ID: 2 LMS Tutor Two 2026-01-12 From created_at 2026-02-02" [ref=e647]':
                    - cell "ME L4" [ref=e648]
                    - cell "January cohort From Training Plan" [ref=e649]:
                      - text: January cohort
                      - generic [ref=e650]: From Training Plan
                    - cell "Group 1 From Training Plan" [ref=e651]:
                      - text: Group 1
                      - generic [ref=e652]: From Training Plan
                    - 'rowheader "Changed module ID: 2" [ref=e653]':
                      - text: Changed module
                      - generic [ref=e654]: "ID: 2"
                    - cell "LMS Tutor Two" [ref=e655]
                    - cell "2026-01-12 From created_at" [ref=e656]:
                      - text: 2026-01-12
                      - generic [ref=e657]: From created_at
                    - cell "2026-02-02" [ref=e658]
                  - 'row "ME L4 January cohort Group 1 Same module ID: 1 LMS Tutor One 2026-01-05 2026-01-19" [ref=e659]':
                    - cell "ME L4" [ref=e660]
                    - cell "January cohort" [ref=e661]
                    - cell "Group 1" [ref=e662]
                    - 'rowheader "Same module ID: 1" [ref=e663]':
                      - text: Same module
                      - generic [ref=e664]: "ID: 1"
                    - cell "LMS Tutor One" [ref=e665]
                    - cell "2026-01-05" [ref=e666]
                    - cell "2026-01-19" [ref=e667]
                  - 'row "ME L4 January cohort Group 2 Partial module ID: 3 Not assigned 2026-01-05 Missing or invalid date range Not provided" [ref=e668]':
                    - cell "ME L4" [ref=e669]
                    - cell "January cohort" [ref=e670]
                    - cell "Group 2" [ref=e671]
                    - 'rowheader "Partial module ID: 3" [ref=e672]':
                      - text: Partial module
                      - generic [ref=e673]: "ID: 3"
                    - cell "Not assigned" [ref=e674]
                    - cell "2026-01-05 Missing or invalid date range" [ref=e675]:
                      - text: 2026-01-05
                      - generic [ref=e676]: Missing or invalid date range
                    - cell "Not provided" [ref=e677]
                  - 'row "ME L4 February cohort Group not provided Repeated module ID: 4 Not assigned 2026-01-05 2026-01-19" [ref=e678]':
                    - cell "ME L4" [ref=e679]
                    - cell "February cohort" [ref=e680]
                    - cell "Group not provided" [ref=e681]
                    - 'rowheader "Repeated module ID: 4" [ref=e682]':
                      - text: Repeated module
                      - generic [ref=e683]: "ID: 4"
                    - cell "Not assigned" [ref=e684]
                    - cell "2026-01-05" [ref=e685]
                    - cell "2026-01-19" [ref=e686]
                  - 'row "ME L4 February cohort Group not provided Repeated module ID: 5 Not assigned 2026-01-05 2026-01-19" [ref=e687]':
                    - cell "ME L4" [ref=e688]
                    - cell "February cohort" [ref=e689]
                    - cell "Group not provided" [ref=e690]
                    - 'rowheader "Repeated module ID: 5" [ref=e691]':
                      - text: Repeated module
                      - generic [ref=e692]: "ID: 5"
                    - cell "Not assigned" [ref=e693]
                    - cell "2026-01-05" [ref=e694]
                    - cell "2026-01-19" [ref=e695]
                  - 'row "ME L4 January cohort Group 1 Third overlapping module ID: 7 Not assigned 2026-01-05 2026-01-19" [ref=e696]':
                    - cell "ME L4" [ref=e697]
                    - cell "January cohort" [ref=e698]
                    - cell "Group 1" [ref=e699]
                    - 'rowheader "Third overlapping module ID: 7" [ref=e700]':
                      - text: Third overlapping module
                      - generic [ref=e701]: "ID: 7"
                    - cell "Not assigned" [ref=e702]
                    - cell "2026-01-05" [ref=e703]
                    - cell "2026-01-19" [ref=e704]
                  - 'row "ME L4 March 2024 LMS cohort Group not provided LMS module ID: 6 Not assigned 2024-03-01 2024-03-15" [ref=e705]':
                    - cell "ME L4" [ref=e706]
                    - cell "March 2024 LMS cohort" [ref=e707]
                    - cell "Group not provided" [ref=e708]
                    - 'rowheader "LMS module ID: 6" [ref=e709]':
                      - text: LMS module
                      - generic [ref=e710]: "ID: 6"
                    - cell "Not assigned" [ref=e711]
                    - cell "2024-03-01" [ref=e712]
                    - cell "2024-03-15" [ref=e713]
    - generic [ref=e714]:
      - region "1. Match records" [ref=e715]:
        - generic [ref=e716]:
          - heading "1. Match records" [level=2] [ref=e717]
          - paragraph [ref=e718]: Automatic matching uses module name and identical valid start dates within the same programme. Cohort and group labels distinguish repeated modules; missing labels or a different cohort name allow a confirmed one-to-one match. Explicit group conflicts prevent automatic matching. To compare a different pair, open Edit Module and save a manual match.
          - status [ref=e719]: 4 confirmed matches · 1 current records unmatched · 1 LMS records unmatched · 1 current records need match review
          - paragraph [ref=e720]: Unmatched and uncertain records are excluded from comparison and difference counts.
        - group [ref=e721]:
          - generic "Matched records (4)" [ref=e722] [cursor=pointer]
        - group [ref=e723]:
          - generic "Unmatched records (2) — excluded from comparison" [ref=e724] [cursor=pointer]
        - group [ref=e725]:
          - generic "Matches needing review (1) — excluded from comparison" [ref=e726] [cursor=pointer]
      - region "Plan differences" [ref=e727]:
        - generic [ref=e728]:
          - generic [ref=e729]:
            - heading "Plan differences" [level=2] [ref=e730]
            - paragraph [ref=e731]: 2. Compare dates and tutors for confirmed automatic or manual matches. Automatic matches require the same start date; manual matches compare the pair you selected.
            - paragraph [ref=e732]: Current end dates follow the timeline session schedule, including holiday extensions.
          - generic [ref=e733]: 4 linked · 1 differences · 2 unchanged · 1 incomplete
        - generic [ref=e734]:
          - generic [ref=e735]:
            - text: Search differences
            - searchbox "Search differences" [ref=e736]
          - generic [ref=e737]:
            - text: Difference programme
            - combobox "Difference programme" [ref=e738]:
              - option "All programmes" [selected]
              - option "ME L4"
          - generic [ref=e739]:
            - text: Difference type
            - combobox "Difference type" [ref=e740]:
              - option "All differences" [selected]
              - option "Dates differ"
              - option "Tutor differs"
              - option "Dates and tutor differ"
              - option "Missing or invalid dates"
          - button "Reset differences filters" [ref=e741] [cursor=pointer]
          - generic [ref=e742]: 2 / 2 matched records to check
        - region "Plan differences table" [ref=e743]:
          - table "Plan differences" [ref=e744]:
            - caption [ref=e745]: Date and tutor differences for confirmed automatic or manual matches. Current end dates include scheduled holiday extensions; LMS dates are shown exactly as stored.
            - rowgroup [ref=e746]:
              - row "Module / Cohort Current Training Plan LMS Training Plan Difference" [ref=e747]:
                - columnheader "Module / Cohort" [ref=e748]
                - columnheader "Current Training Plan" [ref=e749]
                - columnheader "LMS Training Plan" [ref=e750]
                - columnheader "Difference" [ref=e751]
              - row "Start date End date Tutor Start date End date Tutor" [ref=e752]:
                - columnheader "Start date" [ref=e753]
                - columnheader "End date" [ref=e754]
                - columnheader "Tutor" [ref=e755]
                - columnheader "Start date" [ref=e756]
                - columnheader "End date" [ref=e757]
                - columnheader "Tutor" [ref=e758]
            - rowgroup [ref=e759]:
              - 'row "Changed module January cohort · Group 1 2026-01-12 2026-01-26 Saved: 2026-01-19 Plan Tutor Two 2026-01-12 From created_at (start_date missing) 2026-02-02 LMS Tutor Two Dates and tutor differ" [ref=e760]':
                - rowheader "Changed module January cohort · Group 1" [ref=e761]:
                  - text: Changed module
                  - generic [ref=e762]: January cohort · Group 1
                - cell "2026-01-12" [ref=e763]
                - 'cell "2026-01-26 Saved: 2026-01-19" [ref=e764]':
                  - text: 2026-01-26
                  - generic [ref=e765]: "Saved: 2026-01-19"
                - cell "Plan Tutor Two" [ref=e766]
                - cell "2026-01-12 From created_at (start_date missing)" [ref=e767]:
                  - text: 2026-01-12
                  - generic [ref=e768]: From created_at (start_date missing)
                - cell "2026-02-02" [ref=e769]
                - cell "LMS Tutor Two" [ref=e770]
                - cell "Dates and tutor differ" [ref=e771]:
                  - generic [ref=e772]: Dates and tutor differ
              - row "Partial module January cohort · Group 2 2026-01-05 2026-01-19 Not assigned 2026-01-05 Not provided Not assigned Missing or invalid dates" [ref=e773]:
                - rowheader "Partial module January cohort · Group 2" [ref=e774]:
                  - text: Partial module
                  - generic [ref=e775]: January cohort · Group 2
                - cell "2026-01-05" [ref=e776]
                - cell "2026-01-19" [ref=e777]
                - cell "Not assigned" [ref=e778]
                - cell "2026-01-05" [ref=e779]
                - cell "Not provided" [ref=e780]
                - cell "Not assigned" [ref=e781]
                - cell "Missing or invalid dates" [ref=e782]:
                  - generic [ref=e783]: Missing or invalid dates
  - contentinfo [ref=e784]:
    - generic [ref=e785]:
      - generic [ref=e786]:
        - generic [ref=e788]:
          - generic [ref=e789]:
            - img "KBC Crest" [ref=e791]
            - generic [ref=e792]:
              - paragraph [ref=e793]: Kent Business College
              - paragraph [ref=e794]: Communication Centre
          - generic [ref=e796]: Internal Hub
          - paragraph [ref=e797]: Kent Business College internal communication hub. Replacing email dependency with clarity, compliance and collaboration.
          - generic [ref=e798]:
            - generic [ref=e799]:
              - generic [ref=e801] [cursor=pointer]: 
              - generic: Email Us
            - generic [ref=e802]:
              - generic [ref=e804] [cursor=pointer]: 
              - generic: Call Support
            - generic [ref=e805]:
              - generic [ref=e807] [cursor=pointer]: 
              - generic: Open Teams
        - generic [ref=e808]:
          - heading "Platform" [level=4] [ref=e809]
          - list [ref=e810]:
            - listitem [ref=e811]:
              - link "Home" [ref=e812] [cursor=pointer]:
                - /url: /
                - text: Home
            - listitem [ref=e814]:
              - link "News & Announcements" [ref=e815] [cursor=pointer]:
                - /url: /news
                - text: News & Announcements
            - listitem [ref=e817]:
              - link "Internal Dashboard" [ref=e818] [cursor=pointer]:
                - /url: /dashboard
                - text: Internal Dashboard
            - listitem [ref=e820]:
              - link "Risk Register" [ref=e821] [cursor=pointer]:
                - /url: /risk-register
                - text: Risk Register
            - listitem [ref=e823]:
              - link "Departments" [ref=e824] [cursor=pointer]:
                - /url: /departments
                - text: Departments
        - generic [ref=e826]:
          - heading "Resources" [level=4] [ref=e827]
          - list [ref=e828]:
            - listitem [ref=e829]:
              - link "Policies & Guides" [ref=e830] [cursor=pointer]:
                - /url: /documents
                - text: Policies & Guides
            - listitem [ref=e832]:
              - link "Training Plan" [ref=e833] [cursor=pointer]:
                - /url: /training-plan
                - text: Training Plan
            - listitem [ref=e835]:
              - link "Events" [ref=e836] [cursor=pointer]:
                - /url: /events
                - text: Events
            - listitem [ref=e838]:
              - link "Project Hub" [ref=e839] [cursor=pointer]:
                - /url: /dashboard
                - text: Project Hub
            - listitem [ref=e841]:
              - link "IT Help" [ref=e842] [cursor=pointer]:
                - /url: /departments/it
                - text: IT Help
        - generic [ref=e844]:
          - heading "Support" [level=4] [ref=e845]
          - list [ref=e846]:
            - listitem [ref=e847]:
              - link "Feedback" [ref=e848] [cursor=pointer]:
                - /url: /feedback
                - text: Feedback
            - listitem [ref=e850]:
              - link "Accessibility" [ref=e851] [cursor=pointer]:
                - /url: /
                - text: Accessibility
            - listitem [ref=e853]:
              - link "Privacy Notice" [ref=e854] [cursor=pointer]:
                - /url: /
                - text: Privacy Notice
            - listitem [ref=e856]:
              - link "Contact IT" [ref=e857] [cursor=pointer]:
                - /url: /departments/it
                - text: Contact IT
            - listitem [ref=e859]:
              - link "Help Centre" [ref=e860] [cursor=pointer]:
                - /url: /
                - text: Help Centre
      - generic [ref=e862]:
        - paragraph [ref=e863]: © 2026 Kent Business College. Internal use only. All rights reserved.
        - generic [ref=e864]:
          - generic [ref=e865] [cursor=pointer]: Privacy Notice
          - generic [ref=e866] [cursor=pointer]: Accessibility
          - generic [ref=e867] [cursor=pointer]: Cookie Policy
```

# Test source

```ts
  593 |     source('other', 'Other programme', { programme: 'Marketing Manager Level 6' }),
  594 |     source('early', 'Earlier module', { startDate: '2026-01-01' }),
  595 |     source('created', 'Creation date module', { startDate: '2026-01-10', startDateSource: 'created_at' }),
  596 |     source('new', 'Newest module', { startDate: '2027-02-01', endDate: '2027-02-05' }),
  597 |     source('missing', 'Missing dates', { startDate: null }),
  598 |   ], programmes);
  599 |   expect(records.filter(row => row.planProgrammeId === 'me-lvl4').map(row => row.sourceModuleId))
  600 |     .toEqual(['new', 'late', 'created', 'early', 'missing']);
  601 |   const result = buildLmsTimelineLayout(records, programmes);
  602 |   expect(result.groups.map(programme => programme.name)).toEqual(['ME L4', 'MM LVL6']);
  603 |   expect(result.groups[0].rows.map(row => row.dateLbl)).toEqual(['2027-02-01', '2026-01-01']);
  604 |   expect(result.groups[0].rows[1].blks.map(item => item.moduleCatalogueId)).toEqual(['early', 'created', 'late']);
  605 |   expect(result.groups[0].rows[1].blks[1].startDateSource).toBe('created_at');
  606 | });
  607 | 
  608 | test('comparison shows both timelines above differences, keeps programme filtering and scrolls on mobile without writing', async ({ page }, testInfo) => {
  609 |   test.setTimeout(90_000);
  610 |   const user = { id: 1, email: 'comparison@example.com', username: 'comparison', displayName: 'Comparison',
  611 |     groups: ['Admin Access'], access: { adminAccess: true, operationsAccess: true, canManageCohorts: true } };
  612 |   await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  613 |   const names = ['Same module', 'Changed module', 'Partial module', 'Current module', 'Repeated module', 'Third overlapping module'];
  614 |   const items = names.map((moduleName, index) => ({
  615 |     id: index + 1, programmeId: 'me-lvl4', cohortId: index === 4 ? 'c2' : 'c1', cohortName: index === 4 ? 'February cohort' : 'January cohort', program: 'ME L4',
  616 |     startingDateLabel: index === 4 ? '2026-02-01' : '2026-01-01', moduleName, groupName: index === 2 ? 'Group 2' : 'Group 1', coachName: '', tutorName: index === 0 ? 'LMS Tutor One' : index === 1 ? 'Plan Tutor Two' : '', tutorProfileId: '',
  617 |     startDate: index === 1 ? '2026-01-12' : '2026-01-05', endDate: '2026-01-19', sessionsNumber: '3', sessionWeekDay: 'monday',
  618 |     sessionStartTime: '09:00', sessionEndTime: '10:00', sessionKsbMappings: [], sessionCoverage: [], ksbProfileId: '',
  619 |     programmeDisplayOrder: 0, cohortDisplayOrder: index === 4 ? 1 : 0,
  620 |     notes: `__program_id:me-lvl4\n__cohort_id:${index === 4 ? 'c2' : 'c1'}\n__group_id:${index === 2 ? 'g2' : 'g1'}\n__block_id:b${index}\n__module_color:${index === 0 ? '#20869B' : '#B2686D'}`,
  621 |   }));
  622 |   const records = [source('1', names[0], { groupName: 'Group 1' }), source('2', names[1], { groupName: 'Group 1', startDate: '2026-01-12', endDate: '2026-02-02', startDateSource: 'created_at' }),
  623 |     source('3', names[2], { groupName: 'Group 2', endDate: null }), source('4', names[4]), source('5', names[4]),
  624 |     source('6', 'LMS module', { startDate: '2024-03-01', endDate: '2024-03-15' }), source('7', names[5], { groupName: 'Group 1' }),
  625 |     source('excluded', 'Excluded programme module', { programme: 'Other programme' })];
  626 |   const writes: string[] = [];
  627 |   const errors: string[] = [];
  628 |   page.on('pageerror', error => errors.push(error.message));
  629 |   await page.route('**/api/**', async route => {
  630 |     const path = new URL(route.request().url()).pathname;
  631 |     if (path.startsWith('/api/training-plan') && route.request().method() !== 'GET') writes.push(path);
  632 |     let body: unknown = [];
  633 |     let headers = {};
  634 |     if (path === '/api/auth/access/') body = user;
  635 |     if (path === '/api/health/') body = { status: 'ok' };
  636 |     if (path === '/api/training-plan/') body = { items, version: 'v1', count: items.length };
  637 |     if (path === '/api/training-plan-bootstrap/') body = {
  638 |       trainingPlan: { items, version: 'v1', count: items.length },
  639 |       programConfigs: [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#115E59' }],
  640 |       moduleDefinitions: [], catalogModules: [], ksbProfiles: [], tutorProfiles: [], coachProfiles: [],
  641 |       holidays: { items: [], version: 'h1' }, versions: { programConfigs: 'p1', moduleDefinitions: 'm1' },
  642 |     };
  643 |     if (path === '/api/training-plan-program-configs/') {
  644 |       body = [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#115E59' }];
  645 |       headers = { 'X-KBC-Training-Plan-Program-Configs-Version': 'p1' };
  646 |     }
  647 |     if (path === '/api/training-plan-modules/') headers = { 'X-KBC-Training-Plan-Modules-Version': 'm1' };
  648 |     if (path === '/api/training-plan-holidays/') body = { items: [], version: 'h1' };
  649 |     if (path === '/api/training-plan/lms-reference/') body = { reference: {
  650 |       id: 1, createdAt: '2026-01-01T00:00:00Z', createdBy: { id: '1', name: 'Test' }, count: records.length, contentSha256: 'test',
  651 |       records: records.map(({ groupName: _groupName, ...row }) => row),
  652 |     } };
  653 |     if (path === '/api/training-plan/lms-reference/tutors/') body = { tutorNames: { '1': 'LMS Tutor One', '2': 'LMS Tutor Two' } };
  654 |     if (path === '/api/training-plan/lms-reference/cohorts/') body = { cohorts: Object.fromEntries(records.map(row => [row.sourceModuleId, {
  655 |       cohortId: row.sourceModuleId === '2' ? null : row.sourceModuleId === '6' ? 'old-lms-cohort' : ['4', '5'].includes(row.sourceModuleId) ? 'feb-lms-cohort' : 'jan-lms-cohort',
  656 |       cohortName: row.sourceModuleId === '2' ? '' : row.sourceModuleId === '6' ? 'March 2024 LMS cohort' : ['4', '5'].includes(row.sourceModuleId) ? 'February cohort' : 'January cohort',
  657 |       groupName: row.sourceModuleId === '2' ? '' : row.groupName || '',
  658 |     }])) };
  659 |     await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
  660 |   });
  661 |   await page.setViewportSize({ width: 1440, height: 1000 });
  662 |   await page.goto('/training-plan');
  663 |   await expect(page.getByRole('button', { name: /Monthly Module Breakdown/ })).toBeVisible();
  664 |   const table = page.getByRole('table', { name: 'Plan differences', exact: true });
  665 |   await expect(table).toHaveCount(0);
  666 |   await page.getByRole('button', { name: 'Compare plans', exact: true }).click();
  667 |   await expect(table).toBeVisible();
  668 |   await expect(page.getByRole('link', { name: 'View matching results and differences', exact: true })).toHaveAttribute('href', '#training-plan-differences');
  669 |   await expect(page.locator('#current-training-plan-panel')).toBeVisible();
  670 |   await expect(page.locator('#training-plan-lms-reference')).toBeVisible();
  671 |   const currentBox = await page.locator('#current-training-plan-panel').boundingBox();
  672 |   const lmsBox = await page.locator('#training-plan-lms-reference').boundingBox();
  673 |   expect(lmsBox!.y).toBeGreaterThanOrEqual(currentBox!.y + currentBox!.height);
  674 |   expect(Math.abs(lmsBox!.x - currentBox!.x)).toBeLessThan(2);
  675 |   const current = page.locator('#current-training-plan-panel');
  676 |   const scrollRect = await current.locator('.training-plan-gantt-scroll').boundingBox();
  677 |   const firstBar = await current.locator('[data-timeline-block-id="b0"]').boundingBox();
  678 |   expect(firstBar!.x).toBeGreaterThan(scrollRect!.x + 200);
  679 |   expect(firstBar!.x).toBeLessThan(scrollRect!.x + scrollRect!.width);
  680 |   await expect(page.getByRole('region', { name: 'Comparison zoom filter', exact: true })).toBeVisible();
  681 |   const lms = page.getByRole('region', { name: 'LMS reference timeline', exact: true });
  682 |   await expect(lms.getByRole('button', { name: /Monthly Module Breakdown/ })).toBeVisible();
  683 |   const moduleList = lms.getByRole('table', { name: 'All captured LMS modules, including missing or invalid dates', exact: true });
  684 |   await expect(moduleList.locator('tbody tr')).toHaveCount(7);
  685 |   await lms.getByLabel('LMS modules dates', { exact: true }).selectOption('missing');
  686 |   await expect(moduleList.locator('tbody tr')).toHaveCount(1);
  687 |   await expect(moduleList).toContainText('Partial module');
  688 |   await lms.getByRole('button', { name: 'Reset modules filters', exact: true }).click();
  689 |   await lms.getByLabel('Search LMS modules', { exact: true }).fill('LMS Tutor One');
  690 |   await expect(moduleList.locator('tbody tr')).toHaveCount(1);
  691 |   await expect(moduleList).toContainText('Same module');
  692 |   await lms.getByRole('button', { name: 'Reset modules filters', exact: true }).click();
> 693 |   await expect(lms.getByTitle('January cohort', { exact: true })).toBeVisible();
      |                                                                   ^ Error: expect(locator).toBeVisible() failed
  694 |   await expect(lms.locator('[data-lms-cohort]').first()).toHaveAttribute('data-lms-cohort', 'February cohort');
  695 |   await expect(lms.locator('[data-lms-cohort]').last()).toHaveAttribute('data-lms-cohort', 'March 2024 LMS cohort');
  696 |   await expect(lms.getByTitle('Same module', { exact: true })).toHaveCount(0);
  697 |   await expect(lms.getByTitle('Group 1', { exact: true }).first()).toBeVisible();
  698 |   await expect(lms.getByText('No matching LMS dates', { exact: true })).toHaveCount(0);
  699 |   await expect(lms.locator('[data-source="LMS"]')).toHaveCount(6);
  700 |   await expect(lms.getByRole('button', { name: 'Modules 6', exact: true })).toBeVisible();
  701 |   const repeatedColours = await lms.locator('[data-source="LMS"][title^="LMS: Repeated module."]').evaluateAll(bars => bars.map(bar => getComputedStyle(bar).backgroundColor));
  702 |   expect(repeatedColours).toHaveLength(2);
  703 |   expect(new Set(repeatedColours).size).toBe(1);
  704 |   const sourceColour = await lms.locator('[data-source="LMS"][title^="LMS: Same module."]').evaluate(bar => getComputedStyle(bar).backgroundColor);
  705 |   expect(sourceColour).toBe(await current.locator('[data-timeline-block-id="b0"]').evaluate(bar => getComputedStyle(bar).backgroundColor));
  706 |   expect(sourceColour).toBe('rgb(32, 134, 155)');
  707 |   await expect(lms.getByText(/1 LMS module uses its creation date/)).toBeVisible();
  708 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Same module."]')).toHaveAttribute('title', /Tutor: LMS Tutor One/);
  709 |   await expect(lms.getByTitle('Tutor: LMS Tutor One', { exact: true })).toBeVisible();
  710 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Changed module."]')).toHaveAttribute('title', /Tutor: LMS Tutor Two/);
  711 |   const downloading = page.waitForEvent('download');
  712 |   await lms.getByRole('button', { name: 'Export', exact: true }).click();
  713 |   const download = await downloading;
  714 |   const workbook = XLSX.read(readFileSync((await download.path())!), { type: 'buffer' });
  715 |   const exported = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['LMS Training Plan']);
  716 |   expect(exported).toHaveLength(7);
  717 |   expect(exported.some(row => row['Source Module ID'] === 'excluded')).toBe(false);
  718 |   expect(exported.find(row => row['Source Module ID'] === '1')?.['Tutor Name']).toBe('LMS Tutor One');
  719 |   expect(exported.find(row => row['Source Module ID'] === '1')?.Cohort).toBe('January cohort');
  720 |   expect(exported.find(row => row['Source Module ID'] === '1')?.Group).toBe('Group 1');
  721 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Partial module."]')).toHaveCount(0);
  722 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Changed module."]')).toHaveAttribute('title', /Start: 2026-01-12/);
  723 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Changed module."]')).toHaveAttribute('title', /From created_at \(start_date missing\)/);
  724 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Same module."]')).not.toHaveAttribute('title', /From created_at/);
  725 |   await lms.locator('[data-source="LMS"][title^="LMS: Changed module."]').click();
  726 |   const monthlyDates = page.getByRole('table', { name: 'LMS monthly delivery dates', exact: true });
  727 |   await expect(monthlyDates).toBeVisible();
  728 |   await expect(monthlyDates).toContainText('2026-01-12');
  729 |   await expect(monthlyDates).toContainText('2026-02-02');
  730 |   await expect(monthlyDates).toContainText('LMS Tutor Two');
  731 |   await expect(monthlyDates).not.toContainText('delivered');
  732 |   await page.getByRole('button', { name: 'Close module overview dialog', exact: true }).click();
  733 |   for (const timeline of [current, lms]) {
  734 |     const bars = timeline === current
  735 |       ? ['b0', 'b1', 'b5'].map(id => timeline.locator(`[data-timeline-block-id="${id}"]`))
  736 |       : [names[0], names[1], names[5]].map(name => timeline.locator(`[data-source="LMS"][title^="LMS: ${name}."]`));
  737 |     const boxes = await Promise.all(bars.map(bar => bar.boundingBox()));
  738 |     const sorted = boxes.map(box => box!).sort((a, b) => a.y - b.y);
  739 |     expect(sorted[1].y).toBeGreaterThanOrEqual(sorted[0].y + sorted[0].height);
  740 |     expect(sorted[2].y).toBeGreaterThanOrEqual(sorted[1].y + sorted[1].height);
  741 |   }
  742 |   await expect(lms.getByTitle('Edit cohort', { exact: true })).toHaveCount(0);
  743 |   await page.screenshot({ path: testInfo.outputPath('lms-cohort-group-layout.png'), fullPage: true });
  744 |   const comparisonZoom = page.getByRole('region', { name: 'Comparison zoom filter', exact: true });
  745 |   for (const level of ['Year', 'Intake', 'Month', 'Week', 'Day', 'Month']) {
  746 |     await comparisonZoom.getByRole('button', { name: level, exact: true }).click();
  747 |     await lms.locator('.training-plan-gantt-scroll').scrollIntoViewIfNeeded();
  748 |     await expect(lms.locator('[data-source="LMS"]').first()).toBeInViewport();
  749 |   }
  750 |   const grid = await page.locator('#training-plan-comparison').boundingBox();
  751 |   const section = await page.getByRole('region', { name: 'Plan differences', exact: true }).boundingBox();
  752 |   expect(section!.y).toBeGreaterThanOrEqual(grid!.y + grid!.height);
  753 |   await expect(table.getByRole('columnheader', { name: 'Programme', exact: true })).toHaveCount(0);
  754 |   const matchingSection = page.getByRole('region', { name: '1. Match records', exact: true });
  755 |   await expect(matchingSection).toContainText('4 confirmed matches');
  756 |   await expect(matchingSection).toContainText('1 current records unmatched');
  757 |   await expect(matchingSection).toContainText('1 LMS records unmatched');
  758 |   await expect(matchingSection).toContainText('1 current records need match review');
  759 |   await matchingSection.getByText('Matched records (4)', { exact: true }).click();
  760 |   const matchedTable = matchingSection.getByRole('table', { name: 'Confirmed record matches', exact: true });
  761 |   await expect(matchedTable.locator('tbody tr')).toHaveCount(4);
  762 |   await expect(matchedTable.getByRole('row', { name: /Changed module/ })).toContainText('LMS record: 2');
  763 |   await expect(matchedTable.getByRole('row', { name: /Changed module/ })).toContainText('Cohort name from Training Plan');
  764 |   await expect(matchedTable.getByRole('row', { name: /Changed module/ })).toContainText('Group name from Training Plan');
  765 |   await matchingSection.getByText('Unmatched records (2) — excluded from comparison', { exact: true }).click();
  766 |   const unmatchedTable = matchingSection.getByRole('table', { name: 'Unmatched records excluded from comparison', exact: true });
  767 |   await expect(unmatchedTable.locator('tbody tr')).toHaveCount(2);
  768 |   await expect(unmatchedTable).toContainText('Current module');
  769 |   await expect(unmatchedTable).toContainText('No LMS record has the same module name in this programme.');
  770 |   await expect(unmatchedTable).toContainText('LMS module');
  771 |   await matchingSection.getByText('Matches needing review (1) — excluded from comparison', { exact: true }).click();
  772 |   const reviewTable = matchingSection.getByRole('table', { name: 'Uncertain matches excluded from comparison', exact: true });
  773 |   await expect(reviewTable.locator('tbody tr')).toHaveCount(1);
  774 |   await expect(reviewTable).toContainText('LMS record: 4');
  775 |   await expect(reviewTable).toContainText('LMS record: 5');
  776 |   await expect(table.locator('tbody tr')).toHaveCount(2);
  777 |   await expect(page.getByText('4 linked · 1 differences · 2 unchanged · 1 incomplete', { exact: true })).toBeVisible();
  778 |   await expect(table).not.toContainText('Current module');
  779 |   await expect(table).not.toContainText('LMS module');
  780 |   await expect(table).not.toContainText('Repeated module');
  781 |   await expect(table.getByRole('rowheader', { name: /Same module/ })).toHaveCount(0);
  782 |   const changed = table.getByRole('row', { name: /Changed module/ });
  783 |   await expect(changed).toContainText('2026-01-26');
  784 |   await expect(changed).toContainText('2026-01-12');
  785 |   await expect(changed).toContainText('From created_at (start_date missing)');
  786 |   await expect(changed).toContainText('Plan Tutor Two');
  787 |   await expect(changed).toContainText('LMS Tutor Two');
  788 |   await expect(changed).toContainText('Dates and tutor differ');
  789 |   await expect(table.getByRole('row', { name: /Partial module/ })).toContainText('Not provided');
  790 |   await page.getByLabel('Difference programme', { exact: true }).selectOption('me-lvl4');
  791 |   await expect(table.locator('tbody tr')).toHaveCount(2);
  792 |   await page.getByLabel('Difference type', { exact: true }).selectOption('dates');
  793 |   await expect(table.locator('tbody tr')).toHaveCount(1);
```