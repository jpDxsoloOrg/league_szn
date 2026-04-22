# Plan: Split the monolithic backend into domain services

**Status:** draft — decide whether to pursue before starting work

**Related:** PR #295 (wrestler roster) hit the CloudFormation 500-resource ceiling during deploy; we consolidated 9 small Lambdas to claw back 16 slots but are now at 496/500 — 4 slots of headroom. This plan is the sustainable fix.

---

## 1. Why

The main service (`wwe-2k-league-api-<stage>`) is one CloudFormation stack with **~42 Lambda functions, 37 DynamoDB tables, and 306 API Gateway Methods** — 496 root-stack resources against AWS's hard 500-per-stack limit.

`serverless-plugin-split-stacks` already migrates several resource types into nested stacks (ApiGateway::Resource, Lambda::Permission, Lambda::Version). We've extended it as far as it can go: force-migration of the remaining types (LogGroups, Methods, Functions) fails in a live service because the delete-from-old-stack / create-in-new-stack dance conflicts on unique physical attributes.

Further Lambda consolidation (what we just did) is a coping mechanism, not a fix. Endpoint count grows faster than anything else (306 Methods vs. 31 Functions), and every new HTTP route adds to root. At the current velocity we'll be back at the ceiling in 1–2 feature PRs.

The plugin's own README states the answer:

> "This plugin is not a substitute for fine-grained services — try to limit the size of your service."

---

## 2. Non-goals

- **No rewrite of existing handlers.** Each handler keeps its current repository-pattern code. Only the Lambda + CloudFormation boundary moves.
- **No migration to API Gateway HTTP API (v2).** That's a separate, larger migration worth tracking but out of scope here.
- **No change to the auth story.** Cognito pool stays put; every service imports the existing authorizer.
- **No big-bang cutover.** Services split off one at a time. The main service shrinks as each slice moves out.
- **No client-side rewrite.** Frontend keeps using one API base URL. Per-service routing is handled by API Gateway custom-domain base-path mappings.

---

## 3. Target architecture

```
                     api.leagueszn.jpdxsolo.com  (custom domain)
                                  │
        ┌───────────┬─────────────┼─────────────┬──────────────┐
        │           │             │             │              │
    /auth/*    /roster/*    /matches/*    /content/*     /fantasy/*
      │           │             │             │              │
  core-      roster-       competition-   content-      fantasy-
  service    service        service        service       service
     │          │               │             │              │
  Users      Players         Matches       Promos       FantasyConfig
  SiteConfig Wrestlers       Championships Announcements FantasyPicks
  Cognito    TagTeams        Tournaments  Challenges    WrestlerCosts
             Stables         Seasons      Videos
             Divisions       Events       Notifications
             Overalls        Contenders   Activity
             Transfers       Stipulations
             Storyline       MatchTypes
             Requests        SeasonAwards
```

Five services, each a separate `serverless.yml` / CloudFormation stack:

| Service | Owns (tables) | Handlers (~count) | Est. root resources |
|---|---|---|---|
| **core-service** | Users, SiteConfig, Cognito UserPool | auth, admin, authorizer, postConfirmation | ~80 |
| **roster-service** | Players, Wrestlers, TagTeams, Stables, StableMembers, Divisions, Overalls, Transfers, StorylineRequests | players, wrestlers, tagTeams, stables, roster dispatcher | ~120 |
| **competition-service** | Matches, Championships, ChampionshipHistory, Tournaments, Events, ContenderRankings, RankingHistory, Seasons, SeasonStandings, SeasonAwards, Stipulations, MatchTypes | matches, championships, tournaments, events, contenders, seasons, competition dispatcher | ~150 |
| **content-service** | Promos, Challenges, Announcements, Videos, Notifications, Activity, Shows, Companies | promos, challenges, announcements, notifications, content dispatcher | ~80 |
| **fantasy-service** | FantasyConfig, FantasyPicks, WrestlerCosts, Matchmaking | fantasy, matchmaking | ~50 |

Each service has its own 500-resource budget. Even the biggest (competition at ~150) has ~350 slots of runway.

---

## 4. Cross-cutting concerns

### 4.1 API Gateway — one custom domain, per-service base paths

**Each service creates its own `AWS::ApiGateway::RestApi`.** A single custom domain (`api.leagueszn.jpdxsolo.com`) uses base-path mappings to route:

