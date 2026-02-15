# Plan: Toggle between sidebar (hamburger) and horizontal top navigation

**GitHub issue:** [#124](https://github.com/jpDxsolo/league_szn/issues/124) — Toggle between sidebar (hamburger) and horizontal top navigation

## Context

Users want to choose between the current sidebar (hamburger) navigation and a traditional horizontal top menu. The app already has grouped sub-menus; both layouts should reuse the same structure with only the presentation changing. Preference should persist across sessions.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review changed/new components and layout |
| Before commit | git-commit-helper | Conventional commit message |
| When adding tests | test-generator | Scaffold tests for nav layout toggle and TopNav |

Only include skills that actually apply to this request.

## Agents and parallel work

- **Suggested order**: Step 1 (preference state + key) → Steps 2+3 in parallel (shared nav config + TopNav component) → Step 4 (integrate layout + toggle in App/TopBar) → Step 5 (tests).
- **Agent types**: `general-purpose` for Steps 1–4; `test-engineer` or `general-purpose` for Step 5.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/contexts/NavLayoutContext.tsx` | Create | Hold layout mode (sidebar | topnav) and setter; read/write preference from localStorage |
| `frontend/src/config/navConfig.ts` (or under `components/`) | Create | Single source of truth for nav groups, labels, and routes (used by Sidebar and TopNav) |
| `frontend/src/components/Sidebar.tsx` | Modify | Consume nav config (if extracted); optionally show layout toggle in footer; respect layout mode (hide when topnav is active) |
| `frontend/src/components/TopNav.tsx` | Create | Horizontal nav bar: top-level groups as items, sub-menus as dropdowns/flyouts; same groups as Sidebar |
| `frontend/src/components/TopNav.css` | Create | Styles for horizontal bar and dropdowns |
| `frontend/src/components/TopBar.tsx` | Modify | Add layout toggle (sidebar vs topnav icon/button); when topnav mode, ensure TopNav is visible (e.g. below TopBar or integrated) |
| `frontend/src/App.tsx` | Modify | Wrap with NavLayoutProvider; conditionally render Sidebar or TopNav based on preference; adjust main layout class for topnav (e.g. no sidebar offset) |
| `frontend/src/App.css` | Modify | Layout classes for topnav mode (e.g. `.App.topnav-layout` with no sidebar column) |
| `frontend/src/components/Sidebar.css` | Modify | No structural change if Sidebar is simply not rendered in topnav mode; optional tweaks for toggle placement |
| `frontend/src/components/__tests__/Sidebar.test.tsx` | Modify | Mock NavLayoutContext; ensure Sidebar still renders and behaves when in sidebar mode |
| `frontend/src/components/__tests__/TopNav.test.tsx` | Create | Render TopNav with mock auth/config; assert groups and links |
| `frontend/src/components/__tests__/App.test.tsx` | Modify | Mock NavLayoutContext; assert both layouts can be shown based on context |

## Implementation steps

### Step 1: Preference state and persistence

- Create `frontend/src/contexts/NavLayoutContext.tsx`.
- State: `layoutMode: 'sidebar' | 'topnav'`, setter `setLayoutMode`.
- On mount, read from `localStorage` (e.g. key `league_szn_nav_layout`); default `'sidebar'`.
- When `setLayoutMode` is called, update state and write to localStorage.
- Export `NavLayoutProvider` and `useNavLayout()`.

### Step 2: Shared nav config (single source of truth)

- Add `frontend/src/config/navConfig.ts` (or `frontend/src/components/nav/navConfig.ts`).
- Define structure: public groups (e.g. Core with routes, Wrestler with routes, Help), admin groups (Match ops, League setup, etc.), and which routes belong to which group. Structure should be easy to consume by both Sidebar and TopNav (e.g. array of groups, each with `key`, `labelKey`, `items: { to, labelKey }[]`, and optional `adminOnly` / feature flags).
- Refactor `Sidebar.tsx` to use this config for rendering groups and links (optional in same step or Step 4). If refactor is large, Step 2 can just add the config and Step 4 can switch Sidebar to use it when integrating.

### Step 3: TopNav component (horizontal bar)

- Create `frontend/src/components/TopNav.tsx`: horizontal bar that renders the same groups as Sidebar.
- Each top-level group is a button or link; click opens a dropdown/flyout with the same sub-items as in Sidebar. Use the same nav config as Sidebar (from Step 2).
- Handle auth: hide admin group when not admin; show Wrestler group only when applicable (reuse same logic as Sidebar from AuthContext / SiteConfig).
- Accessibility: aria-expanded, focus trap or focus management in dropdown, Escape to close.
- Create `TopNav.css` for layout and dropdown styling. Ensure it works below TopBar (or integrated) and doesn’t break on small screens (define behavior: e.g. collapse to a single “Menu” that opens the same structure in a sheet/modal).

### Step 4: Layout integration and toggle

- In `App.tsx`: wrap app with `NavLayoutProvider`. When `layoutMode === 'sidebar'`, render `Sidebar` as today; when `layoutMode === 'topnav'`, render `TopNav` (e.g. below TopBar or in a dedicated slot) and do not render Sidebar. Apply a layout class to the app container for topnav (e.g. `App topnav-layout`) so main content doesn’t reserve sidebar space.
- In `TopBar.tsx`: add a layout toggle control (e.g. two icons: “sidebar” and “horizontal menu”). On click, call `setLayoutMode('sidebar')` or `setLayoutMode('topnav')`. Ensure the toggle is visible in both layouts (so users can switch back).
- Update `App.css`: for `.App.topnav-layout`, set layout so main content is full-width (no sidebar column). Ensure TopNav has a clear visual home (e.g. full-width bar under TopBar).

### Step 5: Tests and cleanup

- **Sidebar.test.tsx**: Provide a mock `NavLayoutContext` with `layoutMode: 'sidebar'` so existing tests still pass. Optionally add a test that Sidebar is not rendered when layout is topnav (if that’s asserted in App).
- **TopNav.test.tsx**: New file. Render TopNav with mocked auth and nav config; assert presence of expected groups and links; optionally assert dropdown open/close.
- **App.test.tsx**: Mock NavLayoutContext; assert that for `layoutMode === 'sidebar'` the sidebar is present and for `layoutMode === 'topnav'` the top nav is present (and sidebar absent). May need to adjust existing sidebar mock.
- Run existing tests and fix any regressions.

## Dependencies and order

- Step 1 must be done first (context and persistence).
- Steps 2 and 3 can be done in parallel once Step 1 exists (nav config is independent; TopNav can use a temporary inline config then switch to shared config in Step 4).
- Step 4 depends on Steps 1, 2, and 3 (integrate context, config, Sidebar refactor if any, TopNav, and toggle).
- Step 5 depends on Step 4.

**Suggested order**: Step 1 → Steps 2+3 → Step 4 → Step 5.

## Testing and verification

- **Manual**: Toggle between sidebar and topnav; refresh and confirm preference persists. Navigate from both layouts; verify admin and wrestler sections show/hide correctly. Test keyboard and dropdown close on Escape. Test narrow viewport for both layouts.
- **Existing tests**: Sidebar and App tests may need NavLayoutContext mocks; update as above.
- **New tests**: TopNav rendering and optional layout toggle behavior; consider using **test-generator** for TopNav and context tests.

## Risks and edge cases

- **Backward compatibility**: First load has no localStorage key; default to sidebar so current behavior is unchanged.
- **Mobile**: Define whether topnav mode on mobile collapses to one menu button; ensure touch targets and overflow are acceptable.
- **i18n**: Nav config should use the same translation keys as Sidebar (`t('nav.standings')`, etc.) so both layouts stay in sync with translations.
