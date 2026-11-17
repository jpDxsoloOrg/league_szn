/**
 * DMV-03: end-of-season movement review snapshot.
 *
 * When a season completes, `updateSeason` sends
 * `invokeAsync('progression', { action: 'seasonSnapshot', seasonId })`. The
 * progression Lambda then stores one `SeasonMovementReview` per player in a
 * division with an active promotion or relegation track: their best progress
 * on each kind, their rank in the division's season standings, whether a GM
 * flagged them, and a recommendation. GMs review and apply the batch through
 * `reviews.ts`.
 *
 * Relegation progress is read from the stored progression rows, so the house
 * rule (losses in a hot or scorching rivalry never count) is already applied
 * by the recompute (`relegationMatches` / `isProtectedLoss`).
 */

import { getRepositories } from '../../lib/repositories';
import type {
  PlayerProgression,
  ProgressionTrack,
  SeasonMovementChoice,
  SeasonMovementReview,
  SeasonStanding,
} from '../../lib/repositories';
import { isPlayerVisible } from '../../lib/needsWrestler';

/** Progress (0-100) at which a promotion track recommends promoting. */
export const SEASON_REVIEW_PROMOTE_PCT = 100;
/** Progress (0-100) at which a relegation track recommends relegating. */
export const SEASON_REVIEW_RELEGATE_PCT = 100;
/** The top N of a division's season standings are recommended for promotion. */
export const SEASON_REVIEW_PROMOTE_TOP_N = 1;

/** Parallel review writes per batch. */
const WRITE_CHUNK = 25;

export interface RecommendationInput {
  promotionPct: number;
  relegationPct: number;
  /** 1-based rank in the division's season standings. */
  seasonRank?: number;
  /** Promotion is only recommended when the division has a promotion track. */
  hasPromotionTrack: boolean;
  hasRelegationTrack: boolean;
}

/**
 * promote: promotionPct >= SEASON_REVIEW_PROMOTE_PCT, or the player is in the
 *          top SEASON_REVIEW_PROMOTE_TOP_N of the division's season standings;
 * relegate: relegationPct >= SEASON_REVIEW_RELEGATE_PCT;
 * otherwise stay. Promotion wins when both apply.
 */
export function recommendMovement(input: RecommendationInput): SeasonMovementChoice {
  if (input.hasPromotionTrack) {
    if (input.promotionPct >= SEASON_REVIEW_PROMOTE_PCT) return 'promote';
    if (input.seasonRank !== undefined && input.seasonRank <= SEASON_REVIEW_PROMOTE_TOP_N) return 'promote';
  }
  if (input.hasRelegationTrack && input.relegationPct >= SEASON_REVIEW_RELEGATE_PCT) return 'relegate';
  return 'stay';
}

/**
 * Rank players by season record (wins desc, then losses asc, as the season
 * standings page does). Only players with at least one season match rank.
 * Ties share a rank.
 */
export function rankBySeasonRecord(standings: readonly SeasonStanding[]): Map<string, number> {
  const played = standings
    .filter((row) => (row.wins || 0) + (row.losses || 0) + (row.draws || 0) > 0)
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses));
  const ranks = new Map<string, number>();
  played.forEach((row, index) => {
    const previous = played[index - 1];
    const tied = previous && previous.wins === row.wins && previous.losses === row.losses;
    ranks.set(row.playerId, tied ? (ranks.get(previous.playerId) as number) : index + 1);
  });
  return ranks;
}

interface BestRow {
  trackId?: string;
  pct: number;
  flagged: boolean;
}

/** The player's highest-progress row across the given tracks (ties keep the first track). */
function bestRow(
  tracks: readonly ProgressionTrack[],
  rowsByTrack: Map<string, Map<string, PlayerProgression>>,
  playerId: string,
): BestRow {
  let best: BestRow = { trackId: tracks[0]?.trackId, pct: 0, flagged: false };
  let flagged = false;
  for (const track of tracks) {
    const row = rowsByTrack.get(track.trackId)?.get(playerId);
    if (!row) continue;
    if (row.consideration) flagged = true;
    if (row.progressPct > best.pct) best = { trackId: track.trackId, pct: row.progressPct, flagged: false };
  }
  return { ...best, flagged };
}

