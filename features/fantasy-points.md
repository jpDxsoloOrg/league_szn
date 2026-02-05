# Feature: Fantasy Points System

## Executive Summary

A comprehensive fantasy wrestling system where non-wrestler users create accounts, pick wrestlers from each division within a budget for each "show," and earn points based on their picks' match performance. The system integrates with the existing season structure and introduces a new user type alongside admins.

## Problem Statement

Currently, the WWE 2K League is a closed system where only the players (wrestlers) participate directly. There's no way for friends, family, or spectators to engage competitively with the league. Fantasy sports systems have proven to dramatically increase engagement and investment in sporting events. This feature would allow a broader community to participate, create friendly competition among viewers, and add stakes to every match beyond just the wrestlers involved.

## Goals

1. Create a new "fantasy user" account type separate from admin users
2. Allow fantasy users to pick wrestlers each show within budget constraints
3. Calculate and award points based on wrestler performance in matches
4. Track fantasy standings per season alongside wrestler standings
5. Enable admin control over show locks and point configurations
6. Provide engaging UI for picking, viewing live results, and tracking standings

## Non-Goals

1. Real money or betting functionality
2. Trading wrestlers between users mid-show
3. Complex draft systems (this is pick-based, not draft-based)
4. Integration with external fantasy platforms
5. Mobile app (web responsive only)

## Proposed Solution

### High-Level Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   Fantasy User    |     |   Cognito User    |     |   Lambda          |
|   Signs Up/Login  | --> |   Pool (Fantasy)  | --> |   Authorizer      |
+-------------------+     +-------------------+     +-------------------+
        |                                                   |
        v                                                   v
+-------------------+     +-------------------+     +-------------------+
|   Make Picks      |     |   Picks API       |     |   DynamoDB        |
|   (Before Lock)   | --> |   Endpoints       | --> |   - FantasyUsers  |
+-------------------+     +-------------------+     |   - Shows         |
        |                                           |   - Picks         |
        |                                           |   - WrestlerCosts |
        v                                           +-------------------+
+-------------------+                                       |
|   Match Results   |                                       |
|   Recorded        | -------------------------------------->
|   (Points Calc)   |                                       |
+-------------------+                                       |
```

### Core Concepts

#### Shows (Events Integration)
Fantasy "shows" integrate with the **Events/PPV feature** (see [feature_events_ppv.md](feature_events_ppv.md)). An event contains matches, and fantasy users make picks for each event. Events belong to a season and can be locked/unlocked by admins.

#### Wrestler Costs
Each wrestler has a cost that reflects their expected performance. Costs fluctuate based on recent performance (configurable algorithm). Starting cost is configurable (default: 100).

#### Budget System
Users have a configurable budget per show (default: 500). They can pick **up to** a configurable maximum number of wrestlers from each division without exceeding the total budget. The budget naturally limits total picks - users don't have to hit the max.

#### Points System
Points are awarded based on match outcomes:
- **Base Win Points**: 10 points
- **Multi-Man Match Multiplier**: (participants - 1) x base = harder matches worth more
  - Singles (2 participants): 10 pts
  - Triple Threat (3): 20 pts
  - Fatal 4-Way (4): 30 pts
  - 6-Pack Challenge (6): 50 pts
- **Championship Match Bonus**: +5 points
- **Title Win Bonus**: +10 points (winning a championship match)

### Enhanced Feature Ideas

After analyzing the requirements, I recommend these additions to make fantasy picks more engaging:

1. **Streak Bonuses**: Extra points for picking winners N shows in a row
2. **Underdog Multiplier**: Higher-cost wrestlers beaten by lower-cost wrestlers = bonus for those who picked the underdog
3. **Perfect Pick Bonus**: Bonus points if ALL your picks win
4. **Weekly Power Rankings**: Show how hot/cold each wrestler is trending
5. **Head-to-Head Mode**: Optional direct competition with another fantasy user

### Show Locking (Admin Feature)

Admins control when picks are locked via show status:
- **draft**: Show being set up, not visible to fantasy users
- **open**: Users can submit and modify picks
- **locked**: Admin locks the show before/when event starts - NO MORE PICK CHANGES
- **completed**: Match results recorded, points calculated

## Technical Specification

### Data Model: FantasyUsers Table

**Table Name**: `wwe-2k-league-api-fantasy-users-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `fantasyUserId` (PK) | String | UUID, also Cognito sub |
| `username` | String | Display name |
| `email` | String | User's email |
| `totalPoints` | Number | All-time points |
| `currentSeasonPoints` | Number | Points in current season |
| `perfectPicks` | Number | Count of shows with all winners |
| `currentStreak` | Number | Consecutive shows with at least 1 winner |
| `bestStreak` | Number | Highest streak achieved |
| `createdAt` | String | ISO timestamp |
| `updatedAt` | String | ISO timestamp |

**GSI: SeasonPointsIndex**
- Partition Key: Constant value `"FANTASY_USER"`
- Sort Key: `currentSeasonPoints` (descending)
- Purpose: Get leaderboard sorted by points

### Data Model: Shows Table

