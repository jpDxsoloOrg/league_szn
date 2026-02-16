# Plan: Expand rivalry system — activity board and top 3 on dashboard

**GitHub issue:** [#184](https://github.com/jpDxsolo/league_szn/issues/184) — Expand rivalry system: activity board and top 3 rivalries on dashboard

## Context

The rivalry system (GET /rivalries, /stats/rivalries) already detects and displays rivalries. This plan surfaces rivalries in two more places: the activity feed (so rivalry matches are visible and filterable) and the dashboard (top 3 “hottest” rivalries).

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review backend activity/dashboard and frontend changes |
| Before commit | git-commit-helper | Conventional commit message |
| If API contracts change | api-documenter | Update OpenAPI for dashboard/activity |
| New/changed behavior | test-generator | Tests for activity rivalry filter and dashboard rivalries |

## Agents and parallel work

- **Suggested order**: Step 1 (backend shared rivalries) → Steps 2+3 in parallel (activity backend + dashboard backend) → Step 4 (frontend types + API) → Step 5 (ActivityFeed UI) → Step 6 (Dashboard UI) → Step 7 (i18n + tests).
- **Agent types**: Step 1 = general-purpose; Steps 2–3 = general-purpose; Step 4 = general-purpose; Steps 5–6 = general-purpose; Step 7 = general-purpose or test-engineer.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/functions/rivalries/computeRivalries.ts` | Create | Shared logic to compute rivalry list (used by getRivalries + getDashboard) |
| `backend/functions/rivalries/getRivalries.ts` | Modify | Use computeRivalries; keep handler and response shape |
| `backend/functions/activity/getActivity.ts` | Modify | Mark match_result items with rivalry metadata; add type filter `rivalry` |
| `backend/functions/dashboard/getDashboard.ts` | Modify | Call computeRivalries, add top 3 to response |
| `backend/serverless.yml` | Audit | No route changes expected |
| `frontend/src/types/index.ts` | Modify | Add `topRivalries` to DashboardData; reuse or mirror Rivalry shape |
| `frontend/src/services/api/dashboard.api.ts` | Audit | Response type already from types |
| `frontend/src/components/ActivityFeed.tsx` | Modify | Add “Rivalry” filter tab; show rivalry badge when `metadata.isRivalryMatch` |
| `frontend/src/components/ActivityFeed.css` | Modify | Style for rivalry badge on activity cards |
| `frontend/src/components/Dashboard.tsx` | Modify | New section “Hottest Rivalries” with up to 3 cards linking to /stats/rivalries or head-to-head |
| `frontend/src/components/Dashboard.css` | Modify | Styles for rivalries strip/cards |
| `frontend/src/i18n/locales/en.json` | Modify | activity.types.rivalry, dashboard.hottestRivalries, dashboard.viewAllRivalries, etc. |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys in German |
| `backend/functions/activity/__tests__/getActivity.test.ts` | Modify | Test rivalry filter and match_result rivalry metadata |
| `backend/functions/dashboard/__tests__/getDashboard.test.ts` | Modify | Test topRivalries in response |
| `frontend/src/components/__tests__/Dashboard.test.tsx` | Modify | Mock topRivalries; assert section renders |

## Implementation steps

### Step 1: Backend — extract shared rivalry computation

- Add `backend/functions/rivalries/computeRivalries.ts`.
- Move the core logic from `getRivalries.ts` (scan players + matches, aggregate by pair, filter ≥ MIN_MATCHES, sort, enrich with player details) into an exported function e.g. `computeRivalries(seasonId?: string): Promise<Rivalry[]>` that returns the same shape as the current handler response (array of Rivalry with player1/player2, wins, matchCount, intensityBadge, etc.).
- Update `getRivalries.ts` to call `computeRivalries(event.queryStringParameters?.seasonId)` and return `success({ rivalries })`. No change to API contract.

### Step 2: Backend — activity feed rivalry metadata and filter

- In `backend/functions/activity/getActivity.ts`:
  - After building `rawItems` for matches (match_result), compute per-pair match counts from the same completed matches: for each pair of participants (length === 2), maintain a map `pairKey -> count`. Use the same `pairKey(a,b) = [a,b].sort().join('|')` convention as rivalries.
  - When filling summaries for `match_result` items, for each item with two participants, look up the pair’s count. If count >= 3, set `metadata.isRivalryMatch = true` and `metadata.rivalryMatchCount = count`. Optionally set `metadata.player1Id` and `metadata.player2Id` (sorted) for the frontend.
  - Add `'rivalry'` to the filter semantics: when `typeFilter === 'rivalry'`, after building `rawItems`, filter to only items where `type === 'match_result' && metadata.isRivalryMatch === true`. So the activity types for filtering include a virtual “rivalry” view over match_result.
  - Add `'rivalry'` to `ACTIVITY_TYPES` (or equivalent) so `?type=rivalry` is accepted and applied as above.
- Ensure `ActivityItemType` in the backend stays as-is (no new type required); rivalry is a filter + metadata on `match_result`.
- Frontend types: in `frontend/src/types/index.ts`, `ActivityItem.metadata` can include optional `isRivalryMatch?: boolean`, `rivalryMatchCount?: number`, `player1Id?: string`, `player2Id?: string`.

### Step 3: Backend — dashboard top 3 rivalries

- In `backend/functions/dashboard/getDashboard.ts`:
  - Import `computeRivalries` from the rivalries module.
  - Call `await computeRivalries(undefined)` (or pass current season id if desired for “hottest this season”) to get the full sorted list.
  - Take the first 3 entries. Map each to a compact shape suitable for the dashboard, e.g. `{ player1Id, player2Id, player1Name, player2Name, player1ImageUrl?, player2ImageUrl?, matchCount, player1Wins, player2Wins, intensityBadge, lastMatchDate }` (reuse or align with existing `Rivalry` shape from getRivalries).
  - Add `topRivalries` to the dashboard response interface and return it in the handler.

### Step 4: Frontend — types and API

- In `frontend/src/types/index.ts`:
  - Add `DashboardRivalry` (or reuse `Rivalry` from `rivalries.api`) with fields needed for the dashboard cards: player ids, names, imageUrls, matchCount, wins, intensityBadge, etc.
  - Add `topRivalries: DashboardRivalry[]` (or `Rivalry[]`) to `DashboardData`.
- Ensure `dashboard.api.ts` uses the updated `DashboardData` type (no code change if it already uses the type from `types`).

### Step 5: Frontend — ActivityFeed rivalry filter and badge

- In `frontend/src/components/ActivityFeed.tsx`:
  - Add a filter tab for “Rivalry” (value `'rivalry'` or the param that backend expects for `type=rivalry`). Use the same pattern as existing type filters; backend will return only match_result items that have `metadata.isRivalryMatch`.
  - When rendering an activity card, if `item.metadata.isRivalryMatch` is true, show a small “Rivalry” badge (e.g. icon + label) so users see at a glance that the match is part of a rivalry.
- In `frontend/src/components/ActivityFeed.css`: add a class for the rivalry badge (e.g. `.activity-feed__card-badge--rivalry`).

### Step 6: Frontend — Dashboard “Hottest Rivalries” section

- In `frontend/src/components/Dashboard.tsx`:
  - Add a section “Hottest Rivalries” (or use i18n key `dashboard.hottestRivalries`).
  - Render up to 3 cards from `data.topRivalries`. Each card: player names (and optional thumbnails), match count, series summary (e.g. “X leads 3–2”), intensity badge; link to `/stats/rivalries` or to a head-to-head view if available (e.g. `/stats/head-to-head?player1=...&player2=...`).
  - If `topRivalries` is empty or missing, show an empty state or hide the section.
- In `frontend/src/components/Dashboard.css`: add styles for the rivalries strip/cards consistent with existing dashboard sections.

### Step 7: i18n and tests

- **i18n**: Add keys in `en.json` and `de.json`:
  - `activity.types.rivalry` (and `activity.filters.*` if needed for the new tab).
  - `dashboard.hottestRivalries`, `dashboard.viewAllRivalries`, `dashboard.noRivalries` (empty state).
- **Backend**: In `getActivity.test.ts`, add a test that with `?type=rivalry` only match_result items with rivalry metadata are returned; and that match_result items between a pair with 3+ matches have `metadata.isRivalryMatch` and `metadata.rivalryMatchCount`. In `getDashboard.test.ts`, assert that the response includes `topRivalries` (array, length ≤ 3 when enough rivalries exist).
- **Frontend**: In `Dashboard.test.tsx`, mock `topRivalries` with 1–3 items and assert the “Hottest Rivalries” section and links render. Optionally add a test for ActivityFeed with a rivalry filter or rivalry badge (test-generator skill if helpful).

## Dependencies and order

- Step 1 must complete first (getRivalries and getDashboard depend on computeRivalries).
- Steps 2 and 3 can run in parallel after Step 1.
- Step 4 (frontend types) should be done before Steps 5 and 6.
- Steps 5 and 6 can run in parallel after Step 4.
- Step 7 (i18n + tests) after Steps 2–6.
- **Suggested order**: Step 1 → Steps 2+3 → Step 4 → Steps 5+6 → Step 7.

## Testing and verification

- **Manual**: (1) Open /activity, use “Rivalry” filter and confirm only rivalry matches appear; confirm rivalry badge on those cards when viewing “All”. (2) Open dashboard, confirm “Hottest Rivalries” shows up to 3 cards with correct data and links.
- **Backend**: Run `backend` tests for activity and dashboard; ensure no regressions and new assertions pass.
- **Frontend**: Run frontend tests; update Dashboard test for topRivalries.
- **Edge cases**: No rivalries (dashboard section empty or hidden). No matches (activity empty). Single rivalry (dashboard shows 1 card).

## Risks and edge cases

- **Backward compatibility**: Dashboard response gains an optional `topRivalries`; clients that don’t expect it can ignore it. Activity response is unchanged in shape; only `metadata` on some items gains new fields.
- **Performance**: getDashboard will do one extra call to computeRivalries (scans players + matches). If this becomes heavy, consider caching or reusing a single scan with the rest of getDashboard.
- **“Hottest” definition**: Use the same sort as getRivalries (match count, championship involvement, recency). Document in plan or code so product can tune later (e.g. “this season only”).
