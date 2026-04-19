import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext, requireRole } from '../../lib/auth';
import type { ReactionType } from '../../lib/repositories/types';

const VALID_REACTIONS: ReactionType[] = ['fire', 'mic', 'trash', 'mind-blown', 'clap'];

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

    const { promos } = getRepositories();

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

    return success({ reactions: updatedPromo.reactions, reactionCounts: updatedPromo.reactionCounts });
  } catch (err) {
    console.error('Error reacting to promo:', err);
    return serverError('Failed to react to promo');
  }
};
