# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-comparison.spec.ts >> comparison shows both timelines above differences, keeps programme filtering and scrolls on mobile without writing
- Location: tests\ui\training-plan-comparison.spec.ts:423:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('table', { name: 'Plan differences', exact: true }).getByRole('row', { name: /Changed module/ })
Expected substring: "Dates and tutor differ"
Received string:    "Changed moduleJanuary cohort · Group 12026-01-122026-01-26Saved: 2026-01-19Plan Tutor Two2026-01-12From created_at (start_date missing)2026-01-26LMS Tutor TwoTutor differs"
Timeout: 10000ms

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for getByRole('table', { name: 'Plan differences', exact: true }).getByRole('row', { name: /Changed module/ })
    22 × locator resolved to <tr class="odd:bg-slate-50/70 hover:bg-slate-100/70">…</tr>
       - unexpected value "Changed moduleJanuary cohort · Group 12026-01-122026-01-26Saved: 2026-01-19Plan Tutor Two2026-01-12From created_at (start_date missing)2026-01-26LMS Tutor TwoTutor differs"

```

```yaml
- 'row "Changed module January cohort · Group 1 2026-01-12 2026-01-26 Saved: 2026-01-19 Plan Tutor Two 2026-01-12 From created_at (start_date missing) 2026-01-26 LMS Tutor Two Tutor differs"':
  - rowheader "Changed module January cohort · Group 1"
  - cell "2026-01-12"
  - 'cell "2026-01-26 Saved: 2026-01-19"'
  - cell "Plan Tutor Two"
  - cell "2026-01-12 From created_at (start_date missing)"
  - cell "2026-01-26"
  - cell "LMS Tutor Two"
  - cell "Tutor differs"
