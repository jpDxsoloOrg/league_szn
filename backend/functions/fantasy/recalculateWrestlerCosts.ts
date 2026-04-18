import { Handler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

/**
 * Standalone function for fire-and-forget cost recalculation.
 * Called from recordResult.ts after a match result is recorded.
 */
export async function recalculateCosts(): Promise<void> {
  const { fantasy, players, matches } = getRepositories();

  // Fetch config
  const config = await fantasy.getConfig();
  const configValues = config || {
    costFluctuationEnabled: true,
    costChangePerWin: 10,
    costChangePerLoss: 5,
  };

  if (!configValues.costFluctuationEnabled) return;

  const costChangePerWin = (configValues.costChangePerWin as number) || 10;
  const costChangePerLoss = (configValues.costChangePerLoss as number) || 5;

  // Fetch all players, matches, and existing costs
  const [allPlayers, allMatches, existingCosts] = await Promise.all([
    players.list(),
    matches.list(),
    fantasy.listAllCosts(),
  ]);

  // Filter to completed matches in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString();

  const recentMatches = allMatches.filter(
    (m) => m.status === 'completed' && m.date >= cutoffDate
  );

  const costMap = new Map<string, typeof existingCosts[number]>();
  for (const cost of existingCosts) {
    costMap.set(cost.playerId, cost);
  }

  const today = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString();
  let updatedCount = 0;

  for (const player of allPlayers) {
    const playerId = player.playerId;
    let wins = 0;
    let losses = 0;

    for (const match of recentMatches) {
      const winners = match.winners || [];
      const losers = match.losers || [];
      if (winners.includes(playerId)) wins++;
      if (losers.includes(playerId)) losses++;
    }

    const totalMatches = wins + losses;
    const winRate30Days = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
    const recentRecord = `${wins}-${losses}`;

    const existing = costMap.get(playerId);
    const baseCost = existing?.baseCost || 100;

    let newCost = baseCost + wins * costChangePerWin - losses * costChangePerLoss;
    // Clamp between 50% and 200% of base cost
    newCost = Math.max(newCost, Math.floor(baseCost * 0.5));
    newCost = Math.min(newCost, Math.floor(baseCost * 2));

    const oldCost = existing?.currentCost || baseCost;
    const costHistory = [...(existing?.costHistory || [])];

    if (newCost !== oldCost) {
      costHistory.push({
        date: today,
        cost: newCost,
        reason: `Recalculated: ${wins}W-${losses}L in 30 days`,
      });
      // Keep last 20 entries
      while (costHistory.length > 20) costHistory.shift();
    }

    await fantasy.upsertCost({
      playerId,
      currentCost: newCost,
      baseCost,
      costHistory,
      winRate30Days,
      recentRecord,
      updatedAt: timestamp,
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
