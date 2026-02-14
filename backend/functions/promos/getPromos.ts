import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { playerId, promoType, includeHidden } = event.queryStringParameters || {};

    let promos: Record<string, unknown>[];

    if (playerId) {
      promos = await dynamoDb.queryAll({
        TableName: TableNames.PROMOS,
        IndexName: 'PlayerIndex',
        KeyConditionExpression: 'playerId = :pid',
        ExpressionAttributeValues: { ':pid': playerId },
        ScanIndexForward: false,
      });
    } else if (promoType) {
      promos = await dynamoDb.queryAll({
        TableName: TableNames.PROMOS,
        IndexName: 'TypeIndex',
        KeyConditionExpression: 'promoType = :pt',
        ExpressionAttributeValues: { ':pt': promoType },
        ScanIndexForward: false,
      });
    } else {
      promos = await dynamoDb.scanAll({
        TableName: TableNames.PROMOS,
      });
    }

    // Collect unique player IDs for enrichment
    const playerIds = new Set<string>();
    for (const p of promos) {
      playerIds.add(p.playerId as string);
      if (p.targetPlayerId) playerIds.add(p.targetPlayerId as string);
    }

    const playerMap: Record<string, { name: string; currentWrestler: string; imageUrl?: string }> = {};
    for (const pid of playerIds) {
      const result = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: pid },
      });
      if (result.Item) {
        playerMap[pid] = {
          name: result.Item.name as string,
          currentWrestler: result.Item.currentWrestler as string,
          imageUrl: result.Item.imageUrl as string | undefined,
        };
      }
    }

    // Count responses for each promo
    const promoIds = new Set(promos.map((p) => p.promoId as string));
    const responseCounts: Record<string, number> = {};
    for (const p of promos) {
      if (p.targetPromoId && promoIds.has(p.targetPromoId as string)) {
        responseCounts[p.targetPromoId as string] = (responseCounts[p.targetPromoId as string] || 0) + 1;
      }
    }

    // Enrich with player context
    const enriched = promos
      .filter((p) => includeHidden === 'true' || !(p.isHidden as boolean))
      .map((p) => {
        const author = playerMap[p.playerId as string];
        const target = p.targetPlayerId ? playerMap[p.targetPlayerId as string] : undefined;

        // Find target promo if it's a response
        let targetPromo: Record<string, unknown> | undefined;
        if (p.targetPromoId) {
          const tp = promos.find((pp) => pp.promoId === p.targetPromoId);
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
          responseCount: responseCounts[p.promoId as string] || 0,
        };
      });

    // Sort by createdAt descending
    enriched.sort((a: any, b: any) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

    return success(enriched);
  } catch (err) {
    console.error('Error fetching promos:', err);
    return serverError('Failed to fetch promos');
  }
};
