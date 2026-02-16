# Plan: Standings Table — Form Dots, Streak Badges, Clickable Names

**GitHub Issue**: [#168](https://github.com/jpDxsoloOrg/league_szn/issues/168)

## Context

The standings table is the most-visited page but shows no player momentum. This plan adds:
1. **Form column** — last 5 match results as colored dots (🟢 W, 🔴 L, ⚪ D)
2. **Streak badges** — 🔥 3W for 3+ win streaks, ❄️ 3L for 3+ loss streaks
3. **Clickable player names** — link to `/stats/player/:playerId`
4. **Hover card (desktop)** — tooltip showing champion status, division, last match result

### Skills to use
- general-purpose (backend + frontend)
- test-engineer (tests)

### Agents and parallel work
- Steps 1+6 can run in parallel (backend + i18n are independent)
- Step 2 depends on Step 1 (types depend on backend shape)
- Steps 3+4+5 can run in parallel after Step 2 (all frontend, independent files)
- Steps 7+8 run in parallel after Steps 3-5 (tests for both ends)

## Files to Modify

| Step | File | Action |
|------|------|--------|
| 1 | `backend/functions/standings/getStandings.ts` | MODIFY — add matches query, compute `recentForm` + `currentStreak` per player |
| 2 | `frontend/src/types/index.ts` | MODIFY — extend `Player` interface with `recentForm` and `currentStreak` |
| 3 | `frontend/src/components/Standings.tsx` | MODIFY — render form dots, streak badges, `<Link>` on player names |
| 4 | `frontend/src/components/PlayerHoverCard.tsx` | NEW — tooltip component |
| 4 | `frontend/src/components/PlayerHoverCard.css` | NEW — hover card styles |
| 5 | `frontend/src/components/Standings.css` | MODIFY — add styles for form dots, streak badges |
| 6 | `frontend/src/i18n/locales/en.json` | MODIFY — add standings.table.form, streak keys |
| 6 | `frontend/src/i18n/locales/de.json` | MODIFY — add German translations |
| 7 | `backend/functions/standings/__tests__/getStandings-season.test.ts` | MODIFY — add tests for recentForm + currentStreak |
| 7 | `backend/functions/standings/__tests__/getStandings-allTime.test.ts` | MODIFY — add tests for recentForm + currentStreak |
| 8 | `frontend/src/components/__tests__/Standings.test.tsx` | MODIFY — add tests for form dots, streak badges, links |

## Implementation Steps

### Step 1: Backend — Extend getStandings with form and streak data

**File**: `backend/functions/standings/getStandings.ts`

Add a query to the Matches table to fetch all completed matches (`status = 'completed'`), sorted by date descending. For each player in the standings:

1. Filter matches where the player is in `participants` and `status === 'completed'`
2. Sort by `date` descending, take the last 5
3. Compute `recentForm`: array of `'W' | 'L' | 'D'` strings based on whether the player is in `winners`, `losers`, or neither (draw)
4. Compute `currentStreak`: starting from the most recent match, count consecutive same-result matches. Return `{ type: 'W' | 'L' | 'D', count: number }`
5. Attach both fields to each player object in the response

Use `dynamoDb.scanAll` on `TableNames.MATCHES` with a filter for `status = 'completed'` once, then compute per-player results in memory (avoids N+1 queries).

### Step 2: Frontend types — Extend Player interface

**File**: `frontend/src/types/index.ts`

Add to the `Player` interface:
```typescript
recentForm?: ('W' | 'L' | 'D')[];
currentStreak?: { type: 'W' | 'L' | 'D'; count: number };
```

These are optional so existing code is not broken when the backend hasn't been deployed yet.

### Step 3: Frontend — Update Standings table rendering

**File**: `frontend/src/components/Standings.tsx`

1. Import `Link` from `react-router-dom`
2. Import the new `PlayerHoverCard` component
3. Add a `<th>` for "Form" column (using i18n key `standings.table.form`) after the Win % column
4. Add a `<th>` for "Streak" column (using i18n key `standings.table.streak`) after Form
5. In each `<tr>`, render:
   - **Player name as `<Link>`**: `<Link to={/stats/player/${player.playerId}}>{player.name}</Link>` wrapped in `PlayerHoverCard`
   - **Form dots**: map `player.recentForm` to colored `<span>` dots (green for W, red for L, gray for D)
   - **Streak badge**: if `player.currentStreak?.count >= 3`, render a badge like `🔥 3W` or `❄️ 3L`
6. Guard with `player.recentForm?.length > 0` checks for when data is absent

### Step 4: Frontend — Create PlayerHoverCard component

**Files**: `frontend/src/components/PlayerHoverCard.tsx`, `frontend/src/components/PlayerHoverCard.css`

A lightweight tooltip wrapper component:
- Props: `player: Player`, `divisions: Division[]`, `children: ReactNode`
- On mouse-enter (desktop only), shows an absolutely-positioned card above/below the trigger
- Card content: division name, champion status (if any — from player data), last match result from `recentForm[0]`
- Uses CSS `position: absolute` and `visibility`/`opacity` for smooth show/hide
- No external tooltip libraries

### Step 5: Frontend — CSS for form dots and streak badges

**File**: `frontend/src/components/Standings.css`

Add styles for:
- `.form-dots` — flex row with gap, centered
- `.form-dot` — small circle (10px), `border-radius: 50%`
- `.form-dot.win` — green (#4ade80)
- `.form-dot.loss` — red (#f87171)
- `.form-dot.draw` — gray (#9ca3af)
- `.streak-badge` — inline badge with padding, rounded corners
- `.streak-badge.hot` — fire theme (orange/red gradient bg)
- `.streak-badge.cold` — ice theme (blue bg)
- `.player-name a` — styled link (inherit color, underline on hover)
- Responsive adjustments at 768px breakpoint

### Step 6: i18n — Add translation keys

**Files**: `frontend/src/i18n/locales/en.json`, `frontend/src/i18n/locales/de.json`

Add to `standings.table`:
- `"form": "Form"` / `"form": "Form"` (same in German — it's a loanword in football context)
- `"streak": "Streak"` / `"streak": "Serie"`

Add to `standings`:
- `"winStreak": "Win Streak"` / `"winStreak": "Siegesserie"`
- `"lossStreak": "Loss Streak"` / `"lossStreak": "Niederlagenserie"`
- `"drawStreak": "Draw Streak"` / `"drawStreak": "Unentschiedenserie"`

### Step 7: Backend tests — Test form and streak computation

**Files**: `backend/functions/standings/__tests__/getStandings-season.test.ts`, `backend/functions/standings/__tests__/getStandings-allTime.test.ts`

Add tests:
1. **recentForm returns last 5 results in order (newest first)** — mock matches with known winners/losers, assert form array
2. **currentStreak computes correctly for win streak** — player with 4 consecutive wins → `{ type: 'W', count: 4 }`
3. **currentStreak computes correctly for loss streak** — `{ type: 'L', count: 3 }`
4. **recentForm is empty array when no completed matches exist** — no matches → `[]`
5. **currentStreak defaults to `{ type: 'W', count: 0 }` when no matches**

Mock the matches scan (`mockScanAll` for Matches table) alongside existing player/standings mocks. The existing mock setup already uses `mockScanAll` for Players, so add a second call expectation.

### Step 8: Frontend tests — Test new standings UI elements

**File**: `frontend/src/components/__tests__/Standings.test.tsx`

Add tests:
1. **Renders form dots for each player** — mock standings with `recentForm` data, assert colored dots appear
2. **Renders streak badge for 3+ win streak** — player with `currentStreak: { type: 'W', count: 5 }` shows 🔥 badge
3. **Does not render streak badge for streak < 3** — player with count 2 shows no badge
4. **Player names are links to stats page** — assert `<a href="/stats/player/p1">` exists
5. **Gracefully handles missing recentForm** — player without `recentForm` renders dashes or empty

Update mock data to include `recentForm` and `currentStreak` fields.

## Dependencies & Order

- Step 1 has no dependencies (backend-only)
- Step 6 has no dependencies (i18n-only)
- Step 2 depends on Step 1 (needs to know backend response shape)
- Steps 3, 4, 5 depend on Step 2 (need updated types)
- Steps 7, 8 depend on Steps 1–5 (test the final code)

**Suggested order**: `Steps 1+6 -> Step 2 -> Steps 3+4+5 -> Steps 7+8`

## Testing & Verification

### Automated Tests
1. **Backend lint**: `cd /home/jpdev/source/league_szn/league_szn/backend && npx eslint functions/ lib/`
2. **Backend tests**: `cd /home/jpdev/source/league_szn/league_szn/backend && npx vitest run`
3. **Frontend lint**: `cd /home/jpdev/source/league_szn/league_szn/frontend && npx eslint src/`
4. **Frontend tests**: `cd /home/jpdev/source/league_szn/league_szn/frontend && npx vitest run`

### Manual Verification
- After deployment, visit the standings page and confirm form dots, streak badges, and clickable player names are visible and functioning correctly.

## Risks & Edge Cases

1. **No completed matches** — recentForm should be `[]`, streak should be `{ type: 'W', count: 0 }`, UI should render gracefully
2. **Draw-only matches** — a match where a player is in `participants` but not in `winners` or `losers` is a draw
3. **Performance** — scanning the entire Matches table could be slow with hundreds of matches; this is acceptable for now since the league is small, but could be optimized later with a GSI or cached computation
4. **Backward compatibility** — `recentForm` and `currentStreak` are optional on the Player type, so the frontend won't break if the backend hasn't been updated yet
