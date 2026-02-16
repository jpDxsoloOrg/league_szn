# Plan: Dashboard / League Overview Page

**GitHub Issue:** [#167](https://github.com/jpDxsoloOrg/league_szn/issues/167)

**Context:** The landing page currently shows only the Standings table. This feature adds a rich Dashboard page with current champions, upcoming events, recent results, season progress, quick stats, and active challenges. The Dashboard becomes the new `/` route; Standings moves to `/standings` only.

**Skills:** general-purpose (backend + frontend), test-engineer

---

## Proposed Changes

### Backend — New Dashboard Lambda

#### [NEW] [getDashboard.ts](file:///home/jpdev/source/league_szn/league_szn/backend/functions/dashboard/getDashboard.ts)

New `GET /dashboard` handler that aggregates data from multiple tables in one call:
- **Current Champions** — Scan Championships table, filter `isActive !== false` and `currentChampion` not null, join with Players for names/images
- **Upcoming Events** — Query Events table via StatusIndex (`status=upcoming`), sort by date asc, limit 3
- **Recent Results** — Query Matches table for `status=completed`, sort by date desc, limit 5, join with Players for names
- **Season Info** — Scan Seasons table, find the active season (`status=active`)
- **Quick Stats** — From match data: most wins (player with most wins in active season via SeasonStandings), longest active win streak (compute from recent matches), newest champion
- **Active Challenges Count** — Query Challenges table for `status=pending`, return count

Returns a single JSON object with all sections.

#### [MODIFY] [serverless.yml](file:///home/jpdev/source/league_szn/league_szn/backend/serverless.yml)

Add new `getDashboard` function entry:
```yaml
getDashboard:
  handler: functions/dashboard/getDashboard.handler
  events:
    - http:
        path: dashboard
        method: get
        cors: *corsConfig
```

---

### Frontend — Types

#### [MODIFY] [index.ts](file:///home/jpdev/source/league_szn/league_szn/frontend/src/types/index.ts)

Add `DashboardData` interface:
```typescript
export interface DashboardData {
  currentChampions: DashboardChampion[];
  upcomingEvents: DashboardEvent[];
  recentResults: DashboardMatch[];
  seasonInfo: DashboardSeason | null;
  quickStats: DashboardQuickStats;
  activeChallengesCount: number;
}
```
Plus sub-types: `DashboardChampion`, `DashboardEvent`, `DashboardMatch`, `DashboardSeason`, `DashboardQuickStats`.

---

### Frontend — API Service

#### [NEW] [dashboard.api.ts](file:///home/jpdev/source/league_szn/league_szn/frontend/src/services/api/dashboard.api.ts)

```typescript
export const dashboardApi = {
  get: async (signal?: AbortSignal): Promise<DashboardData> => {
    return fetchWithAuth(`${API_BASE_URL}/dashboard`, {}, signal);
  },
};
```

#### [MODIFY] [index.ts](file:///home/jpdev/source/league_szn/league_szn/frontend/src/services/api/index.ts)

Add `export { dashboardApi } from './dashboard.api';`

---

### Frontend — Dashboard Component

#### [NEW] [Dashboard.tsx](file:///home/jpdev/source/league_szn/league_szn/frontend/src/components/Dashboard.tsx)

Page component with responsive card grid:
- **Champions Strip** — Horizontal scrollable cards with belt images and champion names
- **Upcoming Events** — Cards with event name, date, countdown timer
- **Recent Results** — Compact match result cards (winner, loser, match type)
- **Season Progress** — Current season name, start date, match count, visual progress bar
- **Quick Stats** — Big-number callout cards (most wins, longest streak, newest champ)
- **Active Challenges** — Count badge with "View All" link to `/challenges`
- Uses `useTranslation` for i18n, `useEffect`/`useState` for data fetching with abort controller
- Loading skeleton and error state handling

#### [NEW] [Dashboard.css](file:///home/jpdev/source/league_szn/league_szn/frontend/src/components/Dashboard.css)

Responsive grid layout using existing CSS variable patterns (`--gold`, `--bg-card`, etc.)

---

### Frontend — Route & Navigation Changes

#### [MODIFY] [App.tsx](file:///home/jpdev/source/league_szn/league_szn/frontend/src/App.tsx)

- Import new `Dashboard` component
- Change `<Route path="/" element={<Standings />} />` → `<Route path="/" element={<Dashboard />} />`
- Add `<Route path="/standings" element={<Standings />} />`

#### [MODIFY] [navConfig.ts](file:///home/jpdev/source/league_szn/league_szn/frontend/src/config/navConfig.ts)

- Change `{ path: '/', i18nKey: 'nav.standings' }` → `{ path: '/', i18nKey: 'nav.dashboard' }`
- Add `{ path: '/standings', i18nKey: 'nav.standings' }` after Dashboard
- Update `getUserGroupForPath` to include `/standings` in core paths

---

### i18n

#### [MODIFY] [en.json](file:///home/jpdev/source/league_szn/league_szn/frontend/src/i18n/locales/en.json)

Add keys:
```json
"nav.dashboard": "Dashboard",
"dashboard.title": "League Overview",
"dashboard.champions": "Current Champions",
"dashboard.upcomingEvents": "Upcoming Events",
"dashboard.recentResults": "Recent Results",
"dashboard.seasonProgress": "Season Progress",
"dashboard.quickStats": "Quick Stats",
"dashboard.activeChallenges": "Active Challenges",
"dashboard.viewAll": "View All",
"dashboard.noChampions": "No active champions",
"dashboard.noUpcomingEvents": "No upcoming events",
"dashboard.noRecentResults": "No recent results",
"dashboard.noActiveSeason": "No active season",
"dashboard.mostWins": "Most Wins",
"dashboard.longestStreak": "Longest Win Streak",
"dashboard.newestChampion": "Newest Champion",
"dashboard.matchesPlayed": "Matches Played",
"dashboard.seasonStart": "Season Start",
"dashboard.daysIn": "days in",
"dashboard.countdown.days": "d",
"dashboard.countdown.hours": "h",
"dashboard.countdown.minutes": "m",
"dashboard.vs": "vs",
"dashboard.def": "def."
```

#### [MODIFY] [de.json](file:///home/jpdev/source/league_szn/league_szn/frontend/src/i18n/locales/de.json)

German translations for all dashboard keys.

---

### Backend Tests

#### [NEW] [getDashboard.test.ts](file:///home/jpdev/source/league_szn/league_szn/backend/functions/dashboard/__tests__/getDashboard.test.ts)

Following the existing pattern in `getStandings-allTime.test.ts`:
- Mock `dynamoDb` and `TableNames`
- Test: returns 200 with all dashboard sections
- Test: handles empty tables gracefully
- Test: returns correct current champions (only active with champion)
- Test: limits upcoming events to 3
- Test: limits recent results to 5
- Test: returns 500 on DynamoDB error

---

### Frontend Tests

#### [NEW] [Dashboard.test.tsx](file:///home/jpdev/source/league_szn/league_szn/frontend/src/components/__tests__/Dashboard.test.tsx)

Following existing patterns (e.g., `Standings.test.tsx`):
- Test: renders loading skeleton initially
- Test: renders all dashboard sections after data loads
- Test: renders empty states when no data
- Test: handles API error gracefully

---

## Files to Modify

| File | Action | Component |
|------|--------|-----------|
| `backend/functions/dashboard/getDashboard.ts` | NEW | Backend |
| `backend/serverless.yml` | MODIFY | Backend |
| `backend/functions/dashboard/__tests__/getDashboard.test.ts` | NEW | Backend Tests |
| `frontend/src/types/index.ts` | MODIFY | Frontend Types |
| `frontend/src/services/api/dashboard.api.ts` | NEW | Frontend API |
| `frontend/src/services/api/index.ts` | MODIFY | Frontend API |
| `frontend/src/components/Dashboard.tsx` | NEW | Frontend |
| `frontend/src/components/Dashboard.css` | NEW | Frontend |
| `frontend/src/App.tsx` | MODIFY | Frontend Routes |
| `frontend/src/config/navConfig.ts` | MODIFY | Frontend Nav |
| `frontend/src/i18n/locales/en.json` | MODIFY | i18n |
| `frontend/src/i18n/locales/de.json` | MODIFY | i18n |
| `frontend/src/components/__tests__/Dashboard.test.tsx` | NEW | Frontend Tests |

## Implementation Steps

### Step 1: Backend dashboard handler
Create `backend/functions/dashboard/getDashboard.ts` with the aggregated `GET /dashboard` endpoint. Add function definition to `serverless.yml`.

### Step 2: Frontend types
Add `DashboardData` and related sub-types to `frontend/src/types/index.ts`.

### Step 3: Frontend API service
Create `frontend/src/services/api/dashboard.api.ts` and export from `index.ts`.

### Step 4: i18n keys
Add all dashboard-related i18n keys to both `en.json` and `de.json`.

### Step 5: Dashboard component + CSS
Create `Dashboard.tsx` and `Dashboard.css` with the responsive card grid layout and all sections.

### Step 6: Route + nav changes
Update `App.tsx` routes and `navConfig.ts` to make Dashboard the home page and keep Standings at `/standings`.

### Step 7: Backend tests
Create `backend/functions/dashboard/__tests__/getDashboard.test.ts`.

### Step 8: Frontend tests
Create `frontend/src/components/__tests__/Dashboard.test.tsx`.

## Dependencies & Order

- Steps 1 has no dependencies (backend standalone)
- Steps 2+3+4 can run in parallel (types, API service, i18n — no deps)
- Step 5 depends on Steps 2+3+4 (component needs types, API, i18n)
- Step 6 depends on Step 5 (routes need the component)
- Step 7 depends on Step 1 (backend tests need handler)
- Step 8 depends on Steps 5+6 (frontend tests need component + routes)

**Suggested order:** Steps 1+2+3+4 → Step 5 → Steps 6+7 → Step 8

## Testing & Verification

### Automated Tests

**Backend tests:**
```bash
cd /home/jpdev/source/league_szn/league_szn/backend && npx vitest run functions/dashboard
```

**Frontend tests:**
```bash
cd /home/jpdev/source/league_szn/league_szn/frontend && npx vitest run src/components/__tests__/Dashboard.test.tsx
```

**Full verification (lint + all tests):**
```bash
# Backend lint
cd /home/jpdev/source/league_szn/league_szn/backend && npx eslint functions/ lib/

# Backend tests
cd /home/jpdev/source/league_szn/league_szn/backend && npx vitest run

# Frontend lint
cd /home/jpdev/source/league_szn/league_szn/frontend && npx eslint src/

# Frontend tests
cd /home/jpdev/source/league_szn/league_szn/frontend && npx vitest run
```

## Risks & Edge Cases

- **Empty database**: Dashboard must handle all tables being empty gracefully (show "no data" states)
- **No active season**: Season progress section should show a "No active season" message
- **No champions**: Champions strip should show "No active champions" message
- **Win streak calculation**: Keep it simple — scan the last N matches for each player from SeasonStandings, don't over-engineer
- **Countdown timer**: Use lightweight interval (every minute is sufficient), clean up on unmount
- **Performance**: The aggregated endpoint makes ~7 DynamoDB calls; all are simple queries/scans on small tables — should stay under Lambda timeout
