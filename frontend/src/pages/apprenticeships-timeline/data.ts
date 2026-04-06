import type { ModuleMeta, MKey, ProgrammeGroup, Holiday } from './types';

// ── Module colour registry ────────────────────────────────────────────────
export const MS: Record<MKey, ModuleMeta> = {
  pmp:    { lbl: 'PMP',                 bg: '#1B2A4A', tx: '#fff' },
  pmiSP:  { lbl: 'PMI SP / MSP',        bg: '#243560', tx: '#fff' },
  evm:    { lbl: 'EVM / Portfolio',     bg: '#F7A800', tx: '#1B2A4A' },
  risk:   { lbl: 'Risk Management',     bg: '#2E4482', tx: '#fff' },
  ppc:    { lbl: 'PPC / PMI PMO',       bg: '#3D5A99', tx: '#fff' },
  impact: { lbl: 'Impact & Planning',   bg: '#C49A00', tx: '#fff' },
  social: { lbl: 'Social Media',        bg: '#4A6DB0', tx: '#fff' },
  tech:   { lbl: 'Martech',             bg: '#B8860B', tx: '#fff' },
  strat:  { lbl: 'Strategy & Planning', bg: '#1B3A7A', tx: '#fff' },
  comm:   { lbl: 'Commercial Int',      bg: '#5278C0', tx: '#fff' },
  cust:   { lbl: 'Customer Journey',    bg: '#A07800', tx: '#fff' },
  ai:     { lbl: 'AI Marketing',        bg: '#D4A900', tx: '#1B2A4A' },
};

// ── Default holidays ──────────────────────────────────────────────────────
export const DEFAULT_HOLIDAYS: Holiday[] = [
  { id: 'h1',  label: 'Christmas Break',       startDate: '2024-12-23', endDate: '2025-01-03', type: 'term-break',    color: '#E8F4FD' },
  { id: 'h2',  label: 'Easter Break',          startDate: '2025-04-14', endDate: '2025-04-25', type: 'term-break',    color: '#E8F4FD' },
  { id: 'h3',  label: 'Summer Break',          startDate: '2025-07-21', endDate: '2025-08-29', type: 'term-break',    color: '#FFF3CD' },
  { id: 'h4',  label: 'Christmas Break',       startDate: '2025-12-22', endDate: '2026-01-02', type: 'term-break',    color: '#E8F4FD' },
  { id: 'h5',  label: 'Easter Break',          startDate: '2026-03-30', endDate: '2026-04-10', type: 'term-break',    color: '#E8F4FD' },
  { id: 'h6',  label: 'Summer Break',          startDate: '2026-07-20', endDate: '2026-08-28', type: 'term-break',    color: '#FFF3CD' },
  { id: 'h7',  label: 'Christmas Break',       startDate: '2026-12-21', endDate: '2027-01-01', type: 'term-break',    color: '#E8F4FD' },
  { id: 'h8',  label: 'New Year\'s Day',       startDate: '2025-01-01', endDate: '2025-01-01', type: 'bank-holiday',  color: '#F0FFF4' },
  { id: 'h9',  label: 'Good Friday',           startDate: '2025-04-18', endDate: '2025-04-18', type: 'bank-holiday',  color: '#F0FFF4' },
  { id: 'h10', label: 'Early May Bank Hol',    startDate: '2025-05-05', endDate: '2025-05-05', type: 'bank-holiday',  color: '#F0FFF4' },
  { id: 'h11', label: 'Spring Bank Hol',       startDate: '2025-05-26', endDate: '2025-05-26', type: 'bank-holiday',  color: '#F0FFF4' },
  { id: 'h12', label: 'Summer Bank Hol',       startDate: '2025-08-25', endDate: '2025-08-25', type: 'bank-holiday',  color: '#F0FFF4' },
  { id: 'h13', label: 'Non-Teaching Week',     startDate: '2025-10-27', endDate: '2025-10-31', type: 'non-teaching',  color: '#FFF0F0' },
  { id: 'h14', label: 'Non-Teaching Week',     startDate: '2026-02-16', endDate: '2026-02-20', type: 'non-teaching',  color: '#FFF0F0' },
  { id: 'h15', label: 'Non-Teaching Week',     startDate: '2026-10-26', endDate: '2026-10-30', type: 'non-teaching',  color: '#FFF0F0' },
];