**Table Name**: `wwe-2k-league-api-shows-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `showId` (PK) | String | UUID |
| `seasonId` | String | Links to season |
| `name` | String | e.g., "Week 5" or "WrestleMania Night" |
| `date` | String | ISO date of the show |
| `status` | String | `draft` / `open` / `locked` / `completed` |
| `picksPerDivision` | Number | How many wrestlers to pick per division |
| `budget` | Number | Total budget for picks |
| `matchIds` | List<String> | Matches included in this show |
| `createdAt` | String | ISO timestamp |
| `updatedAt` | String | ISO timestamp |

**GSI: SeasonShowsIndex**
- Partition Key: `seasonId`
- Sort Key: `date`
- Purpose: Get all shows for a season in order

### Data Model: FantasyPicks Table

**Table Name**: `wwe-2k-league-api-fantasy-picks-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `showId` (PK) | String | The show |
| `fantasyUserId` (SK) | String | The user making picks |
| `picks` | Map | `{ divisionId: [playerId, playerId, ...] }` |
| `totalSpent` | Number | Total cost of picks |
| `pointsEarned` | Number | Points earned (after show completes) |
| `breakdown` | Map | `{ playerId: { points, reason } }` |
| `createdAt` | String | ISO timestamp |
| `updatedAt` | String | ISO timestamp |

**GSI: UserPicksIndex**
- Partition Key: `fantasyUserId`
- Sort Key: `showId`
- Purpose: Get all picks for a user across shows

### Data Model: WrestlerCosts Table

**Table Name**: `wwe-2k-league-api-wrestler-costs-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `playerId` (PK) | String | The wrestler |
| `currentCost` | Number | Current pick cost |
| `baseCost` | Number | Starting cost (default 100) |
| `costHistory` | List | `[{ date, cost, reason }]` |
| `winRate30Days` | Number | Win percentage last 30 days |
| `updatedAt` | String | ISO timestamp |

### Data Model: FantasyConfig Table

**Table Name**: `wwe-2k-league-api-fantasy-config-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `configKey` (PK) | String | `"GLOBAL"` or seasonId |
| `defaultBudget` | Number | Default budget per show |
| `defaultPicksPerDivision` | Number | Default picks per division |
| `baseWinPoints` | Number | Points for a win |
| `championshipBonus` | Number | Extra points for title match |
| `titleWinBonus` | Number | Extra points for winning title |
| `costFluctuationEnabled` | Boolean | Whether costs change |
| `costChangePerWin` | Number | How much cost increases on win |
| `costChangePerLoss` | Number | How much cost decreases on loss |
| `costResetStrategy` | String | `reset` / `carry_over` / `partial` (default: reset) |
| `underdogMultiplier` | Number | Multiplier for underdog wins |
| `perfectPickBonus` | Number | Bonus for all correct picks |
| `streakBonusThreshold` | Number | Wins needed for streak bonus |
| `streakBonusPoints` | Number | Extra points for streak |

### TypeScript Interfaces

```typescript
// Fantasy User
export interface FantasyUser {
  fantasyUserId: string;
  username: string;
  email: string;
  totalPoints: number;
  currentSeasonPoints: number;
  perfectPicks: number;
  currentStreak: number;
  bestStreak: number;
  createdAt: string;
  updatedAt: string;
}

// Show
export interface Show {
  showId: string;
  seasonId: string;
  name: string;
  date: string;
  status: 'draft' | 'open' | 'locked' | 'completed';
  picksPerDivision: number;
  budget: number;
  matchIds: string[];
  createdAt: string;
  updatedAt: string;
}

// Fantasy Picks
export interface FantasyPicks {
  showId: string;
  fantasyUserId: string;
  picks: Record<string, string[]>; // divisionId -> playerIds
  totalSpent: number;
  pointsEarned?: number;
  breakdown?: Record<string, PointBreakdown>;
  createdAt: string;
  updatedAt: string;
}

export interface PointBreakdown {
  points: number;
  basePoints: number;
  multipliers: string[];
  matchId?: string;
  reason: string;
}

// Wrestler Cost
export interface WrestlerCost {
  playerId: string;
  currentCost: number;
  baseCost: number;
  costHistory: CostChange[];
  winRate30Days: number;
  updatedAt: string;
}

export interface CostChange {
  date: string;
  cost: number;
  reason: string;
}

// Fantasy Configuration
export interface FantasyConfig {
  configKey: string;
  defaultBudget: number;
  defaultPicksPerDivision: number;
  baseWinPoints: number;
  championshipBonus: number;
  titleWinBonus: number;
  costFluctuationEnabled: boolean;
  costChangePerWin: number;
  costChangePerLoss: number;
  costResetStrategy: 'reset' | 'carry_over' | 'partial';
  underdogMultiplier: number;
  perfectPickBonus: number;
  streakBonusThreshold: number;
  streakBonusPoints: number;
}

// Fantasy Leaderboard Entry
export interface FantasyLeaderboardEntry {
  rank: number;
  fantasyUserId: string;
  username: string;
  totalPoints: number;
  currentSeasonPoints: number;
  perfectPicks: number;
  currentStreak: number;
}
```

### API Endpoints

