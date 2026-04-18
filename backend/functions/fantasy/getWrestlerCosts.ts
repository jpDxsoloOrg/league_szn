import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

function determineTrend(currentCost: number, baseCost: number): 'up' | 'down' | 'stable' {
  if (currentCost > baseCost) return 'up';
  if (currentCost < baseCost) return 'down';
  return 'stable';
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { fantasy, players } = getRepositories();

    const [allCosts, allPlayers] = await Promise.all([
      fantasy.listAllCosts(),
      players.list(),
    ]);

    const costMap = new Map<string, typeof allCosts[number]>();
    for (const cost of allCosts) {
      costMap.set(cost.playerId, cost);
    }

    const merged = allPlayers.map((player) => {
      const cost = costMap.get(player.playerId);
      const currentCost = cost?.currentCost || 100;
      const baseCost = cost?.baseCost || 100;

      return {
        playerId: player.playerId,
        name: player.name,
        currentWrestler: player.currentWrestler,
        divisionId: player.divisionId || null,
        imageUrl: player.imageUrl || null,
        currentCost,
        baseCost,
        costHistory: cost?.costHistory || [],
        winRate30Days: cost?.winRate30Days || 0,
        recentRecord: cost?.recentRecord || '0-0',
        costTrend: determineTrend(currentCost, baseCost),
        updatedAt: cost?.updatedAt || player.updatedAt,
      };
    });

    return success(merged);
  } catch (err) {
    console.error('Error fetching wrestler costs:', err);
    return serverError('Failed to fetch wrestler costs');
  }
};
