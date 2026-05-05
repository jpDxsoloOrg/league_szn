# [RIV-08] Rivalries Hub page

**Phase:** 4 — Frontend
**Estimate:** L
**Blocked by:** RIV-07
**Blocks:** RIV-15 (routing wires this page in)
**Reference:** [plan-rivalries.md § Phase 4, steps 18-19](../plan-rivalries.md); Stitch mockup `screens/23c257203a23450c855d1b0348adba65`

## Goal
Build the public Rivalries Hub: an Episode-scoped board of rivalry cards with three tabs (Active / My Rivalries / Legacy Archive), filter chips, and a "Recent Rivalry Activity" feed.

## Scope
**In:** `RivalryCard` component, `RivalryHub` page, Episode selector, three tabs, filter chips, activity feed integration, request-rivalry CTA (links to RIV-13's form).
**Out:** Detail page (RIV-09), the request form itself (RIV-13).

## Subtasks
- [ ] `frontend/src/components/rivalries/RivalryCard.tsx` — props: `Rivalry` + resolved player avatars. Renders two wrestler portraits face-off, title, heat meter (1-5 gold flames mapped from heat enum), match count, last-activity timestamp, status pill. Reuse the existing player-avatar component from the challenges feature.
- [ ] `frontend/src/components/rivalries/RivalryHub.tsx` — page layout per Stitch hub mockup. Includes:
  - Page header with display-lg "RIVALRIES" + tagline + Episode selector dropdown (defaults to active Episode).
  - Top-right "Request a Rivalry" gold CTA → navigates to `/rivalries/new`.
  - Three tabs: "Active Rivalries" (status `active`), "My Rivalries" (logged-in wrestler's rivalries — any status), "Legacy Archive" (status `concluded`).
  - Filter chip row: All / Heated / Brewing / Personal / Slow Burn — applies in addition to the tab filter.
  - Grid of `RivalryCard`s (uses `rivalriesApi.list` with combined tab + filter params + selected `eventId`).
  - "Recent Rivalry Activity" feed below the grid (uses `rivalriesApi.getActivity` — see RIV-03; if RIV-03 isn't merged yet, render empty-state placeholder).
- [ ] Empty state for each tab (no rivalries yet, no rivalries match filter, no activity yet).
- [ ] Loading skeletons for the grid and activity feed.
- [ ] Vitest tests: tab switching updates the API filter, chip selection composes with tab filter, "Request a Rivalry" CTA navigates to `/rivalries/new`.

## Files Touched
- `frontend/src/components/rivalries/RivalryCard.tsx` (create)
- `frontend/src/components/rivalries/RivalryHub.tsx` (create)
- `frontend/src/components/rivalries/__tests__/RivalryHub.test.tsx` (create)
- `frontend/src/components/rivalries/__tests__/RivalryCard.test.tsx` (create)

## Acceptance Criteria
- All three tabs render and call `rivalriesApi.list` with the correct `status` and `participantId` filters.
- Episode selector reflects the active Episode by default; switching it refetches the grid.
- Activity feed shows latest 25 mixed-source events; pagination "Load more" appends without duplication.
- Visual fidelity to the Stitch hub mockup — no pure white anywhere, gold accents only on CTAs and active states, sharp 4px corners.
- Lighthouse-style sanity: page TTI under 2s with seed data.

## Notes / Risks
- Episode selector — list comes from existing Events API. If only one Episode exists, hide the selector.
- "My Rivalries" tab is hidden for unauthenticated visitors (or shows "Log in to see your rivalries").
- The Stitch mockup's "EPISODE 01: GENESIS" header label should pull from the selected Event's name + episode number, not be hardcoded.
