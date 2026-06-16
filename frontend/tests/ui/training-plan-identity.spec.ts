import { expect, test, type Page, type Route } from '@playwright/test';

type TrainingPlanItem = {
  id: number;
  programmeId: string;
  cohortId: string;
  cohortName: string;
  program: string;
  startingDateLabel: string;
  moduleName: string;
  groupName: string;
  coachName: string;
  tutorName: string;
  tutorProfileId: string;
  startDate: string;
  endDate: string;
  sessionsNumber: string;
  sessionWeekDay: string;
  sessionStartTime: string;
  sessionEndTime: string;
  sessionKsbMappings: unknown[];
  sessionCoverage: unknown[];
  ksbProfileId: string;
  programmeDisplayOrder: number;
  cohortDisplayOrder: number;
  notes: string;
};

type CatalogModule = {
  id: number;
  name: string;
  colour: string;
  sessions: string;
  notes: string;
  sessionNames: string[];
  sessionDescriptions: string[];
  sessionKsbMappings: unknown[];
};

function planRow(id: number, blockId: string, moduleCatalogueId: string, moduleName: string, colour: string): TrainingPlanItem {
  return {
    id,
    programmeId: 'p1',
    cohortId: 'c1',
    cohortName: 'Cohort A',
    program: 'Programme One',
    startingDateLabel: '2026-01-01',
    moduleName,
    groupName: 'Group 1',
    coachName: 'Coach One',
    tutorName: 'Tutor One',
    tutorProfileId: '1',
    startDate: id === 101 ? '2026-01-05' : '2026-02-02',
    endDate: id === 101 ? '2026-01-19' : '2026-02-16',
    sessionsNumber: '3',
    sessionWeekDay: 'monday',
    sessionStartTime: '09:00',
    sessionEndTime: '11:00',
    sessionKsbMappings: [],
    sessionCoverage: [],
    ksbProfileId: '',
    programmeDisplayOrder: 0,
    cohortDisplayOrder: 0,
    notes: [
      '__program_id:p1',
      '__cohort_id:c1',
      '__group_id:g1',
      `__block_id:${blockId}`,
      `__module_color:${colour}`,
      `__module_catalogue_id:${moduleCatalogueId}`,
      `${moduleName} notes`,
    ].join('\n'),
  };
}

function moduleItem(id: number, colour: string): CatalogModule {
  return {
    id,
    name: 'PPC',
    colour,
    sessions: '3',
    notes: '',
    sessionNames: ['Intro', 'Practice', 'Review'],
    sessionDescriptions: [],
    sessionKsbMappings: [],
  };
}

