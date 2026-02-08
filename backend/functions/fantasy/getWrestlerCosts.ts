import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

function determineTrend(currentCost: number, baseCost: number): 'up' | 'down' | 'stable' {
  if (currentCost > baseCost) return 'up';
  if (currentCost < baseCost) return 'down';
  return 'stable';
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const [costsResult, playersResult] = await Promise.all([
      dynamoDb.scanAll({ TableName: TableNames.WRESTLER_COSTS }),
      dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
    ]);

    const costMap = new Map<string, Record<string, unknown>>();
    for (const cost of costsResult) {
      costMap.set(cost.playerId as string, cost);
    }

    const merged = playersResult.map((player) => {
      const cost = costMap.get(player.playerId as string);
      const currentCost = (cost?.currentCost as number) || 100;
      const baseCost = (cost?.baseCost as number) || 100;

      return {
        playerId: player.playerId,
        name: player.name,
        currentWrestler: player.currentWrestler,
        divisionId: player.divisionId || null,
        imageUrl: player.imageUrl || null,
        currentCost,
        baseCost,
        costHistory: cost?.costHistory || [],
        winRate30Days: (cost?.winRate30Days as number) || 0,
        recentRecord: (cost?.recentRecord as string) || '0-0',
        costTrend: determineTrend(currentCost, baseCost),
        updatedAt: (cost?.updatedAt as string) || player.updatedAt,
      };
    });

    return success(merged);
  } catch (err) {
    console.error('Error fetching wrestler costs:', err);
    return serverError('Failed to fetch wrestler costs');
  }
};
