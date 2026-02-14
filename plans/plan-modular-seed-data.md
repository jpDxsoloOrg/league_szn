# Plan: Modular Consistent Seed Data Scripts

## Context

The current `backend/scripts/seed-data.ts` is a single 658-line function (`seedData()`) that seeds 16 DynamoDB tables in one monolithic pass. IDs are generated dynamically with `uuidv4()` at runtime and referenced within the same function scope, making it impossible to seed individual domains in isolation. The companion `clear-data.ts` is severely out of date, only clearing 5 of the 19 tables. Additionally, player win/loss/draw stats are randomly generated independently from actual match results, so the seeded data is internally inconsistent. Three more tables exist in the system (Challenges, Promos, Stipulations, MatchTypes) that have no seed data at all.

The goal is to decompose seeding into domain-specific modules with deterministic shared IDs exported from a central data file, ensure cross-table consistency (match results matching standings), update `clear-data.ts` to cover all tables, and add granular npm scripts.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/scripts/seed-data.ts` | Replace entirely | Remove monolithic function, replace with `seed-all.ts` orchestrator |
| `backend/scripts/clear-data.ts` | Modify | Update to clear all 19 tables (currently only clears 5) |
| `backend/package.json` | Modify | Add granular npm scripts for each seed module |
| `backend/scripts/seed/ids.ts` | Create | Central file with deterministic UUIDs for all entities |
| `backend/scripts/seed/db-client.ts` | Create | Shared DynamoDB client and `putItem` helper (extracted from lines 1-104 of current seed-data.ts) |
| `backend/scripts/seed/seed-core.ts` | Create | Seeds Divisions, Players, Seasons (foundation entities) |
| `backend/scripts/seed/seed-matches.ts` | Create | Seeds Matches with consistent results tied to standings |
| `backend/scripts/seed/seed-championships.ts` | Create | Seeds Championships and Championship History |
| `backend/scripts/seed/seed-tournaments.ts` | Create | Seeds Tournaments |
| `backend/scripts/seed/seed-events.ts` | Create | Seeds Events and links matches to events |
| `backend/scripts/seed/seed-contenders.ts` | Create | Seeds Contender Rankings and Ranking History |
| `backend/scripts/seed/seed-fantasy.ts` | Create | Seeds Fantasy Config and Wrestler Costs |
| `backend/scripts/seed/seed-config.ts` | Create | Seeds Site Config, Stipulations, Match Types |
| `backend/scripts/seed/seed-standings.ts` | Create | Seeds Season Standings derived from actual match data |
| `backend/scripts/seed-all.ts` | Create | Master orchestrator that runs modules in dependency order |

## Implementation Steps

### Step 1: Create the shared ID registry (`backend/scripts/seed/ids.ts`)

**What**: Define a single exported object containing pre-generated deterministic UUIDs for every entity that will be referenced across modules. This includes 12 player IDs, 3 division IDs, 1 season ID, 4 championship IDs, 12+ match IDs, 2 tournament IDs, 3 event IDs.

**Why**: The current code (lines 112-153 of seed-data.ts) generates IDs with `uuidv4()` inline. These IDs are then used on lines 197, 217, 249, 279, 315, 334, etc. to build cross-table relationships. By pre-generating and exporting fixed IDs, each domain module can import only the IDs it needs without depending on another module's runtime output.

**Details**: Use `uuidv4()` at module evaluation time (not inside a function). Export named constants grouped by domain: `PLAYER_IDS`, `DIVISION_IDS`, `SEASON_IDS`, `CHAMPIONSHIP_IDS`, `MATCH_IDS`, `TOURNAMENT_IDS`, `EVENT_IDS`. Also export the raw data arrays (wrestlers, playerNames, stipulations) currently on lines 43-73.

### Step 2: Extract the DB client and utilities (`backend/scripts/seed/db-client.ts`)

**What**: Extract the DynamoDB client setup (lines 1-23) and `putItem` helper (lines 95-104) into a shared module. Also extract utility functions `daysAgo` (line 75), `daysFromNow` (line 81), and `getISOWeekKey` (line 87).

**Why**: Currently duplicated between `seed-data.ts` and `clear-data.ts` (which has its own client on lines 9-18). A single source eliminates drift. The `isLocal` check (line 8) and table name constants (lines 25-41) should also be centralized here.

**Details**: Export `docClient`, `putItem`, `daysAgo`, `daysFromNow`, `getISOWeekKey`, and a `TABLES` constant. The `TABLES` constant should use the same naming pattern as `backend/lib/dynamodb.ts` line 115 (the `TableNames` export), but hardcoded for local dev since scripts run outside serverless context. Consider accepting a stage parameter to support `devtest` table names too.

### Step 3: Create `seed-core.ts` (Divisions, Players, Seasons)

**What**: Seed the three foundation entities that everything else depends on. This corresponds to lines 110-172 of the current seed-data.ts.

**Why**: Players reference division IDs (line 150), matches reference player IDs and season IDs, championships reference player IDs. These must exist first.

**Details**: Import `DIVISION_IDS`, `PLAYER_IDS`, `SEASON_IDS` from ids.ts. Build deterministic player data (no random wins/losses/draws -- set them all to 0 since the actual tallies should come from match results). The current code randomly generates wins (line 148: `Math.floor(Math.random() * 15) + 3`) which creates inconsistency with actual match results. Initialize players with `wins: 0, losses: 0, draws: 0` and let match seeding compute correct values.

### Step 4: Create `seed-matches.ts` (Matches)

**What**: Seed completed and scheduled matches, corresponding to lines 256-324 of current seed-data.ts. Critically, track the actual win/loss/draw tallies for each player based on match outcomes.

**Why**: Currently matches use random player pairings (lines 265-268) and random winners (line 271), but the player records (lines 148-149) are generated independently. This means a player might show 15 wins but only appear as winner in 2 matches. The new module must export a computed standings map so that `seed-standings.ts` and player updates can use consistent numbers.

**Details**: Use deterministic match pairings instead of random. Define specific matchups in the data file so results are reproducible across seed runs. Export a function `getComputedStandings()` that returns `{ [playerId]: { wins, losses, draws } }` after computing from the seeded match results. After seeding matches, update player records in the Players table with correct tallies.

### Step 5: Create `seed-championships.ts` (Championships, Championship History)

**What**: Seed championships (lines 190-234) and championship history (lines 241-254). Championships reference player IDs as `currentChampion` and division IDs as `divisionId`.

**Why**: Championship data needs player IDs to exist. The championship history `matchId` on line 249 currently generates a random UUID that does not correspond to any actual match -- it should reference a real match ID from the matches module.

**Details**: Import player and division IDs from ids.ts. Create championship match IDs that are also in the matches data. Ensure championship history `champion` field matches `currentChampion` on the championship itself.

### Step 6: Create `seed-tournaments.ts` (Tournaments)

**What**: Seed tournaments, corresponding to lines 326-386. Tournaments reference player IDs in `participants` and `brackets.rounds[].matches[].participant1/participant2/winner`.

**Why**: Tournament standings (lines 373-377) use dynamic player ID keys. These must use the deterministic IDs from ids.ts.

**Details**: Import `PLAYER_IDS` and `TOURNAMENT_IDS` from ids.ts. The bracket/standings structure is deeply nested and player-ID-dependent, so all references must use the shared constants.

### Step 7: Create `seed-events.ts` (Events)

**What**: Seed events (lines 388-469). Events reference match IDs in `matchCards[].matchId`, season ID in `seasonId`, and event IDs that get back-linked to matches via `eventId`.

**Why**: Events depend on both matches and seasons existing. The current code re-saves matches after linking (lines 466-468), which is fragile. Better to have matches include `eventId` from the start.

**Details**: Import match IDs and event IDs from ids.ts. Instead of the current pattern of creating matches first, then events, then re-saving matches (lines 458-468), pre-assign `eventId` to matches in `seed-matches.ts` using the shared event IDs. This eliminates the double-write issue.

### Step 8: Create `seed-contenders.ts` (Contender Rankings, Ranking History)

**What**: Seed contender rankings (lines 471-534) and ranking history (lines 536-556). Rankings reference championship IDs and player IDs.

**Why**: Rankings filter players by division (line 474: `players.filter(p => p.divisionId === divisions[0].divisionId)`) and exclude current champions (line 477). The module needs to know which players are in which divisions and who holds which title.

**Details**: Import championship IDs, player IDs, and division IDs from ids.ts. The division assignment logic (player index % 3) must match seed-core.ts exactly, which is guaranteed by using the shared data file.

### Step 9: Create `seed-fantasy.ts` (Fantasy Config, Wrestler Costs)

**What**: Seed fantasy configuration (lines 558-579) and wrestler costs (lines 581-612). Wrestler costs reference player IDs and derive from player win/loss records.

**Why**: Wrestler costs currently use player `wins/losses/draws` from the randomly generated values (line 584-585). They should use the consistent values computed from actual match results.

**Details**: Import player IDs from ids.ts. Import computed standings from `seed-matches.ts` to calculate accurate `winRate` and `currentCost` values. The formula on lines 586-588 can remain but should use real data.

### Step 10: Create `seed-config.ts` (Site Config, Stipulations, Match Types)

**What**: Seed site configuration (lines 614-629) plus new seed data for Stipulations table and MatchTypes table, which currently have zero seed data despite having table definitions in serverless.yml.

**Why**: These tables exist in the infrastructure but are not seeded, meaning local development for features that depend on them requires manual data creation.

**Details**: For stipulations, use the existing `stipulations` array (line 73) as the source of truth. For match types, seed common types: singles, tag, triple-threat, fatal-four-way, battle-royal, handicap. Each should have a `stipulationId`/`matchTypeId` (from ids.ts), name, and description.

### Step 11: Create `seed-standings.ts` (Season Standings)

**What**: Seed season standings (lines 174-187) using data derived from completed matches in the active season, not random values.

**Why**: Current code generates random season standings (line 180-183) independent of actual match results. A player could have 8 season wins in standings but only 2 matches in the season.

**Details**: Import match data to compute per-season stats. Filter matches by `seasonId` and `status === 'completed'`, tally wins/losses/draws per player, and seed those exact numbers. This module depends on seed-matches completing first.

### Step 12: Create `seed-all.ts` (Master Orchestrator)

**What**: A new entry point that imports and executes each domain seed module in the correct dependency order, replacing the current `seed-data.ts`.

**Why**: Allows running all seeds together with a single command while also supporting individual domain seeding.

**Details**: Execution order must be:
1. `seed-core` (divisions, players, seasons) -- no dependencies
2. `seed-championships` (needs player IDs, division IDs)
3. `seed-matches` (needs player IDs, season IDs, championship IDs) -- also updates player tallies
4. `seed-standings` (needs match results, season IDs, player IDs)
5. `seed-tournaments` (needs player IDs)
6. `seed-events` (needs match IDs, season IDs) -- also updates matches with eventId
7. `seed-contenders` (needs championship IDs, player IDs, division assignments)
8. `seed-fantasy` (needs player IDs, computed standings)
9. `seed-config` (no dependencies, can run anytime)

Each module should export a named async function (e.g., `seedCore()`, `seedMatches()`) so the orchestrator can call them sequentially with `await`.

### Step 13: Update `clear-data.ts` to cover all 19 tables

**What**: The current `clear-data.ts` only clears 5 tables (Players, Matches, Championships, ChampionshipHistory, Tournaments on lines 20-26). Add the remaining 14 tables: Seasons, SeasonStandings, Divisions, Events, ContenderRankings, RankingHistory, FantasyConfig, WrestlerCosts, FantasyPicks, SiteConfig, Challenges, Promos, Stipulations, MatchTypes.

**Why**: Running `npm run clear-data` then `npm run seed` currently leaves orphan data in 14 tables, causing data integrity issues during development.

**Details**: Import the shared `TABLES` constant from `db-client.ts`. Add the missing `clearTable()` calls with correct key schemas:
- Seasons: `['seasonId']`
- SeasonStandings: `['seasonId', 'playerId']`
- Divisions: `['divisionId']`
- Events: `['eventId']`
- ContenderRankings: `['championshipId', 'playerId']`
- RankingHistory: `['playerId', 'weekKey']`
- FantasyConfig: `['configKey']`
- WrestlerCosts: `['playerId']`
- FantasyPicks: `['eventId', 'fantasyUserId']`
- SiteConfig: `['configKey']`
- Challenges: `['challengeId']`
- Promos: `['promoId']`
- Stipulations: `['stipulationId']`
- MatchTypes: `['matchTypeId']`

Also update the client to use the shared `db-client.ts` instead of its own inline client (lines 9-18).

### Step 14: Update `package.json` with granular scripts

**What**: Add individual seed scripts alongside the existing `"seed"` command.

**Why**: Developers need to seed specific domains when testing individual features without running the full script.

**Details**: Add to `scripts` in `backend/package.json`:
- `"seed": "ts-node scripts/seed-all.ts"`
- `"seed:core": "ts-node scripts/seed/seed-core.ts"`
- `"seed:matches": "ts-node scripts/seed/seed-matches.ts"`
- `"seed:championships": "ts-node scripts/seed/seed-championships.ts"`
- `"seed:tournaments": "ts-node scripts/seed/seed-tournaments.ts"`
- `"seed:events": "ts-node scripts/seed/seed-events.ts"`
- `"seed:contenders": "ts-node scripts/seed/seed-contenders.ts"`
- `"seed:fantasy": "ts-node scripts/seed/seed-fantasy.ts"`
- `"seed:config": "ts-node scripts/seed/seed-config.ts"`
- `"seed:standings": "ts-node scripts/seed/seed-standings.ts"`

Each individual script file should have a `if (require.main === module)` guard so it can run standalone but also be imported by `seed-all.ts`.

### Step 15: Update `backend/functions/admin/seedData.ts` Lambda

**What**: The admin Lambda seed endpoint (`backend/functions/admin/seedData.ts`) duplicates the same wrestlers/playerNames arrays (lines 6-35) and likely has similar monolithic seeding logic. It should import from the shared seed modules.

**Why**: Keeping two copies of seed data means they will diverge. The Lambda version should reuse the same data definitions.

**Details**: Refactor to import shared data from `scripts/seed/ids.ts` and call the same domain seed functions. This may require the seed modules to accept a `docClient` parameter rather than using a hardcoded local endpoint.

## Dependencies & Order

The dependency graph for seeding is:

```
seed-core (divisions, players, seasons)
  |
  +-- seed-championships (needs players, divisions)
  |     |
  |     +-- seed-matches (needs players, seasons, championships)
  |           |
  |           +-- seed-standings (needs match results)
  |           +-- seed-events (needs matches, seasons)
  |           +-- seed-fantasy (needs players, match-derived stats)
  |
  +-- seed-tournaments (needs players)
  |
  +-- seed-contenders (needs championships, players, divisions)