#### Public Endpoints (No Auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fantasy/leaderboard` | Get fantasy user standings (optional `?seasonId=`) |
| GET | `/fantasy/shows` | Get shows for current/specified season |
| GET | `/fantasy/shows/{showId}` | Get show details including matches |
| GET | `/fantasy/wrestlers/costs` | Get current wrestler costs |

#### Fantasy User Endpoints (Fantasy Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/fantasy/auth/signup` | Create fantasy user account |
| POST | `/fantasy/auth/login` | Login as fantasy user |
| GET | `/fantasy/me` | Get current user profile |
| PUT | `/fantasy/me` | Update display name |
| GET | `/fantasy/me/picks` | Get all my picks |
| GET | `/fantasy/me/picks/{showId}` | Get my picks for a show |
| POST | `/fantasy/picks/{showId}` | Submit/update picks for open show |
| DELETE | `/fantasy/picks/{showId}` | Clear picks for open show |

#### Admin Endpoints (Admin Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/fantasy/shows` | Create a new show |
| PUT | `/admin/fantasy/shows/{showId}` | Update show (add matches, change settings) |
| PUT | `/admin/fantasy/shows/{showId}/lock` | Lock show (no more picks) |
| PUT | `/admin/fantasy/shows/{showId}/unlock` | Unlock show |
| PUT | `/admin/fantasy/shows/{showId}/complete` | Complete show & calculate points |
| DELETE | `/admin/fantasy/shows/{showId}` | Delete show |
| GET | `/admin/fantasy/config` | Get fantasy configuration |
| PUT | `/admin/fantasy/config` | Update fantasy configuration |
| POST | `/admin/fantasy/wrestlers/costs/recalculate` | Recalculate all wrestler costs |
| PUT | `/admin/fantasy/wrestlers/{playerId}/cost` | Manual cost override |

### Point Calculation Logic

```typescript
function calculatePointsForPick(
  playerId: string,
  match: Match,
  config: FantasyConfig,
  wrestlerCosts: Map<string, number>
): PointBreakdown {
  const breakdown: PointBreakdown = {
    points: 0,
    basePoints: 0,
    multipliers: [],
    matchId: match.matchId,
    reason: ''
  };

  // Check if wrestler participated
  if (!match.participants.includes(playerId)) {
    breakdown.reason = 'Did not compete';
    return breakdown;
  }

  // Check if wrestler won
  const isWinner = match.winners?.includes(playerId);
  if (!isWinner) {
    breakdown.reason = 'Lost match';
    return breakdown;
  }

  // Base points with multi-man multiplier
  const participantCount = match.participants.length;
  const multiManMultiplier = participantCount - 1;
  breakdown.basePoints = config.baseWinPoints * multiManMultiplier;
  breakdown.points = breakdown.basePoints;
  breakdown.multipliers.push(`${participantCount}-person match (${multiManMultiplier}x)`);

  // Championship match bonus
  if (match.isChampionship) {
    breakdown.points += config.championshipBonus;
    breakdown.multipliers.push(`Championship match (+${config.championshipBonus})`);
  }

  // Title win bonus (champion changed)
  if (match.isChampionship && isWinner) {
    breakdown.points += config.titleWinBonus;
    breakdown.multipliers.push(`Won championship (+${config.titleWinBonus})`);
  }

  // Underdog bonus
  const pickedCost = wrestlerCosts.get(playerId) || 100;
  const opponentCosts = match.losers?.map(id => wrestlerCosts.get(id) || 100) || [];
  const avgOpponentCost = opponentCosts.reduce((a, b) => a + b, 0) / opponentCosts.length;
  if (pickedCost < avgOpponentCost * 0.8) { // 20% cheaper = underdog
    const underdogBonus = Math.floor(breakdown.points * (config.underdogMultiplier - 1));
    breakdown.points += underdogBonus;
    breakdown.multipliers.push(`Underdog win (+${underdogBonus})`);
  }

  breakdown.reason = 'Won match';
  return breakdown;
}
```

### Cost Fluctuation Algorithm

```typescript
function calculateNewCost(
  currentCost: number,
  baseCost: number,
  recentMatches: Match[],
  playerId: string,
  config: FantasyConfig
): number {
  if (!config.costFluctuationEnabled) return currentCost;

  const wins = recentMatches.filter(m => m.winners?.includes(playerId)).length;
  const losses = recentMatches.filter(m => m.losers?.includes(playerId)).length;

  let newCost = currentCost;

  // Increase for wins
  newCost += wins * config.costChangePerWin;

  // Decrease for losses
  newCost -= losses * config.costChangePerLoss;

  // Clamp between 50% and 200% of base cost
  const minCost = Math.floor(baseCost * 0.5);
  const maxCost = Math.floor(baseCost * 2);
  newCost = Math.max(minCost, Math.min(maxCost, newCost));

  return newCost;
}
```

## Frontend Components

### New Pages

1. **Fantasy Landing Page** (`/fantasy`)
   - Overview of fantasy system
   - Current show status
   - Quick leaderboard preview
   - Login/signup prompts for non-authenticated

2. **Fantasy Signup/Login** (`/fantasy/login`)
   - Separate from admin login
   - Email + password signup
   - Username selection

