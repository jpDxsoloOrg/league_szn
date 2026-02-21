# Plan: Allow users to delete events

**GitHub issue:** #219 — [Allow users to delete events](https://github.com/jpDxsoloOrg/league_szn/issues/219)

## Context

Issue #219 requires admin users to delete events from the UI and see immediate updates without a refresh. Backend delete support already exists, so this plan focuses on validating backend behavior, adding the admin delete UX/state updates, and ensuring tests cover success and failure paths.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| During implementation | test-generator | Strengthen coverage for delete success/error behavior |
| After implementation | code-reviewer | Review modified files for regressions and quality issues |
| If API contract changes | api-documenter | Update API docs for delete endpoint behavior |
| Before commit | secret-scanner | Check changed files for accidental secret exposure |
| Before commit | git-commit-helper | Produce a conventional commit message from staged diff |

## Agents and parallel work

- **Suggested order**: Steps 1+2 -> Step 3 -> Step 4
- **Agent types**:
  - Step 1: `generalPurpose`
  - Step 2: `generalPurpose`
  - Step 3: `test-engineer`
  - Step 4: `generalPurpose`

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/functions/events/deleteEvent.ts` | Verify / Modify if needed | Confirm expected delete status/error behavior for UI |
| `backend/functions/events/handler.ts` | Verify / Modify if needed | Ensure delete routing is still correct |
| `backend/functions/events/__tests__/deleteEvent.test.ts` | Verify / Modify if needed | Keep delete tests aligned with expected contract |
| `frontend/src/components/admin/CreateEvent.tsx` | Modify | Add managed event list and delete flow with local state updates |
| `frontend/src/components/admin/CreateEvent.css` | Modify | Style the event list/delete controls and messages |
| `frontend/src/components/admin/__tests__/CreateEvent.test.tsx` | Modify | Add assertions for delete behavior and UI update |
| `frontend/src/i18n/locales/en.json` | Modify | Add delete-related admin copy |
| `frontend/src/i18n/locales/de.json` | Modify | Add delete-related admin copy |

## Implementation steps

### Step 1: Validate backend delete behavior

1. Confirm `DELETE /events/{eventId}` routing in `backend/functions/events/handler.ts`.
2. Confirm `deleteEvent` returns:
   - `204` when deletion succeeds.
   - `404` when event does not exist.
   - `409` when the event has completed matches.
3. Adjust backend tests only if behavior is inconsistent with issue requirements.

### Step 2: Implement admin delete UI and local state updates

1. Update `frontend/src/components/admin/CreateEvent.tsx` to fetch and render existing events.
2. Add per-event delete action with confirmation and loading protection.
3. On success, remove the event from local component state without full-page refresh.
4. On error (`404`, `409`, or generic), surface user-facing feedback.
5. Add delete UI styles in `frontend/src/components/admin/CreateEvent.css`.
6. Add i18n keys in `frontend/src/i18n/locales/en.json` and `frontend/src/i18n/locales/de.json`.

### Step 3: Update frontend tests for deletion flow

1. Extend `frontend/src/components/admin/__tests__/CreateEvent.test.tsx` to cover:
   - Rendering existing events list.
   - Delete action invoking the API with the selected event.
   - Immediate UI removal after successful deletion.
   - Error feedback when deletion fails.
2. Keep existing create-event tests passing.

### Step 4: Verify and finalize

1. Run frontend and backend lint.
2. Run focused backend events tests and frontend `CreateEvent` tests.
3. Fix regressions up to two iterations, then re-run verification.

## Dependencies and order

- Step 1 and Step 2 can run in parallel.
- Step 3 depends on Step 2.
- Step 4 depends on Steps 1-3.
- **Suggested order**: Steps 1+2 -> Step 3 -> Step 4

## Testing and verification

- Backend:
  - `npm test -- functions/events/__tests__/deleteEvent.test.ts functions/events/__tests__/handler.test.ts` (or package equivalent).
- Frontend:
  - `npm test -- src/components/admin/__tests__/CreateEvent.test.tsx` (or package equivalent).
  - `npm run lint`.
- Manual:
  - Delete an existing event and verify it disappears immediately.
  - Attempt deleting an already-removed event and verify graceful error handling.
  - Attempt deleting an event with completed matches and verify conflict message.

## Risks and edge cases

- Concurrent deletes by two admins can surface `404`; UI should show a non-breaking error.
- Incomplete translation keys could show raw key strings in admin UI.
- Event list state updates must not regress existing create-event behavior.
