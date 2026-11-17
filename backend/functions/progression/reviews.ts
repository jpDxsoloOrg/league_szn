/**
 * DMV-03: end-of-season movement reviews.
 *
 *   GET  /progression/reviews/{seasonId}        the snapshot, with player names
 *                                                and a preview of each move target
 *   POST /progression/reviews/{seasonId}/apply  a batch of GM decisions; each
 *                                                promote / relegate runs through
 *                                                `executeProgressionMove` (DMV-05)
 *
 * Both are Moderator+ (STAFF) via the router.
 */

import type { APIGatewayProxyHandler } from 'aws-lambda';
import { badRequest, notFound, serverError, success } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { invokeAsync } from '../../lib/asyncLambda';
import { getRepositories } from '../../lib/repositories';
import type {
  Division,
  ProgressionKind,
  ProgressionTrack,
  SeasonMovementChoice,
  SeasonMovementReview,
} from '../../lib/repositories';
import {
  executeProgressionMove,
  resolveMoveTarget,
  type ExecuteMoveResult,
} from '../../lib/progression/executeMove';

const CHOICES: ReadonlyArray<SeasonMovementChoice> = ['promote', 'relegate', 'stay'];

/** Maximum decisions per apply call; keeps one call inside the 29 s Lambda timeout. */
export const MAX_REVIEW_DECISIONS = 50;

/** Where a promote / relegate would go, without executing it. */
export type MoveTargetPreview =
  | { ok: true; toDivisionId: string }
  | { ok: false; code: string; message: string };

export interface SeasonReviewView extends SeasonMovementReview {
  playerName: string;
  currentWrestler?: string;
  /** The player's division now (differs from `divisionId` once moved). */
  currentDivisionId?: string;
  targets: { promote?: MoveTargetPreview; relegate?: MoveTargetPreview };
}

export interface SeasonReviewDecisionInput {
  playerId: string;
  decision: SeasonMovementChoice;
  /** Overrides the default target (needed when several siblings qualify). */
  toDivisionId?: string;
  /** Proceed even if the player holds a title restricted to the old division. */
  force?: boolean;
  /** Publish a News announcement for the move. Opt-in. */
  announce?: boolean;
}

/** A DMV-05 refusal, or a review-level one (REVIEW_NOT_FOUND, ALREADY_APPLIED, NO_TRACK, UNEXPECTED_ERROR). */
export interface SeasonReviewRefusal {
  status: number;
  message: string;
  details?: { code: string } & Record<string, unknown>;
}

export type SeasonReviewApplyResult =
  | { playerId: string; decision: SeasonMovementChoice; ok: true; move?: ExecuteMoveResult }
  | { playerId: string; decision: SeasonMovementChoice; ok: false; refusal: SeasonReviewRefusal };

function preview(
  kind: ProgressionKind,
  trackId: string | undefined,
  fromDivisionId: string,
  tracks: Map<string, ProgressionTrack>,
  divisions: readonly Division[],
): MoveTargetPreview | undefined {
  if (!trackId) return undefined;
  const target = resolveMoveTarget({
    kind,
    divisions,
    fromDivisionId,
    trackToDivisionId: tracks.get(trackId)?.toDivisionId,
  });
  if (target.ok) return target;
  return { ok: false, code: target.refusal.details?.code ?? 'INVALID_TARGET', message: target.refusal.message };
}

export const getSeasonReviews: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    if (!seasonId) return badRequest('seasonId path parameter is required');

    const {
      progression,
      roster: { players },
      leagueOps: { divisions },
      season: { seasons },
    } = getRepositories();
    const season = await seasons.findById(seasonId);
    if (!season) return notFound('Season not found');

    const [reviews, allPlayers, allDivisions, tracks] = await Promise.all([
      progression.listSeasonReviews(seasonId),
      players.list(),
      divisions.list(),
      progression.listTracks(),
    ]);
    const playersById = new Map(allPlayers.map((player) => [player.playerId, player]));
    const tracksById = new Map(tracks.map((track) => [track.trackId, track]));

    const views: SeasonReviewView[] = reviews.map((review) => {
      const player = playersById.get(review.playerId);
      const view: SeasonReviewView = {
        ...review,
        playerName: player?.name ?? '',
        targets: {},
      };
      if (player?.currentWrestler) view.currentWrestler = player.currentWrestler;
      if (player?.divisionId) view.currentDivisionId = player.divisionId;
      const promote = preview('promotion', review.promotionTrackId, review.divisionId, tracksById, allDivisions);
      const relegate = preview('relegation', review.relegationTrackId, review.divisionId, tracksById, allDivisions);
      if (promote) view.targets.promote = promote;
      if (relegate) view.targets.relegate = relegate;
      return view;
    });

    return success({ seasonId, seasonStatus: season.status, reviews: views });
  } catch (err: unknown) {
    console.error('Error listing season reviews:', err);
    return serverError('Failed to list season reviews');
  }
};

