import { getModuleMeta, MS } from './data';
import type { CustomModule, MKey, ProgrammeGroup } from './types';

// Colour aliases are presentation-only: they never identify comparison matches.
const moduleFamilies: [RegExp, MKey][] = [
  [/\b(?:mar\s*tech|matech|marketing technology)\b/, 'tech'],
  [/\bsocial\s*media\b|^social$/, 'social'],
  [/\b(?:marketing impact|impact.*planning|planning integrated campaigns)\b/, 'impact'],
  [/\b(?:strategy|staregy).*planning\b/, 'strat'],
  [/\b(?:commercial|commerical) int(?:elligence)?\b/, 'comm'],
  [/\bcustomer journey\b/, 'cust'],
  [/\b(?:ai|artificial intelligence)(?: in)? marketing\b/, 'ai'],
  [/\b(?:pmp\d*|project management profes{1,2}ional)\b/, 'pmp'],
  [/\b(?:pmi sp|msp|managing successful programmes)\b/, 'pmiSP'],
  [/\b(?:evm|earned value|portfolio management|managing portfolios)\b/, 'evm'],
  [/\brisk manag(?:ement|ment)\b/, 'risk'],
  [/\b(?:ppc|pmi pmo|project management office|project planning.*control)\b/, 'ppc'],
];

const fallbackColours = Object.values(MS).map(module => module.bg);

function normalizeName(name: string | null): string {
  return (name ?? '').toLowerCase().replace(/&amp;/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function moduleFamily(normalized: string): MKey | undefined {
  return moduleFamilies.find(([pattern]) => pattern.test(normalized))?.[1];
}

export function getLmsModuleColour(name: string | null): string {
  const normalized = normalizeName(name);
  const family = moduleFamily(normalized);
  if (family) return MS[family].bg;

  // Stable across source IDs, programmes, dates and record order.
  const key = normalized.replace(/(?:\s+copy)+$/, '');
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return fallbackColours[hash % fallbackColours.length];
}

export function createLmsModuleColourResolver(programmes: ProgrammeGroup[], customModules: CustomModule[]) {
  const colours = programmes.flatMap(programme => programme.rows.flatMap(row => row.blks.map(block => {
    const custom = block.mod in MS ? undefined : customModules.find(module => module.id === block.mod || module.name === block.mod);
    const meta = custom ? { lbl: custom.name, bg: custom.bg } : getModuleMeta(block.mod);
    const name = normalizeName(meta.lbl);
    return { programmeId: programme.id, name, family: moduleFamily(name), colour: block.color || meta.bg };
  })));

  return (name: string | null, programmeId: string): string => {
    const normalized = normalizeName(name);
    const family = moduleFamily(normalized);
    const local = colours.filter(module => module.programmeId === programmeId);
    // Prefer this programme's colours and exact names before broader family aliases.
    for (const candidates of [local, colours]) {
      const match = candidates.find(module => module.name === normalized)
        ?? (family ? candidates.find(module => module.family === family) : undefined);
      if (match) return match.colour;
    }
    return getLmsModuleColour(name);
  };
}
