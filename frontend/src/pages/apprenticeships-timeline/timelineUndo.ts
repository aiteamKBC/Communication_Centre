import type { ProgrammeGroup } from './types';

type TimelineUndoExpectation =
  | { kind: 'dates'; trainingPlanId: string; startDate: string; endDate: string }
  | { kind: 'programmes'; ids: string[] }
  | { kind: 'cohorts'; programmeId: string; ids: string[] }
  | { kind: 'membership'; programmeId: string; cohortId: string; trainingPlanIds: string[] };

export interface TimelineUndoEntry {
  label: string;
  path: string;
  payload: Record<string, unknown>;
  expected: TimelineUndoExpectation[];
}

export const timelineProgrammeOrder = (groups: ProgrammeGroup[]) => groups.filter(group => group.rows.length).map(group => group.id);
export const timelineCohortOrder = (groups: ProgrammeGroup[], programmeId: string) => groups.find(group => group.id === programmeId)?.rows.map(row => row.id) || [];

export function verifyTimelineUndo(entry: TimelineUndoEntry, groups: ProgrammeGroup[]) {
  const sameOrder = (left: string[], right: string[]) => left.length === right.length && left.every((id, index) => id === right[index]);
  const safe = entry.expected.every(expected => {
    if (expected.kind === 'programmes') return sameOrder(timelineProgrammeOrder(groups), expected.ids);
    if (expected.kind === 'cohorts') return sameOrder(timelineCohortOrder(groups, expected.programmeId), expected.ids);
    if (expected.kind === 'membership') {
      const row = groups.find(group => group.id === expected.programmeId)?.rows.find(row => row.id === expected.cohortId);
      return Boolean(row && row.blks.every(block => block.trainingPlanId)
        && sameOrder(row.blks.map(block => block.trainingPlanId!).sort(), [...expected.trainingPlanIds].sort()));
    }
    const block = groups.flatMap(group => group.rows.flatMap(row => row.blks)).find(block => block.trainingPlanId === expected.trainingPlanId);
    return block?.startDate === expected.startDate && block.endDate === expected.endDate;
  });
  if (!safe) throw new Error('This item changed after your move. Undo was not applied. Review the latest timeline before moving it again.');
}
