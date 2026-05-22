import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import {
  success,
  badRequest,
  notFound,
  conflict,
  serverError,
} from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { computeRivalryHeat, type HeatTier } from '../../lib/policies/rivalryHeat';

interface SetMatchOfTheNightBody {
  matchOfTheNight: boolean;
}

/**
 * PUT /matches/{matchId}/motn
 *
 * Toggle a completed match's Match-of-the-Night flag. Admin / Moderator only.
 * Separated from `recordResult` so MOTN can be set as a post-show editorial
 * decision after results are already recorded.
 *
 * Flipping MOTN on a match that belongs to a rivalry also recomputes that
 * rivalry's heat — MOTN matches carry a multiplier in the heat policy
 * (`MOTN_HEAT_MULTIPLIER`), so toggling the flag changes the rivalry's
 * heatScore in the same write.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    if (!matchId) return badRequest('matchId is required');

    const { data: body, error: parseError } = parseBody<SetMatchOfTheNightBody>(event);
    if (parseError) return parseError;

    if (typeof body.matchOfTheNight !== 'boolean') {
      return badRequest('matchOfTheNight must be a boolean');
    }

    const {
      competition: { matches },
      runInTransaction,
    } = getRepositories();

    const match = await matches.findByIdWithDate(matchId);
    if (!match) return notFound('Match not found');

    if (match.status !== 'completed') {
      return conflict('Match is not completed yet.');
    }

    // If the match belongs to a rivalry, project the new heat using the
    // in-flight MOTN value plus the rivalry's sibling matches.
    let rivalryUpdate: { rivalryId: string; heatScore: number; heat: HeatTier } | null = null;
    if (match.rivalryId) {
      const siblings = await matches.findByRivalryId(match.rivalryId);
      const projected = siblings.map((m) =>
        m.matchId === matchId
          ? {
              ratingAverage: m.ratingAverage ?? 0,
              ratingsCount: m.ratingsCount ?? 0,
              matchOfTheNight: body.matchOfTheNight,
            }
          : {
              ratingAverage: m.ratingAverage ?? 0,
              ratingsCount: m.ratingsCount ?? 0,
              matchOfTheNight: m.matchOfTheNight === true,
            },
      );
      if (!siblings.some((m) => m.matchId === matchId)) {
        projected.push({
          ratingAverage: match.ratingAverage ?? 0,
          ratingsCount: match.ratingsCount ?? 0,
          matchOfTheNight: body.matchOfTheNight,
        });
      }
      const heat = computeRivalryHeat({ matches: projected });
      rivalryUpdate = {
        rivalryId: match.rivalryId,
        heatScore: heat.heatScore,
        heat: heat.tier,
      };
    }

    await runInTransaction(async (tx) => {
      tx.updateMatch(matchId, match.date, { matchOfTheNight: body.matchOfTheNight });
      if (rivalryUpdate) {
        tx.updateRivalry(rivalryUpdate.rivalryId, {
          heatScore: rivalryUpdate.heatScore,
          heat: rivalryUpdate.heat,
        });
      }
    });

    return success({
      ...match,
      matchOfTheNight: body.matchOfTheNight,
      rivalry: rivalryUpdate,
    });
  } catch (err) {
    console.error('Error setting match of the night:', err);
    return serverError('Failed to set match of the night');
  }
};
