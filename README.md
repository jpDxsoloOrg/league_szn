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
| **ESLint** | 9.x | JavaScript/TypeScript linter with React Hooks and TypeScript plugins |

### Backend

| Technology | Version | Description |
|------------|---------|-------------|
| **Node.js** | 24.x | JavaScript runtime for serverless Lambda functions |
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
│   │   ├── auth/          # Authentication & JWT authorization
│   │   ├── players/
│   │   ├── matches/
│   │   ├── championships/
│   │   ├── tournaments/
│   │   ├── standings/
│   │   ├── seasons/       # Season management
│   │   ├── divisions/     # Division management
│   │   ├── images/        # Image upload URL generation
│   │   └── admin/         # Admin utilities (clear-all, seed-data)
│   ├── lib/              # Shared utilities
│   └── serverless.yml    # Infrastructure config
└── README.md
```

## Local Development

### Prerequisites

- **Node.js** v20+ (`node --version`)
- **Docker** (for DynamoDB Local)
- **npm** (comes with Node.js)

### Quick Start

You'll need **3 terminals** running simultaneously.

#### Terminal 1 — DynamoDB Local

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

Leave this running.

#### Terminal 2 — Backend API

```bash
cd backend
npm install
npm run offline
```

This starts the API at `http://localhost:3001/dev`. Leave this running.

#### Terminal 3 — Seed Data & Frontend

```bash
# Create the DynamoDB tables locally, then seed sample data
cd backend
npm run create-tables
IS_OFFLINE=true npm run seed

# Start the frontend
cd ../frontend
npm install
npm run dev
```

Frontend starts at `http://localhost:3000`.

#### View the App

Open **http://localhost:3000** in your browser to see the fully populated league!

**Admin Panel**: Navigate to `/admin` and login with credentials: `admin` / `FireGreen48!`

> **Note:** Cognito auth is not available locally. For full auth testing, use the dev environment.

**To reset data:** `cd backend && IS_OFFLINE=true npm run clear-data && IS_OFFLINE=true npm run seed`

### What the Seed Creates

- 3 divisions (Raw, SmackDown, NXT)
- 12 players with random records
- 1 active season
- 4 championships with history
- 12 matches (8 completed, 4 scheduled)
- 2 tournaments, 3 events
- Contender rankings, fantasy config, site config

### Environment Variables

**Frontend** — needs a `.env` file using a relative path (Vite proxies API requests to the backend, avoiding CORS issues):

```bash
# frontend/.env
VITE_API_BASE_URL=/dev
```

The Vite dev server proxies `/dev/*` requests to `http://localhost:3001` automatically. Restart Vite after changing `.env` files.

**Backend** — no `.env` needed. The `serverless-offline` plugin sets `IS_OFFLINE=true` automatically, which configures the backend to use DynamoDB Local at `localhost:8000`.

### Ports

| Service         | Port | Config Location                                      |
| --------------- | ---- | ---------------------------------------------------- |
| Frontend (Vite) | 3000 | `frontend/vite.config.ts`                            |
| Backend API     | 3001 | `backend/serverless.yml` → `custom.serverless-offline.httpPort` |
| DynamoDB Local  | 8000 | Docker `-p` flag                                     |

### Local Limitations

| Feature        | Works Locally? | Notes                                    |
| -------------- | -------------- | ---------------------------------------- |
| DynamoDB       | Yes            | Via DynamoDB Local (Docker)              |
| Lambda / API   | Yes            | Via serverless-offline                   |
| Cognito Auth   | No             | Use dev environment for auth testing     |
| S3 Uploads     | No             | Image uploads require AWS                |
| CloudFront CDN | No             | Only applies to deployed environments    |

### Running Tests

**Frontend Unit Tests:**
```bash
cd frontend
npm test               # single run
npm run test:watch     # watch mode
npm run test:coverage  # with coverage report
```

**Backend Unit Tests:**
```bash
cd backend
npm test               # single run
npm run test:watch     # watch mode
```

**E2E Tests (Playwright):**
```bash
cd e2e
npm install
npx playwright install    # first time only
npm run test:local        # run against localhost
npm run test:ui           # open Playwright UI
```

### Useful Commands

```bash
# Backend
cd backend
npm run offline                       # start local API server
npm run create-tables                 # create local DynamoDB tables
IS_OFFLINE=true npm run seed          # seed sample data
IS_OFFLINE=true npm run clear-data    # wipe all local data
npm test                              # run tests

# Frontend
cd frontend
npm run dev           # start dev server
npm run build         # production build
npm run preview       # preview production build
npm run lint          # run ESLint
npm test              # run tests
```

### Troubleshooting

**"Cannot connect to DynamoDB"**
- Make sure the Docker container is running: `docker ps`
- Verify port 8000: `curl http://localhost:8000`

**"Frontend can't reach backend"**
- Check `frontend/.env` has `VITE_API_BASE_URL=/dev`
- Restart Vite after `.env` changes
- Verify backend is up: `curl http://localhost:3001/dev/players`

**"Tables not found"**
- Run `npm run create-tables` in the backend directory

**"Port already in use"**
- Kill the process: `lsof -ti:3000 | xargs kill -9` (swap port as needed)

---

## Live Environments

| Environment | Frontend | Backend API |
|-------------|----------|-------------|
| **Production** | http://leagueszn.jpdxsolo.com | https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev |
| **Dev** | http://dev.leagueszn.jpdxsolo.com | https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest |

## Deployment

### Prerequisites

- Node.js 24+
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

All admin endpoints require a valid JWT token from Cognito in the `Authorization` header.

- `POST /auth/setup` - Create admin user (one-time setup)
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
- `POST /images/upload-url` - Generate presigned S3 URL for image uploads
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
- Cognito: Free for up to 50,000 monthly active users

**Expected monthly cost for low traffic: $1-5/month**

## Todo

### High Priority
- [x] ~~Add Divisions support (group players into divisions)~~ **DONE**
- [x] ~~Add Seasons support (track standings per season, season resets)~~ **DONE**
- [x] ~~AWS Cognito integration for admin authentication~~ **DONE**
- [x] ~~Lambda Authorizer to protect admin endpoints~~ **DONE**
- [x] ~~Player profile pictures and championship images~~ **DONE**

### Medium Priority
- [ ] Tag team match handling in frontend
- [ ] Tournament bracket progression (auto-advance winners)
- [ ] Match type statistics and analytics

### Low Priority
- [ ] Advanced filtering and search
- [ ] Export standings to PDF/CSV
- [ ] Mobile responsive design improvements
- [ ] Real-time updates with WebSockets

## License

MIT
