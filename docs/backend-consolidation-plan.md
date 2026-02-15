# Backend Consolidation Plan: Lambdas & Resources

## Current State (Snapshot)

| Category | Count | Notes |
|----------|--------|--------|
| **Lambda functions** | **~79** unique handlers | 80 HTTP-triggered entries; `serveSwaggerUi` and `serveOpenApiSpec` share one handler |
| **DynamoDB tables** | **19** | Players, Matches, Championships, ChampionshipHistory, Tournaments, Seasons, SeasonStandings, Divisions, Events, ContenderRankings, RankingHistory, FantasyConfig, WrestlerCosts, FantasyPicks, SiteConfig, Challenges, Promos, Stipulations, MatchTypes |
| **Other** | Cognito (Pool + Client + 4 groups), S3 bucket, CloudFront, API Gateway | Single API, single frontend bucket |

### Lambda breakdown by domain

| Domain | Handlers | Typical pattern |
|--------|----------|------------------|
| Auth | 4 | authorizer, postConfirmation, createAdminUser, login |
| Users (admin) | 3 | listUsers, updateUserRole, toggleUserEnabled |
| Admin / site | 4 | getSiteConfig, updateSiteConfig, clearAll, seedData |
| Players | 6 | getMyProfile, updateMyProfile, getPlayers, createPlayer, updatePlayer, deletePlayer |
| Matches | 3 | getMatches, scheduleMatch, recordResult |
| Championships | 6 | getChampionships, createChampionship, getChampionshipHistory, updateChampionship, deleteChampionship, vacateChampionship |
| Tournaments | 3 | getTournaments, createTournament, updateTournament |
| Standings | 1 | getStandings |
| Seasons | 4 | getSeasons, createSeason, updateSeason, deleteSeason |
| Divisions | 4 | getDivisions, createDivision, updateDivision, deleteDivision |
| Stipulations | 4 | getStipulations, createStipulation, updateStipulation, deleteStipulation |
| Match types | 4 | getMatchTypes, createMatchType, updateMatchType, deleteMatchType |
| Events | 5 | getEvents, getEvent, createEvent, updateEvent, deleteEvent |
| Contenders | 2 | getContenders, calculateRankings |
| Images | 1 | generateUploadUrl |
| Docs | 2 | serveDocs (Swagger + spec) |
| Statistics | 1 | getStatistics |
| Fantasy | 12 | config, wrestler costs, leaderboard, scoring, picks (submit/get/clear/all) |
| Challenges | 7 | getChallenges, getChallenge, create, respond, cancel, delete, bulkDelete |
| Promos | 7 | getPromos, getPromo, create, react, adminUpdate, delete, bulkDelete |

---

## Is “many Lambdas” bad practice?

**Short answer: No.** One Lambda per HTTP route is a valid and common pattern, especially with Serverless Framework. Benefits you already get:

- **Clear ownership** – Each file does one thing; easy to find and change.
- **Independent scaling** – Only hit endpoints scale (e.g. `getMatches` can scale separately from `calculateRankings`).
- **Blast radius** – A bug or deploy in one handler doesn’t affect others.
- **Testing** – Small, focused units; you already have good test coverage per handler.
- **IAM** – Same role today; if you ever split roles per domain, fine-grained functions make that easier.

**Downsides of the current “many Lambdas” setup:**

- **Operational surface** – More functions to monitor, log, and deploy (though Serverless handles this).
- **Cold starts** – More distinct functions can mean more cold paths unless traffic is high enough to keep each warm.
- **Configuration bulk** – `serverless.yml` is large; more repetition for CORS, authorizer, etc.
- **CloudFormation** – More resources (you’re already using `serverless-plugin-split-stacks`; consolidation would reduce stack size).

So the question is not “is this wrong?” but “do we want to **streamline** for maintainability and cost/ops without losing functionality?”

---

## Goal

- **Keep all existing functionality** (every current HTTP route and behavior).
- **Optionally reduce** the number of Lambda functions and the size of `serverless.yml` by grouping by **domain** and routing inside the handler (single Lambda per domain, or a few “router” Lambdas).
- **Leave DynamoDB tables as-is** unless we later do a separate data-model refactor (consolidation here is about Lambdas/API, not merging tables).

