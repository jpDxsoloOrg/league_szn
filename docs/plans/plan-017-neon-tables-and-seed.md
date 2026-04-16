# Plan 017 — Neon Tables + Seed Script (Exploratory)

**Status:** plan only. No code gets written by this document.
**Prerequisite memo:** [plan-016-database-improvement-eval.md](plan-016-database-improvement-eval.md)
**Goal:** stand up the core relational tables on Neon and seed them with the same fixture data the Dynamo seed uses today, so the owner can inspect the shape, run a few hand-written SQL queries against it, and confirm the memo's "the code gets simpler" claim before committing to a full migration.

This is a **look-and-see** pass. It does **not** touch any Lambda handler, API route, `serverless.yml`, frontend code, or CI. It creates a single self-contained subdirectory, an isolated database, and one command to populate it.

---

## 1. Scope

### In scope (this plan)
- Create a Neon project + branch (manual, outside the repo).
- Add `backend/neon/` with: `schema.sql`, `seed.ts`, `README.md`, `.env.example`.
- Define DDL for **11 core tables** — enough to represent the data that the hardest current handlers (`recordResult.ts`, `getStandings.ts`, `getDashboard.ts`, `getRivalries.ts`) touch.
- Port the existing fixtures from [backend/scripts/seed-data.ts](../../backend/scripts/seed-data.ts) into a single Node seeder that writes to Neon.
- Document how to run the seeder and how to inspect the result (Neon SQL console, or `psql`).

### Explicitly out of scope
- The remaining ~25 Dynamo tables (Challenges, Promos, Fantasy, Stables, TagTeams, Events sub-features, Storylines, Presence, etc.). These follow in later plans once the core shape is approved.
- Any ORM or query-builder choice (Drizzle vs Kysely vs raw). Seed script uses **raw SQL via `@neondatabase/serverless`** to stay tool-agnostic.
- Lambda integration, connection pooling strategy, or any runtime code change.
- A Dynamo → Neon production data migration path. This seed uses synthetic fixtures only.
- Tests. This is an exploration; a real migration will need a test plan, but not this plan.

### Primary success criteria
1. Running one command populates a Neon database with the equivalent of today's seed.
2. The owner can open the Neon SQL console and write `SELECT` statements that answer access patterns #1 (standings), #4 (rivalries), and #7 (current champion reign) from the memo in **under 10 lines of SQL each**.
3. Nothing in the rest of the repo changes — deleting `backend/neon/` leaves the app in its current state.

---

## 2. Directory & file layout

Create a new subdirectory, untouched by the Lambda build:

```
backend/neon/
├── README.md          # Setup + run instructions
├── schema.sql         # DDL for the 11 tables (drop-and-recreate)
├── seed.ts            # Applies schema.sql, then inserts fixtures
└── .env.example       # Shows NEON_DATABASE_URL placeholder
```

