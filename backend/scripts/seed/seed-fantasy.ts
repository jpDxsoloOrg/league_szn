/**
 * Seed Fantasy: Fantasy Config + Wrestler Costs
 * Dependencies: Players (from seed-core)
 */
import {
  TABLES,
  putItem,
  daysAgo,
  PLAYER_IDS,
  PLAYER_NAMES,
  COMPUTED_PLAYER_STATS,
} from './shared';

export async function seedFantasy(): Promise<void> {
  const now = new Date().toISOString();

  // ── Fantasy Config ─────────────────────────────────────────────
  console.log('Creating fantasy config...');
  const fantasyConfig = {
    configKey: 'GLOBAL',
    defaultBudget: 500,
    defaultPicksPerDivision: 2,
    baseWinPoints: 10,
    championshipBonus: 5,
    titleWinBonus: 10,
    titleDefenseBonus: 5,
    costFluctuationEnabled: true,
    costChangePerWin: 10,
    costChangePerLoss: 5,
    costResetStrategy: 'reset',
    underdogMultiplier: 1.5,
    perfectPickBonus: 50,
    streakBonusThreshold: 5,
    streakBonusPoints: 25,
  };

  await putItem(TABLES.FANTASY_CONFIG, fantasyConfig);
  console.log('  ✓ Fantasy config: GLOBAL');

  // ── Wrestler Costs (derived from consistent player stats) ──────
  console.log('\nCreating wrestler costs...');

  for (let i = 0; i < PLAYER_IDS.length; i++) {
    const playerId = PLAYER_IDS[i];
    const stats = COMPUTED_PLAYER_STATS[playerId];
    const totalMatches = stats.wins + stats.losses + stats.draws;
    const winRate = totalMatches > 0 ? Math.round((stats.wins / totalMatches) * 100) : 0;
    const baseCost = 100;
    const costAdjustment = Math.round((winRate - 50) * 1.5);
    const currentCost = Math.max(50, baseCost + costAdjustment);

    const wrestlerCost = {
      playerId,
      baseCost,
      currentCost,
      costHistory: [
        {
          date: daysAgo(7).toISOString().split('T')[0],
          cost: baseCost,
          reason: 'Initial cost set',
        },
        {
          date: new Date().toISOString().split('T')[0],
          cost: currentCost,
          reason: 'Performance adjustment',
        },
      ],
      winRate30Days: winRate,
      recentRecord: `${stats.wins}-${stats.losses}-${stats.draws}`,
      updatedAt: now,
    };

    await putItem(TABLES.WRESTLER_COSTS, wrestlerCost);
    console.log(`  ✓ Wrestler cost: ${PLAYER_NAMES[i]} → $${currentCost}`);
  }

  console.log('\n✅ Fantasy seed complete (1 config, 12 wrestler costs)');
}

if (require.main === module) {
  seedFantasy()
    .then(() => { console.log('\nDone!'); process.exit(0); })
    .catch((error) => { console.error('Error:', error); process.exit(1); });
}
