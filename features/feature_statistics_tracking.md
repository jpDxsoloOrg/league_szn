# Feature: Advanced Statistics Tracking

## Executive Summary

A comprehensive statistics tracking system that captures detailed performance metrics beyond basic win/loss records. Track match type specializations, championship reign statistics, head-to-head records, streaks, and historical achievements. This feature transforms the league into a data-rich experience where players can analyze performance and identify their strengths.

## Problem Statement

Currently, the application only tracks basic win/loss/draw records for players. This provides a surface-level view but misses the rich analytical possibilities that make sports statistics engaging. Questions like "Who's the best at ladder matches?", "What's the longest championship reign?", or "What's my record against this opponent?" cannot be answered with current data.

## Goals

1. Track detailed per-match-type statistics
2. Calculate and display head-to-head records between players
3. Track streak records (longest win streak, championship defenses, etc.)
4. Provide career milestone achievements
5. Generate "tale of the tape" comparisons for upcoming matches
6. Enable historical queries and career summaries

## Non-Goals

1. Real-time match play-by-play statistics
2. Video game-specific stats (health, stamina, etc.)
3. Predictive analytics or match outcome forecasting
4. Fantasy sports style scoring
5. Social comparison features ("You're better than 80% of players")

## Proposed Solution

### Statistics Categories

#### 1. Match Type Statistics
Track performance by match type:
- Singles
- Tag Team
- Triple Threat
- Fatal 4-Way
- Battle Royal
- Special stipulations (Ladder, Cage, HIAC, etc.)

#### 2. Head-to-Head Records
For each player pair:
- Total matches
- Wins/Losses/Draws
- Last meeting date
- Championship matches against each other
- Recent form (last 5 meetings)

#### 3. Streak Tracking
- Current win/loss streak
- Longest win streak (career)
- Longest loss streak (career)
- Longest undefeated streak
- Championship defense streak
- PPV appearance streak (if events tracked)

#### 4. Championship Statistics
- Total reigns per championship
- Total combined days as champion
- Longest single reign
- Shortest reign
- Most defenses in a reign
- Grand Slam status (holding all singles titles)

#### 5. Career Milestones
- First win
- 10/25/50/100 wins
- First championship
- Most wins in a season
- Match of the Year nominees

### High-Level Architecture

```
+-------------------+       +-------------------+       +-------------------+
|   Match Result    |       |   Stats           |       |   DynamoDB        |
|   Recorded        | ----> |   Aggregation     | ----> |   Statistics      |
|                   |       |   Lambda          |       |   Tables          |
+-------------------+       +-------------------+       +-------------------+
        |                                                       |
        v                                                       v
+-------------------+                                   +-------------------+
|   EventBridge     |                                   |   Stats API       |
|   Trigger         |                                   |   Endpoints       |
+-------------------+                                   +-------------------+
```

## Technical Specification

### Data Model: PlayerStatistics Table

**Table Name**: `wwe-2k-league-api-player-statistics-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `playerId` (PK) | String | The player |
| `statType` (SK) | String | `overall`, `matchtype#{type}`, `season#{seasonId}` |
| `wins` | Number | Total wins in category |
| `losses` | Number | Total losses |
| `draws` | Number | Total draws |
| `matchesPlayed` | Number | Total matches |
| `winPercentage` | Number | Calculated win % |
| `currentWinStreak` | Number | Current streak (negative for loss) |
| `longestWinStreak` | Number | Career best win streak |
| `longestLossStreak` | Number | Career worst loss streak |
| `firstMatchDate` | String | Date of first match |
| `lastMatchDate` | String | Date of most recent match |
| `championshipWins` | Number | Title match wins |
| `championshipLosses` | Number | Title match losses |
| `updatedAt` | String | ISO timestamp |

### Data Model: HeadToHead Table

**Table Name**: `wwe-2k-league-api-head-to-head-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `matchupKey` (PK) | String | `{playerId1}#{playerId2}` (alphabetically sorted) |
| `player1Id` | String | First player (alphabetically) |
| `player2Id` | String | Second player |
| `player1Wins` | Number | Player 1's wins |
| `player2Wins` | Number | Player 2's wins |
| `draws` | Number | Total draws |
| `totalMatches` | Number | Total head-to-head matches |
| `lastMatchDate` | String | Most recent meeting |
| `lastMatchId` | String | Reference to last match |
| `championshipMatches` | Number | Title matches against each other |
| `recentResults` | List | Last 5 match results [{matchId, winnerId, date}] |
| `updatedAt` | String | ISO timestamp |