```yaml
# In core-service (or a standalone dns-service that owns the domain):
ApiDomainName:
  Type: AWS::ApiGateway::DomainName
  Properties:
    DomainName: api.leagueszn.jpdxsolo.com
    RegionalCertificateArn: ${env:API_ACM_CERT_ARN}
    EndpointConfiguration: { Types: [REGIONAL] }

# Each service registers its base path on the shared domain:
RosterBasePathMapping:
  Type: AWS::ApiGateway::BasePathMapping
  Properties:
    DomainName: !ImportValue api-custom-domain
    RestApiId: !Ref RosterRestApi
    Stage: ${self:provider.stage}
    BasePath: roster
```

Frontend keeps a single `VITE_API_BASE_URL` = `https://api.leagueszn.jpdxsolo.com`. Paths like `/roster/players`, `/matches/scheduled`, `/fantasy/picks` route automatically.

**Existing paths need prefixing.** Current routes are at `/players`, `/matches`, etc. — no domain prefix. As each service splits out, its paths move to `/<service>/<existing-path>`. Frontend API client updates in lockstep. Old routes can 301-redirect via a CloudFront behavior during a transition window if needed.

### 4.2 Cognito — one pool, imported by every service

Core-service owns the `AWS::Cognito::UserPool`, `UserPoolClient`, and the custom `adminAuthorizer` Lambda. Its stack exports the pool ARN and authorizer ID:

```yaml
# core-service outputs
Outputs:
  CognitoUserPoolArn:
    Value: !GetAtt CognitoUserPool.Arn
    Export: { Name: leagueszn-cognito-pool-arn-${self:provider.stage} }
  AdminAuthorizerId:
    Value: !Ref AdminAuthorizer
    Export: { Name: leagueszn-admin-authorizer-id-${self:provider.stage} }
```

Every other service imports and references:

```yaml
# roster-service
functions:
  players:
    events:
      - http:
          path: players
          method: post
          authorizer:
            type: CUSTOM
            authorizerId:
              'Fn::ImportValue': leagueszn-admin-authorizer-id-${self:provider.stage}
```

Authorizers are per-RestApi in API Gateway, so each service needs its own `AWS::ApiGateway::Authorizer` resource, but they all point at the single `adminAuthorizer` Lambda (imported by ARN). One authorizer Lambda, N wrapper resources — still better than N authorizer Lambdas.

### 4.3 DynamoDB — tables owned by one service, ARNs exported for cross-service reads

**Rule: each table is owned by exactly one service — the one that writes to it most.** Tables move to their owning service's stack over time (or stay put as imports — see §5 migration strategy).

Cross-service table access:
- **Reads**: owning service exports table name + ARN. Consumer service imports the ARN into its IAM role to grant read permissions.
- **Writes**: avoid cross-service writes. If content-service needs to update the Players table, go through roster-service's API, not direct table access. Keeps ownership clean, avoids schema-change coordination.

Example (content-service reads Players table for promo display):

```yaml
# roster-service outputs:
Outputs:
  PlayersTableArn:
    Value: !GetAtt PlayersTable.Arn
    Export: { Name: leagueszn-players-table-arn-${self:provider.stage} }

# content-service iam:
iamRoleStatements:
  - Effect: Allow
    Action: [dynamodb:GetItem, dynamodb:Query]
    Resource:
      'Fn::ImportValue': leagueszn-players-table-arn-${self:provider.stage}
```

### 4.4 Shared code — repositories, lib/

The `backend/lib/` and `backend/lib/repositories/` directories become a shared library that every service imports. Options:

1. **npm workspace** (recommended) — move `lib/` to `backend/packages/shared/`, each service's `package.json` depends on it. One Node project, multiple stacks.
2. **Symlinks or path mapping in tsconfig** — simpler but fragile with serverless packaging.

Stick with option 1 — it's standard, plays well with the existing repository pattern, and serverless-plugin-typescript handles it when configured correctly.

### 4.5 Deploy orchestration

A top-level `scripts/deploy.sh` (or `Makefile`) runs services in dependency order:

```
core-service      → (no deps)
roster-service    → depends on core (Cognito, authorizer)
competition-service → depends on core + roster (Players, TagTeams tables)
content-service   → depends on core + roster
fantasy-service   → depends on core + roster + competition
```

CI pipeline sequences the deploys. A service's stack update is idempotent, so redeploying all of them after every PR is fine for first-pass simplicity; optimize later with per-service triggers based on changed paths.

### 4.6 Local dev

`serverless-offline` runs per-service on different ports. `scripts/dev.sh` spawns all five in parallel:

