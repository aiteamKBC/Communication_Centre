import type { ModuleMeta, MKey, ModuleValue, Holiday } from './types';

export const MS: Record<MKey, ModuleMeta> = {
  pmp: { lbl: 'PMP', bg: '#1B2A4A', tx: '#fff' },
  pmiSP: { lbl: 'PMI SP / MSP', bg: '#243560', tx: '#fff' },
  evm: { lbl: 'EVM / Portfolio', bg: '#F7A800', tx: '#1B2A4A' },
  risk: { lbl: 'Risk Management', bg: '#2E4482', tx: '#fff' },
  ppc: { lbl: 'PPC / PMI PMO', bg: '#3D5A99', tx: '#fff' },
  impact: { lbl: 'Impact & Planning', bg: '#C49A00', tx: '#fff' },
  social: { lbl: 'Social Media', bg: '#4A6DB0', tx: '#fff' },
  tech: { lbl: 'Martech', bg: '#B8860B', tx: '#fff' },
  strat: { lbl: 'Strategy & Planning', bg: '#1B3A7A', tx: '#fff' },
  comm: { lbl: 'Commercial Int', bg: '#5278C0', tx: '#fff' },
  cust: { lbl: 'Customer Journey', bg: '#A07800', tx: '#fff' },
  ai: { lbl: 'AI Marketing', bg: '#D4A900', tx: '#1B2A4A' },
};

const DEFAULT_MODULE_META: ModuleMeta = {
  lbl: '',
  bg: '#CBD5E1',
  tx: '#1F2937',
};

export function getModuleMeta(moduleValue: ModuleValue): ModuleMeta {
  if (moduleValue in MS) {
    return MS[moduleValue as MKey];
  }

  const trimmedValue = typeof moduleValue === 'string' ? moduleValue.trim() : '';
  return {
    ...DEFAULT_MODULE_META,
    lbl: trimmedValue || 'Untitled Module',
  };
}

export const DEFAULT_HOLIDAYS: Holiday[] = [
  { id: 'h1', label: 'Christmas Break', startDate: '2024-12-23', endDate: '2025-01-03', type: 'term-break', color: '#E8F4FD' },
  { id: 'h2', label: 'Easter Break', startDate: '2025-04-14', endDate: '2025-04-25', type: 'term-break', color: '#E8F4FD' },
  { id: 'h3', label: 'Summer Break', startDate: '2025-07-21', endDate: '2025-08-29', type: 'term-break', color: '#FFF3CD' },
  { id: 'h4', label: 'Christmas Break', startDate: '2025-12-22', endDate: '2026-01-02', type: 'term-break', color: '#E8F4FD' },
  { id: 'h5', label: 'Easter Break', startDate: '2026-03-30', endDate: '2026-04-10', type: 'term-break', color: '#E8F4FD' },
  { id: 'h6', label: 'Summer Break', startDate: '2026-07-20', endDate: '2026-08-28', type: 'term-break', color: '#FFF3CD' },
  { id: 'h7', label: 'Christmas Break', startDate: '2026-12-21', endDate: '2027-01-01', type: 'term-break', color: '#E8F4FD' },
  { id: 'h8', label: "New Year's Day", startDate: '2025-01-01', endDate: '2025-01-01', type: 'bank-holiday', color: '#F0FFF4' },
  { id: 'h9', label: 'Good Friday', startDate: '2025-04-18', endDate: '2025-04-18', type: 'bank-holiday', color: '#F0FFF4' },
  { id: 'h10', label: 'Early May Bank Hol', startDate: '2025-05-05', endDate: '2025-05-05', type: 'bank-holiday', color: '#F0FFF4' },
  { id: 'h11', label: 'Spring Bank Hol', startDate: '2025-05-26', endDate: '2025-05-26', type: 'bank-holiday', color: '#F0FFF4' },
  { id: 'h12', label: 'Summer Bank Hol', startDate: '2025-08-25', endDate: '2025-08-25', type: 'bank-holiday', color: '#F0FFF4' },
  { id: 'h13', label: 'Non-Teaching Week', startDate: '2025-10-27', endDate: '2025-10-31', type: 'non-teaching', color: '#FFF0F0' },
  { id: 'h14', label: 'Non-Teaching Week', startDate: '2026-02-16', endDate: '2026-02-20', type: 'non-teaching', color: '#FFF0F0' },
  { id: 'h15', label: 'Non-Teaching Week', startDate: '2026-10-26', endDate: '2026-10-30', type: 'non-teaching', color: '#FFF0F0' },
];
