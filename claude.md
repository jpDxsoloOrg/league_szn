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
│   │   │       └── CreateTournament.tsx
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
│   │   └── standings/           # GET standings
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
- Attributes: matchType, stipulation, participants[], winners[], losers[], isChampionship, championshipId, tournamentId, status
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

## Key Features

### Public Features (No Auth Required)
1. **Standings** - View all players ranked by wins
2. **Championships** - View all titles with current champions and full history
3. **Matches** - View scheduled and completed matches with filters
4. **Tournaments** - View tournament brackets and round-robin standings

### Admin Features (Requires Login)
Default credentials: **admin / admin**

1. **Manage Players** - Add new players, edit wrestlers
2. **Schedule Match** - Create matches with participants, stipulations, championships
3. **Record Results** - Select winners from scheduled matches
4. **Manage Championships** - Create new championships (singles/tag team)
5. **Create Tournament** - Single elimination or round-robin with automatic bracket/standings generation

## Important Implementation Details

### Match Result Recording
When a match result is recorded (`recordResult.ts`):
1. Updates match status to 'completed'
2. Updates player win/loss/draw records
3. If championship match: updates current champion and creates history entry
4. If tournament match: updates tournament brackets/standings
5. All updates are transactional

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
npm run offline  # Starts at http://localhost:3000/dev
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
npm run dev  # Starts at http://localhost:5173
```

## API Endpoints

### Public (No Auth)
- `GET /players` - All players with standings
- `GET /matches` - All matches (filterable by status)
- `GET /championships` - All championships
- `GET /championships/{id}/history` - Championship history
- `GET /tournaments` - All tournaments
- `GET /standings` - Current standings

### Admin (Requires Auth)
- `POST /players` - Create player
- `PUT /players/{id}` - Update player
- `POST /matches` - Schedule match
- `PUT /matches/{id}/result` - Record match result
- `POST /championships` - Create championship
- `POST /tournaments` - Create tournament
- `PUT /tournaments/{id}` - Update tournament

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

## Deployment

### Backend to AWS
```bash
cd backend
serverless deploy --stage prod
```

### Frontend to S3/CloudFront
```bash
cd frontend
npm run build
aws s3 sync dist/ s3://your-bucket-name
```

## Known Limitations / TODO

1. **Authentication**: Currently using dummy tokens. Need AWS Cognito integration.
2. **Lambda Authorizer**: Admin endpoints not yet protected.
3. **Tag Team Matches**: Frontend doesn't have special handling for tag teams yet.
4. **Tournament Progression**: Single-elimination bracket progression needs manual updates.
5. **Match Statistics**: Not yet tracking which player is best at which match type.
6. **Image Uploads**: No profile pictures or championship images.
7. **Real-time Updates**: No WebSocket support for live updates.

## Troubleshooting

### Frontend can't connect to backend
- Check `.env` file has correct `VITE_API_BASE_URL`
- Ensure backend is running on correct port (3000 for local)
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
