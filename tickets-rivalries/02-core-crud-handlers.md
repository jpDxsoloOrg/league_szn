# [RIV-02] Core CRUD handlers + dispatcher + serverless events

**Phase:** 2 — Backend handlers
**Estimate:** L
**Blocked by:** RIV-01
**Blocks:** RIV-07 (frontend API client), RIV-15 (admin panel)
**Reference:** [plan-rivalries.md § Phase 2, steps 5-8, 11-12](../plan-rivalries.md)

## Goal
Implement create / read / respond / update / delete for the Rivalry aggregate, wire them through a single Lambda dispatcher, and expose the HTTP routes via API Gateway.

## Scope
**In:** Handlers for `createRivalry`, `getRivalries`, `getRivalry`, `respondRivalry`, `updateRivalry`, `deleteRivalry`. Dispatcher. Serverless HTTP events with auth. Vitest unit tests.
**Out:** Activity-feed handler (RIV-03), messaging handlers (RIV-04), notes handlers (RIV-05).

## Subtasks
- [ ] `backend/functions/rivalries/createRivalry.ts` — wrestler-only via `requireWrestler()`. Validate no existing `pending` or `active` rivalry between the same two participants. Default status `pending`. Return 201.
- [ ] `backend/functions/rivalries/getRivalries.ts` — list with filters: `status`, `participantId`, `seasonId`, `eventId`, `page`. Public read.
- [ ] `backend/functions/rivalries/getRivalry.ts` — hydrate response with rivalry record + head-to-head match record + next scheduled event (query Events table for soonest event matching `eventId` or any event containing a match tagged with this `rivalryId`) + most-recent 5 promos + most-recent 3 messages + visible notes filtered by caller role.
- [ ] `backend/functions/rivalries/respondRivalry.ts` — GM-only via `requireAdminOrModerator()`. Accepts `{ action: 'approve' | 'reject' | 'conclude', message? }`. Use `runInTransaction` to atomically: update status, append a system message, create notification for requesting wrestler.
- [ ] `backend/functions/rivalries/updateRivalry.ts` — GM-only for most fields; allow requesting wrestler to cancel their own `pending` request.
- [ ] `backend/functions/rivalries/deleteRivalry.ts` — GM-only. Cascade delete RivalryMessages + RivalryNotes in chunked transactions (≤100 items per batch per UnitOfWork hard cap).
- [ ] `backend/functions/rivalries/handler.ts` — single dispatcher routing on `event.routeKey`. Mirror `backend/functions/challenges/handler.ts:1-52`.
- [ ] Wire HTTP events in `backend/serverless.yml`: `GET /rivalries`, `GET /rivalries/{id}` (public), `POST /rivalries`, `PUT /rivalries/{id}`, `POST /rivalries/{id}/respond` (admin), `DELETE /rivalries/{id}` (admin). Use existing JWT custom authorizer for protected routes.
- [ ] Vitest tests under `backend/functions/rivalries/__tests__/`. Mock `getRepositories` per CLAUDE.md "Repository Pattern" section. Cover: success, role rejection, duplicate-active rivalry, transactional respond, cascade delete with >100 items.

## Files Touched
- `backend/functions/rivalries/createRivalry.ts` (create)
- `backend/functions/rivalries/getRivalries.ts` (create)
- `backend/functions/rivalries/getRivalry.ts` (create)
- `backend/functions/rivalries/respondRivalry.ts` (create)
- `backend/functions/rivalries/updateRivalry.ts` (create)
- `backend/functions/rivalries/deleteRivalry.ts` (create)
- `backend/functions/rivalries/handler.ts` (create)
- `backend/functions/rivalries/__tests__/*.test.ts` (create — one per handler)
- `backend/serverless.yml` (modify — HTTP events block)

## Acceptance Criteria
- All handler tests pass: `cd backend && npx vitest run functions/rivalries`.
- `npx serverless deploy --stage devtest --aws-profile league-szn` succeeds.
- Manual smoke (against devtest): create → respond (approve) → list → get returns hydrated payload with computed head-to-head record.
- Duplicate-active check: creating a second rivalry between the same pair while one is `active` returns 409.
- Cascade delete with seeded fixture of 250 messages succeeds without DynamoDB transaction-cap errors.

## Notes / Risks
- Rivalry uniqueness — start with read-then-write check inside `createRivalry`. Defer the synthesized-key conditional-write to a follow-up if real concurrent creates surface.
- Soft-delete (`deletedAt` flag) is the safer alternative to hard cascade delete. If the implementer is uncertain, choose soft-delete and revisit.
- Public `GET` endpoints must filter sensitive fields server-side (no `gm-only` notes, no messages) — do not rely on the frontend.