Also:
- Append `backend/.env.neon` to `.gitignore` (owner's real connection string goes here; not committed).
- Add one devDependency: `@neondatabase/serverless` (Neon's HTTP driver, works in Node + edge, no native `pg` build step).
- Add two scripts to [backend/package.json](../../backend/package.json):
  - `"neon:schema": "ts-node neon/seed.ts --schema-only"`
  - `"neon:seed": "ts-node neon/seed.ts"`

The `serverless-plugin-typescript` build already excludes files outside `functions/`, so nothing in `backend/neon/` ships to Lambda. Confirm this assumption while implementing; if it does get picked up, add `backend/neon/**` to the `exclude` list in [backend/tsconfig.json](../../backend/tsconfig.json) or the plugin config.

---

## 3. Neon account setup (manual, owner does this once)

Not code. Document these steps in `backend/neon/README.md`:

1. Create a free Neon account at neon.tech.
2. Create a project named `leagueszn`. Default region `us-east-1` (matches the Lambda region — cuts future latency noise).
3. In the project, create a branch called `seed-sandbox` off `main`. **Run the seeder against `seed-sandbox`, never `main`.** Branching is free and each branch has its own isolated data — this is the whole reason to pick Neon for the first look.
4. Copy the pooled connection string (the one labelled "Pooled connection" in the Neon console) into `backend/.env.neon` as:
   ```
   NEON_DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
   ```
5. (Optional) Install the `neonctl` CLI or the Neon VS Code extension for quicker inspection.

---

## 4. Schema design decisions

The DDL is not written in this plan, but the design choices that will land in `schema.sql` are. Every choice below is a place where the Postgres version intentionally differs from Dynamo, and seeing the difference is half the point of the exercise.

### 4.1 Eleven tables in `schema.sql`

| # | Table | Purpose | Key decision vs Dynamo |
|---|---|---|---|
| 1 | `divisions` | Roster brand (Raw, SmackDown, NXT) | 1:1 port. |
| 2 | `players` | League member + current wrestler | Drop `wins`/`losses`/`draws` counters — derive via `COUNT() GROUP BY` from `match_participants`. |
| 3 | `seasons` | Active/completed seasons | 1:1. `CHECK` constraint: only one row with `status='active'`. |
| 4 | `season_standings` | Per-season per-player W/L/D | Keep as materialized table for now (mirrors Dynamo). Later plan may replace with a view. |
| 5 | `championships` | Title definitions | **Drop `current_champion_id`.** Current holder is derived from `championship_reigns WHERE lost_date IS NULL`. This is the single most legible simplification in the whole schema. |
| 6 | `championship_reigns` | Renamed from `championship_history` | `reign_id UUID PK`, `championship_id FK`, `won_date`, `lost_date NULL`, `match_id FK NULL`. The open-reign query becomes `WHERE lost_date IS NULL`. |
| 7 | `championship_reign_holders` | Junction for tag team reigns | `(reign_id, player_id)`. Solves the Dynamo "`champion` is sometimes a string and sometimes an array" problem. |
| 8 | `matches` | Match metadata | Drop `participants`, `winners`, `losers` array columns. Move to `match_participants`. Keep `match_type`, `stipulation`, `is_championship`, `championship_id FK NULL`, `season_id FK NULL`, `tournament_id FK NULL`, `event_id FK NULL`, `status`. |
| 9 | `match_participants` | Junction: who was in the match and what happened | `(match_id, player_id, outcome)` where `outcome` is an enum: `'win' \| 'loss' \| 'draw' \| 'pending'`. Single source of truth for match results. All four of the hardest current queries collapse to one `JOIN match_participants` when this exists. |
| 10 | `tournaments` | Tournament records | Keep `brackets JSONB` and `standings JSONB` for now — tournament structure is genuinely tree-shaped and normalizing it is its own follow-up decision. |
| 11 | `events` | Shows / PPVs | Drop `match_cards` array. |
| +1 | `event_match_cards` | Junction for event → match ordering | `(event_id, match_id, position, designation, notes)`. |

That's 11 tables + 2 junctions that exist only because of normalization = **13 physical tables** in `schema.sql`. The "11 core" label refers to the logical entities.

### 4.2 Column conventions

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` — enable `pgcrypto` extension at the top of `schema.sql`.
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` on every table that had them in Dynamo.
- `snake_case` column names (postgres convention). The Dynamo code uses `camelCase`. The seed script handles the boundary translation — keeps SQL idiomatic without touching Dynamo.
- Enums (`match_status`, `season_status`, `participant_outcome`, `event_status`, `event_type`, `match_type`, `championship_type`) declared as Postgres `CREATE TYPE ... AS ENUM`. This is the first place the owner will see a real type-safety win over Dynamo string fields.
- Foreign keys use `ON DELETE` rules matched to current Dynamo cascade behaviors (e.g., delete a season → cascade to `season_standings`; delete a championship → cascade to `championship_reigns` → cascade to `championship_reign_holders`).
- Add **no** indexes beyond PKs and FKs in this first pass. The tables are small enough that a seq scan is instant; showing the schema without premature indexing makes it easier to read. Indexes get added in the plan that wires Lambda handlers to Neon.

### 4.3 `schema.sql` structure

```
-- Extensions
-- Drop tables (reverse dependency order, CASCADE)
-- Drop enums
-- Create enums
-- Create tables (dependency order: divisions → players → seasons → ...)
```

Idempotent: re-running the seed drops and recreates everything on the `seed-sandbox` branch. Never run against a Neon branch that isn't explicitly for seed data.

---

## 5. `seed.ts` behavior

### 5.1 Connection

- Uses `@neondatabase/serverless`'s `neon(url)` HTTP client, which works fine for a one-off seed from a dev machine. (It also matches the driver the Lambda migration would later use, so the owner sees how queries feel end-to-end.)
- Reads `NEON_DATABASE_URL` from `backend/.env.neon` via `dotenv`.

### 5.2 CLI surface

```
ts-node backend/neon/seed.ts                 # Apply schema, then seed
ts-node backend/neon/seed.ts --schema-only   # Apply schema, no seed
ts-node backend/neon/seed.ts --seed-only     # Seed only (assumes schema exists)
ts-node backend/neon/seed.ts --truncate      # Truncate all tables and re-seed without dropping
```

### 5.3 Data source

**Port the fixtures from [backend/scripts/seed-data.ts](../../backend/scripts/seed-data.ts) verbatim for the 11 tables in scope.** The same 12 players, 3 divisions, 1 season, 4 championships, 12 matches, 2 tournaments, 3 events. Only the **shape** changes:

- Match participants + winners + losers (three arrays in Dynamo) → one `match_participants` insert per participant, with `outcome` set from whichever of the three arrays they appeared in.
- Championship current_champion (scalar or array) → one row in `championship_reigns` per championship, plus one row in `championship_reign_holders` per holder (1 for singles, 2 for tag).
- Event `matchCards` array → one `event_match_cards` insert per card.
- Tournament `brackets` / `standings` objects → stored as `JSONB` literals (no restructuring).

Keep the randomness deterministic: seed `Math.random()` with a fixed value, or hardcode the variable parts. The Dynamo seed is non-deterministic; the Neon seed should be deterministic so that "run the seed and compare" actually works across attempts.

### 5.4 Output

On success, print a summary that **mirrors the Dynamo seed's summary** (same counts, same order), plus one extra line per table:

```
  divisions:                    3 rows
  players:                     12 rows
  seasons:                      1 row
  season_standings:            12 rows
  championships:                4 rows
  championship_reigns:          4 rows
  championship_reign_holders:   5 rows   (3 singles + 1 tag = 2 players)
  matches:                     12 rows
  match_participants:          24 rows
  tournaments:                  2 rows
  events:                       3 rows
  event_match_cards:            6 rows
```

This lets the owner spot-check "did I get the same data in" without opening the SQL console.

---

## 6. How the owner inspects the result

README documents three inspection paths:

1. **Neon SQL console** (browser). Paste queries directly.
2. **`psql "$NEON_DATABASE_URL"`** (if they have psql installed).
3. **VS Code SQL Tools / DataGrip / Postico** — connection string in hand.

Include three canned queries in the README, each answering a pattern from the memo in a handful of lines of SQL. Their presence is the proof that the exploration delivered what the memo promised:

- **All-time standings with wins/losses/draws** (memo access pattern #1). Should be ~6 lines of SQL: join `players` ← `match_participants` on wins/losses, group, order.
- **Rivalries: pairs with ≥3 matches** (memo access pattern #4). Should be ~8 lines. Self-join of `match_participants` on `match_id`, group by the player pair, `HAVING COUNT(*) >= 3`.
- **Current champion of each active championship** (memo access pattern #7). Should be ~5 lines: `championships` ← `championship_reigns` on `lost_date IS NULL` ← `championship_reign_holders` ← `players`.

Each canned query doubles as a sanity check — if one returns an empty result, the seed shape is wrong.

---

## 7. Implementation checklist (for the follow-up build)

This is what the next session (or `doIssue` agent) should do. Not part of this plan's deliverable.

- [ ] Create Neon project + `seed-sandbox` branch manually. Store connection string.
- [ ] `mkdir -p backend/neon`
- [ ] Write `backend/neon/schema.sql` per §4.
- [ ] Write `backend/neon/seed.ts` per §5, porting data from `backend/scripts/seed-data.ts`.
- [ ] Write `backend/neon/README.md` with setup, run commands, and the three canned queries from §6.
- [ ] Write `backend/neon/.env.example` with the one env var.
- [ ] Add `backend/.env.neon` to `.gitignore`.
- [ ] Add `@neondatabase/serverless` + `dotenv` to `backend/package.json` devDependencies.
- [ ] Add `neon:schema` and `neon:seed` scripts to `backend/package.json`.
- [ ] Confirm `backend/neon/**` is excluded from the serverless build output (skim `serverless-plugin-typescript` behavior in `backend/serverless.yml`; add explicit exclude if needed).
- [ ] Run `npm run neon:seed` once and paste the summary output + the three canned query results into the PR description.
- [ ] Do **not** change any file outside `backend/neon/`, `backend/package.json`, `backend/package-lock.json`, `backend/.gitignore`, and `backend/tsconfig.json` (only if the build-exclude adjustment is needed).

---

## 8. Verification

Before calling this follow-up work done:

- `git status` shows only the files listed above have changed. No handler, no `serverless.yml`, no frontend file.
- `npm run build` in `backend/` still succeeds without the Neon URL set (build must not depend on Neon).
- Running the seeder twice in a row succeeds and ends with the same row counts (idempotent).
- Each of the three canned SQL queries in the README runs and returns non-empty, plausible results.
- `grep -r "neon" backend/functions/` is empty (no accidental runtime coupling).

---

## 9. Risks & sharp edges

- **Connecting to the wrong Neon branch.** The seeder drops tables. If the owner ever points `NEON_DATABASE_URL` at a branch with real data, that data is gone. Mitigation: the README's first paragraph says "only point this at a branch named `seed-sandbox`"; the seeder itself logs the connection host and database name before doing anything destructive and requires a `--confirm` flag on re-runs to drop tables. (Design this into `seed.ts`.)
- **`@neondatabase/serverless` HTTP driver vs `pg`.** The HTTP driver batches statements differently from `pg`. For a one-shot seed this is fine, but a later plan that benchmarks query latency should switch to the pooled WebSocket driver or raw `pg` over the pooler for realistic numbers.
- **Enum drift.** If the Dynamo seed ever uses a `status` or `matchType` value that isn't in the enum, the insert fails. First seed run may surface missing enum values — just widen the enum; don't drop it.
- **Tournament JSONB.** Not normalizing tournaments means SQL queries over bracket progression are still awkward. That's intentional here — normalization is a decision for after the owner has seen the rest of the shape.

---

## 10. Open questions for the owner

1. **Neon region:** use `us-east-1` to match Lambda, or `us-east-2` if the owner prefers a different default? (Memo assumed `us-east-1`.)
2. **Fixture determinism:** port the Dynamo seed's randomness exactly, or lock it to a fixed seed so row contents match across runs? (Plan assumes fixed seed — confirm.)
3. **Tournament shape:** keep as `JSONB` for this first pass (plan's assumption), or surface tournament matches as first-class rows now? (Later plan if deferred.)
4. **Match outcome enum:** include `'disqualification'`, `'no-contest'`, `'count-out'` as separate enum values, or stay with `win/loss/draw/pending` for the first pass? (Plan assumes the 4-value enum — this is where schema discussions go on forever; call it and iterate.)

Any of these the owner wants to flip before the implementation session starts? Otherwise the defaults stand.
