# WWE 2K League - Project Documentation for Claude

## Project Overview
A serverless web application for managing a WWE 2K league with player standings, championships, matches, and tournaments.

## Tech Stack

### Frontend Technologies

| Technology | Version | How It's Used |
|------------|---------|---------------|
| **React** | 18.2.0 | Core UI framework - builds all components (Standings, Championships, Matches, Tournaments, Admin panels) |
| **TypeScript** | 5.2.2 | Provides type safety across all frontend code; interfaces defined in `types/index.ts` |
| **Vite** | 5.0.8 | Development server with HMR; production bundler with optimized builds |
| **React Router DOM** | 6.20.1 | Client-side routing - handles navigation between all pages without full reloads |
| **i18next** | 25.8.1 | Internationalization - supports English and German; auto-detects browser language |
| **react-i18next** | 16.5.4 | React hooks (`useTranslation`) for i18next integration |
| **AWS Amplify** | 6.16.0 | Configures and initializes AWS services (Cognito auth) |
| **amazon-cognito-identity-js** | 6.3.7 | Handles admin login/logout with Cognito User Pool |
| **@aws-sdk/client-s3** | 3.981.0 | Browser-side S3 uploads for player/championship images |
| **@aws-sdk/lib-storage** | 3.981.0 | Multi-part upload support for larger images |
| **ESLint** | 9.x | Code quality with React Hooks and TypeScript rules (flat config) |

### Backend Technologies

| Technology | Version | How It's Used |
|------------|---------|---------------|
| **Node.js** | 20.x | Lambda runtime - all API handlers run on Node.js 20 |
| **TypeScript** | 5.3.3 | Type-safe Lambda functions; compiled to JS before deployment |
| **@aws-sdk/client-dynamodb** | 3.450.0 | Low-level DynamoDB operations |
| **@aws-sdk/lib-dynamodb** | 3.450.0 | Document Client for simplified DynamoDB CRUD operations |
| **@aws-sdk/client-s3** | 3.450.0 | Generates presigned URLs for secure image uploads |
| **@aws-sdk/s3-request-presigner** | 3.450.0 | Creates time-limited signed URLs for S3 |
| **@aws-sdk/client-cognito-identity-provider** | 3.982.0 | Admin operations on Cognito users |
| **aws-jwt-verify** | 5.1.1 | Validates Cognito JWT tokens inside the `api` Lambda (`lib/authenticate.ts`, called by `lib/router.ts` `dispatch()`) |
| **uuid** | 9.0.1 | Generates unique IDs for players, matches, championships, etc. |
| **ts-node** | 10.9.2 | Runs TypeScript scripts directly (`seed-data.ts`, `clear-data.ts`) |
| **Serverless Framework** | 3.38.0 | Deploys all infrastructure defined in `serverless.yml` |
| **serverless-plugin-typescript** | 2.1.5 | Auto-compiles TypeScript during serverless deploy |
| **serverless-offline** | 13.3.0 | Local API Gateway + Lambda emulation for development |

### AWS Infrastructure

| Service | How It's Used |
|---------|---------------|
| **AWS Lambda** | One `api` function (`functions/api/handler.ts`) serves every HTTP route; handler code is organized by feature under `functions/` (`players/`, `matches/`, `championships/`, ...). The other functions are not HTTP: `contenders` and `progression` (async-invoke targets), `postConfirmation` and `preSignUp` (Cognito triggers), and the scheduled jobs `expireChallenges`, `expireContractOffers`, `weeklyJobs`, `recalculateContenders` |
| **API Gateway** | REST API with a single root `ANY /{proxy+}` route (plus its CORS `OPTIONS`) to the `api` Lambda, which routes in code (`functions/api/routes.ts`); no gateway authorizer, every route authenticates inside the Lambda; 4 GatewayResponses add CORS to gateway-generated errors |
| **DynamoDB** | NoSQL database with 50 tables defined in `backend/serverless.yml`, including Players, Matches (with TournamentIndex GSI), Championships, ChampionshipHistory, Tournaments, Seasons, SeasonStandings (with PlayerIndex GSI), Divisions - all use on-demand (PAY_PER_REQUEST) billing |
| **Amazon S3** | Two purposes: (1) hosts frontend static files, (2) stores player/championship images with public read access and presigned URL uploads |
| **CloudFront** | CDN in front of S3; custom error responses redirect 403/404 to /index.html for SPA routing; HTTPS enforced |
| **AWS Cognito** | User Pool for authentication - email-based sign-in (`UsernameAttributes: email`), 24hr access tokens, 30-day refresh tokens |
| **ACM** | SSL/TLS certificates for CloudFront HTTPS |

