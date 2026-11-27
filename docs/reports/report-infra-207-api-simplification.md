# INFRA-207: what was done and why

Ticket: Solo Kanban #207 [INFRA-01], *Decide on splitting the backend into domain services (CloudFormation 500-resource limit)*.
Plan (the spec, with its adversarial review log): [`docs/plans/plan-infra-207-api-simplification.md`](../plans/plan-infra-207-api-simplification.md).

## The answer in one paragraph

We are **not** splitting into domain services. Instead, every HTTP request goes to **one `api` Lambda behind a single `ANY /{proxy+}` route** on the existing REST API, and routing plus auth happen in application code (`lib/router.ts` and the per-domain `routes` tables, which mostly existed already). After this, a new endpoint is a route-table entry and a test. It adds **zero** CloudFormation or API Gateway resources, so the 500 limit stops being something features can hit. The API URL, paths, Cognito, tables and frontend do not change.

## Why (measured 2026-11-24, read-only)

| | prod (`wwe-2k-league-api-dev`) | devtest |
|---|---|---|
| Root stack resources | 478 / 500 | 478 / 500 |
| API Gateway Methods in root | 281 | 281 |
| All stacks combined | 734 | 892 |
| API Gateway resources on the REST API (quota 300) | 166 | **215** |
| Lambda functions (all the same ~7.5 MB zip) | 47 | 51 |

There were two walls, not one:
1. **CloudFormation's 500 resources per stack.** The Overflow nested stack only delays this.
2. **API Gateway's 300 resources per REST API.** Devtest is at 215. A domain split does nothing about this, because the quota is per API, not per stack.

Growth comes from endpoints (each one adds Methods and Resources), not from functions, so "consolidate more Lambdas" was never going to hold.

### Options rejected