3. **Fantasy Dashboard** (`/fantasy/dashboard`) - Fantasy Auth
   - User's current picks
   - Points earned this season
   - Upcoming shows
   - Recent results

4. **Make Picks Page** (`/fantasy/picks/{showId}`) - Fantasy Auth
   - Show info and deadline
   - Division-by-division wrestler selection
   - Budget tracker
   - Lock pick selector
   - Submit/clear buttons

5. **Fantasy Leaderboard** (`/fantasy/leaderboard`)
   - Ranked list of fantasy users
   - Season selector
   - Points breakdown on hover

6. **Wrestler Costs Page** (`/fantasy/costs`)
   - All wrestlers with current costs
   - Cost trend indicators
   - Recent performance stats

7. **Show Results Page** (`/fantasy/shows/{showId}/results`)
   - All matches from the show
   - Points awarded per pick
   - Leaderboard changes

### Admin Components

1. **Manage Shows** (Admin Panel Tab)
   - Create/edit shows
   - Assign matches to shows
   - Lock/unlock/complete shows
   - View all user picks (after lock)

2. **Fantasy Configuration** (Admin Panel Tab)
   - Global settings
   - Point values
   - Cost fluctuation settings
   - Budget defaults

### Component Hierarchy

```
/fantasy
  FantasyLanding.tsx
  FantasyLogin.tsx
  FantasySignup.tsx
  /dashboard
    FantasyDashboard.tsx
    CurrentPicks.tsx
    UpcomingShows.tsx
    RecentResults.tsx
  /picks
    MakePicks.tsx
    DivisionPicker.tsx
    WrestlerCard.tsx (with cost)
    BudgetTracker.tsx
  /leaderboard
    FantasyLeaderboard.tsx
    LeaderboardEntry.tsx
  /shows
    ShowResults.tsx
    MatchResult.tsx
    PointsBreakdown.tsx
  /costs
    WrestlerCosts.tsx
    CostTrend.tsx

/admin
  ManageShows.tsx
  ShowForm.tsx
  AssignMatches.tsx
  ViewPicks.tsx
  FantasyConfig.tsx
```

### UI Mockup - Make Picks Page

```
+------------------------------------------------------------------+
|  MAKE YOUR PICKS - Week 5                                         |
|  Deadline: Feb 8, 2026 at 7:00 PM                    STATUS: OPEN |
+------------------------------------------------------------------+
|  Budget: $500    |    Spent: $340    |    Remaining: $160        |
|  [====================                    ] 68%                   |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|  RAW DIVISION (Pick 2)                              Selected: 2/2 |
+------------------------------------------------------------------+
|  [x] Stone Cold ($120)    [ ] The Rock ($110)    [ ] Triple H ($95)|
|      5-1 recent           4-2 recent              3-3 recent      |
|                                                                    |
|  [x] Undertaker ($105)    [ ] Shawn Michaels ($85)                |
|      4-2 recent           2-4 recent                              |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|  SMACKDOWN DIVISION (Pick 2)                        Selected: 1/2 |
+------------------------------------------------------------------+
|  [x] CM Punk ($115)       [ ] John Cena ($130)   [ ] Edge ($90)   |
|      5-1 recent           OVER BUDGET             3-3 recent      |
+------------------------------------------------------------------+

|  [Clear All Picks]                    [Submit Picks]              |
+------------------------------------------------------------------+
```

### UI Mockup - Fantasy Leaderboard

```
+------------------------------------------------------------------+
|  FANTASY LEADERBOARD                     Season: [Season 2 v]     |
+------------------------------------------------------------------+
|  Rank | Player          | Points | Perfect | Streak | This Week  |
+------------------------------------------------------------------+
|   1   | FantasyKing23   |  1,245 |    3    |   5    |   +125     |
|   2   | WrestleFan99    |  1,180 |    2    |   3    |   +95      |
|   3   | ChampPicker     |  1,095 |    1    |   0    |   +80      |
|   4   | TitleHunter     |  1,020 |    2    |   2    |   +110     |
|   5   | UnderDogLover   |    985 |    0    |   4    |   +150     |
+------------------------------------------------------------------+
|  Showing 1-5 of 28 participants          [Previous] [Next]        |
+------------------------------------------------------------------+
```

## Implementation Phases

### PHASE 0: UI Prototypes with Fake Data
**Prerequisites**: None
**Estimated Complexity**: Medium

This phase creates all UI components with hardcoded data so stakeholders can see the look and flow before backend work begins.

#### Steps:

1. Create fantasy types file with interfaces
   - File: `frontend/src/types/fantasy.ts`
   - Details: All TypeScript interfaces for fantasy feature
   - Validation: TypeScript compiles without errors

2. Create mock data file
   - File: `frontend/src/mocks/fantasyMockData.ts`
   - Details: Hardcoded shows, picks, leaderboard, wrestler costs
   - Validation: Data matches interface shapes

3. Create FantasyLanding page component
   - File: `frontend/src/components/fantasy/FantasyLanding.tsx`
   - Details: Overview page with system explanation, CTAs
   - Validation: Renders correctly, links work

