# Plan: Add Admin Guide to Help wiki (admin/moderator only)

**GitHub issue:** [#150](https://github.com/jpDxsolo/league_szn/issues/150) — [Add Admin Guide to Help wiki, visible and accessible only to admins/moderators](https://github.com/jpDxsolo/league_szn/issues/150)

## Context

Expose the existing Admin Guide as part of the Help wiki at `/guide` so admins and moderators can access it from Help, while keeping it invisible and inaccessible to everyone else.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review changed wiki and auth components |
| Before commit | git-commit-helper | Conventional commit message |
| If route or auth logic changes | security-auditor | Verify access control and no info leakage |

## Agents and parallel work

- **Suggested order**: Step 1 → Steps 2+3 (in parallel) → Step 4 → Step 5. Step 1 (route + guard) unblocks; index and sidebar can be done together; then i18n and tests; finally remove old admin guide tab and help link from admin menu.
- **Agent types**: `general-purpose` for routing and components; `test-engineer` for Wiki and admin-guide tests if adding new cases.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/App.tsx` | Modify | Add route for `/guide/wiki/admin-guide` rendering AdminGuide inside WikiLayout, wrapped in admin/moderator guard |
| `frontend/src/components/WikiIndex.tsx` | Modify | Show "Admin Guide" link only when `isAdminOrModerator` (e.g. append entry or filter from index) |
| `frontend/src/components/WikiSidebar.tsx` | Modify | Show "Admin Guide" in sidebar only when `isAdminOrModerator` |
| `frontend/src/components/ProtectedRoute.tsx` or new wrapper | Modify or Create | Support "admin or moderator" guard (e.g. `requiredAdminOrModerator` prop or new `AdminOnlyRoute` component) |
| `frontend/src/i18n/locales/en.json` | Modify | Add `wiki.articles.adminGuide` (and any wiki nav strings if needed) |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys for German |
| `frontend/public/wiki/index.json` | Optional | Only if adding `adminOnly` flag for admin-guide entry; otherwise inject link only in UI |
| `frontend/src/components/__tests__/Wiki.test.tsx` or WikiIndex.test | Modify / Create | Assert Admin Guide link hidden when not admin, visible when admin |
| `frontend/src/components/admin/__tests__/AdminGuide.test.tsx` | Modify | If route or wrapper is used, ensure tests still pass |
| `frontend/src/config/navConfig.ts` | Modify | Remove Help link from admin menu (system group: `/admin/guide` and from `getAdminGroupForPath` system array) |
| `frontend/src/components/admin/AdminPanel.tsx` | Modify | Remove `guide` tab: drop AdminGuide import, remove from AdminTab / VALID_TABS, remove `activeTab === 'guide'` branch |
| `frontend/src/components/TopBar.tsx` | Modify | Remove `guide` from admin tab map and tab-to-group map (breadcrumbs) |
| `frontend/src/components/admin/__tests__/AdminPanel.test.tsx` | Modify | Remove AdminGuide mock (no longer used in AdminPanel) |

## Implementation steps

### Step 1: Route and access control for Admin Guide

- In `frontend/src/App.tsx`, under the existing `<Route path="guide/wiki" element={<WikiLayout />}>`, add a route for the admin guide so it uses the same layout but renders the AdminGuide component and is protected.
- Option A: Add `<Route path="admin-guide" element={<AdminOnlyWikiArticle />} />` where `AdminOnlyWikiArticle` wraps `AdminGuide` with a check for `isAdminOrModerator` (from `useAuth()`). If false: unauthenticated → `<Navigate to="/login" />`; authenticated but not admin/moderator → show "Access denied" (reuse pattern from `ProtectedRoute`). If true: render `<AdminGuide />`.
- Option B: Extend `ProtectedRoute` to accept something like `requiredAdminOrModerator?: boolean` and use it for this route. Keep a single place for auth UX (loading, redirect, access denied).
- Ensure the route matches `/guide/wiki/admin-guide` (parent path from `App.tsx` is `guide/wiki`, so child `admin-guide` gives the full path). Do not use a catch-all `:slug` for this so the slug "admin-guide" is handled by the dedicated route and does not hit `WikiArticle` (which would try to load `/wiki/admin-guide.md`).

### Step 2: Show Admin Guide in wiki index only for admins/moderators

- In `frontend/src/components/WikiIndex.tsx`, use `useAuth()` and read `isAdminOrModerator`.
- After building the list from `index.json` (or when rendering the list), append an entry for "Admin Guide" linking to `/guide/wiki/admin-guide` only when `isAdminOrModerator` is true. Use a translation key such as `wiki.articles.adminGuide` for the label.
- Ensure search/filter still works if you include this entry in the same list (optional: include in `searchableList` when admin so it's searchable).

### Step 3: Show Admin Guide in wiki sidebar only for admins/moderators

- In `frontend/src/components/WikiSidebar.tsx`, use `useAuth()` and read `isAdminOrModerator`.
- When rendering the sidebar list from `index.json`, optionally append an entry for "Admin Guide" (`/guide/wiki/admin-guide`) when `isAdminOrModerator` is true. Highlight as current when `currentSlug === 'admin-guide'`.

### Step 4: i18n and tests

- Add `wiki.articles.adminGuide` (e.g. "Admin Guide") in `frontend/src/i18n/locales/en.json` and `frontend/src/i18n/locales/de.json` under the existing `wiki.articles` section.
- Add or update tests: (1) Wiki index or sidebar: when `isAdminOrModerator` is false, no Admin Guide link; when true, link present and points to `/guide/wiki/admin-guide`. (2) Direct visit to `/guide/wiki/admin-guide`: when not admin/moderator, redirect or access denied; when admin/moderator, AdminGuide content visible. Use existing wiki and auth mocks where applicable.

### Step 5: Remove old admin guide and help link from admin menu

- Remove the Help/Guide entry from the admin menu so the only way to reach the Admin Guide is via Help wiki (for admins/moderators).
- In `frontend/src/config/navConfig.ts`: remove the system group item `{ path: '/admin/guide', i18nKey: 'admin.panel.tabs.help' }` and remove `'/admin/guide'` from the `system` array in `getAdminGroupForPath`.
- In `frontend/src/components/admin/AdminPanel.tsx`: remove `AdminGuide` import; remove `'guide'` from the `AdminTab` type and from `VALID_TABS`; remove the branch `{activeTab === 'guide' && <AdminGuide />}`.
- In `frontend/src/components/TopBar.tsx`: remove `guide: t('admin.panel.tabs.help')` from `adminTabMap` and `guide: t('admin.panel.groups.system')` from `tabToGroup` (breadcrumbs for admin routes).
- In `frontend/src/components/admin/__tests__/AdminPanel.test.tsx`: remove the `vi.mock('../AdminGuide', ...)` mock since AdminGuide is no longer rendered by AdminPanel.

## Dependencies and order

- Step 1 must be done first (route and guard) so the URL is defined and protected.
- Steps 2 and 3 can run in parallel (index and sidebar both depend only on Step 1 and auth).
- Step 4 (i18n and tests) can follow after 2 and 3.
- Step 5 (remove old admin guide from admin menu) should be done after the wiki Admin Guide is in place (Steps 1–4), so admins have a single place to access the guide (Help wiki).
- **Suggested order**: Step 1 → Steps 2+3 → Step 4 → Step 5.

## Testing and verification

- Manual: Log in as admin/moderator → open Help → see "Admin Guide" in index and sidebar → open it and confirm content. Log out or use a non-admin account → open Help → no Admin Guide link; navigate directly to `/guide/wiki/admin-guide` → login redirect or access denied.
- Unit/integration: Wiki index and sidebar render Admin Guide link only when `isAdminOrModerator` is true; protected route denies or redirects when not admin/moderator. Consider **test-generator** for new route or wrapper tests.

## Risks and edge cases

- **Single entry point**: After Step 5, the Admin Guide is only reachable from the Help wiki (for admins/moderators); the admin panel no longer has a "Help" / "Guide" tab.
- **Direct URL**: Non-admins must not see content when opening `/guide/wiki/admin-guide` (enforce in the same guard used in Step 1).
- **index.json**: Prefer not adding `adminOnly` to the public wiki index unless we want the same list to drive both public and admin entries; injecting the link only in the UI when admin keeps the public index unchanged and avoids exposing an admin-only entry in a public file.
