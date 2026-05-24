import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, forbidden, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';
import { recomputeRivalryHeat } from '../../lib/services/recomputeRivalryHeat';
import type { PromoType } from '../../lib/repositories/types';

const VALID_PROMO_TYPES: PromoType[] = [
  'open-mic', 'call-out', 'response', 'pre-match', 'post-match', 'championship', 'return', 'rivalry',
];

/** Promo types whose presence affects a rivalry's heat score. */
const HEAT_CONTRIBUTING_TYPES: ReadonlyArray<PromoType> = ['call-out', 'rivalry'];

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
  rivalryId?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can cut promos');
    }

    const { data: body, error: parseError } = parseBody<CreatePromoBody>(event);
    if (parseError) return parseError;
    const { promoType, title, content, targetPlayerId, targetPromoId, matchId, championshipId, challengeMode, challengerTagTeamName, targetTagTeamName, rivalryId } = body;

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
    if (promoType === 'rivalry' && !rivalryId) {
      return badRequest('Rivalry promos must reference a rivalry (rivalryId)');
    }

    const repos = getRepositories();
    const { content: { promos }, roster: { players }, rivalries } = repos;

    // Find the player via user sub
    const player = await players.findByUserId(auth.sub);
    if (!player) {
      return badRequest('No player profile linked to your account');
    }

    // Validate rivalryId (when present) refers to a real rivalry that the
    // caller participates in. Applies to any promo type carrying a
    // rivalryId — we don't want a non-participant pinning their promo
    // (and its heat contribution) to someone else's storyline.
    if (rivalryId) {
      const rivalry = await rivalries.get(rivalryId);
      if (!rivalry) return notFound('Rivalry not found');
      const isParticipant = rivalry.participants.some((p) => p.playerId === player.playerId);
      if (!isParticipant) {
        return forbidden('You can only tag a promo to a rivalry you are part of');
      }
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
      rivalryId,
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

    // Push the rivalry's heat forward when this promo contributes.
    // Failures here shouldn't roll back the promo creation — heat is
    // eventually consistent via the admin recompute endpoint.
    if (rivalryId && HEAT_CONTRIBUTING_TYPES.includes(promoType as PromoType)) {
      try {
        await recomputeRivalryHeat(rivalryId);
      } catch (heatErr) {
        console.error('Failed to recompute rivalry heat after promo create:', heatErr);
      }
    }

    return created(promo);
  } catch (err) {
    console.error('Error creating promo:', err);
    return serverError('Failed to create promo');
  }
};
