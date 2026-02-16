# Plan: Statistics — star-rating aggregates (average, 5-star count, MOTN)

**GitHub issue:** [#183](https://github.com/jpDxsolo/league_szn/issues/183) — Statistics: add star-rating aggregates (average, 5-star count, MOTN count)

## Context

The statistics area has a Best Matches page that shows highest-rated matches and per-player average ratings. Users want to see league-wide star-rating metrics at a glance: average star rating, number of 5-star matches, number of matches of the night, and other interesting rating-related stats.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review backend and frontend changes |
| Before commit | git-commit-helper | Conventional commit message |
| If statistics API response shape changes | api-documenter | Update API docs for match-ratings section |

## Agents and parallel work

- **Suggested order**: Step 1 (backend aggregates) → Step 2 (frontend types + API client) → Step 3 (Best Matches UI + i18n). Steps 2 and 3 can partially overlap (types/API then UI).
- **Agent types**: General-purpose for backend and frontend; no special security/test wave unless adding tests.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/functions/statistics/getStatistics.ts` | Modify | In `match-ratings` case: compute and return `averageStarRating`, `fiveStarCount`, `matchOfTheNightCount`, optionally `ratingDistribution` and/or `ratedMatchCount` / `totalCompletedCount` |
| `frontend/src/services/api/statistics.api.ts` | Modify | Extend `MatchRatingsResponse` with new aggregate fields; ensure types match backend |
| `frontend/src/components/statistics/BestMatches.tsx` | Modify | Add summary block (cards or stats row) at top showing average rating, 5-star count, MOTN count; optionally distribution or “most 5-star” by player |
| `frontend/src/i18n/locales/en.json` | Modify | Add keys for new stats (e.g. `statistics.bestMatches.averageStarRating`, `fiveStarCount`, `matchOfTheNightCount`, distribution labels) |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys, German translations |
| `frontend/src/components/statistics/BestMatches.css` | Modify | Styles for new summary block |

## Implementation steps

### Step 1: Backend — extend match-ratings response

In `backend/functions/statistics/getStatistics.ts`, in the `case 'match-ratings':` block (around 458–491):

1. Reuse existing `ratedMatches` (completed matches with a numeric `starRating`).
2. Compute:
   - **averageStarRating**: sum of `starRating` / `ratedMatches.length`, rounded (e.g. to 1 decimal). If no rated matches, return `null` or omit.
   - **fiveStarCount**: count of rated matches where `starRating === 5` (or `>= 4.5` if half-stars count as “5”).
   - **matchOfTheNightCount**: count of completed matches where `matchOfTheNight === true` (scan `allCompletedMatches`).
   - **ratedMatchCount**: `ratedMatches.length`; **totalCompletedCount**: `allCompletedMatches.length` (so frontend can show “X of Y matches rated” if desired).
   - Optional: **ratingDistribution**: object like `{ 5: number, 4.5: number, ... }` for counts per rating value (0.5–5 in half steps), to show a simple distribution.
3. Add these fields to the success response alongside `highestRatedMatches` and `playerAverageRatings`.

Clarification: “5-star” = exactly 5.0; MOTN count is over all completed matches. No `seasonId` filter in this step unless the team agrees to add it later (issue notes say optional).

### Step 2: Frontend — types and API client

1. In `frontend/src/services/api/statistics.api.ts` (or shared types), extend `MatchRatingsResponse` with:
   - `averageStarRating?: number | null`
   - `fiveStarCount?: number`
   - `matchOfTheNightCount?: number`
   - `ratedMatchCount?: number`
   - `totalCompletedCount?: number`
   - `ratingDistribution?: Record<number, number>` (optional)
2. No change to the `getMatchRatings()` call signature; it already returns the full response. Ensure the frontend does not assume these keys are absent (optional chaining / fallbacks).

### Step 3: Best Matches page — summary block and i18n

1. In `BestMatches.tsx`, after loading `ratingsRes` from `statisticsApi.getMatchRatings()`:
   - Read `ratingsRes.averageStarRating`, `ratingsRes.fiveStarCount`, `ratingsRes.matchOfTheNightCount`, and optionally `ratedMatchCount` / `totalCompletedCount` and `ratingDistribution`.
   - Render a summary section at the top of the content (below nav, above the list): e.g. cards or a single row showing:
     - Average star rating (with star icon or “X.X / 5”).
     - Number of 5-star matches.
     - Number of matches of the night.
     - Optional: “X of Y matches rated” and/or a minimal distribution (e.g. bars or counts per star tier).
   - If backend returns no rated matches, show a friendly message (e.g. “No rated matches yet”) and hide or zero out aggregates as appropriate.
2. Add translation keys in `frontend/src/i18n/locales/en.json` under `statistics.bestMatches` (or a nested key): e.g. `averageStarRating`, `fiveStarCount`, `matchOfTheNightCount`, `ratedMatchesSummary`, `noRatedMatchesYet`. Add the same keys in `de.json` with German translations.
3. Add or reuse CSS in `BestMatches.css` for the summary block (layout, cards, typography) to match existing statistics pages (e.g. Leaderboards, Record Book).

### Step 4: Optional extras (if time)

- **Most 5-star appearances**: Backend already returns `playerAverageRatings`; could add a “fiveStarAppearances” per player (count of rated matches with rating === 5 they participated in) in the same `match-ratings` response and show a small “Most 5-star matches” leaderboard on Best Matches.
- **Season filter**: If other statistics sections support `seasonId`, add optional `seasonId` to the match-ratings section and filter `allCompletedMatches` / `ratedMatches` by it; pass through from frontend dropdown if present.

## Dependencies and order

- Step 1 must be done first (backend contract).
- Step 2 depends on Step 1 (types mirror backend).
- Step 3 depends on Step 2 (use new response fields and i18n).
- **Suggested order**: Step 1 → Step 2 → Step 3; Step 4 optional after 3.

## Testing and verification

- **Manual**: Open Best Matches with data that has mixed ratings and some MOTN; confirm average, 5-star count, and MOTN count match expectations. Test with no rated matches (empty state).
- **Backend**: Consider a quick sanity check (e.g. run getStatistics locally with `section=match-ratings` and assert new keys exist).
- **Existing tests**: Any tests that mock `getMatchRatings` or the statistics API should include the new optional fields or remain backward-compatible (optional fields).

## Risks and edge cases

- **Backward compatibility**: New fields are additive; old clients ignore them. No breaking change.
- **Empty data**: When there are zero rated matches, `averageStarRating` should be undefined or null; avoid division by zero in backend.
- **MOTN count**: Count only completed matches with `matchOfTheNight === true`; ensure backend does not count scheduled matches.