### Data Model: ChampionshipStatistics Table

**Table Name**: `wwe-2k-league-api-championship-statistics-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `playerId` (PK) | String | The player |
| `championshipId` (SK) | String | The championship |
| `totalReigns` | Number | Number of times held |
| `totalDaysHeld` | Number | Combined days as champion |
| `longestReign` | Number | Longest single reign in days |
| `shortestReign` | Number | Shortest reign in days |
| `totalDefenses` | Number | Successful title defenses |
| `mostDefensesInReign` | Number | Best defense count in single reign |
| `firstWonDate` | String | First time winning this title |
| `lastWonDate` | String | Most recent title win |
| `currentlyHolding` | Boolean | Is current champion |
| `updatedAt` | String | ISO timestamp |

**GSI: ChampionshipIndex**
- Partition Key: `championshipId`
- Sort Key: `totalReigns`
- Purpose: Leaderboard of most reigns per title

### Data Model: Achievements Table

**Table Name**: `wwe-2k-league-api-achievements-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `playerId` (PK) | String | The player |
| `achievementId` (SK) | String | Achievement identifier |
| `achievementName` | String | Display name |
| `achievementType` | String | milestone, record, special |
| `description` | String | Achievement description |
| `earnedAt` | String | When achieved |
| `metadata` | Map | Additional context (e.g., which match) |

**GSI: AchievementTypeIndex**
- Partition Key: `achievementType`
- Sort Key: `earnedAt`
- Purpose: Recent achievements by type

### TypeScript Interfaces

```typescript
export interface PlayerStatistics {
  playerId: string;
  statType: string;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  winPercentage: number;
  currentWinStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  firstMatchDate?: string;
  lastMatchDate?: string;
  championshipWins: number;
  championshipLosses: number;
  updatedAt: string;
}

export interface HeadToHead {
  matchupKey: string;
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  totalMatches: number;
  lastMatchDate?: string;
  lastMatchId?: string;
  championshipMatches: number;
  recentResults: Array<{
    matchId: string;
    winnerId: string;
    date: string;
  }>;
  updatedAt: string;
}

export interface ChampionshipStats {
  playerId: string;
  championshipId: string;
  totalReigns: number;
  totalDaysHeld: number;
  longestReign: number;
  shortestReign: number;
  totalDefenses: number;
  mostDefensesInReign: number;
  firstWonDate?: string;
  lastWonDate?: string;
  currentlyHolding: boolean;
  updatedAt: string;
}

export interface Achievement {
  playerId: string;
  achievementId: string;
  achievementName: string;
  achievementType: 'milestone' | 'record' | 'special';
  description: string;
  earnedAt: string;
  metadata?: Record<string, unknown>;
}

export interface TaleOfTheTape {
  player1: PlayerStatistics;
  player2: PlayerStatistics;
  headToHead: HeadToHead;
  matchType?: string;
  player1MatchTypeStats?: PlayerStatistics;
  player2MatchTypeStats?: PlayerStatistics;
  prediction?: {
    favoriteId: string;
    confidence: number;
    reasoning: string;
  };
}
```

### API Endpoints

#### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/players/{id}/statistics` | Get player's full statistics |
| GET | `/players/{id}/statistics/matchtype/{type}` | Get player's stats for match type |
| GET | `/players/{id}/achievements` | Get player's achievements |
| GET | `/head-to-head/{player1Id}/{player2Id}` | Get head-to-head record |
| GET | `/statistics/leaderboards` | Get various leaderboards |
| GET | `/statistics/records` | Get league records |
| GET | `/matches/{id}/tale-of-tape` | Get pre-match comparison |
| GET | `/championships/{id}/statistics` | Get championship-specific stats |

#### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/statistics/recalculate` | Recalculate all statistics |
| POST | `/admin/achievements/grant` | Manually grant achievement |
| DELETE | `/admin/achievements/{playerId}/{achievementId}` | Revoke achievement |

### Request/Response Examples