### CI/CD & DevOps

| Technology | How It's Used |
|------------|---------------|
| **GitHub Actions** | Two workflows automate deployment; both call `ci-checks.yml` first |
| **ci-checks.yml** | Reusable workflow - backend lint, typecheck and tests, embedded API docs check, gitleaks secret scan. A failure blocks the deploy |
| **deploy-dev.yml** | Triggered on PRs to main - builds frontend with `.env.devtest`, deploys backend to `devtest` stage, syncs to dev S3 bucket |
| **deploy-prod.yml** | Manually triggered (`workflow_dispatch`), deploys from `main` only - builds frontend with `.env.production`, deploys backend to `dev` stage (production), syncs to prod S3 bucket, invalidates CloudFront cache |
| **Docker** | Runs DynamoDB Local (`amazon/dynamodb-local`) for offline development |

### Local Development Stack
- **DynamoDB Local**: Docker container on port 8000 for local database
- **serverless-offline**: API Gateway + Lambda emulation on port 3001
- **Vite dev server**: Frontend on port 3000 with HMR

## Project Structure

```
wwe-2k-league/
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   │   ├── Standings.tsx    # Public: View standings
│   │   │   ├── Championships.tsx # Public: View championships
│   │   │   ├── Matches.tsx      # Public: View matches
│   │   │   ├── Tournaments.tsx  # Public: View tournaments
│   │   │   └── admin/           # Admin-only components
│   │   │       ├── AdminPanel.tsx
│   │   │       ├── AdminLogin.tsx
│   │   │       ├── ManagePlayers.tsx
│   │   │       ├── ScheduleMatch.tsx
│   │   │       ├── RecordResult.tsx
│   │   │       ├── ManageChampionships.tsx
│   │   │       ├── CreateTournament.tsx
│   │   │       └── ManageSeasons.tsx    # Season management
│   │   ├── services/
│   │   │   └── api.ts           # API client with all endpoints
│   │   └── types/
│   │       └── index.ts         # TypeScript interfaces
│   └── package.json
├── backend/
│   ├── functions/               # Lambda functions
│   │   ├── auth/                # Authentication & JWT authorization
│   │   ├── players/             # GET, POST, PUT, DELETE players
│   │   ├── matches/             # GET, POST matches, PUT results
│   │   ├── championships/       # GET, POST, PUT, DELETE championships, GET history
│   │   ├── tournaments/         # GET, POST, PUT tournaments
│   │   ├── standings/           # GET standings (supports ?seasonId=)
│   │   ├── seasons/             # GET, POST, PUT, DELETE seasons
│   │   ├── divisions/           # GET, POST, PUT, DELETE divisions
│   │   └── images/              # POST generate presigned upload URLs
│   ├── lib/
│   │   ├── dynamodb.ts         # DynamoDB helper functions
│   │   └── response.ts         # HTTP response helpers
│   ├── scripts/
│   │   ├── seed-data.ts        # Populate test data
│   │   └── clear-data.ts       # Clear all data
│   └── serverless.yml          # Infrastructure as code
└── README.md
```

## Help and Wiki

- **Help** is the wiki: nav "Help" goes to `/guide`, which redirects to `/guide/wiki` (wiki index). All help content lives in the wiki.
- **Wiki** is at `/guide/wiki` (index) and `/guide/wiki/:slug` (article). Components: `Wiki.tsx` (layout), `WikiIndex.tsx`, `WikiArticle.tsx`, `WikiBreadcrumbs.tsx`.
- **Wiki content** lives in the repo as static files; there is no admin UI for editing. All editing is done by changing files and redeploying.
  - **Location**: `frontend/public/wiki/`
  - **Index**: `frontend/public/wiki/index.json` — JSON array of `{ "slug": string, "titleKey": string, "file": string }`. The app fetches this to build the wiki index page.
  - **Articles**: Markdown files in `frontend/public/wiki/*.md` (e.g. `getting-started.md`, `faqs.md`). Each article is loaded at runtime by slug and current locale: German from `frontend/public/wiki/de/*.md` (when language is de), English from `frontend/public/wiki/*.md`. If a German file is missing, the app falls back to the English file.
