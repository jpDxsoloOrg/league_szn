# Plan: Organize Admin and User Menus into Subgroups

## Context

The Sidebar component (`frontend/src/components/Sidebar.tsx`) renders all navigation as flat lists. The admin section has 18 items (lines 182-238) and the public section has 9+ items (lines 86-167), many conditionally visible based on roles (`isWrestler`, `isAdminOrModerator`, `isSuperAdmin`) and feature flags (`features.challenges`, `features.promos`, etc.). This makes the menu overwhelming. The goal is to group both public and admin nav items into collapsible sub-menus for better UX, with no backend changes and no new features.

The admin routing uses a flat `AdminTab` union type and `VALID_TABS` array in `AdminPanel.tsx` (line 28-30), which does not need to change since URLs remain the same. The TopBar breadcrumb system (`TopBar.tsx`) maps admin tabs to labels and will need updated breadcrumbs to reflect the new grouping.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/components/Sidebar.tsx` | Modify | Restructure public nav (lines 86-167) and admin nav (lines 180-239) into collapsible sub-groups with expand/collapse state |
| `frontend/src/components/Sidebar.css` | Modify | Add CSS for sub-group headers, nested indentation, expand/collapse toggles, and visual separators |
| `frontend/src/components/TopBar.tsx` | Modify | Update breadcrumbs to include group names (e.g., "Admin / Match Operations / Schedule Match") using the `adminTabMap` (lines 17-33) |
| `frontend/src/i18n/locales/en.json` | Modify | Add translation keys for sub-group labels (e.g., `nav.groups.matchOps`, `nav.groups.leagueSetup`, `admin.groups.fantasy`, `admin.groups.system`) |
| `frontend/src/i18n/locales/de.json` | Modify | Add corresponding German translations for new sub-group label keys |

## Implementation Steps

### Step 1: Define the sub-group structure as a data model in Sidebar.tsx

In `Sidebar.tsx`, before the component (or at the top of the function body), define two data structures representing the grouped navigation items. This replaces the current inline JSX links with a declarative structure.

**Public nav groups** (replaces lines 86-167):
- "Core" (no header, always visible): Standings `/`, Championships `/championships`, Events `/events`, Tournaments `/tournaments`
- "Wrestler" (header label, role-gated to `isWrestler`): My Profile `/profile`, Challenges `/challenges` (feature-gated), Promos `/promos` (feature-gated)
- "Extras" (header label, feature-gated items): Contenders `/contenders` (feature: contenders), Statistics `/stats` (feature: statistics), Fantasy `/fantasy` (feature: fantasy)
- Help `/guide` (standalone, always at bottom of public nav)

**Admin nav sub-groups** (replaces lines 181-239):
- "Match Operations": Schedule Match `/admin/schedule`, Record Results `/admin/results`, Events `/admin/events`, Match Config `/admin/match-config`
- "League Setup": Players `/admin/players`, Divisions `/admin/divisions`, Seasons `/admin/seasons`, Championships `/admin/championships`, Tournaments `/admin/tournaments`
- "Content & Social": Challenges `/admin/challenges` (disabled), Promos `/admin/promos` (disabled), Contender Config `/admin/contender-config`
- "Fantasy": Fantasy Shows `/admin/fantasy-shows`, Fantasy Config `/admin/fantasy-config`
- "System": User Management `/admin/users`, Feature Management `/admin/features`, Help `/admin/guide`, Danger Zone `/admin/danger` (super-admin only)

### Step 2: Add expand/collapse state for sub-groups in Sidebar.tsx

Currently there is a single `adminExpanded` state (line 14). Replace or augment this with a state object tracking which sub-groups are expanded. Use a `Record<string, boolean>` or a `Set<string>` for expanded group IDs.

Add a new state variable at approximately line 14-15. Keep the existing `adminExpanded` state for the top-level "Admin" toggle (lines 172-178). The sub-groups only appear when `adminExpanded` is true.

Add a `toggleGroup` callback function that flips the boolean for a given group key.

Auto-expand the sub-group containing the current active route on mount and on location change. Extend the existing `useEffect` at lines 18-22 to detect which admin sub-group the current path belongs to and expand it.

### Step 3: Update the public nav JSX (lines 86-167)

Replace the flat list of links with grouped sections. The "Core" group renders without a header (just the links). The "Wrestler" and "Extras" groups each get a clickable header label that toggles expand/collapse. Items within collapsed groups are hidden.

For the public section, sub-groups are simpler -- use a visual separator (thin border or label) rather than full collapsible sections since there are fewer items. The "Wrestler" items at lines 108-140 already have role-gating logic; wrap them in a sub-section div with a label. Similarly wrap the feature-gated items (Contenders, Statistics, Fantasy) at lines 100-162 in an "Extras" sub-section.

Non-wrestler users who see disabled items (e.g., "My Profile - Wrestler Only" at lines 126-128) should still see them in the appropriate group.

### Step 4: Update the admin nav JSX (lines 180-239)

Replace the flat `admin-nav-items` div contents with a loop or explicit sub-group sections. Each sub-group gets:
- A clickable header with expand/collapse arrow (reuse the toggle pattern from lines 172-178)
- The links rendered only when the sub-group is expanded
- Proper indentation (deeper than current admin items, which are already indented at `padding-left: 2rem`)

The disabled items (Challenges, Promos at lines 215-219) stay as `<span className="nav-disabled">` within the "Content & Social" group.

The Danger Zone link (lines 234-238) stays gated behind `isSuperAdmin` within the "System" group.

### Step 5: Add CSS for sub-group styling in Sidebar.css

Add new CSS classes after the existing `.admin-nav-items` styles (around line 141):

- `.nav-subgroup` -- container for a sub-group, with slight bottom margin
- `.nav-subgroup-toggle` -- clickable header for sub-groups, styled similarly to `.nav-section-toggle` but smaller font, lighter color (e.g., `#888`), with a smaller arrow indicator. Indented to align with admin items (`padding-left: 2rem`)
- `.nav-subgroup-items` -- container for links within a sub-group, links get `padding-left: 2.75rem` (deeper than the current `2rem`)
- `.nav-subgroup-items a.active` -- active style with adjusted padding-left for the 3px border-left
- `.nav-subgroup-label` -- for public nav group labels (non-collapsible), a smaller muted label

