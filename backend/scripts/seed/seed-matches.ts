/**
 * Seed Matches: Matches + Player W/L/D updates + Season Standings
 * Dependencies: Players, Seasons, Championships (from seed-core and seed-championships)
 *
 * This script enforces data consistency:
 * - Player all-time W/L/D is calculated from completed match outcomes
 * - Season standings are calculated from matches assigned to that season
 */
import {
  TABLES,
  putItem,
  updateItem,
  daysAgo,
  daysFromNow,
  SEASON_IDS,
  PLAYER_IDS,
  PLAYER_NAMES,
  MATCH_DEFINITIONS,
  COMPUTED_PLAYER_STATS,
} from './shared';

export async function seedMatches(): Promise<void> {
  const now = new Date().toISOString();

  // ── Matches ────────────────────────────────────────────────────
  console.log('Creating matches...');

  for (const def of MATCH_DEFINITIONS) {
    const matchDate =
      def.daysOffset < 0
        ? daysAgo(Math.abs(def.daysOffset))
        : daysFromNow(def.daysOffset);

    const match: Record<string, unknown> = {
      matchId: def.matchId,
      date: matchDate.toISOString(),
      matchType: def.matchType,
      stipulation: def.stipulation,
      participants: def.participants,
      isChampionship: def.isChampionship,
      seasonId: SEASON_IDS.season1,
      status: def.status,
      createdAt: now,
      version: 1,
    };

    if (def.winners) match.winners = def.winners;
    if (def.losers) match.losers = def.losers;
    if (def.championshipId) match.championshipId = def.championshipId;

    await putItem(TABLES.MATCHES, match);
    console.log(`  ✓ Match: ${def.matchType} ${def.stipulation} (${def.status})`);
  }

  // ── Update Player W/L/D (derived from match outcomes) ──────────
  console.log('\nUpdating player stats from match outcomes...');

  for (const playerId of PLAYER_IDS) {
    const stats = COMPUTED_PLAYER_STATS[playerId];
    const playerIndex = PLAYER_IDS.indexOf(playerId);
    const playerName = PLAYER_NAMES[playerIndex];

    await updateItem(
      TABLES.PLAYERS,
      { playerId },
      'SET #w = :w, #l = :l, #d = :d, #u = :u',
      { '#w': 'wins', '#l': 'losses', '#d': 'draws', '#u': 'updatedAt' },
      { ':w': stats.wins, ':l': stats.losses, ':d': stats.draws, ':u': now },
    );

    console.log(`  ✓ ${playerName}: ${stats.wins}W-${stats.losses}L-${stats.draws}D`);
  }

  // ── Season Standings (derived from season-assigned matches) ────
  console.log('\nCreating season standings from match outcomes...');

  // All completed matches are in season1, so season stats = all-time stats
  for (const playerId of PLAYER_IDS) {
    const stats = COMPUTED_PLAYER_STATS[playerId];
    const playerIndex = PLAYER_IDS.indexOf(playerId);
    const playerName = PLAYER_NAMES[playerIndex];

    const standing = {
      seasonId: SEASON_IDS.season1,
      playerId,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      updatedAt: now,
    };

    await putItem(TABLES.SEASON_STANDINGS, standing);
    console.log(`  ✓ Standing: ${playerName} (${stats.wins}W-${stats.losses}L-${stats.draws}D)`);
  }

  const completed = MATCH_DEFINITIONS.filter(m => m.status === 'completed').length;
  const scheduled = MATCH_DEFINITIONS.filter(m => m.status === 'scheduled').length;
  console.log(`\n✅ Matches seed complete (${completed} completed, ${scheduled} scheduled, 12 standings)`);
}

if (require.main === module) {
  seedMatches()
    .then(() => { console.log('\nDone!'); process.exit(0); })
    .catch((error) => { console.error('Error:', error); process.exit(1); });
}
