# Feature: #1 Contender Rankings

## Executive Summary

A championship contender tracking system that automatically calculates and displays ranked contenders for each title based on recent performance, win streaks, and head-to-head records. This feature brings the drama of title contention to the league, giving players clear paths to championship opportunities and admins data-driven booking suggestions.

## Problem Statement

Currently, there is no systematic way to determine who deserves a championship opportunity. Admins must manually decide challengers without objective criteria, and players have no visibility into their standing relative to title shots. Professional wrestling leagues use ranking systems (like AEW's rankings) to create transparent pathways to championships and build storylines around the climb to contention.

## Goals

1. Automatically calculate contender rankings for each championship
2. Provide configurable ranking algorithms (win percentage, recent form, streaks)
3. Display clear "path to the title" for each player
4. Track #1 contender history and title shot opportunities
5. Help admins make data-driven booking decisions

## Non-Goals

1. Automatic championship match booking
2. Mandatory contender matches before title shots
3. Complex ELO or skill-based rating systems
4. Cross-division ranking comparisons

## Proposed Solution

### High-Level Architecture

```
+-------------------+       +-------------------+       +-------------------+
|   Match Result    |       |   Ranking         |       |   DynamoDB        |
|   Recorded        | ----> |   Calculation     | ----> |   Rankings &      |
|                   |       |   Lambda          |       |   History         |
+-------------------+       +-------------------+       +-------------------+
        |                           |
        v                           v
+-------------------+       +-------------------+
|   EventBridge     |       |   Rankings API    |
|   Trigger         |       |   Endpoints       |
+-------------------+       +-------------------+
```

### Ranking Algorithm

The ranking system uses a weighted point system based on:

1. **Base Points** (40%): Win percentage over last N matches
2. **Streak Bonus** (20%): Current win/loss streak multiplier
3. **Quality of Wins** (25%): Points based on defeated opponents' rankings
4. **Recency** (15%): More recent matches weighted higher

**Formula**:
```
Ranking Score = (WinPct * 0.4) + (StreakBonus * 0.2) + (QualityScore * 0.25) + (RecencyScore * 0.15)
```

### Contender Eligibility Rules

1. Must have played minimum 3 matches in current season (configurable)
2. Cannot be current champion of that title
3. For tag team titles, both partners must meet criteria
4. Players in same division as championship (if divisions enforced)

## Technical Specification

### Data Model: ContenderRankings Table

**Table Name**: `wwe-2k-league-api-contender-rankings-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `championshipId` (PK) | String | The championship being ranked for |
| `playerId` (SK) | String | The player/team being ranked |
| `rank` | Number | Current ranking position (1 = #1 contender) |
| `rankingScore` | Number | Calculated score (0-100) |
| `winPercentage` | Number | Win % in ranking period |
| `currentStreak` | Number | Positive for wins, negative for losses |
| `qualityScore` | Number | Quality of wins component |
| `recencyScore` | Number | Recency-weighted score |
| `matchesInPeriod` | Number | Matches played in ranking period |
| `winsInPeriod` | Number | Wins in ranking period |
| `previousRank` | Number | Last week's rank for movement display |
| `peakRank` | Number | Best rank achieved |
| `weeksAtTop` | Number | Weeks spent as #1 contender |
| `calculatedAt` | String | ISO timestamp of calculation |
| `updatedAt` | String | ISO timestamp |

**GSI: RankIndex**
- Partition Key: `championshipId`
- Sort Key: `rank`
- Purpose: Retrieve rankings in order

### Data Model: RankingHistory Table

**Table Name**: `wwe-2k-league-api-ranking-history-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `playerId` (PK) | String | The player |
| `weekKey` (SK) | String | `{championshipId}#{YYYY-WW}` format |
| `championshipId` | String | The championship |
| `rank` | Number | Rank for that week |
| `rankingScore` | Number | Score for that week |
| `movement` | Number | Change from previous week |
| `createdAt` | String | ISO timestamp |

**GSI: ChampionshipWeekIndex**
- Partition Key: `championshipId`
- Sort Key: `weekKey`
- Purpose: Get weekly rankings for a championship

### TypeScript Interfaces

```typescript
export interface ContenderRanking {
  championshipId: string;
  playerId: string;
  rank: number;
  rankingScore: number;
  winPercentage: number;
  currentStreak: number;
  qualityScore: number;
  recencyScore: number;
  matchesInPeriod: number;
  winsInPeriod: number;
  previousRank?: number;
  peakRank: number;
  weeksAtTop: number;
  calculatedAt: string;
  updatedAt: string;
}

export interface RankingMovement {
  playerId: string;
  currentRank: number;
  previousRank?: number;
  movement: number; // positive = moved up, negative = moved down
  isNew: boolean;
}

export interface ContenderConfig {
  championshipId: string;
  rankingPeriodDays: number; // default 30
  minimumMatches: number; // default 3
  maxContenders: number; // default 10
  includeDraws: boolean;
  divisionRestricted: boolean;
}
```

### API Endpoints

#### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/championships/{id}/contenders` | Get ranked contenders for a championship |
| GET | `/players/{id}/contender-status` | Get player's contender status for all titles |
| GET | `/contenders/movements` | Get this week's ranking movements |

#### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/contenders/recalculate` | Force recalculation of rankings |
| PUT | `/admin/contenders/config/{championshipId}` | Update ranking configuration |
| GET | `/admin/contenders/config` | Get all ranking configurations |

### Request/Response Examples

**Get Contenders**
```json
GET /championships/champ-uuid-123/contenders

Response:
{
  "championshipId": "champ-uuid-123",
  "championshipName": "WWE Championship",
  "currentChampion": {
    "playerId": "player-uuid-1",
    "name": "John"
  },
  "contenders": [
    {
      "rank": 1,
      "playerId": "player-uuid-2",
      "playerName": "Mike",
      "wrestlerName": "The Rock",
      "rankingScore": 87.5,
      "winPercentage": 80,
      "currentStreak": 5,
      "movement": 2,
      "isNew": false
    },
    {
      "rank": 2,
      "playerId": "player-uuid-3",
      "playerName": "Dave",
      "wrestlerName": "Stone Cold",
      "rankingScore": 82.3,
      "winPercentage": 75,
      "currentStreak": 3,
      "movement": -1,
      "isNew": false
    }
  ],
  "calculatedAt": "2026-02-04T12:00:00Z",
  "config": {
    "rankingPeriodDays": 30,
    "minimumMatches": 3
  }
}
```

**Player Contender Status**
```json
GET /players/player-uuid-2/contender-status

Response:
{
  "playerId": "player-uuid-2",
  "playerName": "Mike",
  "championships": [
    {
      "championshipId": "champ-uuid-123",
      "championshipName": "WWE Championship",
      "rank": 1,
      "rankingScore": 87.5,
      "isEligible": true,
      "matchesNeeded": 0,
      "pathToTitle": "Currently #1 contender"
    },
    {
      "championshipId": "champ-uuid-456",
      "championshipName": "Intercontinental",
      "rank": 5,
      "rankingScore": 65.2,
      "isEligible": true,
      "matchesNeeded": 0,
      "pathToTitle": "Win 3 more matches to reach top 3"
    }
  ]
}
```

## Frontend Components

### New Pages/Components

1. **ContenderRankings.tsx** (Public)
   - Championship selector tabs/dropdown
   - Ranked list with movement indicators
   - Current champion highlighted at top
   - Player stats popup on hover/click

2. **ContenderCard.tsx** (Reusable)
   - Rank number with movement arrow
   - Player image and name
   - Key stats (win %, streak)
   - "Path to title" mini-view

3. **MyContenderStatus.tsx** (Player Dashboard)
   - Shows player's ranking for each title
   - Progress bars toward contention
   - Historical ranking chart

4. **AdminContenderConfig.tsx** (Admin)
   - Configuration for each championship
   - Manual recalculation trigger
   - Preview algorithm changes

### UI Mockup (Text)

```
+--------------------------------------------------+
|  #1 CONTENDER RANKINGS                           |
+--------------------------------------------------+
|  [WWE Championship] [IC Title] [Tag Titles]      |
+--------------------------------------------------+
|                                                   |
|  CURRENT CHAMPION: JOHN (CM Punk)                |
|                                                   |
|  +--------------------------------------------+  |
|  | #1 | ^ (+2) | MIKE (The Rock)              |  |
|  |    | 87.5 pts | 80% win | 5 WIN STREAK     |  |
|  +--------------------------------------------+  |
|  | #2 | v (-1) | DAVE (Stone Cold)            |  |
|  |    | 82.3 pts | 75% win | 3 WIN STREAK     |  |
|  +--------------------------------------------+  |
|  | #3 | - (0)  | ALEX (Triple H)              |  |
|  |    | 78.9 pts | 70% win | 1 LOSS STREAK    |  |
|  +--------------------------------------------+  |
|  | #4 | NEW    | CHRIS (Undertaker)           |  |
|  |    | 75.0 pts | 66% win | 2 WIN STREAK     |  |
|  +--------------------------------------------+  |
|                                                   |
|  Last calculated: Feb 4, 2026 at 12:00 PM        |
+--------------------------------------------------+
```

### Integration Points

1. **Championships Page**: Add "View Contenders" button
2. **Standings Page**: Add contender rank column
3. **Match Recording**: Trigger ranking recalculation
4. **Admin Dashboard**: Contender overview widget

## Implementation Phases

### Phase 1: Core Data Model & Calculation
**Prerequisites**: None
**Estimated Complexity**: High

#### Steps:
1. Add ContenderRankings and RankingHistory tables to `serverless.yml`
   - Details: Define tables with GSIs, IAM permissions
   - Validation: Tables created successfully

2. Create ranking calculation service
   - Details: `lib/rankingCalculator.ts` with algorithm implementation
   - Validation: Unit tests pass with sample data

3. Implement `calculateRankings.ts` Lambda
   - Details: Triggered manually or by EventBridge, calculates all championships
   - Validation: Rankings calculated and stored correctly

4. Add match result hook for ranking triggers
   - Details: Modify `recordResult.ts` to trigger ranking update
   - Validation: Rankings update after match completion

#### Interfaces:
```typescript
interface RankingCalculationInput {
  championshipId: string;
  periodDays: number;
  minimumMatches: number;
}

interface RankingCalculationOutput {
  rankings: ContenderRanking[];
  calculatedAt: string;
}
```

#### Testing Criteria:
- Algorithm produces correct rankings for test scenarios
- Edge cases handled (ties, new players, champions)

---

### Phase 2: Public API Endpoints
**Prerequisites**: Phase 1
**Estimated Complexity**: Medium

#### Steps:
1. Implement `getContenders.ts` Lambda
   - Details: Returns ranked contenders for a championship
   - Validation: Returns correct data with player info

2. Implement `getPlayerContenderStatus.ts` Lambda
   - Details: Returns player's status for all championships
   - Validation: Correct eligibility and rank info

3. Implement `getRankingMovements.ts` Lambda
   - Details: Returns this period's movers and shakers
   - Validation: Movement calculations accurate

4. Add to API Gateway configuration
   - Details: Public routes, CORS configuration
   - Validation: Endpoints accessible

#### Testing Criteria:
- API returns correct ranking order
- Player enrichment works (names, images)

---

### Phase 3: Admin Configuration
**Prerequisites**: Phase 1
**Estimated Complexity**: Low

#### Steps:
1. Add ContenderConfig table or attributes
   - Details: Store per-championship configuration
   - Validation: Config persists correctly

2. Implement `updateContenderConfig.ts` Lambda
   - Details: Admin updates ranking parameters
   - Validation: Config changes apply

3. Implement `forceRecalculate.ts` Lambda
   - Details: Manual ranking recalculation trigger
   - Validation: Rankings recalculate immediately

4. Add default configs for existing championships
   - Details: Migration script for initial setup
   - Validation: All championships have config

#### Testing Criteria:
- Config changes affect future calculations
- Only admins can modify config

---

### Phase 4: EventBridge Automation
**Prerequisites**: Phase 1
**Estimated Complexity**: Medium

#### Steps:
1. Create EventBridge rule for daily recalculation
   - Details: Runs at midnight, triggers calculation Lambda
   - Validation: Rankings update daily automatically

2. Create EventBridge rule for match completion
   - Details: Event pattern for completed matches
   - Validation: Rankings update after match results

3. Implement debouncing for batch matches
   - Details: Wait for batch completion before recalculating
   - Validation: Single recalc for multiple matches

#### Testing Criteria:
- Scheduled recalculation runs reliably
- Event-driven updates work correctly

---

### Phase 5: Frontend - Public Views
**Prerequisites**: Phase 2
**Estimated Complexity**: Medium

#### Steps:
1. Add contender types to frontend
   - Details: TypeScript interfaces in `types/index.ts`
   - Validation: Types compile correctly

2. Add contender API service functions
   - Details: Add to `services/api.ts`
   - Validation: Can fetch contender data

3. Create `ContenderRankings.tsx` component
   - Details: Full rankings page with championship tabs
   - Validation: Displays rankings correctly

4. Create `ContenderRankings.css` styles
   - Details: Movement arrows, rank badges, responsive
   - Validation: Visually appealing

5. Create `ContenderCard.tsx` reusable component
   - Details: Used in rankings and championships page
   - Validation: Consistent display

6. Integrate with Championships page
   - Details: Add "Top Contenders" section to each championship
   - Validation: Shows top 3 contenders

#### Testing Criteria:
- Rankings page loads and displays correctly
- Movement indicators accurate
- Mobile responsive

---

### Phase 6: Frontend - Admin Features
**Prerequisites**: Phase 3, Phase 5
**Estimated Complexity**: Low

#### Steps:
1. Create `AdminContenderConfig.tsx` component
   - Details: Configuration form per championship
   - Validation: Can update settings

2. Add recalculate button to admin panel
   - Details: Manual trigger with confirmation
   - Validation: Triggers recalculation

3. Add i18n translations
   - Details: English and German strings
   - Validation: All text translatable

#### Testing Criteria:
- Admin can configure rankings
- Manual recalculation works

## Technology Recommendations

### Algorithm Tuning
Consider adding admin controls for algorithm weights:
- Allow adjusting the 40/20/25/15 weight distribution
- Per-championship customization (tag titles may weight differently)
- A/B testing different algorithms

### Caching Strategy
Rankings don't change frequently:
- Cache API responses with 15-minute TTL
- Invalidate on recalculation
- Use CloudFront caching for public endpoints

### Historical Data Visualization
For future enhancement:
- Use Chart.js or Recharts for ranking history graphs
- Show player's journey to #1 contender
- Highlight title shot opportunities taken

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Algorithm perceived as unfair | High | Transparent calculation, admin override capability |
| New players can't rank | Medium | Lower minimum match threshold, "rising star" category |
| Calculation performance | Medium | Batch processing, efficient queries |
| Stale rankings | Low | Event-driven updates + scheduled refresh |

## Open Questions

1. Should the champion be excluded from rankings or shown separately?
2. How to handle tag team rankings when partners change?
3. Should there be separate rankings per season vs all-time?
4. What happens to rankings when a championship is vacated?
5. Should ranking manipulation (e.g., ducking matches) be detectable?

## Estimated Total Effort

| Phase | Effort |
|-------|--------|
| Phase 1 | 6-8 hours |
| Phase 2 | 3-4 hours |
| Phase 3 | 2-3 hours |
| Phase 4 | 3-4 hours |
| Phase 5 | 5-6 hours |
| Phase 6 | 2-3 hours |
| **Total** | **21-28 hours** |