async function mockTrainingPlanApis(page: Page, options: { legacyTimelineRows?: boolean; missingBlockMarker?: boolean; firstTimelineRowsMissingIds?: boolean; noScopedSubprogrammes?: boolean; noInitialLearnerMapping?: boolean; suggestedSubprogrammes?: boolean } = {}) {
  let version = 'v1';
  let trainingPlanGetCount = 0;
  let trainingPlanItems = options.legacyTimelineRows
    ? [
        {
          ...planRow(101, 'b-42', '', 'PPC', '#111111'),
          notes: [
            '__program_id:p1',
            '__cohort_id:c1',
            '__group_id:g1',
            ...(options.missingBlockMarker ? [] : ['__block_id:b-42']),
            '__module_color:#111111',
            'Legacy PPC row without stable module id',
          ].join('\n'),
        },
        {
          ...planRow(102, 'b-99', '', 'PPC', '#884400'),
          notes: [
            '__program_id:p1',
            '__cohort_id:c1',
            '__group_id:g1',
            '__block_id:b-99',
            '__module_color:#884400',
            'Second legacy PPC row without stable module id',
          ].join('\n'),
        },
      ]
    : [
        planRow(101, 'b-42', '42', 'PPC', '#111111'),
        planRow(102, 'b-99', '99', 'PPC', '#884400'),
      ];
  let catalogModules = [
    moduleItem(42, '#111111'),
    moduleItem(99, '#884400'),
  ];
  const linkedModuleRequests: unknown[] = [];
  const archiveModuleRequests: unknown[] = [];
  const modulePatchRequests: unknown[] = [];
  const moduleLearnerRequests: string[] = [];
  const moduleLearnerPatchRequests: unknown[] = [];
  const scopedSubprogrammeRequests: string[] = [];
  const globalSubprogrammeRequests: string[] = [];
  const aptemLearnerRequests: string[] = [];
  let moduleLearnerMappings: Record<string, { moduleCatalogueId: string; moduleName: string; subprogramme: string; selectedCount: number; learners: unknown[] }> = options.noInitialLearnerMapping ? {} : {
    '42': {
      moduleCatalogueId: '42',
      moduleName: 'PPC',
      subprogramme: 'Cohort Alpha',
      selectedCount: 3,
      learners: [
        {
          learnerIdentity: 'id:501',
          learnerId: '501',
          name: 'Zara Learner',
          email: 'zara@example.com',
          selected: true,
          sortOrder: 2,
          learnerName: 'Zara Learner',
          learnerEmail: 'zara@example.com',
          programmeStatus: 'Active',
          subprogramme: 'Cohort Alpha',
          isSelected: true,
          missingFromAptem: false,
        },
        {
          learnerIdentity: 'id:502',
          learnerId: '502',
          name: 'Adam Learner',
          email: 'adam@example.com',
          selected: true,
          sortOrder: 1,
          learnerName: 'Adam Learner',
          learnerEmail: 'adam@example.com',
          programmeStatus: 'Active',
          subprogramme: 'Cohort Alpha',
          isSelected: true,
          missingFromAptem: false,
        },
        {
          learnerIdentity: 'name:legacy-missing',
          learnerId: '',
          name: 'Legacy Missing',
          email: '',
          selected: true,
          sortOrder: 3,
          learnerName: 'Legacy Missing',
          learnerEmail: '',
          programmeStatus: '',
          subprogramme: 'Cohort Alpha',
          isSelected: true,
          missingFromAptem: true,
        },
      ],
    },
  };

  await page.addInitScript(() => {
    window.localStorage.setItem('kbc-auth-user', JSON.stringify({
      id: 1,
      email: 'ui-test@example.com',
      username: 'ui-test',
      displayName: 'UI Test',
      groups: ['Admin Access', 'Operations Access'],
      access: { adminAccess: true, operationsAccess: true, canManageCohorts: true },
      loggedInAt: new Date().toISOString(),
    }));
  });

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    const json = async (body: unknown, status = 200, headers: Record<string, string> = {}) => {
      await route.fulfill({
        status,
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    };

    if (path === '/api/auth/access/') {
      return json({
        id: 1,
        email: 'ui-test@example.com',
        username: 'ui-test',
        displayName: 'UI Test',
        groups: ['Admin Access', 'Operations Access'],
        access: { adminAccess: true, operationsAccess: true, canManageCohorts: true },
      });
    }
    if (path === '/api/health/') return json({ status: 'ok' });
    if (path.startsWith('/api/auth/activity')) return json({ trackingSessionId: 'ui-test-session' });
    if (path === '/api/training-plan/' && method === 'GET') {
      trainingPlanGetCount += 1;
      const items = options.firstTimelineRowsMissingIds && trainingPlanGetCount === 1
        ? trainingPlanItems.map(item => ({ ...item, id: undefined }))
        : trainingPlanItems;
      return json({ items, version, count: items.length });
    }
    if (path === '/api/training-plan-program-configs/') {
      return json([{ id: 'p1', name: 'Programme One', sub: 'UI Test Programme', color: '#1B2A4A' }], 200, {
        'X-KBC-Training-Plan-Program-Configs-Version': 'programs-v1',
      });
    }
    if (path === '/api/training-plan-modules/') {
      return json([], 200, { 'X-KBC-Training-Plan-Modules-Version': 'module-defs-v1' });
    }
    if (path === '/api/training-plan-holidays/') return json({ items: [], version: 'holidays-v1' });
    if (path === '/api/ksb-profiles/') return json([]);
    if (path === '/api/tutor-profiles/') {
      return json([{ id: '1', name: 'Tutor One', normalizedName: 'tutor one', isActive: true, sessionCount: 2 }]);
    }
    if (path === '/api/coach-profiles/') {
      return json([{ id: '1', name: 'Coach One', normalizedName: 'coach one', isActive: true, sessionCount: 2 }]);
    }
    if (path === '/api/modules/' && method === 'GET') return json(catalogModules);

    if (path === '/api/aptem/subprogrammes/' && method === 'GET') {
      if (url.search) scopedSubprogrammeRequests.push(url.search);
      else globalSubprogrammeRequests.push(path);
      if (url.search && options.noScopedSubprogrammes) {
        return json({ items: [], options: [], filteredBy: '' });
      }
      if (options.suggestedSubprogrammes) {
        const items = [
          'MM May 2026: AI in Marketing',
          'PO Jan 26: PPC Practice',
          'Cohort Alpha',
          'ME June 2026: Social Media',
        ];
        return json({
          items,
          options: items.map(subprogramme => ({ subprogramme, learnersCount: 3 })),
          filteredBy: '',
        });
      }
      return json({
        items: ['Cohort Alpha'],
        options: [{ subprogramme: 'Cohort Alpha', learnersCount: 3 }],
        filteredBy: url.search ? 'cohortName' : '',
      });
    }

    if (path === '/api/aptem/learners/' && method === 'GET') {
      const subprogramme = url.searchParams.get('subprogramme') || '';
      aptemLearnerRequests.push(subprogramme);
      return json({
        subprogramme,
        items: [
          { learnerIdentity: 'id:501', learnerId: '501', name: 'Zara Learner', email: 'zara@example.com', learnerName: 'Zara Learner', learnerEmail: 'zara@example.com', group: 'G1', managerName: 'Maya Manager', managerEmail: 'maya.manager@example.com', ownerName: 'Owen Owner', ownerEmail: 'owen.owner@example.com', programmeName: 'PPC Programme', status: 'Active', programmeStatus: 'Active', subprogramme, sortOrder: 2 },
          { learnerIdentity: 'id:502', learnerId: '502', name: 'Adam Learner', email: 'adam@example.com', learnerName: 'Adam Learner', learnerEmail: 'adam@example.com', group: 'G1', managerName: 'Maya Manager', managerEmail: 'maya.manager@example.com', ownerName: 'Owen Owner', ownerEmail: 'owen.owner@example.com', programmeName: 'PPC Programme', status: 'Active', programmeStatus: 'Active', subprogramme, sortOrder: 1 },
          { learnerIdentity: 'id:503', learnerId: '503', name: 'Beta Learner', email: 'beta@example.com', learnerName: 'Beta Learner', learnerEmail: 'beta@example.com', group: 'G2', managerName: 'Nora Manager', managerEmail: 'nora.manager@example.com', ownerName: 'Owen Owner', ownerEmail: 'owen.owner@example.com', programmeName: 'PPC Programme', status: 'Paused', programmeStatus: 'Paused', subprogramme, sortOrder: 4 },
        ],
      });
    }

    const scopedModuleLearnersMatch = path.match(/^\/api\/training-plan\/cohorts\/([^/]+)\/modules\/([^/]+)\/learners\/$/);
    if (scopedModuleLearnersMatch && method === 'GET') {
      const [, cohortId, moduleBlockId] = scopedModuleLearnersMatch;
      moduleLearnerRequests.push(`${cohortId}:${moduleBlockId}`);
      return json(moduleLearnerMappings[moduleBlockId] || moduleLearnerMappings['42'] || { moduleCatalogueId: '42', moduleName: 'PPC', subprogramme: '', selectedCount: 0, learners: [] });
    }
    if (scopedModuleLearnersMatch && method === 'PATCH') {
      const [, cohortId, moduleBlockId] = scopedModuleLearnersMatch;
      const body = request.postDataJSON() as { subprogramme: string; learners: unknown[] };
      moduleLearnerPatchRequests.push({ cohortId, moduleBlockId, ...body });
      moduleLearnerMappings = {
        ...moduleLearnerMappings,
        [moduleBlockId]: {
          moduleCatalogueId: '42',
          moduleName: 'PPC',
          subprogramme: body.subprogramme,
          selectedCount: body.learners.length,
          learners: body.learners,
        },
      };
      return json(moduleLearnerMappings[moduleBlockId]);
    }

    const moduleLearnersMatch = path.match(/^\/api\/training-plan\/modules\/([^/]+)\/learners\/$/);
    if (moduleLearnersMatch && method === 'GET') {
      const moduleCatalogueId = moduleLearnersMatch[1];
      moduleLearnerRequests.push(moduleCatalogueId);
      return json(moduleLearnerMappings[moduleCatalogueId] || { moduleCatalogueId, moduleName: 'PPC', subprogramme: '', selectedCount: 0, learners: [] });
    }
    if (moduleLearnersMatch && method === 'PATCH') {
      const moduleCatalogueId = moduleLearnersMatch[1];
      const body = request.postDataJSON() as { subprogramme: string; learners: unknown[] };
      moduleLearnerPatchRequests.push({ moduleCatalogueId, ...body });
      moduleLearnerMappings = {
        ...moduleLearnerMappings,
        [moduleCatalogueId]: {
          moduleCatalogueId,
          moduleName: 'PPC',
          subprogramme: body.subprogramme,
          selectedCount: body.learners.length,
          learners: body.learners,
        },
      };
      return json(moduleLearnerMappings[moduleCatalogueId]);
    }

    const moduleMatch = path.match(/^\/api\/modules\/(\d+)\/$/);
    if (moduleMatch && method === 'PATCH') {
      const body = request.postDataJSON() as CatalogModule;
      modulePatchRequests.push(body);
      catalogModules = catalogModules.map(item => item.id === body.id ? { ...item, ...body } : item);
      return json(catalogModules.find(item => item.id === body.id));
    }
    if (moduleMatch && method === 'DELETE') {
      const id = Number(moduleMatch[1]);
      catalogModules = catalogModules.filter(item => item.id !== id);
      return json({ deleted: true });
    }
    if (path === '/api/training-plan/modules/linked-rows/' && method === 'PATCH') {
      const body = request.postDataJSON() as {
        moduleCatalogueId: string;
        moduleName: string;
        linkedRows: Array<{ trainingPlanId: string; blockId: string }>;
      };
      linkedModuleRequests.push(body);
      const linkedIds = new Set(body.linkedRows.map(item => Number(item.trainingPlanId)));
      trainingPlanItems = trainingPlanItems.map(item => linkedIds.has(item.id) ? {
        ...item,
        moduleName: body.moduleName,
        notes: [
          item.notes,
          `__block_id:${body.linkedRows.find(row => Number(row.trainingPlanId) === item.id)?.blockId || `tp-${item.id}`}`,
          `__module_catalogue_id:${body.moduleCatalogueId}`,
        ].join('\n'),
      } : item);
      version = 'v-linked';
      return json({ items: trainingPlanItems, version, count: trainingPlanItems.length, updated_count: linkedIds.size });
    }
    if (path === '/api/training-plan/modules/archive/' && method === 'PATCH') {
      const body = request.postDataJSON() as { moduleCatalogueId: string; trainingPlanIds: string[] };
      archiveModuleRequests.push(body);
      const archivedIds = new Set(body.trainingPlanIds.map(Number));
      trainingPlanItems = trainingPlanItems.filter(item => !archivedIds.has(item.id));
      version = 'v-archive';
      return json({ items: trainingPlanItems, version, count: trainingPlanItems.length, archived: archivedIds.size });
    }

    return json({ detail: `Unhandled ${method} ${path}` }, 404);
  });

  return {
    linkedModuleRequests,
    archiveModuleRequests,
    modulePatchRequests,
    moduleLearnerRequests,
    moduleLearnerPatchRequests,
    scopedSubprogrammeRequests,
    globalSubprogrammeRequests,
    aptemLearnerRequests,
    getTrainingPlanItems: () => trainingPlanItems,
  };
}

