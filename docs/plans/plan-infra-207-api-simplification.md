# INFRA-207: One API Lambda behind `/{proxy+}` (routing in code)

Kanban ticket #207 [INFRA-01], "Decide on splitting the backend into domain services (CloudFormation 500-resource limit)".

Status: **decision draft v4**. Adversarial review rounds 1-3 were applied (see the Review log at the end). The decision (option C) stands. The migration gates, the offline auth path, the 2a verification and rollback steps, the resource-count guard thresholds, the access tests and the scope of cut-over check A changed.

Owner direction: *"simplify this as much as we can so we don't have this issue ... could include a major refactor. Everything should basically be driven via the API."*

---

## 1. Context and problem

The backend is one Serverless Framework v3 service (`backend/serverless.yml`) on REST API Gateway v1. It is split across nested stacks by `serverless-plugin-split-stacks` and `backend/stacks-map.js`.

The infrastructure grows with every endpoint. Each `http` event creates one `AWS::ApiGateway::Method`. Each new path also adds one CORS `OPTIONS` Method and one `AWS::ApiGateway::Resource` per new path segment. Each function adds a Function, a LogGroup, a Version and an API Gateway Permission.

Measured on 2026-11-24 with read-only `aws cloudformation list-stack-resources` / `apigateway get-resources`:

| | prod (`wwe-2k-league-api-dev`) | devtest (`wwe-2k-league-api-devtest`) |
|---|---|---|
| Root stack resources | **478 / 500** | **478 / 500** |
| Root: ApiGateway::Method | 281 (59% of root) | 281 |
| Root: ApiGateway::Resource / Function / LogGroup / Table | 44 / 43 / 43 / 41 | 44 / 43 / 43 / 41 |
| APINestedStack | 100 (all ApiGateway::Resource, 95 outputs) | 100 |
| OverflowNestedStack | 72 | 226 |
| PermissionsNestedStack / VersionsNestedStack | 37 / 47 | 37 / 51 |
| **Total resources across all stacks** | **734** | **892** |
| ApiGateway::Method total (of which OPTIONS) | 315 (151) | 401 (192) |
| API Gateway resources per RestApi (quota 300, L-01C8A9E0) | 166 | **215** |
| Lambda functions (all 1024 MB, same 7.3–7.8 MB zip) | 47 | 51 |

`serverless.yml` declares 51 functions, 209 `http` events (57 with `authorizer: adminAuthorizer`), 4 `schedule` events and 192 unique paths.

There are two hard walls:

1. **CloudFormation: 500 resources per stack.** Root only stays under it because `stacks-map.js` routes every new resource into Overflow and moves the per-deploy `Deployment` out of root. Overflow fills up too, and then rolls over to Overflow2 and onwards, each rollover taking a root slot. The plugin also does not count the 200-parameter limit.
2. **API Gateway: 300 resources per REST API.** Devtest is at 215. A service split or more nested stacks do nothing about this, because it is per API.

History: this has already broken deploys several times.
- April 2026: #295 and #297/#298/#300. The `/players/{proxy+}` attempt rolled back because `{proxy+}` cannot sit beside `{playerId}`.
- 2026-08-14: 502 resources, which led to `stacks-map.js`.
- 2026-09-10: 500 resources.
- November 2026: a nested-stack dependency cycle, which led to `check-stack-cycles.js`.

### What the code already has (verified)

- `backend/lib/router.ts` `createRouter` has a **`{proxy+}` fallback**. When `event.resource` contains `{proxy+}`, it regex-matches `event.path` and picks the match with the fewest path params, then the first declared. It returns 404 for no path and 405 for a wrong method, and rewrites `event.pathParameters` and `event.resource`. This path is unit-tested but unused.
- `dispatch()` enforces per-route `access` (`'public'` on GET only, `'self-service'`, or `{roles}`). When no gateway principal is present, it calls `lib/authenticate.ts`. That function verifies the same Cognito access token as `functions/auth/authorizer.ts`, writes the same `requestContext.authorizer` shape and checks deactivation. **The gateway authorizer is therefore already redundant for router-based handlers.**
- 34 `*/handler.ts` files export a `routes` table (admin, announcements, challenges, championships, companies, contenders, contracts, dashboard, divisions, events, injuries, locations, matches, matchTypes, notifications, overalls, players, progression, promos, rivalries, rivalries/messages, rivalries/notes, seasonAwards, seasons, shows, stables, stipulations, storylineRequests, tagTeams, tournaments, transfers, users, videos, wrestlers).
- Every Lambda ships the **same zip**. There is no `package.individually`. Merging functions therefore does not grow the artifact.
- `lib/response.ts` puts `Access-Control-Allow-Origin` on every Lambda response, 401s from `unauthorized()` included. The frontend refresh-on-401 path keeps working when 401s come from the Lambda.
- The live prod API has **no variable-named child of `/`** (`get-resources` read-only check). A root-level `/{proxy+}` therefore cannot hit the April sibling conflict.
- CloudWatch `Invocations` over the last 90 days on prod: `login` **0**, `createAdminUser` **0**, `generateUploadUrl` 214.
- `serverless-offline` 13 with `--noPrependStageInUrl --prefix dev` passes `event.path = request.path`, which keeps the `/dev` prefix (`HttpServer.js:450-453`). `event.resource` becomes `/dev/{proxy+}`. The offline adapter must strip `/dev` (see §5.9).

## 2. Options considered

| Option | Verdict | Why |
|---|---|---|
| **A. Domain split into 5 services** (ticket proposal, `plan-service-split.md`) | Rejected | It **does not stop growth**: every endpoint still adds about 2 Methods plus Resources, now in N stacks. It does not touch the 300-per-API quota. It needs a custom domain, an ACM cert, Namecheap DNS, a CSP change, rotated URL secrets and new frontend URLs (`/roster/players`...). Base paths cannot split `/players` (4 functions) or `/admin` (10 functions). The router would need base-path rewrites. It also brings N ordered deploys, `ImportValue` locks and worse devtest flip-flop. Its first slice (fantasy) no longer exists. Simplicity 3/10. |
| A'. Minimal split: satellite services on the shared RestApi | Rejected | It moves the wall instead of removing it. The 300 quota still applies. Several stacks deploy the same stage, so the last one wins. |
| **B. HTTP API v2 + catch-all** | Rejected for now | It gives zero growth per endpoint, but only the same as option C. It costs a new API id, the loss of the `/dev`/`/devtest` stage path, URL changes in secrets, `.env*`, the vite proxy, e2e, openapi and `docsEmbed`, devtest id churn on every flip-flop deploy, payload format pinned to `1.0`, no GatewayResponses, and lowercased headers. A JWT authorizer adds nothing, because it cannot check deactivation. It is a possible later step once CI reads the URL from stack outputs. |
| Keep consolidating Lambdas + `ANY` per path | Rejected | `ANY` saves Methods but each path still costs a Resource and an OPTIONS method, so growth continues. |
| Status quo + CI resource guard | Rejected as a fix | It detects the problem but does not remove it. The guard is kept as a safety net (§7). |
| **C. One `api` Lambda behind root `ANY /{proxy+}` on the existing REST API** | **Chosen** | See below. |

## 3. Decision

**All HTTP traffic goes through one new Lambda, `api`, behind a single root-level `ANY /{proxy+}` event on the existing REST APIs (`9pcccl0caj` prod, `dgsmskbzb2` devtest).** A merged in-code route table does the routing, and `lib/router.ts dispatch` does the auth.

- Same API ids, stage paths and URLs. There are **no frontend, secret, CSP, Cognito or table changes**.
- **Adding an endpoint becomes a route-table entry plus a test: 0 CloudFormation resources and 0 API Gateway resources.**
- The gateway `adminAuthorizer` and its Authorizer resource are deleted.
- Functions that are not HTTP stay separate **under their current names**:
  - `contenders` and `progression`: async-invoke targets of `lib/asyncLambda.ts`, with IAM granting `lambda:InvokeFunction` on exactly these names.
  - `postConfirmation` and `preSignUp`: wired by name in `setup-cognito.sh`.
  - `expireChallenges`, `expireContractOffers`, `weeklyJobs` and `recalculateContenders`: schedules.
- `serverless-plugin-split-stacks` and `stacks-map.js` **stay installed**. Removing them would move deployed tables and functions between stacks, which means create-before-delete on fixed names. After the migration they only route the occasional new table or job.

