# Plan: Rivalry Tracker

**GitHub issue:** [#166](https://github.com/jpDxsolo/league_szn/issues/166) — feat: Rivalry Tracker

## Context

Wrestling is built on rivalries, but the app has no way to surface them. Head-to-head exists in Statistics but users must pick two players. This feature automatically detects and displays active rivalries from match history: repeated pairings, series records, and intensity (match count, recency, championship involvement, challenges). A "Rivalries" section shows rivalry cards with both players, series record, recent matches, and intensity badges (Heating Up / Intense / Historic).

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review new endpoint and Rivalries UI |
| Before commit | git-commit-helper | Conventional commit message |
| If API changed | api-documenter | Update OpenAPI for GET /rivalries |
| New components | test-generator | Tests for rivalries API and Rivalries.tsx |

## Agents and parallel work

- **Suggested order**: Step 1 (backend GET /rivalries) → Step 2 (frontend API + Rivalries page + route) → Step 3 (i18n + nav).
- **Agent types**: Step 1 `general-purpose` (backend); Step 2 `general-purpose` (frontend); Step 3 `general-purpose` with i18n focus.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/serverless.yml` | Modify | Add GET /rivalries event and rivalries function |
| New: `backend/functions/rivalries/getRivalries.ts` | Create | Lambda: scan Matches/Players/Championships/Challenges, compute pairings, intensity, return list |
| `frontend/src/services/api/rivalries.api.ts` (or add to existing) | Create/Modify | getRivalries() calling GET /rivalries |
| New: `frontend/src/components/statistics/Rivalries.tsx` | Create | Rivalry cards: both players, series record, recent matches, intensity badge |
| New: `frontend/src/components/statistics/Rivalries.css` | Create | Styles for rivalry cards |
| `frontend/src/App.tsx` | Modify | Add route /stats/rivalries → Rivalries (feature statistics) |
| `frontend/src/config/navConfig.ts` | Modify | Add rivalries under stats if needed (or link from stats index) |
| `frontend/src/i18n/locales/en.json` | Modify | rivalry.* keys (title, intensity badges, series format) |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys, German |
| `backend/docs/openapi.yaml` | Modify | Document GET /rivalries (or run api-documenter after) |

## Implementation steps

### Step 1: Backend GET /rivalries

- Add a new Lambda `rivalries` in `backend/functions/rivalries/getRivalries.ts`.
- In serverless.yml: new function `rivalries` with handler `functions/rivalries/getRivalries.handler`, HTTP GET `rivalries` (public, no auth).
- Handler logic:
  - Scan Matches (completed only), Players, optionally Championships and Challenges (read-only).
  - Build pairings: for each completed match with exactly two participants (or two “sides”), normalize pair key (e.g. sorted playerIds) and aggregate: match count, wins per player, last match date, championship flag.
  - Filter to rivalries meeting a threshold (e.g. ≥3 matches in current season or all-time; configurable).
  - Score “intensity”: match count, recency, championship involvement, active challenges. Assign badge: Heating Up (e.g. 3–4 matches), Intense (5–7), Historic (8+).
  - Return sorted list: `{ rivalries: [{ player1Id, player2Id, player1Wins, player2Wins, matchCount, lastMatchDate, intensityBadge, recentMatchIds?, championshipAtStake? }] }`. Include player summary (name, imageUrl) from Players for each side.
- Use existing `dynamoDb`, `TableNames`, `success`/`badRequest`/`serverError` from backend libs.

### Step 2: Frontend API and Rivalries page

- Add `frontend/src/services/api/rivalries.api.ts`: `getRivalries(seasonId?: string)` → GET `/rivalries` with optional `seasonId` query. Export from `services/api/index.ts`.
- Create `Rivalries.tsx`: fetch rivalries on mount; display a list of rivalry cards. Each card: both players (image + name), series record (e.g. “Player A leads 3–2”), recent matches (links or list), intensity badge (Heating Up 🔥 / Intense 💥 / Historic 👑). Optional: expandable section for full match history.
- Add route in App.tsx: `/stats/rivalries` → `<FeatureRoute feature="statistics"><Rivalries /></FeatureRoute>`.
- Add Rivalries.css for card layout and badges. Follow existing statistics page patterns (PlayerStats, HeadToHeadComparison).

### Step 3: i18n and nav

- Add i18n keys: `rivalries.title`, `rivalries.seriesRecord`, `rivalries.leads`, `rivalries.recentMatches`, `rivalries.intensity.heatingUp`, `rivalries.intensity.intense`, `rivalries.intensity.historic`, `rivalries.noRivalries`. Add to en.json and de.json.
- Ensure Statistics nav (e.g. in PlayerStats or shared stats nav) includes a link to `/stats/rivalries` (e.g. “Rivalries”). Update navConfig or stats subnav if the project uses a stats menu.

## Dependencies and order

- Step 1 must be done first (API contract and data shape).
- Step 2 depends on Step 1 (frontend calls GET /rivalries).
- Step 3 can be done after or in parallel with Step 2; i18n keys are needed for Rivalries.tsx labels.

**Suggested order**: Step 1 → Step 2 → Step 3.

## Testing and verification

- **Manual**: Call GET /rivalries (with and without seasonId); confirm list and intensity. Open /stats/rivalries; confirm cards and series text; switch locale.
- **Existing tests**: No regression on other stats routes.
- **New tests**: Consider unit test for getRivalries aggregation logic; frontend test for Rivalries rendering with mock rivalries (test-generator skill).

## Risks and edge cases

- **Pairing key**: Matches with >2 participants (tag teams): define “rivalry” as between two sides (e.g. team A vs team B) or only singles; document in handler.
- **Performance**: Scan Matches/Players can be heavy; optional seasonId filter and limit (e.g. top 20) recommended.
- **Empty state**: When no rivalries meet threshold, return empty array; frontend shows “No rivalries yet” (i18n).
