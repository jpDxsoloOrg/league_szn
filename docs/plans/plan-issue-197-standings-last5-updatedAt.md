# Plan: Standings "Last 5" and Streak by updatedAt

**GitHub issue:** #197 — [Standings "Last 5" sort by updatedAt and ignore matches without updatedAt](https://github.com/jpDxsoloOrg/league_szn/issues/197)

## Context

The standings page shows "Last 5" (form) and streak per player. These should be based on when results were recorded (`updatedAt`), not match date, and should exclude matches without `updatedAt`—matching dashboard recent results behavior.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review changed files |
| Before commit | git-commit-helper | Conventional commit message |
| When adding/updating tests | test-generator | Test scaffolding if needed |

## Agents and parallel work

- **Suggested order**: Step 1 (backend logic + types) → Step 2 (tests). Single flow; no parallel steps.
- **Agent types**: `general-purpose` for implementation; `test-engineer` or `general-purpose` for test updates.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/functions/standings/getStandings.ts` | Modify | Filter completed matches to those with `updatedAt`; sort by `updatedAt` desc in `computeRecentFormAndStreak` so Last 5 and streak both use this set |
| `backend/functions/standings/__tests__/getStandings-allTime.test.ts` | Modify | Add/update tests: last 5 and streak use updatedAt order; matches without updatedAt excluded |

## Implementation steps

### Step 1: Standings logic in getStandings.ts

1. **Filter completed matches to those with `updatedAt`**  
   After the scan that loads completed matches (around line 44–49), filter the array to only include items that have a truthy `updatedAt` (e.g. `completedMatches = completedMatches.filter((m) => m.updatedAt);`). Use the same approach as in `backend/functions/dashboard/getDashboard.ts` (lines 160–166).

2. **Sort by `updatedAt` in `computeRecentFormAndStreak`**  
   In `computeRecentFormAndStreak` (lines 19–38), the match type for the second parameter should include optional `updatedAt: string`.  
   - When building the "last 5" per player, sort by `updatedAt` descending (newest first) instead of by `date`. Use something like:  
     `sort((a, b) => new Date((b as { updatedAt?: string }).updatedAt ?? 0).getTime() - new Date((a as { updatedAt?: string }).updatedAt ?? 0).getTime())`.  
   - Because we already filtered to matches with `updatedAt`, every match in this function will have `updatedAt`; the sort order will define both **recentForm** (last 5 W/L/D) and **currentStreak** (streak from the start of that list). No separate streak-specific logic is needed—streak is already derived from the same list.

3. **Type the match shape**  
   Ensure the completed-match type used when calling `computeRecentFormAndStreak` includes `updatedAt?: string` (or required if we only pass filtered matches). Keep `date` if still used elsewhere; the sort key for "last 5" and streak is `updatedAt`.

### Step 2: Tests

1. **getStandings-allTime.test.ts**  
   - Add or adjust tests so that:  
     - When matches have `updatedAt`, "Last 5" order is by `updatedAt` (newest first).  
     - When some completed matches lack `updatedAt`, they are excluded from last 5 and streak (e.g. only matches with `updatedAt` appear in `recentForm` and drive `currentStreak`).  
   - Update the existing "includes recentForm and currentStreak on each player" test (around lines 159–181) so mock matches include `updatedAt` and the expected order is by `updatedAt` (e.g. give different `updatedAt` values and assert order and streak accordingly).  
   - Add a test that completed matches without `updatedAt` do not appear in recentForm and do not affect streak.

2. **getStandings-season.test.ts**  
   - If season standings also use `computeRecentFormAndStreak` with the same completed matches, no extra test changes are strictly required beyond all-time; optionally add a short assertion that season view also excludes matches without `updatedAt` if we want full coverage.

## Dependencies and order

- Step 2 depends on Step 1 (tests validate the new behavior).
- **Suggested order**: Step 1 → Step 2.

## Testing and verification

- Run backend tests: `cd backend && npm test -- --run getStandings`.
- Manually: load standings (all-time and with a seasonId); confirm "Last 5" and streak reflect results ordered by when they were recorded (e.g. record an old-dated match and confirm it appears in "last 5" by position of recording).
- Confirm dashboard recent results still behave the same (no regression).

## Risks and edge cases

- **Existing data**: Matches recorded before `updatedAt` was added will be excluded from last 5 and streak. This is desired; document in release notes if needed.
- **All matches without updatedAt**: A player with only such matches will get `recentForm: []` and `currentStreak: { type: 'W', count: 0 }`, which is already the existing empty-case behavior.
