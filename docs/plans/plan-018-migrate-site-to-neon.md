# Plan 018 — Migrate the Site from DynamoDB to Neon Postgres

**Status:** plan only. No code gets written by this document.
**Prerequisite memo:** [plan-016-database-improvement-eval.md](plan-016-database-improvement-eval.md)
**Exploration delivered:** [plan-017-neon-tables-and-seed.md](plan-017-neon-tables-and-seed.md) — 12 of 36 tables, seeded and inspected on the `seed-sandbox` Neon branch.
**Goal:** move all runtime reads and writes off DynamoDB and onto the Neon Postgres project `leagueszn` with minimal risk — **with one exception: the `Presence` table stays on DynamoDB**. See §4.2 and §16 for the rationale and architecture. Everything else is migrated in a single code branch that ships to `devtest` first, soaks for 1–2 weeks, then ships to prod.

---

## 1. TL;DR

- **Strategy:** one code branch that rewrites every handler at once, deployed to `devtest` for a 1–2 week soak, then to prod. No dual-write, no feature flags per domain — at this scale they cost more than they buy.
- **Pace:** realistically 40–60 hours of focused work across 2–3 calendar weeks for the solo dev. The memo's "weekend plus a few evenings" was accurate for the *code rewrite*, but schema extension, data migration, and infra changes each need their own evening.
- **Hybrid architecture:** Postgres owns 35 of the 36 current tables. The `Presence` table stays on DynamoDB because its access pattern (high-frequency heartbeat upserts + free TTL expiration) is genuinely a better fit for Dynamo than for Postgres. One narrow table, one narrow IAM policy. Details in §16.
- **Rollback:** keep the other 35 DynamoDB tables intact for 14 days post-prod-cutover. If the roof caves in, revert the Serverless deploy and revert the git commit. After 14 days of clean prod, delete those 35 Dynamo tables in a separate commit. The `Presence` table lives on indefinitely.
- **Query layer:** Kysely with types generated from the live Neon schema (`kysely-codegen`), raw SQL templates for the two or three places (transactional writes in `recordResult.ts`, multi-CTE aggregations) where a builder is noisier than the SQL it replaces.
- **Connection strategy:** `@neondatabase/serverless` HTTP driver for reads and single-statement writes, Neon's pg-compatible WebSocket `Pool` for the handful of multi-statement transactions. No RDS Proxy. No `pg` in Lambda.
- **Prod data:** a one-shot `migrate-data.ts` script scans 35 Dynamo tables (everything except Presence), shapes each row for the relational schema, and bulk-inserts into Neon. Runs in <5 minutes at current scale.
- **Infra:** `serverless.yml` sheds 35 of the 36 Dynamo table resources and replaces the broad Dynamo IAM policy with a narrow one scoped to only the Presence table ARN. Gains a single `NEON_DATABASE_URL` env var sourced from SSM Parameter Store (SecureString). Net YAML reduction of roughly 680 lines.

Main tradeoff: **you rewrite ~80 handlers in one branch, with nothing in production exercising the new code until devtest cutover.** Mitigations below (parity script, devtest soak, staged handler rollout within the branch).

---

## 2. Goals & non-goals

### Goals
1. Every handler currently in `backend/functions/` reads and writes Neon, **except** the handful of Presence handlers (`backend/functions/presence/`) which continue to use Dynamo — see §16.
2. No user-visible behavior changes — same API contract, same response shapes, same auth. The migration is invisible to the frontend.
3. The hardest handlers (`recordResult.ts`, `getStandings.ts`, `getStatistics.ts`, `getRivalries.ts`, `getDashboard.ts`) get meaningfully shorter and more legible. If they don't, something went wrong during the rewrite.
4. Production data is preserved byte-for-byte in meaning, though not in shape.
5. Rollback within one deploy cycle is possible for at least 14 days.
6. Ongoing cost stays in the same envelope (~$0–$5/month at current scale).

### Non-goals (explicitly)
- **No frontend changes.** The frontend stays on the same API endpoints with the same payloads.
- **No Cognito migration.** Auth is unchanged.
- **No schema-level features that Dynamo can't express.** Triggers, stored procedures, materialized views — all deferred. Keep the first migration boring.
- **No ORM.** Kysely is a typed query builder, not an ORM. No repository pattern, no entity classes, no unit-of-work.
- **No microservice split.** This is a 1:1 port at the query layer.
- **No Lambda connection pooling layer** beyond what Neon provides via the `-pooler` endpoint.
- **No tests added during migration.** Existing tests must still pass; new tests wait for a follow-up plan unless a specific handler needs one to prove parity.

