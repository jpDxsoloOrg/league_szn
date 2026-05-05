# [RIV-01] Data model foundation

**Phase:** 1 — Foundation
**Estimate:** M
**Blocked by:** none
**Blocks:** RIV-02, RIV-03, RIV-04, RIV-05, RIV-06, RIV-07
**Reference:** [plan-rivalries.md § Phase 1, steps 1-4](../plan-rivalries.md)

## Goal
Stand up the schema, types, and repository layer the rest of the feature builds on. No HTTP routes, no UI — just the foundation pieces every other ticket depends on.

## Scope
**In:** TS types, 3 DynamoDB tables + GSIs + IAM, repository interfaces + DynamoDB implementations, UnitOfWork extensions.
**Out:** Any handler logic, any UI, the activity-feed handler (RIV-03).

## Subtasks
- [ ] Define `Rivalry`, `RivalryStatus`, `RivalryHeat`, `RivalryMessage`, `RivalryNote`, `RivalryNoteType`, `RivalryParticipantRole`, `CreateRivalryInput` in `frontend/src/types/rivalry.ts`. Include `eventId?`, `defaultMessageAudience: 'gm-only' | 'all-participants'` on `Rivalry`; `audience` on `RivalryMessage`; `linkedMatchId?`, `linkedEventId?`, `scheduledFor?` on `RivalryNote`.
- [ ] Re-export the new types from `frontend/src/types/index.ts`.
- [ ] Add `RivalriesTable` to `backend/serverless.yml` — PK `rivalryId`, GSIs `ParticipantIndex` (participantId, createdAt) and `StatusIndex` (status, createdAt). PAY_PER_REQUEST. Mirror ChallengesTable style at line ~1705.
- [ ] Add `RivalryMessagesTable` — PK `rivalryId`, SK `createdAt`.
- [ ] Add `RivalryNotesTable` — PK `rivalryId`, SK `noteId`. GSI `NoteTypeIndex` (rivalryId, noteType).
- [ ] Add `RIVALRIES_TABLE`, `RIVALRY_MESSAGES_TABLE`, `RIVALRY_NOTES_TABLE` env vars and IAM grants on every rivalry handler function (handlers themselves land in RIV-02; pre-stub the function definitions or wait — see Notes).
- [ ] Create `backend/lib/repositories/rivalries.ts` with `RivalriesRepository`, `RivalryMessagesRepository`, `RivalryNotesRepository` interfaces. Domain methods only (no `pk`/`sk`/`gsi` in signatures). Implement DynamoDB-backed versions.
- [ ] Register new repos in `backend/lib/repositories/index.ts` under `getRepositories()`. Export new types.
- [ ] Extend `backend/lib/repositories/unitOfWork.ts`: add `createRivalry`, `updateRivalry`, `appendRivalryMessage`, `createRivalryNote` to the interface and the DynamoDB transaction-staging implementation.

## Files Touched
- `frontend/src/types/rivalry.ts` (create)
- `frontend/src/types/index.ts` (modify — re-export)
- `backend/serverless.yml` (modify — 3 tables, env vars, IAM)
- `backend/lib/repositories/rivalries.ts` (create)
- `backend/lib/repositories/index.ts` (modify — register)
- `backend/lib/repositories/unitOfWork.ts` (modify — add methods)

## Acceptance Criteria
- `cd backend && npx tsc --project tsconfig.json --noEmit` passes.
- `cd frontend && npx tsc --project tsconfig.app.json --noEmit` passes.
- `npx serverless package --aws-profile league-szn` succeeds against the new tables (validates the YAML).
- `getRepositories()` returns instances of all three new repos and the existing ones still work.
- Existing test suite still green: `cd backend && npx vitest run` and `cd frontend && npx vitest run`.

## Notes / Risks
- The function definitions in serverless.yml that reference handlers from RIV-02 won't deploy until those handler files exist. Either land RIV-01 + RIV-02 together as one PR, or merge RIV-01 with the handler functions stubbed (returning 501) and let RIV-02 fill them in.
- Two-write strategy for the `ParticipantIndex` GSI (one row per participant) is acceptable and cheaper than a join table — keep the duplication encapsulated inside the repository so handlers never see it.
