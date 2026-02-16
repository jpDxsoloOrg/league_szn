# Plan: Rivalry Tracker

**GitHub issue:** [#166](https://github.com/jpDxsolo/league_szn/issues/166) — feat: Rivalry Tracker

## Context

The app has no way to surface active rivalries. This plan adds automatic detection of rivalries from match history (repeated pairings in the current season), a new GET /rivalries endpoint, and a Rivalries page with cards showing both players, series record, recent matches, championship at stake, and intensity badges (Heating Up / Intense / Historic).

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review backend logic and frontend components |
| Before commit | git-commit-helper | Conventional commit message |
| If API changed | api-documenter | Update OpenAPI for GET /rivalries |
| New behavior | test-generator | Tests for rivalries handler and Rivalries page |

## Agents and parallel work

- **Suggested order:** Step 1 (backend: rivalries Lambda + scoring) → Step 2 (API client + types) + Step 3 (Rivalries page + cards) → Step 4 (i18n + nav + optional Rivalry of the Week) → Step 5 (tests + docs).
- **Agent types:** `general-purpose` for backend and frontend; `test-engineer` for tests.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/functions/rivalries/` (new) | Create | Lambda handler: GET /rivalries, analyze Matches for pairings, score intensity, return sorted list |
| `backend/serverless.yml` | Modify | Add rivalries function and HTTP GET /rivalries route |
| `backend/docs/openapi.yaml` | Modify | Document GET /rivalries response schema |
| `frontend/src/services/api/rivalries.api.ts` | Create | getRivalries(seasonId?) |
| `frontend/src/types/index.ts` | Modify | Add Rivalry, RivalryMatch types (or in api types) |
| `frontend/src/components/rivalries/Rivalries.tsx` | Create | Page with rivalry cards; optional featured "Rivalry of the Week" |
| `frontend/src/components/rivalries/RivalryCard.tsx` | Create | Card: both players (images), series record, recent matches, intensity badge |
| `frontend/src/App.tsx` | Modify | Add route /rivalries (feature-gate if needed) |
| `frontend/src/components/Sidebar.tsx` (or nav) | Modify | Add Rivalries link |
| `frontend/src/i18n/locales/en.json` | Modify | Rivalries title, intensity badges, series record format |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys in German |
| Backend/frontend tests | Modify | Rivalries handler; Rivalries page load |

## Implementation Steps

### Step 1: Backend – GET /rivalries endpoint and scoring

- Create `backend/functions/rivalries/` (e.g. `getRivalries.ts` or `handler.ts`):
  - Scan or query Matches (completed only); optionally filter by `seasonId` (query param).
  - For each completed match, derive pair(s) of opponents: for singles use (winners[0], losers[0]) or participants; for tag, use team aggregates or skip (configurable). Normalize pair to sorted [playerIdA, playerIdB] so A < B for consistency.
  - Aggregate by pair: match count, list of recent matches (matchId, date, championshipId, etc.), wins per player.
  - Score "rivalry intensity" from: match count (e.g. 3+ = Heating Up, 5+ = Intense, 10+ = Historic), recency (recent matches boost), championship involvement (title matches boost), optional: active challenges between the two (read Challenges table).
  - Sort by intensity score descending; return top N (e.g. 20) rivalries. Each item: playerIds [idA, idB], series record { winsA, winsB }, recentMatches[], intensity badge key, optional championshipId at stake.
  - Read Players (for names, images), Championships (for at-stake), Challenges (optional) — all read-only.
- In `backend/serverless.yml`: Add rivalries function, attach to API Gateway GET /rivalries (public or feature-gated as per project).

### Step 2: Frontend – API client and types

- Define types: `Rivalry { playerIds: [string, string], playerA: { playerId, name, imageUrl? }, playerB: {...}, winsA: number, winsB: number, recentMatches: RivalryMatch[], intensity: 'heating-up' | 'intense' | 'historic', championshipId?: string }`, `RivalryMatch { matchId, date, championshipId? }`.
- Create `frontend/src/services/api/rivalries.api.ts`: `getRivalries(seasonId?: string)` calling GET /rivalries with optional seasonId.

### Step 3: Frontend – Rivalries page and RivalryCard

- Create `frontend/src/components/rivalries/Rivalries.tsx`: Fetch rivalries; render list of RivalryCards. Optional: pick first or highest-rated as "Rivalry of the Week" and show as featured card at top.
- Create `frontend/src/components/rivalries/RivalryCard.tsx`: Display both players (avatar/name), series record (e.g. "AJ Styles leads 3-2"), recent matches (expandable or inline), intensity badge (Heating Up 🔥 / Intense 💥 / Historic 👑), optional championship at stake. Clicking card can expand to full match history or link to head-to-head.
- Add route in `App.tsx`: e.g. `/rivalries` → Rivalries page (inside FeatureRoute for "statistics" or equivalent if desired).
- Add "Rivalries" to sidebar/nav (e.g. near Statistics).

### Step 4: i18n and optional Rivalry of the Week

- Add EN/DE keys: "Rivalries", "Heating Up", "Intense", "Historic", series record format ("{name} leads {winsA}-{winsB}", "Tied {winsA}-{winsB}"), "Recent matches", "Rivalry of the Week".
- If implementing Rivalry of the Week: use first item or highest intensity as featured; style differently (larger card or callout).

### Step 5: Tests and docs

- Backend: unit test rivalries handler — mock DynamoDB scan/query, assert pair aggregation, intensity scoring, and response shape.
- Frontend: test Rivalries page loads and displays cards; test RivalryCard with mock data.
- OpenAPI: document GET /rivalries query params (seasonId), response schema.

## Dependencies and order

( **Suggested order:** Step 1 → Steps 2+3 (parallel) → Step 4 → Step 5. )

- **Suggested order:** Step 1 → Steps 2+3 (parallel) → Step 4 → Step 5.
- Step 2 and 3 can run in parallel after Step 1. Step 4 and 5 after 2+3.

## Testing and Verification

- **Manual:** Open /rivalries; confirm cards show for pairs with 3+ matches; verify series record and intensity badges; expand or link to match history.
- **Unit:** Rivalries handler aggregation and scoring; API client; Rivalries/RivalryCard render.
- **Regression:** Statistics and matches pages unchanged.

## Risks and edge cases

- **Tag / multi-way matches:** Define how to derive "pair" for tag or triple-threat (e.g. treat as multiple pairs or skip; document in plan).
- **Empty state:** When no rivalries meet threshold, show empty state message (i18n).
- **Performance:** Scanning all matches is acceptable for small/medium leagues; if needed, add caching or limit to current season by default.
