# Plan: Database Interface Layer (Repository Pattern)

> Enabling work for swapping the data source (e.g., DynamoDB → Postgres/Neon).
> Pairs with [`plan-016-database-improvement-eval.md`](plan-016-database-improvement-eval.md),
> which recommends Neon + Kysely/Drizzle. **This plan does NOT pick a target DB.** It
> makes the data source swappable so *any* future migration is a new implementation of
> the interface, not a rewrite of every handler.

## Progress (branch `feat/db-interface-layer`)

| Wave | Status | Commit |
|---|---|---|
| 1 — Foundation (types, errors, UoW interface, driver-selection factory) | ✅ Done | `2c71896` |
| 2 — Divisions/Stipulations/MatchTypes + generalized CRUD factory | ✅ Done | `9357c0e` |
| 3 — Read-heavy leaves (Seasons, Announcements, Videos, Companies, Shows, Notifications, Overalls, SiteConfig, SeasonAwards) | ✅ Done | — |
| 4 — Medium-complexity aggregates with GSIs (Players, Challenges, TagTeams, Stables, Transfers, StorylineRequests, Events, Promos) | ✅ Done | — |
| 5 — Cross-aggregate reads (Standings, Dashboard, Rivalries, Statistics, Activity) | ✅ Done | — |
| 6 — Contenders & Fantasy (batched writes) | ✅ Done | — |
| 7 — Transactional writes + `runInTransaction` + `recordResult.ts` | ⏳ | — |
| 8 — Admin and seed scripts | ⏳ | — |
| 9 — Clean up (delete `dynamodbUtils.ts`, shrink `dynamodb.ts`, remove deprecated `handlerFactory`) | ⏳ | — |

**Baseline after Wave 2**: 953 tests passing, 17 pre-existing failures (unrelated
mock-shape drift, tracked separately in `TO-DOS.md`). Typecheck and lint clean.

**After Wave 3**: 950 tests passing, 17 pre-existing failures unchanged.
Typecheck and lint clean. 9 domains migrated: SiteConfig, Videos, Announcements,
Companies, Shows, Notifications, Overalls, Seasons, SeasonAwards. Handlers that
reference Wave 4+ domains (Players, Events, Matches, Championships) still use
`dynamoDb` directly for those cross-domain reads — annotated with `// Note:` comments.

**After Wave 4**: 967 tests passing, 0 failures (fixed all 17 pre-existing
mock-shape failures as part of test updates). Typecheck and lint clean. 8 GSI-heavy
domains migrated: Players, Challenges, TagTeams, Stables, Transfers,
StorylineRequests, Events, Promos. Transactional handlers (approveTagTeam,
dissolveTagTeam, deleteTagTeam, respondToChallenge) retain `dynamoDb.transactWrite`
calls pending Wave 7 UoW implementation. Cross-domain reads to Matches/Championships
(Wave 5+) remain on direct dynamoDb.

**After Wave 5**: 967 tests passing, 0 failures. Typecheck and lint clean.
5 cross-aggregate read handlers migrated: Standings, Dashboard, Rivalries,
Statistics, Activity. 4 new repository interfaces created: MatchesRepository,
ChampionshipsRepository (including history), TournamentsRepository,
SeasonStandingsRepository. These are read-only interfaces — write methods will
be added in Wave 7 when transactional handlers are migrated. N+1 pattern in
getActivity eliminated (individual player/championship lookups replaced with
batch list calls). All 9 test files updated to mock repository methods instead
of DynamoDB SDK.

**After Wave 6**: 967 tests passing, 0 failures. Typecheck and lint clean.
2 domains migrated: Contenders (rankings, overrides, history) and Fantasy
(config, picks, wrestler costs). 2 new repository interfaces created:
ContendersRepository and FantasyRepository. 5 contender handlers and 12 fantasy
handlers migrated from direct `dynamoDb` calls to repository methods. All 11
test files (2 contender, 9 fantasy) updated to mock repository methods instead
of DynamoDB SDK. The `calculateRankings` handler now uses
`championships.listActive()` and `championships.findById()` from the Wave 5
ChampionshipsRepository instead of direct DynamoDB scans/gets.

**Where to resume**: Wave 7 — Transactional writes + `runInTransaction` +
`recordResult.ts`. Build `DynamoUnitOfWork` and `InMemoryUnitOfWork`, then
migrate transactional handlers in order of increasing complexity.

## Context

Every Lambda handler currently imports `dynamoDb` and `TableNames` directly from
[`backend/lib/dynamodb.ts`](../../backend/lib/dynamodb.ts) and calls DynamoDB-specific
operations. Concretely:

- **170 files** import from `lib/dynamodb` (handlers + tests).
- **16 files** use `dynamoDb.transactWrite` — cross-table atomic writes.
- **61+ files** pass hand-written `FilterExpression`, `KeyConditionExpression`, `IndexName`, `ExpressionAttributeNames`, `ExpressionAttributeValues`, and `ConsistentRead`.
- **26 GSI names** (`TournamentIndex`, `PlayerIndex`, `StatusIndex`, `ChallengerIndex`, `UserIdIndex`, `NotificationIdIndex`, `PublishedIndex`, `CompanyShowsIndex`, `PlayerTransfersIndex`, etc.) are hardcoded as string literals across handlers — grep `IndexName.*['"]` in `backend/functions`.
- **20+ files** use DynamoDB-specific write semantics: `ConditionExpression`, `attribute_not_exists`, `if_not_exists`, optimistic locking via `version = if_not_exists(version, :zero) + :one` — all leak into domain code.

