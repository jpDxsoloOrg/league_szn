# League SZN

A serverless web application for managing a WWE 2K league with standings, championships, matches, tournaments, events, fantasy league, challenges, promos, statistics, and more.

---

## Table of Contents

- [Features](#features)
  - [Public Features](#public-features-no-login-required)
  - [Wrestler Features](#wrestler-features-wrestler-auth-required)
  - [Admin and Moderator Features](#admin-and-moderator-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Authentication and Authorization](#authentication-and-authorization)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Local Development](#local-development)
- [Testing](#testing)
- [CI/CD Pipeline](#cicd-pipeline)
- [Live Environments](#live-environments)
- [Cost Estimation](#cost-estimation)
- [License](#license)

---

## Features

### Public Features (No Login Required)

| Feature | Description |
|---------|-------------|
| **Standings** | View all-time or per-season player rankings with win/loss/draw records |
| **Championships** | Browse active titles with current champions and full reign history |
| **Events** | Browse PPV events and weekly shows with scheduled and completed matches |
| **Tournaments** | Follow single-elimination brackets and round-robin (G1 Climax style) standings |
| **Statistics** | Head-to-head records, match type stats, win streaks, leaderboards, and achievements |
| **Promos** | View wrestler promos with emoji reactions |
| **Contender Rankings** | Automatic #1 contender tracking per championship based on recent performance |
| **Challenges** | View open and completed match challenges between wrestlers |
| **Help (Wiki)** | Help at `/guide` (redirects to wiki index) and wiki articles at `/guide/wiki`. Wiki content lives in `frontend/public/wiki/` (markdown + `index.json`); see CLAUDE.md for how to add articles. |
| **Internationalization** | Full English and German language support |

### Wrestler Features (Wrestler Auth Required)

| Feature | Description |
|---------|-------------|
| **Challenges** | Issue match challenges to other wrestlers, accept/decline/counter incoming challenges |
| **Promos** | Create character promos with text content |
| **Wrestler Profile** | View and edit your own profile, upload wrestler images |
| **Fantasy Picks** | Make fantasy picks for upcoming events and view your scores |

### Admin and Moderator Features

| Feature | Description |
|---------|-------------|
| **Player Management** | Create, update, and delete players; upload wrestler images; assign divisions |
| **Match Management** | Schedule matches with stipulations; record results (auto-updates standings, contender rankings, and championship history) |
| **Championship Management** | Create singles and tag team titles with image upload; track full history; vacate titles |
| **Tournament Management** | Single-elimination brackets with auto-advancement; round-robin with point system (G1 Climax style) |
| **Season Management** | Create seasons, track per-season standings, end seasons |
| **Division Management** | Create divisions (Raw, SmackDown, NXT, etc.) and assign players |
| **Event Management** | Create PPV events and weekly shows, organize matches into event cards |
| **Fantasy League Admin** | Configure point systems, set wrestler costs, score completed events, view leaderboards |
| **User Management** | Manage user roles (Admin, Moderator, Wrestler, Fantasy); create, enable, and disable users |
| **Site Configuration** | Feature flag toggles for challenges, promos, fantasy, statistics, and contenders |
| **Contender Ranking Admin** | Recalculate contender rankings on demand |
| **Danger Zone** | Clear all data (with safety confirmation); seed sample data for testing |

---

## Tech Stack

### Frontend

| Technology | Version | Description |
|------------|---------|-------------|
| **React** | 18.2.0 | UI framework for building interactive, component-based user interfaces |
| **TypeScript** | 5.2.2 | Typed superset of JavaScript providing compile-time type checking and IDE support |
| **Vite** | 5.0.8 | Modern build tool with hot module replacement for fast development |
| **React Router DOM** | 6.20.1 | Client-side routing for SPA navigation between pages |
| **i18next** | 25.8.1 | Internationalization framework supporting English and German |
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
| **AWS Lambda** | Serverless compute for 55+ API handlers across 17 function domains |
| **API Gateway** | REST API with CORS support and custom JWT authorizer |
| **DynamoDB** | NoSQL database with on-demand billing (17 tables) |
| **Amazon S3** | Object storage for frontend static files and player/championship images with presigned URLs |
| **CloudFront** | CDN for global content delivery with HTTPS enforcement and SPA routing support |
| **AWS Cognito** | User pool with email-based sign-in, role groups, and JWT tokens |
| **AWS Certificate Manager** | SSL/TLS certificate management for HTTPS on custom domains |

### CI/CD and DevOps

| Technology | Description |
|------------|-------------|
| **GitHub Actions** | Automated CI/CD pipelines for dev and production deployments |
| **deploy-dev.yml** | Triggered on pull requests to main -- deploys to devtest stage |
| **deploy-prod.yml** | Manually triggered -- deploys to production |
| **Docker** | Used for running DynamoDB Local in development |
| **Playwright** | End-to-end testing framework with Page Object Model |

---

## Project Structure

```
league_szn/
├── frontend/                    # React/TypeScript SPA
│   ├── src/
│   │   ├── components/          # React components
│   │   │   ├── admin/           # Admin panel components
│   │   │   ├── auth/            # Login/Signup
│   │   │   ├── challenges/      # Challenge system
│   │   │   ├── contenders/      # Contender rankings
│   │   │   ├── events/          # PPV events and shows
│   │   │   ├── fantasy/         # Fantasy league
│   │   │   ├── promos/          # Wrestler promos
│   │   │   ├── profile/         # Wrestler profiles
│   │   │   ├── statistics/      # Advanced stats
│   │   │   └── __tests__/       # Component tests
│   │   ├── contexts/            # AuthContext, SiteConfigContext
│   │   ├── services/            # API client (api.ts), Cognito auth
│   │   ├── types/               # TypeScript interfaces
│   │   ├── utils/               # Utilities
│   │   ├── i18n/                # Internationalization (en, de)
│   │   ├── constants/           # App constants
│   │   └── mocks/               # Test mocks
│   ├── vite.config.ts
│   └── vitest.config.ts
├── backend/                     # Serverless Node.js API
│   ├── functions/               # Lambda function domains
│   │   ├── admin/               # Clear-all, seed-data, site config
│   │   ├── auth/                # Login, authorizer, post-confirmation
│   │   ├── challenges/          # Challenge management
│   │   ├── championships/       # Championship CRUD + history + vacate
│   │   ├── contenders/          # Ranking calculations
│   │   ├── divisions/           # Division management
│   │   ├── events/              # PPV event management
│   │   ├── fantasy/             # Fantasy league operations
│   │   ├── images/              # S3 presigned upload URLs
│   │   ├── matches/             # Match scheduling and results
│   │   ├── players/             # Player CRUD + wrestler profiles
│   │   ├── promos/              # Promo creation and reactions
│   │   ├── seasons/             # Season management
│   │   ├── standings/           # Standing calculations
│   │   ├── statistics/          # Advanced statistics
│   │   ├── tournaments/         # Tournament management
│   │   └── users/               # User management and roles
│   ├── lib/                     # Shared utilities (auth, dynamodb, response)
│   ├── scripts/                 # create-tables, seed-data, clear-data
│   └── serverless.yml           # Infrastructure as Code
├── e2e/                         # Playwright end-to-end tests
│   ├── tests/                   # Test suites (public, admin, integration)
│   ├── pages/                   # Page Object Model
│   └── config/                  # Environment configs and selectors
├── features/                    # Feature design proposals
├── .github/workflows/           # CI/CD pipelines
└── README.md
```

---

## Authentication and Authorization

### Overview

League SZN uses AWS Cognito with email-based sign-in and a 4-tier role hierarchy:

```
Fantasy (lowest) --> Wrestler --> Moderator --> Admin (highest)
```

### Role Permissions

| Role | Permissions |
|------|-------------|
| **Fantasy** | Make fantasy picks, view leaderboards, access public data |
| **Wrestler** | All Fantasy permissions + issue/respond to challenges, create promos, manage own profile |
| **Moderator** | All Wrestler permissions + manage players, matches, championships, tournaments, seasons, divisions, events, fantasy config |
| **Admin** | All Moderator permissions + manage users/roles, clear all data, manage admin-level roles |

### Technical Details

- **Identity Provider**: AWS Cognito User Pool with email-based login
- **Token Lifecycle**: 24-hour access tokens, 24-hour ID tokens, 30-day refresh tokens
- **Authorization**: Custom Lambda Authorizer validates JWT tokens on all protected endpoints
- **Role Groups**: Cognito User Pool Groups (Admin, Moderator, Wrestler, Fantasy) with precedence-based hierarchy
- **Key Restriction**: Moderators cannot perform Admin-only operations (clear all data, manage Admin/Moderator roles)
- **Post-Confirmation Trigger**: Lambda function assigns default role group on sign-up

---

## API Endpoints

All endpoints are served under the API Gateway base URL. Admin endpoints require a valid JWT token in the `Authorization: Bearer <token>` header.

### API Documentation (OpenAPI / Swagger)

Interactive API docs are available via **Swagger UI**:

- **Local:** When running the backend with `npm run offline` (in `backend/`), open [http://localhost:3001/dev/api-docs](http://localhost:3001/dev/api-docs).
- **Deployed:** Use the same path on your API base URL (e.g. `https://<api-id>.execute-api.us-east-1.amazonaws.com/<stage>/api-docs`).

The OpenAPI 3.0 spec is at `backend/docs/openapi.yaml`. To validate it (syntax and refs), from the `backend/` directory run:

```bash
npm run validate-api-docs
```

When you add or change HTTP endpoints in `serverless.yml` or handler request/response shapes, update `backend/docs/openapi.yaml` so the docs stay in sync. After editing the spec or `backend/docs/swagger.html`, run `npm run embed-docs` in `backend/` and commit the updated `functions/docs/docsEmbed.generated.ts` so the deployed API serves the new content.

<details>
<summary><strong>Public Endpoints (17)</strong></summary>

#### Players
| Method | Path | Description |
|--------|------|-------------|
| GET | `/players` | Get all players |

#### Matches
| Method | Path | Description |
|--------|------|-------------|
| GET | `/matches` | Get all matches (filter by `?status=scheduled\|completed`) |

#### Championships
| Method | Path | Description |
|--------|------|-------------|
| GET | `/championships` | Get all championships |
| GET | `/championships/{id}/history` | Get championship reign history |
| GET | `/championships/{id}/contenders` | Get contender rankings for a championship |

#### Tournaments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/tournaments` | Get all tournaments |

#### Standings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/standings` | Get current standings (optional `?seasonId=` for per-season) |

#### Seasons
| Method | Path | Description |
|--------|------|-------------|
| GET | `/seasons` | Get all seasons |

#### Divisions
| Method | Path | Description |
|--------|------|-------------|
| GET | `/divisions` | Get all divisions |

#### Events
| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | Get all events (filter by `?eventType=`, `?status=`, `?seasonId=`) |
| GET | `/events/{eventId}` | Get single event with match card |

#### Statistics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/statistics` | Get statistics (sections: `player-stats`, `head-to-head`, `leaderboards`, `records`, `achievements`) |

#### Site Config
| Method | Path | Description |
|--------|------|-------------|
| GET | `/site-config` | Get feature flag configuration |

#### Promos
| Method | Path | Description |
|--------|------|-------------|
| GET | `/promos` | Get all promos (filter by `?playerId=`, `?promoType=`) |
| GET | `/promos/{promoId}` | Get single promo with responses |

#### Challenges
| Method | Path | Description |
|--------|------|-------------|
| GET | `/challenges` | Get all challenges (filter by `?status=`, `?playerId=`) |
| GET | `/challenges/{challengeId}` | Get single challenge |

#### Fantasy (Public)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/fantasy/config` | Get fantasy league configuration |
| GET | `/fantasy/wrestlers/costs` | Get wrestler costs for fantasy picks |

</details>

<details>
<summary><strong>Authenticated Endpoints -- Auth and Profile (5)</strong></summary>

#### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/setup` | Create admin user (one-time setup) |

#### Player Profile (Wrestler+)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/players/me` | Get own wrestler profile |
| PUT | `/players/me` | Update own profile (name, wrestler, image) |

#### Promos (Wrestler+)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/promos` | Create a new promo |
| POST | `/promos/{promoId}/react` | Add emoji reaction to a promo |

</details>

<details>
<summary><strong>Authenticated Endpoints -- Challenges (Wrestler+) (3)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/challenges` | Issue a new challenge |
| POST | `/challenges/{challengeId}/respond` | Accept, decline, or counter a challenge |
| POST | `/challenges/{challengeId}/cancel` | Cancel own challenge |

</details>

<details>
<summary><strong>Authenticated Endpoints -- Fantasy Picks (Fantasy+) (4)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/fantasy/picks/{eventId}` | Submit fantasy picks for an event |
| GET | `/fantasy/picks/{eventId}` | Get own picks for an event |
| GET | `/fantasy/me/picks` | Get all own picks across events |
| DELETE | `/fantasy/picks/{eventId}` | Clear own picks for an event |

</details>

<details>
<summary><strong>Admin Endpoints -- Players (3)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/players` | Create new player |
| PUT | `/players/{playerId}` | Update player |
| DELETE | `/players/{playerId}` | Delete player (fails if player holds a championship) |

</details>

<details>
<summary><strong>Admin Endpoints -- Matches (2)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/matches` | Schedule a match (optional `seasonId`, `eventId`) |
| PUT | `/matches/{matchId}/result` | Record match result (cascading updates to standings, championships, contenders) |

</details>

<details>
<summary><strong>Admin Endpoints -- Championships (4)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/championships` | Create championship |
| PUT | `/championships/{championshipId}` | Update championship |
| DELETE | `/championships/{championshipId}` | Delete championship (cascades to history) |
| POST | `/championships/{championshipId}/vacate` | Vacate a championship title |

</details>

<details>
<summary><strong>Admin Endpoints -- Tournaments (2)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tournaments` | Create tournament |
| PUT | `/tournaments/{tournamentId}` | Update tournament |

</details>

<details>
<summary><strong>Admin Endpoints -- Seasons (3)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/seasons` | Create a new season |
| PUT | `/seasons/{seasonId}` | Update season (end season, change name) |
| DELETE | `/seasons/{seasonId}` | Delete season (cascades to season standings) |

</details>

<details>
<summary><strong>Admin Endpoints -- Divisions (3)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/divisions` | Create a new division |
| PUT | `/divisions/{divisionId}` | Update division |
| DELETE | `/divisions/{divisionId}` | Delete division (fails if players are assigned) |

</details>

<details>
<summary><strong>Admin Endpoints -- Events (3)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/events` | Create a new event |
| PUT | `/events/{eventId}` | Update event |
| DELETE | `/events/{eventId}` | Delete event |

</details>

<details>
<summary><strong>Admin Endpoints -- Fantasy Admin (6)</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/admin/fantasy/config` | Update fantasy point configuration |
| POST | `/admin/fantasy/wrestlers/costs/initialize` | Initialize wrestler costs |
| POST | `/admin/fantasy/wrestlers/costs/recalculate` | Recalculate all wrestler costs based on performance |
| PUT | `/admin/fantasy/wrestlers/{playerId}/cost` | Manually set a wrestler's cost |
| GET | `/fantasy/leaderboard` | Get fantasy leaderboard (optional `?seasonId=`) |
| POST | `/fantasy/score` | Score all completed but unscored events |

</details>

<details>
<summary><strong>Admin Endpoints -- Users, Promos, Images, Site Config, Contenders, Data Management (8)</strong></summary>

#### User Management (Admin only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List all users with roles |
| POST | `/admin/users/role` | Promote or demote a user's role |
| POST | `/admin/users/toggle-enabled` | Enable or disable a user account |

#### Promo Administration
| Method | Path | Description |
|--------|------|-------------|
| PUT | `/admin/promos/{promoId}` | Pin or hide a promo |

#### Images
| Method | Path | Description |
|--------|------|-------------|
| POST | `/images/upload-url` | Generate presigned S3 URL for image uploads |

#### Site Configuration
| Method | Path | Description |
|--------|------|-------------|
| PUT | `/admin/site-config` | Update feature flag toggles |

#### Contender Rankings
| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/contenders/recalculate` | Recalculate contender rankings |

#### Data Management (Admin only)
| Method | Path | Description |
|--------|------|-------------|
| DELETE | `/admin/clear-all` | Clear all data from all tables |
| POST | `/admin/seed-data` | Generate sample data for testing |

</details>

---

## Database Schema

League SZN uses 17 DynamoDB tables with on-demand (PAY_PER_REQUEST) billing.

### Core Tables

| Table | Key | Description |
|-------|-----|-------------|
| **Players** | `playerId` (HASH) | Player info, current wrestler, win/loss records. GSI on `userId` for profile lookups. |
| **Matches** | `matchId` (HASH), `date` (RANGE) | Match details, participants, results, stipulations. GSI on `tournamentId` for tournament matches. |
| **Championships** | `championshipId` (HASH) | Championship info, type (singles/tag), current champion. |
| **ChampionshipHistory** | `championshipId` (HASH), `wonDate` (RANGE) | All championship reigns with dates and duration. |
| **Tournaments** | `tournamentId` (HASH) | Tournament info, brackets (single-elimination), standings (round-robin). |
| **Seasons** | `seasonId` (HASH) | Season name, start/end dates, active status. Only one season active at a time. |
| **SeasonStandings** | `seasonId` (HASH), `playerId` (RANGE) | Per-player, per-season win/loss/draw records. GSI on `playerId`. |
| **Divisions** | `divisionId` (HASH) | Division name and description. Players reference divisions via `divisionId`. |
| **Events** | `eventId` (HASH) | PPV events and weekly shows. GSIs on `eventType+date`, `status+date`, and `seasonId+date`. |

### Advanced Feature Tables

| Table | Key | Description |
|-------|-----|-------------|
| **ContenderRankings** | `championshipId` (HASH), `playerId` (RANGE) | Current contender ranking per player per championship. GSI on `championshipId+rank`. |
| **RankingHistory** | `playerId` (HASH), `weekKey` (RANGE) | Weekly ranking snapshots. GSI on `championshipId+weekKey`. |
| **Challenges** | `challengeId` (HASH) | Match challenges between wrestlers. GSIs on `challengerId`, `challengedId`, and `status`. |
| **Promos** | `promoId` (HASH) | Wrestler promos with reactions. GSIs on `playerId+createdAt` and `promoType+createdAt`. |

### Fantasy League Tables

| Table | Key | Description |
|-------|-----|-------------|
| **FantasyConfig** | `configKey` (HASH) | Fantasy league point system configuration. |
| **WrestlerCosts** | `playerId` (HASH) | Cost assigned to each wrestler for fantasy draft. |
| **FantasyPicks** | `eventId` (HASH), `fantasyUserId` (RANGE) | User picks per event. GSI on `fantasyUserId+eventId`. |

### Configuration Tables

| Table | Key | Description |
|-------|-----|-------------|
| **SiteConfig** | `configKey` (HASH) | Feature flag toggles (challenges, promos, fantasy, statistics, contenders). |

---

## Local Development

### Prerequisites

- **Node.js** v20+ (`node --version`)
- **Docker** (for DynamoDB Local)
- **npm** (comes with Node.js)

### Quick Start

You'll need **3 terminals** running simultaneously.

#### Terminal 1 -- DynamoDB Local

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

Leave this running.

#### Terminal 2 -- Backend API

```bash
cd backend
npm install
npm run offline
```

This starts the API at `http://localhost:3001/dev`. Leave this running.

> **Note:** The `offline` script uses `--stage offline` to disable CloudFormation stack splitting (`serverless-plugin-split-stacks`) which is incompatible with local development. The `--noPrependStageInUrl --prefix dev` flags ensure routes remain at `/dev/*` for frontend compatibility.

#### Terminal 3 -- Seed Data and Frontend

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

Open **http://localhost:3000** in your browser to see the fully populated league.

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

**Frontend** -- needs a `.env` file using a relative path (Vite proxies API requests to the backend, avoiding CORS issues):

```bash
# frontend/.env
VITE_API_BASE_URL=/dev
```

The Vite dev server proxies `/dev/*` requests to `http://localhost:3001` automatically. Restart Vite after changing `.env` files.

**Backend** -- no `.env` needed. The `serverless-offline` plugin sets `IS_OFFLINE=true` automatically, which configures the backend to use DynamoDB Local at `localhost:8000`. DynamoDB table names use the `-offline` suffix locally (e.g., `wwe-2k-league-api-players-offline`). The `create-tables`, `seed`, and `clear-data` scripts default to this suffix.

### Ports

| Service         | Port | Config Location                                      |
| --------------- | ---- | ---------------------------------------------------- |
| Frontend (Vite) | 3000 | `frontend/vite.config.ts`                            |
| Backend API     | 3001 | `backend/serverless.yml` > `custom.serverless-offline.httpPort` |
| DynamoDB Local  | 8000 | Docker `-p` flag                                     |

### Local Limitations

| Feature        | Works Locally? | Notes                                    |
| -------------- | -------------- | ---------------------------------------- |
| DynamoDB       | Yes            | Via DynamoDB Local (Docker)              |
| Lambda / API   | Yes            | Via serverless-offline                   |
| Cognito Auth   | No             | Use dev environment for auth testing     |
| S3 Uploads     | No             | Image uploads require AWS                |
| CloudFront CDN | No             | Only applies to deployed environments    |

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

## Testing

### Technology Stack

| Layer | Tool | Rationale |
|-------|------|-----------|
| Backend unit tests | **Vitest** | ESM-native, fast, works with Serverless/TypeScript |
| Frontend component tests | **Vitest + React Testing Library** | Standard for React 18 + Vite projects |
| Mocking (backend) | **vitest built-in mocks** | Mock DynamoDB DocumentClient, Cognito SDK, S3 client |
| Mocking (frontend) | **vitest built-in mocks + msw** | Mock fetch/API calls, Cognito Amplify SDK |
### Setup Notes

- Frontend: `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom`
- Backend: `vitest@3` installed, `vitest.config.mts` configured, `npm test` / `npm run test:watch` scripts added
- Frontend config: `vitest.config.ts` in frontend root; Backend config: `backend/vitest.config.mts`
- Mock pattern: `vi.hoisted()` + `vi.mock()` for AWS SDK, Cognito, S3 clients (established in auth tests)

### Running Tests

**Backend:**
```bash
cd backend

# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Run a specific test file
npx vitest run lib/__tests__/auth.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose auth

# Run with coverage
npx vitest run --coverage
```

**Frontend:**
```bash
cd frontend

npm test
npm run test:watch

# Run with coverage
npx vitest run --coverage
```

---

## CI/CD Pipeline

### Dev Pipeline (`deploy-dev.yml`)

**Trigger**: Pull requests opened, updated, or reopened against `main`.

```
Checkout --> Node 24 Setup --> Install Frontend
    |
    +--> Lint (ESLint)
    +--> Typecheck (tsc --noEmit)
    +--> Unit Tests (Vitest)
    |
[Tests pass] --> Deploy Backend (Serverless Framework --> devtest stage)
    |
    +--> Extract Cognito IDs from CloudFormation
    +--> Install & Build Frontend (Vite, --mode devtest)
    +--> S3 Sync (deploy to dev.leagueszn.jpdxsolo.com)
    +--> CloudFront Cache Invalidation
    +--> Deployment Summary
```

### Prod Pipeline (`deploy-prod.yml`)

**Trigger**: Manual dispatch (`workflow_dispatch`) after merging to `main`.

```
Checkout --> Node 24 Setup --> Install Frontend
    |
    +--> Lint (ESLint)
    +--> Typecheck (tsc --noEmit)
    +--> Unit Tests (Vitest)
    |
[Tests pass] --> Deploy Backend (Serverless Framework --> dev stage)
    |
    +--> Extract Cognito IDs from CloudFormation
    +--> Install & Build Frontend (Vite, production mode)
    +--> S3 Sync (deploy to leagueszn.jpdxsolo.com)
    +--> CloudFront Cache Invalidation
    +--> Deployment Summary
```

### Pipeline Details

| Step | Description |
|------|-------------|
| **Lint** | ESLint checks across all frontend TypeScript/React files |
| **Typecheck** | TypeScript compiler (`tsc --noEmit`) validates types without emitting output |
| **Unit Tests** | Vitest runs all frontend test suites |
| **Backend Deploy** | Serverless Framework deploys all Lambda functions, API Gateway config, DynamoDB tables, Cognito, S3 buckets, and CloudFront via CloudFormation |
| **Frontend Build** | Vite builds the React SPA with environment-specific API URLs and Cognito config injected |
| **S3 Sync** | Deploys built frontend assets to S3 (with `--delete` to remove stale files, `--exclude "*.map"` to omit source maps) |
| **CloudFront Invalidation** | Invalidates CDN cache (`/*`) to serve fresh content immediately |

---

## Live Environments

| Environment | Frontend | Backend API |
|-------------|----------|-------------|
| **Production** | https://leagueszn.jpdxsolo.com | https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev |
| **Dev** | https://dev.leagueszn.jpdxsolo.com | https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest |

---

## Cost Estimation

With AWS Free Tier:
- DynamoDB: ~$0-1/month (on-demand pricing)
- Lambda: Free for first 1M requests
- API Gateway: Free for first 1M requests
- S3 + CloudFront: ~$0-2/month
- Cognito: Free for up to 50,000 monthly active users

**Expected monthly cost for low traffic: $1-5/month**

---

## License

MIT