```
core-service        http://localhost:3000
roster-service      http://localhost:3001
competition-service http://localhost:3002
content-service     http://localhost:3003
fantasy-service     http://localhost:3004
```

A lightweight nginx / `http-proxy` in front routes `/<service>/*` paths to the right port. Frontend dev server points at the proxy. One command brings everything up.

---

## 5. Migration strategy — incremental, one service at a time

Big-bang is a disaster. We split services off one at a time, shrinking the main service as each slice leaves.

### 5.1 Ordering — easiest first, riskiest last

| Order | Service | Rationale |
|---|---|---|
| 1 | **fantasy-service** | Self-contained. Fantasy tables only referenced by fantasy handlers. Few cross-domain dependencies. Proves the pattern with low blast radius. |
| 2 | **content-service** | Isolated features (promos, announcements, videos, challenges). Mostly reads from roster — no cross-writes. |
| 3 | **roster-service** | Moderate coupling — matches/tournaments read Players. Well-defined ownership boundary. |
| 4 | **competition-service** | Biggest — matches are the hub. Last because it depends on roster being extracted cleanly first. |
| 5 | **core-service remains** | Whatever's left in the original service becomes core-service (auth, site config, users). Rename the CF stack or leave it. |

Stop whenever the root-resource budget is comfortable; we don't have to do all five at once.

### 5.2 Per-service migration playbook

For each slice (pattern — apply to fantasy-service first):

1. **Create the new service directory**: `backend/services/fantasy/` with `serverless.yml`, `package.json`, `tsconfig.json`.
2. **Move handlers**: relocate `backend/functions/fantasy/*` and `backend/functions/matchmaking/*` to the new service.
3. **Move table definitions**: move the `FantasyConfig`, `FantasyPicks`, `WrestlerCosts`, `Matchmaking` table resource blocks from the main service's `serverless.yml` to the new one.
4. **Cross-stack imports**: set up Cognito authorizer import + any table ARN imports the new service needs (fantasy reads Players → import `PlayersTableArn`).
5. **Base-path mapping**: register `fantasy` base path on the shared custom domain.
6. **Table ownership transfer**: here's the critical bit — see §5.3 below.
7. **Frontend**: update API paths for fantasy endpoints (`/fantasy/picks` instead of `/picks`, etc.).
8. **Remove from main service**: delete the fantasy handler blocks + table definitions from main `serverless.yml`.
9. **Deploy main service first** (shrinks, removes now-owned-elsewhere resources with `DeletionPolicy: Retain` if data must survive — see §5.3).
10. **Deploy new service** (creates its stack, imports the retained resources if applicable).

### 5.3 Moving DynamoDB tables between stacks — the real risk

DynamoDB tables can't just move between CloudFormation stacks. Three options, in order of preference:

#### Option A — Leave the table in its original stack, grant cross-stack access

Simplest. Main service keeps owning the table definition; fantasy-service's Lambdas get IAM permission via cross-stack import.

Pro: zero data risk, zero downtime, instant.
Con: table ownership doesn't move — main service still has that slot. Doesn't help our budget problem, but does let us move the Lambdas (which does help).

Use this when table budget isn't the binding constraint (it isn't for us — we've got 37 tables and that's not growing fast; Methods are the problem).

#### Option B — Retain + Import (CloudFormation resource-import)

