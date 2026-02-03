# WWE 2K League - Project Documentation for Claude

## Project Overview
A serverless web application for managing a WWE 2K league with player standings, championships, matches, and tournaments.

## Tech Stack
- **Frontend**: React 18 + TypeScript, Vite, React Router
- **Backend**: AWS Lambda (Node.js 18), API Gateway, DynamoDB
- **Infrastructure**: Serverless Framework
- **Local Development**: serverless-offline, DynamoDB Local (Docker)

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
│   │   ├── players/             # GET, POST, PUT players
│   │   ├── matches/             # GET, POST matches, PUT results
│   │   ├── championships/       # GET, POST championships, GET history
│   │   ├── tournaments/         # GET, POST, PUT tournaments
│   │   ├── standings/           # GET standings (supports ?seasonId=)
│   │   └── seasons/             # GET, POST, PUT seasons
│   ├── lib/
│   │   ├── dynamodb.ts         # DynamoDB helper functions
│   │   └── response.ts         # HTTP response helpers
│   ├── scripts/
│   │   ├── seed-data.ts        # Populate test data
│   │   └── clear-data.ts       # Clear all data
│   └── serverless.yml          # Infrastructure as code
└── README.md
```

## Data Model

### Players Table
- **PK**: `playerId`
- Attributes: name, currentWrestler, wins, losses, draws, createdAt, updatedAt

### Matches Table
- **PK**: `matchId`
- **SK**: `date`
- Attributes: matchType, stipulation, participants[], winners[], losers[], isChampionship, championshipId, tournamentId, seasonId, status
- **GSI**: TournamentIndex (tournamentId, matchId)

### Championships Table
- **PK**: `championshipId`
- Attributes: name, type (singles/tag), currentChampion, createdAt, isActive

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

1. **Manage Players** - Add new players, edit wrestlers
2. **Schedule Match** - Create matches with participants, stipulations, championships (assign to season)
3. **Record Results** - Select winners from scheduled matches
4. **Manage Championships** - Create new championships (singles/tag team)
5. **Create Tournament** - Single elimination or round-robin with automatic bracket/standings generation
6. **Manage Seasons** - Create new seasons, end active seasons, view historical season standings

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

### Authentication
- Currently uses simple session storage with dummy token
- **TODO**: Integrate AWS Cognito for real authentication
- Admin endpoints should be protected with Lambda authorizer (not yet implemented)

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
npm run seed      # Creates 6 players, 3 championships, 4 matches, 2 tournaments
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

### Admin (Requires Auth)
- `POST /players` - Create player
- `PUT /players/{id}` - Update player
- `POST /matches` - Schedule match (optional `seasonId` to assign to season)
- `PUT /matches/{id}/result` - Record match result
- `POST /championships` - Create championship
- `POST /tournaments` - Create tournament
- `PUT /tournaments/{id}` - Update tournament
- `POST /seasons` - Create season (only one active allowed)
- `PUT /seasons/{id}` - Update season (end season, change name/dates)

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

Credentials should be configured locally using `aws configure --profile league-szn`.

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

CNAME records for subdomains:
| Type | Host | Value |
|------|------|-------|
| CNAME | leagueszn | leagueszn.jpdxsolo.com.s3-website-us-east-1.amazonaws.com |
| CNAME | dev.leagueszn | dev.leagueszn.jpdxsolo.com.s3-website-us-east-1.amazonaws.com |

## Known Limitations / TODO

1. **Authentication**: Currently using dummy tokens. Need AWS Cognito integration.
2. **Lambda Authorizer**: Admin endpoints not yet protected.
3. **Tag Team Matches**: Frontend doesn't have special handling for tag teams yet.
4. **Tournament Progression**: Single-elimination bracket progression needs manual updates.
5. **Match Statistics**: Not yet tracking which player is best at which match type.
6. ~~**Image Uploads**: No profile pictures or championship images.~~ **DONE** - Images supported for wrestlers and championships
7. **Real-time Updates**: No WebSocket support for live updates.
8. ~~**Seasons Support**: Track standings per season, season resets.~~ **DONE** - Full season management implemented

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
- Functional components with hooks (no class components)
- CSS modules or separate CSS files (no inline styles)
- Async/await over promises (no .then chains)
- Descriptive variable names (no single letters except loops)

## Git Workflow

- `main` - Production-ready code
- `feat/*` - New features
- `fix/*` - Bug fixes

Current active branches:
- `feat/admin_front_end` - Admin panel implementation

## Contact / Repository

- GitHub: https://github.com/jpDxsolo/league_szn
- Owner: jpDxsolo