```

# Test source

```ts
  493 |   await lms.getByLabel('LMS modules dates', { exact: true }).selectOption('missing');
  494 |   await expect(moduleList.locator('tbody tr')).toHaveCount(1);
  495 |   await expect(moduleList).toContainText('Partial module');
  496 |   await lms.getByRole('button', { name: 'Reset modules filters', exact: true }).click();
  497 |   await lms.getByLabel('Search LMS modules', { exact: true }).fill('LMS Tutor One');
  498 |   await expect(moduleList.locator('tbody tr')).toHaveCount(1);
  499 |   await expect(moduleList).toContainText('Same module');
  500 |   await lms.getByRole('button', { name: 'Reset modules filters', exact: true }).click();
  501 |   await expect(lms.getByTitle('January cohort', { exact: true })).toBeVisible();
  502 |   await expect(lms.locator('[data-lms-cohort]').first()).toHaveAttribute('data-lms-cohort', 'February cohort');
  503 |   await expect(lms.locator('[data-lms-cohort]').last()).toHaveAttribute('data-lms-cohort', 'March 2024 LMS cohort');
  504 |   await expect(lms.getByTitle('Same module', { exact: true })).toHaveCount(0);
  505 |   await expect(lms.getByTitle('Group 1', { exact: true }).first()).toBeVisible();
  506 |   await expect(lms.getByText('No matching LMS dates', { exact: true })).toHaveCount(0);
  507 |   await expect(lms.locator('[data-source="LMS"]')).toHaveCount(6);
  508 |   await expect(lms.getByRole('button', { name: 'Modules 6', exact: true })).toBeVisible();
  509 |   const repeatedColours = await lms.locator('[data-source="LMS"][title^="LMS: Repeated module."]').evaluateAll(bars => bars.map(bar => getComputedStyle(bar).backgroundColor));
  510 |   expect(repeatedColours).toHaveLength(2);
  511 |   expect(new Set(repeatedColours).size).toBe(1);
  512 |   const sourceColour = await lms.locator('[data-source="LMS"][title^="LMS: Same module."]').evaluate(bar => getComputedStyle(bar).backgroundColor);
  513 |   expect(sourceColour).toBe(await current.locator('[data-timeline-block-id="b0"]').evaluate(bar => getComputedStyle(bar).backgroundColor));
  514 |   expect(sourceColour).toBe('rgb(32, 134, 155)');
  515 |   await expect(lms.getByText(/1 LMS module uses its creation date/)).toBeVisible();
  516 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Same module."]')).toHaveAttribute('title', /Tutor: LMS Tutor One/);
  517 |   await expect(lms.getByTitle('Tutor: LMS Tutor One', { exact: true })).toBeVisible();
  518 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Changed module."]')).toHaveAttribute('title', /Tutor: LMS Tutor Two/);
  519 |   const downloading = page.waitForEvent('download');
  520 |   await lms.getByRole('button', { name: 'Export', exact: true }).click();
  521 |   const download = await downloading;
  522 |   const workbook = XLSX.read(readFileSync((await download.path())!), { type: 'buffer' });
  523 |   const exported = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['LMS Training Plan']);
  524 |   expect(exported).toHaveLength(7);
  525 |   expect(exported.some(row => row['Source Module ID'] === 'excluded')).toBe(false);
  526 |   expect(exported.find(row => row['Source Module ID'] === '1')?.['Tutor Name']).toBe('LMS Tutor One');
  527 |   expect(exported.find(row => row['Source Module ID'] === '1')?.Cohort).toBe('January cohort');
  528 |   expect(exported.find(row => row['Source Module ID'] === '1')?.Group).toBe('Group 1');
  529 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Partial module."]')).toHaveCount(0);
  530 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Changed module."]')).toHaveAttribute('title', /Start: 2026-01-12/);
  531 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Changed module."]')).toHaveAttribute('title', /From created_at \(start_date missing\)/);
  532 |   await expect(lms.locator('[data-source="LMS"][title^="LMS: Same module."]')).not.toHaveAttribute('title', /From created_at/);
  533 |   await lms.locator('[data-source="LMS"][title^="LMS: Changed module."]').click();
  534 |   const monthlyDates = page.getByRole('table', { name: 'LMS monthly delivery dates', exact: true });
  535 |   await expect(monthlyDates).toBeVisible();
  536 |   await expect(monthlyDates).toContainText('2026-01-12');
  537 |   await expect(monthlyDates).toContainText('2026-02-02');
  538 |   await expect(monthlyDates).toContainText('LMS Tutor Two');
  539 |   await expect(monthlyDates).not.toContainText('delivered');
  540 |   await page.getByRole('button', { name: 'Close module overview dialog', exact: true }).click();
  541 |   for (const timeline of [current, lms]) {
  542 |     const bars = timeline === current
  543 |       ? ['b0', 'b1', 'b5'].map(id => timeline.locator(`[data-timeline-block-id="${id}"]`))
  544 |       : [names[0], names[1], names[5]].map(name => timeline.locator(`[data-source="LMS"][title^="LMS: ${name}."]`));
  545 |     const boxes = await Promise.all(bars.map(bar => bar.boundingBox()));
  546 |     const sorted = boxes.map(box => box!).sort((a, b) => a.y - b.y);
  547 |     expect(sorted[1].y).toBeGreaterThanOrEqual(sorted[0].y + sorted[0].height);
  548 |     expect(sorted[2].y).toBeGreaterThanOrEqual(sorted[1].y + sorted[1].height);
  549 |   }
  550 |   await expect(lms.getByTitle('Edit cohort', { exact: true })).toHaveCount(0);
  551 |   await page.screenshot({ path: testInfo.outputPath('lms-cohort-group-layout.png'), fullPage: true });
  552 |   const comparisonZoom = page.getByRole('region', { name: 'Comparison zoom filter', exact: true });
  553 |   for (const level of ['Year', 'Intake', 'Month', 'Week', 'Day', 'Month']) {
  554 |     await comparisonZoom.getByRole('button', { name: level, exact: true }).click();
  555 |     await lms.locator('.training-plan-gantt-scroll').scrollIntoViewIfNeeded();
  556 |     await expect(lms.locator('[data-source="LMS"]').first()).toBeInViewport();
  557 |   }
  558 |   const grid = await page.locator('#training-plan-comparison').boundingBox();
  559 |   const section = await page.getByRole('region', { name: 'Plan differences', exact: true }).boundingBox();
  560 |   expect(section!.y).toBeGreaterThanOrEqual(grid!.y + grid!.height);
  561 |   await expect(table.getByRole('columnheader', { name: 'Programme', exact: true })).toHaveCount(0);
  562 |   const matchingSection = page.getByRole('region', { name: '1. Match records', exact: true });
  563 |   await expect(matchingSection).toContainText('4 confirmed matches');
  564 |   await expect(matchingSection).toContainText('1 current records unmatched');
  565 |   await expect(matchingSection).toContainText('1 LMS records unmatched');
  566 |   await expect(matchingSection).toContainText('1 current records need match review');
  567 |   await matchingSection.getByText('Matched records (4)', { exact: true }).click();
  568 |   const matchedTable = matchingSection.getByRole('table', { name: 'Confirmed record matches', exact: true });
  569 |   await expect(matchedTable.locator('tbody tr')).toHaveCount(4);
  570 |   await expect(matchedTable.getByRole('row', { name: /Changed module/ })).toContainText('LMS record: 2');
  571 |   await matchingSection.getByText('Unmatched records (2) — excluded from comparison', { exact: true }).click();
  572 |   const unmatchedTable = matchingSection.getByRole('table', { name: 'Unmatched records excluded from comparison', exact: true });
  573 |   await expect(unmatchedTable.locator('tbody tr')).toHaveCount(2);
  574 |   await expect(unmatchedTable).toContainText('Current module');
  575 |   await expect(unmatchedTable).toContainText('LMS module');
  576 |   await matchingSection.getByText('Matches needing review (1) — excluded from comparison', { exact: true }).click();
  577 |   const reviewTable = matchingSection.getByRole('table', { name: 'Uncertain matches excluded from comparison', exact: true });
  578 |   await expect(reviewTable.locator('tbody tr')).toHaveCount(1);
  579 |   await expect(reviewTable).toContainText('LMS record: 4');
  580 |   await expect(reviewTable).toContainText('LMS record: 5');
  581 |   await expect(table.locator('tbody tr')).toHaveCount(2);
  582 |   await expect(page.getByText('4 linked · 1 differences · 2 unchanged · 1 incomplete', { exact: true })).toBeVisible();
  583 |   await expect(table).not.toContainText('Current module');
  584 |   await expect(table).not.toContainText('LMS module');
  585 |   await expect(table).not.toContainText('Repeated module');
  586 |   await expect(table.getByRole('rowheader', { name: /Same module/ })).toHaveCount(0);
  587 |   const changed = table.getByRole('row', { name: /Changed module/ });
  588 |   await expect(changed).toContainText('2026-01-26');
  589 |   await expect(changed).toContainText('2026-01-12');
  590 |   await expect(changed).toContainText('From created_at (start_date missing)');
  591 |   await expect(changed).toContainText('Plan Tutor Two');
  592 |   await expect(changed).toContainText('LMS Tutor Two');