---

## Consolidation strategy: domain-based router Lambdas

**Idea:** One Lambda (or a small set) per **domain**, with an internal router that dispatches by `httpMethod` + `path` (or a single path with body/query). The external API stays the same: same paths, same methods, same auth. Only the **implementation** is grouped.

Example for **Players**:

- **Before:** 6 Lambdas – `getPlayers`, `createPlayer`, `updatePlayer`, `deletePlayer`, `getMyProfile`, `updateMyProfile`.
- **After:** 1 Lambda `players` with one handler that:
  - Reads `event.httpMethod` and `event.path` (or a single path like `/players` and parses proxy path).
  - Dispatches to internal functions: `getPlayers()`, `createPlayer()`, `updatePlayer()`, etc. (current logic moved into shared modules).

API Gateway stays the same:

- `GET /players` → Lambda `players` (route key `GET /players` → `getPlayers`)
- `POST /players` → Lambda `players` (→ `createPlayer`)
- `PUT /players/{playerId}` → Lambda `players` (→ `updatePlayer`)
- etc.

So the **public API contract does not change**; only the number of Lambda resources and the way we organize code.

---

## Recommended approach: phased consolidation

Keep all functionality; consolidate in phases so each step is deployable and testable.

### Phase 1 – Low-risk, high-reward (single-resource domains)

Combine domains that are **single-resource CRUD** and have no special timeouts or permissions:

| New single Lambda | Replaces | Handlers merged |
|-------------------|----------|------------------|
| `divisions` | getDivisions, createDivision, updateDivision, deleteDivision | 4 → 1 |
| `stipulations` | getStipulations, createStipulation, updateStipulation, deleteStipulation | 4 → 1 |
| `matchTypes` | getMatchTypes, createMatchType, updateMatchType, deleteMatchType | 4 → 1 |
| `seasons` | getSeasons, createSeason, updateSeason, deleteSeason | 4 → 1 |

**Implementation pattern:**

- New file: `functions/divisions/handler.ts` (or `router.ts`) that:
  - Parses `event.requestContext.http.method` and `event.path` / `pathParameters`.
  - Calls existing logic (e.g. move `getDivisions.ts` → `divisions/getDivisions.ts` as a pure function, same for create/update/delete).
- In `serverless.yml`: one function `divisions` with multiple `http` events (same paths as today). All events point to the same handler; the handler routes internally.

**Result after Phase 1:** 79 − 12 = **67** Lambdas (16 handlers merged into 4).

### Phase 2 – Medium-sized domains

Apply the same pattern to:

| New Lambda | Replaces | Handlers merged |
|------------|----------|------------------|
| `players` | getPlayers, createPlayer, updatePlayer, deletePlayer, getMyProfile, updateMyProfile | 6 → 1 |
| `championships` | getChampionships, createChampionship, getChampionshipHistory, updateChampionship, deleteChampionship, vacateChampionship | 6 → 1 |
| `events` | getEvents, getEvent, createEvent, updateEvent, deleteEvent | 5 → 1 |
| `challenges` | getChallenges, getChallenge, createChallenge, respondToChallenge, cancelChallenge, deleteChallenge, bulkDeleteChallenges | 7 → 1 |
| `promos` | getPromos, getPromo, createPromo, reactToPromo, adminUpdatePromo, deletePromo, bulkDeletePromos | 7 → 1 |

**Result after Phase 2:** 67 − 31 + 5 = **41** Lambdas.

### Phase 3 – Remaining CRUD and supporting domains

| New Lambda | Replaces | Handlers merged |
|------------|----------|------------------|
| `matches` | getMatches, scheduleMatch, recordResult | 3 → 1 |
| `tournaments` | getTournaments, createTournament, updateTournament | 3 → 1 |
| `admin` | getSiteConfig, updateSiteConfig, clearAll, seedData | 4 → 1 |
| `users` | listUsers, updateUserRole, toggleUserEnabled | 3 → 1 |
| `contenders` | getContenders, calculateRankings | 2 → 1 |
| `fantasy` | all 12 fantasy handlers | 12 → 1 |

