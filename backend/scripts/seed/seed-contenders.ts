/**
 * Seed Contenders: Contender Rankings + Ranking History
 * Dependencies: Players, Championships, Divisions (from seed-core, seed-championships)
 */
import {
  TABLES,
  putItem,
  daysAgo,
  getISOWeekKey,
  DIVISION_IDS,
  PLAYER_IDS,
  PLAYER_NAMES,
  CHAMPIONSHIP_IDS,
  PLAYER_DIVISION_MAP,
} from './shared';

export async function seedContenders(): Promise<void> {
  const now = new Date().toISOString();

  // ── Contender Rankings ─────────────────────────────────────────
  console.log('Creating contender rankings...');

  // World Heavyweight Championship: division-locked to Raw, exclude current champion (player[0])
  const rawPlayerIds = PLAYER_IDS.filter(id => PLAYER_DIVISION_MAP[id] === DIVISION_IDS.raw);
  const whcContenderIds = rawPlayerIds
    .filter(id => id !== PLAYER_IDS[0]) // exclude champion
    .slice(0, 3);

  for (let i = 0; i < whcContenderIds.length; i++) {
    const playerId = whcContenderIds[i];
    const playerIndex = PLAYER_IDS.indexOf(playerId);

    const ranking: Record<string, unknown> = {
      championshipId: CHAMPIONSHIP_IDS.worldHeavyweight,
      playerId,
      rank: i + 1,
      rankingScore: 80 - i * 15,
      winPercentage: 0.6 - i * 0.1,
      currentStreak: 3 - i,
      qualityScore: 70 - i * 10,
      recencyScore: 85 - i * 12,
      matchesInPeriod: 5 + i,
      winsInPeriod: 4 - i,
      peakRank: 1,
      weeksAtTop: i === 0 ? 2 : 0,
      calculatedAt: now,
      updatedAt: now,
    };
    if (i <= 1) {
      ranking.previousRank = i === 0 ? 2 : 1;
    }

    await putItem(TABLES.CONTENDER_RANKINGS, ranking);
    console.log(`  ✓ Ranking: ${PLAYER_NAMES[playerIndex]} → #${i + 1} for World Heavyweight Championship`);
  }

  // Intercontinental Championship: open (no division lock), exclude current champion (player[1])
  const icContenderIds = PLAYER_IDS
    .filter(id => id !== PLAYER_IDS[1]) // exclude champion
    .slice(0, 5);

  for (let i = 0; i < icContenderIds.length; i++) {
    const playerId = icContenderIds[i];
    const playerIndex = PLAYER_IDS.indexOf(playerId);

    const ranking: Record<string, unknown> = {
      championshipId: CHAMPIONSHIP_IDS.intercontinental,
      playerId,
      rank: i + 1,
      rankingScore: 90 - i * 12,
      winPercentage: 0.7 - i * 0.08,
      currentStreak: 4 - i,
      qualityScore: 75 - i * 8,
      recencyScore: 88 - i * 10,
      matchesInPeriod: 6 + i,
      winsInPeriod: 5 - i,
      peakRank: Math.max(1, i),
      weeksAtTop: i === 0 ? 3 : 0,
      calculatedAt: now,
      updatedAt: now,
    };
    if (i + 1 <= 3) {
      ranking.previousRank = i + 2;
    }

    await putItem(TABLES.CONTENDER_RANKINGS, ranking);
    console.log(`  ✓ Ranking: ${PLAYER_NAMES[playerIndex]} → #${i + 1} for Intercontinental Championship`);
  }

  // ── Ranking History ────────────────────────────────────────────
  console.log('\nCreating ranking history...');

  // 3 weeks of history for the top 3 IC contenders
  for (let weekOffset = 0; weekOffset < 3; weekOffset++) {
    const weekDate = daysAgo(weekOffset * 7);
    for (let i = 0; i < 3; i++) {
      const playerId = icContenderIds[i];
      const weekKey = getISOWeekKey(CHAMPIONSHIP_IDS.intercontinental, weekDate);

      const entry = {
        playerId,
        weekKey,
        championshipId: CHAMPIONSHIP_IDS.intercontinental,
        rank: i + 1 + (weekOffset === 2 ? 1 : 0),
        rankingScore: 90 - i * 12 - weekOffset * 3,
        movement: weekOffset === 0 ? (i === 0 ? 1 : -1) : 0,
        createdAt: weekDate.toISOString(),
      };

      await putItem(TABLES.RANKING_HISTORY, entry);
    }
    console.log(`  ✓ Ranking history: week ${weekOffset + 1}`);
  }

  console.log(`\n✅ Contenders seed complete (${whcContenderIds.length + icContenderIds.length} rankings, 9 history entries)`);
}

if (require.main === module) {
  seedContenders()
    .then(() => { console.log('\nDone!'); process.exit(0); })
    .catch((error) => { console.error('Error:', error); process.exit(1); });
}
