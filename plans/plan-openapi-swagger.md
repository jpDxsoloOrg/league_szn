# Plan: Create OpenAPI Spec with Swagger Docs

## Context

The WWE 2K League API has grown to 74 endpoints across 16 domains (auth, players, matches, championships, tournaments, standings, seasons, divisions, stipulations, match-types, events, contenders, images, admin, fantasy, challenges, promos, statistics, site-config, users, profile). Currently, the only API documentation lives in the CLAUDE.md file, which is not machine-readable and is incomplete (it lists only the original endpoints, not the newer fantasy, challenges, promos, statistics, contenders, events, stipulations, or match-types domains). This plan creates a comprehensive OpenAPI 3.0 specification and serves interactive Swagger UI documentation.

## Complete Endpoint Catalog

From `backend/serverless.yml` lines 146-827:

**Public Endpoints (no auth):**
1. `GET /players` - List all players
2. `GET /matches` - List matches (query: `?status=`)
3. `GET /championships` - List championships
4. `GET /championships/{championshipId}/history` - Championship reign history
5. `GET /championships/{championshipId}/contenders` - Contender rankings
6. `GET /tournaments` - List tournaments
7. `GET /standings` - Get standings (query: `?seasonId=`)
8. `GET /seasons` - List seasons
9. `GET /divisions` - List divisions
10. `GET /stipulations` - List stipulations
11. `GET /match-types` - List match types
12. `GET /events` - List events (query: `?eventType=&status=&seasonId=`)
13. `GET /events/{eventId}` - Get event with enriched match data
14. `GET /statistics` - Get statistics (query: `?section=&playerId=&seasonId=&player1Id=&player2Id=`)
15. `GET /site-config` - Get feature flags
16. `GET /fantasy/config` - Get fantasy configuration
17. `GET /fantasy/wrestlers/costs` - Get wrestler costs
18. `GET /challenges` - List challenges (query: `?status=&playerId=`)
19. `GET /challenges/{challengeId}` - Get single challenge
20. `GET /promos` - List promos (query: `?playerId=&promoType=`)
21. `GET /promos/{promoId}` - Get promo with responses

**Authenticated Endpoints (JWT Bearer token via adminAuthorizer):**
22-74. (See full list in serverless.yml lines 146-827 covering auth, admin, players CRUD, matches CRUD, championships CRUD, tournaments, seasons, divisions, stipulations, match-types, events, contenders, images, fantasy, challenges, promos management)

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/docs/openapi.yaml` | Create | The main OpenAPI 3.0 specification defining all 74 endpoints, schemas, and security |
| `backend/docs/swagger.html` | Create | Static Swagger UI HTML page that loads the openapi.yaml file |
| `backend/serverless.yml` | Modify (lines ~596-615 area) | Add a new Lambda function `serveApiDocs` to serve the Swagger UI and spec via API Gateway |
| `backend/functions/docs/serveDocs.ts` | Create | Lambda handler that serves swagger.html and openapi.yaml content |
| `backend/package.json` | Modify | Add `validate-api-docs` npm script |

## Implementation Steps

### Step 1: Create the OpenAPI 3.0 Specification File

**File**: `backend/docs/openapi.yaml`

Create this file with the following structure:

1. **Info block**: Set `openapi: 3.0.3`, title "WWE 2K League API", version matching package.json (1.0.0), description, and server URLs for both environments:
   - `https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev` (prod)
   - `https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest` (dev)
   - `http://localhost:3001/dev` (local)

2. **Security schemes** under `components.securitySchemes`: Define `BearerAuth` as type `http`, scheme `bearer`, bearerFormat `JWT`, with a description referencing AWS Cognito

3. **Tags** for logical grouping (matching the serverless.yml comment sections): Auth, Users, Site Config, Profile, Players, Matches, Championships, Tournaments, Standings, Seasons, Divisions, Stipulations, Match Types, Events, Contenders, Images, Admin, Fantasy, Challenges, Promos, Statistics

