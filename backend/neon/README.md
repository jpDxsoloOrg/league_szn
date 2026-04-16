# `backend/neon/` — Exploratory Postgres schema

Standalone sandbox for evaluating Neon Postgres against the DynamoDB status quo.
**Nothing in here is wired into the Lambda runtime.** Delete the folder and the app still works.

See the memo that motivated this work: [plan-016-database-improvement-eval.md](../../docs/plans/plan-016-database-improvement-eval.md)
See the plan that defined this work: [plan-017-neon-tables-and-seed.md](../../docs/plans/plan-017-neon-tables-and-seed.md)

---

## What's here

| File | Purpose |
|---|---|
| `schema.sql` | DDL for the 12 core tables (9 entities + 3 junctions). Safe to re-run — drops everything first. |
| `seed.ts`    | Applies `schema.sql`, then inserts deterministic fixtures ported from `backend/scripts/seed-data.ts`. |
| `.env.example` | Shows the one environment variable (`NEON_DATABASE_URL`) the seeder needs. |

The 12 tables: `divisions`, `players`, `seasons`, `season_standings`, `championships`, `championship_reigns`, `championship_reign_holders`, `matches`, `match_participants`, `tournaments`, `events`, `event_match_cards`.

---

## One-time setup

1. **Create a Neon project.** Sign up at https://neon.tech and create a project called `leagueszn`, region `us-east-1` (matches Lambda).
2. **Create a branch called `seed-sandbox`** inside that project. Seeding drops tables — never run it against a branch that has data you care about. Branching in Neon is free and each branch has isolated data.
3. **Copy the pooled connection string** for the `seed-sandbox` branch. It looks like:
   ```
   postgresql://<user>:<pw>@<host>-pooler.<region>.aws.neon.tech/neondb?sslmode=require
   ```
4. **Create `backend/neon/.env.neon`** (gitignored) and paste the string in:
   ```
   NEON_DATABASE_URL=postgresql://...
   ```
5. **Install the new devDependencies** (adds `pg`, `@types/pg`, `dotenv`):
   ```
   cd backend && npm install
   ```

---

## Running

All destructive operations require `--confirm`. The script prints the target host/database/user before doing anything; check that output before confirming.

```bash
# From backend/
npm run neon:seed -- --confirm              # Apply schema + seed
npm run neon:schema -- --confirm            # Apply schema only
npm run neon:seed -- --seed-only --confirm  # Seed only (schema must already exist)
npm run neon:seed -- --truncate --confirm   # TRUNCATE all tables and re-seed (keeps schema)
```

Expected output on a successful `neon:seed`:

```
Target: <host> / db=neondb / user=...
Mode:   schema+seed
Applying schema.sql ...
  schema applied.
Seeding fixtures ...

Seed summary:
  divisions                      3 rows
  players                       12 rows
  seasons                        1 rows
  season_standings              12 rows
  championships                  4 rows
  championship_reigns            4 rows
  championship_reign_holders     5 rows
  matches                       12 rows
  match_participants            24 rows
  tournaments                    2 rows
  events                         3 rows
  event_match_cards              6 rows
Done.
```

---

## Canned queries — the point of this sandbox

Each of these answers an access pattern from the memo that is currently implemented as a scan-plus-in-memory-join in a Lambda handler. If any of them returns empty or surprising results, the seed shape is wrong.

### 1. All-time standings with wins/losses/draws
Maps to memo access pattern #1 (`backend/functions/standings/getStandings.ts`).
```sql
SELECT p.name,
       p.current_wrestler,
       COUNT(*) FILTER (WHERE mp.outcome = 'win')  AS wins,
       COUNT(*) FILTER (WHERE mp.outcome = 'loss') AS losses,
       COUNT(*) FILTER (WHERE mp.outcome = 'draw') AS draws
FROM players p
LEFT JOIN match_participants mp ON mp.player_id = p.player_id
LEFT JOIN matches m ON m.match_id = mp.match_id AND m.status = 'completed'
GROUP BY p.player_id, p.name, p.current_wrestler
ORDER BY wins DESC, losses ASC;
```

### 2. Rivalries: pairs with ≥ 2 completed matches
Maps to memo access pattern #4 (`backend/functions/rivalries/getRivalries.ts`).
```sql
SELECT LEAST(a.player_id, b.player_id)    AS player_a,
       GREATEST(a.player_id, b.player_id) AS player_b,
       COUNT(*) AS meetings
FROM match_participants a
JOIN match_participants b
  ON a.match_id = b.match_id
 AND a.player_id < b.player_id
JOIN matches m ON m.match_id = a.match_id AND m.status = 'completed'
GROUP BY player_a, player_b
HAVING COUNT(*) >= 2
ORDER BY meetings DESC;
```
(Threshold lowered to 2 for the 8-match seed; the memo's production threshold is 3.)

### 3. Current champion of each active championship
Maps to memo access pattern #7 — the "lostDate does not exist" awkwardness disappears.
```sql
SELECT c.name AS championship,
       c.type,
       string_agg(p.name, ' & ' ORDER BY p.name) AS current_champion,
       r.won_date,
       r.defenses
FROM championships c
JOIN championship_reigns r         ON r.championship_id = c.championship_id AND r.lost_date IS NULL
JOIN championship_reign_holders h  ON h.reign_id = r.reign_id
JOIN players p                     ON p.player_id = h.player_id
WHERE c.is_active = TRUE
GROUP BY c.championship_id, c.name, c.type, r.won_date, r.defenses
ORDER BY c.name;
```

---

## Inspection tools

Any of these work once `NEON_DATABASE_URL` is set:

- **Neon SQL console** — browser, zero setup, paste queries. Fastest path.
- **psql** — `psql "$NEON_DATABASE_URL"` if you have it installed.
- **VS Code SQL Tools** or similar — point at the connection string.

---

## Risks

- Running against the wrong Neon branch. `schema.sql` starts with `DROP TABLE`. The script requires `--confirm` on every invocation for this reason — read the "Target:" line before confirming.
- `@neondatabase/serverless` vs `pg`: the seed uses `pg` because it handles multi-statement SQL cleanly, which matters for applying `schema.sql` in one shot. A future Lambda integration would likely use `@neondatabase/serverless`'s HTTP driver to avoid connection-pool overhead. This is a seed-script-only choice.
- Enum drift: if you edit `schema.sql` to add or remove enum values, re-run with `--confirm` (drops and recreates cleanly).
