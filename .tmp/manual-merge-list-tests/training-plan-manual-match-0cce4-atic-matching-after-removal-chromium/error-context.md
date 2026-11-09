# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-manual-matching.spec.ts >> manual merge list retains failed removals, lists unavailable LMS links and restores automatic matching after removal
- Location: tests\ui\training-plan-manual-matching.spec.ts:434:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('tabpanel', { name: 'Merge', exact: true }).getByRole('region', { name: 'Saved manual merges', exact: true }).getByRole('listitem')
Expected: 2
Received: 0
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for getByRole('tabpanel', { name: 'Merge', exact: true }).getByRole('region', { name: 'Saved manual merges', exact: true }).getByRole('listitem')
    23 × locator resolved to 0 elements
       - unexpected value "0"

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
        - tab "Current Training Plan" [ref=e101] [cursor=pointer]:
          - img [ref=e102]
          - text: Current Training Plan
        - tab "LMS Training Plan" [ref=e106] [cursor=pointer]:
          - img [ref=e107]
          - text: LMS Training Plan
        - tab "Merge" [active] [selected] [ref=e111] [cursor=pointer]:
          - img [ref=e112]
          - text: Merge
    - text:        
    - tabpanel "Merge" [ref=e116]:
      - generic [ref=e117]:
        - generic [ref=e118]:
          - generic [ref=e119]:
            - heading "Merged Training Plans" [level=2] [ref=e120]:
              - img [ref=e121]
              - text: Merged Training Plans
            - paragraph [ref=e125]: "Each matched pair shares one card: Current above LMS. Select either half to view its module details. Each half shows its own dates."
          - generic "Plan sources" [ref=e126]:
            - generic [ref=e127]: Current Training Plan
            - generic [ref=e128]: LMS Training Plan
            - generic [ref=e129]: Read only
        - generic [ref=e130]:
          - button "Add manual match" [ref=e132] [cursor=pointer]:
            - img [ref=e133]
            - text: Add manual match
          - paragraph [ref=e134]: Use Show merges to filter the timeline. Use Add manual match to choose and link two modules. Automatic matches use the same name and start date in the same programme.
          - paragraph [ref=e135]: Showing all manual and automatic matches, plus unpaired modules.
          - paragraph [ref=e136]: 0 manual pairs · 1 automatic pairs
        - region "Saved manual merges" [ref=e137]:
          - generic [ref=e138]:
            - heading "Manual merges" [level=3] [ref=e139]
            - generic [ref=e140]: "0"
          - paragraph [ref=e141]: All saved manual links, across every programme and timeline filter. Removing a link keeps both modules and their schedules; automatic matching applies again.
          - paragraph [ref=e142]: No saved manual merges yet.
        - generic [ref=e143]:
          - generic [ref=e145]:
            - img [ref=e147]
            - generic [ref=e149]:
              - heading "Combined programme timeline" [level=3] [ref=e150]
              - paragraph [ref=e151]: One date axis for Current and LMS modules.
          - generic [ref=e152]:
            - generic [ref=e153]: "Zoom:"
            - group "Timeline zoom" [ref=e154]:
              - button "Year" [ref=e155] [cursor=pointer]
              - button "Intake" [ref=e156] [cursor=pointer]
              - button "Month" [pressed] [ref=e157] [cursor=pointer]
              - button "Week" [ref=e158] [cursor=pointer]
              - button "Day" [ref=e159] [cursor=pointer]
            - generic [ref=e160]:
              - button "Zoom out" [ref=e161] [cursor=pointer]:
                - img [ref=e162]
              - button "Zoom in" [ref=e163] [cursor=pointer]:
                - img [ref=e164]
            - generic [ref=e165]:
              - generic [ref=e166]: Show merges
              - button "Show merges" [ref=e168] [cursor=pointer]:
                - generic [ref=e169]: All merges
                - generic [ref=e171]: 
            - generic [ref=e172]:
              - button "Modules ending within 14 days" [ref=e174] [cursor=pointer]:
                - img [ref=e175]
              - button "Classes 4" [ref=e179] [cursor=pointer]:
                - img [ref=e180]
                - text: Classes
                - generic [ref=e185]: "4"
            - generic [ref=e186]:
              - generic [ref=e187]: Now
              - generic [ref=e189]: Workshop
          - generic [ref=e192]:
            - generic [ref=e196]: "2026"
            - generic [ref=e199]:
              - generic [ref=e200]: Jan
              - generic [ref=e201]: Feb
              - generic [ref=e202]: Mar
              - generic [ref=e203]: Apr
              - generic [ref=e204]: May
              - generic [ref=e205]: Jun
              - generic [ref=e206]: Jul
              - generic [ref=e207]: Aug
              - generic [ref=e208]: Sep
              - generic [ref=e209]: Oct
              - generic [ref=e210]: Nov
              - generic [ref=e211]: Dec
          - generic [ref=e215]:
            - generic [ref=e217]:
              - generic [ref=e218]:
                - paragraph [ref=e219]: ME L4
                - button "" [expanded] [ref=e220] [cursor=pointer]:
                  - generic [ref=e221]: 
              - generic [ref=e223]:
                - generic [ref=e225]: 
                - paragraph [ref=e226]: Current + LMS Training Plans
            - generic [ref=e228]:
              - generic [ref=e229]:
                - generic [ref=e230]:
                  - generic [ref=e231]: Current Training Plan · Automatic match
                  - generic "January cohort" [ref=e232]
                  - generic [ref=e233]: Group 1
                - generic [ref=e234]:
                  - generic [ref=e235]: LMS Training Plan · Automatic match
                  - generic "January cohort" [ref=e236]
                  - generic [ref=e237]: Group 1
              - generic "Marketing ↔ Marketing" [ref=e239]:
                - 'button "View Current module details: Marketing" [ref=e241] [cursor=pointer]':
                  - generic [ref=e242]: Current Training Plan · Automatic match
                  - generic [ref=e243]: Marketing
                  - generic [ref=e244]: "5 Jan → 19 Jan · Tutor: Plan Tutor"
                - 'button "View LMS module details: Marketing" [ref=e246] [cursor=pointer]':
                  - generic [ref=e247]: LMS Training Plan · Automatic match
                  - generic [ref=e248]: Marketing
                  - generic [ref=e249]: "5 Jan → 16 Feb · Tutor: LMS Tutor"
            - generic [ref=e250]:
              - generic [ref=e254]:
                - generic [ref=e255]: Current Training Plan
                - generic [ref=e256]:
                  - paragraph [ref=e257]: January cohort
                  - generic [ref=e258]: 2026-01-01
              - generic [ref=e260]:
                - generic [ref=e261]:
                  - paragraph [ref=e267]: Group 2
                  - paragraph [ref=e272]: Group 3
                - generic [ref=e273]:
                  - generic [ref=e278]: Marketing
                  - generic [ref=e283]: Other workshop
          - button "Go to today's line" [ref=e284] [cursor=pointer]:
            - img [ref=e285]
    - text:   
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
```

# Test source

```ts
  345 | for (const crossProgramme of [false, true]) {
  346 |   test(`Compare saves a manual pair ${crossProgramme ? 'across programmes' : 'within a programme'} and stacks it on the Merge timeline`, async ({ page }, testInfo) => {
  347 |     test.setTimeout(90_000);
  348 |     const api = await setup(page, false, crossProgramme ? [{ sourceModuleId: 'cross', module: 'Independent source title',
  349 |       programme: 'Marketing Manager Level 6', cohortName: 'Different intake', groupName: 'Source group',
  350 |       startDate: '2024-01-01', endDate: '2024-02-01' }] : []);
  351 |     await page.goto('/training-plan');
  352 |     await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  353 |     await page.getByRole('button', { name: 'Add manual match', exact: true }).click();
  354 |     const dialog = page.getByRole('dialog', { name: 'Compare modules', exact: true });
  355 |     await dialog.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  356 |     await page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option').filter({ hasText: 'Group 1' }).click();
  357 |     await dialog.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  358 |     await page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option')
  359 |       .filter({ hasText: crossProgramme ? 'Independent source title' : 'LMS Marketing Workshop' }).click();
  360 |     expect(api.writes).toEqual([]);
  361 |     await dialog.getByRole('button', { name: 'Save manual match', exact: true }).click();
  362 |     await expect(dialog.getByText('Manual match saved.', { exact: true })).toBeVisible();
  363 |     expect(api.items[0].notes).toContain(`__lms_source_module_id:${crossProgramme ? 'cross' : 'chosen'}`);
  364 |     await dialog.getByRole('button', { name: 'View in Merge', exact: true }).click();
  365 |     const merged = page.getByRole('tabpanel', { name: 'Merge', exact: true });
  366 |     const savedMerges = merged.getByRole('region', { name: 'Saved manual merges', exact: true });
  367 |     await expect(savedMerges.getByRole('listitem')).toHaveCount(1);
  368 |     await expect(savedMerges).toContainText(crossProgramme ? 'Independent source title' : 'LMS Marketing Workshop');
  369 |     await expect(savedMerges).toContainText('January cohort');
  370 |     const pairs = merged.locator('[data-manual-match-id]');
  371 |     await expect(merged).toBeVisible();
  372 |     await expect(merged.locator('.training-plan-gantt-scroll')).toHaveCount(1);
  373 |     await expect(pairs).toHaveCount(2);
  374 |     await expect(pairs.nth(0)).toHaveAttribute('data-plan-source', 'Current');
  375 |     await expect(pairs.nth(1)).toHaveAttribute('data-plan-source', 'LMS');
  376 |     expect(await pairs.nth(0).getAttribute('data-manual-match-id')).toBe(await pairs.nth(1).getAttribute('data-manual-match-id'));
  377 |     expect(await pairs.nth(0).evaluate(node => node.nextElementSibling?.getAttribute('data-plan-source'))).toBe('LMS');
  378 |     await expect(pairs.nth(0)).toContainText('Marketing');
  379 |     await expect(pairs.nth(1)).toContainText(crossProgramme ? 'Independent source title' : 'LMS Marketing Workshop');
  380 |     const currentBar = pairs.nth(0).locator('[data-source="Current"]');
  381 |     const lmsBar = pairs.nth(1).locator('[data-source="LMS"]');
  382 |     await expect(currentBar).toHaveCount(1);
  383 |     await expect(lmsBar).toHaveCount(1);
  384 |     const card = merged.locator('[data-merged-module-card]');
  385 |     await expect(card).toHaveCount(1);
  386 |     await expect(card.locator('[data-plan-source]')).toHaveCount(2);
  387 |     expect(await currentBar.getAttribute('data-start-date')).not.toBe(await lmsBar.getAttribute('data-start-date'));
  388 |     // Both halves fill one card while retaining their independent source dates.
  389 |     const currentBounds = await currentBar.boundingBox();
  390 |     const lmsBounds = await lmsBar.boundingBox();
  391 |     expect(currentBounds!.width).toBe(lmsBounds!.width);
  392 |     expect(currentBounds!.height).toBeCloseTo(lmsBounds!.height, 0);
  393 |     expect(await currentBar.evaluate(node => node.parentElement!.getBoundingClientRect().left))
  394 |       .toBe(await lmsBar.evaluate(node => node.parentElement!.getBoundingClientRect().left));
  395 |     await page.screenshot({ path: testInfo.outputPath('manual-pair-in-merge.png'), fullPage: true });
  396 |     await currentBar.click();
  397 |     await expect(page.getByRole('button', { name: 'Close module overview dialog', exact: true })).toBeVisible();
  398 |     await expect(page.getByRole('table', { name: 'LMS monthly delivery dates', exact: true })).toHaveCount(0);
  399 |     await expect(page.getByText('Plan Tutor', { exact: true }).last()).toBeVisible();
  400 |     await page.getByRole('button', { name: 'Close module overview dialog', exact: true }).click();
  401 |     await lmsBar.focus();
  402 |     await page.keyboard.press('Enter');
  403 |     await expect(page.getByRole('table', { name: 'LMS monthly delivery dates', exact: true })).toBeVisible();
  404 |     await expect(page.getByText(crossProgramme ? 'Independent source title' : 'LMS Marketing Workshop', { exact: true }).last()).toBeVisible();
  405 |     await page.getByRole('button', { name: 'Close module overview dialog', exact: true }).click();
  406 |     await page.reload();
  407 |     await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  408 |     await expect(pairs).toHaveCount(2);
  409 |     await expect(savedMerges.getByRole('listitem')).toHaveCount(1);
  410 |     await page.setViewportSize({ width: 390, height: 844 });
  411 |     await expect(pairs).toHaveCount(2);
  412 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  413 |     await lmsBar.click();
  414 |     await expect(page.getByRole('table', { name: 'LMS monthly delivery dates', exact: true })).toBeVisible();
  415 |     await page.getByRole('button', { name: 'Close module overview dialog', exact: true }).click();
  416 |     await page.screenshot({ path: testInfo.outputPath('manual-pair-in-merge-mobile.png') });
  417 |     if (!crossProgramme) await page.setViewportSize({ width: 1440, height: 900 });
  418 |     await savedMerges.getByRole('button', { name: /^Remove manual merge:/ }).click();
  419 |     await expect(savedMerges.getByRole('status')).toContainText('Manual merge removed.');
  420 |     await expect(savedMerges.getByRole('listitem')).toHaveCount(0);
  421 |     await expect(pairs).toHaveCount(0);
  422 |     expect(api.items[0].startDate).toBe('2026-01-05');
  423 |     expect(api.items[0].notes).toContain('Original notes');
  424 |     expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  425 |     await page.reload();
  426 |     await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  427 |     await expect(savedMerges).toContainText('No saved manual merges yet.');
  428 |     await expect(pairs).toHaveCount(0);
  429 |     expect(api.writes).toEqual(['/api/training-plan/modules/101/', '/api/training-plan/modules/101/']);
  430 |     expect(api.errors).toEqual([]);
  431 |   });
  432 | }
  433 | 
  434 | test('manual merge list retains failed removals, lists unavailable LMS links and restores automatic matching after removal', async ({ page }, testInfo) => {
  435 |   test.setTimeout(90_000);
  436 |   const api = await setup(page, true);
  437 |   api.items[0].notes += '\n__lms_source_module_id:chosen';
  438 |   api.items[1].notes += '\n__lms_source_module_id:unavailable';
  439 |   const originalItems = JSON.stringify(api.items);
  440 |   await page.setViewportSize({ width: 390, height: 844 });
  441 |   await page.goto('/training-plan');
  442 |   await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  443 |   const merged = page.getByRole('tabpanel', { name: 'Merge', exact: true });
  444 |   const savedMerges = merged.getByRole('region', { name: 'Saved manual merges', exact: true });
> 445 |   await expect(savedMerges.getByRole('listitem')).toHaveCount(2);
      |                                                   ^ Error: expect(locator).toHaveCount(expected) failed
  446 |   await expect(savedMerges).toContainText('LMS module unavailable');
  447 |   await expect(savedMerges).toContainText('Source ID: unavailable');
  448 |   await expect(savedMerges).toContainText('Group 1');
  449 |   await expect(savedMerges).toContainText('Group 2');
  450 |   await page.screenshot({ path: testInfo.outputPath('manual-merges-list-mobile.png'), fullPage: true });
  451 |   await merged.getByRole('button', { name: 'Show merges', exact: true }).click();
  452 |   await page.getByRole('option', { name: 'Automatic only', exact: true }).click();
  453 |   await expect(savedMerges.getByRole('listitem')).toHaveCount(2);
  454 |   api.failSave();
  455 |   const firstRemove = savedMerges.getByRole('button', { name: 'Remove manual merge: Marketing, January cohort, Group 1', exact: true });
  456 |   await firstRemove.click();
  457 |   await expect(page.getByText('Module Not Saved', { exact: true })).toBeVisible();
  458 |   await page.getByRole('button', { name: 'OK', exact: true }).click();
  459 |   await expect(savedMerges.getByRole('alert')).toContainText('The manual merge could not be removed.');
  460 |   await expect(savedMerges.getByRole('listitem')).toHaveCount(2);
  461 |   expect(JSON.stringify(api.items)).toBe(originalItems);
  462 |   api.allowSave();
  463 |   await firstRemove.click();
  464 |   await expect(savedMerges.getByRole('listitem')).toHaveCount(1);
  465 |   await expect(savedMerges.getByRole('alert')).toHaveCount(0);
  466 |   await expect(merged.locator('[data-merge-match-method="automatic"]')).toHaveCount(2);
  467 |   expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  468 |   expect(api.items[1].notes).toContain('__lms_source_module_id:unavailable');
  469 |   await savedMerges.getByRole('button', { name: 'Remove manual merge: Marketing, January cohort, Group 2', exact: true }).click();
  470 |   await expect(savedMerges).toContainText('No saved manual merges yet.');
  471 |   expect(api.items[1].notes).not.toContain('__lms_source_module_id:');
  472 |   for (const item of api.items) {
  473 |     expect(item.notes).toContain('Original notes');
  474 |     expect(item.notes).toContain('__module_catalogue_id:');
  475 |     expect(item.startDate).toBe(item.id === 102 ? '2026-01-12' : '2026-01-05');
  476 |     expect(item.endDate).toBe('2026-01-19');
  477 |   }
  478 |   await page.reload();
  479 |   await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  480 |   await expect(savedMerges).toContainText('No saved manual merges yet.');
  481 |   expect(api.writes).toEqual(['/api/training-plan/modules/101/', '/api/training-plan/modules/101/', '/api/training-plan/modules/102/']);
  482 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  483 |   expect(api.errors).toEqual([]);
  484 | });
  485 | 
  486 | test('manual matching persists, reserves the LMS module, compares dates and can be removed after reload', async ({ page }) => {
  487 |   test.setTimeout(90_000);
  488 |   const api = await setup(page);
  489 |   await page.goto('/training-plan');
  490 |   await openMatcher(page);
  491 |   await expect(page.getByLabel('Current module to match').locator('option')).toHaveCount(3);
  492 |   await expect(page.getByLabel('Current module to match')).not.toContainText('Other workshop');
  493 |   await chooseLmsModule(page);
  494 |   const preview = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  495 |   await expect(preview).toContainText('2026-01-05');
  496 |   await expect(preview).toContainText('2026-02-02');
  497 |   await expect(preview).toContainText('LMS Tutor');
  498 |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  499 |   await expect(page.getByText('Manual match saved.', { exact: true })).toBeVisible();
  500 |   expect(api.items[0].notes).toContain('__lms_source_module_id:chosen');
  501 |   expect(api.items[0].notes).toContain('__module_catalogue_id:42');
  502 |   expect(api.items[0].notes).toContain('Original notes');
  503 |   await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b102']));
  504 |   await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  505 |   await expect(page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true })).toBeDisabled();
  506 |   await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).press('Escape');
  507 |   await page.reload();
  508 |   await openMatcher(page);
  509 |   const differences = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  510 |   await expect(page.getByText('Saved manual match', { exact: true })).toBeVisible();
  511 |   await expect(differences).toContainText('LMS Marketing Workshop');
  512 |   await expect(page.getByText('Dates and tutor differ', { exact: true })).toBeVisible();
  513 |   await expect(differences).toContainText('2026-02-02');
  514 |   await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toContainText('LMS Marketing Workshop');
  515 |   await page.getByRole('button', { name: 'Remove manual match', exact: true }).click();
  516 |   await expect(page.getByText('Manual match removed. Automatic matching applies again.', { exact: true })).toBeVisible();
  517 |   expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  518 |   expect(api.writes).toEqual(['/api/training-plan/modules/101/', '/api/training-plan/modules/101/']);
  519 |   expect(api.errors).toEqual([]);
  520 | });
  521 | 
  522 | test('a failed manual match save leaves the saved assignment unchanged', async ({ page }) => {
  523 |   const api = await setup(page);
  524 |   api.failSave();
  525 |   await page.goto('/training-plan');
  526 |   await openMatcher(page);
  527 |   await chooseLmsModule(page);
  528 |   await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  529 |   await expect(page.getByText('Module Not Saved', { exact: true })).toBeVisible();
  530 |   await page.getByRole('button', { name: 'OK', exact: true }).click();
  531 |   await expect(page.getByRole('alert')).toContainText('The match was not saved. Check the save message and retry.');
  532 |   expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  533 |   await expect(page.getByRole('button', { name: 'Remove manual match', exact: true })).toHaveCount(0);
  534 |   expect(api.errors).toEqual([]);
  535 | });
  536 | 
  537 | test('schedule assignment editor compares its own module and saves a manual pair without changing its schedule', async ({ page }) => {
  538 |   const api = await setup(page);
  539 |   await page.goto('/training-plan');
  540 |   await page.getByTitle('Expand programme', { exact: true }).click();
  541 |   await page.locator('[data-timeline-block-id="b101"]').click();
  542 |   await page.getByRole('button', { name: /Edit schedule assignment/ }).click();
  543 |   await expect(page.getByRole('heading', { name: 'Edit Module', exact: true })).toBeVisible();
  544 |   await page.getByText('Compare with LMS modules', { exact: true }).click();
  545 |   await expect(page.getByLabel('Current module to match', { exact: true })).toBeDisabled();
```