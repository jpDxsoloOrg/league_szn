# Plan: Allow users to delete events

**GitHub issue:** #219 — [Allow users to delete events](https://github.com/jpDxsoloOrg/league_szn/issues/219)

## Context

Admins can already create and update events, and the backend already contains delete handlers. This work adds a clear admin delete experience, keeps API behavior consistent, and ensures tests cover deletion success and failure paths.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| During implementation planning and assertions | test-generator | Expand/adjust tests for delete flows and conflict states |
| After implementation | code-reviewer | Review changed backend/frontend files for regressions and quality issues |
| If API contract changes | api-documenter | Update API docs for event deletion semantics and error cases |
| Before commit | git-commit-helper | Generate conventional commit message from staged diff |

## Agents and parallel work

- **Suggested order**: Steps 1+2 -> Step 3 -> Step 4
- **Agent types**:
  - Step 1: `generalPurpose` (backend delete endpoint verification/hardening)
  - Step 2: `generalPurpose` (frontend admin delete UX)
  - Step 3: `test-engineer` (backend and frontend tests)
  - Step 4: `generalPurpose` (final validation, lint/tests, docs alignment)

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/functions/events/deleteEvent.ts` | Modify (if needed) | Ensure delete constraints/messages are correct and stable for UI consumption |
| `backend/functions/events/handler.ts` | Modify (if needed) | Confirm router delete path behavior and method handling remain correct |
| `backend/functions/events/__tests__/deleteEvent.test.ts` | Modify | Add/adjust tests for successful delete, not found, and conflict responses |
| `backend/functions/events/__tests__/handler.test.ts` | Modify (if needed) | Keep router-level delete route coverage aligned with implementation |
| `frontend/src/components/admin/CreateEvent.tsx` | Modify | Add event list section with delete action and local state refresh |
| `frontend/src/components/admin/CreateEvent.css` | Modify | Style event management/delete UI states and messages |
| `frontend/src/components/admin/__tests__/CreateEvent.test.tsx` | Modify | Cover rendering existing events and delete interaction behavior |
| `frontend/src/i18n/locales/en.json` | Modify | Add admin events delete strings |
| `frontend/src/i18n/locales/de.json` | Modify | Add German translations for delete flow strings |
| `frontend/src/services/api/events.api.ts` | Modify (if needed) | Keep delete method typing/error behavior aligned with component use |
| `backend/serverless.yml` | TBD / verify only | Confirm `DELETE /events/{eventId}` route exists and is protected correctly |

## Implementation steps

### Step 1: Verify and harden backend delete behavior

1. Review `backend/functions/events/deleteEvent.ts` and confirm the handler returns:
   - `204` on successful delete.
   - `404` when event does not exist.
   - `409` when event includes completed matches that block deletion.
2. Ensure error payloads are consistent with existing response helpers so frontend can surface actionable messages.
3. Verify `backend/functions/events/handler.ts` routes `DELETE /events/{eventId}` to `deleteEvent`.
4. Verify `backend/serverless.yml` includes `DELETE /events/{eventId}` under events routes with admin authorization.

### Step 2: Add admin delete UI in events management

1. Update `frontend/src/components/admin/CreateEvent.tsx` to load and display existing events in addition to the create form.
2. Add per-event delete action with confirmation guard and loading/error state handling.
3. On successful delete, remove the event from local state without full-page reload.
4. On API error (`404`, `409`, network), display clear feedback in the admin panel.
5. Add/adjust styles in `frontend/src/components/admin/CreateEvent.css` for event list rows, delete button, and status messages.
6. Add required copy keys to `frontend/src/i18n/locales/en.json` and `frontend/src/i18n/locales/de.json`.

### Step 3: Add and update tests

1. Update `backend/functions/events/__tests__/deleteEvent.test.ts` to validate:
   - Successful deletion path.
   - Non-existent event path.
   - Conflict path when completed matches are present.
2. Update `frontend/src/components/admin/__tests__/CreateEvent.test.tsx` to validate:
   - Existing events list renders.
   - Delete button triggers API call for selected event.
   - Deleted event is removed from UI.
   - Error message is shown when deletion fails.
3. Keep `backend/functions/events/__tests__/handler.test.ts` aligned if route behavior changes.

### Step 4: Verify end-to-end behavior and finalize

1. Run backend and frontend test suites scoped to changed files first, then broader suites as needed.
2. Run lint checks for touched packages.
3. If API response contract changed, apply `api-documenter` updates.
4. Confirm no regressions in event creation/editing and match-card builder event selection.

## Dependencies and order

- Step 1 and Step 2 can run in parallel because backend delete endpoint already exists; Step 2 only depends on stable endpoint semantics.
- Step 3 depends on outputs from Steps 1 and 2.
- Step 4 depends on Step 3 completion.
- **Suggested order**: Steps 1+2 -> Step 3 -> Step 4

## Testing and verification

- Backend:
  - Run event delete unit tests and router tests in `backend/functions/events/__tests__/`.
  - Validate `204`, `404`, and `409` behavior.
- Frontend:
  - Run `CreateEvent` admin component tests.
  - Verify delete UX in admin events tab (success, conflict, not found, generic error).
- Manual:
  - Create an event, delete it, verify it disappears immediately.
  - Attempt deleting an event with completed matches and confirm conflict feedback.
  - Confirm create/update event flows still work.

## Risks and edge cases

- Deleting events referenced by scheduled (but not completed) matches may leave orphaned relationships; validate intended business rule.
- Race condition where two admins delete the same event could produce a `404`; UI should handle gracefully.
- Translation key gaps can cause fallback text in admin UI.
- Event list refresh logic must not interfere with existing create form success state.
