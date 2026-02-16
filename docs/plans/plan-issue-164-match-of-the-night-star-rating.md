# Plan: Match of the Night / Star Rating System

**GitHub issue:** [#164](https://github.com/jpDxsolo/league_szn/issues/164) — feat: Match of the Night / Star Rating System

## Context

Completed matches are currently shown without any quality indicator. This plan adds an optional star rating (1–5 stars, half-star increments) and a "Match of the Night" (MOTN) flag. Admins set these when recording a result; public users see ratings on event results and a MOTN badge, plus a "Best Matches" leaderboard in Statistics.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review backend/frontend changes |
| Before commit | git-commit-helper | Conventional commit message |
| If API changed | api-documenter | Update OpenAPI for result body and statistics |
| New/changed behavior | test-generator | Tests for recordResult and statistics section |

## Agents and parallel work

- **Suggested order:** Step 1 (backend: schema + recordResult) → Step 2 (backend: statistics section) + Step 3 (frontend: types + API client) → Step 4 (frontend: RecordResult form + EventDetail/EventResults badges) → Step 5 (frontend: Statistics Best Matches tab + MOTN callout) → Step 6 (i18n + tests).
- **Agent types:** `general-purpose` for backend and frontend; `test-engineer` for tests.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/scripts/create-tables.ts` | Modify | Document optional attributes starRating, matchOfTheNight (DynamoDB is schemaless; no migration required if adding optional fields) |
| `backend/functions/matches/recordResult.ts` | Modify | Accept optional `starRating` (0.5–5.0) and `matchOfTheNight` (boolean) in body; persist to Match item |
| `backend/functions/statistics/getStatistics.ts` | Modify | Add section `match-ratings` (or extend existing): highest-rated matches, per-player average rating; return data for "Best Matches" |
| `backend/docs/openapi.yaml` | Modify | RecordResult request body: optional starRating, matchOfTheNight; document GET /statistics?section=match-ratings |
| `frontend/src/types/index.ts` | Modify | Add `starRating?: number`, `matchOfTheNight?: boolean` to Match interface |
| `frontend/src/services/api/matches.api.ts` | Modify | recordResult: pass optional starRating, matchOfTheNight in body |
| `frontend/src/components/admin/RecordResult.tsx` | Modify | Star rating input (e.g. 0.5–5 step 0.5) and MOTN checkbox on result form |
| `frontend/src/components/events/EventDetail.tsx` | Modify | Show star rating and MOTN badge for completed matches |
| `frontend/src/components/events/EventResults.tsx` | Modify | Show star rating and MOTN badge on results list |
| `frontend/src/services/api/statistics.api.ts` | Modify | Add getMatchRatings(seasonId?) for Best Matches data |
| `frontend/src/App.tsx` | Modify | Add route /stats/best-matches (or tab within existing stats) |
| New Statistics tab or page | Create | "Best Matches" tab: highest rated matches list, optional per-player average |
| `frontend/src/i18n/locales/en.json` | Modify | Keys for star rating labels, MOTN badge, Best Matches |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys in German |
| Backend/frontend tests | Modify | recordResult with starRating/MOTN; statistics section; RecordResult form |

## Implementation Steps

### Step 1: Backend – Match result accepts starRating and matchOfTheNight

- In `backend/functions/matches/recordResult.ts`:
  - Extend `RecordResultBody` to include optional `starRating?: number` (validate 0.5–5.0, half-step) and `matchOfTheNight?: boolean`.
  - In the Match update transaction, add SET clauses for `starRating` and `matchOfTheNight` when provided (use ExpressionAttributeNames/Values).
  - Ensure only one match per event can be MOTN if desired (optional: enforce in backend or leave to admin discretion).
- No DynamoDB table migration: add optional attributes on write. Document in `backend/scripts/create-tables.ts` or a schema comment that Matches may have `starRating` (number) and `matchOfTheNight` (boolean).

### Step 2: Backend – Statistics section for match ratings

- In `backend/functions/statistics/getStatistics.ts`:
  - Add a new section (e.g. `section=match-ratings`): when requested, scan/use completed matches that have `starRating`, compute:
    - List of highest-rated matches (e.g. top 20), with matchId, date, participants, starRating, matchOfTheNight, eventId if available.
    - Per-player average star rating (for matches they participated in).
  - Support optional `seasonId` filter for match-ratings.
  - Return shape: `{ topRatedMatches: [...], playerAverages: [{ playerId, averageRating, matchCount }] }` or similar.

### Step 3: Frontend – Types and API client

- In `frontend/src/types/index.ts`: Add to `Match` interface `starRating?: number` and `matchOfTheNight?: boolean`.
- In `frontend/src/services/api/matches.api.ts`: Update `recordResult` to accept and send optional `starRating` and `matchOfTheNight` in the request body.
- In `frontend/src/services/api/statistics.api.ts`: Add `getMatchRatings(seasonId?: string)` calling GET statistics with `section=match-ratings` and optional seasonId.

### Step 4: Frontend – Record result form and event badges

- In `frontend/src/components/admin/RecordResult.tsx`: Add star rating control (dropdown or stepper 0.5–5.0) and "Match of the Night" checkbox. Include in the payload when calling recordResult.
- In `frontend/src/components/events/EventDetail.tsx`: For each completed match, display star rating (e.g. "★★★★☆") and a "Match of the Night" badge when `matchOfTheNight` is true.
- In `frontend/src/components/events/EventResults.tsx`: Same: show star rating and MOTN badge for each completed match in the results list.

### Step 5: Frontend – Best Matches tab and MOTN callout

- Add a "Best Matches" entry to Statistics (new route e.g. `/stats/best-matches` or a tab in existing Statistics layout). Fetch match-ratings data and display:
  - Table or list of highest-rated matches (date, participants, rating, MOTN badge).
  - Optional: per-player average rating (e.g. in PlayerStats or a small subsection).
- On EventDetail (and optionally EventResults), add a "Match of the Night" callout card when the event has a match with `matchOfTheNight === true` (e.g. highlight that match or show a single MOTN card at top).

### Step 6: i18n and tests

- Add EN/DE keys: star rating label, "Match of the Night" badge text, "Best Matches" title, labels for rating scale.
- Backend: unit test recordResult with body containing starRating and matchOfTheNight; test getStatistics section=match-ratings returns expected shape.
- Frontend: test RecordResult sends starRating/MOTN; snapshot or unit test for EventDetail/EventResults badges; test Best Matches page or tab loads data.

## Dependencies and order

( **Suggested order:** Step 1 → Steps 2+3 → Step 4 → Step 5 → Step 6. )

- Step 2 and 3 can run in parallel after Step 1. Step 4 depends on Step 3. Step 5 depends on Step 2/3 and Step 4. Step 6 last.

## Testing and Verification

- **Manual:** Record a match result with star rating and MOTN; confirm EventDetail and EventResults show badges; open Best Matches and confirm list and averages.
- **Unit:** recordResult handler with optional fields; statistics match-ratings section; RecordResult form payload; i18n keys present.
- **Regression:** Recording result without star rating or MOTN still works; existing statistics sections unchanged.

## Risks and edge cases

- **Backward compatibility:** Existing matches have no starRating/matchOfTheNight; UI should handle undefined (show nothing or "—" for rating, no MOTN badge).
- **MOTN uniqueness:** Issue does not require one MOTN per event; if product wants only one MOTN per event, add validation in recordResult or frontend.
- **Half-star validation:** Enforce 0.5–5.0 in 0.5 steps in backend and frontend.
