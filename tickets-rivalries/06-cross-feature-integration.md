# [RIV-06] Cross-feature integration (matches, promos, notifications)

**Phase:** 2 — Backend handlers
**Estimate:** S
**Blocked by:** RIV-01
**Blocks:** RIV-03 (activity feed reads matches/promos by `rivalryId`), RIV-04 (notifications)
**Reference:** [plan-rivalries.md § Phase 2, steps 13-15](../plan-rivalries.md)

## Goal
Tag matches and promos with an optional `rivalryId` so the rivalry hub can authoritatively aggregate them. Add the new notification types the rivalry handlers will emit.

## Scope
**In:** `rivalryId` field on matches + promos (write + filter on read), new notification type enum values, tests.
**Out:** Anything that requires the rivalry to exist as a foreign key (intentional — keep loosely coupled).

## Subtasks
- [ ] `backend/functions/matches/createMatch.ts` — accept optional `rivalryId`. If present, validate that both `participants` are in the rivalry's pair (look up rivalry via repo). Persist the field. (Existing test file: add a case for rivalryId-tagged match creation.)
- [ ] `backend/functions/matches/getMatches.ts` — add `rivalryId` filter param. Direct field comparison is more efficient than the existing client-side participants array filter at lines 59-63 — use it as the precedent for the pattern.
- [ ] `backend/functions/promos/createPromo.ts` — accept optional `rivalryId`. Persist on the promo record. No participant validation needed — promos can reference a rivalry the author is or isn't in.
- [ ] `backend/lib/notifications.ts` — add new notification type enum values: `'rivalry_message'`, `'rivalry_request'`, `'rivalry_status_change'`. Export helper `createRivalryNotification(rivalryId, recipientUserId, type, message)` for handler reuse.
- [ ] Update existing match/promo Vitest tests: `getMatches` `rivalryId` filter, `createMatch` rivalryId acceptance + participant validation, `createPromo` rivalryId acceptance.
- [ ] Add the new notification types to any frontend type definition (likely `frontend/src/types/notification.ts` or similar).

## Files Touched
- `backend/functions/matches/createMatch.ts` (modify)
- `backend/functions/matches/getMatches.ts` (modify)
- `backend/functions/matches/__tests__/*.test.ts` (modify — add cases)
- `backend/functions/promos/createPromo.ts` (modify)
- `backend/functions/promos/__tests__/createPromo.test.ts` (modify — add case)
- `backend/lib/notifications.ts` (modify — enum + helper)
- `frontend/src/types/notification.ts` (modify — if it exists; otherwise grep for the type)

## Acceptance Criteria
- Existing match and promo tests still pass with no regressions.
- `getMatches({ rivalryId })` returns only matches tagged with that rivalry.
- `createMatch` with a `rivalryId` whose pair doesn't include the match's participants returns 400.
- A match created without `rivalryId` is unaffected (backwards compat — no migration needed).
- `createRivalryNotification` helper is exported and the new enum values are accepted everywhere `NotificationType` is consumed.

## Notes / Risks
- Backwards compat is the primary concern. Both `rivalryId` fields MUST be optional. Existing data with `rivalryId === undefined` must continue to render in normal listings.
- Validation in `createMatch` should look up the rivalry once, not on every test of the participant list.
