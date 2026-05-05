# [RIV-14] Admin Rivalries moderation panel

**Phase:** 4 — Frontend
**Estimate:** M
**Blocked by:** RIV-02 (respond/update/delete handlers), RIV-07 (api client)
**Blocks:** none
**Reference:** [plan-rivalries.md § Phase 4, step 23](../plan-rivalries.md)

## Goal
GM-facing moderation table to triage rivalry requests and manage their lifecycle.

## Scope
**In:** `AdminRivalries.tsx` table with status filters, per-row actions (approve / reject / conclude / delete), bulk-clear, admin-tab registration.
**Out:** Inline messaging — admins use the regular Messages tab on the detail page.

## Subtasks
- [ ] `frontend/src/components/admin/AdminRivalries.tsx` — table layout mirroring `frontend/src/components/admin/AdminChallenges.tsx`. Columns: created date, requester, opponent, title, heat, status, actions.
- [ ] Status filter chips at top: All / Pending / Active / Concluded / Rejected / Cancelled.
- [ ] Per-row actions:
  - For `pending`: "Approve" + "Reject" (both open a small modal for an optional response message → call `rivalriesApi.respond`).
  - For `active`: "Conclude" (modal for closure notes → `rivalriesApi.respond` with `action: 'conclude'`) + "Open" (deep-link to the detail page).
  - For all rows: "Delete" (confirmation modal → `rivalriesApi.delete`).
- [ ] Bulk-clear button: "Clear Resolved" — deletes all rivalries with status in `['concluded', 'rejected', 'cancelled']`. Confirmation modal showing count.
- [ ] Pagination on the table (page size 25).
- [ ] Register the new tab in `frontend/src/components/admin/AdminPanel.tsx`'s tab router under `/admin/rivalries`.
- [ ] Vitest tests: each row action calls the correct API method with correct args, bulk-clear confirmation gates the destructive call, status filter chip composes with table data.

## Files Touched
- `frontend/src/components/admin/AdminRivalries.tsx` (create)
- `frontend/src/components/admin/__tests__/AdminRivalries.test.tsx` (create)
- `frontend/src/components/admin/AdminPanel.tsx` (modify — register tab)

## Acceptance Criteria
- All four lifecycle actions (approve, reject, conclude, delete) work end-to-end against a deployed devtest backend.
- Bulk-clear requires explicit confirmation showing the exact count of rivalries that will be deleted.
- Table refreshes after each action without a full page reload.
- Visually consistent with `AdminChallenges.tsx` and `AdminPromos.tsx` — same row patterns, same chip styles.

## Notes / Risks
- Bulk-clear is destructive at scale (could delete thousands of historical rivalries). Confirmation copy must show the exact count and a "Type DELETE to confirm" pattern is overkill for v1 but worth considering if real production data accumulates.
- Reject and Conclude both call `respond` with different action enums. Don't confuse the API surface.