/** Validates the apply body; returns an error message or the decisions. */
export function parseDecisions(body: unknown): { error: string } | { decisions: SeasonReviewDecisionInput[] } {
  const raw = (body as { decisions?: unknown } | null)?.decisions;
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'decisions must be a non-empty array' };
  if (raw.length > MAX_REVIEW_DECISIONS) return { error: `At most ${MAX_REVIEW_DECISIONS} decisions per request` };
  const seen = new Set<string>();
  const decisions: SeasonReviewDecisionInput[] = [];
  for (const item of raw as unknown[]) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const { playerId, decision, toDivisionId, force, announce } = entry;
    if (typeof playerId !== 'string' || playerId.length === 0) return { error: 'Each decision needs a playerId' };
    if (seen.has(playerId)) return { error: `Duplicate decision for player ${playerId}` };
    seen.add(playerId);
    if (typeof decision !== 'string' || !CHOICES.includes(decision as SeasonMovementChoice)) {
      return { error: `decision must be one of: ${CHOICES.join(', ')}` };
    }
    if (toDivisionId !== undefined && typeof toDivisionId !== 'string') return { error: 'toDivisionId must be a string' };
    if (force !== undefined && typeof force !== 'boolean') return { error: 'force must be a boolean' };
    if (announce !== undefined && typeof announce !== 'boolean') return { error: 'announce must be a boolean' };
    decisions.push({
      playerId,
      decision: decision as SeasonMovementChoice,
      ...(toDivisionId !== undefined ? { toDivisionId } : {}),
      ...(force !== undefined ? { force } : {}),
      ...(announce !== undefined ? { announce } : {}),
    });
  }
  return { decisions };
}

function refused(
  input: SeasonReviewDecisionInput,
  status: SeasonReviewRefusal['status'],
  code: string,
  message: string,
): SeasonReviewApplyResult {
  return { playerId: input.playerId, decision: input.decision, ok: false, refusal: { status, message, details: { code } } };
}

async function applyOne(
  seasonId: string,
  input: SeasonReviewDecisionInput,
  actor: { actorUserId: string; createdBy: string },
): Promise<SeasonReviewApplyResult> {
  const { progression } = getRepositories();
  const review = await progression.getSeasonReview(seasonId, input.playerId);
  if (!review) return refused(input, 404, 'REVIEW_NOT_FOUND', 'No review for this player in this season');
  if (review.decision === 'promote' || review.decision === 'relegate') {
    return refused(input, 409, 'ALREADY_APPLIED', `This player's ${review.decision} was already applied`);
  }

  const decidedAt = new Date().toISOString();
  if (input.decision === 'stay') {
    await progression.putSeasonReview({ ...review, decision: 'stay', decidedBy: actor.actorUserId, decidedAt });
    return { playerId: input.playerId, decision: 'stay', ok: true };
  }

  const trackId = input.decision === 'promote' ? review.promotionTrackId : review.relegationTrackId;
  if (!trackId) {
    return refused(input, 400, 'NO_TRACK', `The player's division has no active ${input.decision === 'promote' ? 'promotion' : 'relegation'} track`);
  }

  const outcome = await executeProgressionMove({
    playerId: input.playerId,
    trackId,
    toDivisionId: input.toDivisionId,
    force: input.force,
    announce: input.announce,
    actorUserId: actor.actorUserId,
    createdBy: actor.createdBy,
    recalculateContenders: false,
  });
  if (!outcome.ok) {
    return { playerId: input.playerId, decision: input.decision, ok: false, refusal: outcome.refusal };
  }

  await progression.putSeasonReview({
    ...review,
    decision: input.decision,
    decidedBy: actor.actorUserId,
    decidedAt,
    toDivisionId: outcome.result.toDivisionId,
  });
  return { playerId: input.playerId, decision: input.decision, ok: true, move: outcome.result };
}

export const applySeasonReviews: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    if (!seasonId) return badRequest('seasonId path parameter is required');

    const parsed = parseBody<Record<string, unknown>>(event);
    if (parsed.error) return parsed.error;
    const validated = parseDecisions(parsed.data);
    if ('error' in validated) return badRequest(validated.error);

    const season = await getRepositories().season.seasons.findById(seasonId);
    if (!season) return notFound('Season not found');

    const { username, sub } = getAuthContext(event);
    const actor = { actorUserId: sub || username, createdBy: username || sub };

    // Sequential: moves touch shared division state and the contender recalc.
    const results: SeasonReviewApplyResult[] = [];
    for (const decision of validated.decisions) {
      try {
        results.push(await applyOne(seasonId, decision, actor));
      } catch (err: unknown) {
        console.error(`Season review apply failed for ${decision.playerId}:`, err);
        results.push(refused(decision, 500, 'UNEXPECTED_ERROR', 'Failed to apply this decision'));
      }
    }

    // One contender recalculation for the whole batch (executeProgressionMove skipped it).
    if (results.some((result) => result.ok && result.move)) {
      try {
        await invokeAsync('contenders', { source: 'seasonReview' });
      } catch (err: unknown) {
        console.error('Season review: contender recalculation failed:', err);
      }
    }

    const applied = results.filter((result) => result.ok).length;
    return success({ seasonId, applied, failed: results.length - applied, results });
  } catch (err: unknown) {
    console.error('Error applying season reviews:', err);
    return serverError('Failed to apply season reviews');
  }
};
