/**
 * Progression data loader (CUP-02, extended by DMV-02).
 *
 * Collects the raw activity the progression policy scores. Built for the
 * recompute-all case: completed matches, promos, challenges and players are
 * each listed ONCE, then grouped by player, however many players are asked for.
 *
 * DMV-02 adds:
 *   - `isHotAngle` on each match input: the match's `rivalryId` points to an
 *     ACTIVE rivalry whose heat tier is hot or above. Relegation metrics skip
 *     losses in those matches (house rule: no punishment for losing a hot angle).
 *   - `contenderRanks`: the player's ranks on the active titles of their own
 *     division, for `contenderRankBest`.
 *   - `asOf`: load time, for `daysSinceLastMatch`.
 */

import { getRepositories } from '../repositories';
import type { Rivalry } from '../repositories';
import type { HeatTier } from '../policies/rivalryHeat';
import type {
  Challenge,
  Championship,
  ContenderRanking,
  Match,
  Player,
  Promo,
  ProgressionWindowMode,
  ReactionType,
  Season,
} from '../repositories/types';
import type {
  ProgressionChallengeInput,
  ProgressionInputs,
  ProgressionMatchInput,
  ProgressionMatchResult,
  ProgressionPromoInput,
  ProgressionWindow,
} from '../policies/progression';

export interface ProgressionBatch {
  /** One entry per requested player id (empty inputs for unknown players). */
  inputs: Map<string, ProgressionInputs>;
  /** Requested players that exist, keyed by playerId. */
  players: Map<string, Player>;
  /** The active season, or null when none is running. */
  activeSeason: Season | null;
}

function matchResult(match: Match, playerId: string): ProgressionMatchResult {
  if (match.isDraw === true) return 'draw';
  return match.winners?.includes(playerId) ? 'win' : 'loss';
}

/** Heat tiers that make a rivalry match a "hot angle". */
export const HOT_ANGLE_HEAT_TIERS: ReadonlySet<HeatTier> = new Set<HeatTier>(['hot', 'scorching']);

/** Ids of rivalries whose matches are hot angles: active, with heat hot or above. */
export function hotAngleRivalryIds(rivalries: readonly Rivalry[]): Set<string> {
  const ids = new Set<string>();
  for (const rivalry of rivalries) {
    if (rivalry.status === 'active' && HOT_ANGLE_HEAT_TIERS.has(rivalry.heat)) ids.add(rivalry.rivalryId);
  }
  return ids;
}

/** True when the match is part of a hot angle (see `hotAngleRivalryIds`). */
export function isHotAngleMatch(match: Pick<Match, 'rivalryId'>, hotRivalryIds: ReadonlySet<string>): boolean {
  return match.rivalryId !== undefined && hotRivalryIds.has(match.rivalryId);
}

function toMatchInput(match: Match, playerId: string, hotRivalryIds: ReadonlySet<string>): ProgressionMatchInput {
  const input: ProgressionMatchInput = {
    matchId: match.matchId,
    date: match.date,
    completedAt: match.completedAt,
    seasonId: match.seasonId,
    result: matchResult(match, playerId),
    // ratingAverage is the raw mean; older rated matches may only carry starRating.
    ratingAverage: match.ratingAverage ?? match.starRating,
    ratingsCount: match.ratingsCount,
    matchOfTheNight: match.matchOfTheNight,
  };
  if (isHotAngleMatch(match, hotRivalryIds)) input.isHotAngle = true;
  return input;
}

/**
 * The player's contender ranks on the active titles of their own division.
 * Tag-team rows are skipped: their `playerId` is a tag team id.
 */
export function contenderRanksForPlayer(
  player: Pick<Player, 'playerId' | 'divisionId'>,
  championships: readonly Championship[],
  rankings: readonly ContenderRanking[],
): number[] {
  if (!player.divisionId) return [];
  const divisionTitles = new Set(
    championships
      .filter((title) => title.divisionId === player.divisionId && title.isActive !== false)
      .map((title) => title.championshipId),
  );
  return rankings
    .filter((row) =>
      row.playerId === player.playerId &&
      row.entityType !== 'tagTeam' &&
      divisionTitles.has(row.championshipId))
    .map((row) => row.rank);
}

/** Rivalry and contender data the DMV-02 metrics need. */
export interface LadderSourceData {
  /** Active rivalries (any others are ignored anyway). */
  rivalries: readonly Rivalry[];
  championships: readonly Championship[];
  /** Contender rows for the division titles in `championships`. */
  contenderRankings: readonly ContenderRanking[];
}