**Get Player Statistics**
```json
GET /players/player-uuid-123/statistics

Response:
{
  "playerId": "player-uuid-123",
  "playerName": "John",
  "wrestlerName": "CM Punk",
  "overall": {
    "wins": 45,
    "losses": 23,
    "draws": 2,
    "matchesPlayed": 70,
    "winPercentage": 64.3,
    "currentWinStreak": 3,
    "longestWinStreak": 8,
    "championshipWins": 5,
    "championshipLosses": 3
  },
  "byMatchType": {
    "singles": { "wins": 30, "losses": 15, "winPercentage": 66.7 },
    "tag": { "wins": 10, "losses": 5, "winPercentage": 66.7 },
    "ladder": { "wins": 5, "losses": 3, "winPercentage": 62.5 }
  },
  "championships": [
    {
      "championshipName": "WWE Championship",
      "totalReigns": 2,
      "totalDaysHeld": 180,
      "currentlyHolding": false
    }
  ],
  "recentAchievements": [
    {
      "achievementName": "50 Wins Club",
      "earnedAt": "2026-01-15T12:00:00Z"
    }
  ]
}
```

**Get Head-to-Head**
```json
GET /head-to-head/player-uuid-123/player-uuid-456

Response:
{
  "player1": {
    "playerId": "player-uuid-123",
    "name": "John",
    "wrestlerName": "CM Punk",
    "wins": 5
  },
  "player2": {
    "playerId": "player-uuid-456",
    "name": "Mike",
    "wrestlerName": "The Rock",
    "wins": 3
  },
  "draws": 1,
  "totalMatches": 9,
  "lastMatchDate": "2026-02-01T20:00:00Z",
  "championshipMatches": 2,
  "recentResults": [
    { "winnerId": "player-uuid-123", "date": "2026-02-01" },
    { "winnerId": "player-uuid-456", "date": "2026-01-15" },
    { "winnerId": "player-uuid-123", "date": "2025-12-20" }
  ],
  "summary": "CM Punk leads the rivalry 5-3-1"
}
```

**Get Leaderboards**
```json
GET /statistics/leaderboards

Response:
{
  "mostWins": [
    { "playerId": "...", "name": "John", "wins": 45 },
    { "playerId": "...", "name": "Mike", "wins": 42 }
  ],
  "bestWinPercentage": [
    { "playerId": "...", "name": "Alex", "winPercentage": 72.5, "minMatches": 20 }
  ],
  "longestCurrentStreak": [
    { "playerId": "...", "name": "Dave", "streak": 7 }
  ],
  "mostChampionships": [
    { "playerId": "...", "name": "John", "totalReigns": 5 }
  ],
  "longestReign": [
    { "playerId": "...", "name": "Mike", "days": 120, "championshipName": "IC Title" }
  ]
}
```

**Tale of the Tape**
```json
GET /matches/match-uuid-789/tale-of-tape

Response:
{
  "match": {
    "matchId": "match-uuid-789",
    "matchType": "singles",
    "stipulation": "Steel Cage",
    "isChampionship": true,
    "championshipName": "WWE Championship"
  },
  "player1": {
    "playerId": "player-uuid-123",
    "name": "John",
    "wrestlerName": "CM Punk",
    "overallRecord": "45-23-2",
    "cageMatchRecord": "3-1",
    "currentStreak": "3 wins",
    "titleMatchRecord": "5-3"
  },
  "player2": {
    "playerId": "player-uuid-456",
    "name": "Mike",
    "wrestlerName": "The Rock",
    "overallRecord": "42-25-3",
    "cageMatchRecord": "4-2",
    "currentStreak": "1 loss",
    "titleMatchRecord": "4-4"
  },
  "headToHead": {
    "summary": "CM Punk leads 5-3-1",
    "lastMeeting": "CM Punk won on Feb 1"
  },
  "advantages": {
    "overallRecord": "CM Punk",
    "matchTypeExperience": "The Rock",
    "currentForm": "CM Punk",
    "headToHead": "CM Punk"
  }
}
```

## Frontend Components

### New Pages/Components

1. **PlayerStats.tsx** (Tab on Player Profile)
   - Overall statistics summary
   - Match type breakdown
   - Championship history
   - Achievements gallery
   - Charts and visualizations

2. **HeadToHeadComparison.tsx** (Standalone & Match Integration)
   - Side-by-side player comparison
   - Rivalry history timeline
   - Recent match results
   - Statistical edges highlighted

3. **Leaderboards.tsx** (New Page)
   - Multiple leaderboard categories
   - Tab or filter selection
   - Minimum match thresholds
   - Season vs all-time toggle

4. **TaleOfTheTape.tsx** (Match Detail Component)
   - Pre-fight style comparison
   - Boxing-style stat comparison
   - Key advantages highlighted
   - Historical context

5. **Achievements.tsx** (Player Profile Tab)
   - Achievement badges/icons
   - Earned vs locked achievements
   - Achievement descriptions
   - Recent unlocks feed

