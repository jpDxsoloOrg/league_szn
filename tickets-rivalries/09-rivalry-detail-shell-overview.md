# [RIV-09] Rivalry Detail shell + Overview tab

**Phase:** 4 — Frontend
**Estimate:** L
**Blocked by:** RIV-07
**Blocks:** RIV-10, RIV-11, RIV-12 (other tabs plug into the shell)
**Reference:** [plan-rivalries.md § Phase 4, steps 20-21](../plan-rivalries.md); Stitch mockup `screens/3e9ac9e3e3084994a0d597fe237f582a`

## Goal
The hub page for a single rivalry: cinematic hero header, stat strip, tab bar, and the default Overview tab content.

## Scope
**In:** `RivalryDetail.tsx` page shell with hero + stat strip + tab routing, `OverviewTab.tsx`, "Message GM" floating button.
**Out:** Match History / Future Matches / Promos / Notes & Plans / Messages tabs (RIV-10, RIV-11, RIV-12).

## Subtasks
- [ ] `frontend/src/components/rivalries/RivalryDetail.tsx` — page layout:
  - Hero header: two wrestler portraits face-off across full width with display-lg gold names + "vs" divider.
  - Stat strip below hero: head-to-head record (e.g., "5W - 3L - 1D"), match count, heat meter, status pill, "Days to Next Event" countdown.
  - Tab bar with 6 entries: Overview (default), Match History, Future Matches, Promos, Notes & Plans, Messages.
  - URL-driven tab routing: `/rivalries/:rivalryId` defaults to overview; `/rivalries/:rivalryId/:tab` switches.
  - Floating bottom-right "Message GM" gold button → navigates to `…/messages`.
  - Loading skeleton for the hero strip while `rivalriesApi.get` fetches.
  - 404 / not-authorized handling.
- [ ] `frontend/src/components/rivalries/tabs/OverviewTab.tsx` — two-column layout per Stitch detail mockup:
  - Left column: "Storyline Notes" card (collapsed view of recent notes, link to Notes & Plans tab) + "GM Plans" timeline (preview of next 3 entries, link to Notes & Plans tab; respects role-based visibility — wrestlers see only `participants`/`public` plans).
  - Right column: "Next Match" card (scheduled match details with date, stipulation, championship at stake) + "Recent Promos" preview (3 most recent, deep-link to Promos tab) + "Last 5 Encounters" mini-leaderboard.
  - Empty states for each section.
- [ ] Vitest tests: tab routing reflects URL, "Message GM" button navigates to messages tab, OverviewTab respects note visibility for wrestler vs GM caller.

## Files Touched
- `frontend/src/components/rivalries/RivalryDetail.tsx` (create)
- `frontend/src/components/rivalries/tabs/OverviewTab.tsx` (create)
- `frontend/src/components/rivalries/__tests__/RivalryDetail.test.tsx` (create)
- `frontend/src/components/rivalries/tabs/__tests__/OverviewTab.test.tsx` (create)

## Acceptance Criteria
- Tab bar's 6 entries are present even before RIV-10/11/12 land — those tabs render placeholder content until their tickets ship.
- Deep-linking to `/rivalries/{id}/messages` opens the Messages tab placeholder, not the Overview tab.
- Visual fidelity to the Stitch detail mockup — hero portraits dominate the viewport, "vs" divider in primary gold.
- The "Days to Next Event" countdown comes from the hydrated payload's next-event field (RIV-02's `getRivalry`).

## Notes / Risks
- The hero portraits are heavy assets — lazy-load and use `decoding="async"`.
- If both wrestlers don't have portraits uploaded, fall back to silhouette placeholders consistent with the existing player-avatar component.
- This ticket is the structural shell — the content tabs are deliberately split so they can be parallelized after this lands.