// ── Initial programme data ────────────────────────────────────────────────
export const INITIAL_GROUPS: ProgrammeGroup[] = [
  {
    id: 'pcp',
    name: 'Project Control\nProfessional L6 (PCP)',
    sub: '2024 – 2027',
    color: '#1B2A4A',
    rowBg: 'rgba(27,42,74,0.04)',
    rows: [
      {
        id: 'pcp-c1',
        label: 'Cohort 1 - G1',
        dateLbl: 'Aug 2024',
        intake: 'Intake 1',
        quarter: 'Q3 2024',
        blks: [
          { id: 'b1',  mod: 'pmp',   tutor: 'Andrew Marsh',    startDate: '2024-08-05', endDate: '2025-01-10', sessions: 20 },
          { id: 'b2',  mod: 'pmiSP', tutor: 'Ray Thornton',    startDate: '2025-01-13', endDate: '2025-06-06', sessions: 18 },
          { id: 'b3',  mod: 'evm',   tutor: 'Amgad Hassan',    startDate: '2025-06-09', endDate: '2025-10-03', sessions: 14 },
          { id: 'b4',  mod: 'risk',  tutor: 'Andrew Marsh',    startDate: '2025-10-06', endDate: '2025-12-19', sessions: 10 },
          { id: 'b5',  mod: 'ppc',   tutor: 'Ray Thornton',    startDate: '2026-01-05', endDate: '2026-03-27', sessions: 10 },
        ],
      },
      {
        id: 'pcp-c2',
        label: 'Cohort 2 - G2',
        dateLbl: 'Jan 2025',
        intake: 'Intake 2',
        quarter: 'Q1 2025',
        blks: [
          { id: 'b6',  mod: 'pmp',   tutor: 'Ray Thornton',    startDate: '2025-01-06', endDate: '2025-06-06', sessions: 20 },
          { id: 'b7',  mod: 'pmiSP', tutor: 'Amgad Hassan',    startDate: '2025-06-09', endDate: '2025-10-03', sessions: 16 },
          { id: 'b8',  mod: 'evm',   tutor: 'Andrew Marsh',    startDate: '2025-10-06', endDate: '2025-12-19', sessions: 10 },
          { id: 'b9',  mod: 'risk',  tutor: 'Ray Thornton',    startDate: '2026-01-05', endDate: '2026-03-27', sessions: 10 },
          { id: 'b10', mod: 'ppc',   tutor: 'Amgad Hassan',    startDate: '2026-04-07', endDate: '2026-06-26', sessions: 10 },
        ],
      },
      {
        id: 'pcp-c3',
        label: 'Cohort 3 - G1',
        dateLbl: 'May 2025',
        intake: 'Intake 3',
        quarter: 'Q2 2025',
        blks: [
          { id: 'b11', mod: 'pmp',   tutor: 'Andrew Marsh',    startDate: '2025-05-06', endDate: '2025-10-03', sessions: 20 },
          { id: 'b12', mod: 'pmiSP', tutor: 'Ray Thornton',    startDate: '2025-10-06', endDate: '2026-02-13', sessions: 16 },
          { id: 'b13', mod: 'evm',   tutor: 'Amgad Hassan',    startDate: '2026-02-16', endDate: '2026-05-08', sessions: 12 },
          { id: 'b14', mod: 'risk',  tutor: 'Andrew Marsh',    startDate: '2026-05-11', endDate: '2026-07-31', sessions: 10 },
          { id: 'b15', mod: 'ppc',   tutor: 'Ray Thornton',    startDate: '2026-08-03', endDate: '2026-10-23', sessions: 10 },
        ],
      },
      {
        id: 'pcp-c4',
        label: 'Cohort 4 - G1',
        dateLbl: 'Oct 2025',
        intake: 'Intake 4',
        quarter: 'Q4 2025',
        blks: [
          { id: 'b16', mod: 'pmp',   tutor: 'Amgad Hassan',    startDate: '2025-10-06', endDate: '2026-03-06', sessions: 20 },
          { id: 'b17', mod: 'pmiSP', tutor: 'Andrew Marsh',    startDate: '2026-03-09', endDate: '2026-07-03', sessions: 16 },
          { id: 'b18', mod: 'evm',   tutor: 'Ray Thornton',    startDate: '2026-07-06', endDate: '2026-09-25', sessions: 12 },
          { id: 'b19', mod: 'risk',  tutor: 'Amgad Hassan',    startDate: '2026-10-05', endDate: '2026-12-18', sessions: 10 },
          { id: 'b20', mod: 'ppc',   tutor: 'Andrew Marsh',    startDate: '2027-01-04', endDate: '2027-03-26', sessions: 10 },
        ],
      },
    ],
  },
  {
    id: 'me',
    name: 'Marketing Executive\nL4 (ME)',
    sub: '2025 – 2026',
    color: '#2E4482',
    rowBg: 'rgba(46,68,130,0.04)',
    rows: [
      {
        id: 'me-c1',
        label: 'Cohort 1 - G1',
        dateLbl: 'Jan 2025',
        intake: 'Intake 1',
        quarter: 'Q1 2025',
        blks: [
          { id: 'b21', mod: 'impact', tutor: 'Charlotte Webb',  startDate: '2025-01-06', endDate: '2025-05-02', sessions: 16 },
          { id: 'b22', mod: 'social', tutor: 'Nathan Ellis',    startDate: '2025-05-06', endDate: '2025-07-25', sessions: 12 },
          { id: 'b23', mod: 'tech',   tutor: 'Fredah Osei',     startDate: '2025-07-28', endDate: '2025-09-26', sessions: 8  },
        ],
      },
      {
        id: 'me-c2',
        label: 'Cohort 2 - G4',
        dateLbl: 'May 2025',
        intake: 'Intake 2',
        quarter: 'Q2 2025',
        blks: [
          { id: 'b24', mod: 'impact', tutor: 'Crispin Adey',    startDate: '2025-05-06', endDate: '2025-09-05', sessions: 16 },
          { id: 'b25', mod: 'social', tutor: 'Samar Khalil',    startDate: '2025-09-08', endDate: '2025-11-28', sessions: 12 },
          { id: 'b26', mod: 'tech',   tutor: 'Nathan Ellis',    startDate: '2025-12-01', endDate: '2026-01-30', sessions: 8  },
        ],
      },
      {
        id: 'me-c3',
        label: 'Cohort 3 - G1',
        dateLbl: 'Jul 2025',
        intake: 'Intake 3',
        quarter: 'Q3 2025',
        blks: [
          { id: 'b27', mod: 'impact', tutor: 'Charlotte Webb',  startDate: '2025-07-07', endDate: '2025-11-07', sessions: 16 },
          { id: 'b28', mod: 'social', tutor: 'Fredah Osei',     startDate: '2025-11-10', endDate: '2026-02-06', sessions: 12 },
          { id: 'b29', mod: 'tech',   tutor: 'Crispin Adey',    startDate: '2026-02-09', endDate: '2026-04-10', sessions: 8  },
        ],
      },
      {
        id: 'me-c4',
        label: 'Cohort 4 - G2',
        dateLbl: 'Oct 2025',
        intake: 'Intake 4',
        quarter: 'Q4 2025',
        blks: [
          { id: 'b30', mod: 'impact', tutor: 'Nathan Ellis',    startDate: '2025-10-06', endDate: '2026-02-06', sessions: 16 },
          { id: 'b31', mod: 'social', tutor: 'Samar Khalil',    startDate: '2026-02-09', endDate: '2026-05-08', sessions: 12 },
        ],
      },
      {
        id: 'me-c5',
        label: 'Cohort 5 - G2',
        dateLbl: 'Jan 2026',
        intake: 'Intake 5',
        quarter: 'Q1 2026',
        blks: [
          { id: 'b32', mod: 'impact', tutor: 'Charlotte Webb',  startDate: '2026-01-05', endDate: '2026-05-08', sessions: 16 },
          { id: 'b33', mod: 'social', tutor: 'Nathan Ellis',    startDate: '2026-05-11', endDate: '2026-08-07', sessions: 12 },
        ],
      },
    ],
  },
  {
    id: 'mm',
    name: 'Marketing Manager\nL6 (MM)',
    sub: '2025 – 2026',
    color: '#3D5A99',
    rowBg: 'rgba(61,90,153,0.04)',
    rows: [
      {
        id: 'mm-c1',
        label: 'Cohort 1 - G1',
        dateLbl: 'May 2025',
        intake: 'Intake 1',
        quarter: 'Q2 2025',
        blks: [
          { id: 'b34', mod: 'strat', tutor: 'Charlotte Webb',  startDate: '2025-05-06', endDate: '2025-10-03', sessions: 20 },
          { id: 'b35', mod: 'comm',  tutor: 'Juliane Braun',   startDate: '2025-10-06', endDate: '2025-12-19', sessions: 12 },
          { id: 'b36', mod: 'cust',  tutor: 'Fredah Osei',     startDate: '2026-01-05', endDate: '2026-05-08', sessions: 16 },
          { id: 'b37', mod: 'ai',    tutor: 'Nathan Ellis',    startDate: '2026-05-11', endDate: '2026-07-31', sessions: 12 },
        ],
      },
      {
        id: 'mm-c2',
        label: 'Cohort 1 - G3',
        dateLbl: 'Oct 2025',
        intake: 'Intake 2',
        quarter: 'Q4 2025',
        blks: [
          { id: 'b38', mod: 'strat', tutor: 'Juliane Braun',   startDate: '2025-10-06', endDate: '2026-03-06', sessions: 20 },
          { id: 'b39', mod: 'comm',  tutor: 'Charlotte Webb',  startDate: '2026-03-09', endDate: '2026-05-29', sessions: 12 },
          { id: 'b40', mod: 'cust',  tutor: 'Fredah Osei',     startDate: '2026-06-01', endDate: '2026-09-25', sessions: 16 },
        ],
      },
      {
        id: 'mm-c3',
        label: 'Cohort 1 - G3',
        dateLbl: 'Jan 2026',
        intake: 'Intake 3',
        quarter: 'Q1 2026',
        blks: [
          { id: 'b41', mod: 'strat', tutor: 'Charlotte Webb',  startDate: '2026-01-05', endDate: '2026-06-05', sessions: 20 },
          { id: 'b42', mod: 'comm',  tutor: 'Nathan Ellis',    startDate: '2026-06-08', endDate: '2026-08-28', sessions: 12 },
        ],
      },
    ],
  },
];
