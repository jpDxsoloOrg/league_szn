# WWE 2K League Management System

A serverless web application for managing a WWE 2K league with player standings, championships, matches, and tournaments.

## Features

- **Public Access** (no login required):
  - View current standings (all-time or per-season)
  - Browse championships and their history
  - See scheduled and completed matches
  - Follow tournament brackets and standings

- **Admin Features** (requires authentication):
  - Manage players and their wrestlers
  - Schedule matches with various stipulations
  - Record match results
  - Create and manage championships
  - Create tournaments (single-elimination and round-robin)
  - **Manage seasons** (create seasons, track per-season standings, end seasons)

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- React Router for navigation

### Backend
- AWS Lambda (Node.js 18)
- API Gateway
- DynamoDB
- Serverless Framework

## Project Structure

```
wwe-2k-league/
├── frontend/          # React frontend application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API client
│   │   └── types/         # TypeScript types
│   └── package.json
├── backend/           # Serverless backend API
│   ├── functions/         # Lambda functions
│   │   ├── players/
│   │   ├── matches/
│   │   ├── championships/
│   │   ├── tournaments/
│   │   ├── standings/
│   │   └── seasons/       # Season management
│   ├── lib/              # Shared utilities
│   └── serverless.yml    # Infrastructure config
└── README.md
```

## Quick Start (Local Development)

Get the app running locally with sample data in 5 steps:

### 1. Start DynamoDB Local

Using Docker (recommended):
```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

Keep this terminal running.

### 2. Start Backend API

Open a new terminal:
```bash
cd backend
npm install
npm run offline
```

The API will start at http://localhost:3001/dev

Keep this terminal running.

### 3. Seed Sample Data

Open another terminal:
```bash
cd backend
npm run seed
```

This creates 6 players, 3 championships, 4 matches, and 2 tournaments.

### 4. Start Frontend

Open another terminal:
```bash
cd frontend
npm install
npm run dev
```

The frontend will start at http://localhost:3000

### 5. View the App

Open **http://localhost:3000** in your browser to see the fully populated league!

**Admin Panel**: Navigate to `/admin` and login with credentials: `admin` / `FireGreen48!`

**To clear data and start fresh:**
```bash
cd backend
npm run clear-data
```

---

## Live Environments

| Environment | Frontend | Backend API |
|-------------|----------|-------------|
| **Production** | http://leagueszn.jpdxsolo.com | https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev |
| **Dev** | http://dev.leagueszn.jpdxsolo.com | https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest |

## Deployment

### Prerequisites

- Node.js 18+
- AWS CLI configured with the `league-szn` profile

---

### Deploy to DEV

From the project root directory, run:

```bash
cd backend && npm install && cd ../frontend && npm install && npm run build -- --mode devtest && cd ../backend && npx serverless deploy --stage devtest --aws-profile league-szn && aws s3 sync ../frontend/dist s3://dev.leagueszn.jpdxsolo.com --profile league-szn --delete
```

**Dev URLs after deployment:**
- Frontend: http://dev.leagueszn.jpdxsolo.com
- API: https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest

---

### Deploy to PROD

From the project root directory, run:

```bash
cd backend && npm install && cd ../frontend && npm install && npm run build && cd ../backend && npx serverless deploy --aws-profile league-szn && aws s3 sync ../frontend/dist s3://leagueszn.jpdxsolo.com --profile league-szn --delete
```

**Prod URLs after deployment:**
- Frontend: http://leagueszn.jpdxsolo.com
- API: https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev

---

### Quick Reference

| Action | Dev | Prod |
|--------|-----|------|
| Build frontend | `npm run build -- --mode devtest` | `npm run build` |
| Deploy backend | `npx serverless deploy --stage devtest --aws-profile league-szn` | `npx serverless deploy --aws-profile league-szn` |
| Sync frontend | `aws s3 sync ../frontend/dist s3://dev.leagueszn.jpdxsolo.com --profile league-szn --delete` | `aws s3 sync ../frontend/dist s3://leagueszn.jpdxsolo.com --profile league-szn --delete` |

---

### Troubleshooting Deployments

**"Failed to load data" after deploying to dev:**

Some branches may be missing the `.env.devtest` file. Create it:
```bash
echo "VITE_API_BASE_URL=https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest" > frontend/.env.devtest
```
Then rebuild and sync:
```bash
cd frontend && npm run build -- --mode devtest && aws s3 sync dist s3://dev.leagueszn.jpdxsolo.com --profile league-szn --delete
```