6. **RecordBook.tsx** (New Page)
   - League records by category
   - Record holders with dates
   - "Near misses" for active streaks

### UI Mockup - Tale of the Tape

```
+--------------------------------------------------+
|            TALE OF THE TAPE                       |
|         WWE CHAMPIONSHIP MATCH                    |
+--------------------------------------------------+
|                                                   |
|  CM PUNK                        THE ROCK          |
|  [Image]                        [Image]           |
|                                                   |
|  45-23-2    OVERALL RECORD    42-25-3            |
|  64.3%      WIN PERCENTAGE    60.0%              |
|  3-1        CAGE MATCH RECORD 4-2                |
|  3 Wins     CURRENT STREAK    1 Loss             |
|  5-3        TITLE MATCHES     4-4                |
|  8          LONGEST WIN STREAK 6                  |
|                                                   |
|  +--------------------------------------------+  |
|  |        HEAD-TO-HEAD: CM Punk leads 5-3-1   |  |
|  |        Last Meeting: CM Punk won (Feb 1)   |  |
|  |        Championship Matches: 1-1           |  |
|  +--------------------------------------------+  |
|                                                   |
|  STATISTICAL EDGE:                               |
|  [====CM PUNK====]          [==THE ROCK==]       |
|       3 advantages              1 advantage       |
+--------------------------------------------------+
```

### UI Mockup - Leaderboards

```
+--------------------------------------------------+
|  LEADERBOARDS                                     |
+--------------------------------------------------+
|  [Most Wins] [Win %] [Streaks] [Championships]    |
|  [Season] [All-Time]                              |
+--------------------------------------------------+
|                                                   |
|  MOST WINS (All-Time)                            |
|                                                   |
|  1. [Avatar] JOHN (CM Punk)        45 wins       |
|  2. [Avatar] MIKE (The Rock)       42 wins       |
|  3. [Avatar] DAVE (Stone Cold)     38 wins       |
|  4. [Avatar] ALEX (Triple H)       35 wins       |
|  5. [Avatar] CHRIS (Undertaker)    32 wins       |
|                                                   |
|  LONGEST ACTIVE WIN STREAK                       |
|                                                   |
|  1. [Avatar] DAVE (Stone Cold)     7 wins        |
|  2. [Avatar] JOHN (CM Punk)        3 wins        |
|  3. [Avatar] ALEX (Triple H)       2 wins        |
+--------------------------------------------------+
```

## Achievements List (Initial Set)

### Milestone Achievements
| Achievement | Criteria | Icon |
|-------------|----------|------|
| First Blood | Win your first match | 🩸 |
| Double Digits | Reach 10 wins | 🔟 |
| Quarter Century | Reach 25 wins | 🏅 |
| Half Century | Reach 50 wins | 🎖️ |
| Centurion | Reach 100 wins | 🏆 |

### Streak Achievements
| Achievement | Criteria | Icon |
|-------------|----------|------|
| Hot Streak | Win 3 matches in a row | 🔥 |
| On Fire | Win 5 matches in a row | ⭐ |
| Unstoppable | Win 10 matches in a row | 👑 |
| Redemption Arc | Win after 3+ loss streak | 💪 |

### Championship Achievements
| Achievement | Criteria | Icon |
|-------------|----------|------|
| Champion | Win your first championship | 🥇 |
| Dual Champion | Hold 2 titles simultaneously | 🥈 |
| Grand Slam | Hold every singles title once | 💎 |
| Longest Reign | Hold record for longest reign | ⌛ |
| Iron Champion | 5+ successful defenses | 🛡️ |

### Special Achievements
| Achievement | Criteria | Icon |
|-------------|----------|------|
| Cage Master | Win 5 cage matches | 🔗 |
| Ladder Legend | Win 5 ladder matches | 🪜 |
| Tournament Winner | Win any tournament | 🏅 |
| Rivalry Ender | Win 5-0 in a head-to-head | ⚔️ |

## Implementation Phases

### PHASE 0: UI Prototypes with Mock Data
**Prerequisites**: None
**Estimated Complexity**: High

This phase creates all UI components with hardcoded data so stakeholders can see the look and flow before backend work begins.

#### Steps:
1. Create statistics types file with interfaces
   - File: `frontend/src/types/statistics.ts`
   - Details: All TypeScript interfaces for statistics feature
   - Validation: TypeScript compiles without errors

2. Create mock data file
   - File: `frontend/src/mocks/statisticsMockData.ts`
   - Details: Hardcoded player stats, leaderboards, head-to-head, achievements
   - Validation: Data matches interface shapes