> 593 |   await expect(changed).toContainText('Dates and tutor differ');
      |                         ^ Error: expect(locator).toContainText(expected) failed
  594 |   await expect(table.getByRole('row', { name: /Partial module/ })).toContainText('Not provided');
  595 |   await page.getByLabel('Difference programme', { exact: true }).selectOption('me-lvl4');
  596 |   await expect(table.locator('tbody tr')).toHaveCount(2);
  597 |   await page.getByLabel('Difference type', { exact: true }).selectOption('dates');
  598 |   await expect(table.locator('tbody tr')).toHaveCount(1);
  599 |   await page.getByLabel('Difference type', { exact: true }).selectOption('tutor');
  600 |   await expect(table.locator('tbody tr')).toHaveCount(1);
  601 |   await page.getByRole('button', { name: 'Reset differences filters', exact: true }).click();
  602 |   await page.getByLabel('Search differences', { exact: true }).fill('Plan Tutor Two');
  603 |   await expect(table.locator('tbody tr')).toHaveCount(1);
  604 |   await page.getByRole('button', { name: 'Reset differences filters', exact: true }).click();
  605 |   await page.getByLabel('Search differences', { exact: true }).fill('no such module');
  606 |   await expect(table).toContainText('No differences match these filters.');
  607 |   await page.getByRole('button', { name: 'Reset differences filters', exact: true }).click();
  608 |   await page.setViewportSize({ width: 390, height: 844 });
  609 |   const scroll = page.getByRole('region', { name: 'Plan differences table', exact: true });
  610 |   expect(await scroll.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  611 |   await page.getByRole('button', { name: 'Exit comparison', exact: true }).click();
  612 |   await expect(table).toHaveCount(0);
  613 |   await expect(page.locator('#current-training-plan-panel')).toBeVisible();
  614 |   await page.getByRole('tab', { name: 'LMS Training Plan', exact: true }).click();
  615 |   await expect(page.getByRole('region', { name: 'LMS reference timeline', exact: true })).toBeVisible();
  616 |   await expect(table).toHaveCount(0);
  617 |   await page.getByRole('button', { name: 'Compare plans', exact: true }).click();
  618 |   await expect(table).toBeVisible();
  619 |   await expect(page.getByRole('region', { name: 'LMS reference timeline', exact: true })).toBeVisible();
  620 |   await expect(page.locator('#current-training-plan-panel')).toBeVisible();
  621 |   await page.getByRole('button', { name: 'Exit comparison', exact: true }).click();
  622 |   await expect(page.getByRole('region', { name: 'LMS reference timeline', exact: true })).toBeVisible();
  623 |   await expect(page.locator('#current-training-plan-panel')).toBeHidden();
  624 |   await expect(page.getByRole('table', { name: 'LMS reference', exact: true })).toHaveCount(0);
  625 |   expect(writes).toEqual([]);
  626 |   expect(errors).toEqual([]);
  627 | });
  628 | 
```