| Option | Why not |
|---|---|
| Domain split into 5 services (the ticket's proposal) | Every endpoint still adds resources, just in N stacks. It doesn't touch the 300 quota. It needs a custom domain, a cert, DNS, new frontend base paths and N ordered deploys. Its first slice (fantasy) no longer exists. Least simple option. |
| HTTP API v2 + catch-all | The same zero-growth result, but with a new API id and URL. That means secrets, `.env*`, e2e, CSP and openapi all change, and the payload format changes too. A possible later step, not needed now. |
| More Lambda consolidation / `ANY` per path | Each path still costs a Resource and an OPTIONS method, so growth continues. |
| Status quo + CI guard | Detects the problem, doesn't remove it. The guard is kept anyway as a tripwire. |

## How the plan was tested before any code

1. Five parallel research agents covered the infra config, the routing code, auth and the frontend, CI, and the live stacks (read-only AWS).
2. Three agents each designed one approach independently: proxy Lambda, HTTP API v2, domain split.
3. A decision agent picked one and wrote the plan.
4. An **adversarial reviewer tried to prove the plan wrong**, the author fixed what held up, and this repeated. It took 4 rounds before the reviewer found no blocking or major issues. The decision never changed, but the migration got much safer. Main catches:
   - **API Gateway deployments are snapshots.** Removing routes and deleting their Lambdas in one deploy would leave the live stage pointing at deleted functions, which means minutes of 5xx. That is why the migration is split into 2a and 2b, with a temporary bridge and a post-deploy stage refresh.
   - **Prod lags main**, so 2a and 2b could reach prod in one deploy. A merge gate plus a CI check now block this.
   - **serverless-offline injects a fake principal**, which would have broken local admin auth. Fixed in `normalizeOfflineEvent`.
   - **A tokenless parity check would have run real writes.** `test-invoke-method` bypasses authorizers and could hit things like `DELETE /admin/clear-all` on devtest. The parity script now hard-refuses authenticated non-GET calls.
   - **The router chose method before resource, unlike API Gateway.** 26 cases, for example `DELETE /players/me`, would have reached `deletePlayer` with `id='me'`. The router now resolves the most specific resource first, then the method, and returns 405 otherwise.
   - **A flat 450 resource guard would have blocked PR1.** Root stays at 478 until 2a, so the guard is 485 in PR1 and 450 from 2a.

## What was built: three stacked branches, each committed, none pushed

### 1. `refactor/infra-207-api-simplify`, commit `9d209897` (PR1, additive, behaviour unchanged)
- `functions/api/routes.ts`: merges all 34 domain route tables plus 8 wrappers for the old one-off entry points (standings, activity, statistics, rivalries, api-docs, image upload). 259 routes in total.
- `functions/api/handler.ts`:
  - offline normalisation;
  - a one-entry pre-router allowlist for `POST /auth/setup`;
  - one structured log line per request (`UNMATCHED` for 404/405, raw path never logged).
- `lib/router.ts`: proxy fallback now follows API Gateway precedence (leftmost literal beats `{param}`, resource before method, 405 otherwise).
- `serverless.yml`: new `api` function with the `/{proxy+}` event. All explicit routes stay and still win.
- Tests:
  - every route is reachable through the proxy;
  - pairwise gateway-equivalence (same-method and cross-method);
  - a parity fixture of all 209 pre-migration gateway events, each of which must still resolve;
  - no route that had the gateway authorizer may become public;
  - a reviewed `PUBLIC_ROUTES` allowlist.
- CI scripts, wired into both deploy workflows:
  - `check-stack-limits.js`: resource, parameter and output caps;
  - `check-api-cutover.js`: checks A–D, which block flip-flops between migration states, 2b arriving before 2a, and 2a arriving before PR1;
  - a **Refresh API stage deployment** step after every backend deploy;
  - `proxy-parity-check.js`: read-only parity check for devtest and prod.

### 2. `refactor/infra-207-2a-cutover`, commit `5f61f03a` (cut-over)
- Removes every explicit `http` event. Only `api`'s proxy remains.
- Deletes the unused `POST /auth/login`: 0 invocations in 90 days, and the frontend signs in through Cognito directly.
- `backend/legacy-bridge.js` keeps the old functions' API permissions and the gateway authorizer alive under their **live logical IDs and byte-identical properties**, so the stale snapshot never points at deleted targets.
- `scripts/diff-live-template.js`, which now also runs in CI, diffs the packaged templates against the live stacks. It fails if any Function, Permission or Authorizer would be removed or moved, or if a bridged property differs. **Passes read-only against live devtest and prod.**
- Stage throttling as a cost cap (500 rps, burst 1000; prod's peak is about 13.5 rps).
- Packaged devtest: **root 478 → 150**, Overflow 232 → 42.

### 3. `refactor/infra-207-2b-cleanup`, commit `40238d1a` (delete dead targets + docs)
- Deletes the 41 legacy HTTP functions, `adminAuthorizer`, `functions/auth/authorizer.ts`, the bridge and the 2a-only diff tool.
- Remaining functions: `api`, `contenders` and `progression` (async targets), `postConfirmation` and `preSignUp` (Cognito triggers), and 4 scheduled jobs.
- `dispatch()` now **always** verifies the token itself and never trusts a principal already on the event.
- Docs: CLAUDE.md gets a new "Adding an endpoint" section and the auth section now describes in-Lambda auth only. README and the `stacks-map.js` header are updated.
- `docs/plans/plan-infra-207-2b-pr-checklist.md`: the merge-gate checklist for the 2b PR.
- Packaged devtest: **root 63, all stacks ~107** (from 892). API Gateway: 2 resources (from 215).

### Verification on the final branch
Backend lint, backend `tsc`, frontend `tsc`: clean. Backend tests: **289 files, 4267 tests passing**. Each stage was also packaged with `serverless package --stage devtest` and passed the cycle, limit and cut-over checks against the live stacks (read-only). Each stage was reviewed by an independent agent. Every finding was verified before it was fixed: 4 in PR1, 3 in 2a, 4 in 2b. None of it has been deployed yet.

## What has to happen next (in order)

1. **Step 0, owner:** run Deploy to Production from current `main`, so prod catches up (v1.7.0) before the migration starts.
2. **PR1** → merge → devtest deploy runs automatically → run `proxy-parity-check.js` on devtest → owner deploys prod.
3. **2a** → devtest deploy → e2e and the manual walkthrough (login, refresh-on-401, image upload, record result, docs) → owner deploys prod. Rollback is `update-stage` back to the previous deployment id, which is printed in the job log.
4. **2b** merges **only** after both stages have run 2a and the refresh step. Fill in the checklist in `plan-infra-207-2b-pr-checklist.md`. CI check B enforces this as well.

Only one migration PR can be in flight at a time. From 2a until 2b has reached both stages, other PRs must be rebased onto the migration. The cut-over gate refuses a stale template.

## Left out on purpose / follow-ups
- `serverless-plugin-split-stacks` and `stacks-map.js` stay installed. Removing them would move deployed fixed-name resources between stacks.
- Cold start rises from about 95 ms to about 190 ms of module init, but one warm pool serves everything. esbuild bundling (about 110 ms) is a follow-up.
- Unknown paths now reach the Lambda and get a 404 instead of API Gateway's free 403. Throttling caps the cost. A WAF rate rule would be the per-client follow-up.
- HTTP API v2 is a possible later move once CI reads the API URL from stack outputs.
- Reviewer side-finding: `.mcp.json` (Stitch API key) and `backend/neon/.env.neon` were untracked but **not** git-ignored. A `.gitignore` fix is in the working tree, **uncommitted**, for you to decide on.
