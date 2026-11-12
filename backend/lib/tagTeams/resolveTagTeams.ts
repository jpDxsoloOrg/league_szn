/**
 * Read-time resolution of tag teams from match participants (TTC-01).
 *
 * Matches store players only (`participants`, `teams`, `winners`, `losers`),
 * never a tagTeamId. This module answers "which tag team were these two
 * players in this match?" by looking the pair up against every tag team
 * that ever existed, using the match date to pick between a pair's
 * successive teams (a pair can dissolve and re-form as a new team).
 *
 * Everything here is pure: callers load teams once (e.g. via
 * `getRepositories().roster.tagTeams.listAll()`), build an index, and reuse it.
 */
import type { Match, TagTeam } from '../repositories/types';

/** Pair key -> every tag team that pair has formed, oldest first. */
export type TagTeamIndex = ReadonlyMap<string, readonly TagTeam[]>;

/** Teams that never got past the request stage are not real teams. */
const UNCONFIRMED_STATUSES: ReadonlySet<TagTeam['status']> = new Set(['pending_partner', 'pending_admin']);

/** Order-independent key for a pair of players: `"<lower id>|<higher id>"`. */
export function pairKey(playerA: string, playerB: string): string {
  return playerA < playerB ? `${playerA}|${playerB}` : `${playerB}|${playerA}`;
}

function toTime(iso: string | undefined): number {
  if (!iso) return Number.NaN;
  return Date.parse(iso);
}

/**
 * Builds the pair index from tag teams of any status. Pass dissolved teams
 * too, or historical matches won't resolve. Teams still pending
 * (`pending_partner` / `pending_admin`) are left out.
 */
export function buildTagTeamIndex(teams: readonly TagTeam[]): TagTeamIndex {
  const index = new Map<string, TagTeam[]>();
  for (const team of teams) {
    if (UNCONFIRMED_STATUSES.has(team.status)) continue;
    if (!team.player1Id || !team.player2Id || team.player1Id === team.player2Id) continue;
    const key = pairKey(team.player1Id, team.player2Id);
    const bucket = index.get(key);
    if (bucket) bucket.push(team);
    else index.set(key, [team]);
  }
  for (const bucket of index.values()) {
    bucket.sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));
  }
  return index;
}

/**
 * Returns the team the pair formed on `matchDate`, or null if none.
 * A team is active from `createdAt` (inclusive) until `dissolvedAt`
 * (exclusive), or open-ended if it was never dissolved. If several teams
 * overlap, the most recently created one wins.
 */
export function resolveTeamForPair(
  index: TagTeamIndex,
  playerA: string,
  playerB: string,
  matchDate: string,
): TagTeam | null {
  if (!playerA || !playerB || playerA === playerB) return null;
  const candidates = index.get(pairKey(playerA, playerB));
  if (!candidates) return null;
  const at = toTime(matchDate);
  if (Number.isNaN(at)) return null;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const team = candidates[i];
    const start = toTime(team.createdAt);
    const end = toTime(team.dissolvedAt);
    if (start <= at && (Number.isNaN(end) || at < end)) return team;
  }
  return null;
}

// ─── Splitting a match into team sides ──────────────────────────────

/**
 * - `win` / `loss`: the side won or lost a completed match.
 * - `draw`: the match was a draw.
 * - `pending`: no result yet (the match isn't completed).
 */
export type TagSideOutcome = 'win' | 'loss' | 'draw' | 'pending';

export interface TagTeamMatchSide {
  /** The players on this side (normally two). */
  playerIds: string[];
  /** The tag team this side was on the match date, or null for a random pairing / non-pair side. */
  tagTeamId: string | null;
  outcome: TagSideOutcome;
}

/**
 * Result of `splitSidesIntoTeams`.
 *
 * - `sides`: every side of the match, in match order (from `match.teams` when
 *   present, otherwise winners first then losers). This is the full picture;
 *   use it whenever you need to tell "unknown team" apart from "no winner".
 * - `winners`: tagTeamId of the winning side. Null when the match is a draw,
 *   has no result yet, or the winning pair isn't a known team.
 * - `losers`: one entry per losing side, in side order, each a tagTeamId or
 *   null for a pair that isn't a known team. Empty for a draw or no result.
 *   A triple-threat tag match gives two entries.
 */