3. Create `PlayerStats.tsx` component
   - File: `frontend/src/components/PlayerStats.tsx`
   - Details: Full statistics display with charts using mock data
   - Validation: Renders correctly with all stat categories

4. Create `HeadToHeadComparison.tsx` component
   - File: `frontend/src/components/HeadToHeadComparison.tsx`
   - Details: Side-by-side player comparison with rivalry history
   - Validation: Shows both players with mock data

5. Create `Leaderboards.tsx` page
   - File: `frontend/src/components/Leaderboards.tsx`
   - Details: Multiple leaderboard categories with tabs/filters
   - Validation: All categories render with mock data

6. Create `RecordBook.tsx` page
   - File: `frontend/src/components/RecordBook.tsx`
   - Details: League records display with record holders
   - Validation: Records display correctly

7. Create `TaleOfTheTape.tsx` component
   - File: `frontend/src/components/TaleOfTheTape.tsx`
   - Details: Boxing-style stat comparison for matches
   - Validation: Pre-fight style comparison renders

8. Create `Achievements.tsx` component
   - File: `frontend/src/components/Achievements.tsx`
   - Details: Achievement gallery with earned/unearned badges
   - Validation: Shows achievement icons and descriptions

9. Create CSS styles for statistics components
   - Files: `Stats*.css`, `Leaderboards.css`, etc.
   - Details: Charts styling, comparison layouts, responsive
   - Validation: Visually appealing, consistent with app

10. Add routing for statistics pages
    - File: Update `App.tsx`
    - Details: Add routes for `/stats/*`, `/leaderboards`, `/records`
    - Validation: All routes accessible

11. Add i18n strings for statistics feature
    - Files: Update `en.json`, `de.json`
    - Details: All user-facing text translatable
    - Validation: Language switch works

#### Testing Criteria:
- All pages render without errors with mock data
- Charts render properly
- Responsive on mobile devices
- Consistent styling with existing app

---

### PHASE 1: Core Statistics Tables (Backend)
**Prerequisites**: Phase 0
**Estimated Complexity**: Medium

#### Steps:
1. Add statistics tables to `serverless.yml`
   - Details: PlayerStatistics, HeadToHead, ChampionshipStatistics
   - Validation: Tables created successfully

2. Create TypeScript types for statistics
   - Details: Add to backend types directory
   - Validation: Types compile correctly

3. Create statistics calculation service
   - Details: `lib/statsCalculator.ts` with calculation logic
   - Validation: Unit tests pass

4. Modify `recordResult.ts` to trigger stats update
   - Details: Call stats calculation after match result
   - Validation: Stats update on match completion

#### Testing Criteria:
- Basic stats calculate correctly
- Edge cases handled (first match, ties)

---

### PHASE 2: Statistics API Endpoints (Backend)
**Prerequisites**: Phase 1
**Estimated Complexity**: Medium

#### Steps:
1. Implement `getPlayerStatistics.ts` Lambda
   - Details: Return full player statistics
   - Validation: Returns correct data

2. Implement `getHeadToHead.ts` Lambda
   - Details: Return rivalry statistics
   - Validation: Both directions work (A vs B, B vs A)

3. Implement `getLeaderboards.ts` Lambda
   - Details: Multiple leaderboard types
   - Validation: Correct ordering and filtering

4. Implement `getRecords.ts` Lambda
   - Details: League-wide records
   - Validation: Records accurate

#### Testing Criteria:
- API responses match expected format
- Performance acceptable for large datasets

---

### PHASE 3: Achievements System (Backend)
**Prerequisites**: Phase 1
**Estimated Complexity**: Medium

#### Steps:
1. Add Achievements table to `serverless.yml`
   - Details: Define table and GSI
   - Validation: Table created

2. Create achievement definitions
   - Details: `lib/achievements.ts` with criteria
   - Validation: All achievements defined

3. Create achievement check service
   - Details: Check and award achievements after matches
   - Validation: Achievements granted correctly

4. Implement `getPlayerAchievements.ts` Lambda
   - Details: Return player's achievements
   - Validation: Returns earned achievements

#### Testing Criteria:
- Achievements grant at correct thresholds
- No duplicate achievements

---

### PHASE 4: Tale of the Tape (Backend)
**Prerequisites**: Phase 2
**Estimated Complexity**: Low

#### Steps:
1. Implement `getTaleOfTape.ts` Lambda
   - Details: Aggregate stats for match participants
   - Validation: Returns comparison data

