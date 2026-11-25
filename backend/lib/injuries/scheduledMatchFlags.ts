/**
 * Injured-participant flags on scheduled matches (INJ-07).
 *
 * Computed on read: a scheduled match lists every participant whose current
 * injury still keeps them out on the match date. Nothing is stored and
 * nothing is cancelled; GMs decide what to do with the match.
 *
 * Only the return date is exposed, which the public injury view already
 * shows. Severity, GM notes and stamina never go into match payloads.
 */
import { getRepositories } from '../repositories';
import type { Player } from '../repositories/types';
import { activeInjury } from './index';

export interface InjuredParticipant {
  playerId: string;
  returnsAt: string;
}

/** The match fields the flags read. Loose, so raw match rows fit too. */
export interface FlaggableMatch {
  status?: unknown;
  date?: unknown;
  participants?: unknown;
}

export type InjuryLookup = ReadonlyMap<string, Pick<Player, 'currentInjury'>>;

const participantIdsOf = (match: FlaggableMatch): string[] =>
  Array.isArray(match.participants)
    ? [...new Set(match.participants.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];

const isScheduled = (match: FlaggableMatch): boolean =>
  match.status === 'scheduled' && typeof match.date === 'string' && !Number.isNaN(Date.parse(match.date));

/**
 * Pure: the participants of a scheduled match who are still injured on its
 * date. Empty for any other status (completed matches are never flagged) and
 * for players missing from the lookup.
 */
export function injuredParticipantsFor(match: FlaggableMatch, lookup: InjuryLookup): InjuredParticipant[] {
  if (!isScheduled(match)) return [];
  const matchDate = match.date as string;
  const flagged: InjuredParticipant[] = [];
  for (const playerId of participantIdsOf(match)) {
    const player = lookup.get(playerId);
    const injury = player ? activeInjury(player, matchDate) : null;
    if (injury) flagged.push({ playerId, returnsAt: injury.returnsAt });
  }
  return flagged;
}

/** Participant ids across every scheduled match in the list. */
export function scheduledParticipantIds(matches: readonly FlaggableMatch[]): Set<string> {
  const ids = new Set<string>();
  for (const match of matches) {
    if (!isScheduled(match)) continue;
    for (const playerId of participantIdsOf(match)) ids.add(playerId);
  }
  return ids;
}

/**
 * The `injuredParticipants` field to spread into a match payload: present
 * only when someone is flagged, so unaffected payloads stay unchanged.
 */
export function injuredParticipantsField(
  match: FlaggableMatch,
  lookup: InjuryLookup | null,
): { injuredParticipants?: InjuredParticipant[] } {
  if (!lookup) return {};
  const injuredParticipants = injuredParticipantsFor(match, lookup);
  return injuredParticipants.length > 0 ? { injuredParticipants } : {};
}

/** The `injuries` feature flag. Never throws: a failed read counts as off. */
export async function injuryFlagsEnabled(): Promise<boolean> {
  try {
    const features = await getRepositories().user.siteConfig.getFeatures();
    return features.injuries === true;
  } catch (err) {
    console.warn('Could not read the injuries flag; leaving matches unflagged:', err);
    return false;
  }
}

/**
 * Loads the player rows the flags need for these matches. Reuses rows the
 * handler already has (`known`) and fetches only the rest. Null while the
 * `injuries` flag is off or when no scheduled match has participants, so
 * callers add nothing. Never throws: a failed lookup only drops the flags.
 */
export async function loadInjuryLookup(
  matches: readonly FlaggableMatch[],
  known: ReadonlyMap<string, Player> = new Map(),
): Promise<InjuryLookup | null> {
  if (scheduledParticipantIds(matches).size === 0) return null;
  if (!(await injuryFlagsEnabled())) return null;
  return buildInjuryLookup(matches, known);
}

/**
 * `loadInjuryLookup` for callers that already checked the flag. Never throws.
 */
export async function buildInjuryLookup(
  matches: readonly FlaggableMatch[],
  known: ReadonlyMap<string, Player> = new Map(),
): Promise<InjuryLookup | null> {
  const playerIds = scheduledParticipantIds(matches);
  if (playerIds.size === 0) return null;
  try {
    const lookup = new Map<string, Pick<Player, 'currentInjury'>>();
    const missing: string[] = [];
    for (const playerId of playerIds) {
      const player = known.get(playerId);
      if (player) lookup.set(playerId, player);
      else missing.push(playerId);
    }
    const { roster: { players } } = getRepositories();
    const fetched = await Promise.all(missing.map((playerId) => players.findById(playerId)));
    for (const player of fetched) {
      if (player) lookup.set(player.playerId, player);
    }
    return lookup;
  } catch (err) {
    console.warn('Injured-participant lookup failed; leaving matches unflagged:', err);
    return null;
  }
}

// ─── Events ─────────────────────────────────────────────────────────

/** An event-level flag: who is injured, and on which of the card's matches. */
export interface EventInjuredParticipant extends InjuredParticipant {
  matchId: string;
}

type EventCards = { matchCards?: ReadonlyArray<{ matchId?: string }> };
type CardMatch = FlaggableMatch & { matchId: string };

/** The scheduled matches on these events' cards that are in `matchesById`. */
export function eventCardMatches(
  events: readonly EventCards[],
  matchesById: ReadonlyMap<string, CardMatch>,
): CardMatch[] {
  const cardMatches: CardMatch[] = [];
  for (const event of events) {
    for (const card of event.matchCards ?? []) {
      const match = card.matchId ? matchesById.get(card.matchId) : undefined;
      if (match && isScheduled(match)) cardMatches.push(match);
    }
  }
  return cardMatches;
}

/**
 * The `injuredParticipants` field for an event payload: every injured
 * participant across the card's scheduled matches, one entry per match.
 * Present only when someone is flagged.
 */
export function eventInjuredParticipantsField(
  event: EventCards,
  matchesById: ReadonlyMap<string, CardMatch>,
  lookup: InjuryLookup | null,
): { injuredParticipants?: EventInjuredParticipant[] } {
  if (!lookup) return {};
  const injuredParticipants = eventCardMatches([event], matchesById).flatMap((match) =>
    injuredParticipantsFor(match, lookup).map((flag) => ({ ...flag, matchId: match.matchId })));
  return injuredParticipants.length > 0 ? { injuredParticipants } : {};
}
