# Plan: CSS design system with shared variables and component classes

**GitHub issue:** [#159](https://github.com/jpDxsolo/league_szn/issues/159) — CSS: Establish design system with shared variables and component classes

## Context

The app has inconsistent colors (e.g. Auth uses Netflix red via undefined CSS variables), duplicated division-filter CSS across Standings, Championships, and WrestlerCosts, and global button styling that forces overrides. This plan introduces a single design token file, a button variant system, and a reusable DivisionFilter component so colors and patterns stay consistent and maintainable.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review CSS and component changes |
| Before commit | git-commit-helper | Conventional commit message |

## Agents and parallel work

- **Suggested order**: Step 1 → Step 2 → Step 4 → Steps 5+6+7 → Step 8.
- **Agent types**: `general-purpose` for all steps (frontend CSS and React components).

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/variables.css` | Create | Design tokens (:root CSS custom properties) |
| `frontend/src/index.css` | Modify | Import variables.css first |
| `frontend/src/App.css` | Modify | Use variables; remove global button styles; add .btn-* classes |
| `frontend/src/components/DivisionFilter.tsx` | Create | Reusable division filter component |
| `frontend/src/components/DivisionFilter.css` | Create | Shared division filter styles using variables |
| `frontend/src/components/Standings.tsx` | Modify | Use DivisionFilter; remove inline division filter markup |
| `frontend/src/components/Standings.css` | Modify | Remove .division-filter block; use variables where applicable |
| `frontend/src/components/Championships.tsx` | Modify | Use DivisionFilter; remove inline division filter markup |
| `frontend/src/components/Championships.css` | Modify | Remove .division-filter block; use variables where applicable |
| `frontend/src/components/fantasy/WrestlerCosts.tsx` | Modify | Use DivisionFilter (no "No division" option) |
| `frontend/src/components/fantasy/WrestlerCosts.css` | Modify | Remove .division-filter and .filter-btn blocks; use variables where applicable |
| `frontend/src/components/auth/Auth.css` | Modify | Use design system variables and .btn-primary for submit |

## Implementation steps

### Step 1: Create design token file and import it

- Create `frontend/src/variables.css` with:

```css
:root {
  --color-primary: #d4af37;
  --color-primary-hover: #b8941f;
  --color-bg: #0f0f0f;
  --color-surface: #1a1a1a;
  --color-surface-hover: #252525;
  --color-border: #333;
  --color-text: #fff;
  --color-text-secondary: #bbb;
  --color-text-muted: #666;
  --color-success: #4ade80;
  --color-danger: #dc3545;
  --color-danger-alt: #f87171;
  --color-warning: #fbbf24;
  --color-info: #0ea5e9;
  --color-neutral: #6b7280;
  --color-neutral-light: #9ca3af;
}
```

- In `frontend/src/index.css`, add at the top: `@import './variables.css';` (or import variables in `index.tsx` before `index.css` so variables are available everywhere).

### Step 2: Button variant system and variables in App.css

- In `frontend/src/App.css`:
  - Replace all hardcoded colors with variables: `.App` background `var(--color-bg)`, color `var(--color-text)`; `h2` color `var(--color-primary)`; `input, select, textarea` background `var(--color-surface)`, border `var(--color-border)`, color `var(--color-text)`, focus border `var(--color-primary)`; `th` background `var(--color-surface)`, color `var(--color-primary)`; `tr:hover` background `var(--color-surface)`; `th, td` border-bottom `var(--color-border)`; print section as needed.
  - Remove the global `button` and `button:hover` rules (background #d4af37, etc.).
  - Add a base `.btn` class: padding 0.75rem 1.5rem, border-radius 4px, font-size 1rem, font-weight bold, cursor pointer, transition. Then add:
    - `.btn-primary`: background `var(--color-primary)`, color #000; hover `var(--color-primary-hover)`.
    - `.btn-secondary`: transparent bg, border `var(--color-border)`, color `var(--color-text-secondary)`; hover border and color primary.
    - `.btn-danger`: background `var(--color-danger)`, color #fff; hover slightly darker.
    - `.btn-ghost`: transparent, no border; hover subtle background.
  - So that existing default-looking buttons still work, add `button:not([class*="btn-"]) { ... }` using variables (e.g. primary colors) as a fallback, or ensure key pages use `btn btn-primary` where needed. Auth and DivisionFilter will use design tokens in later steps.

### Step 3: DivisionFilter component and CSS

- Create `frontend/src/components/DivisionFilter.tsx`:
  - Props: `divisions: Division[]`, `selectedDivision: string` (divisionId or 'all' or 'none'), `onSelect: (id: string) => void`, `labelKey?: string` (i18n key for "Filter by division:"), `showNoDivision?: boolean` (default true for Standings/Championships; false for WrestlerCosts).
  - Render: a wrapper with class `division-filter`; if `labelKey`, a `span.filter-label` with `t(labelKey)`; a `div.filter-buttons` with button "All" (onSelect('all')), then each division (onSelect(division.divisionId)), then if showNoDivision a "No division" button (onSelect('none')). Buttons use class `filter-btn` and `active` when selected. Use existing i18n keys: `standings.filterByDivision`, `championships.filterByDivision`, `common.all`, `standings.noDivision`.
  - Import `DivisionFilter.css`.
- Create `frontend/src/components/DivisionFilter.css` with the same rules currently in Standings.css for `.division-filter`, `.division-filter .filter-label`, `.filter-buttons`, `.filter-btn`, `.filter-btn:hover`, `.filter-btn.active`, using variables (e.g. color #bbb → `var(--color-text-secondary)`, #1a1a1a → `var(--color-surface)`, #333 → `var(--color-border)`, #d4af37 → `var(--color-primary)`). Include the responsive rule for `.division-filter .filter-btn` at 768px if present.

### Step 4: Standings – use DivisionFilter and variables

- In `frontend/src/components/Standings.tsx`: Replace the inline division filter div and buttons with `<DivisionFilter divisions={divisions} selectedDivision={selectedDivision} onSelect={setSelectedDivision} labelKey="standings.filterByDivision" showNoDivision />`. Import DivisionFilter. Remove the now-redundant division-filter markup.
- In `frontend/src/components/Standings.css`: Delete the entire `.division-filter` block (and its responsive media-query part). Replace remaining hardcoded colors with variables (e.g. #bbb → `var(--color-text-secondary)`, #1a1a1a → `var(--color-surface)`, #d4af37 → `var(--color-primary)`, #4ade80 / #f87171 / #fbbf24 / #9ca3af for form-dots and streak/win/loss/draw, etc.).

### Step 5: Championships – use DivisionFilter and variables

- In `frontend/src/components/Championships.tsx`: Replace the inline division filter with `<DivisionFilter divisions={divisions} selectedDivision={selectedDivision} onSelect={setSelectedDivision} labelKey="championships.filterByDivision" showNoDivision />`. Import DivisionFilter.
- In `frontend/src/components/Championships.css`: Delete the entire `.division-filter` block (lines 197–234). Replace remaining hardcoded colors with variables (e.g. #1a1a1a, #333, #d4af37, #0f0f0f, #666, #888, #bbb).

### Step 6: WrestlerCosts – use DivisionFilter and variables

- In `frontend/src/components/fantasy/WrestlerCosts.tsx`: Replace the inline division filter div and buttons with `<DivisionFilter divisions={divisions} selectedDivision={selectedDivision} onSelect={setSelectedDivision} showNoDivision={false} />` (no label or pass an optional labelKey if a "Filter by division" label is desired for WrestlerCosts). Import DivisionFilter.
- In `frontend/src/components/fantasy/WrestlerCosts.css`: Remove the `.division-filter` and `.filter-btn` / `.filter-btn:hover` / `.filter-btn.active` rules (and any responsive override for .division-filter). Replace other hardcoded colors in that file with variables where it makes sense (e.g. #1a1a1a, #333, #d4af37, #bbb, #888).

### Step 7: Auth.css – design system variables and primary button

- In `frontend/src/components/auth/Auth.css`: Replace all `var(--accent-color, #e50914)` and `var(--card-bg, #1a1a2e)` etc. with design system variables: use `var(--color-primary)` for accent (so auth matches app gold), `var(--color-surface)` or `var(--color-bg)` for card/input background, `var(--color-border)`, `var(--color-text)`, `var(--color-text-secondary)`, `var(--color-danger)` for error message. For the submit button, use class `btn btn-primary` (or keep .btn-submit but set its background to `var(--color-primary)` and hover to `var(--color-primary-hover)` so it matches the app). Remove fallbacks to Netflix red (#e50914); use danger only for error state.

## Dependencies and order

- Step 1 must be first so variables exist.
- Step 2 depends on Step 1 (uses variables in App.css).
- Step 3 (DivisionFilter) depends on Step 1; filter buttons can use variables in DivisionFilter.css.
- Steps 4, 5, 6 depend on Step 3 and can run in parallel.
- Step 7 (Auth) depends on Step 1.

**Suggested order**: Step 1 → Step 2 → Step 3 → Steps 4+5+6 → Step 7.

## Testing and verification

- **Manual**: Load app; confirm Standings and Championships division filters look and behave the same as before. Load WrestlerCosts (fantasy) and confirm division filter works without "No division". Log in (Auth page): confirm accent is gold and card/inputs use design system colors. Click through Standings, Championships, a few admin or modal buttons to ensure no broken button styles.
- **Lint**: Run frontend ESLint; fix any issues.
- **Tests**: Run frontend tests; fix any snapshot or selector failures caused by new class names or DivisionFilter usage.

## Risks and edge cases

- **Global button removal**: Any component that relied on the global `button` style and does not add `btn btn-primary` may look unstyled until updated. Prefer adding `.btn.btn-primary` to obviously primary actions in the same pass where App.css is changed, or add a single global fallback (e.g. `button { ... }` using variables) so existing buttons still look acceptable.
- **WrestlerCosts label**: Standings/Championships use a label; WrestlerCosts currently has no label. DivisionFilter supports optional labelKey; omit for WrestlerCosts so layout stays the same.
- **i18n**: DivisionFilter uses existing keys (`standings.filterByDivision`, `championships.filterByDivision`, `common.all`, `standings.noDivision`). No new keys required unless WrestlerCosts gets a label later.
