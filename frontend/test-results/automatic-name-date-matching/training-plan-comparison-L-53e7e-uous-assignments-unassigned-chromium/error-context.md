# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-comparison.spec.ts >> LMS groups follow matching cohort module assignments, retain title groups and leave ambiguous assignments unassigned
- Location: tests\ui\training-plan-comparison.spec.ts:465:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

@@ -2,7 +2,7 @@
    "five": "Group not provided",
    "four": "G2",
    "one": "Group not provided",
    "six": "G9",
    "three": "Group not provided",
-   "two": "G2 - Friday",
+   "two": "Group not provided",
  }
```

# Test source

```ts
  383 |     matchingSource('source', 'Marketing', overrides),
  384 |   ], [programme]);
  385 |   expect(lmsGroupDisplayName(infer({ groupName: 'Actual LMS group' })[0])).toBe('Actual LMS group');
  386 |   expect(infer({ groupName: 'Actual LMS group' })[0].matchedPlanGroup).toBeUndefined();
  387 |   for (const startDate of ['2026-01-12', null, '2026-02-30']) {
  388 |     expect(lmsRecordGroup(infer({ startDate })[0])).toBe('Group not provided');
  389 |   }
  390 |   expect(lmsRecordGroup(infer({ module: 'Marketing G9' })[0])).toBe('G9');
  391 |   const bothMissing = infer({ cohortName: null })[0];
  392 |   expect(lmsCohortDisplayName(bothMissing)).toBe('January cohort');
  393 |   expect(lmsGroupDisplayName(bothMissing)).toBe('G1-Wednesday');
  394 |   programme.rows[0].blks.push(block('two', 'Marketing', { groupName: 'G2-Thursday' }));
  395 |   expect(lmsRecordGroup(infer()[0])).toBe('Group not provided');
  396 |   programme.rows[0].blks.pop();
  397 |   const repeated = presentLmsRows([matchingSource('a', 'Marketing'), matchingSource('b', 'Marketing')], [programme]);
  398 |   expect(repeated.every(record => !record.matchedPlanGroup)).toBe(true);
  399 | });
  400 | 
  401 | test('LMS layout orders unknown cohorts newest first without copying current groups', () => {
  402 |   const programme = group([
  403 |     block('a', 'social', { groupName: 'G1 - Tues' }),
  404 |     block('b', 'custom', { groupName: 'G1 - Tues' }),
  405 |     block('c', 'Absent', { groupName: 'G2 - Fri - 9AM' }),
  406 |   ]);
  407 |   programme.color = '#E8D000';
  408 |   programme.rows[0].dateLbl = '2027-01-08';
  409 |   programme.rows.push({ ...programme.rows[0], id: 'c2', label: 'February 2026', dateLbl: '2026-02-01',
  410 |     blks: [block('d', 'social', { groupName: 'G1 - Wed - 9AM' })] });
  411 |   const modules = [{ id: 'custom', name: 'Custom module', defaultSessions: 1, bg: '', tx: '' }];
  412 |   const records = presentLmsRows([source('1', ' social MEDIA ', { startDate: '2024-06-03', endDate: '2024-08-12' }),
  413 |     source('2', 'Custom module')], [programme]);
  414 |   const before = JSON.stringify({ programme, records, modules });
  415 |   const result = buildLmsTimelineLayout(records, [programme]);
  416 |   expect(result.groups[0]).toMatchObject({ name: 'ME L4', color: '#115E59' });
  417 |   expect(result.groups[0].rows.map(row => [row.label, row.dateLbl])).toEqual([
  418 |     ['Cohort not provided', '2026-01-05'],
  419 |     ['Cohort not provided', '2024-06-03'],
  420 |   ]);
  421 |   const blocks = result.groups[0].rows.flatMap(row => row.blks);
  422 |   expect(blocks).toHaveLength(2);
  423 |   expect(blocks.find(item => item.moduleCatalogueId === '1')).toMatchObject({ source: 'LMS', groupName: 'Group not provided', startDate: '2024-06-03', endDate: '2024-08-12', sessions: 0, tutor: '' });
  424 |   expect(result.groups[0].rows.every(row => row.blks.length > 0)).toBe(true);
  425 |   expect(new Set(blocks.map(item => item.id)).size).toBe(blocks.length);
  426 |   expect(result.undrawableCount).toBe(0);
  427 |   expect(JSON.stringify({ programme, records, modules })).toBe(before);
  428 | });
  429 | 
  430 | test('LMS layout retains repeated names in their source months and never fills missing dates', () => {
  431 |   const programme = group([block('a', 'Repeated'), block('b', 'Missing')]);
  432 |   const records = presentLmsRows([
  433 |     source('1', 'Repeated'), source('2', 'Repeated', { startDate: '2025-01-01', endDate: '2025-01-10' }),
  434 |     source('3', 'Missing', { startDate: null }), source('4', 'Invalid', { startDate: '2026-02-30' }),
  435 |     source('5', 'Reversed', { endDate: '2025-01-01' }),
  436 |     source('6', 'Other programme', { programme: 'Marketing Manager Level 6' }),
  437 |   ], [programme]);
  438 |   const result = buildLmsTimelineLayout(records, [programme]);
  439 |   expect(result.undrawableCount).toBe(3);
  440 |   expect(result.groups[0].rows.map(row => row.dateLbl)).toEqual(['2026-01-05', '2025-01-01']);
  441 |   expect(result.groups[0].rows[0].blks[0].moduleCatalogueId).toBe('1');
  442 |   expect(result.groups[1].rows[0].blks[0].moduleCatalogueId).toBe('6');
  443 |   expect(result.groups.flatMap(item => item.rows.flatMap(row => row.blks)).map(item => item.moduleCatalogueId).sort()).toEqual(['1', '2', '6']);
  444 | });
  445 | 
  446 | test('LMS cohorts retain all modules across months, sort newest first and keep equal names with different IDs separate', () => {
  447 |   const programme = group([]);
  448 |   const records = presentLmsRows([
  449 |     source('a', 'First module', { cohortId: 'older', cohortName: 'Shared label', startDate: '2025-09-01', endDate: '2025-10-01' }),
  450 |     source('b', 'Later module', { cohortId: 'older', cohortName: 'Shared label', startDate: '2027-01-01', endDate: '2027-02-01' }),
  451 |     source('c', 'Newest cohort module', { cohortId: 'newer', cohortName: 'Shared label', startDate: '2026-09-01', endDate: '2026-10-01' }),
  452 |     source('d', 'Other programme module', { cohortId: 'newer', cohortName: 'Shared label', programme: 'Marketing Manager Level 6' }),
  453 |     source('e', 'Missing dates', { cohortId: 'older', cohortName: 'Shared label', startDate: null }),
  454 |   ], [programme]);
  455 |   const before = JSON.stringify(records);
  456 |   const result = buildLmsTimelineLayout(records, [programme]);
  457 |   expect(result.groups[0].rows.map(row => [row.dateLbl, row.blks.map(blk => blk.moduleCatalogueId)]))
  458 |     .toEqual([['2026-09-01', ['c']], ['2025-09-01', ['a', 'b']]]);
  459 |   expect(result.groups[0].rows.every(row => row.blks.every(blk => blk.groupName === 'Group not provided'))).toBe(true);
  460 |   expect(result.groups[1].rows[0].blks.map(blk => blk.moduleCatalogueId)).toEqual(['d']);
  461 |   expect(result.undrawableCount).toBe(1);
  462 |   expect(JSON.stringify(records)).toBe(before);
  463 | });
  464 | 
  465 | test('LMS groups follow matching cohort module assignments, retain title groups and leave ambiguous assignments unassigned', () => {
  466 |   const programme = group([
  467 |     block('social', 'social', { groupName: 'G1 - Tuesday' }),
  468 |     block('other', 'Workshop', { groupName: 'G2 - Friday' }),
  469 |     block('shared-1', 'Shared', { groupName: 'G1 - Tuesday' }),
  470 |     block('shared-2', 'Shared', { groupName: 'G2 - Friday' }),
  471 |   ]);
  472 |   const records = presentLmsRows([
  473 |     source('one', 'Social Media', { cohortName: ' January COHORT ', tutorName: 'LMS Tutor', startDate: '2025-09-01' }),
  474 |     source('two', 'Workshop', { cohortName: 'January cohort' }),
  475 |     source('three', 'Shared', { cohortName: 'January cohort' }),
  476 |     source('four', 'Marketing Technology G2', { cohortName: 'January cohort' }),
  477 |     source('five', 'Workshop', { cohortName: 'Other cohort' }),
  478 |     source('six', 'Marketing Technology Group 9', { cohortName: 'Other cohort' }),
  479 |   ], [programme]);
  480 |   const before = JSON.stringify({ programme, records });
  481 |   const result = buildLmsTimelineLayout(records, [programme]);
  482 |   const blocks = result.groups.flatMap(group => group.rows.flatMap(row => row.blks));
> 483 |   expect(Object.fromEntries(blocks.map(block => [block.moduleCatalogueId, block.groupName]))).toEqual({
      |                                                                                               ^ Error: expect(received).toEqual(expected) // deep equality
  484 |     one: 'Group not provided', two: 'G2 - Friday', three: 'Group not provided', four: 'G2', five: 'Group not provided', six: 'G9',
  485 |   });
  486 |   expect(blocks.find(block => block.moduleCatalogueId === 'one')).toMatchObject({ startDate: '2025-09-01', tutor: 'LMS Tutor', sessions: 0 });
  487 |   expect(JSON.stringify({ programme, records })).toBe(before);
  488 | });
  489 | 
  490 | test('LMS presentation shows only the five selected programmes and retains their undated modules', () => {
  491 |   const records = presentLmsRows([
  492 |     source('me', 'Executive module'),
  493 |     source('mm', 'Manager module', { programme: 'Marketing Manager Level 6' }),
  494 |     source('apm', 'Project manager module', { programme: 'Associate Project Manager Level 4' }),
  495 |     source('pcp', 'Controls module', { programme: 'Project Controls Professional Level 6' }),
  496 |     source('mba', 'MBA module', { programme: ' MBA ' }),
  497 |     source('undated', 'Selected undated module', { startDate: null }),
  498 |     source('custom', 'New programme module', { programme: 'New programme', sourceProgrammeId: 'new' }),
  499 |     source('missing', 'Undated module', { programme: null, sourceProgrammeId: null, startDate: null }),
  500 |   ], []);
  501 |   expect(records.map(row => row.sourceModuleId)).toEqual(['me', 'undated', 'mm', 'apm', 'pcp', 'mba']);
  502 |   const result = buildLmsTimelineLayout(records, []);
  503 |   expect(result.groups.map(programme => programme.name)).toEqual(['ME L4', 'MM LVL6', 'APM lv4', 'PCP', 'MBA']);
  504 |   expect(result.undrawableCount).toBe(1);
  505 | });
  506 | 
  507 | test('LMS tutor names stay with their source IDs across repeated module names and programmes', () => {
  508 |   const programmes = [group([])];
  509 |   const records = presentLmsRows([
  510 |     source('one', 'Repeated', { tutorName: ' Tutor One ' }),
  511 |     source('two', 'Repeated', { tutorName: 'Tutor Two' }),
  512 |     source('three', 'Repeated', { tutorName: 'Other Tutor', programme: 'Marketing Manager Level 6' }),
  513 |     source('none', 'Unassigned', { tutorName: null }),
  514 |   ], programmes);
  515 |   const result = buildLmsTimelineLayout(records, programmes);
  516 |   expect(Object.fromEntries(result.groups.flatMap(programme => programme.rows.flatMap(row => row.blks.map(blk => [blk.moduleCatalogueId, blk.tutor])))))
  517 |     .toEqual({ one: 'Tutor One', two: 'Tutor Two', three: 'Other Tutor', none: '' });
  518 | });
  519 | 
  520 | test('LMS layout omits undrawable programmes and shares Training Plan module-family colours', () => {
  521 |   const programme = group([block('a', 'social', { groupName: 'Tuesday group' })]);
  522 |   const missing = buildLmsTimelineLayout(presentLmsRows([source('1', 'Social Media', { startDate: null })], [programme]), [programme]);
  523 |   expect(missing.groups).toEqual([]);
  524 |   expect(missing.undrawableCount).toBe(1);
  525 |   const records = presentLmsRows([
  526 |     source('1', 'Social Media'), source('2', 'CIM Social Media Marketing'),
  527 |     source('3', 'Martech'), source('4', 'Nathan - Marketing Technology-(MarTech) G4'),
  528 |     source('5', 'MarTech Foundations — TEST', { startDate: '2025-03-01' }),
  529 |     source('6', ' social   MEDIA -June 2026', { programme: 'Marketing Manager Level 6' }),
  530 |     source('7', 'Other module'), source('8', 'OTHER MODULE copy'),
  531 |   ], [programme]);
  532 |   const matched = buildLmsTimelineLayout(records, [programme]);
  533 |   const colours = new Map(matched.groups.flatMap(item => item.rows.flatMap(row => row.blks.map(blk => [blk.moduleCatalogueId, blk.color] as const))));
  534 |   expect(colours.get('1')).toBe('#4A6DB0');
  535 |   expect(colours.get('2')).toBe(colours.get('1'));
  536 |   expect(colours.get('6')).toBe(colours.get('1'));
  537 |   expect(colours.get('3')).toBe('#B8860B');
  538 |   expect(colours.get('4')).toBe(colours.get('3'));
  539 |   expect(colours.get('5')).toBe(colours.get('3'));
  540 |   expect(colours.get('3')).not.toBe(colours.get('1'));
  541 |   expect(colours.get('7')).toBe(colours.get('8'));
  542 |   for (const module of matched.customModules) {
  543 |     expect(module.bg).toBe(colours.get(module.id.replace('lms-module:', '')));
  544 |   }
  545 |   programme.rows[0].blks[0].color = '#20869B';
  546 |   const reordered = buildLmsTimelineLayout([...records].reverse(), [programme]);
  547 |   for (const blk of reordered.groups.flatMap(item => item.rows.flatMap(row => row.blks))) {
  548 |     expect(blk.color).toBe(['1', '2', '6'].includes(blk.moduleCatalogueId!) ? '#20869B' : colours.get(blk.moduleCatalogueId));
  549 |   }
  550 | });
  551 | 
  552 | test('LMS colours follow programme-specific block overrides and custom module names without changing comparisons', () => {
  553 |   const programmes = [
  554 |     group([block('social-4', 'short-social', { color: '#839800' }), block('custom', 'custom-1')]),
  555 |     group([block('social-6', 'social', { color: '#20869B' })], 'mm-lvl6'),
  556 |   ];
  557 |   const customModules = [
  558 |     { id: 'custom-1', name: 'Special workshop', defaultSessions: 1, bg: '#B2686D', tx: '#fff' },
  559 |     { id: 'short-social', name: 'Social', defaultSessions: 1, bg: '#4A6DB0', tx: '#fff' },
  560 |   ];
  561 |   const records = presentLmsRows([
  562 |     source('social-4', 'CIM Social Media Marketing'),
  563 |     matchingSource('social-6', 'Social Media', { programme: 'Marketing Manager Level 6' }),
  564 |     matchingSource('custom', ' special   workshop '),
  565 |   ], programmes);
  566 |   const before = compareLmsPlans(programmes, records, customModules);
  567 |   const result = buildLmsTimelineLayout(records, programmes, customModules);
  568 |   const colours = new Map(result.groups.flatMap(programme => programme.rows.flatMap(row => row.blks.map(blk => [blk.moduleCatalogueId, blk.color]))));
  569 |   expect(colours.get('social-4')).toBe('#839800');
  570 |   expect(colours.get('social-6')).toBe('#20869B');
  571 |   expect(colours.get('custom')).toBe('#B2686D');
  572 |   expect(compareLmsPlans(programmes, records, customModules)).toEqual(before);
  573 |   expect(before.unchanged).toBe(2);
  574 | });
  575 | 
  576 | test('LMS layout sorts start and creation dates together, preserves provenance and keeps programme order', () => {
  577 |   const programmes = [group([]), group([], 'mm-lvl6')];
  578 |   const records = presentLmsRows([
  579 |     source('late', 'Later module', { startDate: '2026-01-15' }),
  580 |     source('other', 'Other programme', { programme: 'Marketing Manager Level 6' }),
  581 |     source('early', 'Earlier module', { startDate: '2026-01-01' }),
  582 |     source('created', 'Creation date module', { startDate: '2026-01-10', startDateSource: 'created_at' }),
  583 |     source('new', 'Newest module', { startDate: '2027-02-01', endDate: '2027-02-05' }),
```