Grafted from the runners-up:
- the CI resource-count guard (ticket);
- reading-before-writing discipline on the shared devtest stage (CI research);
- "HTTP API later, only after URL-from-outputs" as a documented follow-up (option B).

### Expected end state

| | Before (devtest) | After |
|---|---|---|
| Root stack | 478 | **about 70**: 41 tables, 4 GatewayResponses, 3 groups, pool, client, 2 buckets, 2 policies, role, RestApi, CloudFront, about 6 functions and log groups, 2–3 nested stacks |
| All stacks | 892 | **about 110** |
| API Gateway Resources / Methods | 215 / 401 | **2 / 2** (`/`, `/{proxy+}`; `ANY` plus one `OPTIONS`) |
| HTTP Lambdas | 44 | **1** |
| Cost of a new endpoint | about 2 Methods + 0–n Resources (+4 if a new function) | **0** |
| Cost of a new table / scheduled job | 1 / about 4 | 1 / about 4 (unchanged, in Overflow) |

## 4. The critical trap: API Gateway Deployments are snapshots

Serverless creates a new `AWS::ApiGateway::Deployment` with `StageName` on every deploy. API Gateway snapshots the API **as it is when the Deployment is created**, during the CloudFormation *update* phase.

Resources removed from the template are deleted only in the *cleanup* phase, which for nested stacks is deferred until root cleanup. So in the deploy that removes the explicit routes:

1. The new Deployment's snapshot still contains every explicit method, because they are not deleted yet. Explicit routes beat `/{proxy+}`.
2. Cleanup then deletes the old functions, their `LambdaPermissionApiGateway` resources and the Authorizer.
3. The stage keeps serving the stale explicit routes, now wired to deleted Lambdas and permissions, so **almost the whole API returns 5xx** until another deployment is created. For about 700 deletions that is minutes of outage, more than seconds.

Mitigation, which drives the migration order in §6:
- **Remove the routes and the functions in separate deploys.**
- While the explicit routes are being removed (deploy 2a), keep the old functions, **their API Gateway permissions and the Authorizer alive** through a temporary `legacy-bridge` resources file. It re-declares those resources under their **existing logical IDs**, so CloudFormation sees no deletion.
- **Run `aws apigateway create-deployment` right after the deploy** so the stage moves to a proxy-only snapshot.
- Deploy 2b then deletes the now-unreferenced functions, permissions and authorizer.

At no point does a live route point at a deleted target.

## 5. Target architecture

### 5.1 Routing
- `backend/functions/api/routes.ts` concatenates every exported `routes` table (the 34 files in §1), plus `LEGACY_ENTRY_ROUTES` that wrap the HTTP entry points without a route table:

| Route | Handler | Access |
|---|---|---|
| `GET /standings` | `standings/getStandings.handler` | `'public'` (optional caller via `getVerifiedCaller`) |
| `GET /activity` | `activity/handler.handler` | `'public'` |
| `GET /statistics` | `statistics/getStatistics.handler` | `'public'` |
| `GET /rivalries` | `rivalries/getMatchHistoryRivalries.handler` | `'public'` |
| `GET /rivalries/activity` | `rivalries/getRivalryActivity.handler` | `'public'` |
| `GET /api-docs`, `GET /api-docs/spec` | `docs/serveDocs.handler` (`event.path.endsWith('/spec')` still works) | `'public'` |
| `POST /images/upload-url` | `images/generateUploadUrl.handler` | `{ roles: ['Wrestler'] }` (Admin and Moderator pass through `hasRole`) |

- `backend/functions/api/handler.ts`:
  1. Normalizes the path for offline (§5.9).
  2. Handles **`POST /auth/setup`** before the router through an explicit one-entry `PRE_ROUTER_UNAUTHENTICATED_WRITES` allowlist. `createAdminUser` checks `x-setup-key` itself. This keeps the router's "no public writes in a route table" invariant intact.
  3. Calls `createRouter(allRoutes)` once at module scope.
  4. Writes one structured log line per request (§5.5).
- **`POST /auth/login` is deleted** (`functions/auth/login.ts` and its function). It had 0 invocations in 90 days, and the frontend signs in with Amplify/Cognito directly.
- Ambiguity: PR 1 changes the proxy-fallback ranking in `lib/router.ts` (lines 104-106) from "fewest params, then declaration order" to **API Gateway's rule**: compare the matching templates segment by segment, left to right, and at the first segment where they differ a literal beats a `{param}`. Declaration order breaks only exact-shape ties, which the test forbids. All route templates are single-segment params (`compileResource` has no greedy `+`), so overlapping routes always have the same segment count and the rule is total. A pairwise check of all 250 entries found 8 same-method overlaps, none of which rank differently under the two rules, so this changes no current behaviour; it removes the class of future divergence where `/a/{x}/c` and `/a/b/{y}` tie on param count. The exact-`event.resource` fast path is untouched.
- **Resource first, then method** (also PR 1). API Gateway picks the most specific matching resource first and only then looks at the method; if that resource has no such method, the request fails (403/405) and never falls back to a less specific resource. Today `lib/router.ts:100-106` does the reverse (`methodMatches = pathMatches.filter(method)`, then ranks), so after the cut-over a request whose method is missing on a literal resource but present on a `{param}` sibling would run the sibling's handler with the literal as the id. A scan of the route tables found 26 such cases, for example `DELETE /players/me` → `DELETE /players/{playerId}` with `playerId='me'`, `PUT /players/booking-summary` → `updatePlayer`, `PUT`/`DELETE /wrestlers/import` and `/wrestlers/reset-assignments`, `DELETE /notifications/mark-all-read`, and `GET /tag-teams/admin` → the public `getTagTeam`. Each reached route still enforces its own access rule and the handlers checked 404 on the lookup, so no data is affected today, but a future upsert-style PUT or delete-by-prefix handler would act on the literal. Fix: in the `{proxy+}` fallback, rank **all** path matches with the leftmost-literal comparator regardless of method, take the winning template, and dispatch the route for `(method, winning template)`; if that template has no route for the method, return 405. Every such request reaches the gateway today as a 403 (explicit literal resource without that method), so no client depends on the cross-method fallback; the response becomes a 405 with CORS headers, the same class of change as §5.5.

### 5.2 Auth
- In-Lambda only: `dispatch()` → `authenticate()` (aws-jwt-verify, JWKS cached per container) → `isCallerDeactivated` → `requireRole`.
- The gateway `adminAuthorizer` function, its `AWS::ApiGateway::Authorizer` and its permission are deleted in deploy 2b.
- This drops the authorizer's 5-minute policy cache. Role staleness does not change, because roles come from the token.
- Fail-closed behaviour is unchanged: a bad token gets a 401 with CORS headers.
- `generateUploadUrl` no longer relies on gateway context. The router authenticates it, and its own deactivation check becomes redundant but harmless. Leave it or remove it in the cleanup PR.

### 5.3 IAM
- The one shared `lambdaRole` is unchanged. Keep the `lambda:InvokeFunction` grants on `-contenders` and `-progression` and the `serverlessConfig.test.ts` assertions that cover them. The `api` function uses the same role.

### 5.4 Packaging and runtime
- Same `serverless-plugin-typescript` single zip.
- `api`: `timeout: 29` (API Gateway integration cap; 6 functions already use 29), memory 1024 MB as today.
- Cold start: requiring every entry point measured about 190 ms of module init locally, against about 95 ms per domain today. It is accepted, because one warm pool serves all traffic, so there should be fewer cold starts overall.
- Follow-up, out of scope: esbuild bundling (measured about 110 ms) or lazy per-domain imports.

### 5.5 Logging
- One log group, `/aws/lambda/wwe-2k-league-api-<stage>-api` (90-day retention from the provider).
- `api/handler.ts` logs `{"route":"GET /players/{playerId}","status":200,"ms":42}` per request, so per-route metrics remain possible through a metric filter.
- Requests that match no route (404) or the wrong method (405) log `"route":"UNMATCHED"` and the method only, never the raw path. Scanner noise then cannot inflate log cardinality, and per-route metric filters exclude it.
- **Behaviour change for unknown paths:** API Gateway used to answer them itself with a free 403 (`MissingAuthenticationToken`, through the CORS GatewayResponse). They now invoke `api` and get the router's 404 or 405 with CORS headers. The frontend does not depend on either code. The cost is one warm invocation of a few ms per bot request. Stage throttling (§7.5) caps how much of it can arrive.
- Old per-function log groups are deleted with their functions in deploy 2b. Export anything worth keeping first (optional).