4. Create FantasyLogin and FantasySignup components
   - Files: `FantasyLogin.tsx`, `FantasySignup.tsx`
   - Details: Forms with validation, styled consistently
   - Validation: Form validation works, matches design

5. Create FantasyDashboard component
   - File: `frontend/src/components/fantasy/FantasyDashboard.tsx`
   - Details: User's home showing picks, points, upcoming shows
   - Validation: All sections render with mock data

6. Create MakePicks page and subcomponents
   - Files: `MakePicks.tsx`, `DivisionPicker.tsx`, `WrestlerCard.tsx`, `BudgetTracker.tsx`
   - Details: Full pick flow with division tabs, budget tracking
   - Validation: Can "select" wrestlers, budget updates

7. Create FantasyLeaderboard component
   - File: `frontend/src/components/fantasy/FantasyLeaderboard.tsx`
   - Details: Sorted table with pagination
   - Validation: Renders leaderboard, season filter works

8. Create WrestlerCosts page
   - File: `frontend/src/components/fantasy/WrestlerCosts.tsx`
   - Details: Table of all wrestlers with costs and trends
   - Validation: Cost data displays, trend indicators show

9. Create ShowResults page
   - File: `frontend/src/components/fantasy/ShowResults.tsx`
   - Details: Post-show view with points breakdown
   - Validation: Match results and points display correctly

10. Create Admin ManageShows component
    - File: `frontend/src/components/admin/ManageFantasyShows.tsx`
    - Details: CRUD interface for shows
    - Validation: Can view/create/edit shows (mock)

11. Create Admin FantasyConfig component
    - File: `frontend/src/components/admin/FantasyConfig.tsx`
    - Details: Configuration form for all fantasy settings
    - Validation: Form renders, values editable

12. Add routing for all fantasy pages
    - File: Update `App.tsx`
    - Details: Add routes for `/fantasy/*` paths
    - Validation: All routes accessible, navigation works

13. Create CSS files for all components
    - Files: `Fantasy*.css` for each component
    - Details: Dark theme, gold accents, responsive
    - Validation: Consistent with existing app styling

14. Add i18n strings for fantasy feature
    - Files: Update `en.json`, `de.json`
    - Details: All user-facing text translatable
    - Validation: Language switch works

#### Testing Criteria:
- All pages render without errors
- Navigation between pages works
- Mock data displays correctly
- Responsive on mobile devices
- Consistent styling with existing app

---

### PHASE 1: Fantasy User Authentication
**Prerequisites**: Phase 0
**Estimated Complexity**: High

#### Steps:

1. Create separate Cognito User Pool for fantasy users
   - File: Update `backend/serverless.yml`
   - Details: New user pool with email signup, separate from admin pool
   - Validation: User pool created in CloudFormation output

2. Create fantasy user authorizer Lambda
   - File: `backend/functions/fantasy/auth/fantasyAuthorizer.ts`
   - Details: Validates fantasy user JWT tokens
   - Validation: Returns allow/deny policies correctly

3. Create fantasy signup Lambda
   - File: `backend/functions/fantasy/auth/signup.ts`
   - Details: Creates Cognito user + DynamoDB record
   - Validation: User created in both systems

4. Create fantasy login Lambda
   - File: `backend/functions/fantasy/auth/login.ts`
   - Details: Authenticates and returns tokens
   - Validation: Valid credentials return tokens

5. Create FantasyUsers DynamoDB table
   - File: Update `backend/serverless.yml`
   - Details: Table with GSI for leaderboard
   - Validation: Table created, GSI works

6. Create fantasy user profile Lambda (get/update)
   - Files: `getFantasyProfile.ts`, `updateFantasyProfile.ts`
   - Details: CRUD for fantasy user data
   - Validation: Profile retrieval/update works

7. Create frontend fantasy auth service
   - File: `frontend/src/services/fantasyAuth.ts`
   - Details: Signup, login, logout, token management
   - Validation: Auth flow works end-to-end

8. Update FantasyLogin/Signup to use real auth
   - Details: Connect to actual Cognito
   - Validation: Can create account and login

9. Create fantasy auth context/hook
   - File: `frontend/src/contexts/FantasyAuthContext.tsx`
   - Details: Provides auth state to fantasy components
   - Validation: Auth state persists, logout works

#### Interfaces:
```typescript
// Signup
POST /fantasy/auth/signup
Body: { email: string; password: string; username: string }
Response: { fantasyUserId: string; message: string }

// Login
POST /fantasy/auth/login
Body: { email: string; password: string }
Response: { accessToken: string; idToken: string; refreshToken: string }
```

#### Testing Criteria:
- Can create new fantasy account
- Can login with credentials
- Token stored and used for API calls
- Logout clears session
- Invalid credentials rejected

---

### PHASE 2: Shows & Configuration Backend
**Prerequisites**: Phase 1
**Estimated Complexity**: Medium

#### Steps:

1. Create Shows DynamoDB table
   - File: Update `backend/serverless.yml`
   - Details: Table with SeasonShowsIndex GSI
   - Validation: Table created correctly

2. Create FantasyConfig DynamoDB table
   - File: Update `backend/serverless.yml`
   - Details: Simple key-value config table
   - Validation: Table created

