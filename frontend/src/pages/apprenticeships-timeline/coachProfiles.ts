import type { CoachProfile, ProgrammeGroup } from './types';
import { normalizeTutorName } from './tutorProfiles';

export function profileIdForCoachName(name: string, profiles: CoachProfile[]): string {
  const normalized = normalizeTutorName(name);
  if (!normalized) return '';
  return profiles.find(profile => profile.isActive && normalizeTutorName(profile.name) === normalized)?.id || '';
}

export function coachDisplayName(name: string, profileId: string | undefined, profiles: CoachProfile[]): string {
  if (profileId) {
    const profile = profiles.find(item => item.isActive && item.id === profileId);
    if (profile) return profile.name;
  }
  return name || '';
}

export function buildCoachProfilesFromGroups(groups: ProgrammeGroup[], profiles: CoachProfile[]): CoachProfile[] {
  const byId = new Map(profiles.filter(profile => profile.isActive).map(profile => [profile.id, { ...profile }]));
  const fallbackByName = new Map<string, CoachProfile>();

  groups.forEach(group => group.rows.forEach(row => row.blks.forEach(block => {
    const name = (block.coachName || '').trim();
    const normalizedName = normalizeTutorName(name);
    if (!normalizedName) return;
    const existing = profiles.find(profile => profile.isActive && normalizeTutorName(profile.name) === normalizedName);
    if (existing) return;
    if (fallbackByName.has(normalizedName)) return;
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