async function openManageModules(page: Page) {
  await page.goto('/training-plan');
  await expect(page.getByRole('heading', { name: 'Apprenticeships Training Plan' })).toBeVisible();
  await expect(page.getByText('2 Modules', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /View Added Modules/i }).last().click();
  await expect(page.getByRole('heading', { name: 'View Added Modules' })).toBeVisible();
}

test('renaming a duplicated catalogue module updates only linked rows with the matching stable id', async ({ page }) => {
  const api = await mockTrainingPlanApis(page);
  await openManageModules(page);

  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeVisible();
  await page.locator('input[type="text"]:visible').last().fill('PPC3');
  await page.getByRole('button', { name: 'Save' }).last().click();

  await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeHidden();
  expect(api.modulePatchRequests).toHaveLength(1);
  expect(api.linkedModuleRequests).toHaveLength(1);
  expect(api.linkedModuleRequests[0]).toMatchObject({
    moduleCatalogueId: '42',
    previousModuleName: 'PPC',
    moduleName: 'PPC3',
    linkedRows: [{ trainingPlanId: '101', programmeId: 'p1', cohortId: 'c1', groupId: 'g1', blockId: 'b-42' }],
  });
  expect(api.getTrainingPlanItems().map(item => [item.id, item.moduleName])).toEqual([
    [101, 'PPC3'],
    [102, 'PPC'],
  ]);

  await expect(page.getByText('PPC3').first()).toBeVisible();
  await expect(page.getByText(/^PPC$/)).toHaveCount(2);
});

