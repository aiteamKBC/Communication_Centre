# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: training-plan-comparison.spec.ts >> comparison accepts missing groups for unique name/start pairs but rejects explicit group conflicts
- Location: tests\ui\training-plan-comparison.spec.ts:106:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 0
```

# Test source

```ts
  25  | 
  26  | test('comparison stays within programmes, resolves display names and does not equate independent catalogue IDs', () => {
  27  |   const groups = [group([block('one', 'social'), block('two', 'custom-1', { moduleCatalogueId: '2' })]), group([block('three', 'Social Media')], 'mm-lvl6')];
  28  |   const records = presentLmsRows([matchingSource('1', ' social   media '), matchingSource('2', 'Unrelated module'), matchingSource('3', 'Custom module')], groups);
  29  |   const result = compareLmsPlans(groups, records, [{ id: 'custom-1', name: 'Custom module', defaultSessions: 1, bg: '', tx: '' }]);
  30  |   expect(result.unchanged).toBe(2);
  31  |   expect(result.matches).toHaveLength(2);
  32  |   expect(result.differences).toEqual([]);
  33  |   expect(result.unmatchedCurrent.map(row => row.module)).toEqual(['Social Media']);
  34  |   expect(result.unmatchedLms.map(row => row.module)).toEqual(['Unrelated module']);
  35  |   // Presentation must never mutate the source snapshot.
  36  |   expect(records[0].programme).toBe('ME L4');
  37  | });
  38  | 
  39  | test('comparison excludes invalid start dates and retains ambiguous and incomplete end dates', () => {
  40  |   const programme = group([block('a', 'Repeated'), block('b', 'Impossible'), block('c', 'Reversed'), block('d', 'Missing'), block('e', 'Same')]);
  41  |   programme.rows.push({ ...programme.rows[0], id: 'c2', label: 'February cohort', blks: [block('f', 'Same', { startDate: '2026-02-02', endDate: '2026-02-16' })] });
  42  |   const records = presentLmsRows([
  43  |     matchingSource('1', 'Repeated'), matchingSource('2', 'Repeated'), matchingSource('3', 'Impossible', { startDate: '2026-02-30' }),
  44  |     matchingSource('4', 'Reversed', { endDate: '2026-01-01' }), matchingSource('5', 'Missing', { endDate: null }), matchingSource('6', 'Same'),
  45  |     matchingSource('7', 'Same', { cohortName: 'February cohort', startDate: '2026-02-02', endDate: '2026-02-23' }),
  46  |   ], [programme]);
  47  |   const result = compareLmsPlans([programme], records, []);
  48  |   expect(result.unchanged).toBe(1);
  49  |   expect(result.differences.map(row => row.kind)).toEqual(['dates']);
  50  |   expect(result.incomplete.map(row => row.kind)).toEqual(['incomplete', 'incomplete']);
  51  |   expect(result.review[0].candidates).toHaveLength(2);
  52  |   expect(result.matches).toHaveLength(4);
  53  |   expect(result.unmatchedCurrent.map(row => row.block.id)).toEqual(['b']);
  54  |   expect(result.unmatchedLms.map(row => row.sourceModuleId)).toEqual(['3']);
  55  |   expect(result.differences.at(-1)).toMatchObject({ cohort: 'February cohort', current: { startDate: '2026-02-02' } });
  56  | });
  57  | 
  58  | test('comparison follows the timeline schedule and applies only the cohort selected holidays', () => {
  59  |   const programme = group([block('a', 'Scheduled module', { days: ['monday'] })]);
  60  |   const records = presentLmsRows([matchingSource('1', 'Scheduled module')], [programme]);
  61  |   const holidays = [{ id: 'h1', label: 'Break', startDate: '2026-01-12', endDate: '2026-01-12', type: 'holiday', color: '#fff' }];
  62  |   expect(compareLmsPlans([programme], records, [], holidays).unchanged).toBe(1);
  63  |   programme.rows[0].holidayIds = ['h1'];
  64  |   expect(compareLmsPlans([programme], records, [], holidays).differences[0]).toMatchObject({
  65  |     kind: 'dates', current: { startDate: '2026-01-05', endDate: '2026-01-26', baselineEndDate: '2026-01-19' },
  66  |   });
  67  | });
  68  | 
  69  | test('comparison links repeated modules by cohort, group and start date despite end date and tutor changes', () => {
  70  |   const programme = group([
  71  |     block('jan-1', 'Marketing', { groupName: 'G1 - Tuesday', tutor: 'Plan Tutor' }),
  72  |     block('jan-2', 'Marketing', { groupName: 'G2 - Friday' }),
  73  |   ]);
  74  |   programme.rows.push({ ...programme.rows[0], id: 'c2', label: 'February cohort',
  75  |     blks: [block('feb-1', 'Marketing', { groupName: 'Group 1' })] });
  76  |   const records = presentLmsRows([
  77  |     matchingSource('jan-1', 'Marketing Group 01', { cohortId: 'independent-jan', cohortName: ' January   COHORT ',
  78  |       tutorName: 'LMS Tutor', endDate: '2026-02-01' }),
  79  |     matchingSource('jan-2', 'Marketing', { cohortId: 'independent-jan', groupName: 'Group 2' }),
  80  |     matchingSource('feb-1', 'Marketing', { cohortId: 'independent-feb', cohortName: 'February cohort', groupName: 'G1' }),
  81  |   ], [programme]);
  82  |   const before = JSON.stringify({ programme, records });
  83  |   const result = compareLmsPlans([programme], records, []);
  84  |   expect(result.unchanged).toBe(2);
  85  |   expect(result.differences).toHaveLength(1);
  86  |   expect(result.differences[0]).toMatchObject({ cohort: 'January cohort', group: 'G1 - Tuesday', kind: 'datesAndTutor',
  87  |     lms: { sourceModuleId: 'jan-1', startDate: '2026-01-05' }, current: { tutorName: 'Plan Tutor' } });
  88  |   expect(compareLmsPlans([programme], [...records].reverse(), [])).toEqual(result);
  89  |   expect(JSON.stringify({ programme, records })).toBe(before);
  90  | });
  91  | 
  92  | test('comparison matches unique module names and start dates despite different or missing cohorts', () => {
  93  |   const programme = group([block('one', 'Marketing', { moduleCatalogueId: 'one', tutor: 'Same Tutor' })]);
  94  |   for (const cohortName of ['February cohort', null, '']) {
  95  |     const records = presentLmsRows([matchingSource('one', 'Marketing', { cohortId: 'c1', cohortName, tutorName: 'Same Tutor' })], [programme]);
  96  |     const result = compareLmsPlans([programme], records, []);
  97  |     expect(result.unchanged).toBe(1);
  98  |     expect(result.matches).toHaveLength(1);
  99  |     expect(result.matches[0].matchMethod).toBe('automatic');
  100 |     expect(result.differences).toEqual([]);
  101 |     expect(result.unmatchedCurrent).toHaveLength(0);
  102 |     expect(result.unmatchedLms).toHaveLength(0);
  103 |   }
  104 | });
  105 | 
  106 | test('comparison accepts missing groups for unique name/start pairs but rejects explicit group conflicts', () => {
  107 |   const programme = group([
  108 |     block('one', 'Marketing', { groupName: 'Group 1', tutor: 'Same Tutor' }),
  109 |     block('two', 'Other module', { groupName: 'Group 2' }),
  110 |   ]);
  111 |   const missingGroup = presentLmsRows([matchingSource('one', 'Marketing', { tutorName: 'Same Tutor' })], [programme]);
  112 |   expect(compareLmsPlans([programme], missingGroup, []).unchanged).toBe(1);
  113 |   for (const overrides of [{ groupName: 'Group 2' }, { groupName: 'Group 9' }, { groupName: 'Group 1', module: 'Marketing G2' }]) {
  114 |     const records = presentLmsRows([matchingSource('one', 'Marketing', { tutorName: 'Same Tutor', ...overrides })], [programme]);
  115 |     const result = compareLmsPlans([programme], records, []);
  116 |     expect(result.unchanged).toBe(0);
  117 |     expect(result.differences).toEqual([]);
  118 |     expect(result.unmatchedCurrent).toHaveLength(2);
  119 |     expect(result.unmatchedLms).toHaveLength(1);
  120 |   }
  121 |   const records = presentLmsRows([matchingSource('one', 'Marketing', { groupName: 'G1', tutorName: 'Same Tutor' })], [programme]);
  122 |   expect(compareLmsPlans([programme], records, []).unchanged).toBe(1);
  123 |   // Unique module names can distinguish placements with independent group IDs.
  124 |   programme.rows[0].blks.forEach((item, index) => { item.groupName = ''; item.groupId = `local-${index}`; });
> 125 |   expect(compareLmsPlans([programme], presentLmsRows([matchingSource('one', 'Marketing')], [programme]), []).unchanged).toBe(1);
      |                                                                                                                         ^ Error: expect(received).toBe(expected) // Object.is equality
  126 | });
  127 | 
  128 | test('comparison infers a missing LMS group only when the cohort has a single group', () => {
  129 |   const programme = group([block('one', 'Marketing', { groupName: 'Tuesday group' })]);
  130 |   expect(compareLmsPlans([programme], presentLmsRows([matchingSource('one', 'Marketing')], [programme]), []).unchanged).toBe(1);
  131 |   expect(compareLmsPlans([programme], presentLmsRows([matchingSource('one', 'Marketing', { groupName: 'Friday group' })], [programme]), []).unchanged).toBe(0);
  132 | });
  133 | 
  134 | test('MBA modules with the same name and start date match automatically without LMS group labels', () => {
  135 |   const programme = group([
  136 |     block('strategic', 'mba-strategic', { startDate: '2026-10-31', endDate: '2027-02-18', groupName: 'G1-Saturday-9 am', tutor: 'Plan Tutor' }),
  137 |     block('other', 'Other module', { groupName: 'G2-Tuesday' }),
  138 |   ], 'mba');
  139 |   programme.name = 'MBA';
  140 |   programme.rows[0].label = 'MBA 2026';
  141 |   const modules = [{ id: 'mba-strategic', name: 'Chari-Strategic Management', defaultSessions: 1, bg: '', tx: '' }];
  142 |   const original = [source('lms-strategic', ' chari-strategic   MANAGEMENT ', {
  143 |     programme: 'MBA', cohortName: null, groupName: null, startDate: '2026-10-31', endDate: '2027-02-18', tutorName: 'LMS Tutor',
  144 |   })];
  145 |   const before = JSON.stringify({ programme, original });
  146 |   const records = presentLmsRows(original, [programme], modules);
  147 |   const result = compareLmsPlans([programme], records, modules);
  148 |   expect(result.matches).toHaveLength(1);
  149 |   expect(result.matches[0]).toMatchObject({ matchMethod: 'automatic', kind: 'tutor', lms: { sourceModuleId: 'lms-strategic', cohortName: null, groupName: null } });
  150 |   expect(records[0].matchedPlanCohort?.name).toBe('MBA 2026');
  151 |   expect(records[0].matchedPlanGroup?.name).toBe('G1-Saturday-9 am');
  152 |   expect(JSON.stringify({ programme, original })).toBe(before);
  153 | });
  154 | 
  155 | test('name/start fallback leaves duplicate source or current placements for review', () => {
  156 |   const programme = group([block('one', 'Marketing', { groupName: 'G1' })]);
  157 |   const original = [source('lms-one', 'Marketing', { cohortName: null, groupName: null })];
  158 |   programme.rows[0].blks.push(block('two', 'Marketing', { groupName: 'G2' }));
  159 |   let result = matchLmsPlans([programme], presentLmsRows(original, [programme]), []);
  160 |   expect(result.matched).toEqual([]);
  161 |   expect(result.review).toHaveLength(2);
  162 |   programme.rows[0].blks.pop();
  163 |   programme.rows.push({ ...programme.rows[0], id: 'other-cohort', label: 'Other cohort', blks: [block('three', 'Marketing', { groupName: 'G1' })] });
  164 |   result = matchLmsPlans([programme], presentLmsRows(original, [programme]), []);
  165 |   expect(result.matched).toEqual([]);
  166 |   expect(result.review).toHaveLength(2);
  167 |   programme.rows.pop();
  168 |   const repeated = [...original, { ...original[0], sourceModuleId: 'lms-two' }];
  169 |   result = matchLmsPlans([programme], presentLmsRows(repeated, [programme]), []);
  170 |   expect(result.matched).toEqual([]);
  171 |   expect(result.review[0].candidates).toHaveLength(2);
  172 |   expect(matchLmsPlans([programme], presentLmsRows([...repeated].reverse(), [programme]), []).matched).toEqual([]);
  173 | });
  174 | 
  175 | test('comparison refuses to reuse a source record for duplicate current placements', () => {
  176 |   const programme = group([block('one', 'Marketing'), block('two', 'Marketing')]);
  177 |   const records = presentLmsRows([matchingSource('source', 'Marketing')], [programme]);
  178 |   const result = compareLmsPlans([programme], records, []);
  179 |   expect(result.unchanged).toBe(0);
  180 |   expect(result.differences).toEqual([]);
  181 |   expect(result.matches).toEqual([]);
  182 |   expect(result.review).toHaveLength(2);
  183 |   expect(result.review.every(row => row.candidates.length === 1)).toBe(true);
  184 | });
  185 | 
  186 | test('comparison marks duplicate cohort labels for review instead of equating independent cohort IDs', () => {
  187 |   const programme = group([block('one', 'Marketing')]);
  188 |   programme.rows.push({ ...programme.rows[0], id: 'c2', blks: [block('two', 'Other module')] });
  189 |   let records = presentLmsRows([matchingSource('source', 'Marketing', { cohortId: 'c1' })], [programme]);
  190 |   expect(compareLmsPlans([programme], records, []).review[0].reason).toBe('Cohort name identifies more than one cohort');
  191 |   programme.rows.pop();
  192 |   records = presentLmsRows([
  193 |     matchingSource('source', 'Marketing', { cohortId: 'c1' }),
  194 |     matchingSource('source-2', 'Other module', { cohortId: 'c2' }),
  195 |   ], [programme]);
  196 |   expect(compareLmsPlans([programme], records, []).review[0].reason).toBe('Cohort name identifies more than one cohort');
  197 | });
  198 | 
  199 | test('comparison reports tutor-only differences, normalizes names and keeps date and tutor changes together', () => {
  200 |   const programme = group([block('one', 'Marketing', { tutor: ' Plan   Tutor ' })]);
  201 |   const compare = (overrides: Partial<LmsReferenceRow>) => compareLmsPlans([programme],
  202 |     presentLmsRows([matchingSource('one', 'Marketing', overrides)], [programme]), []);
  203 |   expect(compare({ tutorName: 'plan tutor' }).unchanged).toBe(1);
  204 |   expect(compare({ tutorName: 'Other Tutor' }).differences[0]).toMatchObject({ kind: 'tutor', tutorDiffers: true });
  205 |   expect(compare({ tutorName: null }).differences[0]).toMatchObject({ kind: 'tutor', lms: { sourceModuleId: 'one' } });
  206 |   expect(compare({ tutorName: 'Other Tutor', endDate: null }).incomplete[0]).toMatchObject({ kind: 'incomplete', tutorDiffers: true });
  207 |   expect(compare({ tutorName: 'Other Tutor', endDate: '2026-01-26' }).differences[0]).toMatchObject({ kind: 'datesAndTutor' });
  208 |   programme.rows[0].blks[0].tutorProfileId = 'profile-1';
  209 |   const profiles = [{ id: 'profile-1', name: 'Profile Tutor', normalizedName: 'profile tutor', isActive: true }];
  210 |   expect(compareLmsPlans([programme], presentLmsRows([matchingSource('one', 'Marketing', { tutorName: 'Profile Tutor' })], [programme]), [], [], profiles).unchanged).toBe(1);
  211 | });
  212 | 
  213 | test('matching is independent of comparison, and unlinked records never increase difference counts', () => {
  214 |   const programme = group([block('one', 'Marketing'), block('two', 'Unlinked current')]);
  215 |   const records = presentLmsRows([
  216 |     matchingSource('source', 'Marketing', { endDate: '2026-02-01', tutorName: 'Other Tutor' }),
  217 |     matchingSource('unlinked', 'Unlinked LMS', { startDate: null, tutorName: 'Another Tutor' }),
  218 |   ], [programme]);
  219 |   const matching = matchLmsPlans([programme], records, []);
  220 |   expect(matching.matched.map(pair => [pair.current.block.id, pair.lms.sourceModuleId])).toEqual([['one', 'source']]);
  221 |   const result = compareLmsPlans([programme], records, []);
  222 |   expect(result.matches).toHaveLength(1);
  223 |   expect(result.differences).toHaveLength(1);
  224 |   expect(result.differences[0].kind).toBe('datesAndTutor');
  225 |   expect(result.incomplete).toHaveLength(0);
```