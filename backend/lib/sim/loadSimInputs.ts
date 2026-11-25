/**
 * Sim input loader (BLD-07).
 *
 * Loads everything the match sim (BLD-05) needs for a set of sides in one
 * pass: the players, their divisions (for the build budget), their builds and
 * move levels, and a 0–100 form score. Returns `SimSide[]` ready for
 * `simulate`.
 *
 * Builds go through `toPlayerBuildView` (BLD-03), so the budget always comes
 * from the shared build helpers and an over-budget build arrives scaled.
 *
 * Form is the "strength of victories" score, see `strengthOfVictoriesForm`.
 * The window is the season (the given one, else the active one); with no
 * season it is each sim player's last FORM_RECENT_MATCH_LIMIT completed
 * matches. Completed matches are read with one `listCompleted()` call.
 *
 * Condition (INJ-09): when the `injuries` feature is on, each competitor gets
 * its stamina and injury state and a `condition` rating modifier from
 * `staminaSimMultiplier` (INJ-02), so the GM preview and the official sim both
 * see tired and hurt wrestlers do worse. With the feature off nothing changes.
 */
import { getRepositories } from '../repositories';
import type { Division, Match, Player } from '../repositories/types';
import { toPlayerBuildView } from '../builds/playerBuild';
import {
  competitorFromBuild,
  NEUTRAL_FORM,
  type SimCompetitor,
  type SimCondition,
  type SimModifier,
  type SimSide,
} from '../policies/matchSim';
import { staminaSimMultiplier } from '../policies/fatigue';
import type { InjuryTunables } from '../policies/fatigueDefaults';
import { currentStamina, isInjured } from '../injuries';
import {
  computeLeagueTable,
  type LeagueMatchInput,
  type LeaguePointsOptions,
  type LeagueRow,
} from '../policies/leaguePoints';
import { toLeagueMatch } from '../stats/leagueStandings';
import { matchResultTime } from '../matchTime';
import { isTeamsList } from '../tagTeams/sideBilling';

/** Matches per player used for form when there is no season. */
export const FORM_RECENT_MATCH_LIMIT = 10;
/** Share of form from points per match. */
export const FORM_POINTS_SHARE = 0.6;
/** Share of form from strength of schedule. */
export const FORM_SOS_SHARE = 0.4;

/** `SimModifier.source` of the stamina/injury multiplier (INJ-09). */
export const CONDITION_MODIFIER_SOURCE = 'condition';

const FORM_MIN = 0;
const FORM_MAX = 100;

// ─── Form ───────────────────────────────────────────────────────────

/**
 * Scale a value against the league reference: the reference maps to the
 * neutral 50, twice the reference (or more) to 100, zero to 0.
 */
function scaleToReference(value: number, reference: number): number {
  if (reference <= 0) return NEUTRAL_FORM;
  const scaled = (NEUTRAL_FORM * value) / reference;
  return Math.min(FORM_MAX, Math.max(FORM_MIN, scaled));
}

/**
 * "Strength of victories" form, 0–100, for `playerIds`.
 *
 * Replays `matches` with the league points policy (STR-01), which already
 * rewards beating stronger opponents (quality wins) and records strength of
 * schedule. Form = FORM_POINTS_SHARE × points per match +
 * FORM_SOS_SHARE × SOS, each scaled so the league's mean points per match
 * (over players with at least one credited match) reads as 50.
 *
 * Players with no credited match get NEUTRAL_FORM. Pure, so it can be swapped
 * for a different formula later.
 */
