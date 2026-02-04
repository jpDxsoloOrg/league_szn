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
  - **Manage divisions** (create divisions, assign players to divisions)
  - **Delete functionality** for players, divisions, seasons, and championships
  - **Data management** (clear all data, generate sample data)
  - **Built-in Help guide** with comprehensive admin documentation

## Tech Stack

### Frontend

| Technology | Version | Description |
|------------|---------|-------------|
| **React** | 18.2.0 | UI framework for building interactive, component-based user interfaces |
| **TypeScript** | 5.2.2 | Typed superset of JavaScript providing compile-time type checking and IDE support |
| **Vite** | 5.0.8 | Modern build tool with hot module replacement for fast development |
| **React Router DOM** | 6.20.1 | Client-side routing for SPA navigation between pages (Standings, Championships, Matches, etc.) |
| **i18next** | 25.8.1 | Internationalization framework supporting multiple languages (English and German) |
| **react-i18next** | 16.5.4 | React bindings for i18next with hooks and components |
| **AWS Amplify** | 6.16.0 | AWS integration library for authentication and cloud services |
| **amazon-cognito-identity-js** | 6.3.7 | Cognito SDK for client-side user authentication |
| **@aws-sdk/client-s3** | 3.981.0 | AWS SDK v3 for S3 operations (image uploads) |
| **ESLint** | 8.55.0 | JavaScript/TypeScript linter with React Hooks and TypeScript plugins |

### Backend

| Technology | Version | Description |
|------------|---------|-------------|
| **Node.js** | 20.x | JavaScript runtime for serverless Lambda functions |
| **TypeScript** | 5.3.3 | Type-safe backend code with compile-time checking |
| **@aws-sdk/client-dynamodb** | 3.450.0 | AWS SDK v3 for DynamoDB database operations |
| **@aws-sdk/lib-dynamodb** | 3.450.0 | High-level DynamoDB Document Client for simplified operations |
| **@aws-sdk/client-s3** | 3.450.0 | S3 client for image storage and presigned URL generation |
| **@aws-sdk/client-cognito-identity-provider** | 3.982.0 | Cognito IDP client for admin user management |
| **aws-jwt-verify** | 5.1.1 | JWT verification library for validating Cognito tokens in Lambda authorizer |
| **uuid** | 9.0.1 | UUID generation for unique entity identifiers |
| **Serverless Framework** | 3.38.0 | Infrastructure as Code framework for deploying serverless applications |
| **serverless-offline** | 13.3.0 | Local emulation of API Gateway and Lambda for development |

### AWS Infrastructure

| Service | Purpose |
|---------|---------|
| **AWS Lambda** | Serverless compute for API handlers (auth, players, matches, championships, tournaments, standings, seasons, divisions, images, admin) |
| **API Gateway** | REST API with CORS support and custom JWT authorizer for admin endpoints |
| **DynamoDB** | NoSQL database with on-demand billing for Players, Matches, Championships, Championship History, Tournaments, Seasons, Season Standings, and Divisions tables |
| **Amazon S3** | Object storage for frontend static files and player/championship images with presigned URLs |
| **CloudFront** | CDN for global content delivery with HTTPS enforcement and SPA routing support |
| **AWS Cognito** | User pool for admin authentication with username-based sign-in and JWT tokens |
| **AWS Certificate Manager** | SSL/TLS certificate management for HTTPS on custom domains |

### CI/CD & DevOps

| Technology | Description |
|------------|-------------|
| **GitHub Actions** | Automated CI/CD pipelines for deployment |
| **deploy-dev.yml** | Triggered on pull requests to main - deploys to devtest stage |
| **deploy-prod.yml** | Triggered on merged pull requests - deploys to production |
| **Docker** | Used for running DynamoDB Local in development |

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
│   │   ├── seasons/       # Season management
│   │   ├── divisions/     # Division management
│   │   └── admin/         # Admin utilities (clear-all, seed-data)
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

