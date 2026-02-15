/**
 * Master Seed Orchestrator
 * Runs all domain seed scripts in dependency order.
 *
 * Dependency graph:
 *   Step 1: seed-core (Divisions, Players, Seasons) — no deps
 *   Step 2: seed-config (SiteConfig) — no deps (parallel with step 1)
 *   Step 3: seed-championships (Championships + History) — needs Players, Divisions
 *   Step 4: seed-matches (Matches + Stats + SeasonStandings) — needs Players, Seasons, Championships
 *   Step 5: seed-events (Events) — needs Matches, Seasons
 *   Step 6: seed-tournaments (Tournaments) — needs Players
 *   Step 7: seed-contenders (Rankings + History) — needs Championships, Players
 *   Step 8: seed-fantasy (FantasyConfig + WrestlerCosts) — needs Players
 */
import { seedCore } from './seed-core';
import { seedConfig } from './seed-config';
import { seedChampionships } from './seed-championships';
import { seedMatches } from './seed-matches';
import { seedEvents } from './seed-events';
import { seedTournaments } from './seed-tournaments';
import { seedContenders } from './seed-contenders';
import { seedFantasy } from './seed-fantasy';

async function seedAll(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  WWE 2K League — Full Seed');
  console.log('═══════════════════════════════════════════════════════\n');

  // Step 1+2: Foundation (no dependencies — run in parallel)
  console.log('── Step 1: Core + Config (parallel) ──────────────────\n');
  await Promise.all([seedCore(), seedConfig()]);

  // Step 3: Championships (needs Players, Divisions)
  console.log('\n── Step 2: Championships ─────────────────────────────\n');
  await seedChampionships();

  // Step 4: Matches + derived stats (needs Players, Seasons, Championships)
  console.log('\n── Step 3: Matches + Stats + Standings ───────────────\n');
  await seedMatches();

  // Step 5+6+7+8: Independent of each other (run in parallel)
  console.log('\n── Step 4: Events, Tournaments, Contenders, Fantasy (parallel) ──\n');
  await Promise.all([
    seedEvents(),
    seedTournaments(),
    seedContenders(),
    seedFantasy(),
  ]);

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ All seed data created successfully!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\nSummary:');
  console.log('  - 3 divisions');
  console.log('  - 12 players');
  console.log('  - 1 season');
  console.log('  - 12 season standings');
  console.log('  - 4 championships');
  console.log('  - 4 championship history entries');
  console.log('  - 12 matches (8 completed, 4 scheduled)');
  console.log('  - 3 events');
  console.log('  - 2 tournaments');
  console.log('  - 8 contender rankings');
  console.log('  - 9 ranking history entries');
  console.log('  - 1 fantasy config');
  console.log('  - 12 wrestler costs');
  console.log('  - 1 site config');
}

seedAll()
  .then(() => { console.log('\nDone!'); process.exit(0); })
  .catch((error) => { console.error('Error seeding data:', error); process.exit(1); });