async function listActiveRivalries(): Promise<Rivalry[]> {
  const { rivalries } = getRepositories();
  const all: Rivalry[] = [];
  let cursor: string | undefined;
  do {
    const page = await rivalries.listByStatus('active', cursor ? { cursor } : {});
    all.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

/** Loads active rivalries plus the contender rankings of every active division title. */
export async function loadLadderSourceData(): Promise<LadderSourceData> {
  const { competition } = getRepositories();
  const [rivalries, championships] = await Promise.all([
    listActiveRivalries(),
    competition.championships.list(),
  ]);
  const divisionTitles = championships.filter((title) => title.divisionId && title.isActive !== false);
  const perTitle = await Promise.all(
    divisionTitles.map((title) => competition.contenders.listByChampionship(title.championshipId)),
  );
  return { rivalries, championships: divisionTitles, contenderRankings: perTitle.flat() };
}

function emptyInputs(playerId: string, asOf: string | undefined): ProgressionInputs {
  return { playerId, matches: [], promos: [], challenges: [], ...(asOf ? { asOf } : {}) };
}

function addMatchesAndRanks(
  inputs: Map<string, ProgressionInputs>,
  playersById: ReadonlyMap<string, Player>,
  matches: readonly Match[],
  ladder: LadderSourceData | undefined,
): void {
  const hotRivalryIds = hotAngleRivalryIds(ladder?.rivalries ?? []);
  for (const match of matches) {
    for (const playerId of new Set(match.participants)) {
      inputs.get(playerId)?.matches.push(toMatchInput(match, playerId, hotRivalryIds));
    }
  }
  if (!ladder) return;
  for (const [playerId, target] of inputs) {
    const player = playersById.get(playerId);
    if (!player) continue;
    const ranks = contenderRanksForPlayer(player, ladder.championships, ladder.contenderRankings);
    if (ranks.length > 0) target.contenderRanks = ranks;
  }
}

/**
 * Reaction counts excluding the author's own reaction. `reactToPromo` does
 * not block self-reactions, so a wrestler could otherwise farm progress on
 * their own promos. Counts are rebuilt from `reactions` (keyed by userId),
 * which is the source `reactionCounts` is derived from.
 */
export function reactionCountsFromOthers(
  promo: Pick<Promo, 'reactions'>,
  authorUserId: string | undefined,
): Partial<Record<ReactionType, number>> {
  const counts: Partial<Record<ReactionType, number>> = {};
  for (const [userId, reaction] of Object.entries(promo.reactions ?? {})) {
    if (userId === authorUserId) continue;
    counts[reaction] = (counts[reaction] ?? 0) + 1;
  }
  return counts;
}

function toPromoInput(promo: Promo, authorUserId: string | undefined): ProgressionPromoInput {
  return {
    promoId: promo.promoId,
    createdAt: promo.createdAt,
    reactionCounts: reactionCountsFromOthers(promo, authorUserId),
  };
}

function toChallengeInput(challenge: Challenge): ProgressionChallengeInput {
  return { challengeId: challenge.challengeId, createdAt: challenge.createdAt };
}

/**
 * Loads progression inputs, players and the active season for many players
 * in one pass. Rules:
 *   - matches: status 'completed' with the player in `participants`;
 *   - promos: authored by the player, hidden promos excluded, self-reactions stripped;
 *   - challenges: the player is `challengerId`, cancelled challenges excluded.
 */
export async function loadProgressionBatch(playerIds: readonly string[]): Promise<ProgressionBatch> {
  const repos = getRepositories();
  const [players, matches, promos, challenges, activeSeason, ladder] = await Promise.all([
    repos.roster.players.list(),
    repos.competition.matches.listCompleted(),
    repos.content.promos.list(),
    repos.user.challenges.list(),
    repos.season.seasons.findActive(),
    loadLadderSourceData(),
  ]);

  return {
    ...buildProgressionInputs(playerIds, {
      players,
      matches,
      promos,
      challenges,
      ladder,
      asOf: new Date().toISOString(),
    }),
    activeSeason,
  };
}

export interface ProgressionSourceData {
  players: readonly Player[];
  /** Completed matches only: the caller filters, as `listCompleted` does. */
  matches: readonly Match[];
  promos: readonly Promo[];
  challenges: readonly Challenge[];
  /** DMV-02 rivalry/contender data. Without it no match is a hot angle and no ranks are set. */
  ladder?: LadderSourceData;
  /** Stamped on every input as `asOf` (for `daysSinceLastMatch`). */
  asOf?: string;
}

/**
 * Pure core of `loadProgressionBatch`: groups already-loaded rows into
 * per-player inputs with the same rules. The seed uses it to compute
 * progression rows without a database round trip.
 */
export function buildProgressionInputs(
  playerIds: readonly string[],
  source: ProgressionSourceData,
): Pick<ProgressionBatch, 'inputs' | 'players'> {
  const inputs = new Map<string, ProgressionInputs>();
  for (const playerId of playerIds) {
    inputs.set(playerId, emptyInputs(playerId, source.asOf));
  }

  const playersById = new Map<string, Player>();
  for (const player of source.players) {
    if (inputs.has(player.playerId)) playersById.set(player.playerId, player);
  }

  addMatchesAndRanks(inputs, playersById, source.matches, source.ladder);

  for (const promo of source.promos) {
    if (promo.isHidden) continue;
    const target = inputs.get(promo.playerId);
    if (!target) continue;
    target.promos.push(toPromoInput(promo, playersById.get(promo.playerId)?.userId));
  }

  for (const challenge of source.challenges) {
    if (challenge.status === 'cancelled') continue;
    inputs.get(challenge.challengerId)?.challenges.push(toChallengeInput(challenge));
  }

  return { inputs, players: playersById };
}

/**
 * Per-player variant of `loadProgressionBatch` for the trigger path (a
 * result, rating, promo or reaction touching a few players). Promos and
 * challenges come from their per-player GSIs and players are fetched by id,
 * so nothing but completed matches is scanned. Matches have no participant
 * index, so `listCompleted` is still read once for the whole call.
 *
 * Same filtering rules as `loadProgressionBatch`. For recompute-all use the
 * batch loader: it reads each table once instead of 2 queries per player.
 */
export async function loadProgressionForPlayers(playerIds: readonly string[]): Promise<ProgressionBatch> {
  const repos = getRepositories();
  const uniqueIds = [...new Set(playerIds)];
  const [players, matches, activeSeason, ladder, perPlayer] = await Promise.all([
    Promise.all(uniqueIds.map((playerId) => repos.roster.players.findById(playerId))),
    repos.competition.matches.listCompleted(),
    repos.season.seasons.findActive(),
    loadLadderSourceData(),
    Promise.all(uniqueIds.map(async (playerId) => {
      const [promos, challenges] = await Promise.all([
        repos.content.promos.listByPlayer(playerId),
        repos.user.challenges.listByChallenger(playerId),
      ]);
      return { playerId, promos, challenges };
    })),
  ]);

  const asOf = new Date().toISOString();
  const inputs = new Map<string, ProgressionInputs>();
  for (const playerId of uniqueIds) {
    inputs.set(playerId, emptyInputs(playerId, asOf));
  }

  const playersById = new Map<string, Player>();
  for (const player of players) {
    if (player) playersById.set(player.playerId, player);
  }

  addMatchesAndRanks(inputs, playersById, matches, ladder);

  for (const { playerId, promos, challenges } of perPlayer) {
    const target = inputs.get(playerId);
    if (!target) continue;
    const authorUserId = playersById.get(playerId)?.userId;
    for (const promo of promos) {
      if (promo.isHidden || promo.playerId !== playerId) continue;
      target.promos.push(toPromoInput(promo, authorUserId));
    }
    for (const challenge of challenges) {
      if (challenge.status === 'cancelled') continue;
      target.challenges.push(toChallengeInput(challenge));
    }
  }

  return { inputs, players: playersById, activeSeason };
}

/** Convenience wrapper when only the inputs are needed. */
export async function loadProgressionInputs(
  playerIds: readonly string[],
): Promise<Map<string, ProgressionInputs>> {
  const { inputs } = await loadProgressionBatch(playerIds);
  return inputs;
}

/**
 * When the player joined their current division. Reads `divisionJoinedAt`
 * defensively (a parallel ticket adds it) and falls back to `createdAt`.
 */
export function divisionJoinedAt(player: Player): string {
  const joined: unknown = (player as Player & { divisionJoinedAt?: unknown }).divisionJoinedAt;
  return typeof joined === 'string' && joined.length > 0 ? joined : player.createdAt;
}

/** Builds the window for a track's mode for one player. */
export function resolveProgressionWindow(
  mode: ProgressionWindowMode,
  player: Player | undefined,
  activeSeason: Season | null,
): ProgressionWindow {
  switch (mode) {
    case 'allTime':
      return { mode };
    case 'season':
      return activeSeason
        ? { mode, seasonId: activeSeason.seasonId, since: activeSeason.startDate, until: activeSeason.endDate }
        : { mode };
    case 'sinceJoinedDivision':
      return player ? { mode, since: divisionJoinedAt(player) } : { mode };
  }
}
