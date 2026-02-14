# Plan: Challenge & Promo to Match Scheduling and Lifecycle Management

## Context

This work covers five related behaviors: (1) turning an accepted challenge into a scheduled match with pre-filled data and backend linkage; (2) doing the same for call-out promos; (3) hiding resolved challenges from the public challenge board; (4) hiding scheduled/resolved call-out promos from the public promo feed; (5) giving admins the ability to delete individual challenges/promos and to bulk-clear resolved ones. Together they complete a consistent lifecycle from challenge/promo to match and cleanup.

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/components/admin/AdminChallenges.tsx` | Modify | Pass challenge data via `navigate(..., { state })` when "Schedule" is clicked; add per-row delete button and "Clear Resolved" bulk action with confirmation modal. |
| `frontend/src/components/admin/ScheduleMatch.tsx` | Modify | Read `useLocation().state` for `fromChallenge` and `fromPromo`; pre-fill participants, matchFormat, stipulationId when present; pass `challengeId` / `promoId` in schedule payload; clear state after submit or when choosing to discard. |
| `frontend/src/components/admin/AdminPromos.tsx` | Modify | Add "Schedule Match" button for call-out promos only (in actions column); navigate to schedule with state; add per-row delete and "Clear Resolved" bulk action with confirmation. |
| `frontend/src/components/challenges/ChallengeBoard.tsx` | Modify | Restrict displayed challenges to statuses `pending`, `countered`, `accepted` (filter after fetch or via API param). Remove `scheduled` from "active" and "accepted" filter tabs. |
| `frontend/src/services/api/challenges.api.ts` | Modify | Add `delete(challengeId)`, `bulkDelete(filters?)` (e.g. `{ statuses: string[] }`). |
| `frontend/src/services/api/promos.api.ts` | Modify | Add `delete(promoId)`, `bulkDelete(filters?)` (e.g. `{ isHidden?: boolean }` or `statuses` if added). |
| `frontend/src/services/api/matches.api.ts` | Modify | Extend `schedule` payload type to include optional `challengeId` and `promoId` (types only; backend already receives body). |
| `frontend/src/types/index.ts` | Modify | Add optional `challengeId?: string` and `promoId?: string` to `ScheduleMatchInput`; ensure `Match` interface has optional `challengeId?`, `promoId?` if shown in UI. |
| `backend/functions/matches/scheduleMatch.ts` | Modify | Accept optional `challengeId` and `promoId` in body; after creating match, if `challengeId` present update challenge (status `scheduled`, `matchId`); if `promoId` present update promo (`isHidden: true`, optional `matchId`). Persist `challengeId`/`promoId` on match item. |
| `backend/functions/challenges/getChallenges.ts` | Modify | Support multi-status filter for public board (e.g. `statuses=pending,countered,accepted` or single `status` only and client filters). Prefer single `status` and client-side filter for minimal backend change, or add `statuses` query param. |
| `backend/functions/challenges/` | Create | New handler `deleteChallenge.ts`: validate admin, delete by `challengeId`. |
| `backend/functions/challenges/` | Create | New handler `bulkDeleteChallenges.ts`: body `{ statuses?: string[] }`, admin-only, delete challenges whose status is in the list (e.g. cancelled, expired, scheduled). |
| `backend/functions/promos/` | Create | New handler `deletePromo.ts`: admin/moderator, delete by `promoId`. |
| `backend/functions/promos/` | Create | New handler `bulkDeletePromos.ts`: body `{ isHidden?: boolean }` or similar, delete promos matching filter. |
| `backend/functions/promos/adminUpdatePromo.ts` | Modify | Optionally support `matchId` in updates so promo can be linked when scheduled (if storing link on promo). |
| `backend/serverless.yml` | Modify | Register HTTP events for `DELETE /challenges/{challengeId}`, `POST /challenges/bulk-delete`, `DELETE /promos/{promoId}`, `POST /promos/bulk-delete` with admin authorizer. |
| `backend/lib/response.ts` | (no change) | Already has helpers. |
| `frontend/src/types/challenge.ts` | (no change) | Already has `status: 'scheduled'` and `matchId?`. |
| `frontend/src/types/promo.ts` | (no change) | Already has `isHidden`, `matchId?`. |
| i18n (e.g. `frontend/public/locales/`) | Modify | Add keys for "Schedule Match", "Clear Resolved", "Delete", confirmation messages for bulk delete, and any new challenge/promo admin strings. |
| `frontend/src/components/admin/AdminChallenges.css` | Modify | Styles for delete button and bulk action. |
| `frontend/src/components/admin/AdminPromos.css` | Modify | Styles for Schedule Match button, delete, bulk action. |
| Tests: `backend/functions/challenges/__tests__/getChallenges.test.ts` | Modify | If backend adds `statuses` filter, add tests. |
| Tests: `backend/functions/matches/__tests__/scheduleMatch.test.ts` | Modify | Add cases for `challengeId` and `promoId` (challenge/promo updated after match create). |
| Tests: `frontend/src/components/admin/__tests__/ScheduleMatch.test.tsx` | Modify | Test pre-fill from location state and that challengeId/promoId are sent. |
| Tests: `frontend/src/components/challenges/__tests__/ChallengeBoard.test.tsx` | Modify | Assert resolved statuses are not shown when filtering for public board. |

---

## Implementation Steps

### 1. Backend: Match scheduling with challenge/promo linkage

- **File:** `backend/functions/matches/scheduleMatch.ts`
- **What:** Extend the parsed body interface with optional `challengeId?: string` and `promoId?: string`. After building the match object and before `dynamoDb.put`, add `challengeId` and `promoId` to the match item if provided. After putting the match, if `challengeId` is present: get the challenge, verify it exists and is `accepted` (or allow `pending`/`countered` per product decision), then `dynamoDb.update` the challenge to set `status = 'scheduled'` and `matchId = match.matchId`, `updatedAt = now`. If `promoId` is present: get the promo, then `dynamoDb.update` to set `isHidden = true` and optionally `matchId = match.matchId`, `updatedAt = now`.
- **Why:** Links the match to the challenge/promo and marks the challenge as scheduled and the promo as hidden so they no longer appear as "open" on public surfaces.
- **Pattern:** Reuse existing `dynamoDb.update` patterns from `cancelChallenge.ts` and `adminUpdatePromo.ts`; no new tables or indexes (DynamoDB is schemaless for these attributes).

### 2. Backend: Delete challenge and bulk-delete challenges

- **Files:** New `backend/functions/challenges/deleteChallenge.ts`, `backend/functions/challenges/bulkDeleteChallenges.ts`
- **What:** In `deleteChallenge.ts`: require admin (reuse `requireRole` or `getAuthContext` + `hasRole`), read `challengeId` from path, get challenge, then `dynamoDb.delete` by `challengeId`. Return 204 or 200 with deleted id. In `bulkDeleteChallenges.ts`: require admin, parse body `{ statuses: string[] }` (e.g. `['cancelled','expired','scheduled']`), query or scan challenges with those statuses (e.g. via StatusIndex in a loop or batch get after scan), then batch delete. Define a reasonable limit (e.g. 100) to avoid timeouts.
- **Why:** Admins need to remove individual challenges and to clear resolved ones in bulk.
- **Pattern:** Follow `cancelChallenge.ts` for auth; use `TableNames.CHALLENGES` and existing indexes.

### 3. Backend: Delete promo and bulk-delete promos

- **Files:** New `backend/functions/promos/deletePromo.ts`, `backend/functions/promos/bulkDeletePromos.ts`
- **What:** In `deletePromo.ts`: require Admin/Moderator (same as `adminUpdatePromo`), path `promoId`, then `dynamoDb.delete`. In `bulkDeletePromos.ts`: body e.g. `{ isHidden: true }` to delete all hidden promos, or `{ promoIds?: string[] }` for explicit list; scan/query then batch delete with a limit.
- **Why:** Symmetric with challenges; allows cleanup of old or resolved promos.
- **Pattern:** Mirror `adminUpdatePromo` auth; reuse `TableNames.PROMOS`.

### 4. Backend: Register new HTTP events

- **File:** `backend/serverless.yml`
- **What:** Add functions `deleteChallenge`, `bulkDeleteChallenges`, `deletePromo`, `bulkDeletePromos` with handlers pointing to the new files. Add HTTP events: `DELETE /challenges/{challengeId}`, `POST /challenges/bulk-delete`, `DELETE /promos/{promoId}`, `POST /promos/bulk-delete`, all with `authorizer: adminAuthorizer` (and for promos use same authorizer as `adminUpdatePromo`).
- **Why:** Expose the new operations to the frontend.
- **Pattern:** Copy the structure of existing `cancelChallenge` and `adminUpdatePromo` entries.

### 5. Frontend: API methods for delete and bulk-delete

- **Files:** `frontend/src/services/api/challenges.api.ts`, `frontend/src/services/api/promos.api.ts`
- **What:** In challenges API add `delete(challengeId)` (DELETE) and `bulkDelete(body: { statuses: string[] })` (POST to `bulk-delete`). In promos API add `delete(promoId)` (DELETE) and `bulkDelete(body: { isHidden?: boolean } or { promoIds?: string[] })` (POST to `bulk-delete`). Use `fetchWithAuth` and correct methods/URLs.
- **Why:** So admin UI can call the new endpoints.
- **Pattern:** Same as existing `cancel`, `adminUpdate` in those files.

### 6. Frontend: Types for schedule payload and match

- **File:** `frontend/src/types/index.ts`
- **What:** Add to `ScheduleMatchInput`: `challengeId?: string`, `promoId?: string`. If the app displays match origin, add optional `challengeId?`, `promoId?` to `Match` interface.
- **Why:** Type-safe pre-fill and linkage from schedule form to backend.

### 7. Frontend: AdminChallenges — Schedule with state and delete UI

- **File:** `frontend/src/components/admin/AdminChallenges.tsx`
- **What:** For the "Schedule" button (around line 186–191), replace `navigate('/admin/schedule')` with `navigate('/admin/schedule', { state: { fromChallenge: challenge } })` where `challenge` includes at least `challengeId`, `challengerId`, `challengedId`, `matchType`, `stipulation` (and `championshipId` if needed). Add an actions cell "Delete" button that calls `challengesApi.delete(challenge.challengeId)` then refreshes; disable for in-progress. Add a "Clear Resolved" (or similar) button above the table that opens a confirmation modal; on confirm call `challengesApi.bulkDelete({ statuses: ['cancelled','expired','scheduled'] })`, show success/error feedback, then reload. Use existing feedback pattern (`showFeedback`, `submitting`).
- **Why:** Schedule flow carries context so ScheduleMatch can pre-fill; admins can delete one or many resolved challenges.
- **Pattern:** Follow existing `handleCancel` and feedback in the same file; use existing translation keys or add new ones.

### 8. Frontend: ScheduleMatch — Pre-fill from challenge and promo

- **File:** `frontend/src/components/admin/ScheduleMatch.tsx`
- **What:** At top of component, `const location = useLocation(); const state = location.state as { fromChallenge?: ChallengeWithPlayers; fromPromo?: PromoWithContext } | undefined`. In `useEffect` after `loadData()` (or in a dedicated effect that runs when `state` and loaded data are ready), if `state?.fromChallenge`: set `formData` with `participants: [challenge.challengerId, challenge.challengedId]`, `matchFormat: challenge.matchType` (map to matchTypes name if needed), and if challenge has `stipulation`, try to resolve to a `stipulationId` by matching stipulations by name (or leave blank). Optionally set `championshipId` from challenge. Store `challengeId` in a ref or state so it can be sent on submit. If `state?.fromPromo`: set `participants` to `[promo.playerId, promo.targetPlayerId]` (ensure `targetPlayerId` exists for call-out), `matchFormat` to a default (e.g. singles); store `promoId` for submit. On submit, when calling `matchesApi.schedule(...)`, include `challengeId` or `promoId` in the payload if present. After successful submit, clear location state (e.g. `navigate('/admin/schedule', { replace: true, state: {} })` or avoid re-adding state) and call `resetForm()`. Optionally show a small banner "Pre-filled from challenge/promo" with a "Clear" button that clears pre-fill and state.
- **Why:** One form serves both "schedule from scratch" and "schedule from challenge/promo" with correct linkage.
- **Pattern:** Match format in the app uses `matchTypes` with `name`; challenge stores `matchType` as string — align by name. Stipulation from challenge is free text; match to stipulation by name if possible, else leave blank.

### 9. Frontend: AdminPromos — Schedule Match for call-out and delete UI

- **File:** `frontend/src/components/admin/AdminPromos.tsx`
- **What:** In the actions column (around 183–208), for rows where `promo.promoType === 'call-out'` and `promo.targetPlayerId` is set, add a "Schedule Match" button that calls `navigate('/admin/schedule', { state: { fromPromo: promo } })`. Add a "Delete" button per row calling `promosApi.delete(promo.promoId)` then refresh. Add "Clear Resolved" (e.g. "Clear hidden promos") bulk action with confirmation that calls `promosApi.bulkDelete({ isHidden: true })` (or the filter the backend supports).
- **Why:** Call-out promos can be turned into matches like challenges; admins can delete or bulk-clear.
- **Pattern:** Reuse same feedback and loading patterns as existing pin/hide.

### 10. Frontend: Hide resolved challenges from public board

- **File:** `frontend/src/components/challenges/ChallengeBoard.tsx`
- **What:** After fetching challenges (in the same effect or when setting state), filter the list to only include challenges whose `status` is one of `pending`, `countered`, `accepted` before setting state (e.g. `setChallenges(data.filter(c => ['pending','countered','accepted'].includes(c.status)))`). Update the filter tabs: for "active", show only `pending`, `countered`, `accepted` (remove `scheduled`); for "accepted", show only `accepted` (remove `scheduled`). The "recent" tab can show only `declined` if desired, or stay as-is with the understanding that expired/cancelled/scheduled are no longer in the fetched list if you filter at fetch time — in that case "recent" would only show `declined` or you keep full fetch and filter only for display so "recent" still has data. Prefer filtering the response so the public board never shows scheduled/expired/cancelled.
- **Why:** Resolved challenges should not clutter the public board.
- **Alternative:** Add a query param to `getChallenges` (e.g. `publicBoard=true` or `statuses=pending,countered,accepted`) and filter on the backend; then ChallengeBoard calls with that param. Document in plan so implementer can choose.

### 11. Frontend: Promo feed already hides hidden promos

- **File:** `backend/functions/matches/scheduleMatch.ts` (and optionally `frontend`)
- **What:** No change to public promo feed or `getPromos` is required for hiding once a match is scheduled from a promo: when `scheduleMatch` sets the promo’s `isHidden: true` (step 1), the existing `getPromos` filter (`includeHidden === 'true' || !p.isHidden`) already excludes it for the public feed (PromoFeed calls `getAll()` without `includeHidden`). Optionally document in code that scheduling from a call-out promo auto-hides it.
- **Why:** Satisfies "hide scheduled/resolved promos from public view" without extra frontend or getPromos logic.

### 12. i18n and styles

- **Files:** Locale files under `frontend/public/locales/` (or project i18n location), `AdminChallenges.css`, `AdminPromos.css`
- **What:** Add translation keys for "Schedule Match", "Delete", "Clear Resolved", "Clear hidden promos", and confirmation text for bulk delete (e.g. "Are you sure you want to delete all resolved challenges?"). Add or adjust CSS for the new buttons and any confirmation modal so they match existing admin styling.
- **Why:** Consistent UX and accessibility.

### 13. Tests

- **Backend:** In `scheduleMatch.test.ts`, add tests: schedule with `challengeId` and assert challenge is updated to status `scheduled` and `matchId` set; schedule with `promoId` and assert promo `isHidden` is true (and optionally `matchId`). Add unit tests for `deleteChallenge`, `bulkDeleteChallenges`, `deletePromo`, `bulkDeletePromos` (auth, validation, success).
- **Frontend:** In `ScheduleMatch.test.tsx`, mock `useLocation` to return state with `fromChallenge` or `fromPromo` and assert initial form values and that `matchesApi.schedule` is called with `challengeId`/`promoId`. In `ChallengeBoard.test.tsx`, assert that challenges with status `scheduled`/`expired`/`cancelled` are not rendered when using the public board filter.
- **Why:** Regressions and contract coverage.

---

## Dependencies & Order

1. **Types and backend first:** Add `challengeId`/`promoId` to schedule body and implement `scheduleMatch` linkage (step 1). Then add delete/bulk-delete handlers and serverless events (steps 2–4).
2. **Frontend API and types:** Add delete/bulk-delete API methods and `ScheduleMatchInput`/`Match` types (steps 5–6).
3. **Admin UI:** AdminChallenges and AdminPromos (steps 7, 9) can be done in parallel; ScheduleMatch pre-fill (step 8) depends on types and backend schedule behavior.
4. **Public board and promo visibility:** ChallengeBoard filter (step 10) and promo-hide behavior (step 11) can follow; no dependency on delete/bulk.
5. **i18n, styles, and tests** can be done alongside or after the feature work (steps 12–13).

Suggested order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13.

---

## Testing & Verification

- **Manual:** As admin, accept a challenge then click "Schedule"; confirm ScheduleMatch opens with participants and match type pre-filled; submit and confirm challenge shows as "scheduled" and match exists. Create a call-out promo, then in AdminPromos click "Schedule Match"; confirm pre-fill with author and target; submit and confirm promo is hidden on public feed. On public challenge board, confirm no scheduled/expired/cancelled challenges appear. Delete a single challenge and a single promo; use "Clear Resolved" for both and confirm list updates and confirmation modal appears.
- **Existing tests:** `scheduleMatch` tests may assume no `challengeId`/`promoId`; extend rather than break. ChallengeBoard and PromoFeed tests may need updated mocks or assertions for new filtering and behavior.
- **New tests:** As in step 13: schedule with challenge/promo linkage, delete and bulk-delete handlers, ScheduleMatch pre-fill and payload, ChallengeBoard filtering.

---

## Risks & Edge Cases

- **Stipulation mismatch:** Challenges store stipulation as free text; matches use `stipulationId`. If no stipulation row matches by name, leave stipulation blank and let admin select. Document this in UI (e.g. "Stipulation from challenge could not be matched; please select if needed").
- **Match type mismatch:** Challenge `matchType` might not exactly match a `matchTypes.name`; fallback to first match or default "Singles" if no match.
- **Call-out without target:** If a call-out promo has no `targetPlayerId`, disable or hide "Schedule Match" for that row.
- **Bulk-delete limits:** Cap bulk-delete (e.g. 100 items) to avoid Lambda timeout; return count deleted and optionally a message if more exist.
- **Backward compatibility:** Adding optional `challengeId`/`promoId` to match payload and to Match type is backward compatible. Old matches without these fields remain valid.
- **Admin vs moderator:** Promo delete/bulk-delete should use same role check as `adminUpdatePromo` (Admin or Moderator); challenge delete/bulk-delete can be Admin-only to align with `cancelChallenge` (admin can cancel).
- **Double-submit:** If user clicks "Schedule" twice quickly, ensure only one match is created and one challenge/promo updated; idempotency is not required but button disable and loading state (existing pattern) mitigate this.
