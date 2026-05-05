# [RIV-10] Detail tabs: Match History, Future Matches, Promos

**Phase:** 4 — Frontend
**Estimate:** M
**Blocked by:** RIV-09 (shell), RIV-06 (rivalryId on matches/promos)
**Blocks:** none
**Reference:** [plan-rivalries.md § Phase 4, step 20](../plan-rivalries.md)

## Goal
Three lighter content tabs on the Rivalry Detail page — pulling matches and promos already tagged with the rivalry's `rivalryId`.

## Scope
**In:** `MatchHistoryTab.tsx`, `FutureMatchesTab.tsx`, `PromosTab.tsx`, with deep-links to existing schedule/compose flows pre-filled with `rivalryId`.
**Out:** New schedule or compose UIs — reuse existing flows. Notes & Plans (RIV-11). Messages (RIV-12).

## Subtasks
- [ ] `frontend/src/components/rivalries/tabs/MatchHistoryTab.tsx` — calls `matchesApi.list({ rivalryId, status: 'completed' })`. Renders a list of completed matches between the pair (reuse existing match list components if they accept a list prop; otherwise a simple list with date, stipulation, winner). Empty state.
- [ ] `frontend/src/components/rivalries/tabs/FutureMatchesTab.tsx` — calls `matchesApi.list({ rivalryId, status: 'scheduled' })`. Renders scheduled matches. Admin-only "Schedule Match for this Rivalry" CTA → navigates to `ScheduleMatch.tsx` pre-filled with the pair + `rivalryId` via React Router state (analog of the challenge→schedule flow described in TO-DOS.md line 17). Empty state.
- [ ] `frontend/src/components/rivalries/tabs/PromosTab.tsx` — calls `promosApi.list({ rivalryId })`. Renders promo cards with reactions (reuse `PromoCard`). "Cut a Promo" CTA → navigates to `PromoEditor` pre-filled with `rivalryId` and `targetPlayerId` (the opponent) via React Router state. Empty state.
- [ ] Update `frontend/src/components/admin/ScheduleMatch.tsx` to accept and persist a `rivalryId` from React Router state (if not already wired by RIV-06's plan).
- [ ] Update `frontend/src/components/promos/PromoEditor.tsx` to accept and persist a `rivalryId` from React Router state.
- [ ] Vitest tests for each tab: list rendering, empty state, CTAs navigate with correct state.

## Files Touched
- `frontend/src/components/rivalries/tabs/MatchHistoryTab.tsx` (create)
- `frontend/src/components/rivalries/tabs/FutureMatchesTab.tsx` (create)
- `frontend/src/components/rivalries/tabs/PromosTab.tsx` (create)
- `frontend/src/components/admin/ScheduleMatch.tsx` (modify — accept rivalryId from router state)
- `frontend/src/components/promos/PromoEditor.tsx` (modify — accept rivalryId from router state)
- `frontend/src/components/rivalries/tabs/__tests__/*.test.tsx` (create)

## Acceptance Criteria
- Each tab fetches only its own data, lazily on tab open.
- Schedule-Match CTA from Future Matches tab pre-fills participants AND `rivalryId`; the resulting match appears in both this tab (after refresh) and the rivalry's Match History after the match is recorded.
- Cut-a-Promo CTA from Promos tab pre-fills `rivalryId` and the opposing wrestler as the target.
- Empty states are visually distinct from loading states (no infinite spinner if the list is genuinely empty).

## Notes / Risks
- The existing `ScheduleMatch.tsx` and `PromoEditor.tsx` modifications must be backwards-compatible — no rivalryId passed should still work as before.
- If the schedule flow is being reworked by the [TO-DOS.md](../TO-DOS.md) "Challenge & Promo to Match Scheduling" entries (line 17), coordinate to add `rivalryId` to the same router-state shape they introduce, not a separate one.
