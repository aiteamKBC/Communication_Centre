export interface AptemSubprogrammeScope {
  programmeName?: string | null;
  cohortName?: string | null;
  moduleName?: string | null;
  moduleCatalogueId?: string | null;
  moduleStartDate?: string | null;
  moduleEndDate?: string | null;
  groupName?: string | null;
}

export interface AptemSubprogrammeLoadResult {
  items: string[];
  requestedUrl: string;
  effectiveUrl: string;
  usedFallback: boolean;
}

export interface RankedAptemSubprogrammeOption {
  value: string;
  score: number;
  badges: string[];
  isSuggested: boolean;
}

const PROGRAMME_CODES = ['APM', 'MM', 'ME', 'PCP'];
const MONTHS = [
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar'],
  ['april', 'apr'],
  ['may', 'may'],
  ['june', 'jun'],
  ['july', 'jul'],
  ['august', 'aug'],
  ['september', 'sep'],
  ['october', 'oct'],
  ['november', 'nov'],
  ['december', 'dec'],
] as const;

export function normalizeAptemScopeValue(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeAptemMatchValue(value: unknown): string {
  return normalizeAptemScopeValue(value)
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\u2010-\u2015-]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSubprogrammeOption(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeAptemScopeValue(value);
  }
  if (value && typeof value === 'object') {
    const record = value as { subprogramme?: unknown; name?: unknown; label?: unknown; value?: unknown };
    return normalizeAptemScopeValue(record.subprogramme ?? record.name ?? record.label ?? record.value);
  }
  return '';
}

function splitSubprogrammeOption(value: unknown): string[] {
  const option = normalizeSubprogrammeOption(value);
  if (!option) return [];

  const trimmed = option.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
      if (Array.isArray(parsed)) {
        return parsed.flatMap(item => splitSubprogrammeOption(item));
      }
    } catch {
      // Fall through to the quoted-item parser below.
    }
  }

  const quotedItems = Array.from(trimmed.matchAll(/"([^"]+)"|'([^']+)'/g))
    .map(match => normalizeAptemScopeValue(match[1] || match[2]))
    .filter(Boolean);
  if (quotedItems.length > 1) {
    return quotedItems;
  }

  return [option];
}

export function buildAptemSubprogrammeScope<T extends AptemSubprogrammeScope>(scope: T): T {
  return {
    ...scope,
    programmeName: normalizeAptemScopeValue(scope.programmeName),
    cohortName: normalizeAptemScopeValue(scope.cohortName),
    moduleName: normalizeAptemScopeValue(scope.moduleName),
    moduleCatalogueId: normalizeAptemScopeValue(scope.moduleCatalogueId),
    groupName: normalizeAptemScopeValue(scope.groupName),
    moduleStartDate: normalizeAptemScopeValue(scope.moduleStartDate),
    moduleEndDate: normalizeAptemScopeValue(scope.moduleEndDate),
  };
}

export function parseAptemSubprogrammeOptions(data: unknown): string[] {
  const source = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? (Array.isArray((data as { items?: unknown[] }).items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { options?: unknown[] }).options)
          ? (data as { options: unknown[] }).options
          : [])
      : [];
  const seen = new Set<string>();
  return source.reduce<string[]>((options, item) => {
    splitSubprogrammeOption(item).forEach(option => {
      const key = option.toLocaleLowerCase();
      if (!option || seen.has(key)) return;
      seen.add(key);
      options.push(option);
    });
    return options;
  }, []);
}

export function buildAptemSubprogrammeQueryParams(scope: AptemSubprogrammeScope = {}): URLSearchParams {
  const params = new URLSearchParams();
  const normalizedScope = buildAptemSubprogrammeScope(scope);
  const programmeName = normalizeAptemScopeValue(normalizedScope.programmeName);
  const cohortName = normalizeAptemScopeValue(normalizedScope.cohortName);
  const moduleName = normalizeAptemScopeValue(normalizedScope.moduleName);
  if (programmeName) params.set('programmeName', programmeName);
  if (cohortName) params.set('cohortName', cohortName);
  if (moduleName) params.set('moduleName', moduleName);
  return params;
}

export function buildAptemSubprogrammesUrl(scope: AptemSubprogrammeScope = {}): string {
  const params = buildAptemSubprogrammeQueryParams(scope);
  const query = params.toString();
  return `/api/aptem/subprogrammes/${query ? `?${query}` : ''}`;
}

async function fetchAptemSubprogrammeOptions(url: string, init?: Parameters<typeof fetch>[1]): Promise<string[]> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error((await response.text()).trim() || `Subprogramme load failed with status ${response.status}`);
  }
  return parseAptemSubprogrammeOptions(await response.json());
}