**Verify the API is working:**
```bash
curl https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest/players
```

## Local Development & Testing

### Prerequisites for Local Testing

1. Install DynamoDB Local (for local testing):
```bash
# Option 1: Using Docker (recommended)
docker pull amazon/dynamodb-local

# Option 2: Download JAR file
# https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
```

2. Make sure you have Node.js installed (v18+):
```bash
node --version  # Should be 18 or higher
```

### Step-by-Step Local Setup

#### 1. Start DynamoDB Local

Using Docker:
```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

Or if you downloaded the JAR:
```bash
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb -port 8000
```

Keep this terminal running.

#### 2. Set Up Backend

Open a new terminal:

```bash
cd backend
npm install
```

Create a `.env` file in the backend directory:
```bash
# backend/.env
IS_OFFLINE=true
DYNAMODB_ENDPOINT=http://localhost:8000
```

Update `serverless.yml` to use local DynamoDB (already configured for offline use).

Start the backend:
```bash
npm run offline
```

The API will be available at **http://localhost:3001/dev**.

You should see output like:
```
Starting Offline at stage dev (us-east-1)

Offline [http for lambda] listening on http://localhost:3002
...
   GET    | http://localhost:3001/dev/players
   POST   | http://localhost:3001/dev/players
   ...
```

Keep this terminal running.

#### 3. Set Up Frontend

Open another new terminal:

```bash
cd frontend
npm install
```

Create a `.env` file in the frontend directory:
```bash
# frontend/.env
VITE_API_BASE_URL=http://localhost:3001/dev
```

Start the frontend:
```bash
npm run dev
```

The frontend will be available at **http://localhost:3000**.

#### 4. Testing the Application

Now you have everything running locally:
- DynamoDB Local: http://localhost:8000
- Backend API: http://localhost:3001/dev
- Frontend: http://localhost:3000

Open http://localhost:3000 in your browser to test the application.

**Admin Panel**: Navigate to `/admin` and login with credentials: `admin` / `FireGreen48!`

### Testing Workflow

#### Option 1: Use the Seed Script (Recommended)

The easiest way to get started is to use the included seed data script that will populate your local database with sample data:

```bash
cd backend
npm run seed
```

This will create:
- 6 sample players with wins/losses
- 3 championships (World, Intercontinental, Tag Team)
- Championship history
- 4 matches (2 completed, 2 scheduled)
- 2 tournaments (Single Elimination and Round Robin)

After running the seed script, refresh your frontend at http://localhost:3000 to see all the data!

**To clear all data and start fresh:**

```bash
cd backend
npm run clear-data
```

This will delete all data from your local DynamoDB tables.

#### Option 2: Add Sample Data Manually via API

If you prefer to add data manually:

1. **Test Creating a Player**:
   - The app starts with an empty database
   - You can use the admin panel or API directly to add test data
   - Use tools like curl, Postman, or the browser's developer console

2. **Add Sample Data via API**:

```bash
# Create a player
curl -X POST http://localhost:3001/dev/players \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "currentWrestler": "Stone Cold Steve Austin"
  }'

# Create another player
curl -X POST http://localhost:3001/dev/players \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "currentWrestler": "The Rock"
  }'

# Get all players to see their IDs
curl http://localhost:3001/dev/players

# Create a championship
curl -X POST http://localhost:3001/dev/championships \
  -H "Content-Type: application/json" \
  -d '{
    "name": "World Heavyweight Championship",
    "type": "singles"
  }'

# Schedule a match (use actual player IDs from the GET request above)
curl -X POST http://localhost:3001/dev/matches \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-03-15T20:00:00Z",
    "matchType": "singles",
    "stipulation": "No DQ",
    "participants": ["player-id-1", "player-id-2"],
    "isChampionship": false
  }'
```

3. **View in the Frontend**:
   - Refresh http://localhost:3000
   - Check the Standings page
   - Check the Championships page
   - Check the Matches page

4. **Test Recording Match Results**:

```bash
# Record a match result (use actual match ID and player IDs)
curl -X PUT http://localhost:3001/dev/matches/{matchId}/result \
  -H "Content-Type: application/json" \
  -d '{
    "winners": ["player-id-1"],
    "losers": ["player-id-2"]
  }'