### 5.6 Scheduled jobs
- Unchanged: `expireChallenges`, `expireContractOffers`, `weeklyJobs` and `recalculateContenders` keep names, schedules and timeouts (60/60/300/300 s).

### 5.7 Async workers
- `contenders` and `progression` lose their `http` events but keep their function names, logical IDs and the `event.requestContext == null` direct-invoke branch.
- Their HTTP routes are served by `api` through the merged table: the same `routes` exports and the same handler code.

### 5.8 Cognito triggers and CORS
- `postConfirmation` and `preSignUp` are untouched. No `LeagueUserPool`/client/group property changes, so the triggers are not detached. `setup-cognito.sh` keeps running in CI.
- CORS: `/{proxy+}` keeps `cors: *corsConfig`, so there is one OPTIONS mock method. Lambda responses carry CORS from `lib/response.ts`.
- **Keep the 4 `GatewayResponse` resources**. API Gateway still produces 403s for unknown root paths, throttling and integration timeouts, and those need CORS.

### 5.9 Local development (serverless-offline)
- Single event `ANY /{proxy+}`. Offline gives `event.resource = '/dev/{proxy+}'` and `event.path = '/dev/...'`.
- `api/handler.ts`: when `process.env.IS_OFFLINE === 'true'` and the path starts with `'/dev/'`, strip the `/dev` prefix before routing. Code it as a tiny exported `normalizeOfflineEvent` with a unit test.
- **Offline auth.** serverless-offline always fills `requestContext.authorizer` with `principalId: 'offlineContext_authorizer_principalId'` and no `groups`, even on routes with no authorizer (`LambdaProxyIntegrationEvent.js:181-191`). `dispatch()` treats any principal as gateway-verified, so it never calls `authenticate()` and never installs the offline Admin context. Today the 57 `adminAuthorizer` routes get Admin offline from the authorizer's own `IS_OFFLINE` bypass (`authorizer.ts:52-59`). After the migration nothing would provide it. `requireRole` still short-circuits offline, so router role checks pass. But the ~40 handlers that check `isSuperAdmin`/`hasRole`/`groups` themselves (for example `users/updateUserRole.ts`) would refuse, and self-service routes would run as a fake user. Fix: when `IS_OFFLINE === 'true'`, `api/handler.ts` deletes `event.requestContext.authorizer` before routing. `authenticate()` then installs `offline-admin` with `groups: 'Admin'` for every non-public route, as the authorizer does today. Put it in the same exported `normalizeOfflineEvent` helper as the path strip. It also fixes the existing router-only routes, which have the same flaw offline today.
- Frontend `.env` (`/dev`) and the vite proxy are unchanged.
- **Verify** with `npm run offline` and curl `localhost:3001/dev/standings`, `/dev/players/me` with a token, and `OPTIONS`.

### 5.10 Tests
- `functions/api/__tests__/routes.test.ts`:
  - The merged table loads, because `createRouter` asserts access.
  - There are no duplicate `method+resource` pairs.
  - **Every route is reachable**: for each route, build a concrete path by replacing `{x}` with `zz-x-zz`, run it through the router with `resource: '/{proxy+}'`, and assert that the chosen route is that same route. A stub handler and a mocked `authenticate` identify which route ran.
  - **Gateway-equivalent precedence**: for every same-method pair of templates, unify them segment by segment (literal vs literal must be equal; a param unifies with anything). If they unify, build the concrete witness path (literal where either side has one, `zz` otherwise), run it through the router, and assert the chosen route is the one API Gateway would pick (leftmost differing segment is literal). Fail if two routes unify with an identical literal/param shape (a true tie). This replaces the earlier own-concrete-path "no ties" test, which missed overlaps where the param sits in a different position.
  - **Cross-method precedence**: for every pair of *templates* (any methods) that unify, build the witness path the same way and request it with **every method declared on either template**. Assert the result is the route for `(method, gateway-winning template)` when that template declares the method, and a 405 otherwise. Never the other template's route. This covers the 26 literal-vs-`{param}` cases in §5.1, which the same-method pairs above cannot see.
