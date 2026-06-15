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

async function mockTrainingPlanApis(page: Page, options: { legacyTimelineRows?: boolean; missingBlockMarker?: boolean; firstTimelineRowsMissingIds?: boolean } = {}) {
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
