# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-identity.spec.ts >> renaming a duplicated catalogue module with a legacy row missing block id still updates the timeline row
- Location: tests\ui\training-plan-identity.spec.ts:453:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('2 Modules', { exact: true }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('2 Modules', { exact: true }).first()

```

```yaml
- navigation:
  - link "KBC Crest Kent Business College Communication Centre":
    - /url: /
    - img "KBC Crest"
    - paragraph: Kent Business College
    - paragraph: Communication Centre
  - link "Home":
    - /url: /
  - link "News & Announcements":
    - /url: /news
  - link "Internal Dashboards":
    - /url: /dashboard
  - link "Risk Register":
    - /url: /risk-register
  - link "Departments":
    - /url: /departments
  - link "Policies":
    - /url: /documents
  - link "Events":
    - /url: /events
  - link "Training Plan":
    - /url: /training-plan
  - link "LMS":
    - /url: https://kentbusinesscollege.org/
  - link "APTEM":
    - /url: https://kentbusinesscollege.aptem.co.uk/pwa/auth/login?returnUrl=%2Fcaseload-dashboard
  - link "User Activity":
    - /url: /user-activity
  - text: Ui Test
  - button " Logout"
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
- strong: "1"
- text: Groups
- strong: "2"
- text: Modules
- strong: "6"
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
  - button " Holidays"
  - button " Add Module"
  - button " View Added Modules"
  - button " Add Programme"
  - button " KSB Profiles"
  - text: Timeline workspace Choose your plan source
  - tablist "Training Plan data source":
    - tab "Current Training Plan" [selected]
    - tab "LMS Training Plan"
  - button "Compare plans"
  - tabpanel "Current Training Plan":
    - heading "Programme timeline" [level=3]
    - paragraph: Explore delivery dates across programmes and cohorts.
    - text: "Drag to explore Zoom:"
    - group "Timeline zoom":
      - button "Year"
      - button "Intake"
      - button "Month" [pressed]
      - button "Week"
      - button "Day"
    - button "Zoom out"
    - button "Zoom in"
    - button "Modules ending within 14 days"
    - button "Classes 1"
    - button "Export"
    - text: Now Workshop
    - button " Monthly Module Breakdown Click any module to view monthly sessions, holidays, tutors, and coaches. 2/2 modules"
    - text: Search modules 
    - textbox "Search modules ":
      - /placeholder: Search module, group, tutor...
    - combobox:
      - option "All programmes" [selected]
      - option "Programme One"
    - button "All"
    - button "Clashes"
    - button "Clear"
    - button "Reset" [disabled]
    - button " Programme One 2 modules 6 0 "
    - text: 2025 2026 Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec
    - paragraph: Programme One
    - button ""
    - text: 
    - paragraph: 1 cohort
    - button ""
    - button ""
    - button ""
    - button ""
    - paragraph: Cohort A
    - text: 2026-01-01
    - button ""
    - button ""
    - button ""
    - paragraph: Group 1
    - button ""
    - text: PPC PPC NOW
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
```

# Test source

```ts
  294 |     if (scopedModuleLearnersMatch && method === 'PATCH') {
  295 |       const [, cohortId, moduleBlockId] = scopedModuleLearnersMatch;
  296 |       const body = request.postDataJSON() as { subprogramme: string; learners: unknown[] };
  297 |       moduleLearnerPatchRequests.push({ cohortId, moduleBlockId, ...body });
  298 |       moduleLearnerMappings = {
  299 |         ...moduleLearnerMappings,
  300 |         [moduleBlockId]: {
  301 |           moduleCatalogueId: '42',
  302 |           moduleName: 'PPC',
  303 |           subprogramme: body.subprogramme,
  304 |           selectedCount: body.learners.length,
  305 |           learners: body.learners,
  306 |         },
  307 |       };
  308 |       return json(moduleLearnerMappings[moduleBlockId]);
  309 |     }
  310 | 
  311 |     const moduleLearnersMatch = path.match(/^\/api\/training-plan\/modules\/([^/]+)\/learners\/$/);
  312 |     if (moduleLearnersMatch && method === 'GET') {
  313 |       const moduleCatalogueId = moduleLearnersMatch[1];
  314 |       moduleLearnerRequests.push(moduleCatalogueId);
  315 |       return json(moduleLearnerMappings[moduleCatalogueId] || { moduleCatalogueId, moduleName: 'PPC', subprogramme: '', selectedCount: 0, learners: [] });
  316 |     }
  317 |     if (moduleLearnersMatch && method === 'PATCH') {
  318 |       const moduleCatalogueId = moduleLearnersMatch[1];
  319 |       const body = request.postDataJSON() as { subprogramme: string; learners: unknown[] };
  320 |       moduleLearnerPatchRequests.push({ moduleCatalogueId, ...body });
  321 |       moduleLearnerMappings = {
  322 |         ...moduleLearnerMappings,
  323 |         [moduleCatalogueId]: {
  324 |           moduleCatalogueId,
  325 |           moduleName: 'PPC',
  326 |           subprogramme: body.subprogramme,
  327 |           selectedCount: body.learners.length,
  328 |           learners: body.learners,
  329 |         },
  330 |       };
  331 |       return json(moduleLearnerMappings[moduleCatalogueId]);
  332 |     }
  333 | 
  334 |     const moduleMatch = path.match(/^\/api\/modules\/(\d+)\/$/);
  335 |     if (moduleMatch && method === 'PATCH') {
  336 |       const body = request.postDataJSON() as CatalogModule;
  337 |       modulePatchRequests.push(body);
  338 |       catalogModules = catalogModules.map(item => item.id === body.id ? { ...item, ...body } : item);
  339 |       return json(catalogModules.find(item => item.id === body.id));
  340 |     }
  341 |     if (moduleMatch && method === 'DELETE') {
  342 |       const id = Number(moduleMatch[1]);
  343 |       catalogModules = catalogModules.filter(item => item.id !== id);
  344 |       return json({ deleted: true });
  345 |     }
  346 |     if (path === '/api/training-plan/modules/linked-rows/' && method === 'PATCH') {
  347 |       const body = request.postDataJSON() as {
  348 |         moduleCatalogueId: string;
  349 |         moduleName: string;
  350 |         linkedRows: Array<{ trainingPlanId: string; blockId: string }>;
  351 |       };
  352 |       linkedModuleRequests.push(body);
  353 |       const linkedIds = new Set(body.linkedRows.map(item => Number(item.trainingPlanId)));
  354 |       trainingPlanItems = trainingPlanItems.map(item => linkedIds.has(item.id) ? {
  355 |         ...item,
  356 |         moduleName: body.moduleName,
  357 |         notes: [
  358 |           item.notes,
  359 |           `__block_id:${body.linkedRows.find(row => Number(row.trainingPlanId) === item.id)?.blockId || `tp-${item.id}`}`,
  360 |           `__module_catalogue_id:${body.moduleCatalogueId}`,
  361 |         ].join('\n'),
  362 |       } : item);
  363 |       version = 'v-linked';
  364 |       return json({ items: trainingPlanItems, version, count: trainingPlanItems.length, updated_count: linkedIds.size });
  365 |     }
  366 |     if (path === '/api/training-plan/modules/archive/' && method === 'PATCH') {
  367 |       const body = request.postDataJSON() as { moduleCatalogueId: string; trainingPlanIds: string[] };
  368 |       archiveModuleRequests.push(body);
  369 |       const archivedIds = new Set(body.trainingPlanIds.map(Number));
  370 |       trainingPlanItems = trainingPlanItems.filter(item => !archivedIds.has(item.id));
  371 |       version = 'v-archive';
  372 |       return json({ items: trainingPlanItems, version, count: trainingPlanItems.length, archived: archivedIds.size });
  373 |     }
  374 | 
  375 |     return json({ detail: `Unhandled ${method} ${path}` }, 404);
  376 |   });
  377 | 
  378 |   return {
  379 |     linkedModuleRequests,
  380 |     archiveModuleRequests,
  381 |     modulePatchRequests,
  382 |     moduleLearnerRequests,
  383 |     moduleLearnerPatchRequests,
  384 |     scopedSubprogrammeRequests,
  385 |     globalSubprogrammeRequests,
  386 |     aptemLearnerRequests,
  387 |     getTrainingPlanItems: () => trainingPlanItems,
  388 |   };
  389 | }
  390 | 
  391 | async function openManageModules(page: Page) {
  392 |   await page.goto('/training-plan');
  393 |   await expect(page.getByRole('heading', { name: 'Apprenticeships Training Plan' })).toBeVisible();
> 394 |   await expect(page.getByText('2 Modules', { exact: true }).first()).toBeVisible();
      |                                                                      ^ Error: expect(locator).toBeVisible() failed
  395 |   await page.getByRole('button', { name: /View Added Modules/i }).last().click();
  396 |   await expect(page.getByRole('heading', { name: 'View Added Modules' })).toBeVisible();
  397 | }
  398 | 
  399 | test('renaming a duplicated catalogue module updates only linked rows with the matching stable id', async ({ page }) => {
  400 |   const api = await mockTrainingPlanApis(page);
  401 |   await openManageModules(page);
  402 | 
  403 |   await page.getByRole('button', { name: 'Edit' }).first().click();
  404 |   await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeVisible();
  405 |   await page.locator('input[type="text"]:visible').last().fill('PPC3');
  406 |   await page.getByRole('button', { name: 'Save' }).last().click();
  407 | 
  408 |   await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeHidden();
  409 |   expect(api.modulePatchRequests).toHaveLength(1);
  410 |   expect(api.linkedModuleRequests).toHaveLength(1);
  411 |   expect(api.linkedModuleRequests[0]).toMatchObject({
  412 |     moduleCatalogueId: '42',
  413 |     previousModuleName: 'PPC',
  414 |     moduleName: 'PPC3',
  415 |     linkedRows: [{ trainingPlanId: '101', programmeId: 'p1', cohortId: 'c1', groupId: 'g1', blockId: 'b-42' }],
  416 |   });
  417 |   expect(api.getTrainingPlanItems().map(item => [item.id, item.moduleName])).toEqual([
  418 |     [101, 'PPC3'],
  419 |     [102, 'PPC'],
  420 |   ]);
  421 | 
  422 |   await expect(page.getByText('PPC3').first()).toBeVisible();
  423 |   await expect(page.getByText(/^PPC$/)).toHaveCount(2);
  424 | });
  425 | 
  426 | test('renaming a duplicated catalogue module with legacy timeline rows updates the matching timeline row by colour and stores the stable id', async ({ page }) => {
  427 |   const api = await mockTrainingPlanApis(page, { legacyTimelineRows: true });
  428 |   await openManageModules(page);
  429 | 
  430 |   await page.getByRole('button', { name: 'Edit' }).first().click();
  431 |   await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeVisible();
  432 |   await page.locator('input[type="text"]:visible').last().fill('PPC1');
  433 |   await page.getByRole('button', { name: 'Save' }).last().click();
  434 | 
  435 |   await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeHidden();
  436 |   expect(api.modulePatchRequests).toHaveLength(1);
  437 |   expect(api.modulePatchRequests[0]).toMatchObject({ id: 42, name: 'PPC1' });
  438 |   expect(api.linkedModuleRequests).toHaveLength(1);
  439 |   expect(api.linkedModuleRequests[0]).toMatchObject({
  440 |     moduleCatalogueId: '42',
  441 |     previousModuleName: 'PPC',
  442 |     moduleName: 'PPC1',
  443 |     linkedRows: [{ trainingPlanId: '101', programmeId: 'p1', cohortId: 'c1', groupId: 'g1', blockId: 'b-42' }],
  444 |   });
  445 |   expect(api.getTrainingPlanItems().map(item => [item.id, item.moduleName])).toEqual([
  446 |     [101, 'PPC1'],
  447 |     [102, 'PPC'],
  448 |   ]);
  449 |   expect(api.getTrainingPlanItems()[0].notes).toContain('__module_catalogue_id:42');
  450 |   await expect(page.getByText('PPC1').first()).toBeVisible();
  451 | });
  452 | 
  453 | test('renaming a duplicated catalogue module with a legacy row missing block id still updates the timeline row', async ({ page }) => {
  454 |   const api = await mockTrainingPlanApis(page, { legacyTimelineRows: true, missingBlockMarker: true });
  455 |   await openManageModules(page);
  456 | 
  457 |   await page.getByRole('button', { name: 'Edit' }).first().click();
  458 |   await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeVisible();
  459 |   await page.locator('input[type="text"]:visible').last().fill('PPC Timeline Safe');
  460 |   await page.getByRole('button', { name: 'Save' }).last().click();
  461 | 
  462 |   await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeHidden();
  463 |   expect(api.linkedModuleRequests).toHaveLength(1);
  464 |   expect(api.linkedModuleRequests[0]).toMatchObject({
  465 |     moduleCatalogueId: '42',
  466 |     previousModuleName: 'PPC',
  467 |     moduleName: 'PPC Timeline Safe',
  468 |     linkedRows: [{ trainingPlanId: '101', programmeId: 'p1', cohortId: 'c1', groupId: 'g1', blockId: 'tp-101' }],
  469 |   });
  470 |   expect(api.getTrainingPlanItems().map(item => [item.id, item.moduleName])).toEqual([
  471 |     [101, 'PPC Timeline Safe'],
  472 |     [102, 'PPC'],
  473 |   ]);
  474 |   expect(api.getTrainingPlanItems()[0].notes).toContain('__block_id:tp-101');
  475 |   expect(api.getTrainingPlanItems()[0].notes).toContain('__module_catalogue_id:42');
  476 | });
  477 | 
  478 | test('renaming a catalogue module reloads timeline IDs before updating linked rows', async ({ page }) => {
  479 |   const api = await mockTrainingPlanApis(page, { firstTimelineRowsMissingIds: true });
  480 |   await openManageModules(page);
  481 | 
  482 |   await page.getByRole('button', { name: 'Edit' }).first().click();
  483 |   await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeVisible();
  484 |   await page.locator('input[type="text"]:visible').last().fill('PPC Reloaded');
  485 |   await page.getByRole('button', { name: 'Save' }).last().click();
  486 | 
  487 |   await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeHidden();
  488 |   expect(api.modulePatchRequests).toHaveLength(1);
  489 |   expect(api.linkedModuleRequests).toHaveLength(1);
  490 |   expect(api.linkedModuleRequests[0]).toMatchObject({
  491 |     moduleCatalogueId: '42',
  492 |     previousModuleName: 'PPC',
  493 |     moduleName: 'PPC Reloaded',
  494 |     linkedRows: [{ trainingPlanId: '101', programmeId: 'p1', cohortId: 'c1', groupId: 'g1', blockId: 'b-42' }],
```