export async function loadAptemSubprogrammesForModuleWithMeta(scope: AptemSubprogrammeScope = {}, init?: Parameters<typeof fetch>[1]): Promise<AptemSubprogrammeLoadResult> {
  const requestedUrl = buildAptemSubprogrammesUrl(scope);
  const scopedOptions = await fetchAptemSubprogrammeOptions(requestedUrl, init);
  const hasScope = buildAptemSubprogrammeQueryParams(scope).toString().length > 0;
  if (scopedOptions.length || !hasScope) {
    return {
      items: scopedOptions,
      requestedUrl,
      effectiveUrl: requestedUrl,
      usedFallback: false,
    };
  }

  const fallbackUrl = buildAptemSubprogrammesUrl();
  const fallbackOptions = await fetchAptemSubprogrammeOptions(fallbackUrl, init);
  return {
    items: fallbackOptions,
    requestedUrl,
    effectiveUrl: fallbackUrl,
    usedFallback: true,
  };
}

export async function loadAptemSubprogrammesForModule(scope: AptemSubprogrammeScope = {}, init?: Parameters<typeof fetch>[1]): Promise<string[]> {
  return (await loadAptemSubprogrammesForModuleWithMeta(scope, init)).items;
}

function acronym(value: string): string {
  return normalizeAptemScopeValue(value)
    .split(/[^A-Za-z0-9]+/)
    .filter(word => word.length > 1)
    .map(word => word[0])
    .join('')
    .toLocaleUpperCase();
}

function buildProgrammeCodeCandidates(scope: AptemSubprogrammeScope): string[] {
  const context = [scope.programmeName, scope.cohortName, scope.groupName].map(value => normalizeAptemScopeValue(value)).join(' ');
  const normalizedContext = normalizeAptemMatchValue(context);
  const candidates = new Set<string>();
  PROGRAMME_CODES.forEach(code => {
    if (new RegExp(`\\b${code.toLocaleLowerCase()}\\b`).test(normalizedContext)) candidates.add(code.toLocaleLowerCase());
  });
  const programmeAcronym = acronym(scope.programmeName || '');
  if (programmeAcronym.length >= 2 && programmeAcronym.length <= 5) candidates.add(programmeAcronym.toLocaleLowerCase());
  return Array.from(candidates);
}

function buildDateCandidates(scope: AptemSubprogrammeScope): string[] {
  const values = [scope.cohortName, scope.groupName, scope.moduleStartDate, scope.moduleEndDate].map(value => normalizeAptemScopeValue(value));
  const candidates = new Set<string>();

  values.forEach(value => {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const month = MONTHS[parsed.getMonth()];
      const year = parsed.getFullYear();
      const shortYear = String(year).slice(-2);
      candidates.add(`${month[0]} ${year}`);
      candidates.add(`${month[1]} ${year}`);
      candidates.add(`${month[0]} ${shortYear}`);
      candidates.add(`${month[1]} ${shortYear}`);
    }

    const normalized = normalizeAptemMatchValue(value);
    MONTHS.forEach(month => {
      const monthPattern = `(?:${month[0]}|${month[1]})`;
      const match = normalized.match(new RegExp(`\\b${monthPattern}\\s+(20\\d{2}|\\d{2})\\b`));
      if (match) {
        const year = match[1].length === 2 ? `20${match[1]}` : match[1];
        const shortYear = year.slice(-2);
        candidates.add(`${month[0]} ${year}`);
        candidates.add(`${month[1]} ${year}`);
        candidates.add(`${month[0]} ${shortYear}`);
        candidates.add(`${month[1]} ${shortYear}`);
      }
    });
  });

  return Array.from(candidates).map(normalizeAptemMatchValue).filter(Boolean);
}

function hasModuleMatch(option: string, moduleName: string): boolean {
  const normalizedModule = normalizeAptemMatchValue(moduleName);
  if (!normalizedModule) return false;
  if (option.includes(normalizedModule)) return true;
  const tokens = normalizedModule.split(' ').filter(token => token.length > 2);
  return tokens.length >= 2 && tokens.every(token => option.includes(token));
}

export function rankAptemSubprogrammeOptions(options: string[], scope: AptemSubprogrammeScope = {}): RankedAptemSubprogrammeOption[] {
  const normalizedScope = buildAptemSubprogrammeScope(scope);
  const programmeCodes = buildProgrammeCodeCandidates(normalizedScope);
  const dateCandidates = buildDateCandidates(normalizedScope);

  return options
    .map((value, index) => {
      const option = normalizeAptemMatchValue(value);
      let score = 0;
      const badges: string[] = [];

      if (programmeCodes.some(code => new RegExp(`\\b${code}\\b`).test(option))) {
        score += 40;
        badges.push('Programme match');
      }

      if (hasModuleMatch(option, normalizedScope.moduleName || '')) {
        score += 30;
        badges.push('Module match');
      }

      if (dateCandidates.some(candidate => option.includes(candidate))) {
        score += 25;
      }

      const ranked = {
        value,
        score,
        badges,
        isSuggested: score > 0,
        index,
      };
      return ranked;
    })
    .sort((left, right) => (
      right.score - left.score ||
      left.value.localeCompare(right.value) ||
      left.index - right.index
    ))
    .map(({ index: _index, ...item }) => item);
}
