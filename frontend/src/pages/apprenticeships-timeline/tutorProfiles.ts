import type { ModuleBlock, ProgrammeGroup, TutorProfile } from './types';

export function normalizeTutorName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s@.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tutorNameSimilarity(a: string, b: string): number {
  const left = normalizeTutorName(a);
  const right = normalizeTutorName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.max(0.86, Math.min(left.length, right.length) / Math.max(left.length, right.length));
  }

  const rows = Array.from({ length: left.length + 1 }, (_, i) => i);
  for (let i = 1; i <= right.length; i += 1) {
    let previous = rows[0];
    rows[0] = i;
    for (let j = 1; j <= left.length; j += 1) {
      const temp = rows[j];
      rows[j] = Math.min(
        rows[j] + 1,
        rows[j - 1] + 1,
        previous + (right[i - 1] === left[j - 1] ? 0 : 1),
      );
      previous = temp;
    }
  }
  const distance = rows[left.length];
  return 1 - distance / Math.max(left.length, right.length);
}

export function profileIdForTutorName(name: string, profiles: TutorProfile[]): string {
  const normalized = normalizeTutorName(name);
  if (!normalized) return '';
  return profiles.find(profile => profile.isActive && normalizeTutorName(profile.name) === normalized)?.id || '';
}

export function resolveTutorProfile(block: Pick<ModuleBlock, 'tutor' | 'tutorProfileId'>, profiles: TutorProfile[]): TutorProfile | null {
  if (block.tutorProfileId) {
    const byId = profiles.find(profile => profile.isActive && profile.id === block.tutorProfileId);
    if (byId) return byId;
  }
  const byName = profileIdForTutorName(block.tutor || '', profiles);
  return byName ? profiles.find(profile => profile.id === byName) || null : null;
}

export function tutorDisplayName(block: Pick<ModuleBlock, 'tutor' | 'tutorProfileId'>, profiles: TutorProfile[]): string {
  return resolveTutorProfile(block, profiles)?.name || block.tutor || '';
}

export function buildTutorProfilesFromGroups(groups: ProgrammeGroup[], profiles: TutorProfile[]): TutorProfile[] {
  const byId = new Map(profiles.filter(profile => profile.isActive).map(profile => [profile.id, { ...profile }]));
  const fallbackByName = new Map<string, TutorProfile>();

  groups.forEach(group => group.rows.forEach(row => row.blks.forEach(block => {
    const existing = resolveTutorProfile(block, profiles);
    if (existing) return;
    if (block.tutorProfileId) return;
    const name = (block.tutor || '').trim();
    const normalizedName = normalizeTutorName(name);
    if (!normalizedName || fallbackByName.has(normalizedName)) return;
    fallbackByName.set(normalizedName, {
      id: `legacy:${normalizedName}`,
      name,
      normalizedName,
      isActive: true,
      sessionCount: 0,
    });
  })));

  return [...byId.values(), ...fallbackByName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function listPossibleTutorDuplicates(profiles: TutorProfile[]): Array<{ left: TutorProfile; right: TutorProfile; score: number }> {
  const pairs: Array<{ left: TutorProfile; right: TutorProfile; score: number }> = [];
  profiles.forEach((left, index) => {
    profiles.slice(index + 1).forEach(right => {
      const score = tutorNameSimilarity(left.name, right.name);
      if (score >= 0.72) {
        pairs.push({ left, right, score });
      }
    });
  });
  return pairs.sort((a, b) => b.score - a.score);
}