4. **Component schemas** derived from `frontend/src/types/index.ts` and the domain type files:
   - `Player` (from `types/index.ts` line 1-13)
   - `Match` (from `types/index.ts` line 15-32)
   - `ScheduleMatchInput` (from `types/index.ts` line 34-48)
   - `Championship` (from `types/index.ts` line 50-59)
   - `ChampionshipReign` (from `types/index.ts` line 61-69)
   - `Tournament` (from `types/index.ts` line 71-81), including `TournamentBracket`, `BracketRound`, `BracketMatch`, `RoundRobinStanding`
   - `Standings` (from `types/index.ts` line 107-111)
   - `Season` (from `types/index.ts` line 113-121)
   - `Division` (from `types/index.ts` line 123-129)
   - `Stipulation` (from `types/index.ts` line 131-137)
   - `MatchType` (from `types/index.ts` line 139-145)
   - `LeagueEvent`, `EventWithMatches`, `CreateEventInput`, `UpdateEventInput`, `MatchCardEntry`, `EnrichedMatchData` (from `types/event.ts`)
   - `Challenge`, `ChallengeWithPlayers`, `CreateChallengeInput`, `ChallengePlayerInfo` (from `types/challenge.ts`)
   - `Promo`, `PromoWithContext`, `CreatePromoInput` (from `types/promo.ts`)
   - `FantasyConfig`, `WrestlerCost`, `WrestlerWithCost`, `FantasyPicks`, `FantasyLeaderboardEntry` (from `types/fantasy.ts`)
   - `ContenderRanking`, `ContenderWithPlayer`, `ChampionshipContenders` (from `types/contender.ts`)
   - `PlayerStatistics`, `HeadToHead`, `ChampionshipStats`, `Achievement`, `LeaderboardEntry`, `RecordEntry` (from `types/statistics.ts`)
   - `SiteFeatures` (from `siteConfig.api.ts` lines 3-9)
   - `ErrorResponse`: `{ message: string }` (from `backend/lib/response.ts` line 30-34)

5. **Standard response schemas** based on `backend/lib/response.ts`: 200, 201, 204, 400, 401, 403, 404, 409, 500

6. **Path definitions** for all 74 endpoints. For each endpoint:
   - Set the correct HTTP method and path
   - Add `tags` for the domain
   - Add `security: [{ BearerAuth: [] }]` for authenticated endpoints
   - Define `parameters` for path params and query params
   - Define `requestBody` with correct schema reference for POST/PUT endpoints
   - Define `responses` with appropriate status codes and schema references

   Special attention needed for:
   - `GET /statistics`: Uses query param `section` to determine response shape -- model with separate schema names for each section response
   - `GET /matches`: query param `status` (optional)
   - `GET /standings`: query param `seasonId` (optional)
   - `GET /events`: three optional query params
   - `POST /challenges/{challengeId}/respond`: body contains `action` enum plus optional fields

### Step 2: Create the Swagger UI Static HTML Page

**File**: `backend/docs/swagger.html`

Create a single-page HTML file that:
- Loads Swagger UI from the unpkg CDN
- Points to the openapi.yaml URL served by the same API (relative path `/dev/api-docs/spec`)
- Includes basic styling and the Swagger UI initialization script
- Sets `deepLinking: true` for shareable URL fragments
- Configures `tryItOutEnabled: true` so users can test endpoints directly

### Step 3: Create the Lambda Handler for Serving Docs

**File**: `backend/functions/docs/serveDocs.ts`

Create a Lambda handler that:
- Reads the request path to distinguish between the HTML page and the YAML spec
- For the HTML page route (`/api-docs`): Returns the swagger.html content with `Content-Type: text/html`
- For the spec route (`/api-docs/spec`): Returns the openapi.yaml content with `Content-Type: text/yaml`
- Uses `fs.readFileSync` to load the files from the deployment package
- Returns appropriate CORS headers matching the existing pattern in `backend/lib/response.ts` lines 4-11

### Step 4: Add API Gateway Routes in serverless.yml

**File**: `backend/serverless.yml`

Add two new function entries (insert near line 596, before the Admin section):

