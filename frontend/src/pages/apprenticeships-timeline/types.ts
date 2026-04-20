// ── Core Types for Enhanced Apprenticeships Timeline ─────────────────────

export type MKey =
  | 'pmp' | 'pmiSP' | 'evm' | 'risk' | 'ppc'
  | 'impact' | 'social' | 'tech'
  | 'strat' | 'comm' | 'cust' | 'ai';

export type ModuleValue = MKey | string;

export interface ModuleMeta {
  lbl: string;
  bg: string;
  tx: string;
}

export type WeekDayKey = 'saturday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

export interface ModuleBlock {
  id: string;
  mod: ModuleValue;
  tutor: string;
  startDate: string;   // ISO: "2025-01-06"
  endDate: string;     // ISO: "2025-05-30"
  sessions: number;
  days?: WeekDayKey[];
  sessionStartTime?: string; // HH:mm, e.g. "13:00"
  sessionEndTime?: string;   // HH:mm, e.g. "15:00"
  notes?: string;
}

export interface CohortRow {
  id: string;
  label: string;
  dateLbl: string;
  intake: string;      // e.g. "Intake 1", "Intake 2"
  quarter: string;     // e.g. "Q1 2025"
  holidayIds?: string[];
  blks: ModuleBlock[];
}

export interface ProgrammeGroup {
  id: string;
  name: string;
  sub: string;
  color: string;
  rowBg: string;
  rows: CohortRow[];
}

export interface Holiday {
  id: string;
  label: string;
  startDate: string;   // ISO
  endDate: string;     // ISO
  type: string;
  color: string;
}

export type ZoomLevel = 'year' | 'intake' | 'month' | 'week' | 'day';

export interface OverlapInfo {
  cohortId: string;
  moduleId: string;
  conflictWith: string;
  type: 'module-overlap' | 'holiday-overlap';
}
