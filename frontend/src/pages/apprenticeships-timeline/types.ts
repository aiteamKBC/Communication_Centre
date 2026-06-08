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

export interface SessionKsbMapping {
  knowledgeCodes: string[];
  skillCodes: string[];
  behaviourCodes: string[];
}

export type CoverageStatus = 'none' | 'required' | 'covered';

export interface SessionCoverage {
  sessionNumber: number;
  assignedTutorProfileId?: string;
  coverageTutorProfileId?: string;
  coverageStatus: CoverageStatus;
  tutorUnavailable: boolean;
  tutorUnavailableReason?: string;
  tutorUnavailableNotes?: string;
  coverageReason?: string;
  coverageNotes?: string;
}

export type WeekDayKey = 'saturday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

export interface ModuleBlock {
  id: string;
  mod: ModuleValue;
  groupName?: string;
  coachName?: string;
  color?: string;
  tutor: string;
  tutorProfileId?: string;
  startDate: string;   // ISO: "2025-01-06"
  endDate: string;     // ISO: "2025-05-30"
  sessions: number;
  days?: WeekDayKey[];
  sessionStartTime?: string; // HH:mm, e.g. "13:00"
  sessionEndTime?: string;   // HH:mm, e.g. "15:00"
  sessionKsbMappings?: SessionKsbMapping[];
  sessionCoverage?: SessionCoverage[];
  notes?: string;
}

export interface CohortRow {
  id: string;
  label: string;
  dateLbl: string;
  endDateLbl?: string;
  intake: string;      // e.g. "Intake 1", "Intake 2"
  quarter: string;     // e.g. "Q1 2025"
  color?: string;
  holidayIds?: string[];
  ksbProfileId?: string;
  blks: ModuleBlock[];
}

export interface ProgrammeGroup {
  id: string;
  name: string;
  sub: string;
  color: string;
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

export interface CustomModule {
  id: string;
  name: string;
  defaultSessions: number;
  bg: string;
  tx: string;
}

export interface CustomProgram {
  id: string;
  name: string;
  sub: string;
  color: string;
}

export interface CatalogModule {
  id: number;
  name: string;
  colour: string;
  sessions: string;
  notes: string;
  sessionNames: string[];
  sessionDescriptions: string[];
  sessionKsbMappings?: SessionKsbMapping[];
}

export interface KsbProfile {
  id: string;
  name: string;
  programmeName: string;
  description: string;
  ksbItems?: KsbProfileItem[];
  knowledgeCodes: string[];
  skillCodes: string[];
  behaviourCodes: string[];
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TutorProfile {
  id: string;
  name: string;
  normalizedName: string;
  email?: string;
  phone?: string;
  notes?: string;
  availabilityNotes?: string;
  isActive: boolean;
  sessionCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface KsbProfileItem {
  type: 'K' | 'S' | 'B';
  number: string;
  code: string;
  description: string;
}