---

## 3. Phase overview

| # | Phase | Evenings | Can parallelize? | Blocker for |
|---|---|---:|---|---|
| 1 | Extend Neon schema to 35 tables (all except Presence) | 1–2 | No | Phases 3, 4 |
| 2 | Add query layer (`backend/lib/db.ts`, Kysely, types) | 1 | Parallel with #1 | Phase 4 |
| 3 | Write data-migration script (Dynamo → Neon) | 1 | After #1 | Devtest cutover |
| 4 | Rewrite handlers domain-by-domain | 15–20 | Sequenced (see §7) | Deploy |
| 5 | Infrastructure changes (`serverless.yml`, SSM, IAM) | 1 | Parallel with #4 | Deploy |
| 6 | Deploy to devtest, run parity script, soak | 1 + 1–2 wk | N/A | Prod cutover |
| 7 | Cut over prod | 1 evening | N/A | Cleanup |
| 8 | Cleanup (drop Dynamo tables, delete code paths) | 1 | 14 days after prod cutover | Done |

Calendar: aim for three weeks end-to-end. A weekend of heavy lifting on phases 1–3, weekday evenings for phase 4, a deploy weekend for phases 5–7, then cleanup two weeks later.

---

## 4. Phase 1 — Extend the Neon schema to 35 tables (all except Presence)

### 4.1 What's already in place
The 12 tables from plan 017: `divisions`, `players`, `seasons`, `season_standings`, `championships`, `championship_reigns`, `championship_reign_holders`, `matches`, `match_participants`, `tournaments`, `events`, `event_match_cards`. All live in `backend/neon/schema.sql`.

### 4.2 What still needs schema design (24 logical entities, ~28 physical tables after junctions)

Grouped by domain; each row is one logical entity. Normalization notes flag where an array/nested-object field from Dynamo needs a junction table.

| Domain | Tables | Normalization notes |
|---|---|---|
| **Identity** | `users` (extend `players` with optional `cognito_user_id`, roles) | If `Players.userId` is nullable today, keep it nullable. |
| **Championships** | `championship_history` already done via `championship_reigns`. Nothing new. | — |
| **Contenders** | `contender_rankings`, `contender_overrides`, `ranking_history` | Keep flat (already flat in Dynamo). Add FK to `championships` + `players`. |
| **Fantasy** | `fantasy_config` (single row, composite key), `wrestler_costs`, `fantasy_picks`, `wrestler_overalls` | `wrestler_costs.cost_history` array → separate `wrestler_cost_history` junction keyed on `(player_id, effective_date)`. `fantasy_picks` includes an array of picks → separate `fantasy_pick_items` junction. |
| **Challenges** | `challenges` | `challenger_ids UUID[]` and `challenged_ids UUID[]` → junction `challenge_participants(challenge_id, player_id, role)` with `role` enum (`challenger` \| `challenged`). Mirrors the `match_participants` pattern. |
| **Promos** | `promos` | `tagged_player_ids UUID[]` → junction `promo_player_tags(promo_id, player_id)`. |
| **Stipulations / Match Types** | `stipulations`, `match_types` | 1:1 flat. |
| **Stables** | `stables`, `stable_members`, `stable_invitations` | Replace `memberIds` array with `stable_members(stable_id, player_id, role, joined_at)`. |
| **Tag Teams** | `tag_teams` | Two `player_id` FKs (team1, team2 slots). `status` enum. |
| **Shows / Companies** | `shows`, `companies` | 1:1 flat. `shows.company_id FK`. |
| **Announcements** | `announcements` | 1:1. `audience` enum. |
| **Notifications** | `notifications` | 1:1, but add index on `(player_id, read_at IS NULL)` — this is a read-often-write-rare access pattern. |
| **Transfers** | `transfer_requests` | 1:1. |
| **Storylines** | `storyline_requests` | 1:1. |
| **Videos** | `videos` | 1:1. |
| **Season Awards** | `season_awards` | 1:1. |
| **Presence** | — (no Neon table) | **Stays on DynamoDB.** Presence is a realtime concern; Dynamo's per-item pricing, fast upserts, and free TTL expiration are a strictly better fit than polled snapshots on Postgres. Architecture details in §16. |
| **Matchmaking** | `matchmaking_queue`, `match_invitations` | Queue is low-volume; Postgres is fine. |
| **Event Check-Ins** | `event_check_ins` | 1:1. TTL field becomes an application-side cleanup job, not a DynamoDB TTL trigger. |

