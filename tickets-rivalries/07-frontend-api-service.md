# [RIV-07] Frontend API service layer

**Phase:** 3 — Frontend service layer
**Estimate:** S
**Blocked by:** RIV-02, RIV-03, RIV-04, RIV-05 (need the deployed API shape)
**Blocks:** every frontend ticket from RIV-08 onward
**Reference:** [plan-rivalries.md § Phase 3, step 17](../plan-rivalries.md)

## Goal
Add the `rivalriesApi` namespace to the frontend service module so all UI components consume the backend through a single typed surface.

## Scope
**In:** `rivalriesApi` namespace with all read/write methods, mirroring the existing `challengesApi` and `promosApi` style.
**Out:** Any UI consumers (those land per-component).

## Subtasks
- [ ] Add `rivalriesApi` to `frontend/src/services/api.ts` with the following methods (mirror return-type and error-handling patterns of existing `challengesApi`):
  - `list({ status?, participantId?, seasonId?, eventId?, page? })`
  - `get(rivalryId)`
  - `getActivity({ participantId?, eventId?, limit?, cursor? })`
  - `create(input: CreateRivalryInput)`
  - `respond(rivalryId, action: 'approve' | 'reject' | 'conclude', message?: string)`
  - `update(rivalryId, patch)`
  - `delete(rivalryId)`
  - `messages.list(rivalryId, { cursor? })`
  - `messages.post(rivalryId, content, audience?)`
  - `notes.list(rivalryId, { noteType? })`
  - `notes.upsert(rivalryId, note)`
- [ ] Reuse the existing auth-header helper and base-URL config from `api.ts`.
- [ ] Make sure all method signatures import from `frontend/src/types/rivalry.ts` (no inline types).

## Files Touched
- `frontend/src/services/api.ts` (modify — add namespace)

## Acceptance Criteria
- TS strict check passes against the namespace.
- Each method's return type is the exact response shape from the corresponding handler.
- A quick console smoke from the browser devtools (`await rivalriesApi.list({})`) returns either an array or a documented error shape.

## Notes / Risks
- Keep parameter naming consistent with the backend query params — drift here causes silent filter failures (the backend ignores unknown params).
- Don't introduce a new HTTP client library; reuse whatever `api.ts` already uses (likely `fetch` + the existing auth helper).