test('renaming a duplicated catalogue module with legacy timeline rows updates the matching timeline row by colour and stores the stable id', async ({ page }) => {
  const api = await mockTrainingPlanApis(page, { legacyTimelineRows: true });
  await openManageModules(page);

  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeVisible();
  await page.locator('input[type="text"]:visible').last().fill('PPC1');
  await page.getByRole('button', { name: 'Save' }).last().click();

  await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeHidden();
  expect(api.modulePatchRequests).toHaveLength(1);
  expect(api.modulePatchRequests[0]).toMatchObject({ id: 42, name: 'PPC1' });
  expect(api.linkedModuleRequests).toHaveLength(1);
  expect(api.linkedModuleRequests[0]).toMatchObject({
    moduleCatalogueId: '42',
    previousModuleName: 'PPC',
    moduleName: 'PPC1',
    linkedRows: [{ trainingPlanId: '101', programmeId: 'p1', cohortId: 'c1', groupId: 'g1', blockId: 'b-42' }],
  });
  expect(api.getTrainingPlanItems().map(item => [item.id, item.moduleName])).toEqual([
    [101, 'PPC1'],
    [102, 'PPC'],
  ]);
  expect(api.getTrainingPlanItems()[0].notes).toContain('__module_catalogue_id:42');
  await expect(page.getByText('PPC1').first()).toBeVisible();
});