**Junctions introduced beyond plan 017:** `wrestler_cost_history`, `fantasy_pick_items`, `challenge_participants`, `promo_player_tags`, `stable_members`. Total physical table count after this phase: ~34 — two fewer than the Dynamo count because `event_match_cards` and `match_participants` already consolidate what Dynamo stored inline.

### 4.3 Deliverable
Extend `backend/neon/schema.sql` with the new tables. Apply it to the `seed-sandbox` branch first, run the `neon:seed` script to confirm it still completes (it should — the new tables are additive, existing inserts untouched). Commit only when both schema.sql and the re-run produce the same row counts for the original 12 tables plus zero rows in the new ones.

No seed data for the new tables yet — Phase 3's data migration script will populate them from Dynamo.

### 4.4 Deferred until Phase 4 (schema touch-ups discovered mid-rewrite)
Expect to add one or two indexes per domain during Phase 4 once query plans reveal them. Don't try to predict them here.

---

## 5. Phase 2 — Query layer

### 5.1 Files to add

```
backend/lib/
├── db.ts               # Neon HTTP + pool factory, env wiring
├── db.types.ts         # Generated by kysely-codegen (do not edit by hand)
└── schema.ts           # Hand-written Kysely Database interface (re-exports from db.types.ts)
```

### 5.2 `db.ts` responsibilities

- Read `NEON_DATABASE_URL` from `process.env` (populated by `serverless.yml` from SSM at deploy time).
- Export **two** handles:
  - `sql` — the `neon()` HTTP template-tag client from `@neondatabase/serverless`, for the 95% of queries that are single-statement reads or writes.
  - `pool` — a `Pool` from `@neondatabase/serverless` (WebSocket, pg-compatible) wrapped in a lazy singleton keyed on the Lambda container. Used only by handlers that need a multi-statement transaction (record match result, transactional ranking updates, etc.).
- Export one helper: `withTransaction(fn)` — opens a client from `pool`, `BEGIN`, runs `fn(client)`, `COMMIT`, releases. Standard Postgres transaction pattern.

Rationale: HTTP driver for reads/single writes means zero connection-pool math in Lambda — no cold-start connect penalty, no idle connections, no connection exhaustion under bursty load. WebSocket Pool only for the handful of places that genuinely need transactions. Most handlers never see the pool.

### 5.3 Kysely wiring

- Add devDependencies: `kysely`, `kysely-codegen`.
- Add a `db:types` npm script: `kysely-codegen --dialect postgres --url "$NEON_DATABASE_URL" --out-file lib/db.types.ts`.
- `schema.ts` re-exports the generated `Database` interface so imports look like `import { Database } from '../lib/schema'`.
- The `sql` and `pool` handles from §5.2 get wrapped in a `Kysely<Database>` instance, exported as `db`. Handlers import `db`.

Rationale: `schema.sql` stays the source of truth. Types regenerate from the live database. No schema-in-TypeScript drift. No Drizzle schema.ts file to keep in sync.

### 5.4 Raw SQL escape hatch

Kysely has a `sql` template literal built in. Use it inside `recordResult` and in any aggregation with 3+ CTEs. The test for "use raw SQL" is: if the Kysely version is longer than the SQL it's building, use SQL. This happens more than purists admit.

---

## 6. Phase 3 — Data migration script

### 6.1 File

`backend/neon/migrate-data.ts` (new). Structurally similar to `seed.ts` but:
- Reads from Dynamo instead of fixed fixtures.
- Shapes every row for the relational schema (array columns → junction inserts, scalar-or-array current champion → reign + holder inserts, etc.).
- Runs in dependency order (§6.3).
- Streams rows in chunks of 500 to keep Lambda-style memory profiles honest, though it runs from a dev machine.
- Wraps each domain in a transaction so partial failures roll back cleanly.

### 6.2 CLI

```bash
ts-node neon/migrate-data.ts --source=prod --target=neon-main --dry-run
ts-node neon/migrate-data.ts --source=prod --target=neon-main --confirm
```

`--source` picks the Dynamo stage (`devtest` or `dev` — note that prod uses the `dev` stage, per `CLAUDE.md`).
`--target` is advisory logging only; the real target comes from `NEON_DATABASE_URL`.
`--dry-run` reads from Dynamo and shapes every row without inserting. Prints summary counts.
`--confirm` actually writes.

### 6.3 Order (matches FK dependency graph)