export function strengthOfVictoriesForm(
  matches: readonly LeagueMatchInput[],
  playerIds: readonly string[],
  countsFor?: LeaguePointsOptions['countsFor'],
): Map<string, number> {
  const rows = computeLeagueTable(matches, { playerIds, ...(countsFor ? { countsFor } : {}) });
  const active = rows.filter((row) => row.matchesPlayed > 0);
  const activeById = new Map(active.map((row) => [row.playerId, row]));
  const pointsPerMatch = (row: LeagueRow): number => row.points / row.matchesPlayed;
  const reference =
    active.length > 0 ? active.reduce((sum, row) => sum + pointsPerMatch(row), 0) / active.length : 0;

  const forms = new Map<string, number>();
  for (const playerId of playerIds) {
    const row = activeById.get(playerId);
    if (!row) {
      forms.set(playerId, NEUTRAL_FORM);
      continue;
    }
    const pointsScore = scaleToReference(pointsPerMatch(row), reference);
    const sosScore = scaleToReference(row.sos, reference);
    forms.set(playerId, Math.round(FORM_POINTS_SHARE * pointsScore + FORM_SOS_SHARE * sosScore));
  }
  return forms;
}

/** Each player's last `limit` completed matches (by result time), as match id sets. */
function recentMatchIdsByPlayer(
  matches: readonly Match[],
  playerIds: readonly string[],
  limit: number,
): Map<string, Set<string>> {
  const newestFirst = [...matches].sort((left, right) =>
    matchResultTime(right).localeCompare(matchResultTime(left)) || right.matchId.localeCompare(left.matchId),
  );
  const recent = new Map<string, Set<string>>();
  for (const playerId of playerIds) {
    const ids = newestFirst
      .filter((match) => (match.participants ?? []).includes(playerId))
      .slice(0, limit)
      .map((match) => match.matchId);
    recent.set(playerId, new Set(ids));
  }
  return recent;
}

// ─── Sides ──────────────────────────────────────────────────────────

/**
 * The sides of a match as player id lists: `match.teams` when it has at least
 * two sides, otherwise one side per participant (singles, every man for himself).
 */
export function simSidesFromMatch(match: Pick<Match, 'teams' | 'participants'>): string[][] {
  if (isTeamsList(match.teams) && match.teams.length >= 2) {
    return match.teams.map((team) => [...team]);
  }
  return (match.participants ?? []).map((playerId) => [playerId]);
}

// ─── Condition (INJ-09) ─────────────────────────────────────────────

/**
 * The player's stamina and injury state at `now`, and the rating modifier
 * for it: `staminaSimMultiplier` (linear from `simStaminaFloor` at 0 stamina
 * to 1 at max, × `simInjuredPenalty` while injured). An injury past its
 * `returnsAt` no longer counts.
 */
export function simConditionFor(
  player: Pick<Player, 'stamina' | 'currentInjury'>,
  tunables: InjuryTunables,
  now: Date,
): { condition: SimCondition; modifier: SimModifier } {
  const stamina = currentStamina(player, tunables.maxStamina);
  const injured = isInjured(player, now);
  return {
    condition: { stamina, maxStamina: tunables.maxStamina, injured },
    modifier: { source: CONDITION_MODIFIER_SOURCE, multiplier: staminaSimMultiplier(stamina, injured, tunables) },
  };
}

// ─── Loader ─────────────────────────────────────────────────────────

export interface LoadSimInputsRequest {
  /** One player id list per side. */
  sides: readonly (readonly string[])[];
  /** Side ids, in the order of `sides`. Defaults to `side-1`, `side-2`, … */
  sideIds?: readonly string[];
  /** Season for the form window. Defaults to the active season. */
  seasonId?: string;
  /** Clock for injury checks (tests). Defaults to now. */
  now?: Date;
}

export type FormWindow =
  | { kind: 'season'; seasonId: string }
  | { kind: 'recent'; matchLimit: number };

export interface SimInputs {
  sides: SimSide[];
  /** Every competitor, in side order. */
  competitors: SimCompetitor[];
  /** Players whose saved build is over their budget and was scaled down. */
  scaledPlayerIds: string[];
  formWindow: FormWindow;
  /** The loaded players by id, for names and movesets (BLD-08 play-by-play). */
  playersById: ReadonlyMap<string, Player>;
}

