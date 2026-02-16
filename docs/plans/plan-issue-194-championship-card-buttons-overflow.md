# Plan: Fix championship card action buttons overflowing card border

**GitHub issue:** [#194](https://github.com/jpDxsoloOrg/league_szn/issues/194) — [Fix championship card action buttons overflowing card border](https://github.com/jpDxsoloOrg/league_szn/issues/194)

## Context

On Manage Championships, the Edit / Vacate / Delete buttons at the bottom of each championship card overflow the card’s right edge. The layout should keep all actions inside the card and still look good.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review CSS/component changes |
| Before commit | git-commit-helper | Conventional commit message |

## Agents and parallel work

- **Suggested order**: Single step (CSS + optional small TSX tweak). One agent can do it.
- **Agent type**: general-purpose (frontend/CSS).

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/components/admin/ManageChampionships.css` | Modify | Contain action buttons in card: flex-wrap, min-width, and/or smaller sizing so they don’t overflow |
| `frontend/src/components/admin/ManageChampionships.tsx` | Modify only if needed | Optional: wrap actions in a container or use more compact labels/icons if we change to a menu |

## Implementation steps

### Step 1: Keep action buttons inside the card (CSS)

1. **File**: `frontend/src/components/admin/ManageChampionships.css`
2. **Card container**: Ensure the card clips or contains its content so nothing visually escapes (e.g. `.championship-card { overflow: hidden; }` or `min-width: 0` where needed). Prefer not clipping if we can fix layout so overflow doesn’t occur.
3. **Action row** (`.championship-actions`):
   - Allow wrapping so on narrow cards (e.g. grid `minmax(280px, 1fr)`) buttons don’t overflow: `flex-wrap: wrap`.
   - Let flex children shrink so they stay inside the card: add `min-width: 0` to the three button classes (`.championship-edit-btn`, `.championship-vacate-btn`, `.championship-delete-btn`) so `flex: 1` can shrink.
   - Optionally reduce horizontal padding (e.g. `padding: 0.5rem 0.5rem` or `0.5rem 0.75rem`) and/or font-size so three buttons fit on one row in a ~280px-wide card.
4. **Optional alternatives** (choose one approach that fits the design):
   - **Stack on small width**: Use a media query or container query so that below a certain width the action buttons stack vertically (`flex-direction: column`) and remain full-width within the card.
   - **Single actions menu**: If the team prefers a single “Actions” dropdown (Edit / Vacate / Delete), that would be a small TSX + CSS change; document in the plan that this is an acceptable alternative and implement only if chosen.
5. **Visual check**: Ensure the card border (yellow) fully contains the buttons at 280px card width and on typical viewport sizes; no horizontal overflow.

### Step 2: Optional – compact labels or icons (only if needed)

- If after Step 1 the buttons still feel cramped, consider shorter labels (e.g. keep “Edit”, “Vacate”, “Delete” but ensure they wrap or use smaller padding) or icon-only with `title` tooltips. Prefer layout fixes first.

## Dependencies and order

- **Step 1** is required and sufficient for the acceptance criteria.
- **Step 2** only if Step 1 doesn’t yield a “nice” look.

**Suggested order**: Step 1 → (optional) Step 2.

## Testing and verification

- **Manual**: Open Admin → Manage Championships. With one or more championship cards, confirm:
  - All three buttons (Edit, Vacate, Delete) stay inside the card border at desktop and when the grid column is narrow (e.g. 280px).
  - No horizontal scroll or visual overflow on the card.
- **Existing tests**: Run `frontend` tests (e.g. `ManageChampionships.test.tsx`); no changes to behavior, only layout/CSS.
- **New tests**: None required unless we add an actions menu (then add a test for opening the menu and actions).

## Risks and edge cases

- **Very long championship names**: Card content (title, division, champion) can still wrap; focus is only on the action row. If the card height grows a lot, ensure the action row remains at the bottom and doesn’t overlap.
- **RTL**: If the app supports RTL later, flex layout should still contain the buttons; no extra work for this issue.
- **Accessibility**: If we switch to icon-only buttons, keep `aria-label` or `title` and ensure focus order stays logical.