# Check standings updated
curl http://localhost:3001/dev/standings
```

### Troubleshooting Local Setup

**Backend won't start:**
- Make sure DynamoDB Local is running on port 8000
- Check that no other process is using port 3001
- Run `npm install` in the backend directory

**Frontend can't connect to backend:**
- Check the `.env` file has the correct `VITE_API_BASE_URL` (should be `http://localhost:3001/dev` for local)
- Make sure the backend is running on port 3001
- Frontend runs on port 3000
- Check for CORS errors in browser console

**DynamoDB errors:**
- Tables are created automatically by serverless-offline
- If you see table errors, restart serverless-offline
- Make sure DynamoDB Local is accessible at http://localhost:8000

**Port conflicts:**
- Frontend (Vite): Change port in vite.config.ts (default: 3000)
- Backend: Change port in serverless.yml under `custom.serverless-offline` (default: 3001)
- DynamoDB Local: Use `-port 8001` flag

### Resetting Local Database

To clear all data and start fresh:

1. Stop DynamoDB Local (Ctrl+C)
2. If using Docker: `docker rm -f <container-id>`
3. Restart DynamoDB Local
4. Restart serverless-offline (it will recreate tables)

### Running Tests Before Deployment

Before deploying to AWS, verify:

1. ✅ Can create players
2. ✅ Can schedule matches
3. ✅ Can record match results
4. ✅ Standings update correctly
5. ✅ Can create championships
6. ✅ Championship history tracks properly
7. ✅ Can create tournaments (both types)
8. ✅ Tournament standings update correctly
9. ✅ All pages display data correctly
10. ✅ No console errors in browser

## API Endpoints

### Public Endpoints

- `GET /players` - Get all players
- `GET /matches` - Get all matches (filter by status)
- `GET /championships` - Get all championships
- `GET /championships/{id}/history` - Get championship history
- `GET /tournaments` - Get all tournaments
- `GET /standings` - Get current standings (optional `?seasonId=` for season-specific)
- `GET /seasons` - Get all seasons

### Admin Endpoints (Authentication Required)

- `POST /players` - Create new player
- `PUT /players/{id}` - Update player
- `POST /matches` - Schedule a match (optional `seasonId` to assign to a season)
- `PUT /matches/{id}/result` - Record match result
- `POST /championships` - Create championship
- `POST /tournaments` - Create tournament
- `PUT /tournaments/{id}` - Update tournament
- `POST /seasons` - Create a new season
- `PUT /seasons/{id}` - Update season (end season, change name)

## Database Schema

### Players Table
- Stores player information, current wrestler, and win/loss records

### Matches Table
- Stores match details, participants, results, and stipulations
- Supports championship and tournament matches

### Championships Table
- Stores championship information and current champion

### Championship History Table
- Tracks all championship reigns with dates and duration

### Tournaments Table
- Stores tournament information
- Includes brackets for single-elimination
- Includes standings for round-robin

### Seasons Table
- Stores season information (name, start/end dates, status)
- Only one season can be active at a time

### Season Standings Table
- Tracks per-player standings for each season
- Composite key: seasonId + playerId
- Stores wins, losses, draws for the specific season

## Tournament Types

### Single Elimination
- Bracket-style tournament
- Winners advance, losers are eliminated
- Automatic bracket generation

### Round Robin (G1 Climax Style)
- Every participant faces every other participant
- Point system: 2 points for win, 1 point for draw
- Highest points wins the tournament

## Cost Estimation

With AWS Free Tier:
- DynamoDB: ~$0-1/month (on-demand pricing)
- Lambda: Free for first 1M requests
- API Gateway: Free for first 1M requests
- S3 + CloudFront: ~$0-2/month

**Expected monthly cost for low traffic: $1-5/month**

## Todo

### High Priority
- [ ] Add Divisions support (group players into divisions)
- [x] ~~Add Seasons support (track standings per season, season resets)~~ **DONE**
- [ ] AWS Cognito integration for admin authentication
- [ ] Lambda Authorizer to protect admin endpoints

### Medium Priority
- [ ] Tag team match handling in frontend
- [ ] Tournament bracket progression (auto-advance winners)
- [ ] Match type statistics and analytics
- [ ] Player profile pictures and championship images

### Low Priority
- [ ] Advanced filtering and search
- [ ] Export standings to PDF/CSV
- [ ] Mobile responsive design improvements
- [ ] Real-time updates with WebSockets

## License

MIT