- **To add a wiki article**: (1) Add a new `.md` file under `frontend/public/wiki/` (English). (2) For German, add the same slug under `frontend/public/wiki/de/` (e.g. `wiki/de/my-topic.md`). (3) Append an entry to `frontend/public/wiki/index.json` with `slug`, `titleKey` (e.g. `wiki.articles.myTopic`), and `file` (e.g. `my-topic.md`). (4) Add the `titleKey` translation in `frontend/src/i18n/locales/en.json` and `frontend/src/i18n/locales/de.json` under `wiki.articles`.
- **"Edit this page" link**: On article view, an "Edit this page" link points to the GitHub edit URL for that article’s markdown file. It is shown only when `VITE_GITHUB_REPO` is set (e.g. `jpDxsoloOrg/league_szn`). Optional `VITE_GITHUB_BRANCH` (default `main`) sets the branch in the edit URL. Add these to `.env` or deployment env so the link works in your environment.

### Patch notes

Versioned release notes at `/patch-notes` (latest) and `/patch-notes/vX.Y.Z`. Static files in `frontend/public/patch-notes/`, loaded like the wiki (German from `de/`, falling back to English). Full guide: `frontend/public/patch-notes/README.md`.

- **Versions**: semver. A feature release bumps MINOR (`1.1.0` -> `1.2.0`); a fixes-only release bumps PATCH (`1.2.0` -> `1.2.1`). Helpers in `frontend/src/components/patchNotes/versions.ts`.
- **To publish a release**: (1) add `vX.Y.Z.md` and `de/vX.Y.Z.md`; (2) end each section with a `**Read more:**` line linking the wiki articles for that feature (`/guide/wiki/<slug>`, same paths in DE with German titles); (3) prepend the entry to `releases` in `index.json` with `version`, `date`, `title`, `summary`, `titleDe`, `summaryDe`, `file`; (4) bump `version` in `frontend/package.json` (and `package-lock.json`) to match; (5) update `next-features.md` and `de/next-features.md`, without links to wiki articles that don't exist yet.
- **Copy**: never mention sprints, dates or timeframes.
- **Screenshots**: `![alt](/patch-notes/images/vX.Y.Z/name.webp)` renders as a small thumbnail that opens in a lightbox; consecutive images form a gallery row, and the lightbox steps through a section's images. Store them in `frontend/public/patch-notes/images/vX.Y.Z/` as WebP (or optimized PNG) under 200 KB, cropped to the feature, with no personal data (PSN IDs, emails, notifications). Use the same paths in the DE post with German alt text. 1-3 per section, before the `**Read more:**` line.
- `patchNotesContent.test.ts` enforces valid, unique, newest-first versions, existing files, `package.json` matching the latest release, wiki links that resolve, and screenshots that exist, sit in `images/vX.Y.Z/` and stay under 200 KB.

## Data Model

### Players Table
- **PK**: `playerId`
- Attributes: name, currentWrestler, wins, losses, draws, imageUrl, divisionId, createdAt, updatedAt

### Matches Table
- **PK**: `matchId`
- **SK**: `date`
- Attributes: matchType, stipulation, participants[], winners[], losers[], isChampionship, championshipId, tournamentId, seasonId, status
- **GSI**: TournamentIndex (tournamentId, matchId)

### Championships Table
- **PK**: `championshipId`
- Attributes: name, type (singles/tag), currentChampion, imageUrl, createdAt, isActive

### Championship History Table
- **PK**: `championshipId`
- **SK**: `wonDate`
- Attributes: champion, lostDate, matchId, daysHeld

### Tournaments Table
- **PK**: `tournamentId`
- Attributes: name, type (single-elimination/round-robin), status, participants[], brackets, standings, winner, createdAt

### Seasons Table
- **PK**: `seasonId`
- Attributes: name, startDate, endDate, status (active/completed), createdAt, updatedAt
- Only one season can be active at a time

### Season Standings Table
- **PK**: `seasonId`
- **SK**: `playerId`
- Attributes: wins, losses, draws, updatedAt
- **GSI**: PlayerIndex (playerId, seasonId) - For querying all seasons a player participated in