3. Create show CRUD Lambdas
   - Files: `createShow.ts`, `getShows.ts`, `getShow.ts`, `updateShow.ts`, `deleteShow.ts`
   - Details: Admin endpoints for show management
   - Validation: All CRUD operations work

4. Create show lock/unlock Lambdas
   - Files: `lockShow.ts`, `unlockShow.ts`
   - Details: Changes show status, validates timing
   - Validation: Status changes correctly

5. Create fantasy config Lambdas
   - Files: `getConfig.ts`, `updateConfig.ts`
   - Details: Get/set global and per-season config
   - Validation: Config persists correctly

6. Create API routes for shows (admin)
   - File: Update `backend/serverless.yml`
   - Details: Routes with admin authorizer
   - Validation: Endpoints accessible to admins only

7. Create API routes for shows (public)
   - File: Update `backend/serverless.yml`
   - Details: Public read endpoints for shows
   - Validation: Anyone can view show list

8. Add shows API to frontend service
   - File: Update `frontend/src/services/api.ts`
   - Details: showsApi object with all methods
   - Validation: Can fetch shows from frontend

9. Connect ManageShows admin component to API
   - Details: Replace mock data with real API calls
   - Validation: Admin can manage shows

#### Interfaces:
```typescript
// Create Show
POST /admin/fantasy/shows
Body: { seasonId: string; name: string; date: string; picksPerDivision: number; budget: number }
Response: Show

// Lock Show
PUT /admin/fantasy/shows/{showId}/lock
Response: { message: string; show: Show }
```

#### Testing Criteria:
- Shows created with correct attributes
- Shows link to correct season
- Lock/unlock changes status
- Config persists across requests

---

### PHASE 3: Wrestler Costs System
**Prerequisites**: Phase 2
**Estimated Complexity**: Medium

#### Steps:

1. Create WrestlerCosts DynamoDB table
   - File: Update `backend/serverless.yml`
   - Details: Simple PK table for costs
   - Validation: Table created

2. Create initialize costs Lambda (admin)
   - File: `initializeWrestlerCosts.ts`
   - Details: Sets base cost for all wrestlers
   - Validation: All wrestlers have cost entry

3. Create get wrestler costs Lambda (public)
   - File: `getWrestlerCosts.ts`
   - Details: Returns all wrestler costs with player info
   - Validation: Costs returned with names

4. Create recalculate costs Lambda (admin)
   - File: `recalculateWrestlerCosts.ts`
   - Details: Updates costs based on recent performance
   - Validation: Costs change based on algorithm

5. Create manual cost override Lambda (admin)
   - File: `updateWrestlerCost.ts`
   - Details: Admin can set specific cost
   - Validation: Override persists

6. Add cost routes to serverless config
   - File: Update `backend/serverless.yml`
   - Details: Public and admin routes
   - Validation: Routes work

7. Add costs API to frontend service
   - File: Update `frontend/src/services/api.ts`
   - Details: wrestlerCostsApi object
   - Validation: Costs fetchable

8. Connect WrestlerCosts page to API
   - Details: Replace mock data with real costs
   - Validation: Costs display correctly

9. Integrate costs into MakePicks page
   - Details: Show real costs when picking
   - Validation: Budget calculation uses real costs

#### Testing Criteria:
- All wrestlers have a cost
- Cost recalculation changes values
- Admin can override costs
- Frontend shows correct costs

---

### PHASE 4: Fantasy Picks System
**Prerequisites**: Phase 3
**Estimated Complexity**: High

#### Steps:

1. Create FantasyPicks DynamoDB table
   - File: Update `backend/serverless.yml`
   - Details: Composite key with UserPicksIndex GSI
   - Validation: Table created

2. Create submit picks Lambda
   - File: `submitPicks.ts`
   - Details: Validates budget, divisions, show status
   - Validation: Valid picks saved, invalid rejected

3. Create get user picks Lambda
   - File: `getUserPicks.ts`
   - Details: Returns user's picks for a show
   - Validation: Correct picks returned

4. Create get all user picks Lambda
   - File: `getAllUserPicks.ts`
   - Details: Returns all picks across shows
   - Validation: Pagination works

5. Create clear picks Lambda
   - File: `clearPicks.ts`
   - Details: Removes picks for open show
   - Validation: Picks deleted

6. Add picks validation logic
   - File: `backend/lib/picksValidator.ts`
   - Details: Budget check, division requirements, deadline
   - Validation: All validation rules enforced

7. Add picks routes to serverless config
   - File: Update `backend/serverless.yml`
   - Details: Fantasy-auth protected routes
   - Validation: Only authenticated users can submit

8. Add picks API to frontend service
   - File: Update `frontend/src/services/api.ts`
   - Details: picksApi object
   - Validation: Can submit/get/clear picks

9. Connect MakePicks page to API
   - Details: Real submission flow
   - Validation: End-to-end pick submission works

10. Connect FantasyDashboard to show user's picks
    - Details: Display current and historical picks
    - Validation: Picks display correctly

#### Interfaces:
```typescript
// Submit Picks
POST /fantasy/picks/{showId}
Body: { picks: Record<string, string[]> }
Response: FantasyPicks

// Validation Errors
400: { message: string; errors: { budget?: string; divisions?: Record<string, string> } }
```

