# Plan: News Feed / Activity Timeline

**GitHub Issue**: [#165](https://github.com/jpDxsoloOrg/league_szn/issues/165)

## Context

There is no central "what's happening" view. Users must visit separate pages to discover recent activity. This feature creates a combined activity feed on the home page that aggregates recent events across all features into a timeline, with type-specific icons, pagination, and optional type filtering.

### Tables Read (all read-only)
- **Matches** (PK: matchId, SK: date) — completed matches
- **ChampionshipHistory** (PK: championshipId, SK: wonDate) — title changes
- **Seasons** (PK: seasonId) — season started/ended
- **Tournaments** (PK: tournamentId) — tournament results
- **Challenges** (PK: challengeId) — challenges issued/accepted/completed
- **Promos** (PK: promoId) — new promos posted

### Skills to use
- general-purpose (backend + frontend code)
- test-engineer (unit tests)

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/functions/activity/getActivity.ts` | NEW | Lambda handler: scan tables, merge, sort, paginate |
| `backend/functions/activity/handler.ts` | NEW | Consolidated handler routing GET /activity |
| `backend/functions/activity/__tests__/getActivity.test.ts` | NEW | Unit tests for getActivity handler |
| `backend/serverless.yml` | MODIFY | Add `activity` function with GET /activity route |
| `frontend/src/types/index.ts` | MODIFY | Add `ActivityItem` type |
| `frontend/src/services/api/activity.api.ts` | NEW | API client for activity endpoint |
| `frontend/src/services/api/index.ts` | MODIFY | Export `activityApi` |
| `frontend/src/components/ActivityFeed.tsx` | NEW | Activity feed component with cards, icons, load-more |
| `frontend/src/components/ActivityFeed.css` | NEW | Styles for the activity feed |
| `frontend/src/App.tsx` | MODIFY | Add `/activity` route, add feed to home page |
| `frontend/src/i18n/locales/en.json` | MODIFY | Add `activity` translation keys |
| `frontend/src/i18n/locales/de.json` | MODIFY | Add `activity` translation keys (German) |
| `frontend/src/components/Sidebar.tsx` | MODIFY | Add Activity Feed nav link |
| `frontend/src/components/TopNav.tsx` | MODIFY | Add Activity Feed nav link |

## Implementation Steps

### Step 1: Backend — getActivity handler

Create `backend/functions/activity/getActivity.ts`:

- Accept query params: `?limit=20&cursor=<ISO-timestamp>&type=match|championship|challenge|promo|tournament|season`
- Scan/query each table (Matches with status=completed, ChampionshipHistory, Challenges, Promos, Tournaments, Seasons) using `dynamoDb.scanAll()`
- Map each item to a unified `ActivityItem` shape: `{ id, type, timestamp, summary, metadata }` where:
  - `type`: `match_result` | `championship_change` | `season_event` | `tournament_result` | `challenge_event` | `promo_posted`
  - `timestamp`: ISO string from the relevant date field
  - `summary`: brief text description (e.g. "Match completed: Player A def. Player B")
  - `metadata`: type-specific data (matchId, participants, winners, championshipId, etc.)
- Sort all items by timestamp descending
- Apply cursor-based pagination: filter items with timestamp < cursor, take first `limit` items
- If `type` filter provided, only scan the relevant table(s)
- Return `{ items: ActivityItem[], nextCursor: string | null }`
- Use existing `dynamoDb` helper from `lib/dynamodb.ts` and `success`/`serverError` from `lib/response.ts`

### Step 2: Backend — handler.ts and serverless.yml

Create `backend/functions/activity/handler.ts`:
- Route GET requests to `getActivity` handler (follows existing pattern from `matches/handler.ts`)

Modify `backend/serverless.yml`:
- Add `activity` function definition under `functions:` section
- Route: `GET /activity` with CORS, no auth required (public endpoint)
- Needs env vars for all tables it reads (already available globally in provider.environment)

### Step 3: Backend tests — getActivity

Create `backend/functions/activity/__tests__/getActivity.test.ts`:
- Mock `dynamoDb.scanAll` for each table
- Test: returns merged and sorted activity items
- Test: respects `limit` param
- Test: cursor-based pagination
- Test: `type` filter only scans relevant table
- Test: returns 500 on DynamoDB failure
- Test: returns empty items when no data
- Follow exact same patterns from `getMatches.test.ts` (vitest, vi.hoisted, vi.mock)

### Step 4: Frontend — Types and API service

Modify `frontend/src/types/index.ts`:
- Add `ActivityItem` interface with `id`, `type`, `timestamp`, `summary`, `metadata`
- Add `ActivityFeedResponse` interface with `items` and `nextCursor`

Create `frontend/src/services/api/activity.api.ts`:
- Export `activityApi.getAll(params?: { limit?: number; cursor?: string; type?: string })` using `fetchWithAuth`
- Follow pattern from `matches.api.ts`

Modify `frontend/src/services/api/index.ts`:
- Add `export { activityApi } from './activity.api'`

### Step 5: Frontend — ActivityFeed component

Create `frontend/src/components/ActivityFeed.tsx`:
- Fetch activity data using `activityApi.getAll()`
- Display activity cards with type-specific icons (⚔️ match, 🏆 championship, 📅 season, 🏅 tournament, 🤝 challenge, 🎤 promo)
- Each card shows: icon, summary text, relative timestamp ("X minutes ago"), link to details page
- "Load More" button for pagination (sends cursor to API)
- Optional filter tabs by activity type
- Use `useTranslation()` for all user-facing strings
- Loading and error states

Create `frontend/src/components/ActivityFeed.css`:
- Card layout with icon, text, timestamp
- Responsive: full-width timeline on mobile, constrained on desktop
- Type-specific accent colors
- Hover effects and smooth transitions

### Step 6: Frontend — Routing and Navigation

Modify `frontend/src/App.tsx`:
- Add route `<Route path="/activity" element={<ActivityFeed />} />`
- Import ActivityFeed component

Modify `frontend/src/components/Sidebar.tsx`:
- Add "Activity" nav item linking to `/activity` under the League group

Modify `frontend/src/components/TopNav.tsx`:
- Add "Activity" nav item in the core navigation group

### Step 7: i18n translations

Modify `frontend/src/i18n/locales/en.json`:
- Add `activity` section with keys: `title`, `loading`, `noActivity`, `loadMore`, `filters.*`, `types.*`, `timeAgo.*`

Modify `frontend/src/i18n/locales/de.json`:
- Add corresponding German translations for the `activity` section

## Dependencies & Order

- Step 1 has no dependencies (standalone backend)
- Step 2 depends on Step 1 (handler wraps getActivity, serverless defines the route)
- Step 3 depends on Step 1 (tests the getActivity handler)
- Step 4 has no backend dependency (defines types and API client)
- Step 5 depends on Step 4 (uses types and API client)
- Step 6 depends on Step 5 (routes and nav reference the component)
- Step 7 has no code dependencies (i18n keys only)

**Suggested order**: Steps 1+4+7 -> Steps 2+3 -> Step 5 -> Step 6

## Testing & Verification

### Automated Tests

1. **Backend unit tests**: `cd backend && npx vitest run functions/activity`
   - Verifies getActivity handler logic (merge, sort, paginate, filter, error handling)
2. **Backend lint**: `cd backend && npx eslint functions/activity/ lib/`
3. **Frontend lint**: `cd frontend && npx eslint src/`
4. **Full test suite**: `cd backend && npx vitest run && cd ../frontend && npx vitest run`

### Manual Verification
- Start local dev environment and navigate to `/activity` to confirm the feed renders
- Verify "Load More" pagination works
- Verify filter tabs filter by activity type
- Verify nav links appear in both sidebar and top nav modes

## Risks & Edge Cases

1. **Performance**: Scanning 6 tables on every request could be slow. Mitigated by limiting results with `limit` param (default 20) and using cursor pagination so only items older than the cursor need consideration.
2. **Empty tables**: Handler must handle tables with zero items gracefully.
3. **Missing player names**: Activity items reference playerIds — the frontend will need to resolve names. We'll include player names in the metadata at the backend level so the frontend doesn't need additional lookups.
4. **Large datasets**: Using `scanAll` could be expensive for very large tables. For MVP this is acceptable; a future optimization would add GSIs or a dedicated activity table.