2. Add match type specific stats to comparison
   - Details: Include relevant match type records
   - Validation: Stipulation-specific stats shown

#### Testing Criteria:
- Comparison data accurate
- Works for all match types

---

### PHASE 5: Connect Frontend to Backend (Player Statistics)
**Prerequisites**: Phase 2
**Estimated Complexity**: Medium

#### Steps:
1. Add statistics API functions
   - Details: Add to `services/api.ts`
   - Validation: Can fetch statistics

2. Replace mock data in `PlayerStats.tsx` with API calls
   - Details: Remove mock imports, add useEffect for data fetching
   - Validation: Displays real statistics from backend

3. Replace mock data in `HeadToHeadComparison.tsx` with API calls
   - Details: Fetch rivalry data from API
   - Validation: Shows real head-to-head data

4. Integrate into player profile
   - Details: Add Statistics tab
   - Validation: Accessible from profile

5. Add loading and error states
   - Details: Skeleton loaders, error boundaries
   - Validation: Graceful handling of loading/errors

#### Testing Criteria:
- Statistics display correctly
- Charts render properly
- Mobile responsive

---

### PHASE 6: Connect Frontend to Backend (Leaderboards & Records)
**Prerequisites**: Phase 5
**Estimated Complexity**: Medium

#### Steps:
1. Replace mock data in `Leaderboards.tsx` with API calls
   - Details: Fetch leaderboard data from API
   - Validation: All categories work with real data

2. Replace mock data in `RecordBook.tsx` with API calls
   - Details: Fetch records from API
   - Validation: Records accurate

3. Add navigation links
   - Details: Add to main nav
   - Validation: Navigable

#### Testing Criteria:
- Leaderboards load correctly
- Filters work
- Responsive design

---

### PHASE 7: Connect Frontend to Backend (Tale of Tape & Achievements)
**Prerequisites**: Phase 4, Phase 3
**Estimated Complexity**: Medium

#### Steps:
1. Replace mock data in `TaleOfTheTape.tsx` with API calls
   - Details: Fetch match comparison data
   - Validation: Shows real stats before matches

2. Replace mock data in `Achievements.tsx` with API calls
   - Details: Fetch player achievements
   - Validation: Shows earned/unearned correctly

3. Integrate Tale of the Tape into match cards
   - Details: Show for scheduled matches
   - Validation: Appears on match detail

4. Create achievement notification
   - Details: Show when new achievement earned
   - Validation: Notification displays

#### Testing Criteria:
- Tale of the Tape informative
- Achievements display correctly

---

### PHASE 8: Historical Data Migration
**Prerequisites**: Phase 1
**Estimated Complexity**: Low

#### Steps:
1. Create migration script
   - Details: Process all historical matches
   - Validation: Statistics populate from history

2. Run migration for existing data
   - Details: Execute on production
   - Validation: All historical stats calculated

#### Testing Criteria:
- All historical matches processed
- Statistics match manual verification

## Technology Recommendations

### Charting Library
For statistics visualization:
- **Recharts**: React-native, good for basic charts
- **Chart.js with react-chartjs-2**: More features, familiar API
- **Recommendation**: Recharts for simplicity

### Performance Considerations
- Cache leaderboards with 5-minute TTL
- Use DynamoDB streams for real-time stat updates
- Consider read replicas for heavy query loads

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance with large datasets | Medium | Caching, efficient queries, pagination |
| Historical data inconsistency | Medium | Validation scripts, manual override |
| Complex achievement edge cases | Low | Thorough testing, clear criteria |
| Calculation errors | Medium | Unit tests, verification tools |

## Open Questions

1. Should statistics reset per season or be cumulative?
2. What is the minimum matches required for leaderboard eligibility?
3. Should achievements be visible to other players or private?
4. How to handle statistics for players who leave the league?
5. Should there be "disputed" records for controversial matches?

## Estimated Total Effort

| Phase | Effort |
|-------|--------|
| Phase 0 (UI Prototypes) | 8-10 hours |
| Phase 1 | 5-7 hours |
| Phase 2 | 4-5 hours |
| Phase 3 | 4-5 hours |
| Phase 4 | 2-3 hours |
| Phase 5 (Connect Player Stats) | 3-4 hours |
| Phase 6 (Connect Leaderboards) | 3-4 hours |
| Phase 7 (Connect TotT & Achievements) | 3-4 hours |
| Phase 8 | 2-3 hours |
| **Total** | **34-45 hours** |