### Episodes Table
- **PK**: `episodeId`
- Attributes: source (`'youtube'`), youtubeVideoId (11-char id; watch, embed and thumbnail URLs are built from it, never stored as given), title, description (plain text), thumbnailUrl (`i.ytimg.com/vi/<id>/hqdefault.jpg`), channelName, airDate (`YYYY-MM-DD`), eventId (optional), isPublished (`'true'`/`'false'` string), createdBy, createdAt, updatedAt
- **GSI**: PublishedIndex (isPublished, airDate); EventIndex (eventId), sparse
- New episodes are drafts. `eventId` lives only on the episode; `LeagueEvent` has no episode field, and deleting an event does not cascade
- Title and channel come from YouTube oEmbed, fetched server-side only by `POST /admin/episodes/youtube-lookup` (`lib/youtube.ts`)

### Videos (Highlights) Table
- Highlight clips stay in Videos. Optional `episodeId` links a clip to one episode; only staff can set it (Manage Highlights). Sending `null` or `''` removes it. Deleting an episode unlinks its clips and never deletes them
- `isPublished` is stored as the string `'true'`/`'false'`; the API only accepts a boolean, and the frontend normalises it to a boolean in `videos.api.ts`

### Live stream (SiteConfig)
- No table: stored in SiteConfig like the ticker settings (`SiteConfigRepository.getLiveStream()` / `setLiveStream()`)
- Shape: channel (Twitch login, `^[A-Za-z0-9_]{4,25}$`, lowercase), isLive, title (optional, max 120), liveSince, updatedBy, updatedAt
- The read path reports `isLive: false` once `liveSince` is more than `LIVE_STREAM_MAX_HOURS` (8) old; nothing is written

## Key Features

### Public Features (No Auth Required)
1. **Standings** - View all players ranked by wins (all-time or per-season)
2. **Championships** - View all titles with current champions and full history
3. **Matches** - View scheduled and completed matches with filters
4. **Tournaments** - View tournament brackets and round-robin standings

### Admin Features (Requires Login)
Sign in with your own Admin account. Credentials are not stored in this repo; E2E tests read `E2E_ADMIN_USERNAME` and `E2E_ADMIN_PASSWORD` from the environment.

1. **Manage Players** - Add new players, edit wrestlers, upload images, delete players
2. **Schedule Match** - Create matches with participants, stipulations, championships (assign to season)
3. **Record Results** - Select winners from scheduled matches
4. **Manage Championships** - Create new championships (singles/tag team), upload images, delete championships
5. **Create Tournament** - Single elimination or round-robin with automatic bracket/standings generation
6. **Manage Seasons** - Create new seasons, end active seasons, view historical season standings, delete seasons
7. **Manage Divisions** - Create divisions, assign players to divisions, delete divisions
8. **Image Management** - Upload wrestler and championship images via presigned S3 URLs

## Important Implementation Details

### Match Result Recording
When a match result is recorded (`recordResult.ts`):
1. Updates match status to 'completed'
2. Updates player win/loss/draw records (all-time standings)
3. If match has seasonId: updates season-specific standings in SeasonStandings table
4. If championship match: updates current champion and creates history entry
5. If tournament match: updates tournament brackets/standings

Steps 1-3 commit in one transaction (`runInTransaction`). Championship and tournament updates are not part of it: they run afterwards as separate writes.

### Tournament Types
1. **Single Elimination**: Bracket-style, requires power of 2 participants (or gives byes)
2. **Round Robin**: Everyone faces everyone, 2pts for win, 1pt for draw (G1 Climax style)

### Authentication & Authorization
- Uses AWS Cognito User Pool for authentication
- Email-based sign-in (`UsernameAttributes: email`)
- JWT tokens with 24-hour validity, 30-day refresh tokens
- There is no API Gateway authorizer. Every route is authorized inside the `api` Lambda by the router: `lib/router.ts` `dispatch()` reads the route's `access` (`'public'`, GET only; `'self-service'`; or `{ roles }`), verifies the Cognito access token with `lib/authenticate.ts` (aws-jwt-verify), rejects deactivated callers with a 401, then checks roles
- The only unauthenticated write is `POST /auth/setup`, dispatched before the router from the `PRE_ROUTER_UNAUTHENTICATED_WRITES` allowlist in `functions/api/handler.ts`; `createAdminUser` checks the setup key itself
- Offline, `functions/api/handler.ts` drops serverless-offline's fake principal so `authenticate()` installs an Admin context

