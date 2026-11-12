/**
 * Progression data loader (CUP-02).
 *
 * Collects the raw activity the progression policy scores. Built for the
 * recompute-all case: completed matches, promos, challenges and players are
 * each listed ONCE, then grouped by player, however many players are asked for.
 */

import { getRepositories } from '../repositories';
import type {
  Challenge,
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

function toMatchInput(match: Match, playerId: string): ProgressionMatchInput {
  return {
    matchId: match.matchId,
    date: match.date,
    seasonId: match.seasonId,
    result: matchResult(match, playerId),
    // ratingAverage is the raw mean; older rated matches may only carry starRating.
    ratingAverage: match.ratingAverage ?? match.starRating,
    ratingsCount: match.ratingsCount,
    matchOfTheNight: match.matchOfTheNight,
  };
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
  const [players, matches, promos, challenges, activeSeason] = await Promise.all([
    repos.roster.players.list(),
    repos.competition.matches.listCompleted(),
    repos.content.promos.list(),
    repos.user.challenges.list(),
    repos.season.seasons.findActive(),
  ]);

  const inputs = new Map<string, ProgressionInputs>();
  for (const playerId of playerIds) {
    inputs.set(playerId, { playerId, matches: [], promos: [], challenges: [] });
  }

  const playersById = new Map<string, Player>();
  for (const player of players) {
    if (inputs.has(player.playerId)) playersById.set(player.playerId, player);
  }

  for (const match of matches) {
    for (const playerId of new Set(match.participants)) {
      inputs.get(playerId)?.matches.push(toMatchInput(match, playerId));
    }
  }

  for (const promo of promos) {
    if (promo.isHidden) continue;
    const target = inputs.get(promo.playerId);
    if (!target) continue;
    target.promos.push(toPromoInput(promo, playersById.get(promo.playerId)?.userId));
  }

  for (const challenge of challenges) {
    if (challenge.status === 'cancelled') continue;
    inputs.get(challenge.challengerId)?.challenges.push(toChallengeInput(challenge));
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
