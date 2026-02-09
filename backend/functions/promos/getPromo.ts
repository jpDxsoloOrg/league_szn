import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, notFound, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const result = await dynamoDb.get({
      TableName: TableNames.PROMOS,
      Key: { promoId },
    });

    const promo = result.Item;
    if (!promo) {
      return notFound('Promo not found');
    }

    // Get all promos to find responses
    const allPromos = await dynamoDb.scanAll({
      TableName: TableNames.PROMOS,
    });

    const responses = allPromos.filter(
      (p) => p.targetPromoId === promoId && !(p.isHidden as boolean)
    );

    // Collect player IDs
    const playerIds = new Set<string>();
    playerIds.add(promo.playerId as string);
    if (promo.targetPlayerId) playerIds.add(promo.targetPlayerId as string);
    for (const r of responses) {
      playerIds.add(r.playerId as string);
      if (r.targetPlayerId) playerIds.add(r.targetPlayerId as string);
    }

    const playerMap: Record<string, { name: string; currentWrestler: string; imageUrl?: string }> = {};
    for (const pid of playerIds) {
      const res = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: pid },
      });
      if (res.Item) {
        playerMap[pid] = {
          name: res.Item.name as string,
          currentWrestler: res.Item.currentWrestler as string,
          imageUrl: res.Item.imageUrl as string | undefined,
        };
      }
    }

    const author = playerMap[promo.playerId as string];
    const target = promo.targetPlayerId ? playerMap[promo.targetPlayerId as string] : undefined;

    // Find target promo if response
    let targetPromo: Record<string, unknown> | undefined;
    if (promo.targetPromoId) {
      const tp = allPromos.find((p) => p.promoId === promo.targetPromoId);
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
        const rAuthor = playerMap[r.playerId as string];
        const rTarget = r.targetPlayerId ? playerMap[r.targetPlayerId as string] : undefined;
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
      .sort((a: any, b: any) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());

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