1. `serveSwaggerUi` function: Handler `functions/docs/serveDocs.handler`, HTTP event `GET /api-docs` with CORS, no authorizer
2. `serveOpenApiSpec` function: Same handler, HTTP event `GET /api-docs/spec` with CORS, no authorizer

Also add to the `package` section an `include` pattern for `docs/**` to ensure the yaml and html files are bundled into the Lambda deployment.

### Step 5: Validate the Specification

Add an npm script `"validate-api-docs": "npx @redocly/cli lint docs/openapi.yaml"` to `backend/package.json`. Run validation to ensure the spec is syntactically correct and all `$ref` references resolve.

### Step 6: Add a README section

Update the project documentation to document:
- How to access the Swagger UI (local: `http://localhost:3001/dev/api-docs`, prod URL, dev URL)
- How to validate the spec (`npm run validate-api-docs`)
- How to update the spec when adding new endpoints

## Dependencies & Order

1. **Step 1** (openapi.yaml) must be completed first -- it is the foundation
2. **Step 2** (swagger.html) can be developed in parallel using a relative URL
3. **Step 3** (Lambda handler) can be developed in parallel with Steps 1-2
4. **Step 4** (serverless.yml changes) depends on Step 3 handler file existing
5. **Step 5** (validation) must run after Step 1 is complete
6. **Step 6** (documentation) runs last

No new npm dependencies required for core implementation. Swagger UI is loaded from CDN. Optional validation tool (`@redocly/cli`) is devDependency only.

## Testing & Verification

1. **Spec Validation**: Run `npx @redocly/cli lint docs/openapi.yaml` to catch syntax errors, broken refs, and missing required fields
2. **Local Testing**: Start serverless-offline, navigate to `http://localhost:3001/dev/api-docs`, verify Swagger UI loads and renders all 74 endpoints
3. **Schema Accuracy**: For each domain, compare the OpenAPI schema against the TypeScript interfaces in `frontend/src/types/` to verify property names, types, and required fields match
4. **Try It Out**: Use Swagger UI's "Try it out" feature on public endpoints to confirm request/response shapes match the spec
5. **Auth Flow**: Verify that the Swagger UI "Authorize" button accepts a JWT token and that authenticated endpoints correctly send the Bearer token
6. **Deployment Verification**: After deploying to devtest, verify the docs are accessible at the devtest API URL
7. **Cross-reference Completeness**: Ensure every function in `serverless.yml` lines 146-827 that has an `http` event has a corresponding path in the OpenAPI spec

## Risks & Edge Cases

1. **Spec Size**: With 74 endpoints and 40+ schemas, the openapi.yaml file will be 2000-3000+ lines. Consider splitting into multiple files using `$ref` if maintainability becomes an issue. Starting with a single file is simpler for Lambda bundling.
2. **Lambda Bundling**: The `serverless-plugin-typescript` plugin may not automatically include non-TS files (yaml, html). The `package.include` configuration must explicitly list `docs/**`. Test by checking the `.serverless/*.zip` contents.
3. **Statistics Endpoint Polymorphism**: The `GET /statistics` endpoint returns different response shapes based on the `section` query parameter. Define separate schema names for each section response and document the mapping in the endpoint description.
4. **Response Envelope Inconsistency**: Some endpoints return arrays directly, while others wrap in an object. The spec must accurately capture each endpoint's actual response shape.
5. **CORS and Browser Testing**: Swagger UI's "Try it out" makes browser requests. The existing CORS config may only allow the frontend origin domain. Users testing from the Swagger UI hosted on the API may get CORS errors unless the CORS config is updated.
6. **Keeping Spec in Sync**: As new endpoints are added, the spec must be updated manually. Consider adding a CI check that validates the spec on every PR.
7. **File Serving from Lambda**: Lambda has a 6MB response payload limit. The combined files will be well under this (likely 200-300KB total).
8. **Binary Content Handling**: API Gateway may need `binaryMediaTypes` configuration if serving the HTML file causes encoding issues. Text-based content types should work with default config.
