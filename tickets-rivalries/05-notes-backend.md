# [RIV-05] Rivalry notes backend (storyline + plans, role-based visibility)

**Phase:** 2 — Backend handlers
**Estimate:** S
**Blocked by:** RIV-01
**Blocks:** RIV-11 (Notes & Plans tab)
**Reference:** [plan-rivalries.md § Phase 2, step 10](../plan-rivalries.md)

## Goal
Persist storyline notes and GM "plans" for a rivalry, with strict role-based visibility so GM plans never leak to wrestlers unless explicitly published.

## Scope
**In:** upsert + list note handlers with strict role/visibility enforcement, tests.
**Out:** Frontend notes UI (RIV-11).

## Subtasks
- [ ] `backend/functions/rivalries/notes/upsertNote.ts` — body: `{ noteId?, noteType: 'storyline' | 'plan', content, visibility?, scheduledFor?, linkedMatchId?, linkedEventId? }`. If `noteId` provided, update; otherwise create. Enforce:
  - GMs can write any `noteType` and any `visibility`.
  - Wrestlers can only write `'storyline'` notes with visibility forced to `'gm-only'` (suggestions to the GM).
  - Wrestler attempts to write `'plan'` notes → 403.
- [ ] `backend/functions/rivalries/notes/listNotes.ts` — query params: `noteType?`. Filter by caller role:
  - Wrestlers never see `'gm-only'` notes authored by other wrestlers or by GMs.
  - Wrestlers never see `'plan'` notes unless visibility is `'participants'` or `'public'`.
  - GMs see everything.
- [ ] Validate `linkedMatchId` and `linkedEventId` exist (if provided) — light existence check, not full referential cascade.
- [ ] Wire HTTP events: `GET /rivalries/{id}/notes`, `POST /rivalries/{id}/notes`. Both authenticated.
- [ ] Vitest tests: GM creates plan with `linkedMatchId` (success), wrestler attempts plan (403), wrestler creates storyline as `'gm-only'` (success), wrestler list filters out other wrestler's `'gm-only'` notes, GM list returns everything.

## Files Touched
- `backend/functions/rivalries/notes/upsertNote.ts` (create)
- `backend/functions/rivalries/notes/listNotes.ts` (create)
- `backend/functions/rivalries/notes/__tests__/*.test.ts` (create)
- `backend/serverless.yml` (modify — 2 HTTP events)

## Acceptance Criteria
- Default visibility for `'plan'` notes is `'gm-only'` — explicit in the handler, not relying on caller convention.
- Wrestler-authored `'storyline'` notes always force visibility to `'gm-only'` regardless of what was passed.
- List endpoint never returns notes the caller shouldn't see, even if the frontend requests them — server-side enforcement, not client-side filtering.
- Tests cover both write-side rejection and read-side filtering for every role × visibility × noteType combination.

## Notes / Risks
- Plans can spoil future storyline beats. The default visibility for `'plan'` MUST be `'gm-only'` and MUST be enforced server-side. This is the highest leak risk in the feature.
- `linkedMatchId`/`linkedEventId` are advisory pointers — if the linked match is later deleted, leave the note's reference stale rather than cascading. The Notes & Plans tab UI should handle the missing-link case gracefully (RIV-11).
