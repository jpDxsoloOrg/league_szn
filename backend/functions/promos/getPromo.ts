import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const { content: { promos }, roster: { players } } = getRepositories();

    const promo = await promos.findById(promoId);
    if (!promo) {
      return notFound('Promo not found');
    }

    // Get responses to this promo
    const responses = (await promos.listResponsesTo(promoId))
      .filter((p) => !p.isHidden);

    // Collect player IDs
    const playerIds = new Set<string>();
    playerIds.add(promo.playerId);
    if (promo.targetPlayerId) playerIds.add(promo.targetPlayerId);
    for (const r of responses) {
      playerIds.add(r.playerId);
      if (r.targetPlayerId) playerIds.add(r.targetPlayerId);
    }

    const playerMap: Record<string, { name: string; currentWrestler: string; imageUrl?: string }> = {};
    for (const pid of playerIds) {
      const player = await players.findById(pid);
      if (player) {
        playerMap[pid] = {
          name: player.name,
          currentWrestler: player.currentWrestler,
          imageUrl: player.imageUrl,
        };
      }
    }

    const author = playerMap[promo.playerId];
    const target = promo.targetPlayerId ? playerMap[promo.targetPlayerId] : undefined;

    // Find target promo if response
    let targetPromo: Record<string, unknown> | undefined;
    if (promo.targetPromoId) {
      const tp = await promos.findById(promo.targetPromoId);
      if (tp) {
        targetPromo = {
          promoId: tp.promoId,
          playerId: tp.playerId,
          promoType: tp.promoType,
          title: tp.title,
          content: '',
          reactions: {},
          reactionCounts: tp.reactionCounts || { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
          isPinned: tp.isPinned,
          isHidden: tp.isHidden,
          createdAt: tp.createdAt,
          updatedAt: tp.updatedAt,
        };
      }
    }

    const enrichedResponses = responses
      .map((r) => {
        const rAuthor = playerMap[r.playerId];
        const rTarget = r.targetPlayerId ? playerMap[r.targetPlayerId] : undefined;
        return {
          ...r,
          playerName: rAuthor?.name || 'Unknown',
          wrestlerName: rAuthor?.currentWrestler || 'Unknown',
          playerImageUrl: rAuthor?.imageUrl,
          targetPlayerName: rTarget?.name,
          targetWrestlerName: rTarget?.currentWrestler,
          responseCount: 0,
        };
      })
      .sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());

    return success({
      promo: {
        ...promo,
        playerName: author?.name || 'Unknown',
        wrestlerName: author?.currentWrestler || 'Unknown',
        playerImageUrl: author?.imageUrl,
        targetPlayerName: target?.name,
        targetWrestlerName: target?.currentWrestler,
        targetPromo,
        responseCount: responses.length,
      },
      responses: enrichedResponses,
    });
  } catch (err) {
    console.error('Error fetching promo:', err);
    return serverError('Failed to fetch promo');
  }
};