export type LoadSimInputsResult =
  | { ok: true; inputs: SimInputs }
  | { ok: false; missingPlayerIds: string[] };

/**
 * Load the sim inputs for `sides`. Fails with `missingPlayerIds` when any
 * player does not exist (or is soft-deleted); the caller turns that into a 400.
 */
export async function loadSimInputs(request: LoadSimInputsRequest): Promise<LoadSimInputsResult> {
  const repos = getRepositories();
  const uniqueIds = [...new Set(request.sides.flat())];

  const [players, divisions, completed, activeSeason, features] = await Promise.all([
    Promise.all(uniqueIds.map((playerId) => repos.roster.players.findById(playerId))),
    repos.leagueOps.divisions.list(),
    repos.competition.matches.listCompleted(),
    request.seasonId ? Promise.resolve(null) : repos.season.seasons.findActive(),
    repos.user.siteConfig.getFeatures(),
  ]);

  const playersById = new Map<string, Player>();
  players.forEach((player) => {
    if (player) playersById.set(player.playerId, player);
  });
  const missingPlayerIds = uniqueIds.filter((playerId) => !playersById.has(playerId));
  if (missingPlayerIds.length > 0) return { ok: false, missingPlayerIds };

  const divisionsById = new Map<string, Division>(divisions.map((division) => [division.divisionId, division]));

  const seasonId = request.seasonId ?? activeSeason?.seasonId;
  let formWindow: FormWindow;
  let forms: Map<string, number>;
  if (seasonId) {
    formWindow = { kind: 'season', seasonId };
    const seasonMatches = completed.filter((match) => match.seasonId === seasonId).map(toLeagueMatch);
    forms = strengthOfVictoriesForm(seasonMatches, uniqueIds);
  } else {
    formWindow = { kind: 'recent', matchLimit: FORM_RECENT_MATCH_LIMIT };
    // Sim players are credited only for their own recent matches; everyone
    // else keeps their full record, so opponents are judged on all of it.
    const recent = recentMatchIdsByPlayer(completed, uniqueIds, FORM_RECENT_MATCH_LIMIT);
    const countsFor = (playerId: string, match: LeagueMatchInput): boolean =>
      recent.get(playerId)?.has(match.matchId) ?? true;
    forms = strengthOfVictoriesForm(completed.map(toLeagueMatch), uniqueIds, countsFor);
  }

  // INJ-09: stamina and injuries only count while the feature is on.
  const injuryTunables = features.injuries ? await repos.user.siteConfig.getInjuryTunables() : null;
  const now = request.now ?? new Date();

  const scaledPlayerIds: string[] = [];
  const competitorsById = new Map<string, SimCompetitor>();
  for (const [playerId, player] of playersById) {
    const division = player.divisionId ? divisionsById.get(player.divisionId) : undefined;
    const view = toPlayerBuildView(player, division);
    if (view.effective.scaled) scaledPlayerIds.push(playerId);
    const form = forms.get(playerId) ?? NEUTRAL_FORM;
    if (injuryTunables) {
      const { condition, modifier } = simConditionFor(player, injuryTunables, now);
      competitorsById.set(playerId, { ...competitorFromBuild(playerId, view.effective, form, [modifier]), condition });
    } else {
      competitorsById.set(playerId, competitorFromBuild(playerId, view.effective, form));
    }
  }

  // Every id is in competitorsById: missing players returned above.
  const sides: SimSide[] = request.sides.map((playerIds, index) => ({
    sideId: request.sideIds?.[index] ?? `side-${index + 1}`,
    members: playerIds.flatMap((playerId) => competitorsById.get(playerId) ?? []),
  }));

  return {
    ok: true,
    inputs: {
      sides,
      competitors: sides.flatMap((side) => [...side.members]),
      scaledPlayerIds,
      formWindow,
      playersById,
    },
  };
}
