/**
 * Seed Tournaments: Single-elimination and round-robin tournaments
 * Dependencies: Players (from seed-core)
 */
import {
  TABLES,
  putItem,
  PLAYER_IDS,
  TOURNAMENT_IDS,
} from './shared';

export async function seedTournaments(): Promise<void> {
  const now = new Date().toISOString();

  console.log('Creating tournaments...');

  const tournaments = [
    {
      tournamentId: TOURNAMENT_IDS.kotr,
      name: 'King of the Ring 2024',
      type: 'single-elimination',
      status: 'in-progress',
      participants: [PLAYER_IDS[0], PLAYER_IDS[1], PLAYER_IDS[2], PLAYER_IDS[3]],
      brackets: {
        rounds: [
          {
            roundNumber: 1,
            matches: [
              {
                participant1: PLAYER_IDS[0],
                participant2: PLAYER_IDS[1],
                winner: PLAYER_IDS[0],
              },
              {
                participant1: PLAYER_IDS[2],
                participant2: PLAYER_IDS[3],
                winner: PLAYER_IDS[2],
              },
            ],
          },
          {
            roundNumber: 2,
            matches: [
              {
                participant1: PLAYER_IDS[0],
                participant2: PLAYER_IDS[2],
              },
            ],
          },
        ],
      },
      createdAt: now,
      version: 1,
    },
    {
      tournamentId: TOURNAMENT_IDS.g1,
      name: 'G1 Climax 2024',
      type: 'round-robin',
      status: 'in-progress',
      participants: [PLAYER_IDS[4], PLAYER_IDS[5], PLAYER_IDS[6], PLAYER_IDS[7]],
      standings: {
        [PLAYER_IDS[4]]: { wins: 2, losses: 1, draws: 0, points: 4 },
        [PLAYER_IDS[5]]: { wins: 2, losses: 1, draws: 0, points: 4 },
        [PLAYER_IDS[6]]: { wins: 1, losses: 2, draws: 0, points: 2 },
        [PLAYER_IDS[7]]: { wins: 1, losses: 2, draws: 0, points: 2 },
      },
      createdAt: now,
      version: 1,
    },
  ];

  for (const tournament of tournaments) {
    await putItem(TABLES.TOURNAMENTS, tournament);
    console.log(`  ✓ Tournament: ${tournament.name}`);
  }

  console.log('\n✅ Tournaments seed complete (2 tournaments)');
}

if (require.main === module) {
  seedTournaments()
    .then(() => { console.log('\nDone!'); process.exit(0); })
    .catch((error) => { console.error('Error:', error); process.exit(1); });
}