- `lib/__tests__/router.test.ts`: add the `/a/{x}/c` vs `/a/b/{y}` case (both orders of declaration) for the new comparator, and a resource-first case: routes `GET /players/me` and `DELETE /players/{playerId}`, request `DELETE /players/me` through `/{proxy+}`, expect 405 and the `DELETE` handler not called.
- `functions/api/__tests__/legacyParity.test.ts`: `legacyGatewayRoutes.json` is a fixture **generated once from the current `serverless.yml` before the events are deleted**, holding the 209 events as `method path`, with `ANY` kept. Assert that every pre-migration gateway path resolves to a route in the merged table. For `ANY`, at least one method resolves. `/auth/login` is the only allowed exception, deleted on purpose. Nothing silently disappears.
- `functions/api/__tests__/handler.test.ts`: the offline path strip; **an offline-shaped event** (`IS_OFFLINE=true`, `requestContext.authorizer = { principalId: 'offlineContext_authorizer_principalId' }`, no groups) on a STAFF route and on an `isSuperAdmin`-checking route reaches the handler with `groups: 'Admin'` and returns 200; the same event with `IS_OFFLINE` unset gets no such context, so the strip is offline-only; `POST /auth/setup` pre-router dispatch, 404 for an unknown path, 405 for a wrong method, and a 401 with the `Access-Control-Allow-Origin` header for a protected route without a token.
- `legacyGatewayRoutes.json` records each event as `{ "method", "path", "hasAuthorizer" }` (the 57 `authorizer: adminAuthorizer` events have `hasAuthorizer: true`), so the gateway-authorizer protection is not lost when the `authorizer:` lines are deleted.
- Rewrite `functions/__tests__/routeAccess.test.ts`: the source of truth becomes the merged table instead of `serverless.yml` http events. Assert that:
  - `serverless.yml` has exactly one `http` event, on `api`, at `/{proxy+}`, with no `authorizer:`;
  - the `SELF_SERVICE_WRITES` and `ADMIN_ONLY_ROUTES` rules apply to the merged table;
  - **formerly gateway-authorized routes stay non-public**: for every fixture entry with `hasAuthorizer: true`, the merged-table route that serves that `method path` is not `access: 'public'` (replaces today's "never marks a route public behind the gateway authorizer", `routeAccess.test.ts:333-340`);
  - **explicit public allowlist**: a new `PUBLIC_ROUTES` set, generated in PR1 from today's tables (every `access: 'public'` route) and reviewed once, must equal the set of `public` routes in the merged table. Any new or changed public route needs a reviewed edit to this set;
  - no `public` route is a non-GET, and the only unauthenticated non-GET is the pre-router allowlist.
- `lib/__tests__/serverlessConfig.test.ts`: keep the existing checks and add "no function except `api` has `http` events" and "no `adminAuthorizer` function" (the latter after deploy 2b).
- `lib/__tests__/stacksMap.test.ts`: unchanged.

## 6. Migration with safe ordering for the live stacks

Rules for every step:
- Never recreate a fixed-name resource.
- Never touch tables, Cognito or CloudFront logical IDs or properties.
- Never change `stacks-map.js` routes for deployed types.
- Rehearse each deploy on **devtest** before running it on **prod**.

The repo rule allows devtest deploys. Prod deploys are owner-triggered through `deploy-prod.yml`.

### Step 0: bring prod level with main (owner, no refactor code)
- Run **Deploy to Production** from current `main`. Prod's Overflow is at 72 and still lacks contracts, injuries, weeklyJobs, expireContractOffers and 5 tables. This keeps the v1.7.0 changeset separate from the migration and makes devtest rehearsals representative of prod.
- **Rollback:** the normal prod rollback.

### PR 1 / Deploy 1: additive, behaviour unchanged
Code:
- `functions/api/{handler,routes}.ts`;
- the `LEGACY_ENTRY_ROUTES` wrappers;
- the tests in §5.10;
- `legacyGatewayRoutes.json` (generated now, while the events still exist).
- `functions/__tests__/routeAccess.test.ts`: add `'api/handler.ts'` to `NO_ROUTE_TABLE` with the reason "merged table; checked in api/__tests__". Without this, PR1 fails CI: the test imports every `handler.ts` and throws on one without a `routes` export (`routeAccess.test.ts:234-236`), and `parseGatewayEvents` picks up `functions/api/handler.handler`'s `/{proxy+}` event, which no per-file table contains (the "matches every gateway event" test skips `NO_ROUTE_TABLE` files, so the one entry fixes both). The full rewrite still happens in 2a.

`serverless.yml`:
- add the function `api` (`handler: functions/api/handler.handler`, `timeout: 29`) with one event: `http: { path: '/{proxy+}', method: any, cors: *corsConfig }`.
- All existing events stay.
- `stacks-map` routes the new Function, LogGroup, Method×2, Resource, Permission and Deployment to Overflow, so **root does not grow**.

CI (§7):
- the resource-count guard, with the **PR1 thresholds** (§7.1): root ≤ 485 (a "must not grow" check, because the packaged root keeps today's 478 resources until 2a), every nested stack ≤ 450;
- a post-deploy **"Refresh API stage deployment"** step running `aws apigateway create-deployment`, introduced now so it is proven before it matters;
- recording the stage's previous `deploymentId` in the job log for rollback;
- the **API cut-over gate** (§7.3) in both workflows. It is inert until 2a reaches a stage. It goes in now so every branch cut after PR1 carries it.

Effect: explicit routes still win. The proxy is only reached for paths with no explicit resource.

Verify on devtest (script `backend/scripts/proxy-parity-check.js`, new in PR 1). `test-invoke-method` really invokes the Lambda, and it skips gateway authorizers, so the script must never let it run a write handler:
- **The script refuses any authenticated call whose method is not `GET`** (hard-coded check, not a flag), and it skips `GET` paths on a small denylist of heavy reads (for example the admin data export). Template params are filled with `zz-<name>-zz`, so id lookups 404.
- **GET routes, with an Admin token:** proxy side through `aws apigateway test-invoke-method --rest-api-id dgsmskbzb2 --resource-id <proxy id> --http-method GET --path-with-query-string <path> --headers Authorization=...` (this runs against the API, not the stage). Explicit side through a real `curl` on the stage URL with the same token. Diff status and body shape.
- **Every non-GET route, without a token only:** proxy side through tokenless `test-invoke-method` (the `api` Lambda authenticates in code, so it returns 401/403 before any handler runs); explicit side through tokenless `curl` on the stage (the gateway authorizer, or the in-Lambda router, returns 401/403). Assert 401 or 403 on both sides. This proves routing and auth without running a handler. Do not use tokenless `test-invoke-method` on explicit routes: it bypasses `adminAuthorizer`. The only unauthenticated non-GET, `POST /auth/setup`, is called without `x-setup-key` and must return 401 on both sides (`createAdminUser` answers `unauthorized('Invalid or missing setup key')`).
- No authenticated write is run through either path, on any stage. If a write ever needs an end-to-end check, it goes on an explicit allowlist of harmless writes whose `zz` ids 404 on lookup, devtest only.
- Exercise `OPTIONS /{proxy+}`.
- Run the same script on prod after the prod deploy (GET-with-token and tokenless non-GET only; the same hard-coded refusal applies).

**Rollback:** revert PR 1. This deletes the proxy, the `api` function and its log group, which is pure deletion.

### PR 2a / Deploy 2a: cut over routing (removes explicit routes, keeps their targets alive)
Code:
- Remove **every** `- http:` event except the `api` proxy, including the events on `contenders` and `progression`.
- Remove the `login` function and `functions/auth/login.ts`. It is the only target deleted here: 0 traffic, and the deletion happens in cleanup.
- Add `backend/legacy-bridge.js`, referenced from `resources:` as `- ${file(./legacy-bridge.js)}`. It emits, **under their existing logical IDs and with the same properties the live template has**:
  - `<Fn>LambdaPermissionApiGateway` for every function that loses its events: `Principal apigateway.amazonaws.com`, `SourceArn arn:${Partition}:execute-api:${Region}:${AccountId}:${ApiGatewayRestApi}/*/*`, `FunctionName !GetAtt <Fn>LambdaFunction.Arn`.
  - `AdminAuthorizerApiGatewayAuthorizer` (TOKEN, `method.request.header.Authorization`, `AuthorizerUri` on `AdminAuthorizerLambdaFunction`) and `AdminAuthorizerLambdaPermissionApiGateway`.
  - The split-stacks plugin keeps deployed logical IDs in the stack they live in (Permissions, root, Overflow).
- The now event-less legacy functions **stay** in `functions:`.

Verify before deploying:
- `npx serverless package --stage devtest`, then `check-stack-cycles.js` and the guard. **2a lowers the root threshold to 450** (`ROOT_MAX` in `check-stack-limits.js`): the 2a root drops the 281 Methods and 44 Resources it holds today, to about 150, so the packaged 2a template must already pass at 450.
- Run `backend/scripts/diff-live-template.js --stage devtest` (read-only, new in 2a). For the root stack and every nested stack, it compares each `.serverless/cloudformation-template-*.json` with `aws cloudformation get-template` of the live stack (nested stack names come from `list-stack-resources` on root). It prints added, removed and changed logical IDs per stack and fails when:
  - any `AWS::Lambda::Permission`, `AWS::ApiGateway::Authorizer` or `AWS::Lambda::Function` is removed, or moves to a different stack;
  - any bridged Permission or the Authorizer has a `Properties` value that differs from live, after normalizing `Fn::GetAtt` string and array forms and the nested-stack `Parameters`/`Ref` plumbing. A byte-identical `Properties` block cannot trigger a replacement, so this replaces a change set for the bridge check;
  - anything other than Methods, Resources, `APINestedStack`, `login`'s Function/LogGroup/Permission, the per-deploy `Deployment`, and any `AWS::Lambda::Version` is removed. Versions are allowed because their logical IDs are code hashes (live devtest `VersionsNestedStack`: 51 Versions such as `AdminAuthorizerLambdaVersionGiv10f...`, each `DeletionPolicy: Retain`), and every deploy that changes the shared zip changes them all. Removing a Retain resource from the template deletes nothing. The script skips `VersionsNestedStack` entirely (its Parameters and Outputs churn with the same hashes) and ignores `*LambdaVersion*` outputs referenced from root.
- No CloudFormation change set. One built from `serverless package` output would point its nested `TemplateURL`s at a timestamped S3 prefix that only `serverless deploy` uploads (live root: `serverless/wwe-2k-league-api/devtest/<ts>-<iso>/cloudformation-template-Overflow-nested-stack.json`). It would also need `--include-nested-stacks`, because 32 of the bridged Permissions live in `PermissionsNestedStack`. Doing that means uploading artifacts to the deployment bucket, which is a devtest mutation. The scripted diff covers the same risk read-only.

Deploy:
- The new Deployment snapshot still has the explicit methods. They keep working, because functions, permissions and the authorizer are all alive. Cleanup deletes about 400 Methods, about 214 Resources and the APINestedStack.
- The CI post-deploy step then creates a fresh deployment, **proxy only**, and the stage moves to it.

Verify:
- e2e suite, manual walkthrough: login, refresh-on-401 (expire the token), image upload, record result (async contenders/progression invoke), docs page.
- CloudWatch: `api` traffic present, legacy functions no longer invoked.

**Rollback:**
- **The only supported rollback:** `aws apigateway update-stage --rest-api-id <id> --stage-name <stage> --patch-operations op=replace,path=/deploymentId,value=<Deployment created by CFN in 2a>`. That snapshot still holds every explicit route, and all targets (functions, bridged permissions, authorizer) stay alive until 2b. That is why 2b must not merge until 2a has run cleanly on prod (see the merge gate below). After that, fix forward in code: a route bug is a route-table edit.
- **A template revert of 2a is not a rollback path.** The ~615 Methods and Resources it would recreate are new logical IDs, so `stacks-map.js` sends them all to Overflow. After 2a, Overflow holds about 40 resources, so it would pass 500, roll over to Overflow2 with Resource parent references across nested stacks, and risk the 200-parameter limit the plugin does not count and the cycle class behind `check-stack-cycles.js`. It is the original problem again. If it is ever truly needed, package the revert first and pass `check-stack-limits.js` and `check-stack-cycles.js` on it before any deploy. Do not run it under incident pressure.

**Merge gate between 2a and 2b (required):** PR 2b must not merge until **both** stages have run deploy 2a **and** the "Refresh API stage deployment" step succeeded on each. `deploy-prod.yml` only deploys the head of `main` (`if: github.ref == 'refs/heads/main'`) and prod normally lags main. If 2a and 2b were both on main before the owner's next prod run, prod would jump from PR1 straight to 2b. CloudFormation would delete the functions, permissions and authorizer while the stage still served the PR1 explicit-route snapshot, which is the §4 outage. Owner discipline is not enough, so the gate is enforced in CI too (§7.3, check B). A 2b deploy fails before `serverless deploy` unless the live API is already proxy-only. The PR 2b description carries a checklist with the prod 2a run URL and the refresh step's new `deploymentId`.

**Freeze:** from 2a until 2b has reached both stages, other PRs must be rebased on the migration. The cut-over gate enforces it in both directions: check A blocks a pre-2a template (explicit routes) over a proxy-only stage, and check C blocks a 2a-but-not-2b template (bridge, legacy functions, authorizer) over a stage that has already run 2b.

### PR 2b / Deploy 2b: delete the dead targets
Remove:
- `legacy-bridge.js` and its `resources:` reference;
- every legacy HTTP function (users, admin, players, overalls, transfers, storylineRequests, matches, championships, tournaments, getDashboard, getStandings, activity, seasons, seasonAwards, companies, shows, locations, divisions, wrestlers, stipulations, matchTypes, events, generateUploadUrl, serveSwaggerUi, serveOpenApiSpec, getStatistics, getRivalries, getRivalryActivity, rivalryMessages, rivalryNotes, rivalryRequests, contracts, injuries, challenges, promos, stables, tagTeams, videos, announcements, notifications, createAdminUser);
- `adminAuthorizer`.

**Keep:** `api`, `contenders`, `progression`, `postConfirmation`, `preSignUp`, `expireChallenges`, `expireContractOffers`, `weeklyJobs`, `recalculateContenders`.

Keep the handler *source files*. They are imported by `api/routes.ts`. `functions/auth/authorizer.ts` is deleted with its function.

Expected: **CloudFormation creates nothing except the new Deployment.** Cleanup deletes about 41 functions, their log groups and permissions, and the Authorizer. Nothing in the live snapshot references them. PermissionsNestedStack and VersionsNestedStack shrink (versions are `Retain` and simply orphan). Any nested stack the plugin no longer emits is deleted.

Verify: the same e2e, plus `aws apigateway get-resources` showing 2 resources.

Pre-deploy: the cut-over gate (§7.3, check B) must pass on the target stage. On the first 2b deploy (live authorizer still present) it fails if the live API still has explicit resources or if the stage's live deployment snapshot is not proxy-only.

**Rollback:** routing does not depend on the deleted targets, so a 2b problem is fixed forward. **A template revert of 2b is not supported**, like the 2a revert. A 2b revert is the 2a template, which carries `AdminAuthorizerApiGatewayAuthorizer`, and check C (§7.3) refuses exactly that template over a stage without the live authorizer, so it cannot get through CI. It would also restore no routes, since the proxy serves them all. If a deleted function is ever needed again (for example as a slow-route target, §10), add it forward in a new PR without the authorizer or bridge; that template passes check C, and `check-stack-limits.js` runs on it as on every deploy.

Note: cleanup-phase failures, for example a throttled API Gateway delete, do **not** roll the stack back. CloudFormation finishes `UPDATE_COMPLETE` with orphans. Check the stack events and delete stragglers by hand if any appear.

### PR 3: cleanup (no infra risk)
- Rewrite `routeAccess.test.ts` (if not done in PR 1).
- Drop the parity fixture's `/auth/login` exception.
- Update `CLAUDE.md`, `backend/docs/openapi.yaml` (remove `/auth/login`), `npm run embed-docs` and the memory note `cfn-500-limit-stacks-map.md` ("new endpoint = route entry, no infra").
- Keep the stage-refresh CI step permanently. It is cheap and protects any future template that removes a gateway path.
- Optional: `versionFunctions: false`, which orphans retained versions and empties the Versions stack, and esbuild bundling.

## 7. CI changes

1. **Resource-count guard**: `backend/scripts/check-stack-limits.js`. Run it after `serverless package` in both deploy workflows, next to `check-stack-cycles.js`, and as an `npm run check-stack-limits` script.
   - Read `.serverless/cloudformation-template-update-stack.json` and every nested template the plugin writes in `.serverless/`.
   - Thresholds: `ROOT_MAX` for the root template and `NESTED_MAX = 450` for every nested template; fail above either, or above **180 parameters** or **180 outputs** in any template.
   - `ROOT_MAX` is **485 in PR1** and **450 from PR 2a**. Reason: `split-stacks/lib/migrate-existing-resources.js` pins every deployed resource to its live stack, so the packaged root stays at 478 on both stages (measured, §1) until 2a removes the root Methods and Resources. A flat 450 would refuse the PR1 deploys on both stages. 485 is a "must not grow" check: PR1 and every feature PR between PR1 and 2a add nothing to root (new types go to Overflow), so a root above 485 means something new landed in root and must be fixed in `stacks-map.js` before deploying.
   - Unit test (`scripts/__tests__/check-stack-limits.test.ts`) over fixture templates: a 478-resource root passes with `ROOT_MAX = 485` and fails with 450; a 486-resource root fails with 485; a 451-resource nested stack fails; 181 parameters fails. 2a updates the test with the new `ROOT_MAX`.
   - Print per-stack counts.
   - After the migration this is a cheap tripwire, not a daily constraint.
2. **Stage refresh**: a new step, **"Refresh API stage deployment"**, in `deploy-dev.yml` and `deploy-prod.yml` after `deploy_backend` succeeds (`if: steps.deploy_backend.outcome == 'success'`):
   - Read the RestApi id with `aws cloudformation describe-stack-resource --logical-resource-id ApiGatewayRestApi`.
   - Echo the current `deploymentId` from `get-stage` (for rollback).
   - Run `aws apigateway create-deployment --rest-api-id $ID --stage-name <stage> --description "post-deploy refresh $GITHUB_SHA"`.
   - Do not rename `Deploy backend` (`id: deploy_backend`), `Extract Cognito IDs` or `Wire Cognito`, and do not change their `!cancelled()` guards (`serverlessConfig.test.ts:136-146`).
3. **API cut-over gate**: `backend/scripts/check-api-cutover.js --stage <stage>`. It runs in both workflows after `serverless package` and before `Deploy backend`, and is added in **PR 1**. It reads live state only: the RestApi id from `describe-stack-resource`, `get-resources`, `get-stage` and `get-deployment --embed apisummary`. It compares that with the packaged templates, so the marker is the actual 2a/2b change, not a file that exists from PR1.
   - **Check A (pre-2a over 2a flip-flop):** applies only while the live stack **still has** `AdminAuthorizerApiGatewayAuthorizer` (between 2a and 2b; `describe-stack-resource`). If the live API is proxy-only (`get-resources` returns exactly `/` and `/{proxy+}`) and the packaged templates declare any `AWS::ApiGateway::Method` other than the proxy's `ANY` and `OPTIONS`, fail with "template re-adds explicit API routes over a proxy-only stage (INFRA-207): rebase onto main". It is self-retiring: once a stage has run 2b, the live authorizer is gone and check A no longer runs, so a deliberate future explicit route (the §10 escape hatch for a slow route) is not blocked. After 2b the pre-2a flip-flop is still caught, by check C: every pre-2a template contains `AdminAuthorizerApiGatewayAuthorizer`, and check C refuses that template over a stage without it. Unit tests: check A fires with a live authorizer, proxy-only API and an explicit Method; it does not fire with the same template once the live authorizer is absent (check C fires instead when that template carries the authorizer); a post-2b template with one explicit non-`CUSTOM` Method and no authorizer passes.
   - **Check B (2b ordering):** applies only to the **first 2b deploy on a stage**: the packaged templates no longer contain `AdminAuthorizerApiGatewayAuthorizer` **and** the live stack still has it (`describe-stack-resource`). Then require a proxy-only live API, otherwise fail with "deploy 2a to this stage first". If the API is proxy-only but the stage's deployment `apiSummary` still lists other paths (2a deployed, refresh step failed), run `create-deployment` once (the same command as the refresh step, now a proxy-only snapshot) and re-check. Proceed only when `apiSummary` keys are a subset of `{'/', '/{proxy+}'}`. Like check A it retires itself per stage: once 2b has deleted the live authorizer, check B no longer runs, so a later deploy that adds a deliberate explicit route (the §10 slow-route escape hatch) is not refused on the deploy after it. A failed 2b that rolls back leaves the authorizer live, so check B runs again on the retry. Unit tests: check B fires with a live authorizer, a packaged template without it and a non-proxy-only API (or `apiSummary`); it does not run when the live authorizer is absent, including with extra live resources such as `/slow-route`.
   - **Check C (2b→2a flip-flop):** if the live stack has no `AdminAuthorizerApiGatewayAuthorizer` (read with `describe-stack-resource`, "does not exist" means absent) but the packaged templates do, fail with "template predates INFRA-207 2b on a stage that has run 2b: rebase onto main". Without it, a stale branch or a PR whose merge ref has 2a but not 2b would recreate about 41 functions, log groups, permissions and the authorizer as new resources in Overflow, and the next 2b-based deploy would delete them again.
   - **First deploy of a stage:** if the stack (`describe-stacks` → "does not exist") or its `ApiGatewayRestApi` resource is missing, all checks pass, the same way `split-stacks/lib/migrate-existing-resources.js` treats a missing stack as empty. The unit test covers a missing stack, a stack without a RestApi, and each of checks A, B and C.
   - Residual gap: a workflow file runs from the ref being deployed. A `workflow_dispatch` or re-run of a branch cut **before PR1** carries no gate. `pull_request` runs use the merge ref, so they pick up main's workflow and `serverless.yml`. Rule: never dispatch or re-run pre-PR1 deploy-dev runs after 2a; rebase instead. The worst case is devtest-only and is fixed by redeploying main.
4. The CI role needs `apigateway:POST` on `/restapis/*/deployments`, `apigateway:PATCH` on stages, and `apigateway:GET` on resources, stages and deployments. The deploy role already manages API Gateway through CloudFormation; confirm on the first devtest run.
5. **Stage throttling** (PR 2a, applied in the refresh step): after the cut-over every unknown path invokes Lambda, and the stage has no throttling today (`get-stage` methodSettings `{}`, no usage plans). Add an idempotent `aws apigateway update-stage --patch-operations op=replace,path=/*/*/throttling/rateLimit,value=<R> op=replace,path=/*/*/throttling/burstLimit,value=<B>`.
   - **What it is for:** a **cost and runaway cap only**, not abuse protection. With every route behind one `ANY /{proxy+}`, a stage limit is one budget shared by all clients, so a single client above `R` would get real users 429s. It is therefore set far above organic traffic, not near it.
   - **Sizing:** API Gateway `Count` has no per-second resolution (1-minute minimum), so size from the 90-day peak per-minute `Sum`: prod peak is 811 requests in one minute (2026-11-20 23:26), about 13.5 rps averaged. Set `R = max(500, ceil(peakMinuteSum / 60) * 20)` and `B = 2 * R` (today: `R = 500`, `B = 1000`). The burst covers parallel page loads, which fire many requests at once. Hard-code the computed values in the workflow with a comment showing the query, and revisit them if the peak changes.
   - **Per-client protection** is out of scope: the follow-up is a WAF web ACL with a rate-based rule on the stage. Until then, accept the small per-request Lambda cost of scanner traffic, and watch `api` `Invocations` in CloudWatch after the cut-over. Stage settings live on the Stage, not the Deployment, so they survive later deploys. CloudFormation's Deployment `StageName` update changes only `deploymentId`; confirm on devtest by reading `get-stage` after a second deploy.

## 8. Frontend impact

**None.** Same base URLs (`https://9pcccl0caj.../dev`, `https://dgsmskbzb2.../devtest`), same paths, same CORS origin, same Cognito pool and client. No secret, `.env*`, CSP, e2e config or openapi `servers` change. The only API surface change is the deletion of `POST /auth/login`, which the frontend does not call.

## 9. Testing and verification plan

1. Locally:
   - `cd backend && npm run lint && npx tsc --noEmit && npm test`, with the new merged-router, parity and handler tests.
   - Frontend `npx tsc --project tsconfig.app.json --noEmit`.
2. Locally: `npm run offline` plus a curl smoke test over about 15 representative routes (public GET, self-service write, staff write, a super-admin-only route such as `PUT /users/{userId}/role`, OPTIONS, `/api-docs`). Offline is Admin by design (§5.9), so the 401-without-token check runs only in unit tests and on devtest.
3. `npx serverless package --stage devtest` in the repo, then delete `.serverless/` after. Run `check-stack-cycles.js` and `check-stack-limits.js`, and run `diff-live-template.js` against the live `get-template` output for root and each nested stack (read-only; no change set, see 2a). Run `check-api-cutover.js` dry (no refresh) to see which checks apply.
4. Devtest deploy through the PR (deploy-dev.yml): the test-invoke parity script (Deploy 1), then e2e and a manual walkthrough (2a, 2b).
5. Prod: the owner runs deploy-prod after each devtest step is green. **2b does not merge until prod has run 2a and its refresh step succeeded** (merge gate in §6, enforced by §7.3 check B). Repeat the read-only test-invokes and smoke tests. Keep the rollback `deploymentId` from the job log.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Stale deployment snapshot routes to deleted Lambdas (§4) | Split 2a/2b, `legacy-bridge.js` keeps targets alive, post-deploy `create-deployment`, instant rollback through `update-stage` |
| 2a and 2b reach prod in one deploy (prod lags main) | Merge gate: 2b merges only after prod ran 2a and its refresh step. CI check B (§7.3) refuses a 2b template unless the live API and stage snapshot are proxy-only, and heals a missed refresh. |
| Template revert of 2a re-runs the 500-resource problem | Not a supported rollback. Use `update-stage` to the 2a CFN Deployment; fix forward after 2b. A 2b template revert is also unsupported (check C refuses it); re-add a needed function forward instead. |
| Unknown paths now invoke Lambda (bot/scanner traffic, 403 becomes 404) | A high stage limit as a cost cap only (§7.5, set far above organic peak so one client cannot easily starve others), `UNMATCHED` log label without the raw path, excluded from route metrics. Per-client limiting is a WAF follow-up. |
| Parity verification runs write handlers on real data | `proxy-parity-check.js` hard-refuses authenticated non-GET calls; non-GETs are checked tokenless for 401/403 only, never via tokenless `test-invoke-method` on explicit routes (it bypasses the authorizer) (§6 PR 1). |
| Bridge resources drift from live properties and get replaced | `diff-live-template.js` fails on any property difference or stack move for bridged Permissions and the Authorizer (identical properties cannot trigger a replacement). |
| One blast radius: a module-load error takes down every route | The merged-router test loads every route in CI, and devtest gets a full e2e first. Rollback through `update-stage` (2a) or a revert. |
| One timeout (29 s), memory and concurrency pool | Matches the API Gateway cap. Account concurrency is 1000. After 2b has reached a stage, a future slow route can get its own function with an explicit path, which beats the proxy (checks A and B no longer run then, §7.3). |
| Cold start about +90 ms unbundled | One warm pool means fewer cold starts. esbuild follow-up. |
| Route ambiguity in the merged table | Router uses API Gateway's leftmost-literal precedence and resolves the resource before the method, returning 405 instead of falling back to a `{param}` sibling (§5.1); reachability, same-method and cross-method gateway-equivalence, and parity tests (§5.10). |
| Losing per-function metrics and log history | Structured route logs plus a metric filter. Old log groups are deleted in 2b; export first if wanted. |
| Unauthenticated writes | `/auth/login` deleted. `/auth/setup` is a single pre-router allowlist entry with a test. The router's invariant is unchanged. |
| Devtest flip-flop from other PRs | Cut-over gate checks A (pre-2a over 2a, only while the live authorizer exists) and C (any template with the authorizer over a stage that has run 2b) (§7.3), present from PR1 and keyed on live state; a missing stack passes. Residual: pre-PR1 branches via dispatch or re-run, covered by a rule (devtest-only impact). |
| Prod and devtest layouts differ | Step 0 first. |
| serverless-offline path prefix and fake authorizer principal | `normalizeOfflineEvent` (strip `/dev`, drop the offline authorizer so `authenticate()` installs Admin) plus unit tests and an offline smoke test. |
| Accidental Cognito trigger detachment | No pool or client changes, and `setup-cognito.sh` still runs. |
| Split-stacks plugin left in place | Deliberate. Removing it would move deployed fixed-name resources. |

## 11. Implementation checklist (file level)

PR 1 (additive):
- [ ] `backend/functions/api/routes.ts`: import `routes` from the 34 handler files listed in §1, plus `LEGACY_ENTRY_ROUTES` (the §5.1 table). Export `allRoutes: ReadonlyArray<RouteConfig>`.
- [ ] `backend/functions/api/handler.ts`: `normalizeOfflineEvent` (path strip plus offline authorizer drop, §5.9), the `PRE_ROUTER_UNAUTHENTICATED_WRITES` map (`POST /auth/setup` → `auth/createAdminUser.handler`), `createRouter(allRoutes)`, and a structured log line. No `any`.
- [ ] `backend/lib/router.ts`: replace the proxy-fallback sort with leftmost-literal precedence over all path matches, then pick the method on the winning template or return 405 (§5.1); add the divergent-overlap case and the `DELETE /players/me` resource-first case to `lib/__tests__/router.test.ts`.
- [ ] `backend/functions/api/__tests__/{routes,legacyParity,handler}.test.ts` (routes test does the pairwise gateway-equivalence check; handler test includes the offline-shaped event case).
- [ ] `backend/scripts/proxy-parity-check.js`: GET-with-token and tokenless non-GET only, hard refusal of authenticated non-GET, heavy-GET denylist (§6 PR 1).
- [ ] `backend/functions/__tests__/routeAccess.test.ts`: add `'api/handler.ts'` to `NO_ROUTE_TABLE`.
- [ ] `backend/functions/api/__tests__/legacyGatewayRoutes.json`: generate it with `backend/scripts/dump-gateway-routes.ts` (js-yaml) from the current `serverless.yml`, as `{ method, path, hasAuthorizer }` per event.
- [ ] `backend/functions/__tests__/routeAccess.test.ts`: add the `PUBLIC_ROUTES` allowlist (generated from today's `access: 'public'` routes) and assert it equals the public routes in the per-file tables now, so the allowlist is proven before 2a.
- [ ] `backend/serverless.yml`: add the `api` function (proxy event, `timeout: 29`) with a comment pointing to this plan.
- [ ] `backend/scripts/check-stack-limits.js` (`ROOT_MAX = 485`, `NESTED_MAX = 450`) with its fixture unit test, and `backend/package.json` script `check-stack-limits`.
- [ ] `backend/scripts/check-api-cutover.js` (checks A, B and C; checks A and B only while the live authorizer exists; missing stack or RestApi passes, §7.3) with a unit test over fixture templates and mocked AWS responses.
- [ ] `.github/workflows/deploy-dev.yml` and `deploy-prod.yml`: run `check-stack-limits` after the cycle check, run `check-api-cutover.js` before `Deploy backend`, and add the "Refresh API stage deployment" step after `deploy_backend`.
- [ ] `backend/lib/__tests__/serverlessConfig.test.ts`: assert the refresh step exists after `deploy_backend` in both workflows.

PR 2a (cut-over):
- [ ] `backend/serverless.yml`: delete every `- http:` block except `api`'s. Delete the `login` function. Add `- ${file(./legacy-bridge.js)}` under `resources:`.
- [ ] `backend/legacy-bridge.js`: emit Permissions and the Authorizer under their existing logical IDs (list generated from the pre-2a function set).
- [ ] Delete `backend/functions/auth/login.ts` and its tests. Remove the `/auth/login` path from `backend/docs/openapi.yaml` and run `npm run embed-docs`.
- [ ] Rewrite `backend/functions/__tests__/routeAccess.test.ts` per §5.10.
- [ ] `backend/scripts/diff-live-template.js` (read-only pre-deploy diff, §6 2a; skips `VersionsNestedStack`, allows `AWS::Lambda::Version` removal). A bridged permission that is not live passes only when its target function is also new in the packaged templates (prod lags main, so 2a can create a function and its bridged permission together). Run by both deploy workflows before `Deploy backend` ("Diff packaged templates against live stack"), so a failure blocks the deploy.
- [ ] `backend/scripts/check-api-cutover.js` check D (while the live authorizer exists): refuse a proxy-only template (no explicit Methods) when the live API has no `/{proxy+}` resource, so 2a cannot reach a stage that never ran deploy 1.
- [ ] PR description checklist: deploy 1 ran on **both** stages (live `/{proxy+}` present) and `proxy-parity-check.js` passed on each before 2a merges, with the run URLs.
- [ ] `backend/scripts/check-stack-limits.js`: lower `ROOT_MAX` to 450 and update its test.
- [ ] Refresh step: add the idempotent stage throttling `update-stage` (§7.5, `R=500`/`B=1000` cost cap) in both workflows.

PR 2b (delete dead targets):
- [ ] `backend/serverless.yml`: remove the legacy functions listed in §6 2b, `adminAuthorizer` and the `legacy-bridge.js` reference.
- [ ] Delete `backend/legacy-bridge.js`, `backend/functions/auth/authorizer.ts` and its tests.
- [ ] Delete `backend/scripts/diff-live-template.js`, its test, its "Diff packaged templates against live stack" step in both workflows and the matching `serverlessConfig.test.ts` assertion (the script imports `legacy-bridge.js`).
- [ ] `backend/lib/__tests__/serverlessConfig.test.ts`: assert that only `api` has `http` events and that no `authorizer:` remains.
- [ ] PR description: the prod 2a run URL and refresh `deploymentId` (merge gate, §6).

PR 3 (docs and cleanup):
- [ ] `CLAUDE.md` (API Gateway and auth rows, "Admin endpoints are protected in one of two ways" becomes in-Lambda only), the `backend/stacks-map.js` header comment (note that the plugin is inert, and why it is kept), and `README.md` if it describes per-function endpoints.
- [ ] Memory note update. Optional `versionFunctions: false` and esbuild.

Every PR: run `/verify`, and `npx tsc --noEmit` for frontend and backend before pushing.

## Review log

### Round 1 (adversarial review of v1, 2026-11-24)

| # | Severity | Issue | Verdict | Verification and change |
|---|---|---|---|---|
| 1 | major | 2a and 2b can reach prod in one deploy; owner discipline is the only gate | **Accepted** | `deploy-prod.yml` deploys the head of main only (`if: github.ref == 'refs/heads/main'`) and prod lags main today. Added a required merge gate (2b merges only after prod ran 2a and the refresh step) and CI check B in `check-api-cutover.js` (§7.3). Check B refuses a 2b template unless `get-resources` is proxy-only. If a refresh was missed, it runs `create-deployment`, then requires `get-deployment --embed apisummary` keys ⊆ {`/`, `/{proxy+}`}. `apisummary` was confirmed to work read-only on devtest (192 paths today). |
| 2 | major | Offline: serverless-offline's default `principalId` makes `dispatch()` skip `authenticate()`, so the Admin bypass never runs | **Accepted (with a correction)** | Confirmed at `LambdaProxyIntegrationEvent.js:181-191` and `router.ts:143-148`. Correction: router role checks do **not** 403 offline, because `requireRole` returns `null` when `IS_OFFLINE` (`auth.ts:58`). The real breakage is the ~40 handlers that check `isSuperAdmin`/`hasRole`/`groups` themselves, and self-service routes running as a fake user. The outcome (local admin broken after the migration) holds. `api/handler.ts` now drops `requestContext.authorizer` offline (`normalizeOfflineEvent`, §5.9), with a handler test for an offline-shaped event, and the smoke test includes a super-admin route. |
| 3 | minor | PR1 fails `routeAccess.test.ts` | **Accepted** | `routeAccess.test.ts:234-236` throws on a `handler.ts` without `routes`, and its parser would pick up the `api` event. PR1 adds `'api/handler.ts'` to `NO_ROUTE_TABLE`, which both tests skip. |
| 4 | minor | Flip-flop guard keyed on a file that exists from PR1 | **Accepted** | True: the marker was created in PR1. Replaced it with check A of the cut-over gate, keyed on live state (a proxy-only API plus a template with explicit Methods). It is added in PR1, so every later branch carries it. Documented the residual gap: a workflow runs from the deployed ref, so pre-PR1 branches via dispatch or re-run carry no gate. The impact is devtest only, and a rule covers it. |
| 5 | minor | The 2a change-set gate cannot run as written | **Accepted** | Live root `OverflowNestedStack.TemplateURL` points at `serverless/wwe-2k-league-api/devtest/<ts>-<iso>/...`, which only `serverless deploy` uploads. Replaced the change set with the read-only `diff-live-template.js`: a per-stack logical-ID diff and a property diff of bridged Permissions and the Authorizer against `get-template`. |
| 6 | minor | Reverting 2a re-runs the original 500-resource problem | **Accepted** | `stacks-map.js` routes new `ApiGateway::Method`/`Resource` to Overflow (lines 59-63), and the plugin does not count parameters. The only supported 2a rollback is now `update-stage`. A template revert is marked unsupported, and if ever used it needs `check-stack-limits` and `check-stack-cycles` first. The 2b rollback is now fix-forward, with a limits check if reverted. |
| 7 | minor | Unknown paths now invoke Lambda; 403 becomes 404 | **Accepted** | Confirmed: `get-stage` methodSettings `{}` on both stages, and no usage plans. Added §5.5 (behaviour change, `UNMATCHED` log label without the raw path), §7.5 stage throttling via idempotent `update-stage` in the refresh step, and a §10 row. The cost per request is small, but the 403→404 change and the throttling gap are real. |

Decision unchanged: option C (one `api` Lambda behind `/{proxy+}`). Every change is to the migration's safety rails, the offline adapter or the tests.

### Round 2 (adversarial review of v2, 2026-11-24)

| # | Severity | Issue | Verdict | Verification and change |
|---|---|---|---|---|
| 1 | major | PR1 parity run with a token would execute every write twice, including `DELETE /admin/clear-all` on devtest | **Accepted** | `clearAll.ts` checks only `requireSuperAdmin` and `isBulkDataOperationAllowed()`, and `dataTransferConfig.ts:70` allows `devtest`. `test-invoke-method` invokes the Lambda for real. Worse than reported: it also bypasses gateway authorizers, so even a tokenless test-invoke on an explicit `adminAuthorizer` route reaches the handler. §6 PR 1 now uses `proxy-parity-check.js`, which hard-refuses authenticated non-GET calls, checks non-GETs tokenless for 401/403 only (proxy via test-invoke, explicit via real stage `curl`), and has a heavy-GET denylist. Same rule on prod. Added a §10 row and a checklist item. |
| 2 | minor | `diff-live-template.js` fails every deploy on hashed `AWS::Lambda::Version` IDs | **Accepted** | Live devtest `VersionsNestedStack`: 51 Versions, all `DeletionPolicy: Retain`, plus 51 Parameters and 51 Outputs keyed on the same hashes. Removal of `AWS::Lambda::Version` is now allowed, and the script skips `VersionsNestedStack`. |
| 3 | minor | Check A misses the 2b→2a flip-flop | **Accepted** | A 2a-only template has no explicit Methods (check A passes) and has the authorizer (check B does not apply), so ~41 functions, log groups, permissions and the authorizer would be recreated in Overflow. Added check C (live stack lacks `AdminAuthorizerApiGatewayAuthorizer`, packaged template has it → fail) and widened the freeze to "until 2b reaches both stages". |
| 4 | minor | Check B blocks the first deploy of a new stage | **Accepted** | After 2b, check B runs on every deploy and `describe-stack-resource` errors on a missing stack. A missing stack or RestApi now passes all checks, with unit tests. |
| 5 | minor | Throttle formula uncomputable; stage limit lets one client 429 everyone | **Accepted** | API Gateway `Count` is 1-minute resolution. Resized from per-minute `Sum` (`R = max(500, ceil(peak/60)*20)`, `B = 2R`, today 500/1000), documented as a cost cap only, and named WAF rate-based rules as the per-client follow-up. |
| 6 | minor | No-tie test misses overlaps with params in different positions | **Accepted (router change)** | `router.ts:104-106` ranks by param count then index, unlike API Gateway. Chose to fix the cause: PR 1 switches the proxy fallback to leftmost-literal precedence (no greedy params exist, so it is total). The reviewer's pairwise check found no current divergence, so behaviour is unchanged. The routes test now unifies every same-method pair and asserts the router picks the gateway's choice, failing on true shape ties. |

Decision unchanged: option C. Round 2 changes are to verification safety, the CI gate, the throttle sizing and the router's precedence rule.

### Round 3 (adversarial review of v3, 2026-11-24)

| # | Severity | Issue | Verdict | Verification and change |
|---|---|---|---|---|
| 1 | major | A flat 450-resource guard refuses the PR1 deploy on both stages | **Accepted (2a part corrected)** | Re-measured read-only: both roots are 478 (281 Methods, 44 Resources, 43 Functions, 43 LogGroups, 41 Tables...), and `migrate-existing-resources.js` keeps deployed resources in place, so PR1's packaged root is 478 and fails at 450. Correction: 2a itself would pass, because it removes the 281 Methods and 44 Resources from root (about 150 left). Fix: `ROOT_MAX = 485` ("must not grow") in PR1, `NESTED_MAX = 450`; 2a lowers `ROOT_MAX` to 450. Added a fixture unit test (478 passes at 485, fails at 450; 486 fails). §6 PR1, §6 2a, §7.1 and §11 updated. |
| 2 | minor | Rewritten routeAccess test drops the "no public route behind the gateway authorizer" check | **Accepted** | Confirmed: `routeAccess.test.ts:333-340` relies on `hasAuthorizer` parsed at line 199, and no public allowlist exists (only `NO_ROUTE_TABLE`, `SELF_SERVICE_WRITES`, `ADMIN_ONLY_ROUTES`). The parity fixture now stores `hasAuthorizer` per event, and the rewrite asserts that no formerly gateway-authorized route is `public`. A `PUBLIC_ROUTES` allowlist is added in PR1 (proven against today's tables) and must equal the merged table's public set, so any new public route needs a reviewed test edit. |
| 3 | minor | Check A blocks the §10 slow-route escape hatch forever | **Accepted** | True as written: check A had no end. Rather than retire it by a later PR, check A now runs only while the live stack still has `AdminAuthorizerApiGatewayAuthorizer` (between 2a and 2b), so it retires itself per stage. After 2b, check C still catches a pre-2a template, because every pre-2a template carries the authorizer. §10 now says the escape hatch is available after 2b. Unit tests added for the boundary. |

Decision unchanged: option C. Round 3 changes are to the guard thresholds, the access tests and the scope of check A.

### Round 4 (adversarial review of v4, 2026-11-24)

| # | Severity | Issue | Verdict | Verification and change |
|---|---|---|---|---|
| 1 | minor | Check B blocks the §10 slow-route escape hatch, and check C blocks the documented 2b revert | **Accepted** | True as written: check B keyed only on the packaged template, which lacks the authorizer on every deploy from 2b on, so the deploy after a slow route was added would fail. And a 2b revert is the 2a template (authorizer present) over a stage without it, which check C refuses. Check B now runs only while the live stack still has `AdminAuthorizerApiGatewayAuthorizer` (the first 2b deploy per stage), mirroring check A, with unit tests for the boundary. The 2b template revert is now marked unsupported (§6 2b, §10); a needed function is re-added forward without the authorizer. |
| 2 | minor | Router resolves method before resource, unlike API Gateway | **Accepted** | Confirmed at `lib/router.ts:100-106` (method filter before the specificity sort) and in the tables: `players/handler.ts` declares `GET`/`PUT /players/me` and `DELETE /players/{playerId}`, so `DELETE /players/me` would reach `deletePlayer` with `playerId='me'`; `notifications/handler.ts` has the same shape for `mark-all-read`. PR 1's router change now ranks all path matches first and returns 405 when the winning template lacks the method (§5.1). §5.10 adds a cross-method gateway-equivalence test over every unifying template pair and a `DELETE /players/me` router unit case; §10 and §11 updated. |

Decision unchanged: option C. Round 4 changes are to the scope of check B, the 2b rollback stance and the router's resource-before-method resolution.