#### Testing Criteria:
- Can submit valid picks
- Over-budget rejected
- Wrong division count rejected
- Picks for locked show rejected
- Can update picks while show is open

---

### PHASE 5: Points Calculation & Show Completion
**Prerequisites**: Phase 4
**Estimated Complexity**: High

#### Steps:

1. Create points calculation service
   - File: `backend/lib/pointsCalculator.ts`
   - Details: Full algorithm implementation
   - Validation: Unit tests pass

2. Create complete show Lambda
   - File: `completeShow.ts`
   - Details: Calculates points for all picks, updates users
   - Validation: All picks scored, users updated

3. Add transaction support for point updates
   - Details: Atomic updates to picks and user totals
   - Validation: No partial updates on failure

4. Update match result hook
   - File: Modify `recordResult.ts`
   - Details: No auto-complete, but track matches in shows
   - Validation: Matches linked to shows correctly

5. Create show results Lambda
   - File: `getShowResults.ts`
   - Details: Returns all scored picks with breakdowns
   - Validation: Full results returned

6. Add streak and bonus calculations
   - Details: Perfect pick bonus, streak tracking
   - Validation: Bonuses applied correctly

7. Add show completion routes
   - File: Update `backend/serverless.yml`
   - Details: Admin route for completing shows
   - Validation: Only admins can complete

8. Connect ShowResults page to API
   - Details: Display real results after completion
   - Validation: Results display correctly

9. Update FantasyDashboard with real points
   - Details: Show actual earned points
   - Validation: Points match calculated values

10. Add results to leaderboard calculation
    - Details: Refresh leaderboard after show completion
    - Validation: Leaderboard reflects new points

#### Testing Criteria:
- Points calculated correctly for all match types
- Multi-man multiplier works
- Championship bonuses applied
- Lock pick doubles correctly
- Underdog bonus calculated
- Perfect pick bonus awarded
- Streaks tracked correctly

---

### PHASE 6: Fantasy Leaderboard Backend
**Prerequisites**: Phase 5
**Estimated Complexity**: Low

#### Steps:

1. Create get leaderboard Lambda
   - File: `getFantasyLeaderboard.ts`
   - Details: Returns ranked users with stats
   - Validation: Correct ordering, pagination

2. Add season filtering to leaderboard
   - Details: Filter by seasonId query param
   - Validation: Season-specific rankings work

3. Create leaderboard refresh Lambda
   - File: `refreshLeaderboard.ts`
   - Details: Recalculates rankings (for consistency)
   - Validation: Rankings accurate

4. Add leaderboard routes
   - File: Update `backend/serverless.yml`
   - Details: Public endpoint for leaderboard
   - Validation: Anyone can view

5. Add leaderboard API to frontend
   - File: Update `frontend/src/services/api.ts`
   - Details: leaderboardApi object
   - Validation: Leaderboard fetchable

6. Connect FantasyLeaderboard page to API
   - Details: Replace mock data with real rankings
   - Validation: Real leaderboard displays

#### Testing Criteria:
- Leaderboard sorted by points descending
- Season filter works
- Pagination works
- Stats accurate (perfect picks, streak)

---

### PHASE 7: Frontend Polish & Integration
**Prerequisites**: Phase 6
**Estimated Complexity**: Medium

#### Steps:

1. Add fantasy nav link to main header
   - File: Update `App.tsx`
   - Details: Link to /fantasy in nav
   - Validation: Navigation works

2. Add fantasy user indicator in header
   - Details: Show logged in fantasy user name
   - Validation: Name displays when logged in

3. Add loading states to all fantasy components
   - Details: Consistent loading spinners
   - Validation: No flash of empty content

4. Add error handling to all fantasy components
   - Details: Error boundaries, retry buttons
   - Validation: Errors handled gracefully

5. Add success/error notifications
   - Details: Toast or inline messages
   - Validation: Feedback on actions

6. Mobile responsive adjustments
   - Details: Stack layouts, touch-friendly
   - Validation: Usable on mobile devices

7. Add show countdown timer
   - Details: Live countdown to lock deadline
   - Validation: Timer accurate

8. Add wrestler search/filter in MakePicks
   - Details: Search by name, filter by cost range
   - Validation: Filtering works

9. Add comparison view for picks
   - Details: Compare your picks to friends
   - Validation: Comparison displays

10. Final i18n review
    - Details: Ensure all strings translated
    - Validation: German translation complete

#### Testing Criteria:
- All pages mobile responsive
- Loading states display
- Errors handled gracefully
- Notifications provide feedback
- Search and filter work

---

### PHASE 8: Admin Features & Monitoring
**Prerequisites**: Phase 7
**Estimated Complexity**: Low

#### Steps:

1. Add fantasy tab to AdminPanel
   - File: Update `AdminPanel.tsx`
   - Details: Tab for fantasy management
   - Validation: Tab accessible

2. Create admin picks viewer
   - Details: View all users' picks for a show
   - Validation: Can see all picks after lock

3. Add fantasy activity logs
   - Details: Track signups, picks, completions
   - Validation: Logs viewable