### Adding an endpoint
- Add an entry to the domain's `routes` table (`functions/<domain>/handler.ts`), with `resource`, `method`, `handler` and `access`. Tables are merged into `functions/api/routes.ts`; a new domain table is imported there. A new public route also needs a reviewed entry in `PUBLIC_ROUTES` (`functions/__tests__/routeAccess.test.ts`)
- No `serverless.yml` change: a new endpoint adds no Lambda, API Gateway or CloudFormation resource. Only `api` may have `http` events (`lib/__tests__/serverlessConfig.test.ts` enforces it)
- `functions/api/__tests__/routes.test.ts` checks every route is reachable and matches API Gateway's precedence (a literal segment beats a `{param}`)

### Standings and dashboard data sources (no mock data)
- **Standings "Last 5" (form)**: The form column comes from the standings API response (`recentForm` and `currentStreak`). The backend (`functions/standings/getStandings.ts`) computes these from the last 5 completed matches per player (DynamoDB Matches with `status = 'completed'`). The frontend displays only what the API returns; there is no client-side mock or fallback data.
- **Dashboard "Recent Results"**: The matches listed on the dashboard come from the dashboard API response (`recentResults`). The backend (`functions/dashboard/getDashboard.ts`) builds this from DynamoDB Matches (completed only, sorted by date descending, latest 5). The frontend renders only `data.recentResults`; there is no hardcoded or mock match list.

## Local Development

### Start DynamoDB Local
```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

### Start Backend
```bash
cd backend
npm install
npm run offline  # Starts at http://localhost:3001/dev
```

### Seed Test Data
```bash
cd backend
npm run seed      # Creates 12 players, 4 championships, 12 matches, 2 tournaments, 3 divisions, 1 season
npm run clear-data  # Clears all data
```

### Start Frontend
```bash
cd frontend
npm install
npm run dev  # Starts at http://localhost:3000
```

## API Endpoints

### Public (No Auth)
- `GET /players` - All players with standings
- `GET /matches` - All matches (filterable by status)
- `GET /championships` - All championships
- `GET /championships/{id}/history` - Championship history
- `GET /tournaments` - All tournaments
- `GET /standings` - Current standings (optional `?seasonId=` for season-specific)
- `GET /seasons` - All seasons
- `GET /divisions` - All divisions
- `GET /episodes` - Published episodes, newest air date first (optional `?eventId=`)
- `GET /episodes/{episodeId}` - One episode plus its published highlights (`{ episode, highlights }`); drafts 404 unless the caller is staff
- `GET /live-stream` - Twitch live card state (`channel`, `isLive` after the 8-hour guard, `title`, `liveSince`)

### Setup
- `POST /auth/setup` - Create admin user (one-time setup). Not JWT-protected; requires the deployment's `ADMIN_SETUP_KEY`

### Admin (Requires Auth)
All admin endpoints require a valid JWT token from Cognito in the `Authorization` header.

- `POST /players` - Create player
- `PUT /players/{id}` - Update player
- `DELETE /players/{id}` - Delete player (fails if holds championship)
- `POST /matches` - Schedule match (optional `seasonId` to assign to season)
- `PUT /matches/{id}/result` - Record match result
- `POST /championships` - Create championship
- `PUT /championships/{id}` - Update championship
- `DELETE /championships/{id}` - Delete championship (cascade delete history)
- `POST /tournaments` - Create tournament
- `PUT /tournaments/{id}` - Update tournament
- `POST /seasons` - Create season (only one active allowed)
- `PUT /seasons/{id}` - Update season (end season, change name/dates)
- `DELETE /seasons/{id}` - Delete season (cascade delete season standings)
- `POST /divisions` - Create division
- `PUT /divisions/{id}` - Update division
- `DELETE /divisions/{id}` - Delete division (fails if players assigned)
- `POST /images/upload-url` - Generate presigned URL for image upload

Episodes and live stream (Moderator or Admin):
- `GET /admin/episodes` - All episodes, drafts included
- `POST /admin/episodes/youtube-lookup` - Parse a YouTube link and fetch oEmbed title/channel; returns `oembedAvailable` and `existingEpisodeId` for duplicates
- `POST /admin/episodes` - Create episode (draft by default; duplicate YouTube ids rejected)
- `PUT /admin/episodes/{episodeId}` - Update episode (`eventId: null` unlinks the event)
- `DELETE /admin/episodes/{episodeId}` - Delete episode (unlinks its highlights first)
- `PUT /admin/live-stream` - Set channel/title and go live or end the stream (live needs a channel)

## Common Tasks

### Adding a New Player
```typescript
await playersApi.create({
  name: "John Doe",
  currentWrestler: "Stone Cold Steve Austin",
  wins: 0,
  losses: 0,
  draws: 0
});
```

### Scheduling a Match
```typescript
await matchesApi.schedule({
  date: new Date().toISOString(),
  matchType: "singles",
  stipulation: "Ladder Match",
  participants: [playerId1, playerId2],
  isChampionship: false,
  status: "scheduled"
});
```

### Recording a Match Result
```typescript
await matchesApi.recordResult(matchId, {
  winners: [playerId1],
  losers: [playerId2]
});
```

### Creating a Season
```typescript
await seasonsApi.create({
  name: "Season 1",
  startDate: new Date().toISOString()
});
```

### Ending a Season
```typescript
await seasonsApi.update(seasonId, {
  status: "completed"
});
```

### Getting Season-Specific Standings
```typescript
// All-time standings
await standingsApi.get();

