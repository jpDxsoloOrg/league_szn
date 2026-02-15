/**
 * Seed Core: Divisions, Players, Seasons
 * No dependencies on other seed scripts.
 */
import {
  TABLES,
  putItem,
  daysAgo,
  DIVISION_IDS,
  PLAYER_IDS,
  SEASON_IDS,
  WRESTLERS,
  PLAYER_NAMES,
  PLAYER_DIVISION_MAP,
  COMPUTED_PLAYER_STATS,
} from './shared';

export async function seedCore(): Promise<void> {
  const now = new Date().toISOString();

  // ── Divisions ──────────────────────────────────────────────────
  console.log('Creating divisions...');
  const divisions = [
    {
      divisionId: DIVISION_IDS.raw,
      name: 'Raw',
      description: 'The flagship Monday Night Raw roster',
      createdAt: now,
      updatedAt: now,
    },
    {
      divisionId: DIVISION_IDS.smackdown,
      name: 'SmackDown',
      description: 'The Friday Night SmackDown roster',
      createdAt: now,
      updatedAt: now,
    },
    {
      divisionId: DIVISION_IDS.nxt,
      name: 'NXT',
      description: 'The developmental brand for rising stars',
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const division of divisions) {
    await putItem(TABLES.DIVISIONS, division);
    console.log(`  ✓ Division: ${division.name}`);
  }

  // ── Players ────────────────────────────────────────────────────
  console.log('\nCreating players...');
  const divisionNames: Record<string, string> = {
    [DIVISION_IDS.raw]: 'Raw',
    [DIVISION_IDS.smackdown]: 'SmackDown',
    [DIVISION_IDS.nxt]: 'NXT',
  };

  for (let i = 0; i < PLAYER_IDS.length; i++) {
    const playerId = PLAYER_IDS[i];
    const stats = COMPUTED_PLAYER_STATS[playerId];
    const divisionId = PLAYER_DIVISION_MAP[playerId];

    const player = {
      playerId,
      name: PLAYER_NAMES[i],
      currentWrestler: WRESTLERS[i],
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      divisionId,
      createdAt: now,
      updatedAt: now,
    };

    await putItem(TABLES.PLAYERS, player);
    console.log(`  ✓ Player: ${player.name} (${player.currentWrestler}) [${divisionNames[divisionId]}]`);
  }

  // ── Seasons ────────────────────────────────────────────────────
  console.log('\nCreating seasons...');
  const season = {
    seasonId: SEASON_IDS.season1,
    name: 'Season 1',
    startDate: daysAgo(30).toISOString(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await putItem(TABLES.SEASONS, season);
  console.log(`  ✓ Season: ${season.name}`);

  console.log('\n✅ Core seed complete (3 divisions, 12 players, 1 season)');
}

if (require.main === module) {
  seedCore()
    .then(() => { console.log('\nDone!'); process.exit(0); })
    .catch((error) => { console.error('Error:', error); process.exit(1); });
}