1. Reference data: `divisions`, `stipulations`, `match_types`, `companies`, `shows`, `site_config`, `fantasy_config`.
2. Identity: `players`, `wrestler_overalls`, `wrestler_costs` (+ history junction).
3. Seasons: `seasons`, `season_standings`, `season_awards`.
4. Championships: `championships`.
5. Tournaments and events: `tournaments`, `events`.
6. Matches: `matches` (without FK to event/tournament if those rows will be inserted later — solve via deferred constraints or two-phase insert; prefer two-phase insert for readability).
7. Match participants: `match_participants` (derived from Dynamo's `participants`/`winners`/`losers` arrays).
8. Championship reigns: `championship_reigns` + `championship_reign_holders` (derived from `championship_history`).
9. Event match cards: `event_match_cards` (derived from `events.matchCards` array).
10. Rankings: `contender_rankings`, `contender_overrides`, `ranking_history`.
11. Fantasy: `fantasy_picks` (+ items junction).
12. Challenges, promos: `challenges` (+ participants junction), `promos` (+ player tags junction).
13. Stables, tag teams: `stables` (+ members junction), `stable_invitations`, `tag_teams`.
14. Announcements, notifications: `announcements`, `notifications`.
15. Misc: `transfer_requests`, `storyline_requests`, `videos`, `matchmaking_queue`, `match_invitations`, `event_check_ins`.
16. Presence: **skipped.** Data stays in its existing Dynamo table; no migration needed (see §16).

### 6.4 Validation after migration

The script prints, per table, "Dynamo count: X, Neon count: Y". Any mismatch blocks cutover. For tables where normalization changes the row count (e.g., each match produces 2+ participant rows), the script prints the expected ratio.

### 6.5 Where this runs

From the owner's dev machine against:
1. First: `seed-sandbox` Neon branch + `devtest` Dynamo stage. Practice run.
2. Then: `devtest` Neon branch + `devtest` Dynamo stage. Real devtest cutover source data.
3. Finally: `main` Neon branch (prod) + `dev` Dynamo stage (prod). Run during the prod cutover window.

---

## 7. Phase 4 — Handler rewrite

This is the bulk of the calendar time. Approach: one git branch, one commit per domain, commits stay on the branch until Phase 6 merges them all at once.

### 7.1 Sequencing within the branch

Order handlers by migration risk. Start with the trivial ones — they exercise the query layer end-to-end, so the hard handlers later can assume `db.ts` works.

**Tier 1 — Reference data (1 evening, warm-up):** divisions, stipulations, match-types, site-config, fantasy-config, shows, companies, announcements. Pure CRUD. Proves the `db` + Kysely + env wiring.

**Tier 2 — Simple entities (2 evenings):** players, championships, seasons, events, tournaments, wrestler-overalls, wrestler-costs, notifications. CRUD plus a handful of joins.

**Tier 3 — Read aggregations (3–4 evenings; biggest wins):**
- `standings/getStandings.ts` — today 1000+ lines of scan-and-join, after: ~80 lines.
- `rivalries/getRivalries.ts` — today ~150 lines of in-memory GROUP BY, after: one query.
- `dashboard/getDashboard.ts` — today 5 scans + N queries, after: one query per card with `Promise.all`.
- `statistics/getStatistics.ts` — today 1016 lines, after: 200–300 lines with handful of joined queries. The biggest single reduction in the codebase.
- `activity/getActivity.ts` — today filters scanned results, after: indexed query.

**Tier 4 — Write cascades (3–4 evenings; highest risk):**
- `matches/scheduleMatch.ts` — one insert + N participant inserts in a transaction.
- `matches/recordResult.ts` — the canonical hard handler. Today 707 lines split across multiple `TransactWriteCommand`s. After: one Postgres transaction that updates `matches`, `match_participants`, `season_standings`, optionally `championship_reigns` (close open reign, open new), and triggers tournament/event auto-advance via the same tx. Target ~300 lines.
- `tournaments/updateTournament.ts` — bracket progression as SQL updates.
- `contenders/recalculate*` — ranking algorithm stays in TypeScript; only persistence changes.

**Tier 5 — Secondary write cascades (3–4 evenings):** challenges, promos, stables, tagteams, transfers, storylines, matchmaking, event-checkins, fantasy picks, rankings. All smaller than recordResult but each has its own quirks.

**Tier 6 — Narrow the Dynamo surface (1 evening):** shrink `backend/lib/dynamodb.ts` to only what the Presence handlers need (likely a `presenceTable` helper plus `get` / `put` / `delete` wrappers). Delete every other Dynamo import outside `backend/functions/presence/`. Strip the `TABLE_NAMES` export down to one entry. Keep `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` as dependencies — they're still load-bearing for Presence.

### 7.2 Per-handler conversion recipe

For each handler:

1. **Map**: write the new Kysely query above the old code, commented out. Compile it — if types don't line up, the schema is wrong (go back to Phase 1) or the response shape is wrong.
2. **Swap**: replace the old Dynamo call with the Kysely call.
3. **Smooth**: inline the in-memory joins and reshaping that the old handler did, because the SQL query now returns the joined row shape directly. This step is where the line count drops.
4. **Preserve**: keep the exact response shape the frontend expects. Add a small `toResponse(row)` mapper if column names differ from the API shape (snake_case DB → camelCase API).
5. **Verify**: run `npx tsc --project tsconfig.json --noEmit`. Compile errors here often catch missed shape changes.
6. **Smoke test locally**: `npm run offline` still works if you point it at the `seed-sandbox` Neon branch. Exercise the handler via curl or the frontend running against localhost.

### 7.3 When to use raw SQL

Use `sql` template literal (Kysely's escape hatch) when:
- The query has 3+ CTEs (standings with recent form, rivalries, statistics).
- The query uses Postgres features Kysely awkwardly wraps (`DISTINCT ON`, `jsonb_agg`, window functions with complex `PARTITION BY`).
- The query is being copied from the README's canned queries — no need to rewrite it as a builder.

Use Kysely when:
- It's a CRUD query.
- It's a filtered list with dynamic predicates.
- Response types matter (Kysely gives you the row type for free).

---

## 8. Phase 5 — Infrastructure

### 8.1 `serverless.yml` edits

Remove:
- 35 of the 36 `Resources:` blocks for Dynamo tables (every table except Presence).
- The broad Dynamo IAM statement in `provider.iam.role.statements`.

Narrow:
- Replace the broad Dynamo IAM statement with a tight one scoped to **only** the Presence table ARN and its GSIs (if any). Any handler that tries to touch any other Dynamo table will fail with `AccessDeniedException` — this is the safety net in §13 that catches a handler missed during Phase 4.

Add:
- One env var: `NEON_DATABASE_URL: ${ssm:/leagueszn/${self:provider.stage}/neon-database-url~true}` (SSM SecureString).
- One IAM statement allowing `ssm:GetParameter` on that parameter path.

Net change: roughly −680 lines, +6 lines.

### 8.2 SSM setup (manual, one-time per stage)

Create two SSM Parameters (SecureString) via AWS Console or CLI:

- `/leagueszn/devtest/neon-database-url` — pooled connection string for the `devtest` Neon branch.
- `/leagueszn/dev/neon-database-url` — pooled connection string for the `main` Neon branch (prod).

No new SSM parameters for Dynamo — the Presence table name is derivable from the stage (`wwe-2k-league-api-presence-${stage}`) and does not need a secret.

Cost: SSM Standard parameters are free up to 10,000; SecureString uses the default KMS key (also free for standard usage). No billing impact.

### 8.3 CI/CD

GitHub Actions workflows (`deploy-dev.yml`, `deploy-prod.yml`) don't need changes — they deploy via `serverless deploy` which resolves the SSM reference at deploy time. The CI runner never sees the database URL.

Local development (`npm run offline`) needs the URL in `backend/.env.neon` — already gitignored.

### 8.4 Tests

`backend/functions/**/__tests__/` files that mock `@aws-sdk/lib-dynamodb` need new mocks. Minimum-viable approach: mock the `db` export from `backend/lib/db.ts`, return canned rows. Better approach (later): point tests at a Neon branch per test run using `neonctl branches create`. Scope of this plan: minimum-viable mock. Parametrized test-branch-per-run is a follow-up plan if tests get flaky.

---

## 9. Phase 6 — Deploy, soak, cutover

### 9.1 Devtest cutover (Day 1 of the deploy phase)

Order of operations, approximately one evening:

1. Merge the Phase 1–5 branch into `main` locally but **do not push**. Hold it in a local `neon-migration` branch.
2. Create a Neon branch called `devtest` off `main` in the `leagueszn` project. Capture its pooled connection string.
3. Store that string in `/leagueszn/devtest/neon-database-url` (SSM).
4. Run `migrate-data.ts --source=devtest --confirm` from the dev machine. Verify count parity.
5. Deploy: `npm run deploy:devtest` (i.e., `serverless deploy --stage devtest`). Serverless picks up the new `NEON_DATABASE_URL` and the absence of Dynamo tables.
6. Smoke test the devtest frontend. Log every 5xx in CloudWatch and triage.
7. **Do not delete the devtest Dynamo tables.** They're the rollback path.

### 9.2 Soak (Days 2–14)

- Use the devtest site normally. Record matches, create tournaments, promote players, etc.
- Run `backend/neon/parity-check.ts` (new, see §10.1) daily for the first three days, then as needed. It compares a handful of aggregate queries (standings, current champions, match count per season) between the devtest Dynamo tables (frozen since cutover) and the live Neon devtest branch. Expected: Neon diverges only where real user activity happened since cutover; Dynamo numbers stay frozen.
- Any bug fix goes onto the same `neon-migration` branch, redeploys to devtest, re-soaks from Day 0 conceptually but not literally — use judgment.

### 9.3 Prod cutover (one evening, announced maintenance window)

1. Put the site in read-only mode (or accept a ~15 minute outage). For a league tracker with a handful of users, a brief outage is fine; posting "maintenance 8–9pm EST" in the site banner is sufficient. A true read-only mode is a separate plan.
2. Run `migrate-data.ts --source=dev --confirm` against the prod Neon branch. At current scale this finishes in under 5 minutes.
3. Run parity-check one last time against prod Dynamo and prod Neon.
4. Push the `neon-migration` branch to `main`. CI deploys to prod via `deploy-prod.yml`.
5. Lift the maintenance banner. Exercise the site manually. Watch CloudWatch for the next 30 minutes.
6. Post in the league's Discord/group chat: "If anything looks wrong, screenshot and send." First 24 hours are when regressions surface.

---

## 10. Phase 7 — Cleanup (Day 14+)

### 10.1 Precursor: confirm clean soak

Grep CloudWatch for 5xx spikes over the 14-day window. If any handler is paging more than baseline, delay cleanup and triage first.

### 10.2 Delete Dynamo

Phase 5 keeps the 35 to-be-migrated Dynamo tables as retained resources (via `DeletionPolicy: Retain`) with their `Resources:` blocks still in `serverless.yml` — so the prod deploy in Phase 6 does not delete them. Phase 7 is when those blocks come out and CloudFormation drops the tables. The Presence table's `Resources:` block stays indefinitely. See §8.1 addendum below for mechanics.

### §8.1 addendum
Phase 5 strips Dynamo **code references outside Presence** and narrows **IAM access** to the Presence table only. But it leaves the 35 to-be-migrated tables' `Resources:` blocks in place with added `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` properties. This ensures:
- Prod deploy in Phase 6 does not delete those tables.
- Non-Presence handlers can't accidentally hit them (no IAM access).
- Rollback in the 14-day window is one `git revert` of Phase 4 plus one redeploy.

Phase 7 removes the 35 retained `Resources:` blocks entirely, letting CloudFormation drop them. At that point, rollback requires restoring from a point-in-time DynamoDB backup, which is why the 14-day window exists before this step. The Presence `Resources:` block is **not** touched in Phase 7.

### 10.3 Code cleanup

- Narrow `backend/lib/dynamodb.ts` to just the helpers Presence needs (already done in Phase 4 Tier 6; confirm here).
- Delete `backend/scripts/seed-data.ts`, `backend/scripts/clear-data.ts`, `backend/scripts/create-tables.ts` — they're Dynamo-specific.
- Rename `backend/neon/seed.ts` to something that no longer implies sandbox status — or move it to `backend/scripts/seed-neon.ts` alongside other scripts.
- Keep `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` in `dependencies` — still used by the Presence handlers.
- `grep -r dynamo backend/functions/` should return matches only under `backend/functions/presence/`.

### 10.4 Docs

Update `CLAUDE.md` to reflect the hybrid architecture: Postgres as the primary database for 35 domains, DynamoDB retained for the Presence table only. Update the `Data Model` section, the `Common Tasks` examples, the `Troubleshooting` section. Add a short "Why Presence is on Dynamo" note referencing §16 of this plan.

---

## 11. Rollback strategy

| If it breaks at... | Rollback |
|---|---|
| Phase 4 (during rewrite, local only) | Reset the branch. Nothing shipped. |
| Phase 6.1 (devtest cutover) | Redeploy the prior commit to devtest. Old Dynamo-backed handlers + old Dynamo tables still intact. No user impact. |
| Phase 6.2 (soak) | Same as above. Soak bugs get fixed on the branch and redeployed. |
| Phase 6.3 (prod cutover window) | Revert the merge commit, force-deploy the previous prod. Prod Dynamo tables still intact (see §10.2 addendum). Restore any data entered after cutover manually — expected scope: <30 minutes of data if caught fast. |
| Up to 14 days post-prod | Same revert + redeploy. Data entered during the Neon window is lost unless you manually export from Neon and re-import to Dynamo. Acceptable loss at this scale. |
| After Phase 7 cleanup | Requires Dynamo point-in-time backup restore + full rollback of phases 1–7. Effectively: you're committed. This is why Phase 7 waits 14 days. |

---

## 12. Testing strategy

### 12.1 During Phase 4

- Compile must pass: `npx tsc --project tsconfig.json --noEmit`.
- Existing unit tests must pass: `npm test`. Broken tests mean the mock layer needs updating — fix at the mock level, not by weakening assertions.
- Smoke-test each handler via `npm run offline` + curl or the frontend pointed at localhost. Keep a running list of "tested" handlers in the PR description.

### 12.2 Parity check (`parity-check.ts`, new file in `backend/neon/`)

Runs a fixed set of queries against both Dynamo and Neon and diffs the results. The intent is not full coverage — it's smoke coverage for the aggregations that are most likely to silently diverge.

Minimum queries:
- `SELECT COUNT(*) FROM matches WHERE status='completed'`
- All-time standings top 20 (name + W/L/D)
- Current champion per active championship
- Match count per season
- Rivalries count (pairs ≥3 matches)

Output: a diff report. Non-zero diff blocks cutover.

### 12.3 Production smoke test (Phase 6.3)

After prod cutover, manually exercise in the live site:
- Record a match result (tests `recordResult.ts` — the hardest handler).
- View standings.
- View the dashboard.
- Claim/redeem a challenge or promo (domain-specific).
- Log in as a moderator and make a schema-touching edit.

If any of those fail, trigger the rollback in §11.

---

## 13. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Schema design wrong for a domain not covered in memo (e.g., complex fantasy rules surface unexpected requirements) | Medium | Phase 1 includes a schema review pass; handlers in Phase 4 will catch remaining misshapes — allow for schema revision commits mid-Phase 4. |
| `recordResult.ts` rewrite introduces subtle transaction bugs (double-counting a win, orphaned reign) | High | Rewrite it *second to last* in Tier 4, after the read aggregations are working (easier to spot double-counts in standings). Add one temporary test that records a synthetic match and verifies all derived tables. Remove after 30 days clean. |
| Neon cold-start latency spikes user-visible (scale-to-zero delay) | Medium | Memo flagged this. Mitigation: keep the Neon project in `us-east-1` matching Lambda; pooled endpoint only; avoid scale-to-zero in paid tier if it becomes a recurring issue (~$19/mo). |
| SSM parameter mis-set or URL changes without stack redeploy | Low | Lambda reads env at init, not per-invocation. A rotated URL requires a redeploy, which is a feature not a bug. |
| Prod data migration takes longer than expected | Low | Current scale: low 10k rows. Budget 15 minutes; likely 2–3. |
| Tests that mock `@aws-sdk/lib-dynamodb` become noise until rewritten | Medium | Phase 4 mandates keeping tests passing. If a test is too expensive to port, delete it with a note in the commit — it's Dynamo-mock coverage that no longer applies. |
| A handler missed during Phase 4 rewrite silently targets a deleted Dynamo table in prod | High | Phase 5 removes Dynamo IAM permissions. Any missed handler crashes with `AccessDeniedException` in CloudWatch within seconds of first invocation — loud failure beats silent success. The 14-day soak catches this. |

---

## 14. Open questions for the owner

1. ~~**Presence table.**~~ **Resolved:** stays on DynamoDB. See §16.
2. **Read-only mode during prod cutover.** The plan assumes a brief maintenance-banner outage rather than a genuine read-only mode. Is that OK for users, or do we need a real read-only toggle first (separate plan)?
3. **Neon plan tier.** Free tier has scale-to-zero after 5 min idle. Fine for devtest. Prod under real use may want the $19/mo "Launch" tier to avoid wake latency on the first request after an idle period. Want the plan to assume free or Launch for prod?
4. **Dynamo table retention beyond 14 days.** Some data (championship history going back to the league's founding) is arguably more valuable than the 14-day rollback window suggests. Consider a one-time Dynamo export to S3 as an archive, independent of Neon. Add that to Phase 5?
5. **Test Neon branches in CI.** Follow-up question: when CI runs tests, should it spin up an ephemeral Neon branch per PR (via `neonctl`)? Out of scope for this plan, but the question influences Phase 4's minimum-viable mock decision.

Defaults stand if not addressed. Every answer is small enough to flip mid-implementation without blowing up the plan.

---

## 15. Effort estimate (flat-summed)

| Phase | Hours |
|---:|---:|
| 1 — Schema extension | 6–10 |
| 2 — Query layer setup | 3–4 |
| 3 — Data migration script | 4–6 |
| 4 — Handler rewrite | 20–30 |
| 5 — Infra (`serverless.yml`, SSM, IAM) | 2–3 |
| 6 — Devtest deploy + soak bugs | 3–5 |
| 7 — Cleanup | 2–4 |
| **Total** | **40–62** |

Plus ~2 weeks of calendar for the soak. Realistic plan: a focused weekend gets phases 1–3 done, weekday evenings over two weeks handle phase 4, a Saturday handles phases 5–6.1, two-week soak in the background, an evening handles 6.3, cleanup follows two weeks later. End-to-end: roughly 4 weeks.

---

## 16. Hybrid architecture — Presence on DynamoDB

Presence (who's online, last-seen heartbeat) stays on DynamoDB after the migration. Rationale and mechanics below.

### 16.1 Why Dynamo keeps Presence

- **Access pattern is pure key-value heartbeat.** Write frequency is high (one upsert per online user per N seconds); read is a single-key point-lookup. Dynamo's per-item pricing and single-digit-ms writes are a genuine fit; Postgres would be burning connections on a workload that doesn't benefit from joins or transactions.
- **Free TTL expiration.** DynamoDB TTL quietly deletes rows whose `expiresAt` has passed — at no cost, no Lambda, no cron. Replicating this on Postgres requires either a scheduled cleanup Lambda (cheap but another moving part) or the `pg_cron` extension (not available on Neon free tier).
- **No joins needed.** Presence never joins to Players, Matches, or anything else in the read path. The frontend fetches presence separately and merges client-side.
- **Zero migration risk for a feature that already works.** Presence's current implementation is small and stable. Migrating it would add risk for negative return.

### 16.2 Architecture

After migration:

```
Lambda handlers
├── backend/functions/presence/*    ──▶  DynamoDB (Presence table only)
└── backend/functions/**/*          ──▶  Neon Postgres (everything else)
```

- `backend/lib/dynamodb.ts` is **narrowed**, not deleted. Strip it to just what Presence needs: a table-name helper, a `DynamoDBDocumentClient` singleton, and the specific commands used by Presence handlers (likely `PutCommand`, `GetCommand`, `DeleteCommand`, and possibly `QueryCommand` if there's a list-online-players read).
- `backend/lib/db.ts` is the new Neon entry point used by everything else.
- The two are never imported into the same handler. Grep rule in CI: `grep -rE "(lib/dynamodb|@aws-sdk/client-dynamodb)" backend/functions/ | grep -v "functions/presence/"` must return empty.

### 16.3 IAM scoping

The new `provider.iam.role.statements` block:

- **Allow** `dynamodb:GetItem`, `PutItem`, `DeleteItem`, `Query`, `UpdateItem` on **only** the Presence table ARN: `arn:aws:dynamodb:${region}:${account}:table/wwe-2k-league-api-presence-${stage}` (plus any GSI suffix if the Presence table has one).
- **Allow** `ssm:GetParameter` on the Neon URL parameter.

Any Lambda that accidentally calls another Dynamo table (a handler missed during migration, a stray import) fails with `AccessDeniedException` within milliseconds of first invocation. This is the loud-failure safety net referenced in §13.

### 16.4 Deployment implications

- `serverless.yml` keeps one `Resources:` block for the Presence table. The other 35 tables retain for 14 days per §10.2 addendum, then get removed in Phase 7.
- The data-migration script in Phase 3 skips Presence entirely — the data stays where it is.
- Rollback: reverts to code that uses Dynamo for everything including Presence. Since Presence kept using Dynamo throughout, its data is always current — no rollback data loss for the presence feature.

### 16.5 Future option (out of scope)

If Presence outgrows Dynamo later (e.g., the league needs server-side presence for >1000 concurrent users, or realtime push notifications become a requirement), candidate replacements are Upstash Redis (cheap, edge-friendly, proper pub/sub) or Postgres `LISTEN/NOTIFY` with a long-lived connection. Neither is worth doing now.
