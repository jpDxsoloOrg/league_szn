/**
 * Seed Events: Events + bidirectional match-event links
 * Dependencies: Matches, Seasons (from seed-matches, seed-core)
 */
import {
  TABLES,
  putItem,
  updateItem,
  daysAgo,
  daysFromNow,
  SEASON_IDS,
  EVENT_IDS,
  MATCH_IDS,
  MATCH_DEFINITIONS,
} from './shared';

export async function seedEvents(): Promise<void> {
  const now = new Date().toISOString();

  console.log('Creating events...');

  // WrestleMania 40 — PPV, upcoming, 14 days from now
  // Links to scheduled matches 8, 9, 10
  const wrestlemania = {
    eventId: EVENT_IDS.wrestlemania,
    name: 'WrestleMania 40',
    eventType: 'ppv',
    date: daysFromNow(14).toISOString(),
    venue: 'MetLife Stadium',
    description: 'The Showcase of the Immortals',
    themeColor: '#FFD700',
    status: 'upcoming',
    seasonId: SEASON_IDS.season1,
    fantasyEnabled: true,
    matchCards: [
      {
        position: 1,
        matchId: MATCH_IDS[8],
        designation: 'opener',
        notes: 'Championship Match',
      },
      {
        position: 2,
        matchId: MATCH_IDS[9],
        designation: 'midcard',
      },
      {
        position: 3,
        matchId: MATCH_IDS[10],
        designation: 'main-event',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  // Monday Night Raw #1580 — weekly, completed, 7 days ago
  // Links to completed matches 5, 6, 7
  const raw = {
    eventId: EVENT_IDS.raw,
    name: 'Monday Night Raw #1580',
    eventType: 'weekly',
    date: daysAgo(7).toISOString(),
    description: 'The longest running weekly episodic television show',
    status: 'completed',
    seasonId: SEASON_IDS.season1,
    fantasyEnabled: true,
    matchCards: [
      {
        position: 1,
        matchId: MATCH_IDS[5],
        designation: 'opener',
      },
      {
        position: 2,
        matchId: MATCH_IDS[6],
        designation: 'midcard',
      },
      {
        position: 3,
        matchId: MATCH_IDS[7],
        designation: 'main-event',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  // Royal Rumble 2026 — PPV, upcoming, 30 days from now, no matches yet
  const rumble = {
    eventId: EVENT_IDS.rumble,
    name: 'Royal Rumble 2026',
    eventType: 'ppv',
    date: daysFromNow(30).toISOString(),
    venue: 'Alamodome',
    description: 'Every man for himself',
    themeColor: '#1E90FF',
    status: 'upcoming',
    seasonId: SEASON_IDS.season1,
    fantasyEnabled: true,
    matchCards: [],
    createdAt: now,
    updatedAt: now,
  };

  const events = [wrestlemania, raw, rumble];
  for (const event of events) {
    await putItem(TABLES.EVENTS, event);
    console.log(`  ✓ Event: ${event.name}`);
  }

  // ── Link matches back to events (bidirectional) ────────────────
  console.log('\nLinking matches to events...');

  // Completed matches 5, 6, 7 → Raw event
  for (const matchId of [MATCH_IDS[5], MATCH_IDS[6], MATCH_IDS[7]]) {
    const def = MATCH_DEFINITIONS.find(m => m.matchId === matchId)!;
    const matchDate =
      def.daysOffset < 0
        ? new Date(Date.now() + def.daysOffset * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + def.daysOffset * 24 * 60 * 60 * 1000);

    await updateItem(
      TABLES.MATCHES,
      { matchId, date: matchDate.toISOString() },
      'SET #e = :e',
      { '#e': 'eventId' },
      { ':e': EVENT_IDS.raw },
    );
  }

  // Scheduled matches 8, 9, 10 → WrestleMania event
  for (const matchId of [MATCH_IDS[8], MATCH_IDS[9], MATCH_IDS[10]]) {
    const def = MATCH_DEFINITIONS.find(m => m.matchId === matchId)!;
    const matchDate = new Date(Date.now() + def.daysOffset * 24 * 60 * 60 * 1000);

    await updateItem(
      TABLES.MATCHES,
      { matchId, date: matchDate.toISOString() },
      'SET #e = :e',
      { '#e': 'eventId' },
      { ':e': EVENT_IDS.wrestlemania },
    );
  }

  console.log('  ✓ Linked 6 matches to events');

  console.log('\n✅ Events seed complete (3 events, 6 match links)');
}

if (require.main === module) {
  seedEvents()
    .then(() => { console.log('\nDone!'); process.exit(0); })
    .catch((error) => { console.error('Error:', error); process.exit(1); });
}