**Result after Phase 3:** 41 − 27 + 6 = **20** Lambdas.

### Phase 4 – Leave as-is (or minimal merge)

Keep **one Lambda each** for:

- **Auth:** authorizer, postConfirmation, createAdminUser, login (different triggers/security; keep 4 or merge login + createAdminUser into one `auth` Lambda with 2 events).
- **Standings:** getStandings (1).
- **Images:** generateUploadUrl (1).
- **Docs:** serveSwaggerUi + serveOpenApiSpec (already 1 handler, 2 events).
- **Statistics:** getStatistics (1).

No DynamoDB table consolidation in this plan; table count stays at 19.

---

## Summary: before vs after (Lambdas only)

| Metric | Before | After (full consolidation) |
|--------|--------|-----------------------------|
| Lambda count | ~79 | ~20–25 |
| `serverless.yml` functions block | ~80 entries | ~25 entries |
| API surface (paths/methods) | Unchanged | Unchanged |
| Behavior | Unchanged | Unchanged |

---

## Implementation details (for any phase)

1. **Router pattern**  
   - One handler per domain, e.g. `functions/divisions/handler.ts`.  
   - Input: full API Gateway event.  
   - Route by `event.requestContext.http.method` and `event.path` (or `event.pathParameters`).  
   - Call existing business logic (extract from current handlers into pure functions in the same or a `lib/` folder).

2. **serverless.yml**  
   - Replace N function definitions with one per domain, each with multiple `http` events:
     ```yaml
     divisions:
       handler: functions/divisions/handler.handler
       events:
         - http:
             path: divisions
             method: get
             cors: *corsConfig
         - http:
             path: divisions
             method: post
             cors: *corsConfig
             authorizer: adminAuthorizer
         # ... put, delete with path parameter
     ```

3. **Auth**  
   - Preserve `authorizer: adminAuthorizer` on the same routes as today; the router runs after API Gateway, so auth is unchanged.

4. **Timeouts**  
   - For Lambdas that need longer timeouts (e.g. `clearAll`, `seedData`, `calculateRankings`, `recalculateWrestlerCosts`, `scoreCompletedEvents`), set `timeout: 29` on the **single** domain Lambda that will host them (e.g. `admin`, `fantasy`, `contenders`).

5. **Tests**  
   - Keep testing the **business logic** (the extracted functions) the same way.  
   - Add a small number of router tests: send mock `event` objects for each method/path and assert the correct handler is invoked and returns the same shape as before.

---

## Optional: DynamoDB table consolidation (out of scope for this plan)

Tables are already domain-focused. Possible future optimizations (only if you hit limits or need to simplify access patterns):

- **Reference data:** Stipulations and MatchTypes could live in a single “ReferenceData” table with PK `type` (e.g. `stipulation` / `matchType`) and SK = id. Not required for the Lambda consolidation above.
- **SiteConfig / FantasyConfig:** Already key-value; could be merged into one “Config” table with composite key. Again, optional.

Recommendation: **do not** merge tables as part of this consolidation. Do Lambda consolidation first; revisit tables only if you have a concrete need (e.g. cost, number of tables, or new access patterns).

---

## Recommendation

- **Current setup is valid.** You don’t *have* to consolidate; it’s a tradeoff.
- **If you want to streamline:** use the **phased, domain-based router** approach above so that:
  - All functionality is preserved.
  - API contract and auth stay the same.
  - You can stop after any phase (e.g. Phase 1 only) and still gain a meaningful reduction in Lambda count and config size.
- **Start with Phase 1** (divisions, stipulations, matchTypes, seasons) as a low-risk pilot; then apply the same pattern to the rest when comfortable.

If you want, next step can be: **implement Phase 1** (e.g. `divisions` router + serverless changes) and a short “how to add a new route” note so the pattern is clear for the rest of the domains.
