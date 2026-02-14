# TO-DOS

## Code Review Findings - Medium Term - 2026-02-12 09:27

- [ ] **Clarify isAdmin context property naming** - `isAdmin` includes Moderators, which is misleading. **Problem:** `AuthContext.tsx:165` sets `isAdmin: state.groups.includes('Admin') || state.groups.includes('Moderator')` while `hasRole('Admin')` was fixed to exclude Moderators. Used by Sidebar and AdminPanel for access gating. **Files:** `frontend/src/contexts/AuthContext.tsx:165`, `frontend/src/components/Sidebar.tsx:173`, `frontend/src/components/admin/AdminPanel.tsx:42`. **Solution:** Rename to `isAdminOrModerator` for clarity, or add a comment documenting the intentional inclusion.

- [ ] **Decouple recalculations from recordResult** - Background work blocks API response. **Problem:** `triggerRankingRecalculation()` and `recalculateCosts()` are now awaited, adding 3-8+ seconds of full-table scans to every match result recording. The immediate timeout fix (29s) is applied, but the core architecture issue remains. **Files:** `backend/functions/matches/recordResult.ts:672-683`. **Solution:** Move to async Lambda invocation (`InvocationType: 'Event'`), SQS queue, or DynamoDB Streams on match status changes.

## Match Type Breakdown UI Redundancy - 2026-02-13 14:12

- [ ] **Remove or differentiate match type breakdown bars from stats table** - The match type breakdown bars on the player profile/stats page duplicate the same information shown in the table below them. **Problem:** Two UI elements (horizontal bars and table) display identical match type data, adding visual clutter without providing additional insight. **Files:** Need to identify the specific component rendering the profile stats page (likely in `frontend/src/components/` — player profile or statistics section). **Solution:** Either remove the breakdown bars entirely, or change them to show different data (e.g., win rate per match type, trends over time) so they complement rather than duplicate the table.

## Admin Match Types Management - 2026-02-13 14:14

## Refactor api.ts Into Feature Modules - 2026-02-13 15:28

- [ ] **Split api.ts into per-feature API modules** - Break the monolithic API client into smaller, domain-specific files. **Problem:** `frontend/src/services/api.ts` is ~650 lines containing all API endpoint definitions (players, matches, championships, tournaments, standings, seasons, divisions, images, admin, etc.) in a single file. Large single-file API clients are harder to navigate, review, and maintain. **Files:** `frontend/src/services/api.ts:1-650` (split into multiple files), `frontend/src/services/` (new directory structure). **Solution:** Create per-feature modules (e.g., `players.api.ts`, `matches.api.ts`, `championships.api.ts`, `tournaments.api.ts`, `seasons.api.ts`, `divisions.api.ts`, `images.api.ts`, `admin.api.ts`) that each export their domain's API methods. Keep shared utilities (`fetchWithAuth`, base URL config, common types) in a shared `apiClient.ts` or `api-utils.ts`. Re-export everything from an `index.ts` barrel file to preserve existing import paths.
