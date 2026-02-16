# Plan: Verify and remove mock data for rankings "Last 5" and dashboard matches

**GitHub issue:** [#181](https://github.com/jpDxsoloOrg/league_szn/issues/181) — Replace or verify mock data for rankings "Last 5" and dashboard matches

## Context

User suspects the "Last 5" (form) column in the standings/rankings and the matches listed on the dashboard may be mock or placeholder data. This plan audits the data flow and ensures both features use only real API data (or explicit empty/error states).

## Skills to use

| When | Skill | Purpose |
|------|--------|--------|
| After implementation | code-reviewer | Review changed files |
| Before commit | git-commit-helper | Conventional commit message |
| If new tests added | test-generator | Scaffold or extend tests |

## Agents and parallel work

- **Suggested order**: Step 1 (backend audit) + Step 2 (frontend Standings audit) can run in parallel; Step 3 (frontend Dashboard audit) can run in parallel with Step 2. Step 4 (docs/tests) after audits.
- **Agent types**: general-purpose for code audit and small fixes; test-engineer if adding assertions.

## Files to modify

| File | Action | Purpose |
|------|--------|--------|
| `backend/functions/standings/getStandings.ts` | Audit / Modify | Confirm no mock data; recentForm from completed matches only |
| `backend/functions/dashboard/getDashboard.ts` | Audit / Modify | Confirm recentResults from DynamoDB matches only |
| `frontend/src/components/Standings.tsx` | Audit / Modify | Confirm table and form column use only `standings` from API; no fallback mock |
| `frontend/src/components/Dashboard.tsx` | Audit / Modify | Confirm recent results use only `data.recentResults` from API; no fallback mock |
| `frontend/src/services/api/dashboard.api.ts` | Audit | Confirm no mock response in dev |
| `frontend/src/services/api/standings` or api index | Audit | Confirm no mock response for standings |
| `docs/` or README | Optional | Document data sources for Last 5 and dashboard matches |
| `frontend/src/components/__tests__/Standings.test.tsx` | Optional | Assert form column reflects API `recentForm` (no local mock) |
| `frontend/src/components/__tests__/Dashboard.test.tsx` | Optional | Assert recent results come from API response |

## Implementation steps

### Step 1: Backend — Standings and dashboard data sources

- **getStandings.ts**: Confirm `recentForm` and `currentStreak` are computed only from `completedMatches` (DynamoDB scan with `status = 'completed'`). No hardcoded or seed data in the handler. If any dev-only mock exists, remove or guard so production never uses it.
- **getDashboard.ts**: Confirm `recentResults` is built only from the `matches` scan (completed, sorted, sliced to 5). No inline mock array or fallback. Remove or document any mock path.

### Step 2: Frontend — Standings "Last 5" and table data

- **Standings.tsx**: Trace where the table rows and form column get their data. Ensure they use only `standings` state populated by `standingsApi.get()`. Check for any `mockPlayers`, `mockStandings`, or fallback data when API fails or returns empty. If fallback exists, replace with empty state or error UI (no fake rows).
- **API client**: In `frontend/src/services/api/`, ensure standings API has no mock implementation (e.g. returning fake `recentForm` in dev). Remove or restrict to tests only.

### Step 3: Frontend — Dashboard recent results

- **Dashboard.tsx**: Confirm "Recent Results" (and any match list) renders only `data.recentResults` from `dashboardApi.get()`. Check for any hardcoded list, mock matches, or fallback array. If present, remove and show empty state or error when API fails.
- **API client**: Ensure dashboard API does not return mock data in development. Mock only in tests (e.g. `Dashboard.test.tsx`).

### Step 4: Documentation and tests (optional but recommended)

- Add a short note in CLAUDE.md or a small doc stating: (1) Standings "Last 5" comes from standings API `recentForm` (backend computes from last 5 completed matches per player). (2) Dashboard "Recent Results" comes from dashboard API `recentResults` (backend from DynamoDB completed matches, latest 5).
- Optionally add or extend tests: Standings test asserts that when API returns players with `recentForm`, the form column shows that data (and does not override with mock). Dashboard test asserts that when API returns `recentResults`, those matches are rendered (and no client-side mock list is used).

## Dependencies and order

- Steps 1, 2, and 3 are independent audits and can run in parallel.
- Step 4 depends on Steps 1–3 (document and test once data sources are confirmed).
- **Suggested order**: Steps 1+2+3 → Step 4.

## Testing and verification

- Manually: Load standings page and dashboard in dev; confirm "Last 5" and "Recent Results" match backend (e.g. run backend locally, seed data, compare).
- If backend or frontend had mock data that was removed: run existing unit tests and fix any that relied on mocks (use proper API mocks in tests only).
- New tests: If added, ensure they assert data source (API response) and do not introduce new mock data in production code.

## Risks and edge cases

- **Tests**: Standings and Dashboard tests currently use mocked API responses; that is correct. Ensure mocks stay in test files only and are not imported or used in production components.
- **Empty state**: After removing any mock fallbacks, ensure empty/error states are handled so the UI does not show a blank section without explanation when the API returns empty or fails.