// Season-specific standings
await standingsApi.get(seasonId);
```

## Deployment

### AWS Configuration

**AWS CLI Profile**: `league-szn`
- Region: `us-east-1`
- Account ID: `435238036810`

Credentials are never stored in this repo. Ask the account owner for your own access key, then set up the profile locally:
```bash
aws configure --profile league-szn
```

---

### Environment Overview

| Environment | Frontend URL | Backend API | S3 Bucket | Serverless Stage |
|-------------|--------------|-------------|-----------|------------------|
| **Prod** | https://leagueszn.jpdxsolo.com | https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev | `leagueszn.jpdxsolo.com` | `dev` (default) |
| **Dev** | https://dev.leagueszn.jpdxsolo.com | https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest | `dev.leagueszn.jpdxsolo.com` | `devtest` |

**Note**: Prod uses serverless stage `dev` for historical reasons (to preserve existing table names). Dev uses stage `devtest`.

---

This deploys:
- The `api` Lambda (all HTTP routes) plus the async, Cognito-trigger and scheduled functions
- API Gateway (one `/{proxy+}` route)
- DynamoDB tables (Players, Matches, Championships, ChampionshipHistory, Tournaments, Seasons, SeasonStandings)
### Deploy to PROD

Production deploys run through GitHub Actions, not from a local machine. Run the **Deploy to Production** workflow from `main`, either in the Actions tab or with:

```bash
gh workflow run deploy-prod.yml --ref main
```

The workflow runs the checks, supplies the required secrets, and uploads the frontend with the right cache headers.

---

### Deploy to DEV

Deploy backend and frontend to dev/testing environment. Export `ADMIN_SETUP_KEY` and `DEV_ACM_CERTIFICATE_ARN` first. Do not add `--delete` to the frontend sync: old files in `assets/` must stay so open tabs can still load their chunks.

```bash
# Backend only
cd backend && npx serverless deploy --stage devtest --aws-profile league-szn

# Frontend only (uses .env.devtest)
cd frontend && npm run build -- --mode devtest && aws s3 sync dist s3://dev.leagueszn.jpdxsolo.com --profile league-szn

# Full deployment (both)
cd backend && npx serverless deploy --stage devtest --aws-profile league-szn && cd ../frontend && npm run build -- --mode devtest && aws s3 sync dist s3://dev.leagueszn.jpdxsolo.com --profile league-szn
```

---

### DNS Configuration (Namecheap)

Domain `jpdxsolo.com` DNS is managed in Namecheap.

CNAME records for subdomains should point to CloudFront distributions (not S3 website endpoints):
| Type | Host | Value |
|------|------|-------|
| CNAME | leagueszn | `<CloudFront-Distribution-Domain>.cloudfront.net` |
| CNAME | dev.leagueszn | `<CloudFront-Distribution-Domain>.cloudfront.net` |

**To get the CloudFront domain names:**
```bash
# For production (dev stage)
aws cloudformation describe-stacks --stack-name wwe-2k-league-api-dev \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
  --output text --profile league-szn

# For dev (devtest stage)
aws cloudformation describe-stacks --stack-name wwe-2k-league-api-devtest \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
  --output text --profile league-szn
