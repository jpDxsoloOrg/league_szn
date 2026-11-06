import type { TFunction } from 'i18next';
import type { Match } from '../types';

export type FormResult = 'W' | 'L' | 'D';

/** Spellings found in stored matches, mapped to one label key each. */
const FORMAT_KEYS: Record<string, string> = {
  single: 'singles',
  singles: 'singles',
  tag: 'tagTeam',
  'tag-team': 'tagTeam',
  tagteam: 'tagTeam',
  'triple-threat': 'tripleThreat',
  'fatal-4-way': 'fatalFourWay',
  'fatal-four-way': 'fatalFourWay',
  '6-pack': 'sixPack',
  'six-pack': 'sixPack',
  '6-pack-challenge': 'sixPack',
  'six-pack-challenge': 'sixPack',
  'battle-royal': 'battleRoyal',
  'battle-royale': 'battleRoyal',
  'royal-rumble': 'royalRumble',
};

const FORMAT_LABELS: Record<string, string> = {
  singles: 'Singles',
  tagTeam: 'Tag Team',
  tripleThreat: 'Triple Threat',
  fatalFourWay: 'Fatal Four Way',
  sixPack: '6-Pack Challenge',
  battleRoyal: 'Battle Royal',
  royalRumble: 'Royal Rumble',
};

function toSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function toTitleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** One key per format however it was spelled, so duplicates can be merged. */
export function matchFormatKey(format: string): string {
  const slug = toSlug(format);
  return FORMAT_KEYS[slug] ?? slug;
}

/** Display label for a stored format such as "singles", "Tag Team" or "6-pack-challenge". */
export function formatMatchType(format: string | null | undefined, t: TFunction): string {
  const slug = toSlug(format ?? '');
  if (!slug) return '';
  const key = FORMAT_KEYS[slug];
  return key ? t(`matchFormats.${key}`, FORMAT_LABELS[key] ?? toTitleCase(slug)) : toTitleCase(slug);
}

export function isTagFormat(format: string | null | undefined): boolean {
  return matchFormatKey(format ?? '') === 'tagTeam';
}

/**
 * Split a match into its sides. Stored teams win. A tag match without them lists
 * partners together, so it is halved. Anything else is every player for themselves.
 */
export function groupMatchSides<Participant>(
  participants: Participant[],
  getId: (participant: Participant) => string,
  teams?: string[][],
  format?: string | null,
): Participant[][] {
  if (teams && teams.length >= 2) {
    const placed = new Set<string>();
    const sides = teams.map((team) => {
      const members = participants.filter((participant) => team.includes(getId(participant)) && !placed.has(getId(participant)));
      members.forEach((member) => placed.add(getId(member)));
      return members;
    });
    const unplaced = participants.filter((participant) => !placed.has(getId(participant)));
    return [...sides, ...unplaced.map((participant) => [participant])].filter((side) => side.length > 0);
  }
  if (isTagFormat(format) && participants.length >= 4 && participants.length % 2 === 0) {
    const half = participants.length / 2;
    return [participants.slice(0, half), participants.slice(half)];
  }
  return participants.map((participant) => [participant]);
}

/** "A & B vs C & D" for two sides, "A, B, C" for a multi-man match. */
export function describeSides(sides: string[][], versus: string): string {
  const labels = sides.map((side) => side.join(' & '));
  return labels.length === 2 ? labels.join(` ${versus} `) : labels.join(', ');
}

export function getMatchResult(match: Pick<Match, 'winners' | 'losers' | 'isDraw'>, playerId: string): FormResult | null {
  const won = match.winners?.includes(playerId) ?? false;
  const lost = match.losers?.includes(playerId) ?? false;
  // A draw is stored with every participant as a winner and no losers.
  if (match.isDraw || (won && (match.losers?.length ?? 0) === 0)) return 'D';
  if (won) return 'W';
  return lost ? 'L' : null;
}

export interface PlayerForm {
  /** Newest first. */
  recentForm: FormResult[];
  currentStreak?: { type: FormResult; count: number };
}

/** Form and streak from a player's own matches, newest first in the result. */
export function computePlayerForm(playerId: string, matches: Match[], formLength = 5): PlayerForm {
  const results = matches
    .filter((match) => match.status === 'completed')
    .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime())
    .flatMap((match) => {
      const result = getMatchResult(match, playerId);
      return result ? [result] : [];
    });
  const [latest] = results;
  if (!latest) return { recentForm: [] };
  const streakEnd = results.findIndex((result) => result !== latest);
  return {
    recentForm: results.slice(0, formLength),
    currentStreak: { type: latest, count: streakEnd === -1 ? results.length : streakEnd },
  };
}