test('renaming a duplicated catalogue module with a legacy row missing block id still updates the timeline row', async ({ page }) => {
  const api = await mockTrainingPlanApis(page, { legacyTimelineRows: true, missingBlockMarker: true });
  await openManageModules(page);

  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeVisible();
  await page.locator('input[type="text"]:visible').last().fill('PPC Timeline Safe');
  await page.getByRole('button', { name: 'Save' }).last().click();

  await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeHidden();
  expect(api.linkedModuleRequests).toHaveLength(1);
  expect(api.linkedModuleRequests[0]).toMatchObject({
    moduleCatalogueId: '42',
    previousModuleName: 'PPC',
    moduleName: 'PPC Timeline Safe',
    linkedRows: [{ trainingPlanId: '101', programmeId: 'p1', cohortId: 'c1', groupId: 'g1', blockId: 'tp-101' }],
  });
  expect(api.getTrainingPlanItems().map(item => [item.id, item.moduleName])).toEqual([
    [101, 'PPC Timeline Safe'],
    [102, 'PPC'],
  ]);
  expect(api.getTrainingPlanItems()[0].notes).toContain('__block_id:tp-101');
  expect(api.getTrainingPlanItems()[0].notes).toContain('__module_catalogue_id:42');
});

test('renaming a catalogue module reloads timeline IDs before updating linked rows', async ({ page }) => {
  const api = await mockTrainingPlanApis(page, { firstTimelineRowsMissingIds: true });
  await openManageModules(page);

  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeVisible();
  await page.locator('input[type="text"]:visible').last().fill('PPC Reloaded');
  await page.getByRole('button', { name: 'Save' }).last().click();

  await expect(page.getByRole('heading', { name: 'Edit Module' })).toBeHidden();
  expect(api.modulePatchRequests).toHaveLength(1);
  expect(api.linkedModuleRequests).toHaveLength(1);
  expect(api.linkedModuleRequests[0]).toMatchObject({
    moduleCatalogueId: '42',
    previousModuleName: 'PPC',
    moduleName: 'PPC Reloaded',
    linkedRows: [{ trainingPlanId: '101', programmeId: 'p1', cohortId: 'c1', groupId: 'g1', blockId: 'b-42' }],
  });
  expect(api.getTrainingPlanItems().map(item => [item.id, item.moduleName])).toEqual([
    [101, 'PPC Reloaded'],
    [102, 'PPC'],
  ]);
});