export interface SeasonSnapshotResult {
  seasonId: string;
  created: number;
  /** Players whose review already had a decision; left untouched. */
  keptDecided: number;
}

/**
 * Snapshot every eligible player for the season. Safe to run again: rows
 * without a decision are rewritten, rows with one are kept.
 */
export async function snapshotSeasonReviews(seasonId: string): Promise<SeasonSnapshotResult> {
  const {
    progression,
    roster: { players },
    season: { standings },
  } = getRepositories();

  const tracks = (await progression.listTracks({ isActive: true }))
    .filter((track) => track.kind === 'promotion' || track.kind === 'relegation');
  const tracksByDivision = new Map<string, { promotion: ProgressionTrack[]; relegation: ProgressionTrack[] }>();
  for (const track of tracks) {
    const entry = tracksByDivision.get(track.fromDivisionId) ?? { promotion: [], relegation: [] };
    if (track.kind === 'promotion') entry.promotion.push(track);
    else entry.relegation.push(track);
    tracksByDivision.set(track.fromDivisionId, entry);
  }
  if (tracksByDivision.size === 0) return { seasonId, created: 0, keptDecided: 0 };

  const [allPlayers, seasonStandings, existing, ...trackRows] = await Promise.all([
    players.list(),
    standings.listBySeason(seasonId),
    progression.listSeasonReviews(seasonId),
    ...tracks.map((track) => progression.listByTrack(track.trackId)),
  ]);

  const rowsByTrack = new Map<string, Map<string, PlayerProgression>>();
  tracks.forEach((track, index) => {
    rowsByTrack.set(track.trackId, new Map(trackRows[index].map((row) => [row.playerId, row])));
  });
  const decided = new Set(existing.filter((review) => review.decision).map((review) => review.playerId));

  const eligible = allPlayers.filter(
    (player) => player.divisionId && tracksByDivision.has(player.divisionId) && isPlayerVisible(player),
  );
  const standingByPlayer = new Map(seasonStandings.map((row) => [row.playerId, row]));

  // Season rank is within the division.
  const rankByPlayer = new Map<string, number>();
  for (const divisionId of tracksByDivision.keys()) {
    const divisionStandings = eligible
      .filter((player) => player.divisionId === divisionId)
      .map((player) => standingByPlayer.get(player.playerId))
      .filter((row): row is SeasonStanding => row !== undefined);
    for (const [playerId, rank] of rankBySeasonRecord(divisionStandings)) rankByPlayer.set(playerId, rank);
  }

  const now = new Date().toISOString();
  const reviews: SeasonMovementReview[] = [];
  for (const player of eligible) {
    if (decided.has(player.playerId)) continue;
    const divisionId = player.divisionId as string;
    const divisionTracks = tracksByDivision.get(divisionId) as { promotion: ProgressionTrack[]; relegation: ProgressionTrack[] };
    const promotion = bestRow(divisionTracks.promotion, rowsByTrack, player.playerId);
    const relegation = bestRow(divisionTracks.relegation, rowsByTrack, player.playerId);
    const seasonRank = rankByPlayer.get(player.playerId);

    const review: SeasonMovementReview = {
      seasonId,
      playerId: player.playerId,
      divisionId,
      promotionPct: promotion.pct,
      relegationPct: relegation.pct,
      flagged: promotion.flagged || relegation.flagged,
      recommendation: recommendMovement({
        promotionPct: promotion.pct,
        relegationPct: relegation.pct,
        seasonRank,
        hasPromotionTrack: divisionTracks.promotion.length > 0,
        hasRelegationTrack: divisionTracks.relegation.length > 0,
      }),
      createdAt: now,
    };
    if (promotion.trackId) review.promotionTrackId = promotion.trackId;
    if (relegation.trackId) review.relegationTrackId = relegation.trackId;
    if (seasonRank !== undefined) review.seasonRank = seasonRank;

    reviews.push(review);
  }

  for (let start = 0; start < reviews.length; start += WRITE_CHUNK) {
    await Promise.all(reviews.slice(start, start + WRITE_CHUNK).map((review) => progression.putSeasonReview(review)));
  }

  return { seasonId, created: reviews.length, keptDecided: decided.size };
}