4. Create fantasy stats dashboard for admin
   - Details: Total users, picks per show, etc.
   - Validation: Stats accurate

5. Add ability to void/adjust picks (edge cases)
   - Details: Admin can modify picks if needed
   - Validation: Adjustments apply

6. Documentation for fantasy feature
   - File: Update `README.md` and `CLAUDE.md`
   - Details: Document all fantasy endpoints and flows
   - Validation: Documentation complete

#### Testing Criteria:
- Admin can view all picks
- Admin can manage shows
- Stats accurate
- Documentation covers feature

## Cognito Configuration for Fantasy Users

### Separate User Pool Rationale

Fantasy users should have their own Cognito User Pool because:
1. Different registration flow (email signup vs admin-created)
2. Different security requirements
3. Separate token validation
4. Can be disabled independently

### User Pool Configuration

```yaml
FantasyUserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: ${self:service}-fantasy-users-${self:provider.stage}
    AutoVerifiedAttributes:
      - email
    UsernameAttributes:
      - email
    Policies:
      PasswordPolicy:
        MinimumLength: 8
        RequireLowercase: true
        RequireNumbers: true
        RequireSymbols: false
        RequireUppercase: true
    Schema:
      - Name: username
        AttributeDataType: String
        Mutable: true
        Required: false

FantasyUserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    ClientName: ${self:service}-fantasy-client-${self:provider.stage}
    UserPoolId: !Ref FantasyUserPool
    GenerateSecret: false
    ExplicitAuthFlows:
      - ALLOW_USER_PASSWORD_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
      - ALLOW_USER_SRP_AUTH
    PreventUserExistenceErrors: ENABLED
    AccessTokenValidity: 24
    IdTokenValidity: 24
    RefreshTokenValidity: 30
    TokenValidityUnits:
      AccessToken: hours
      IdToken: hours
      RefreshToken: days
```

## Technology Recommendations

### Real-Time Updates (Future Enhancement)

Consider WebSocket support for:
- Live points as matches complete
- Real-time leaderboard changes
- Pick deadline warnings

**Recommendation**: AWS API Gateway WebSocket API with DynamoDB Streams trigger.

### Caching Strategy

- Wrestler costs: 5-minute cache (CloudFront or in-memory)
- Leaderboard: 1-minute cache
- Show details: 30-second cache

### Analytics (Future Enhancement)

Track:
- Most picked wrestlers
- Underdog success rate
- Pick patterns (early vs last-minute)
- User retention

**Recommendation**: EventBridge + CloudWatch or third-party analytics.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cognito complexity for two pools | Medium | Clear separation in code, separate auth services |
| Budget calculation race conditions | Medium | Server-side validation always |
| Points calculation errors | High | Comprehensive unit tests, admin override capability |
| Show lock timing disputes | Medium | Clear countdown UI, grace period option |
| User frustration with costs | Medium | Transparent cost algorithm explanation |
| Database hot partitions | Low | Use randomized partition keys if needed |

## Design Decisions

These decisions were finalized during feature planning:

1. **Pick Editing Window**: Users can edit picks **anytime until admin locks the show**. No soft deadline.

2. **Show Assignment**: Fantasy shows **integrate with the Events/PPV feature**. Matches are assigned to events there, and fantasy picks are tied to those events. See [feature_events_ppv.md](feature_events_ppv.md).

3. **Cost Reset**: Default behavior is to **reset costs each season**, but this is **admin configurable** with options for: full reset, carry over, or partial reset (move 50% toward base).

4. **Division Requirement**: `picksPerDivision` is a **maximum, not a requirement**. Users can pick up to that many from each division. Budget naturally limits total picks.

5. **Tag Team Handling**: **Pick individuals**. If a tag team wins, any picked member of that team earns points.

6. **Tie Breakers**: **Show as tied**. Users with the same points share the same rank on the leaderboard.

7. **Guest Picks**: **Future feature**. Registration required for initial release.

8. **Social Features**: **Picks hidden until show completes**, then all picks become visible. No private leagues initially.

9. **Notifications**: **No email notifications**. Users check the app manually.

10. **Historical Data**: Retain data from the **last 3 seasons**. Older data is archived/deleted.

## Estimated Total Effort

| Phase | Effort |
|-------|--------|
| Phase 0 (UI Prototypes) | 8-10 hours |
| Phase 1 (Fantasy Auth) | 10-12 hours |
| Phase 2 (Shows & Config) | 6-8 hours |
| Phase 3 (Wrestler Costs) | 5-6 hours |
| Phase 4 (Picks System) | 8-10 hours |
| Phase 5 (Points Calculation) | 10-12 hours |
| Phase 6 (Leaderboard) | 3-4 hours |
| Phase 7 (Frontend Polish) | 6-8 hours |
| Phase 8 (Admin & Monitoring) | 4-5 hours |
| **Total** | **60-75 hours** |

## Success Metrics

1. **Adoption**: 10+ active fantasy users within first season
2. **Engagement**: 80%+ of users submit picks before deadline
3. **Retention**: 70%+ of users participate in consecutive shows
4. **Satisfaction**: Positive feedback on point system fairness