export interface TagTeamSplit {
  sides: TagTeamMatchSide[];
  winners: string | null;
  losers: (string | null)[];
}

export type TagMatchInput = Pick<
  Match,
  'date' | 'participants' | 'teams' | 'winners' | 'losers' | 'isDraw' | 'matchFormat' | 'matchType'
>;

function isTagMatch(match: TagMatchInput): boolean {
  const format = (match.matchFormat ?? match.matchType ?? '').toLowerCase();
  if (format.includes('tag')) return true;
  const teams = match.teams ?? [];
  return teams.length >= 2 && teams.every((team) => team.length === 2);
}

function teamIdForSide(index: TagTeamIndex, playerIds: string[], matchDate: string): string | null {
  if (playerIds.length !== 2) return null;
  return resolveTeamForPair(index, playerIds[0], playerIds[1], matchDate)?.tagTeamId ?? null;
}

/**
 * Splits a flat list of players (e.g. all four losers of a triple-threat tag
 * match with no `teams` field) into sides of two. Known teams are paired
 * first; leftover players are paired in list order as unknown sides.
 */
function partitionIntoPairs(
  index: TagTeamIndex,
  playerIds: string[],
  matchDate: string,
): { playerIds: string[]; tagTeamId: string | null }[] {
  if (playerIds.length <= 2) {
    return playerIds.length === 0 ? [] : [{ playerIds, tagTeamId: teamIdForSide(index, playerIds, matchDate) }];
  }
  const remaining = [...playerIds];
  const known: { playerIds: string[]; tagTeamId: string | null }[] = [];
  const leftover: string[] = [];
  while (remaining.length > 0) {
    const player = remaining.shift() as string;
    const partnerIdx = remaining.findIndex((other) => resolveTeamForPair(index, player, other, matchDate) !== null);
    if (partnerIdx === -1) {
      leftover.push(player);
      continue;
    }
    const [partner] = remaining.splice(partnerIdx, 1);
    const pair = [player, partner];
    known.push({ playerIds: pair, tagTeamId: teamIdForSide(index, pair, matchDate) });
  }
  const unknown: { playerIds: string[]; tagTeamId: string | null }[] = [];
  for (let i = 0; i < leftover.length; i += 2) {
    unknown.push({ playerIds: leftover.slice(i, i + 2), tagTeamId: null });
  }
  return [...known, ...unknown];
}

function sideOutcome(playerIds: string[], match: TagMatchInput): TagSideOutcome {
  const winners = match.winners ?? [];
  const losers = match.losers ?? [];
  if (match.isDraw) return 'draw';
  if (playerIds.some((id) => winners.includes(id))) return 'win';
  if (playerIds.some((id) => losers.includes(id))) return 'loss';
  return 'pending';
}

/**
 * Turns a tag match's sides into tag team ids. Returns null for a match that
 * isn't a tag match (e.g. singles). Supports any number of 2-player sides,
 * so triple-threat and fatal-four-way tag matches work.
 *
 * Sides come from `match.teams` when present. Without it, they are derived
 * from `winners` and `losers` (or `participants` when there is no result),
 * pairing known teams first.
 */
export function splitSidesIntoTeams(match: TagMatchInput, index: TagTeamIndex): TagTeamSplit | null {
  if (!isTagMatch(match)) return null;

  let rawSides: { playerIds: string[]; tagTeamId: string | null }[];
  if (match.teams && match.teams.length >= 2) {
    rawSides = match.teams.map((team) => ({
      playerIds: [...team],
      tagTeamId: teamIdForSide(index, team, match.date),
    }));
  } else {
    const winners = match.winners ?? [];
    const losers = match.losers ?? [];
    rawSides =
      winners.length + losers.length > 0
        ? [...partitionIntoPairs(index, winners, match.date), ...partitionIntoPairs(index, losers, match.date)]
        : partitionIntoPairs(index, match.participants ?? [], match.date);
  }

  const sides: TagTeamMatchSide[] = rawSides.map((side) => ({
    ...side,
    outcome: sideOutcome(side.playerIds, match),
  }));
  const winningSide = sides.find((side) => side.outcome === 'win');

  return {
    sides,
    winners: winningSide?.tagTeamId ?? null,
    losers: sides.filter((side) => side.outcome === 'loss').map((side) => side.tagTeamId),
  };
}
