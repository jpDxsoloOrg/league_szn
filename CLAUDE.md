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
| **aws-jwt-verify** | 5.1.1 | Validates Cognito JWT tokens in Lambda authorizer (`functions/auth/authorizer.ts`) |
| **uuid** | 9.0.1 | Generates unique IDs for players, matches, championships, etc. |
| **ts-node** | 10.9.2 | Runs TypeScript scripts directly (`seed-data.ts`, `clear-data.ts`) |
| **Serverless Framework** | 3.38.0 | Deploys all infrastructure defined in `serverless.yml` |
| **serverless-plugin-typescript** | 2.1.5 | Auto-compiles TypeScript during serverless deploy |
| **serverless-offline** | 13.3.0 | Local API Gateway + Lambda emulation for development |

### AWS Infrastructure

| Service | How It's Used |
|---------|---------------|
| **AWS Lambda** | Serverless functions for all API endpoints - organized by feature: `auth/`, `players/`, `matches/`, `championships/`, `tournaments/`, `standings/`, `seasons/`, `divisions/`, `images/`, `admin/` |
| **API Gateway** | REST API exposing Lambda functions via HTTP; CORS configured for browser access; custom authorizer validates JWT tokens for admin routes |
| **DynamoDB** | NoSQL database with 8 tables: Players, Matches (with TournamentIndex GSI), Championships, ChampionshipHistory, Tournaments, Seasons, SeasonStandings (with PlayerIndex GSI), Divisions - all use on-demand (PAY_PER_REQUEST) billing |
| **Amazon S3** | Two purposes: (1) hosts frontend static files, (2) stores player/championship images with public read access and presigned URL uploads |
| **CloudFront** | CDN in front of S3; custom error responses redirect 403/404 to /index.html for SPA routing; HTTPS enforced |
| **AWS Cognito** | User Pool for admin authentication - username-based login (not email), 24hr access tokens, 30-day refresh tokens |
| **ACM** | SSL/TLS certificates for CloudFront HTTPS |

### CI/CD & DevOps

| Technology | How It's Used |
|------------|---------------|
| **GitHub Actions** | Two workflows automate deployment |
| **deploy-dev.yml** | Triggered on PRs to main - builds frontend with `.env.devtest`, deploys backend to `devtest` stage, syncs to dev S3 bucket |
| **deploy-prod.yml** | Triggered on merged PRs - builds frontend with `.env.production`, deploys backend to `dev` stage (production), syncs to prod S3 bucket, invalidates CloudFront cache |
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

## Key Features

### Public Features (No Auth Required)
1. **Standings** - View all players ranked by wins (all-time or per-season)
2. **Championships** - View all titles with current champions and full history
3. **Matches** - View scheduled and completed matches with filters
4. **Tournaments** - View tournament brackets and round-robin standings

### Admin Features (Requires Login)
Credentials: **admin / FireGreen48!**

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
6. All updates are transactional

### Tournament Types
1. **Single Elimination**: Bracket-style, requires power of 2 participants (or gives byes)
2. **Round Robin**: Everyone faces everyone, 2pts for win, 1pt for draw (G1 Climax style)

### Authentication & Authorization
- Uses AWS Cognito User Pool for admin authentication
- Username-based login (not email)
- JWT tokens with 24-hour validity, 30-day refresh tokens
- Lambda authorizer (`functions/auth/authorizer.ts`) validates tokens using aws-jwt-verify
- All admin endpoints protected with custom authorizer in API Gateway

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

### Admin (Requires Auth)
All admin endpoints require a valid JWT token from Cognito in the `Authorization` header.

- `POST /auth/setup` - Create admin user (one-time setup)
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
- Access Key ID: `AKIAWKVRVMVFLQSXGRHD`
- Secret Access Key: `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`
- Region: `us-east-1`
- Account ID: `435238036810`

To configure (if not already set up):
```bash
aws configure set aws_access_key_id AKIAWKVRVMVFLQSXGRHD --profile league-szn
aws configure set aws_secret_access_key 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 --profile league-szn
aws configure set region us-east-1 --profile league-szn
```

---

### Environment Overview

| Environment | Frontend URL | Backend API | S3 Bucket | Serverless Stage |
|-------------|--------------|-------------|-----------|------------------|
| **Prod** | http://leagueszn.jpdxsolo.com | https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev | `leagueszn.jpdxsolo.com` | `dev` (default) |
| **Dev** | http://dev.leagueszn.jpdxsolo.com | https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest | `dev.leagueszn.jpdxsolo.com` | `devtest` |

**Note**: Prod uses serverless stage `dev` for historical reasons (to preserve existing table names). Dev uses stage `devtest`.

---

This deploys:
- Lambda functions for all API endpoints
- API Gateway
- DynamoDB tables (Players, Matches, Championships, ChampionshipHistory, Tournaments, Seasons, SeasonStandings)
### Deploy to PROD

Deploy backend and frontend to production:

```bash
# Backend only
cd backend && npx serverless deploy --aws-profile league-szn

# Frontend only
cd frontend && npm run build && aws s3 sync dist s3://leagueszn.jpdxsolo.com --profile league-szn --delete

# Full deployment (both)
cd backend && npx serverless deploy --aws-profile league-szn && cd ../frontend && npm run build && aws s3 sync dist s3://leagueszn.jpdxsolo.com --profile league-szn --delete
```

---

### Deploy to DEV

Deploy backend and frontend to dev/testing environment:

```bash
# Backend only
cd backend && npx serverless deploy --stage devtest --aws-profile league-szn

# Frontend only (uses .env.devtest)
cd frontend && npm run build -- --mode devtest && aws s3 sync dist s3://dev.leagueszn.jpdxsolo.com --profile league-szn --delete

# Full deployment (both)
cd backend && npx serverless deploy --stage devtest --aws-profile league-szn && cd ../frontend && npm run build -- --mode devtest && aws s3 sync dist s3://dev.leagueszn.jpdxsolo.com --profile league-szn --delete
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
2. ~~**Lambda Authorizer**: Admin endpoints protected.~~ **DONE** - Custom authorizer validates JWT tokens
3. **Tag Team Matches**: Frontend doesn't have special handling for tag teams yet.
4. **Tournament Progression**: Single-elimination bracket progression needs manual updates.
5. **Match Statistics**: Not yet tracking which player is best at which match type.
6. ~~**Image Uploads**: No profile pictures or championship images.~~ **DONE** - Images supported for wrestlers and championships
7. **Real-time Updates**: No WebSocket support for live updates.
8. ~~**Seasons Support**: Track standings per season, season resets.~~ **DONE** - Full season management implemented
9. **Advanced Search**: No filtering/search beyond basic status filters.

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

**Commands:** **newIssue** (create issue + plan, branch, commit, push, PR); **doIssue &lt;number&gt;** (fetch issue, create branch + plan, execute plan with parallel agents, commit, push, PR); **execute-plan** (run a plan file with parallel agents, then verify and commit/push). See `.claude/commands/` and `docs/plans/README.md`.

Current active branches:
- `feat/admin_front_end` - Admin panel implementation

## Contact / Repository

- GitHub: https://github.com/jpDxsolo/league_szn
- Owner: jpDxsolo