The worst offender is [`backend/functions/matches/recordResult.ts`](../../backend/functions/matches/recordResult.ts)
(707 lines, ~80% DB orchestration per Plan 016 §2.2). It runs two separate `TransactWriteCommand`
calls because of DynamoDB's 100-item transaction limit (explicit comment at
[`recordResult.ts:283`](../../backend/functions/matches/recordResult.ts#L283)), plus standalone
updates and an N+1 scan in `autoCompleteEvent`. Porting this handler cleanly is the acid test for
any abstraction.

Also note:

- The existing handler factory [`backend/lib/handlers.ts`](../../backend/lib/handlers.ts) only
  covers **CREATE** today — `handlerFactory({ tableName, idField, entityName, requiredFields, … })`
  — and imports `dynamoDb` directly. It is already in use by
  [`createDivision.ts`](../../backend/functions/divisions/createDivision.ts),
  [`createStipulation.ts`](../../backend/functions/stipulations/createStipulation.ts),
  and [`createMatchType.ts`](../../backend/functions/matchTypes/createMatchType.ts).
  The GET/LIST/UPDATE/DELETE handlers in the same three domains are still hand-rolled.
- **This plan absorbs the in-progress handler-factory work** (formerly Issue #212). Rather
  than shipping the factory first and retargeting it later, the factory and the repository
  layer are designed together: factories consume repositories, so each factory becomes a
  one-liner dispatch — `repo.create(item)`, `repo.findById(id)`, `repo.list(filter)`,
  `repo.update(id, patch)`, `repo.delete(id)`. No intermediate DynamoDB step.
- Shared update-expression helper [`backend/lib/dynamodbUtils.ts`](../../backend/lib/dynamodbUtils.ts)
  (`getOrNotFound`, `buildUpdateExpression`) is the other shared dependency and needs a replacement.
- The [`backend/neon/`](../../backend/neon/) directory currently holds only `.env.neon`
  (untracked) — Postgres exploration is real intent but hasn't started, so this plan
  enables that work without committing to it.
- Tests mock `@aws-sdk/lib-dynamodb` directly
  (e.g. [`backend/lib/__tests__/dynamodb.test.ts:8-23`](../../backend/lib/__tests__/dynamodb.test.ts#L8-L23)) —
  the "17 silent test failures on `main`" todo is largely mock-shape drift that an in-memory
  repository would eliminate. The existing 11 factory tests at
  [`backend/lib/__tests__/handlers.test.ts`](../../backend/lib/__tests__/handlers.test.ts) also
  mock the SDK wrapper; they stay green during the migration and are rewritten on top of the
  in-memory repo driver in Wave 2.

**Deliverable for this plan is a design + migration roadmap — not the migration itself.**
Implementation will ship in a separate PR (or, more realistically, a series of PRs in the
migration order described below).

## Goals and Non-Goals

**In scope**

- Per-aggregate domain interfaces that express operations in domain terms
  (`findById`, `listBySeason`, `recordMatchResult`) — **no** `pk`, `sk`, `IndexName`,
  or `ExpressionAttributeValues` in any signature.
- A `DynamoRepositories` implementation that wraps the current `lib/dynamodb.ts` calls
  so current behavior is preserved bit-for-bit during the transition.
- A cross-aggregate transaction/unit-of-work abstraction that both DynamoDB
  `TransactWriteItems` *and* Postgres `BEGIN/COMMIT` can satisfy.
- A driver-selection factory (env-var controlled) so swapping the implementation
  is a config change, not a code change.
- An in-memory implementation for unit testing.
- A migration sequence across the existing ~170 handlers.
- **Generalized handler factory** — extend [`backend/lib/handlers.ts`](../../backend/lib/handlers.ts)
  beyond CREATE to cover GET-by-id, LIST, UPDATE, DELETE. Each factory takes a `repo` (not a
  `tableName`) and becomes a thin dispatch into repository methods. This absorbs the remaining
  steps of the Issue #212 factory work.

**Out of scope**

- Writing the Postgres / Neon implementation itself (that's follow-on work, unblocked by this plan).
- Designing the relational schema (belongs to the Neon PR; Plan 016 sketches direction).
- Writing an ORM. We ship a narrow interface with hand-written implementations.
- Changing any handler's external HTTP contract (request/response shape) — the factory
  generalization preserves the current `201 Created` / `200 OK` / `400` / `404` / `500`
  response shapes emitted by [`backend/lib/response.ts`](../../backend/lib/response.ts).
- Refactoring business logic inside handlers. The repo layer is a pure extraction; domain
  logic stays where it is until a follow-up pass.
- Changing Lambda authorizer, response helpers, or `asyncLambda.ts`.

## Files to Modify

### New files

| File | Action | Purpose |
|------|--------|---------|
| `backend/lib/repositories/types.ts` | Create | Shared domain types (`Player`, `Match`, `Championship`, …). Move/mirror from frontend TypeScript interfaces; no DB-specific fields (no `pk`/`sk`). |
| `backend/lib/repositories/errors.ts` | Create | Domain exceptions: `NotFoundError`, `ConflictError` (maps to `TransactionCanceledException` / unique-violation), `ConcurrencyError` (optimistic lock failure). Handlers catch these, not SDK errors. |
| `backend/lib/repositories/unitOfWork.ts` | Create | `UnitOfWork` / `runInTransaction(fn)` abstraction — see §"Transaction boundary" below. Declares the interface only. |
| `backend/lib/repositories/PlayersRepository.ts` | Create | Interface for the Players aggregate (`findById`, `list`, `listWithWrestlers`, `create`, `update`, `delete`, `incrementRecord(playerId, { wins?, losses?, draws? })`, `findByUserId`). |
| `backend/lib/repositories/MatchesRepository.ts` | Create | Matches aggregate (`findById`, `list({ status, playerId, seasonId, … })`, `listByTournament`, `listCompleted`, `schedule`, `updateMatch`, `recordResult`, `delete`). |
| `backend/lib/repositories/ChampionshipsRepository.ts` | Create | Championships + ChampionshipHistory together — they're one aggregate. (`findById`, `list`, `getCurrentReign(championshipId)`, `startReign`, `endReign`, `incrementDefenses`, `listHistory`.) |
| `backend/lib/repositories/TournamentsRepository.ts` | Create | Tournaments aggregate. |
| `backend/lib/repositories/SeasonsRepository.ts` | Create | Seasons + SeasonStandings together. (`findActive`, `listStandings(seasonId)`, `upsertStanding`.) |
| `backend/lib/repositories/DivisionsRepository.ts` | Create | Divisions — smallest surface, starts migration. |
| `backend/lib/repositories/StipulationsRepository.ts` | Create | Stipulations — single-table leaf. |
| `backend/lib/repositories/MatchTypesRepository.ts` | Create | MatchTypes — single-table leaf. |
| `backend/lib/repositories/EventsRepository.ts` | Create | Events + EventCheckIns. |
| `backend/lib/repositories/ContendersRepository.ts` | Create | ContenderRankings + ContenderOverrides + RankingHistory (one aggregate). |
| `backend/lib/repositories/FantasyRepository.ts` | Create | FantasyConfig + FantasyPicks + WrestlerCosts. |
| `backend/lib/repositories/PromosRepository.ts` | Create | Promos + reactions. |
| `backend/lib/repositories/ChallengesRepository.ts` | Create | Challenges. |
| `backend/lib/repositories/StablesRepository.ts` | Create | Stables + StableInvitations. |
| `backend/lib/repositories/TagTeamsRepository.ts` | Create | TagTeams. |
| `backend/lib/repositories/TransfersRepository.ts` | Create | TransferRequests. |
| `backend/lib/repositories/StorylineRequestsRepository.ts` | Create | StorylineRequests. |
| `backend/lib/repositories/NotificationsRepository.ts` | Create | Notifications. |
| `backend/lib/repositories/AnnouncementsRepository.ts` | Create | Announcements. |
| `backend/lib/repositories/VideosRepository.ts` | Create | Videos. |
| `backend/lib/repositories/CompaniesRepository.ts` | Create | Companies + Shows. |
| `backend/lib/repositories/MatchmakingRepository.ts` | Create | Presence + MatchmakingQueue + MatchInvitations. |
| `backend/lib/repositories/OverallsRepository.ts` | Create | WrestlerOveralls. |
| `backend/lib/repositories/SiteConfigRepository.ts` | Create | SiteConfig. |
| `backend/lib/repositories/SeasonAwardsRepository.ts` | Create | SeasonAwards. |
| `backend/lib/repositories/UsersRepository.ts` | Create | Users (already half-Cognito, half-Players). |
| `backend/lib/repositories/index.ts` | Create | Factory: exports `getRepositories()` which reads `DB_DRIVER` env var and returns the bundle of repository instances + the `UnitOfWork` factory. Default driver = `dynamo`. |
| `backend/lib/repositories/dynamo/*.ts` | Create (one per repo) | DynamoDB implementations. Each file wraps calls that are currently inline in handlers. Existing `buildUpdateExpression` moves here. |
| `backend/lib/repositories/dynamo/DynamoUnitOfWork.ts` | Create | Implements `UnitOfWork` by buffering operations and flushing via one or more `TransactWriteCommand` calls. Handles the 100-item chunking that `recordResult.ts:283` currently handles inline. |
| `backend/lib/repositories/inMemory/*.ts` | Create (one per repo) | Minimal in-memory stubs backed by `Map`s, usable from tests. |
| `backend/lib/repositories/inMemory/InMemoryUnitOfWork.ts` | Create | Records staged ops and commits them to the in-memory stores on `commit()`. |
| `backend/lib/repositories/__tests__/*.test.ts` | Create | Unit tests that exercise each interface against both the `dynamo` (mocked SDK) and `inMemory` implementations — contract tests. |

### Modified files

| File | Action | Purpose |
|------|--------|---------|
| `backend/lib/handlers.ts` | Modify (major) | (1) Retarget existing `handlerFactory` (CREATE) from `tableName`+`dynamoDb.put` to a `repo: { create }` callback. (2) Add sibling factories for the other CRUD shapes: `getHandlerFactory({ repo, idParam, entityName })`, `listHandlerFactory({ repo, entityName, filterBuilder? })`, `updateHandlerFactory({ repo, idParam, entityName, requiredFields?, optionalFields?, nullableFields?, validate?, buildPatch? })`, `deleteHandlerFactory({ repo, idParam, entityName, preDelete? })`. Rename the original factory to `createHandlerFactory` and keep `handlerFactory` as a deprecated alias for one release cycle. Each factory owns: body parse, validation, error → HTTP response mapping (`NotFoundError` → 404, `ConflictError` → 409, `ConcurrencyError` → 409, `badRequest` for missing fields, `serverError` for unexpected). |
| `backend/lib/__tests__/handlers.test.ts` | Modify | Existing 11 tests (all CREATE path) migrate to the in-memory repo driver instead of mocking `@aws-sdk/lib-dynamodb` via the `dynamoDb` wrapper. Add parallel test suites for the new GET / LIST / UPDATE / DELETE factories. Reuse the `invoke(handler, event)` helper already in the file. |
| `backend/lib/dynamodbUtils.ts` | Modify → eventually Delete | `getOrNotFound` and `buildUpdateExpression` are internals of the Dynamo repo layer. Move their bodies into `backend/lib/repositories/dynamo/util.ts`; keep the exports in `dynamodbUtils.ts` as thin re-exports during migration, then delete once no handler imports them directly. |
| `backend/lib/dynamodb.ts` | Keep then shrink | Stays as the low-level SDK wrapper that *only* `backend/lib/repositories/dynamo/*.ts` imports. After migration, `TableNames` lives here but nothing in `backend/functions/` imports this file. |
| `backend/functions/**/*.ts` (~170 files) | Modify | Replace `import { dynamoDb, TableNames }` with `import { getRepositories }` (or destructure specific repos). Every `dynamoDb.xxx({ TableName, … })` becomes a domain-named repo call. Migration sequence in §"Dependencies & Order". |
| `backend/serverless.yml` | Modify | Add `DB_DRIVER: ${env:DB_DRIVER, 'dynamo'}` to `provider.environment` so selection is stage-aware. Leave all `*_TABLE` env vars intact — the `dynamo` driver still needs them. |
| `backend/package.json` | Modify | No new runtime deps for this plan. (Postgres/Kysely deps land with the Postgres driver PR — out of scope.) |
| `backend/functions/**/__tests__/*.test.ts` | Modify | Update tests to use the in-memory repository instead of mocking `@aws-sdk/lib-dynamodb`. Resolves the mock-drift problem called out in the "Backend tests in CI" todo. |

## Design Decisions

### 1. One interface per aggregate, not per table

36 tables collapse to ~20 aggregates. Championships + ChampionshipHistory are one aggregate
(you never read one without thinking about the other). Seasons + SeasonStandings are one.
Contenders + ContenderOverrides + RankingHistory are one. This matches how the domain
actually talks; it also means fewer interfaces (~20) to re-implement when swapping drivers.

### 2. Methods speak domain, not DB

Good: `championships.getCurrentReign(championshipId)`, returns `Reign | null`.
Bad: `championships.query({ KeyConditionExpression, FilterExpression: 'attribute_not_exists(lostDate)', ScanIndexForward: false, Limit: 1 })`.

This is the whole point. If a repo method signature contains `IndexName`, `KeyConditionExpression`,
or `ExpressionAttributeValues`, it's not a repository — it's a DynamoDB pass-through with lipstick.
The review criterion during implementation: **could a Postgres implementor write this method
without reading the DynamoDB implementation?** If no, rename/reshape the method.

### 3. Return domain types, not `Record<string, unknown>`

Current `dynamoDb.get` returns `Record<string, unknown>`, which is why `.ts` files are full of
`as string`, `as number`, `as any` casts (see `getStandings.ts:73`, `recordResult.ts:48`).
Repositories return typed entities. Type casts move into the repo boundary — one place, not 170.
Types live in `backend/lib/repositories/types.ts` and can be imported by both frontend and
backend (via a shared path) in a later pass, eliminating the `frontend/src/types/index.ts` drift.

### 4. Transaction boundary: `UnitOfWork` with `runInTransaction(fn)`

This is the hardest part. `recordResult.ts` does **cross-aggregate** writes (match + players +
season standings + championship + history + tournament + events + overrides) and needs some
of them to be atomic. Postgres gives us `BEGIN…COMMIT`; DynamoDB gives us `TransactWriteItems`
with a 100-item cap.

**Interface** (in `unitOfWork.ts`):

- `runInTransaction(fn: (tx: UnitOfWork) => Promise<T>): Promise<T>` — the public entry point.
- `UnitOfWork` exposes *the same aggregate repositories* but all their mutations stage into the
  transaction instead of being sent immediately (e.g., `tx.players.incrementRecord(...)`).
- On `fn` resolve, the UoW flushes; on throw, it aborts.

**Dynamo implementation**:

- Stages `TransactWriteItem`s in memory.
- On flush, splits into ≤100-item chunks and runs them as sequential `TransactWriteCommand`s.
- This matches `recordResult.ts:287` + `recordResult.ts:434` (the existing two-transaction split)
  but formalizes it. **Subtlety:** sequential chunks are not globally atomic. We must either
  (a) accept the current behavior (split is already non-atomic — see the "Championship History"
  partial-failure note in Plan 016 §2.2), or (b) gate the split by an idempotency key so re-runs
  are safe. Pick (a) for the interface (matches today's semantics) and leave (b) as a follow-up
  if the Postgres migration would make it free.
- Reads inside the transaction go straight through to the DB (no read-your-own-writes across
  staged operations, since DynamoDB transactions can't re-read uncommitted writes either).

**Postgres implementation** (future):

- Wraps `BEGIN…COMMIT`, mutations execute immediately inside the transaction, reads see
  pending writes. The interface allows but does not require staging.

**In-memory implementation**:

- Records staged ops; on `commit()`, applies to `Map`s; on `rollback()`, discards.

The contract is deliberately **weaker than Postgres** (no read-your-own-writes in the
transaction) so both drivers satisfy it. Handlers written against the interface run correctly
on both.

### 5. Driver selection

`backend/lib/repositories/index.ts` exports:

- `getRepositories()` — returns `{ players, matches, championships, …, runInTransaction }`.
- Implementation chosen once per cold-start from `process.env.DB_DRIVER` (`'dynamo' | 'postgres' | 'memory'`; default `'dynamo'`).
- Result is cached at module scope so Lambda warm invocations don't re-construct repos.

### 6. Write conditions and optimistic locking

Today handlers sprinkle `ConditionExpression`, `attribute_not_exists`, and
`version = if_not_exists(version, :zero) + :one`. These become repository method options:

- Existence/non-existence: `repo.create(item)` throws `ConflictError` if the item exists.
- Optimistic locking: mutations accept `expectedVersion?: number`. `ConcurrencyError` on mismatch.
- Status guards (`ConditionExpression: '#status = :pending OR #status = :scheduled'`): encoded
  in the method itself — e.g., `matches.recordResult(matchId, result)` fails with `ConflictError`
  if status is not pending/scheduled.

Postgres implementations use `WHERE version = ?` / `WHERE status IN (...)` clauses; DynamoDB
implementations keep the existing condition expressions. Either way, handlers don't see the
mechanism.

### 7. Handler factory — generalized to full CRUD

Today [`backend/lib/handlers.ts`](../../backend/lib/handlers.ts) has one factory
(`handlerFactory` for CREATE) that imports `dynamoDb` directly. Generalize it so each CRUD
shape has its own factory, and every factory consumes a **repository** — not a table name:

| Factory | Signature (sketch) | Dispatches to |
|---|---|---|
| `createHandlerFactory` (rename of `handlerFactory`) | `{ repo: { create }, idField, entityName, requiredFields, optionalFields?, nullableFields?, defaults?, validate?, buildItem? }` | `repo.create(item)` → `created(item)` |
| `getHandlerFactory` | `{ repo: { findById }, idParam, entityName }` | `repo.findById(id)` → `success(item)` or `notFound` |
| `listHandlerFactory` | `{ repo: { list }, entityName, filterBuilder?(event) }` | `repo.list(filter)` → `success(items)` |
| `updateHandlerFactory` | `{ repo: { findById, update }, idParam, entityName, optionalFields, nullableFields, validate?, buildPatch? }` | `repo.update(id, patch, { expectedVersion? })` → `success(item)` |
| `deleteHandlerFactory` | `{ repo: { findById, delete }, idParam, entityName, preDelete?(item) }` | `repo.delete(id)` → `success({ message })` |

Responsibilities stay identical to what [`handlerFactory`](../../backend/lib/handlers.ts#L19-L73)
already does: parse body via `parseBody`, enforce required/optional/nullable fields, call the
`validate` hook if present, allow a `buildItem` / `buildPatch` hook for per-entity overrides,
map errors to HTTP responses via `badRequest` / `notFound` / `serverError`. The only change is
*where the data goes* — `repo.xxx` instead of `dynamoDb.xxx`.

The domain errors defined in §1 (`NotFoundError`, `ConflictError`, `ConcurrencyError`) are caught
at the factory boundary and mapped to 404/409/409 respectively. Handlers that use the factory
never see SDK error types.

This subsumes the in-progress Issue #212 work. Concretely:

- Step 1 (factory exists) and Step 2 (unit tests) of #212 are already landed and stay.
- Step 3 of #212 (migrating `createDivision` / `createStipulation` / `createMatchType`) is
  already done — those three handlers continue to use the CREATE factory, just through the
  `repo` option instead of `tableName`.
- Steps that would have followed #212 (migrate more create handlers, and later cover other
  CRUD verbs) become Waves 2–4 of this plan.

**Factory-or-direct rule of thumb**: use a factory when the handler is pure CRUD passthrough
(the body maps 1:1 to a stored field, no cross-aggregate reads, no custom response shape).
Handlers with non-trivial logic (`recordResult.ts`, `getStandings.ts`, `getDashboard.ts`) use
the repos directly — forcing them through a factory would bloat the factory API surface.

## Implementation Steps

Work in waves. Each wave is a mergeable PR. Test suite + lint + typecheck must stay green after
each wave. **Keep the old `dynamoDb` import path alive until the final wave** so partial migration
is safe.

### Wave 1 — Foundation (no handler changes)

1. Add `DB_DRIVER` env var to `backend/serverless.yml:10-54` (defaults to `dynamo`; no
   infrastructure change).
2. Create `backend/lib/repositories/types.ts` by mirroring the entity shapes from
   `frontend/src/types/index.ts` (Player, Match, Championship, Season, Division, Tournament,
   Event, Challenge, Promo, Stable, TagTeam, etc.). No DB fields; strip any ID mangling.
3. Create `backend/lib/repositories/errors.ts` with `NotFoundError`, `ConflictError`,
   `ConcurrencyError`. Each carries enough context for response helpers to map cleanly.
4. Create `backend/lib/repositories/unitOfWork.ts` defining the `UnitOfWork` interface and the
   `runInTransaction` signature. No implementation yet.
5. Create `backend/lib/repositories/index.ts` with `getRepositories()` stub that throws "no
   driver registered" — drivers register themselves in later waves.

### Wave 2 — Pilot: Divisions, Stipulations, MatchTypes + generalized factory

Chosen because (a) they're the simplest domains — single table, no transactions, no GSIs —
and (b) their CREATE handlers already run through `handlerFactory`, so this wave validates
the repo layer *and* the factory generalization in one coordinated step. This wave absorbs
the remaining Issue #212 work.

6. Define `DivisionsRepository`, `StipulationsRepository`, `MatchTypesRepository` interfaces
   (`findById`, `list`, `create`, `update`, `delete`). No `tableName` in any signature.
7. Implement `backend/lib/repositories/dynamo/DivisionsRepository.ts` etc. Move the
   `dynamoDb.*` calls from [`createDivision.ts`](../../backend/functions/divisions/createDivision.ts),
   [`getDivisions.ts`](../../backend/functions/divisions/getDivisions.ts),
   [`updateDivision.ts`](../../backend/functions/divisions/updateDivision.ts),
   [`deleteDivision.ts`](../../backend/functions/divisions/deleteDivision.ts) into the repo.
   Same for stipulations and match types. This is where `getOrNotFound` and
   `buildUpdateExpression` bodies relocate to (as `backend/lib/repositories/dynamo/util.ts`
   internals — not exported).
8. Implement in-memory counterparts
   (`backend/lib/repositories/inMemory/DivisionsRepository.ts` etc.) backed by `Map`s.
9. Register both drivers in `backend/lib/repositories/index.ts`. `getRepositories()` now
   returns real implementations (keyed by `DB_DRIVER`).
10. **Generalize the handler factory** — in [`backend/lib/handlers.ts`](../../backend/lib/handlers.ts):
    - Rename the existing `handlerFactory` to `createHandlerFactory`. Change its options
      from `tableName` to `repo: { create }`. Keep `handlerFactory` exported as a deprecated
      alias of `createHandlerFactory` for one release cycle.
    - Add `getHandlerFactory`, `listHandlerFactory`, `updateHandlerFactory`,
      `deleteHandlerFactory` per the design in §7. Each factory maps domain errors
      (`NotFoundError` → 404, `ConflictError` / `ConcurrencyError` → 409) via the factory
      boundary, using the existing [`backend/lib/response.ts`](../../backend/lib/response.ts)
      helpers.
11. Update the three CREATE handlers
    ([`createDivision.ts`](../../backend/functions/divisions/createDivision.ts),
    [`createStipulation.ts`](../../backend/functions/stipulations/createStipulation.ts),
    [`createMatchType.ts`](../../backend/functions/matchTypes/createMatchType.ts)) to pass
    `repo: getRepositories().divisions` etc. instead of `tableName: TableNames.DIVISIONS`.
    These stay one-file, ~10-line handlers.
12. Migrate the GET / LIST / UPDATE / DELETE handlers in these three domains. Where the
    hand-rolled handler is pure CRUD (e.g., `getDivisions`, `deleteMatchType`), rewrite it
    on top of the new factory — these should also shrink to ~10 lines. Where there is
    non-trivial logic (e.g., `deleteDivision` checks "fails if players assigned" — see
    [backend/functions/divisions/deleteDivision.ts](../../backend/functions/divisions/deleteDivision.ts)),
    use `deleteHandlerFactory`'s `preDelete(item)` hook — which receives the fetched item and
    may throw `ConflictError('Cannot delete division with assigned players')`.
13. Rewrite the tests in these three domains
    ([`backend/functions/divisions/__tests__/*`](../../backend/functions/divisions/__tests__/),
    stipulations + matchTypes equivalents if present) to use the in-memory driver instead of
    mocking `@aws-sdk/lib-dynamodb`.
14. Rewrite [`backend/lib/__tests__/handlers.test.ts`](../../backend/lib/__tests__/handlers.test.ts):
    - The existing 11 CREATE tests flip from `mockPut` to asserting against the in-memory
      repo's state (`expect(repo.store.size).toBe(1)`).
    - Add parallel test suites for `getHandlerFactory`, `listHandlerFactory`,
      `updateHandlerFactory`, `deleteHandlerFactory` covering: happy path, missing body,
      missing required field, validator short-circuit, not-found (404), conflict (409),
      concurrency (409), DB error (500), and the `buildItem` / `buildPatch` / `preDelete` hooks.
15. Verify: `cd backend && npx tsc --project tsconfig.json --noEmit`, `npm run lint`, `npm test`.
    Also manually: run `npm run offline` with seeded DynamoDB Local and CRUD a division
    end-to-end from the admin UI to confirm the HTTP contract is unchanged.

### Wave 3 — Read-heavy leaves

16. Migrate domains whose handlers are mostly reads and whose writes are single-aggregate:
    Seasons, SeasonAwards, Announcements, Videos, Companies, Shows, Notifications, Overalls,
    SiteConfig. Handlers that are pure CRUD passthrough use the Wave 2 factories; the rest
    call the repos directly.
17. Each domain: define interface, implement Dynamo repo, implement in-memory repo, migrate
    handlers, migrate tests. One PR per domain to keep review scope sane.

### Wave 4 — Medium-complexity aggregates with GSIs

18. Migrate domains that use GSIs but no cross-aggregate writes: Players (uses `UserIdIndex`),
    Challenges (4 GSIs — biggest single GSI count), TagTeams, Stables, Transfers,
    StorylineRequests, Events, Promos.
19. GSI queries become named methods: `challenges.listByChallenger(userId)`,
    `challenges.listByStatus(status)`, etc.

### Wave 5 — Cross-aggregate without transactions

20. Migrate Standings (`getStandings.ts`), Dashboard (`getDashboard.ts`), Rivalries
    (`getRivalries.ts`), Statistics (`getStatistics.ts`), Activity (`getActivity.ts`).
21. These handlers read from many aggregates; each becomes a call to multiple repos. No writes,
    no UoW needed. This wave proves the composition story without transactional pressure.

### Wave 6 — Contenders & Fantasy (writes, but batched)

22. Implement `ContendersRepository` and `FantasyRepository`. Migrate
    `contenders/calculateRankings.ts` and `fantasy/calculateFantasyPoints.ts`. These write
    many items but don't need strict transactionality today (they're async-invoked, idempotent
    rebuild jobs) — use the repo's plain `upsert` methods, no UoW.

### Wave 7 — Transactional writes

23. Build `DynamoUnitOfWork` (stage + flush with 100-item chunking).
24. Build `InMemoryUnitOfWork`.
25. Migrate transactional handlers in order of increasing complexity:
    - [`championships/vacateChampionship.ts`](../../backend/functions/championships/vacateChampionship.ts) (small transactWrite)
    - [`challenges/respondToChallenge.ts`](../../backend/functions/challenges/respondToChallenge.ts)
    - [`matches/deleteMatch.ts`](../../backend/functions/matches/deleteMatch.ts)
    - [`tagTeams/approveTagTeam.ts`](../../backend/functions/tagTeams/approveTagTeam.ts),
      [`tagTeams/dissolveTagTeam.ts`](../../backend/functions/tagTeams/dissolveTagTeam.ts),
      [`tagTeams/deleteTagTeam.ts`](../../backend/functions/tagTeams/deleteTagTeam.ts).
26. **Final boss:**
    [`backend/functions/matches/recordResult.ts`](../../backend/functions/matches/recordResult.ts).
    Expected shape after migration:
    - Validate + parse body as today.
    - Open a UoW: `await runInTransaction(async tx => { … })`.
    - Inside: `tx.matches.recordResult(matchId, { winners, losers, isDraw, starRating, motn })`
      → handles the condition check (`status IN pending|scheduled`), optimistic `version` bump,
      and the match Update.
    - `tx.players.incrementRecord(winnerId, { wins: 1 })` per winner; `{ losses: 1 }` per loser;
      `{ draws: 1 }` if draw.
    - If `match.seasonId`: `tx.seasons.incrementStanding(seasonId, playerId, { … })` per
      participant.
    - On UoW commit (flush), if `match.isChampionship`: open a **second** UoW for championship
      updates (preserves today's semantics — two-phase, non-globally-atomic; see §"Transaction
      boundary"). Use `tx.championships.endReign` / `tx.championships.startReign` /
      `tx.championships.incrementDefenses`.
    - Tournament progression and event auto-completion stay as separate non-transactional
      calls to their repos — same as today.
    - Total `recordResult.ts` line count expected to drop from ~707 to ~200. All
      `UpdateExpression` / `ExpressionAttributeValues` strings gone.
27. Rewrite `recordResult` tests to use the in-memory driver with a scripted initial state.

### Wave 8 — Admin and seed scripts

28. Migrate `backend/scripts/seed-data.ts` and `backend/scripts/clear-data.ts` to use
    `getRepositories()`. This is the acceptance test for "can you boot the app against a
    different driver and still seed it?"
29. Migrate `backend/functions/admin/*.ts` (clearAll, seedData, exportData, dataTransferConfig).

### Wave 9 — Clean up

30. Confirm no file under `backend/functions/` imports from `backend/lib/dynamodb.ts` or
    `backend/lib/dynamodbUtils.ts`. Grep is the gate.
31. Delete `backend/lib/dynamodbUtils.ts` (contents already absorbed into
    `backend/lib/repositories/dynamo/util.ts`).
32. Shrink `backend/lib/dynamodb.ts` to the SDK client + `TableNames` + the pagination-aware
    `scanAll`/`queryAll` primitives. Mark the file as internal to `backend/lib/repositories/dynamo/`
    via a comment.
33. Remove the deprecated `handlerFactory` alias in [`backend/lib/handlers.ts`](../../backend/lib/handlers.ts)
    — by this point all callers use `createHandlerFactory` or one of the other CRUD factories.
34. Update [`CLAUDE.md`](../../CLAUDE.md) to document the new pattern: "Handlers import from
    `backend/lib/repositories`, never from `backend/lib/dynamodb` directly. Pure-CRUD handlers
    use the factories in `backend/lib/handlers.ts`."

## Dependencies & Order

- **Wave 1 gates everything** (interfaces + UoW stub).
- **Wave 2 gates Waves 3+** because it ships the generalized factories that every
  pure-CRUD handler in later waves reuses. Landing Waves 3+ before Wave 2's factories would
  mean re-doing each handler when the factories land.
- **Waves 3–6 are independent of each other after Wave 2** — parallelizable across contributors
  (one PR per domain).
- **Wave 7 depends on Wave 6** (needs `ContendersRepository` etc. since `recordResult.ts`
  triggers ranking/fantasy recalculation as fire-and-forget).
- **Wave 7 also depends on `DynamoUnitOfWork`**, which depends on the individual repo
  implementations being ready (so they can stage their ops into the UoW).
- **Wave 8 depends on Waves 2–7** (scripts touch everything).
- **Wave 9 depends on Wave 8** (deletion requires zero remaining imports; removing the
  `handlerFactory` alias requires every CREATE handler to use `createHandlerFactory`).

## Testing & Verification

### Per-wave

- `cd backend && npx tsc --project tsconfig.json --noEmit` passes (per CLAUDE.md rule).
- `cd backend && npm run lint` passes.
- `cd backend && npm test` passes. Each migrated handler has at least one in-memory-driver test.
- `cd frontend && npx tsc --project tsconfig.app.json --noEmit` passes (types may shift if we
  share domain types; the frontend must still build).

### Contract tests (new, one-time)

- `backend/lib/repositories/__tests__/contract.test.ts` — parameterized test suite that runs the
  same scenarios against both `dynamo` (with SDK mocks) and `inMemory` drivers. Guarantees the
  two implementations have equivalent observable behavior. This is the mechanism that makes
  adding a Postgres driver later safe: the contract tests will light up red until the new driver
  passes them.

### Manual verification

- Run `npm run offline` with `DB_DRIVER=dynamo` (local DynamoDB) — golden path unchanged.
- Run the backend test suite with `DB_DRIVER=memory` — ensures handlers actually work against
  the in-memory driver end-to-end (not just via mocks).
- Deploy to `devtest` stage and run the existing smoke path: create a player, schedule a match,
  record a result (the transactional hot path).
- Seed/clear on dev: `cd backend && npm run seed` and `npm run clear-data` after wave 8.

### Regression risk hotspots

- Pagination: `scanAll` / `queryAll` currently iterate via `LastEvaluatedKey`. Each repo method
  that returns a list must preserve this (or expose an explicit page cursor).
- Optimistic locking: `recordResult.ts`, `vacateChampionship.ts`, and tournament updates all
  depend on `version = if_not_exists(version, :zero) + :one`. Missed translation → silent lost
  updates. Contract tests must cover the concurrent-write case explicitly.
- Condition guards: existing `ConditionExpression: '#status = :pending OR #status = :scheduled'`
  semantics must be preserved by the repo method — otherwise we could record results against
  already-completed matches.

## Risks & Edge Cases

1. **The two-transaction split in `recordResult.ts` is not globally atomic today.**
   The abstraction will preserve that. If the championship write fails after the core
   transaction has committed, state is inconsistent. This is current behavior (per Plan 016 §2.2
   and the `recordResult.ts:283` comment) and is explicitly *not* a goal to fix here — but it
   *is* a goal not to make it worse. Document clearly in the UoW interface.
2. **`transactWrite` 100-item limit on DynamoDB.** `DynamoUnitOfWork.flush()` must chunk. A
   transaction with 150 staged ops silently becomes two separate Dynamo transactions — same
   atomicity caveat as above. Log a warning when chunking occurs so observability catches it.
3. **Read-your-own-writes inside a transaction.** Postgres supports it; DynamoDB doesn't (and
   our UoW semantics explicitly disallow it). Any handler that depends on "I just wrote X inside
   the transaction, now read X" will break under DynamoDB. None do today (verified by reading
   `recordResult.ts` and other transactional handlers), but the contract test suite must pin
   this: writing inside a UoW and then reading via the same UoW returns the *pre-transaction*
   state.
4. **GSI name leakage into method names.** Avoid `listByStatusIndex`; the method is
   `listByStatus` regardless of whether the underlying implementation uses a GSI, a filtered
   scan, or a SQL `WHERE`. Review hot: during implementation, reject any method name that
   contains the word `Index`.
5. **Frontend type duplication.** `backend/lib/repositories/types.ts` and
   `frontend/src/types/index.ts` will drift unless shared. Short-term, duplicate and accept drift.
   Long-term (follow-up plan), lift shared types into a top-level `shared/` directory or a TS
   project reference — this is a visible but contained cost.
6. **Handler factory churn.** `backend/lib/handlers.ts` today has one factory (CREATE) used
   by `createDivision`, `createStipulation`, `createMatchType`. Wave 2 both renames it
   (`handlerFactory` → `createHandlerFactory`) and swaps its option (`tableName` → `repo`).
   Keeping `handlerFactory` exported as a deprecated alias for one release cycle avoids a
   wide churn PR — nobody outside the three CREATE handlers imports it today, but the alias
   is cheap insurance.
7. **Factory surface creep.** The four new factories (`get`/`list`/`update`/`delete`) risk
   accumulating hooks (`validate`, `buildPatch`, `preDelete`, etc.) until the factory options
   are more complex than the handler they replaced. Mitigation: for any handler whose options
   object exceeds ~8 fields or needs multiple hooks, skip the factory and call the repo
   directly. The "factory-or-direct rule of thumb" in §7 exists for this.
8. **In-memory repo behavior must match Dynamo.** Tests that pass against the in-memory
   driver but fail in production are worse than today's mock drift. Contract tests (§"Testing
   & Verification") are the gate — they run the same scenarios against both drivers.
9. **The `seed-data.ts` 658-line monolith ties to the "Modular Seed Data" todo.** Wave 8 either
   does a minimal port to repositories (preserving the monolith) or the two todos are tackled
   together. The minimal port is strictly safer; recommend that path and leave modularization
   for the separate todo.
10. **CI gap already tracked in the "Backend tests in CI" todo.** This plan assumes that CI
    actually runs backend tests. If it doesn't by the time this plan executes, we are relying on
    local-only verification for ~170 file changes — unsafe. Land the CI wiring (that other todo)
    before Wave 4.

## Success Criteria

- Zero imports of `backend/lib/dynamodb` or `backend/lib/dynamodbUtils` from any file under
  `backend/functions/` or `backend/scripts/`.
- Every handler under `backend/functions/` uses `getRepositories()`, `runInTransaction`, or a
  handler-factory from `backend/lib/handlers.ts` (which itself only calls repositories).
- `backend/lib/handlers.ts` exports all five CRUD factories (`createHandlerFactory`,
  `getHandlerFactory`, `listHandlerFactory`, `updateHandlerFactory`, `deleteHandlerFactory`)
  and no longer imports from `backend/lib/dynamodb.ts`. Every pure-CRUD handler (Divisions,
  Stipulations, MatchTypes CRUD + any equivalents in later waves) uses a factory.
- A single env-var change (`DB_DRIVER=memory`) runs the full test suite against the in-memory
  driver without modifying any handler.
- A Postgres implementation can be added by creating `backend/lib/repositories/postgres/*.ts`
  and registering it in `backend/lib/repositories/index.ts` — zero changes to any file outside
  `backend/lib/repositories/postgres/`. This is the load-bearing acceptance criterion.