For public nav groups, use a simpler visual treatment: a thin separator line and optional small label above each group.

### Step 6: Add translation keys for sub-group headers

In `en.json`, add keys under `nav.groups` and `admin.groups`:

Under `nav` (after line 44):
- `nav.groups.wrestler`: "Wrestler"
- `nav.groups.extras`: "More"

Under `admin.panel` (new `groups` object alongside `tabs`):
- `admin.panel.groups.matchOps`: "Match Operations"
- `admin.panel.groups.leagueSetup`: "League Setup"
- `admin.panel.groups.contentSocial`: "Content & Social"
- `admin.panel.groups.fantasy`: "Fantasy"
- `admin.panel.groups.system`: "System"

Add corresponding German translations in `de.json`:
- `nav.groups.wrestler`: "Wrestler"
- `nav.groups.extras`: "Mehr"
- `admin.panel.groups.matchOps`: "Match-Operationen"
- `admin.panel.groups.leagueSetup`: "Liga-Einrichtung"
- `admin.panel.groups.contentSocial`: "Inhalte & Soziales"
- `admin.panel.groups.fantasy`: "Fantasy"
- `admin.panel.groups.system`: "System"

### Step 7: Update TopBar breadcrumbs

In `TopBar.tsx`, update the `getPageInfo` function (lines 9-121) to include the sub-group name in breadcrumbs for admin routes. Currently the breadcrumb is "Admin / Schedule Match". After this change it should be "Admin / Match Operations / Schedule Match".

Create a `tabToGroup` mapping (alongside `adminTabMap` at line 17) that maps each tab string to its group translation key. When constructing the return object for admin routes, include the group name in the breadcrumb.

