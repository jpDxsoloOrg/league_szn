# Plan: UX — Fix modal and dropdown interaction patterns

**GitHub issue:** #157 — [UX: Fix modal and dropdown interaction patterns](https://github.com/jpDxsolo/league_szn/issues/157)

## Context

Championship History and Tournament detail modals lack backdrop click-to-close and Escape key handling. TopNav desktop dropdowns use a fragile 150ms `setTimeout` on blur, causing unreliable close behavior and keyboard issues. This plan adds standard modal UX (backdrop click, Escape) and replaces the dropdown blur hack with a proper click-outside listener.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review changed components |
| Before commit | git-commit-helper | Conventional commit message |

## Agents and parallel work

- **Suggested order**: Steps 1+2+3 (all three components can be updated in parallel).
- **Agent types**: general-purpose for all steps (React/frontend).

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/components/Championships.tsx` | Modify | Add backdrop click + Escape for history modal; optional focus trap |
| `frontend/src/components/Tournaments.tsx` | Modify | Add backdrop click + Escape for tournament detail modal |
| `frontend/src/components/TopNav.tsx` | Modify | Replace onBlur setTimeout with click-outside (useRef + useEffect) |

## Implementation steps

### Step 1: Championships.tsx — modal backdrop and Escape

- **Backdrop close**: The history modal is a div with class `history-modal` wrapping `history-content`. Add an `onClick` on the outer `history-modal` div that calls `setSelectedChampionship(null)` when the modal is open. On the inner `history-content` div, add `onClick={(e) => e.stopPropagation()}` so clicks inside the content do not close the modal.
- **Escape key**: Add a `useEffect` that subscribes to `keydown` on `document` when `selectedChampionship` is non-null. If `e.key === 'Escape'`, call `setSelectedChampionship(null)`. Clean up the listener in the effect return. Dependencies: `[selectedChampionship]`.
- **Optional (nice-to-have)**: Add `role="dialog"` and `aria-modal="true"` if not already present (they are). Consider focusing the close button or the modal container when the modal opens and restoring focus on close; if time permits, add a simple focus trap (focus stays inside the modal until closed).
- Do not change loading/error/data logic; only change how the modal is dismissed.

### Step 2: Tournaments.tsx — modal backdrop and Escape

- **Backdrop close**: The tournament detail modal uses `tournament-modal` (outer) and `tournament-content` (inner). Add `onClick` on the outer div to call `setSelectedTournament(null)`. On the inner `tournament-content` div, add `onClick={(e) => e.stopPropagation()}` so clicks inside do not close the modal.
- **Escape key**: Add a `useEffect` that subscribes to `keydown` when `selectedTournament` is non-null. If `e.key === 'Escape'`, call `setSelectedTournament(null)`. Clean up in the effect return. Dependencies: `[selectedTournament]`.
- Ensure the modal has `role="dialog"` and `aria-modal="true"` and `aria-labelledby` pointing to the modal title for accessibility (add if missing).
- Do not change tournament data or render logic; only modal dismissal behavior.

### Step 3: TopNav.tsx — replace blur setTimeout with click-outside

- **Remove** the `onBlur={() => setTimeout(closeDropdown, 150)}` from both dropdown buttons (user nav groups and admin button). Do not rely on blur + timeout to close the dropdown.
- **Add** a click-outside (and optionally focus-outside) listener: In a `useEffect`, when `openGroup` is non-null, add a `mousedown` listener on `document`. In the handler, if the event target is not contained in `navRef.current` (and not inside the flyout), call `closeDropdown()`. Use `navRef` which already exists; ensure the flyout content is inside the element guarded by `navRef` so clicks on flyout links do not close prematurely. Attach the listener only when `openGroup !== null` and clean up on unmount or when `openGroup` becomes null. Dependencies: `[openGroup, closeDropdown]`.
- **Keyboard**: Escape already closes the dropdown (existing `handleEscape` in `useEffect`). Ensure that when using the new click-outside approach, keyboard navigation (Tab, Enter) still works for links inside the flyout; the click-outside should not fire when focus moves to a link (only actual outside clicks). If needed, use `mousedown` (not `click`) so that focus changes from button to link do not trigger a spurious close.
- Test that opening a group and clicking a link still navigates and closes the dropdown; opening and clicking outside closes the dropdown without flashing.

## Dependencies and order

- Steps 1, 2, and 3 are independent (different files, no shared state).
- **Suggested order**: Steps 1+2+3.

## Testing and verification

- **Manual**: Open Championships, click "View history" on a title; click the backdrop → modal closes; press Escape → modal closes; click inside content → modal stays open.
- **Manual**: Open Tournaments, click "View details" on a tournament; same backdrop and Escape behavior; click inside content → modal stays open.
- **Manual**: TopNav desktop: open a nav group dropdown; click outside (e.g. on page content) → dropdown closes; click a link inside → navigates and dropdown closes; no flash or failure to close. Use Tab and Enter to navigate dropdown items and confirm no regression.
- Run frontend lint and existing tests; no new test files required unless the team prefers unit tests for modal/dropdown behavior.

## Risks and edge cases

- **TopNav**: If the flyout is rendered in a portal or outside `navRef`, the click-outside check must include the flyout container so clicks on menu items are not treated as outside. Current structure has flyout inside `topnav-dropdown-wrap` which is inside `navRef`; verify and adjust the containment check if needed.
- **Escape**: If multiple modals could be stacked in the future, consider closing only the topmost; for this issue, only one modal is open at a time.
- **Focus**: Restoring focus to the trigger button after closing the modal improves accessibility; add if straightforward in the same change set.
