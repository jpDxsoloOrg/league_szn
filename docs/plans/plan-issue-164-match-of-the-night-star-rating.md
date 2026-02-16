# Plan: Match of the Night / Star Rating System

**GitHub issue:** [#164](https://github.com/jpDxsolo/league_szn/issues/164) — feat: Match of the Night / Star Rating System

## Context

After events conclude there is no way to highlight standout matches or track match quality. This feature adds a star rating (1–5 stars, half-star increments) and an optional "Match of the Night" flag for completed matches. Admins set these when recording results; public users see ratings and MOTN badges on event pages, and a "Best Matches" leaderboard in Statistics.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review record result and statistics changes |
| Before commit | git-commit-helper | Conventional commit message |
| If API changed | api-documenter | Update OpenAPI for match result and statistics |
| New behavior | test-generator | Tests for recordResult payload and stats section |

## Agents and parallel work

- **Suggested order**: Step 1 (backend: Match fields + recordResult) → Step 2 (backend: statistics section) → Step 3 (frontend: RecordResult form) → Step 4 (frontend: EventDetail, EventResults, Statistics Best Matches) → Step 5 (i18n).
- **Agent types**: Steps 1–2 `general-purpose` (backend); Steps 3–4 `general-purpose` (frontend); Step 5 `general-purpose` (i18n).

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/functions/matches/recordResult.ts` | Modify | Accept optional starRating, matchOfTheNight in body; persist to Match |
| `backend/functions/statistics/getStatistics.ts` | Modify | Add section `match-ratings` (highest rated matches, per-player average) |
| `frontend/src/services/api/matches.api.ts` | Modify | recordResult payload type: optional starRating, matchOfTheNight |
| `frontend/src/components/admin/RecordResult.tsx` | Modify | Star rating input (e.g. 0.5–5) and MOTN checkbox on result form |
| `frontend/src/components/events/EventDetail.tsx` | Modify | Show star rating and MOTN badge on match cards |
| `frontend/src/components/events/EventResults.tsx` | Modify | Show star rating and MOTN badge on results |
| New: `frontend/src/components/statistics/BestMatche.tsx` or tab in existing | Create/Modify | "Best Matches" list from statistics match-ratings |
| `frontend/src/services/api/statistics.api.ts` | Modify | getMatchRatings() for new section |
| `frontend/src/App.tsx` | Modify | Route for Best Matches if new page, or tab in stats |
| `frontend/src/i18n/locales/en.json` | Modify | starRating, matchOfTheNight, bestMatches, MOTN badge |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys, German |

## Implementation steps

### Step 1: Backend — Match fields and recordResult

- Matches table: document that `starRating` (number, 0.5–5.0) and `matchOfTheNight` (boolean) are optional attributes; no migration required (DynamoDB schema-less).
- In `recordResult.ts`: extend `RecordResultBody` with optional `starRating?: number` and `matchOfTheNight?: boolean`. Validate starRating in range [0.5, 5] in 0.5 steps if present. In the UpdateExpression for the match, SET starRating and matchOfTheNight when provided (use conditional expression or separate SET clauses). Return updated match including these fields.

### Step 2: Backend — Statistics match-ratings section

- In `getStatistics.ts`: add case `match-ratings`. Load completed matches that have `starRating`; sort by starRating desc, take top N (e.g. 20). Also compute per-player average star rating (for matches they participated in). Return `{ highestRatedMatches: MatchSummary[], playerAverageRatings: { playerId, averageRating, matchCount }[] }`. MatchSummary: matchId, date, starRating, matchOfTheNight, participants (or winner/loser), eventId if available.

### Step 3: Frontend — Record result form

- In `RecordResult.tsx`: add state for starRating (number | '') and matchOfTheNight (boolean). Add UI: star rating selector (e.g. 1–5 in 0.5 steps, or dropdown) and checkbox "Match of the Night". On submit, include starRating and matchOfTheNight in the payload to `matchesApi.recordResult`. Update `matches.api.ts` and frontend Match type to include optional starRating and matchOfTheNight.

### Step 4: Frontend — Event pages and Best Matches

- **EventDetail.tsx** and **EventResults.tsx**: when rendering a completed match, if match.starRating show a small star display (e.g. "★ 4.5"); if match.matchOfTheNight show a "Match of the Night" badge (gold/highlight). Use i18n for label.
- **Statistics**: add a way to show "Best Matches" — either a new route `/stats/best-matches` and component `BestMatches.tsx`, or a tab/section on an existing stats page. Fetch statistics section `match-ratings` and display highest rated matches list (match, date, rating, MOTN, participants). Add link in stats nav.

### Step 5: i18n

- Add keys: `match.starRating`, `match.matchOfTheNight`, `match.matchOfTheNightBadge`, `statistics.bestMatches.title`, `statistics.bestMatches.noData`, etc. EN and DE.

## Dependencies and order

- Step 1 must be done first (API and data shape).
- Step 2 depends on Step 1 (reads new fields).
- Step 3 depends on Step 1 (sends new fields).
- Step 4 depends on Step 2 for Best Matches and on Step 1 for event display.
- Step 5 can be done in parallel with Steps 3–4.

**Suggested order**: Step 1 → Steps 2+3 (parallel) → Step 4 → Step 5.

## Testing and verification

- **Manual**: Record a result with star rating and MOTN; confirm event detail and results show badge/rating; open Best Matches and see the match. Change locale.
- **Existing tests**: recordResult tests may need to allow new optional fields; event components may need updated mocks.
- **New tests**: recordResult with starRating and matchOfTheNight; statistics match-ratings section.

## Risks and edge cases

- **Backward compatibility**: Existing matches have no starRating/matchOfTheNight; frontend must handle undefined (show nothing).
- **One MOTN per event**: Issue does not require enforcing "only one MOTN per event"; admin can set multiple. Optional future constraint.
- **Validation**: Backend must reject starRating outside 0.5–5 or non-half-step values if desired.