1. Main service: set `DeletionPolicy: Retain` on the table, deploy (removes CF ownership, table stays in AWS).
2. Delete the table resource block from main service, deploy again (CF forgets the table exists; it's still in AWS with all data).
3. New service: declare the same table resource, use `cfn import` to adopt it.

Pro: real ownership transfer, data preserved.
Con: multi-step, each deploy must be tested, easy to make a mistake (e.g., accidentally delete the table before `Retain` is applied). Requires downtime-tolerant moment.

#### Option C — Data migration to a new table

Create a new table with a different name in the new service. Copy data with a one-time script. Cut traffic over. Drop old table.

Pro: clean separation.
Con: downtime or dual-writes during migration. Expensive.

**Recommendation: default to Option A.** Only do Option B for tables that genuinely need to move (rare). Option C only if the schema is also being reshaped.

### 5.4 Rollback per slice

Each per-service split is its own PR + its own deploy. If something goes wrong:

- Revert the PR
- Redeploy main service (it adopts the handlers back)
- Delete the new service's stack

Because we defaulted to Option A (tables stay put), the data is never in a vulnerable state. The worst case is "endpoint 503s for a few minutes during rollback."

---

## 6. First slice — `fantasy-service` (if we do this)

Concrete scope for the first PR, as a proof of pattern:

### 6.1 Files

**New**:
- `backend/services/fantasy/serverless.yml`
- `backend/services/fantasy/package.json`
- `backend/services/fantasy/tsconfig.json`
- `backend/services/fantasy/functions/` — copied from `backend/functions/fantasy/` + `backend/functions/matchmaking/`

**Modified**:
- `backend/serverless.yml` — remove fantasy + matchmaking function blocks; keep FantasyConfig/FantasyPicks/WrestlerCosts/Matchmaking tables (Option A: main service keeps ownership, exports ARNs)
- `frontend/src/services/api/fantasy.api.ts` + `matchmaking.api.ts` — base URL updated to include `/fantasy/` prefix
- `frontend/src/services/api/apiClient.ts` — accept per-call path prefix, or just hardcode `/fantasy/` in the fantasy API clients

**New infra pieces needed**:
- Custom domain `api.leagueszn.jpdxsolo.com` + ACM cert (needs one-time manual setup)
- `AWS::ApiGateway::DomainName` + two `BasePathMapping` (one for main → `/` or no prefix, one for fantasy → `/fantasy`)

### 6.2 Deploy sequence (first time)

1. Stand up the custom domain + cert (manual AWS Console or separate serverless service).
2. Deploy main service with `DeletionPolicy: Retain` on the tables that fantasy will reference. Ensures if we ever do Option B later, data is safe.
3. Deploy fantasy-service. It imports Cognito + Players table ARN, creates its own API, registers `/fantasy` base path.
4. Update frontend, deploy.
5. Verify `/fantasy/*` endpoints work. Optionally clean up the old non-prefixed routes.

### 6.3 Root-resource impact

Main service fantasy+matchmaking = ~12 Methods + 2 Functions + 2 LogGroups + 4 tables = ~20 root resources
After split: all 20 leave main. Main drops from 496 → ~476. Fantasy service starts at ~50.

Each subsequent slice similar: main shrinks, new service starts lean.

---

## 7. Risks & open questions

1. **Custom domain + ACM cert setup** — not currently in the stack. Needs a one-time manual step or a separate `dns` service that owns the domain. Plan assumes a new cert `api.leagueszn.jpdxsolo.com`; could also reuse the existing `*.jpdxsolo.com` wildcard if available.
2. **Cognito authorizer import limitations** — API Gateway authorizers can't literally be shared across RestApis. Each service creates its own `AWS::ApiGateway::Authorizer` resource that points at the single `adminAuthorizer` Lambda (imported by ARN). N wrappers, 1 Lambda.
3. **Shared lib packaging** — npm workspaces are the right answer, but this is the first time the repo uses them. Some tooling ceremony.
4. **CI complexity** — five stacks means five deploys. Longer pipeline. Consider deploying only changed services per PR based on path filters.
5. **Testing cross-service flows** — e.g., fantasy creating a pick that references a Player. Harder to test end-to-end locally; `serverless-offline` per-service + proxy helps.
6. **Developer cognitive load** — "which service owns X?" becomes a question. Good docs + CODEOWNERS file help.
7. **Cross-service IAM drift** — imports need to be updated if table ARNs change. Exports should be named conservatively and kept stable.
8. **Observability** — per-service CloudWatch logs now. Log aggregation / X-Ray tracing become more valuable.

---

## 8. Decision we need from you

Before committing to this:

- [ ] **Do we do it?** If no, the alternative is "keep consolidating Lambdas reactively until the ceiling is unavoidable, then migrate to HTTP API v2."
- [ ] **Start with fantasy-service?** Or a different slice?
- [ ] **Custom domain name** — `api.leagueszn.jpdxsolo.com` or something else? Cert strategy (new vs. wildcard)?
- [ ] **Base paths** — names for each slice: `/roster`, `/matches`, `/content`, `/fantasy`? Or different?
- [ ] **Timeline** — do slice 1 before next feature, or parallel with feature work?

---

## 9. What I recommend if we proceed

1. **Now (this week)**: add the CI guard that fails PRs exceeding ~470 root resources. Cheap insurance while the split is planned.
2. **This month**: do fantasy-service split as slice 1. Prove the pattern end-to-end with the lowest-risk domain.
3. **Over the next quarter**: split off content, roster, competition in that order, on a cadence that doesn't block feature work.
4. **Continue**: every new feature slots into an existing service by domain; new domains that don't fit get their own service from day 1.

The goal isn't to finish splitting; it's to stop the root-ceiling fire drill and give each domain its own space to grow.