```

## Known Limitations / TODO

1. ~~**Authentication**: AWS Cognito integration.~~ **DONE** - Full Cognito integration with JWT tokens
2. ~~**Lambda Authorizer**: Admin endpoints protected.~~ **DONE** - The `api` Lambda's router validates JWT tokens in code (INFRA-207 retired the gateway authorizer)
3. **Tag Team Matches**: Frontend doesn't have special handling for tag teams yet.
4. **Tournament Progression**: Single-elimination bracket progression needs manual updates.
5. **Match Statistics**: Not yet tracking which player is best at which match type.
6. ~~**Image Uploads**: No profile pictures or championship images.~~ **DONE** - Images supported for wrestlers and championships
7. **Real-time Updates**: No WebSocket support for live updates.
8. ~~**Seasons Support**: Track standings per season, season resets.~~ **DONE** - Full season management implemented
9. **Advanced Search**: No filtering/search beyond basic status filters.

### Heat tunables (RIV-21)

The rivalry heat formula lives in `backend/lib/policies/rivalryHeat.ts`.
Pivot (`HEAT_PIVOT`), weight cap (`HEAT_MAX_WEIGHT`), score cap
(`HEAT_SCORE_CAP`), tier thresholds (`HEAT_TIER_THRESHOLDS`), and the
admin-override centres (`HEAT_TIER_CENTRES`) are all exported
constants — tune them there without touching handlers. The seed in
`backend/functions/admin/seedData.ts` reads `HEAT_TIER_CENTRES` so
seeded rivalries stay aligned with whatever bucket boundaries are
configured.

## Troubleshooting

### Frontend can't connect to backend
- Check `.env` file has correct `VITE_API_BASE_URL` (should be `http://localhost:3001/dev` for local)
- Ensure backend is running on port 3001 (`npm run offline`)
- Frontend runs on port 3000
- Check for CORS errors in browser console

### DynamoDB errors
- Make sure DynamoDB Local is running on port 8000
- Tables are auto-created by serverless-offline
- Use `npm run clear-data` to reset if tables are corrupted

### Match results not updating
- Check that match status is 'scheduled' before recording
- Verify all participant IDs exist in players table
- Check browser console for API errors

## Repository Pattern (Database Interface Layer)

**New handlers** import from `backend/lib/repositories`, never from `backend/lib/dynamodb` directly. Use `getRepositories()` to access typed repository instances (e.g., `players`, `matches`, `championships`). Pure-CRUD handlers use the factories in `backend/lib/handlers.ts` (`createHandlerFactory`, `getHandlerFactory`, `listHandlerFactory`, `updateHandlerFactory`, `deleteHandlerFactory`).

**For atomic multi-aggregate writes**, use `runInTransaction(async (tx) => { ... })`. The `tx` object provides typed mutation methods (`tx.updateMatch`, `tx.incrementPlayerRecord`, `tx.updateChampionship`, etc.). DynamoDB implementation stages `TransactWriteItems` and flushes in ≤100-item chunks. See `backend/lib/repositories/unitOfWork.ts` for the full interface.

**For tests**, mock `getRepositories` instead of `@aws-sdk/lib-dynamodb`. Example:
```typescript
vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    players: mockPlayersRepo,
    matches: mockMatchesRepo,
    // ...
  }),
}));
```

**Migration status**: Handlers under `backend/functions/` no longer import `backend/lib/dynamodb` directly. New code should keep using the repository pattern.

## Code Style

- Use TypeScript for all new code
- **No `any` in TypeScript.** Use specific types, generics, or `unknown` instead of `any`. If a type is truly unknowable, use `unknown` and narrow it.
- Functional components with hooks (no class components)
- CSS modules or separate CSS files (no inline styles)
- Async/await over promises (no .then chains)
- Descriptive variable names (no single letters except loops)
- When making a plan always give the file a unique name that is not already in use.

## Git Workflow

- `main` - Production-ready code
- `feat/*` - New features
- `fix/*` - Bug fixes
- Before every `git push`, run TypeScript validation and fix all errors:
  - Frontend: `cd frontend && npx tsc --project tsconfig.app.json --noEmit`
  - Backend: `cd backend && npx tsc --project tsconfig.json --noEmit`

**Commands:** **newIssue** (create issue + plan, branch, commit, push, PR); **doIssue &lt;number&gt;** (fetch issue, create branch + plan, execute plan with parallel agents, commit, push, PR); **execute-plan** (run a plan file with parallel agents, then verify and commit/push). See `.claude/commands/` and `docs/plans/README.md`.

Current active branches:
- `feat/admin_front_end` - Admin panel implementation

## Contact / Repository

- GitHub: https://github.com/jpDxsoloOrg/league_szn
- Owner: jpDxsolo
