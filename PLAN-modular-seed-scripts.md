# Plan: Modular Consistent Seed Data Scripts

## Goal
Refactor the monolithic 660-line `seed-data.ts` into separate, composable seed scripts per feature domain with cross-table data consistency.

## Current Problems
1. **Monolithic**: One 660-line function seeds everything — can't seed just one feature
2. **Inconsistent data**: Player W/L/D stats are random, not derived from match outcomes. Season standings are also random and unrelated to matches.
3. **Championship history matchIds** are random UUIDs not linked to actual matches
4. **clear-data.ts only handles 5 of 16 tables** — leaves stale data on re-seed
5. **Own DynamoDB client** — seed/clear scripts don't reuse `lib/dynamodb.ts`
6. **Non-deterministic IDs** — UUIDs regenerated every run, can't reference across independent scripts

## New File Structure

```
backend/scripts/seed/
├── shared.ts              # DynamoDB client, table names, helpers, fixed entity IDs
├── seed-core.ts           # Divisions + Players + Seasons (foundation data)
├── seed-championships.ts  # Championships + ChampionshipHistory
├── seed-matches.ts        # Matches + derived Player W/L/D + derived SeasonStandings
├── seed-events.ts         # Events (links matches to events)
├── seed-tournaments.ts    # Tournaments
├── seed-contenders.ts     # ContenderRankings + RankingHistory
├── seed-fantasy.ts        # FantasyConfig + WrestlerCosts
├── seed-config.ts         # SiteConfig
└── seed-all.ts            # Master orchestrator (runs all in dependency order)
```

Updated:
```
backend/scripts/clear-data.ts  # Updated to clear ALL 16 tables
```

## Dependency Order (seed-all.ts execution)

```
Step 1: seed-core       → Divisions, Players, Seasons (no deps)
Step 2: seed-config      → SiteConfig (no deps, can run parallel with step 1)
Step 3: seed-championships → Championships + History (needs Players, Divisions)
Step 4: seed-matches     → Matches + Player stats + SeasonStandings (needs Players, Seasons, Championships)
Step 5: seed-events      → Events (needs Matches, Seasons)
Step 6: seed-tournaments → Tournaments (needs Players)
Step 7: seed-contenders  → Rankings + History (needs Championships, Players)
Step 8: seed-fantasy     → FantasyConfig + WrestlerCosts (needs Players)
```

## Key Design Decisions

### 1. Fixed Deterministic IDs (shared.ts)
All entity IDs will be pre-defined constants (still UUIDs, but fixed) exported from `shared.ts`:
- `DIVISION_IDS = { raw: 'fixed-uuid-1', smackdown: 'fixed-uuid-2', nxt: 'fixed-uuid-3' }`
- `PLAYER_IDS = { player1: 'fixed-uuid-...', ... }` (12 players)
- `SEASON_IDS = { season1: 'fixed-uuid-...' }`
- `CHAMPIONSHIP_IDS = { worldHeavyweight: '...', intercontinental: '...', tagTeam: '...', unitedStates: '...' }`
- etc.

This lets any script reference entities from another domain without needing to run that script first (IDs are known at import time).

### 2. Consistent Match-Derived Stats (seed-matches.ts)
Instead of random W/L/D, `seed-matches.ts` will:
1. Define specific match outcomes (8 completed matches with explicit winners/losers)
2. **Calculate** player all-time W/L/D from those outcomes
3. **Calculate** season standings from season-assigned matches
4. Write matches, then update Players table with derived stats, then write SeasonStandings

This solves the core consistency problem: if Player A wins 3 matches in Season 1, their SeasonStandings entry shows 3 wins, and their Players record reflects those wins too.

### 3. Championship History Linked to Real Matches
`seed-championships.ts` will create championship history entries that reference actual match IDs (from the shared constants), not random UUIDs.

### 4. Shared DynamoDB Client
`shared.ts` will create the DynamoDB client once (supporting both local and remote via `IS_OFFLINE`/`STAGE` env vars). All domain scripts import from shared.

### 5. Each Script is Independently Runnable
Each `seed-*.ts` can be run standalone via `ts-node`. It imports shared IDs and the DB client, then seeds its own tables. Running standalone assumes prerequisite tables already have data (or the script handles missing refs gracefully).

## Updated clear-data.ts
Will clear **all 16 tables** (up from 5):
- Players, Matches, Championships, ChampionshipHistory, Tournaments
- Seasons, SeasonStandings, Divisions
- Events, ContenderRankings, RankingHistory
- FantasyConfig, WrestlerCosts, FantasyPicks
- SiteConfig

Will also support remote AWS (not hardcoded to local).

## New NPM Scripts (package.json)

```json
"seed": "ts-node scripts/seed/seed-all.ts",
"seed:core": "ts-node scripts/seed/seed-core.ts",
"seed:championships": "ts-node scripts/seed/seed-championships.ts",
"seed:matches": "ts-node scripts/seed/seed-matches.ts",
"seed:events": "ts-node scripts/seed/seed-events.ts",
"seed:tournaments": "ts-node scripts/seed/seed-tournaments.ts",
"seed:contenders": "ts-node scripts/seed/seed-contenders.ts",
"seed:fantasy": "ts-node scripts/seed/seed-fantasy.ts",
"seed:config": "ts-node scripts/seed/seed-config.ts",
"clear-data": "ts-node scripts/clear-data.ts",
"reset": "ts-node scripts/clear-data.ts && ts-node scripts/seed/seed-all.ts"
```

## Data Consistency Guarantees

| Relationship | How Enforced |
|---|---|
| Player W/L/D matches completed match outcomes | Calculated in seed-matches.ts from match results |
| SeasonStandings matches season-assigned match outcomes | Calculated in seed-matches.ts from matches with seasonId |
| Championship currentChampion matches latest history entry | Same player ID used in both, set in seed-championships.ts |
| Championship history matchId references real match | Uses shared MATCH_IDS constants |
| Event matchCards reference real matches | Uses shared MATCH_IDS constants |
| Matches reference real event via eventId | Set in seed-events.ts after event creation |
| Contender rankings exclude current champions | Filtered using shared CHAMPIONSHIP data |
| Wrestler costs reflect actual win rates | Calculated from real match outcomes |

## What Gets Deleted
- `backend/scripts/seed-data.ts` — replaced by `backend/scripts/seed/` directory
- The old `"seed"` npm script is updated to point to the new location