- Node.js 20+
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

2. Make sure you have Node.js installed (v20+):
```bash
node --version  # Should be 20 or higher
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
- `GET /divisions` - Get all divisions

### Admin Endpoints (Authentication Required)

- `POST /players` - Create new player
- `PUT /players/{id}` - Update player
- `DELETE /players/{id}` - Delete player (fails if player holds a championship)
- `POST /matches` - Schedule a match (optional `seasonId` to assign to a season)
- `PUT /matches/{id}/result` - Record match result
- `POST /championships` - Create championship
- `PUT /championships/{id}` - Update championship
- `DELETE /championships/{id}` - Delete championship (cascades to championship history)
- `POST /tournaments` - Create tournament
- `PUT /tournaments/{id}` - Update tournament
- `POST /seasons` - Create a new season
- `PUT /seasons/{id}` - Update season (end season, change name)
- `DELETE /seasons/{id}` - Delete season (cascades to season standings)
- `POST /divisions` - Create a new division
- `PUT /divisions/{id}` - Update division
- `DELETE /divisions/{id}` - Delete division (fails if players are assigned)
- `DELETE /admin/clear-all` - Clear all data from all tables
- `POST /admin/seed-data` - Generate sample data for testing

## Admin Panel Features

The Admin Panel is accessible at `/admin` and provides comprehensive management tools organized into tabs.

### Delete Functionality

Each management area includes delete capabilities with appropriate safeguards:

| Entity | Location | Validation | Cascade Behavior |
|--------|----------|------------|------------------|
| **Players** | Manage Players tab | Cannot delete if player holds an active championship | Removes player from all season standings |
| **Divisions** | Divisions tab | Cannot delete if players are assigned to the division | None |
| **Seasons** | Seasons tab | Confirmation required | Deletes all season standings for that season |
| **Championships** | Championships tab | Confirmation required | Deletes entire championship history (all reigns) |

All delete operations display a confirmation dialog before execution.

### Clear All Data (Danger Zone)

Located in the **Danger Zone** tab, this feature allows complete data reset:

- **Safety Features**:
  - Requires typing the exact phrase `DELETE ALL DATA` to enable the button
  - Shows a final confirmation dialog before proceeding
  - Displays count of deleted items after completion

- **What Gets Deleted**:
  - All players
  - All matches
  - All championships and championship history
  - All tournaments
  - All seasons and season standings
  - All divisions

### Generate Sample Data (Seed Data)

Also located in the **Danger Zone** tab, this feature creates sample data for testing:

- **What Gets Created**:
  - 3 divisions (Raw, SmackDown, NXT)
  - 12 players with random wrestlers and win/loss records
  - 1 active season (30-day duration)
  - Season standings for all players
  - 4 championships (World Heavyweight, Intercontinental, Tag Team, US)
  - Championship history entries
  - 12 matches (8 completed, 4 scheduled)
  - 2 tournaments (King of the Ring - Single Elimination, G1 Climax - Round Robin)

- **Note**: Seed data is additive and does not delete existing data

### Admin Help Guide

The **Help** tab provides comprehensive documentation covering:

1. **Managing Players** - Add, edit, delete players; image upload guidelines
2. **Scheduling Matches** - Match types, stipulations, championship matches
3. **Recording Results** - Enter outcomes, update standings
4. **Managing Championships** - Create titles, track history, assign champions
5. **Creating Tournaments** - Single elimination and round robin formats
6. **Managing Seasons** - Create/end seasons, per-season standings
7. **Managing Divisions** - Create divisions, assign players
8. **Data Management** - Seed data and clear all with warnings
9. **Typical Admin Workflow** - Step-by-step guide for common tasks

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

### Divisions Table
- Stores division information (name, description)
- Players can be assigned to a division via the divisionId field

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
- [x] ~~Add Divisions support (group players into divisions)~~ **DONE**
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