test('deleting one duplicated catalogue module archives only rows with the matching stable id', async ({ page }) => {
  const api = await mockTrainingPlanApis(page);
  await openManageModules(page);

  await page.locator('button:has(.ri-delete-bin-line):visible').last().click();
  await expect(page.getByRole('heading', { name: 'Delete Module?' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByRole('heading', { name: 'Delete Module?' })).toBeHidden();
  expect(api.archiveModuleRequests).toHaveLength(1);
  expect(api.archiveModuleRequests[0]).toMatchObject({
    moduleName: 'PPC',
    moduleCatalogueId: '99',
    trainingPlanIds: ['102'],
  });
  expect(api.getTrainingPlanItems().map(item => item.id)).toEqual([101]);
});

test('module overview opens monthly breakdown by default and loads mapped subprogramme students by catalogue id', async ({ page }) => {
  const api = await mockTrainingPlanApis(page);
  await page.goto('/training-plan');
  await expect(page.getByRole('heading', { name: 'Apprenticeships Training Plan' })).toBeVisible();
  await expect(page.locator('[data-timeline-block-id="b-42"]')).toBeVisible();

  await page.locator('[data-timeline-block-id="b-42"]').click();
  await expect(page.getByText('Choose What To Edit')).toBeVisible();
  await expect(page.getByText('Monthly Module Breakdown')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Module Overview/i })).toBeVisible();
  await page.getByRole('button', { name: /Module Overview/i }).click();

  await expect(page.getByRole('heading', { name: 'Module Overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Monthly Module Breakdown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subprogramme Students', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Subprogramme Students', exact: true }).click();
  await expect(page.getByLabel('Subprogramme')).toBeVisible();
  await expect(page.getByLabel('Subprogramme')).toContainText('Cohort Alpha');
  await expect(page.getByText('Cohort Alpha').first()).toBeVisible();
  await expect(page.getByText('Selected learners')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Adam Learner', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Zara Learner', exact: true })).toBeVisible();
  await expect(page.getByText('Previously selected, not found in Aptem')).toBeVisible();
  expect(api.moduleLearnerRequests).toEqual(['c1:b-42']);
  expect(api.scopedSubprogrammeRequests).toHaveLength(0);
  expect(api.globalSubprogrammeRequests).toEqual(['/api/aptem/subprogrammes/']);
  expect(api.aptemLearnerRequests).toEqual(['Cohort Alpha']);

  await page.getByPlaceholder('Search learners by name, email, group, manager, programme, or status...').fill('adam');
  await expect(page.getByRole('cell', { name: 'Adam Learner', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Zara Learner', exact: true })).toBeHidden();
  await page.getByPlaceholder('Search learners by name, email, group, manager, programme, or status...').fill('beta');
  await page.getByLabel('Select Beta Learner').check();
  await expect(page.getByText('Selected 4 / 4')).toBeVisible();
  await page.getByRole('button', { name: 'Save Learner Mapping' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  expect(api.moduleLearnerPatchRequests).toHaveLength(1);
  expect(api.moduleLearnerPatchRequests[0]).toMatchObject({
    cohortId: 'c1',
    moduleBlockId: 'b-42',
    subprogramme: 'Cohort Alpha',
  });

  expect(api.moduleLearnerRequests).toEqual(['c1:b-42']);
});

test('module overview subprogramme dropdown uses the same Aptem subprogramme options as edit module mapping', async ({ page }) => {
  const api = await mockTrainingPlanApis(page, { noInitialLearnerMapping: true });
  await page.goto('/training-plan');
  await expect(page.locator('[data-timeline-block-id="b-42"]')).toBeVisible();

  await page.locator('[data-timeline-block-id="b-42"]').click();
  await page.getByRole('button', { name: /Module Overview/i }).click();
  await page.getByRole('button', { name: 'Subprogramme Students', exact: true }).click();

  await expect(page.getByText('Select a subprogramme to view and map learners to this module.')).toBeVisible();
  expect(api.scopedSubprogrammeRequests).toHaveLength(0);
  expect(api.globalSubprogrammeRequests).toEqual(['/api/aptem/subprogrammes/']);
  await page.getByLabel('Subprogramme').click();
  await expect(page.getByText('No matching subprogrammes.')).toHaveCount(0);
  await page.getByRole('button', { name: /Cohort Alpha/i }).click();
  await expect(page.getByRole('cell', { name: 'Adam Learner', exact: true })).toBeVisible();
  expect(api.aptemLearnerRequests).toEqual(['Cohort Alpha']);
});

test('module overview loads unscoped subprogrammes even before a module catalogue id is available', async ({ page }) => {
  const api = await mockTrainingPlanApis(page, { legacyTimelineRows: true, noInitialLearnerMapping: true });
  await page.goto('/training-plan');
  await expect(page.locator('[data-timeline-block-id="b-42"]')).toBeVisible();

  await page.locator('[data-timeline-block-id="b-42"]').click();
  await page.getByRole('button', { name: /Module Overview/i }).click();
  await page.getByRole('button', { name: 'Subprogramme Students', exact: true }).click();

  expect(api.moduleLearnerRequests).toEqual(['c1:b-42']);
  expect(api.scopedSubprogrammeRequests).toHaveLength(0);
  expect(api.globalSubprogrammeRequests).toEqual(['/api/aptem/subprogrammes/']);
  await expect(page.getByText('No subprogrammes found.')).toHaveCount(0);

  await page.getByLabel('Subprogramme').click();
  await expect(page.getByText('No matching subprogrammes.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Cohort Alpha/i })).toBeVisible();
});

test('module overview ranks suggested Aptem subprogrammes with badges without auto-selecting', async ({ page }) => {
  const api = await mockTrainingPlanApis(page, { noInitialLearnerMapping: true, suggestedSubprogrammes: true });
  await page.goto('/training-plan');
  await expect(page.locator('[data-timeline-block-id="b-42"]')).toBeVisible();

  await page.locator('[data-timeline-block-id="b-42"]').click();
  await page.getByRole('button', { name: /Module Overview/i }).click();
  await page.getByRole('button', { name: 'Subprogramme Students', exact: true }).click();

  await expect(page.getByLabel('Subprogramme')).toContainText('Choose an Aptem subprogramme');
  expect(api.aptemLearnerRequests).toEqual([]);

  await page.getByLabel('Subprogramme').click();
  await expect(page.getByText('Suggested matches')).toBeVisible();
  await expect(page.getByText('All subprogrammes')).toBeVisible();

  const options = page.locator('[data-subprogramme-option]');
  await expect(options).toHaveCount(4);
  await expect(options.first()).toHaveAttribute('data-subprogramme-option', 'PO Jan 26: PPC Practice');
  await expect(options.first()).toHaveAttribute('data-suggested', 'true');
  await expect(options.first().getByText('Programme match', { exact: true })).toBeVisible();
  await expect(options.first().getByText('Module match', { exact: true })).toBeVisible();
  await expect(page.locator('[data-subprogramme-option="MM May 2026: AI in Marketing"]')).toBeVisible();
  await expect(page.locator('[data-subprogramme-option="Cohort Alpha"]')).toBeVisible();

  await options.first().click();
  await expect(page.getByRole('cell', { name: 'Adam Learner', exact: true })).toBeVisible();
  expect(api.aptemLearnerRequests).toEqual(['PO Jan 26: PPC Practice']);

  await page.getByLabel('Select Adam Learner').check();
  await page.getByRole('button', { name: 'Save Learner Mapping' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  expect(api.moduleLearnerPatchRequests).toHaveLength(1);
  expect(api.moduleLearnerPatchRequests[0]).toMatchObject({
    cohortId: 'c1',
    moduleBlockId: 'b-42',
    subprogramme: 'PO Jan 26: PPC Practice',
  });
});

test('edit module Aptem mapping uses the same suggested subprogramme ranking and module-id save path', async ({ page }) => {
  const api = await mockTrainingPlanApis(page, { noInitialLearnerMapping: true, suggestedSubprogrammes: true });
  await page.goto('/training-plan');
  await expect(page.locator('[data-timeline-block-id="b-42"]')).toBeVisible();

  await page.locator('[data-timeline-block-id="b-42"]').click();
  await page.getByRole('button', { name: /Edit schedule assignment/i }).click();
  await expect(page.getByText('Aptem Learner Mapping')).toBeVisible();
  await expect(page.getByText('Select a valid Tutor Profile.')).toHaveCount(0);
  await expect(page.getByText('Choose an Aptem subprogramme').first()).toBeVisible();
  expect(api.aptemLearnerRequests).toEqual([]);

  await page.locator('button').filter({ hasText: 'Choose an Aptem subprogramme' }).first().click();
  const options = page.locator('[data-subprogramme-option]');
  await expect(options).toHaveCount(4);
  await expect(options.first()).toHaveAttribute('data-subprogramme-option', 'PO Jan 26: PPC Practice');
  await expect(options.first().getByText('Programme match', { exact: true })).toBeVisible();
  await expect(options.first().getByText('Module match', { exact: true })).toBeVisible();
  await expect(page.locator('[data-subprogramme-option="ME June 2026: Social Media"]')).toBeVisible();

  await options.first().click();
  await expect(page.getByText('Adam Learner')).toBeVisible();
  expect(api.aptemLearnerRequests).toEqual(['PO Jan 26: PPC Practice']);

  await page.getByRole('checkbox', { name: /Adam Learner/ }).check();
  await page.getByRole('button', { name: 'Save Module', exact: true }).click();
  await expect(page.getByText('Aptem Learner Mapping')).toBeHidden();
  expect(api.moduleLearnerPatchRequests).toHaveLength(1);
  expect(api.moduleLearnerPatchRequests[0]).toMatchObject({
    moduleCatalogueId: '42',
    subprogramme: 'PO Jan 26: PPC Practice',
  });
});