seed-config (independent -- no entity dependencies)
```

Build order for the files themselves:
1. `db-client.ts` and `ids.ts` first (shared infrastructure)
2. Domain modules in any order (they only depend on shared files)
3. `seed-all.ts` last (imports all domain modules)
4. `clear-data.ts` update (only needs db-client.ts)
5. `package.json` update (just adding script entries)

## Testing & Verification

1. **Run `npm run clear-data` then `npm run seed`** and verify no errors. Check console summary matches expected counts.
2. **Cross-table consistency check**: After seeding, scan the Players table and sum all `wins` values. Scan the Matches table for `status === 'completed'`, count winner entries. These two numbers must match. Similarly for losses and draws.
3. **Season standings consistency**: Sum season standings wins for the active season. Compare against completed matches that have `seasonId` set. Must match.
4. **Championship consistency**: For each championship, verify `currentChampion` in Championships table appears as the most recent entry (by `wonDate`) in ChampionshipHistory table with no `lostDate`.
5. **Individual module testing**: Run `npm run seed:core` alone, verify divisions/players/seasons exist. Then run `npm run seed:matches` and verify matches reference valid player IDs and season IDs.
6. **Idempotency**: Running `npm run seed` twice without clearing should either overwrite cleanly (DynamoDB PutCommand overwrites by default) or warn about existing data. Since `putItem` uses PutCommand (line 97), repeated runs will overwrite -- this is acceptable.
7. **Clear-data completeness**: Run `npm run clear-data`, then scan all 19 tables to verify zero items in each.
8. **Referential integrity spot checks**:
   - Every `match.participants[]` entry exists in Players table
   - Every `match.seasonId` exists in Seasons table
   - Every `match.championshipId` exists in Championships table
   - Every `event.matchCards[].matchId` exists in Matches table
   - Every `contenderRanking.playerId` exists in Players table
   - Every `wrestlerCost.playerId` exists in Players table

## Risks & Edge Cases

1. **Breaking the existing `npm run seed` command**: The current `package.json` points `"seed"` at `scripts/seed-data.ts` (line 12). Changing this to `scripts/seed-all.ts` must happen atomically with creating the new file. The old `seed-data.ts` should be deleted to avoid confusion, but only after `seed-all.ts` is verified working.
2. **Admin Lambda coupling**: `backend/functions/admin/seedData.ts` duplicates seed logic for use as an API endpoint. If it imports from `scripts/seed/`, those files become part of the Lambda deployment bundle. This may increase bundle size. Alternative: keep the Lambda as-is for now and mark it for separate refactoring, or ensure the seed modules are tree-shakeable.
3. **Deterministic vs. random data**: The current seed generates random wins/losses and random match pairings. Moving to deterministic data means every `npm run seed` produces identical data. This is a feature for consistency testing but means developers cannot get varied data by re-running. Consider adding an optional `--randomize` flag in a future iteration.
4. **Stage-dependent table names**: The `TABLES` constant in seed-data.ts hardcodes `-dev` suffix (line 26). For seeding `devtest`, table names need `-devtest`. The shared `db-client.ts` should accept a `--stage` CLI argument to construct table names dynamically.
5. **Individual module dependencies**: Running `npm run seed:matches` without first running `seed:core` will insert matches referencing non-existent player IDs. Individual modules should document their prerequisites clearly.
6. **clear-data.ts only works locally**: The current `clear-data.ts` hardcodes `endpoint: 'http://localhost:8000'` (line 11) without the `isLocal` check that `seed-data.ts` has (line 8). The refactored version via `db-client.ts` should support both local and remote, but clearing production data should require explicit confirmation.
7. **The `matchId` in championship history**: Currently line 249 generates a random UUID for `matchId` in championship history entries. These should reference actual match IDs from the matches module to maintain referential integrity.
8. **Event-Match double write**: The current code (lines 458-468) seeds matches first, then events, then re-saves matches with `eventId`. The new approach should pre-assign `eventId` to relevant matches in `seed-matches.ts`, but this creates a circular dependency (matches need event IDs, events need match IDs). Solve by defining both sets of IDs in `ids.ts`.
