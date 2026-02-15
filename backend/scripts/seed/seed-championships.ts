/**
 * Seed Championships: Championships + Championship History
 * Dependencies: Players, Divisions (from seed-core)
 */
import {
  TABLES,
  putItem,
  daysAgo,
  DIVISION_IDS,
  PLAYER_IDS,
  CHAMPIONSHIP_IDS,
  MATCH_IDS,
} from './shared';

export async function seedChampionships(): Promise<void> {
  const now = new Date().toISOString();

  // ── Championships ──────────────────────────────────────────────
  console.log('Creating championships...');
  const championships = [
    {
      championshipId: CHAMPIONSHIP_IDS.worldHeavyweight,
      name: 'World Heavyweight Championship',
      type: 'singles',
      currentChampion: PLAYER_IDS[0],
      divisionId: DIVISION_IDS.raw,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    {
      championshipId: CHAMPIONSHIP_IDS.intercontinental,
      name: 'Intercontinental Championship',
      type: 'singles',
      currentChampion: PLAYER_IDS[1],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    {
      championshipId: CHAMPIONSHIP_IDS.tagTeam,
      name: 'Tag Team Championship',
      type: 'tag',
      currentChampion: [PLAYER_IDS[2], PLAYER_IDS[3]],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    {
      championshipId: CHAMPIONSHIP_IDS.unitedStates,
      name: 'United States Championship',
      type: 'singles',
      currentChampion: PLAYER_IDS[4],
      divisionId: DIVISION_IDS.smackdown,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
  ];

  for (const championship of championships) {
    await putItem(TABLES.CHAMPIONSHIPS, championship);
    console.log(`  ✓ Championship: ${championship.name}`);
  }

  // ── Championship History ───────────────────────────────────────
  // Each entry references the actual match where the title was won.
  console.log('\nCreating championship history...');

  const historyEntries = [
    {
      championshipId: CHAMPIONSHIP_IDS.worldHeavyweight,
      wonDate: daysAgo(25).toISOString(),
      champion: PLAYER_IDS[0],
      matchId: MATCH_IDS[0], // Match 0: player[0] beat player[1] for WHC
      defenses: 1,
    },
    {
      championshipId: CHAMPIONSHIP_IDS.unitedStates,
      wonDate: daysAgo(22).toISOString(),
      champion: PLAYER_IDS[4],
      matchId: MATCH_IDS[1], // Match 1: player[4] beat player[8] for US
      defenses: 0,
    },
    {
      championshipId: CHAMPIONSHIP_IDS.intercontinental,
      wonDate: daysAgo(20).toISOString(),
      champion: PLAYER_IDS[1],
      matchId: MATCH_IDS[2], // Match 2: player[1] beat player[9] for IC
      defenses: 0,
    },
    {
      championshipId: CHAMPIONSHIP_IDS.tagTeam,
      wonDate: daysAgo(18).toISOString(),
      champion: [PLAYER_IDS[2], PLAYER_IDS[3]],
      matchId: MATCH_IDS[3], // Match 3: [player[2],player[3]] beat [player[10],player[11]]
      defenses: 0,
    },
  ];

  const championshipNames: Record<string, string> = {
    [CHAMPIONSHIP_IDS.worldHeavyweight]: 'World Heavyweight Championship',
    [CHAMPIONSHIP_IDS.intercontinental]: 'Intercontinental Championship',
    [CHAMPIONSHIP_IDS.tagTeam]: 'Tag Team Championship',
    [CHAMPIONSHIP_IDS.unitedStates]: 'United States Championship',
  };

  for (const entry of historyEntries) {
    await putItem(TABLES.CHAMPIONSHIP_HISTORY, entry);
    console.log(`  ✓ History: ${championshipNames[entry.championshipId]}`);
  }

  console.log('\n✅ Championships seed complete (4 championships, 4 history entries)');
}

if (require.main === module) {
  seedChampionships()
    .then(() => { console.log('\nDone!'); process.exit(0); })
    .catch((error) => { console.error('Error:', error); process.exit(1); });
}
