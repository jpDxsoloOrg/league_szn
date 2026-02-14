import { Handler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

/**
 * Standalone function for fire-and-forget cost recalculation.
 * Called from recordResult.ts after a match result is recorded.
 */
export async function recalculateCosts(): Promise<void> {
  // Fetch config
  const configResult = await dynamoDb.get({
    TableName: TableNames.FANTASY_CONFIG,
    Key: { configKey: 'GLOBAL' },
  });

  const config = configResult.Item || {
    costFluctuationEnabled: true,
    costChangePerWin: 10,
    costChangePerLoss: 5,
  };

  if (!config.costFluctuationEnabled) return;

  const costChangePerWin = (config.costChangePerWin as number) || 10;
  const costChangePerLoss = (config.costChangePerLoss as number) || 5;

  // Fetch all players and matches
  const [players, allMatches, existingCosts] = await Promise.all([
    dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
    dynamoDb.scanAll({ TableName: TableNames.MATCHES }),
    dynamoDb.scanAll({ TableName: TableNames.WRESTLER_COSTS }),
  ]);

  // Filter to completed matches in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString();

  const recentMatches = allMatches.filter(
    (m) => m.status === 'completed' && (m.date as string) >= cutoffDate
  );

  const costMap = new Map<string, Record<string, unknown>>();
  for (const cost of existingCosts) {
    costMap.set(cost.playerId as string, cost);
  }

  const today = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString();
  let updatedCount = 0;

  for (const player of players) {
    const playerId = player.playerId as string;
    let wins = 0;
    let losses = 0;

    for (const match of recentMatches) {
      const winners = (match.winners as string[]) || [];
      const losers = (match.losers as string[]) || [];
      if (winners.includes(playerId)) wins++;
      if (losers.includes(playerId)) losses++;
    }

    const totalMatches = wins + losses;
    const winRate30Days = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
    const recentRecord = `${wins}-${losses}`;

    const existing = costMap.get(playerId);
    const baseCost = (existing?.baseCost as number) || 100;

    let newCost = baseCost + wins * costChangePerWin - losses * costChangePerLoss;
    // Clamp between 50% and 200% of base cost
    newCost = Math.max(newCost, Math.floor(baseCost * 0.5));
    newCost = Math.min(newCost, Math.floor(baseCost * 2));

    const oldCost = (existing?.currentCost as number) || baseCost;
    const costHistory = [...((existing?.costHistory as any[]) || [])];

    if (newCost !== oldCost) {
      costHistory.push({
        date: today,
        cost: newCost,
        reason: `Recalculated: ${wins}W-${losses}L in 30 days`,
      });
      // Keep last 20 entries
      while (costHistory.length > 20) costHistory.shift();
    }

    await dynamoDb.put({
      TableName: TableNames.WRESTLER_COSTS,
      Item: {
        playerId,
        currentCost: newCost,
        baseCost,
        costHistory,
        winRate30Days,
        recentRecord,
        updatedAt: timestamp,
      },
    });
    updatedCount++;
  }

  console.log(`Recalculated costs for ${updatedCount} wrestlers`);
}

export const handler: Handler = async (event) => {
  try {
    // Async invocation (from recordResult via invokeAsync) — no requestContext
    const isAsyncInvocation = !event.requestContext;

    if (!isAsyncInvocation) {
      const denied = requireRole(event, 'Admin');
      if (denied) return denied;
    }

    await recalculateCosts();

    if (isAsyncInvocation) {
      console.log('Async wrestler cost recalculation complete');
      return { message: 'Wrestler costs recalculated' };
    }

    return success({ message: 'Wrestler costs recalculated' });
  } catch (err) {
    console.error('Error recalculating wrestler costs:', err);

    if (!event.requestContext) {
      throw err;
    }

    return serverError('Failed to recalculate wrestler costs');
  }
};
