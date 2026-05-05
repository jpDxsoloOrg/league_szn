# [RIV-15] Routing, nav, Dashboard surface

**Phase:** 4 — Frontend
**Estimate:** S
**Blocked by:** RIV-08 (Hub), RIV-09 (Detail), RIV-13 (Request form), RIV-14 (Admin panel)
**Blocks:** none
**Reference:** [plan-rivalries.md § Phase 4, steps 24-26](../plan-rivalries.md)

## Goal
Wire the new pages into the app shell: routes, nav entries, and a "My Active Rivalries" card on the Dashboard.

## Scope
**In:** App.tsx route registrations, navConfig entries (wrestler + admin nav groups), Dashboard surface card.
**Out:** Any new pages — those land in their own tickets.

## Subtasks
- [ ] `frontend/src/App.tsx` — register routes:
  - `/rivalries` → `<FeatureRoute feature="rivalries"><RivalryHub /></FeatureRoute>`
  - `/rivalries/new` → `<RequireAuth><RequestRivalry /></RequireAuth>`
  - `/rivalries/:rivalryId` → `<RivalryDetail />`
  - `/rivalries/:rivalryId/:tab` → `<RivalryDetail />` (same component, tab from URL)
  - `/admin/rivalries` → `<AdminRoute><AdminRivalries /></AdminRoute>` (or however admin routes are wrapped today)
- [ ] `frontend/src/config/navConfig.ts`:
  - Add `rivalries` entry to the wrestler nav group, after `promos`. Use the appropriate icon and i18n key.
  - Add `rivalries` entry to the admin `/admin/content` nav group, after `promos`.
- [ ] `frontend/src/components/Dashboard.tsx` — add "My Active Rivalries" card for logged-in wrestlers. Shows top 2-3 active rivalries (call `rivalriesApi.list({ participantId: currentUserPlayerId, status: 'active', limit: 3 })`) with mini-`RivalryCard`s and a "View all" link to `/rivalries?tab=my`. Hide the card entirely for non-logged-in or non-wrestler users.
- [ ] Vitest test: Dashboard card hidden for unauthenticated user, visible for wrestler with active rivalries, hidden for wrestler with no active rivalries.

## Files Touched
- `frontend/src/App.tsx` (modify — routes)
- `frontend/src/config/navConfig.ts` (modify — nav entries)
- `frontend/src/components/Dashboard.tsx` (modify — surface card)
- `frontend/src/components/__tests__/Dashboard.test.tsx` (modify — add the card cases)

## Acceptance Criteria
- Direct navigation to every new route renders the right page without a 404.
- Nav entry highlights when on the corresponding route.
- Dashboard card uses the same visual idiom as the existing dashboard cards (no special styling for this surface).
- Existing nav-config tests (if any) still pass; if they break on index-shifted assertions, update them to reflect the new entry.

## Notes / Risks
- `<FeatureRoute>` is the existing feature-flag wrapper — confirm `feature="rivalries"` corresponds to a feature flag the team will set, or default to enabled for now and document.
- The Dashboard card should fail silently if the API call errors — never block the rest of the dashboard.