The simpler approach: just make `parent` a compound string like `${t('nav.admin')} / ${groupName}` so the existing breadcrumb rendering at lines 127-135 works without structural changes.

## Dependencies & Order

1. **Step 6 (translations)** can be done first or in parallel with everything else -- no dependencies.
2. **Step 1 (data model)** should come before Steps 3 and 4 since the JSX restructuring depends on the group definitions.
3. **Step 2 (state management)** should come before Steps 3 and 4 since the JSX needs the toggle state.
4. **Steps 3 and 4 (JSX updates)** depend on Steps 1 and 2 but are independent of each other.
5. **Step 5 (CSS)** can be done in parallel with Steps 3-4 but should be tested together.
6. **Step 7 (TopBar)** depends on finalizing the group names from Step 6 but is otherwise independent.

No backend changes are needed. No route changes are needed. `AdminPanel.tsx` does not need changes since the `AdminTab` type and `VALID_TABS` array are route-based and unaffected by sidebar grouping.

## Testing & Verification

1. **Visual verification**: Load the app at all viewport sizes. Confirm the sidebar shows grouped items with collapsible headers. Test on mobile (below 768px) to ensure the hamburger menu and overlay still work correctly.
2. **Active state highlighting**: Navigate to each admin route and confirm the correct sub-group auto-expands, the correct link shows the active gold border-left, and the breadcrumb in TopBar reflects the group.
3. **Role-gating**: Log in as different roles (unauthenticated, Wrestler, Fantasy, Moderator, Admin/SuperAdmin) and confirm each role sees only the appropriate groups and items. Specifically verify:
   - Unauthenticated users see only public nav with no admin section
   - Wrestlers see the "Wrestler" group items enabled
   - Non-wrestlers see "My Profile" as disabled with "Wrestler Only" label
   - Moderators see the admin section but not "Danger Zone"
   - SuperAdmins see "Danger Zone" in the "System" group
4. **Feature flags**: Toggle feature flags via admin Feature Management and confirm items appear/disappear within their groups. If a group becomes entirely empty (all features disabled), the group header should also be hidden.
5. **Expand/collapse persistence**: Click through multiple sub-groups, expand/collapse them, and confirm state persists during the session. Navigate away and back to admin routes and confirm the relevant sub-group auto-expands.
6. **i18n**: Switch between English and German and confirm all group labels translate correctly.
7. **Keyboard accessibility**: Verify sub-group toggle buttons are keyboard-focusable and can be toggled with Enter/Space.

## Risks & Edge Cases

1. **Empty sub-groups**: When all feature flags for a group's items are disabled (e.g., both Fantasy Shows and Fantasy Config become hidden), the group header should be hidden too. Add conditional rendering: only render a sub-group if at least one item within it is visible.
2. **Mobile scroll**: With collapsible sub-groups, the sidebar height may change dynamically. The sidebar already has `overflow-y: auto` (line 12 of CSS), so this should handle it, but verify on small screens where many groups are expanded simultaneously.
3. **CSS specificity conflicts**: The current admin items use `.admin-nav-items a` for styling (line 125). Adding a deeper nesting level (`.nav-subgroup-items a`) needs to either match or exceed that specificity. Test that active states, hover states, and disabled states all render correctly at the new nesting depth.
4. **Auto-expand on direct URL navigation**: If a user navigates directly to `/admin/fantasy-config` via URL, the "Admin" toggle, the "Fantasy" sub-group, and the correct link must all be expanded/highlighted. The current `useEffect` at lines 18-22 only sets `adminExpanded = true` for admin routes. Extend this to also expand the relevant sub-group.
5. **State bloat**: Using a `Record<string, boolean>` for 5 admin sub-groups is trivial, but if the expand/collapse state is ever persisted to localStorage, keep the keys stable and minimal.
6. **No breaking changes to routes**: This plan intentionally does NOT change any routes or the `AdminTab` type. All URLs remain identical. This is critical for bookmarks, shared links, and the GitHub Actions deploy process.
