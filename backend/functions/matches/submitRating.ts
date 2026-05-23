import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, RatingAlreadyExistsError } from '../../lib/repositories';
import { getAuthContext } from '../../lib/auth';
import { isHalfStarRating, roundToHalfStar } from '../../lib/utils/halfStar';
import { computeRivalryHeat, type HeatTier } from '../../lib/policies/rivalryHeat';
import { parseBody } from '../../lib/parseBody';
import {
  created,
  badRequest,
  notFound,
  conflict,
  unauthorized,
  serverError,
} from '../../lib/response';

interface SubmitRatingBody {
  rating: number;
}

interface RivalryRecompute {
  rivalryId: string;
  heatScore: number;
  heat: HeatTier;
}

/**
 * POST /matches/{matchId}/ratings
 *
 * Submit one user's rating (0.5–5 half-stars) for a completed match.
 *
 * The write is atomic: it stages (1) a conditional PUT of the rating row,
 * (2) an UPDATE on the match aggregate (ratingAverage, starRating,
 * ratingsCount), and (3) — when the match belongs to a rivalry — an
 * UPDATE on that rivalry's heatScore + heat tier (RIV-21 policy).
 *
 * Duplicate submissions by the same user for the same match throw
 * `RatingAlreadyExistsError` from the UoW commit; this handler maps that
 * to a 409 Conflict.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const matchId = event.pathParameters?.matchId;
    if (!matchId) return badRequest('matchId is required');

    const auth = getAuthContext(event);
    if (!auth.sub) return unauthorized();
    const userId = auth.sub;

    const { data: body, error: parseError } = parseBody<SubmitRatingBody>(event);
    if (parseError) return parseError;

    const rating = body.rating;
    if (!isHalfStarRating(rating)) {
      return badRequest('Rating must be between 0.5 and 5 in 0.5 steps.');
    }

    const {
      competition: { matches },
      matchRatings,
      runInTransaction,
    } = getRepositories();

    const match = await matches.findByIdWithDate(matchId);
    if (!match) return notFound('Match not found');

    if (match.status !== 'completed') {
      return conflict('Match is not completed yet.');
    }

    // Pre-read aggregates outside the transaction — DynamoDB transactions
    // can't include Query, only individual item reads (which we skip here
    // because the aggregate maths are cheap to recompute from scratch).
    const existingRatings = await matchRatings.getByMatch(matchId);
    const sumWithNew = existingRatings.reduce((s, r) => s + r.rating, 0) + rating;
    const newCount = existingRatings.length + 1;
    const ratingAverage = sumWithNew / newCount;
    const starRating = roundToHalfStar(ratingAverage);

    // If this match belongs to a rivalry, project the rivalry's full
    // heat using the in-flight values for *this* match and the persisted
    // aggregates for its siblings.
    let rivalryUpdate: RivalryRecompute | null = null;
    if (match.rivalryId) {
      const siblings = await matches.findByRivalryId(match.rivalryId);
      const projected = siblings.map((m) =>
        m.matchId === matchId
          ? {
              ratingAverage,
              ratingsCount: newCount,
              matchOfTheNight: m.matchOfTheNight === true,
            }
          : {
              ratingAverage: m.ratingAverage ?? 0,
              ratingsCount: m.ratingsCount ?? 0,
              matchOfTheNight: m.matchOfTheNight === true,
            },
      );
      // If the current match isn't in the sibling scan (e.g. stale index),
      // make sure we still factor its in-flight aggregate in.
      if (!siblings.some((m) => m.matchId === matchId)) {
        projected.push({
          ratingAverage,
          ratingsCount: newCount,
          matchOfTheNight: match.matchOfTheNight === true,
        });
      }
      const heat = computeRivalryHeat({ matches: projected });
      rivalryUpdate = {
        rivalryId: match.rivalryId,
        heatScore: heat.heatScore,
        heat: heat.tier,
      };
    }

    try {
      await runInTransaction(async (tx) => {
        tx.createMatchRating({ matchId, userId, rating });
        tx.updateMatch(matchId, match.date, {
          ratingAverage,
          starRating,
          ratingsCount: newCount,
        });
        if (rivalryUpdate) {
          tx.updateRivalry(rivalryUpdate.rivalryId, {
            heatScore: rivalryUpdate.heatScore,
            heat: rivalryUpdate.heat,
          });
        }
      });
    } catch (err) {
      if (err instanceof RatingAlreadyExistsError) {
        return conflict('You have already rated this match.');
      }
      throw err;
    }

    return created({
      matchId,
      userId,
      rating,
      matchAggregate: {
        ratingAverage,
        starRating,
        ratingsCount: newCount,
      },
      rivalry: rivalryUpdate
        ? {
            rivalryId: rivalryUpdate.rivalryId,
            heatScore: rivalryUpdate.heatScore,
            heat: rivalryUpdate.heat,
          }
        : null,
    });
  } catch (err) {
    console.error('Error submitting match rating:', err);
    return serverError('Failed to submit rating');
  }
};
