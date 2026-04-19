import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';
import type { PromoType } from '../../lib/repositories/types';

const VALID_PROMO_TYPES: PromoType[] = ['open-mic', 'call-out', 'response', 'pre-match', 'post-match', 'championship', 'return'];

interface CreatePromoBody {
  promoType: string;
  title?: string;
  content: string;
  targetPlayerId?: string;
  targetPromoId?: string;
  matchId?: string;
  championshipId?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengerTagTeamName?: string;
  targetTagTeamName?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can cut promos');
    }

    const { data: body, error: parseError } = parseBody<CreatePromoBody>(event);
    if (parseError) return parseError;
    const { promoType, title, content, targetPlayerId, targetPromoId, matchId, championshipId, challengeMode, challengerTagTeamName, targetTagTeamName } = body;

    if (!promoType || !VALID_PROMO_TYPES.includes(promoType as PromoType)) {
      return badRequest('Valid promoType is required');
    }
    if (!content || content.length < 50) {
      return badRequest('Content must be at least 50 characters');
    }
    if (content.length > 2000) {
      return badRequest('Content must be at most 2000 characters');
    }
    if (promoType === 'response' && !targetPromoId) {
      return badRequest('Response promos must reference an existing promo (targetPromoId)');
    }

    const { promos, players } = getRepositories();

    // Find the player via user sub
    const player = await players.findByUserId(auth.sub);
    if (!player) {
      return badRequest('No player profile linked to your account');
    }

    const promo = await promos.create({
      playerId: player.playerId,
      promoType: promoType as PromoType,
      title,
      content,
      targetPlayerId,
      targetPromoId,
      matchId,
      championshipId,
      challengeMode,
      challengerTagTeamName,
      targetTagTeamName,
    });

    // Notify the target player if they have a linked user account
    if (targetPlayerId) {
      const targetPlayer = await players.findById(targetPlayerId);
      if (targetPlayer?.userId) {
        await createNotification({
          userId: targetPlayer.userId,
          type: 'promo_mention',
          message: `${player.name} cut a promo calling you out!`,
          sourceId: promo.promoId,
          sourceType: 'promo',
        });
      }
    }

    return created(promo);
  } catch (err) {
    console.error('Error creating promo:', err);
    return serverError('Failed to create promo');
  }
};
