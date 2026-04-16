/**
 * Neon/Postgres seed script for the exploratory schema.
 * See ../../docs/plans/plan-017-neon-tables-and-seed.md.
 *
 * Reads NEON_DATABASE_URL from backend/.env.neon (or the environment).
 * Applies schema.sql, then inserts deterministic fixtures that mirror
 * backend/scripts/seed-data.ts for the 12 tables in scope.
 *
 * Usage (from backend/):
 *   npm run neon:seed               Apply schema + seed (requires --confirm)
 *   npm run neon:schema             Apply schema only (requires --confirm)
 *   npm run neon:seed -- --truncate Truncate + re-seed without dropping schema
 *
 * All destructive operations require `--confirm` because dropping tables on
 * the wrong Neon branch is unrecoverable.
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const ENV_PATH = path.resolve(__dirname, '.env.neon');
dotenv.config({ path: ENV_PATH });

const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

type Mode = 'schema+seed' | 'schema-only' | 'seed-only' | 'truncate';

interface Args {
  mode: Mode;
  confirmed: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Set(argv.slice(2));
  let mode: Mode = 'schema+seed';
  if (flags.has('--schema-only')) mode = 'schema-only';
  else if (flags.has('--seed-only')) mode = 'seed-only';
  else if (flags.has('--truncate')) mode = 'truncate';
  return { mode, confirmed: flags.has('--confirm') };
}

function requireUrl(): string {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) {
    console.error(`NEON_DATABASE_URL is not set. Expected it in ${ENV_PATH} or the environment.`);
    console.error('See backend/neon/README.md for setup instructions.');
    process.exit(1);
  }
  return url;
}

function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, '') || '(default)';
    return `${parsed.hostname} / db=${db} / user=${parsed.username}`;
  } catch {
    return '(unparseable connection string)';
  }
}

async function runSchema(client: Client): Promise<void> {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  console.log('Applying schema.sql ...');
  await client.query(sql);
  console.log('  schema applied.');
}

async function truncateAll(client: Client): Promise<void> {
  console.log('Truncating all tables (RESTART IDENTITY, CASCADE) ...');
  const tables = [
    'event_match_cards',
    'season_standings',
    'championship_reign_holders',
    'championship_reigns',
    'match_participants',
    'matches',
    'events',
    'tournaments',
    'championships',
    'seasons',
    'players',
    'divisions',
  ];
  await client.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE;`);
  console.log('  truncated.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic fixtures (UUIDs hardcoded so re-runs produce identical rows)
// ─────────────────────────────────────────────────────────────────────────────

const now = new Date();
function daysAgo(n: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  return daysAgo(-n);
}

const DIVISIONS = [
  { id: '11111111-0001-0000-0000-000000000001', name: 'Raw',       description: 'The flagship Monday Night Raw roster' },
  { id: '11111111-0001-0000-0000-000000000002', name: 'SmackDown', description: 'The Friday Night SmackDown roster' },
  { id: '11111111-0001-0000-0000-000000000003', name: 'NXT',       description: 'The developmental brand for rising stars' },
];

const PLAYERS = [
  { id: '22222222-0002-0000-0000-000000000001', name: 'John Stone',       wrestler: 'Stone Cold Steve Austin', divisionIdx: 0 },
  { id: '22222222-0002-0000-0000-000000000002', name: 'Mike Rock',        wrestler: 'The Rock',                divisionIdx: 1 },
  { id: '22222222-0002-0000-0000-000000000003', name: 'Jake Undertaker',  wrestler: 'The Undertaker',          divisionIdx: 2 },
  { id: '22222222-0002-0000-0000-000000000004', name: 'Chris Helmsley',   wrestler: 'Triple H',                divisionIdx: 0 },
  { id: '22222222-0002-0000-0000-000000000005', name: 'Alex Michaels',    wrestler: 'Shawn Michaels',          divisionIdx: 1 },
  { id: '22222222-0002-0000-0000-000000000006', name: 'Sam Hart',         wrestler: 'Bret Hart',               divisionIdx: 2 },
  { id: '22222222-0002-0000-0000-000000000007', name: 'Dave Cena',        wrestler: 'John Cena',               divisionIdx: 0 },
  { id: '22222222-0002-0000-0000-000000000008', name: 'Randy Legend',     wrestler: 'Randy Orton',             divisionIdx: 1 },
  { id: '22222222-0002-0000-0000-000000000009', name: 'Adam Copeland',    wrestler: 'Edge',                    divisionIdx: 2 },
  { id: '22222222-0002-0000-0000-00000000000a', name: 'Phil Brooks',      wrestler: 'CM Punk',                 divisionIdx: 0 },
  { id: '22222222-0002-0000-0000-00000000000b', name: "Joe Anoa'i",       wrestler: 'Roman Reigns',            divisionIdx: 1 },
  { id: '22222222-0002-0000-0000-00000000000c', name: 'Colby Lopez',      wrestler: 'Seth Rollins',            divisionIdx: 2 },
];

const SEASON = {
  id: '33333333-0003-0000-0000-000000000001',
  name: 'Season 1',
  startDate: daysAgo(30),
};

const CHAMPIONSHIPS = [
  { id: '44444444-0004-0000-0000-000000000001', name: 'World Heavyweight Championship', type: 'singles' as const, divisionIdx: 0,   holders: [0] },
  { id: '44444444-0004-0000-0000-000000000002', name: 'Intercontinental Championship',  type: 'singles' as const, divisionIdx: null, holders: [1] },
  { id: '44444444-0004-0000-0000-000000000003', name: 'Tag Team Championship',          type: 'tag'    as const,  divisionIdx: null, holders: [2, 3] },
  { id: '44444444-0004-0000-0000-000000000004', name: 'United States Championship',     type: 'singles' as const, divisionIdx: 1,   holders: [4] },
];

const REIGNS = [
  { id: '55555555-0005-0000-0000-000000000001', championshipIdx: 0, wonDaysAgo: 30, defenses: 2 },
  { id: '55555555-0005-0000-0000-000000000002', championshipIdx: 1, wonDaysAgo: 25, defenses: 1 },
  { id: '55555555-0005-0000-0000-000000000003', championshipIdx: 2, wonDaysAgo: 20, defenses: 3 },
  { id: '55555555-0005-0000-0000-000000000004', championshipIdx: 3, wonDaysAgo: 15, defenses: 0 },
];

// Hardcoded match tuples: [player1Idx, player2Idx, winnerIdx (0 or 1), stipulationIdx, daysAgo]
const STIPULATIONS = ['Standard', 'No DQ', 'Steel Cage', 'Ladder Match', 'Hell in a Cell', 'Tables Match'];
const COMPLETED_MATCHES = [
  { id: '66666666-0006-0000-0000-000000000001', p1: 0,  p2: 1,  winner: 0, stip: 0, ago: 28 },
  { id: '66666666-0006-0000-0000-000000000002', p1: 2,  p2: 3,  winner: 1, stip: 1, ago: 24 },
  { id: '66666666-0006-0000-0000-000000000003', p1: 4,  p2: 5,  winner: 0, stip: 2, ago: 20 },
  { id: '66666666-0006-0000-0000-000000000004', p1: 6,  p2: 7,  winner: 1, stip: 3, ago: 17 },
  { id: '66666666-0006-0000-0000-000000000005', p1: 8,  p2: 9,  winner: 0, stip: 4, ago: 14 },
  { id: '66666666-0006-0000-0000-000000000006', p1: 10, p2: 11, winner: 1, stip: 5, ago: 10 },
  { id: '66666666-0006-0000-0000-000000000007', p1: 0,  p2: 2,  winner: 0, stip: 0, ago: 7  },
  { id: '66666666-0006-0000-0000-000000000008', p1: 1,  p2: 3,  winner: 0, stip: 1, ago: 5  },
];

const SCHEDULED_MATCHES = [
  { id: '66666666-0006-0000-0000-000000000009', p1: 0,  p2: 4,  stip: 0, ahead: 3,  matchType: 'singles' as const, isChampionship: true,  championshipIdx: 0 },
  { id: '66666666-0006-0000-0000-00000000000a', p1: 5,  p2: 6,  stip: 2, ahead: 7,  matchType: 'tag' as const,     isChampionship: false, championshipIdx: null },
  { id: '66666666-0006-0000-0000-00000000000b', p1: 7,  p2: 8,  stip: 3, ahead: 10, matchType: 'singles' as const, isChampionship: false, championshipIdx: null },
  { id: '66666666-0006-0000-0000-00000000000c', p1: 9,  p2: 10, stip: 4, ahead: 14, matchType: 'tag' as const,     isChampionship: false, championshipIdx: null },
];

const TOURNAMENTS = [
  {
    id: '77777777-0007-0000-0000-000000000001',
    name: 'King of the Ring 2024',
    type: 'single-elimination' as const,
    status: 'in-progress' as const,
    participantIdxs: [0, 1, 2, 3],
    brackets: {
      rounds: [
        { roundNumber: 1, matches: [
          { participant1Idx: 0, participant2Idx: 1, winnerIdx: 0 },
          { participant1Idx: 2, participant2Idx: 3, winnerIdx: 2 },
        ]},
        { roundNumber: 2, matches: [
          { participant1Idx: 0, participant2Idx: 2 },
        ]},
      ],
    },
    standings: null,
  },
  {
    id: '77777777-0007-0000-0000-000000000002',
    name: 'G1 Climax 2024',
    type: 'round-robin' as const,
    status: 'in-progress' as const,
    participantIdxs: [4, 5, 6, 7],
    brackets: null,
    standings: {
      byPlayerIdx: {
        '4': { wins: 2, losses: 1, draws: 0, points: 4 },
        '5': { wins: 2, losses: 1, draws: 0, points: 4 },
        '6': { wins: 1, losses: 2, draws: 0, points: 2 },
        '7': { wins: 1, losses: 2, draws: 0, points: 2 },
      },
    },
  },
];

const EVENTS = [
  {
    id: '88888888-0008-0000-0000-000000000001',
    name: 'WrestleMania 40',
    type: 'ppv' as const,
    dateFn: () => daysFromNow(14),
    venue: 'MetLife Stadium',
    description: 'The Showcase of the Immortals',
    themeColor: '#FFD700',
    status: 'upcoming' as const,
    fantasyEnabled: true,
    // Populated from SCHEDULED_MATCHES indices:
    cards: [
      { scheduledIdx: 0, designation: 'opener' },
      { scheduledIdx: 1, designation: 'midcard' },
      { scheduledIdx: 2, designation: 'main-event' },
    ],
  },
  {
    id: '88888888-0008-0000-0000-000000000002',
    name: 'Monday Night Raw #1580',
    type: 'weekly' as const,
    dateFn: () => daysAgo(7),
    venue: null,
    description: 'The longest running weekly episodic television show',
    themeColor: null,
    status: 'completed' as const,
    fantasyEnabled: true,
    // Populated from COMPLETED_MATCHES indices:
    completedCards: [
      { completedIdx: 0, designation: 'opener' },
      { completedIdx: 1, designation: 'midcard' },
      { completedIdx: 2, designation: 'main-event' },
    ],
  },
  {
    id: '88888888-0008-0000-0000-000000000003',
    name: 'Royal Rumble 2026',
    type: 'ppv' as const,
    dateFn: () => daysFromNow(30),
    venue: 'Alamodome',
    description: 'Every man for himself',
    themeColor: '#1E90FF',
    status: 'upcoming' as const,
    fantasyEnabled: true,
    cards: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Insert helpers
// ─────────────────────────────────────────────────────────────────────────────

async function seedAll(client: Client): Promise<Record<string, number>> {
  console.log('Seeding fixtures ...');
  const counts: Record<string, number> = {};

  // divisions
  for (const d of DIVISIONS) {
    await client.query(
      'INSERT INTO divisions (division_id, name, description) VALUES ($1, $2, $3)',
      [d.id, d.name, d.description]
    );
  }
  counts.divisions = DIVISIONS.length;

  // players
  for (const p of PLAYERS) {
    await client.query(
      'INSERT INTO players (player_id, name, current_wrestler, division_id) VALUES ($1, $2, $3, $4)',
      [p.id, p.name, p.wrestler, DIVISIONS[p.divisionIdx].id]
    );
  }
  counts.players = PLAYERS.length;

  // seasons
  await client.query(
    'INSERT INTO seasons (season_id, name, start_date, status) VALUES ($1, $2, $3, $4)',
    [SEASON.id, SEASON.name, SEASON.startDate, 'active']
  );
  counts.seasons = 1;

  // championships
  for (const c of CHAMPIONSHIPS) {
    await client.query(
      'INSERT INTO championships (championship_id, name, type, division_id, is_active) VALUES ($1, $2, $3, $4, $5)',
      [c.id, c.name, c.type, c.divisionIdx == null ? null : DIVISIONS[c.divisionIdx].id, true]
    );
  }
  counts.championships = CHAMPIONSHIPS.length;

  // tournaments
  for (const t of TOURNAMENTS) {
    const participantIds = t.participantIdxs.map(i => PLAYERS[i].id);
    await client.query(
      `INSERT INTO tournaments (tournament_id, name, type, status, participants, brackets, standings, season_id)
       VALUES ($1, $2, $3, $4, $5::uuid[], $6::jsonb, $7::jsonb, $8)`,
      [t.id, t.name, t.type, t.status, participantIds,
       t.brackets ? JSON.stringify(t.brackets) : null,
       t.standings ? JSON.stringify(t.standings) : null,
       SEASON.id]
    );
  }
  counts.tournaments = TOURNAMENTS.length;

  // events (insert first without match links; link via event_match_cards)
  for (const e of EVENTS) {
    await client.query(
      `INSERT INTO events (event_id, name, event_type, date, venue, description, theme_color, status, season_id, fantasy_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [e.id, e.name, e.type, e.dateFn(), e.venue, e.description, e.themeColor, e.status, SEASON.id, e.fantasyEnabled]
    );
  }
  counts.events = EVENTS.length;

  // matches
  for (const m of COMPLETED_MATCHES) {
    await client.query(
      `INSERT INTO matches (match_id, date, match_type, stipulation, is_championship, season_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [m.id, daysAgo(m.ago), 'singles', STIPULATIONS[m.stip], false, SEASON.id, 'completed']
    );
  }
  for (const m of SCHEDULED_MATCHES) {
    await client.query(
      `INSERT INTO matches (match_id, date, match_type, stipulation, is_championship, championship_id, season_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [m.id, daysFromNow(m.ahead), m.matchType, STIPULATIONS[m.stip], m.isChampionship,
       m.championshipIdx == null ? null : CHAMPIONSHIPS[m.championshipIdx].id,
       SEASON.id, 'scheduled']
    );
  }
  counts.matches = COMPLETED_MATCHES.length + SCHEDULED_MATCHES.length;

  // match_participants
  let participantRows = 0;
  for (const m of COMPLETED_MATCHES) {
    const p1Id = PLAYERS[m.p1].id;
    const p2Id = PLAYERS[m.p2].id;
    const p1Outcome = m.winner === 0 ? 'win' : 'loss';
    const p2Outcome = m.winner === 1 ? 'win' : 'loss';
    await client.query(
      'INSERT INTO match_participants (match_id, player_id, outcome) VALUES ($1, $2, $3), ($1, $4, $5)',
      [m.id, p1Id, p1Outcome, p2Id, p2Outcome]
    );
    participantRows += 2;
  }
  for (const m of SCHEDULED_MATCHES) {
    const p1Id = PLAYERS[m.p1].id;
    const p2Id = PLAYERS[m.p2].id;
    await client.query(
      'INSERT INTO match_participants (match_id, player_id, outcome) VALUES ($1, $2, $3), ($1, $4, $5)',
      [m.id, p1Id, 'pending', p2Id, 'pending']
    );
    participantRows += 2;
  }
  counts.match_participants = participantRows;

  // championship_reigns
  for (const r of REIGNS) {
    const c = CHAMPIONSHIPS[r.championshipIdx];
    await client.query(
      `INSERT INTO championship_reigns (reign_id, championship_id, won_date, lost_date, defenses)
       VALUES ($1, $2, $3, NULL, $4)`,
      [r.id, c.id, daysAgo(r.wonDaysAgo), r.defenses]
    );
  }
  counts.championship_reigns = REIGNS.length;

  // championship_reign_holders
  let holderRows = 0;
  for (const r of REIGNS) {
    const c = CHAMPIONSHIPS[r.championshipIdx];
    for (const holderIdx of c.holders) {
      await client.query(
        'INSERT INTO championship_reign_holders (reign_id, player_id) VALUES ($1, $2)',
        [r.id, PLAYERS[holderIdx].id]
      );
      holderRows += 1;
    }
  }
  counts.championship_reign_holders = holderRows;

  // season_standings — deterministic numbers per player index
  for (let i = 0; i < PLAYERS.length; i++) {
    await client.query(
      'INSERT INTO season_standings (season_id, player_id, wins, losses, draws) VALUES ($1, $2, $3, $4, $5)',
      [SEASON.id, PLAYERS[i].id, (i % 5) + 1, (i % 4), (i % 3 === 0) ? 1 : 0]
    );
  }
  counts.season_standings = PLAYERS.length;

  // event_match_cards
  let cardRows = 0;
  const wrestlemania = EVENTS[0];
  for (let i = 0; i < wrestlemania.cards!.length; i++) {
    const card = wrestlemania.cards![i];
    await client.query(
      'INSERT INTO event_match_cards (event_id, match_id, position, designation) VALUES ($1, $2, $3, $4)',
      [wrestlemania.id, SCHEDULED_MATCHES[card.scheduledIdx].id, i + 1, card.designation]
    );
    cardRows += 1;
  }
  const raw1580 = EVENTS[1];
  for (let i = 0; i < raw1580.completedCards!.length; i++) {
    const card = raw1580.completedCards![i];
    await client.query(
      'INSERT INTO event_match_cards (event_id, match_id, position, designation) VALUES ($1, $2, $3, $4)',
      [raw1580.id, COMPLETED_MATCHES[card.completedIdx].id, i + 1, card.designation]
    );
    cardRows += 1;
  }
  counts.event_match_cards = cardRows;

  return counts;
}

function printSummary(counts: Record<string, number>): void {
  console.log('\nSeed summary:');
  const pad = (s: string) => s.padEnd(30);
  const order = [
    'divisions',
    'players',
    'seasons',
    'season_standings',
    'championships',
    'championship_reigns',
    'championship_reign_holders',
    'matches',
    'match_participants',
    'tournaments',
    'events',
    'event_match_cards',
  ];
  for (const t of order) {
    console.log(`  ${pad(t)}${counts[t] ?? 0} rows`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const url = requireUrl();

  console.log(`Target: ${describeTarget(url)}`);
  console.log(`Mode:   ${args.mode}`);

  if (!args.confirmed) {
    console.error('\nRefusing to run without --confirm. Destructive operations require explicit confirmation.');
    console.error('Re-run with --confirm once you have verified the target is a seed sandbox, not production data.');
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    if (args.mode === 'schema-only' || args.mode === 'schema+seed') {
      await runSchema(client);
    }
    if (args.mode === 'truncate') {
      await truncateAll(client);
    }
    if (args.mode !== 'schema-only') {
      const counts = await seedAll(client);
      printSummary(counts);
    }
    console.log('\nDone.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
