import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext, requireRole } from '../../lib/auth';
import { recomputeRivalryHeat } from '../../lib/services/recomputeRivalryHeat';
import type { ReactionType, PromoType } from '../../lib/repositories/types';

const VALID_REACTIONS: ReactionType[] = ['fire', 'mic', 'trash', 'mind-blown', 'clap'];

/** Reactions that change a rivalry's heat score. */
const HEAT_RELEVANT_REACTIONS: ReadonlyArray<ReactionType> = ['fire', 'trash'];

/** Promo types whose reactions feed into rivalry heat. */
const HEAT_CONTRIBUTING_TYPES: ReadonlyArray<PromoType> = ['call-out', 'rivalry'];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Wrestler');
    if (denied) return denied;

    const auth = getAuthContext(event);
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;
    const { reaction } = body;

    if (!reaction || !VALID_REACTIONS.includes(reaction as ReactionType)) {
      return badRequest('Valid reaction is required (fire, mic, trash, mind-blown, clap)');
    }

    const { content: { promos } } = getRepositories();

    // Get the promo
    const promo = await promos.findById(promoId);
    if (!promo) {
      return notFound('Promo not found');
    }

    const userId = auth.sub;
    const existingReaction = promo.reactions[userId];

    let updatedPromo;
    if (existingReaction === reaction) {
      // Toggle off
      updatedPromo = await promos.removeReaction(promoId, userId);
    } else {
      // Remove previous reaction if exists, then add new one
      if (existingReaction) {
        await promos.removeReaction(promoId, userId);
      }
      updatedPromo = await promos.addReaction(promoId, userId, reaction as ReactionType);
    }

    // If this reaction (or the one it replaced) moves the heat dial,
    // recompute the rivalry's heat. We skip recompute for reaction
    // changes that can't matter (e.g. clap → mic on a non-rivalry promo)
    // to keep the hot path cheap.
    const couldChangeHeat =
      HEAT_RELEVANT_REACTIONS.includes(reaction as ReactionType) ||
      (existingReaction !== undefined && HEAT_RELEVANT_REACTIONS.includes(existingReaction));
    if (
      couldChangeHeat &&
      updatedPromo.rivalryId &&
      HEAT_CONTRIBUTING_TYPES.includes(updatedPromo.promoType)
    ) {
      try {
        await recomputeRivalryHeat(updatedPromo.rivalryId);
      } catch (heatErr) {
        console.error('Failed to recompute rivalry heat after reaction:', heatErr);
      }
    }

    return success({ reactions: updatedPromo.reactions, reactionCounts: updatedPromo.reactionCounts });
  } catch (err) {
    console.error('Error reacting to promo:', err);
    return serverError('Failed to react to promo');
  }
};
