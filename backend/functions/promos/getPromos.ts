import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import type { Promo, PromoType } from '../../lib/repositories/types';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { playerId, promoType, includeHidden, excludeResponses } = event.queryStringParameters || {};

    const { content: { promos }, roster: { players } } = getRepositories();

    let promoList: Promo[];

    if (playerId) {
      promoList = await promos.listByPlayer(playerId);
    } else if (promoType) {
      promoList = await promos.listByType(promoType as PromoType);
    } else {
      promoList = await promos.list();
    }

    // Collect unique player IDs for enrichment
    const playerIds = new Set<string>();
    for (const p of promoList) {
      playerIds.add(p.playerId);
      if (p.targetPlayerId) playerIds.add(p.targetPlayerId);
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

    // Count responses for each promo
    const promoIds = new Set(promoList.map((p) => p.promoId));
    const responseCounts: Record<string, number> = {};
    for (const p of promoList) {
      if (p.targetPromoId && promoIds.has(p.targetPromoId)) {
        responseCounts[p.targetPromoId] = (responseCounts[p.targetPromoId] || 0) + 1;
      }
    }

    // Enrich with player context
    const enriched = promoList
      .filter((p) => (includeHidden === 'true' || !p.isHidden) && !(excludeResponses === 'true' && (p.targetPromoId || p.promoType === 'response')))
      .map((p) => {
        const author = playerMap[p.playerId];
        const target = p.targetPlayerId ? playerMap[p.targetPlayerId] : undefined;

        // Find target promo if it's a response
        let targetPromo: Record<string, unknown> | undefined;
        if (p.targetPromoId) {
          const tp = promoList.find((pp) => pp.promoId === p.targetPromoId);
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

        return {
          ...p,
          playerName: author?.name || 'Unknown',
          wrestlerName: author?.currentWrestler || 'Unknown',
          playerImageUrl: author?.imageUrl,
          targetPlayerName: target?.name,
          targetWrestlerName: target?.currentWrestler,
          targetPromo,
          responseCount: responseCounts[p.promoId] || 0,
        };
      });

    // Sort by createdAt descending
    enriched.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

    return success(enriched);
  } catch (err) {
    console.error('Error fetching promos:', err);
    return serverError('Failed to fetch promos');
  }
};
