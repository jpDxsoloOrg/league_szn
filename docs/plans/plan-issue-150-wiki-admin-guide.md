# Plan: Migrate Admin Guide to wiki articles (admin/moderator only), then remove old guide

**GitHub issue:** [#150](https://github.com/jpDxsolo/league_szn/issues/150) — [Migrate Admin Guide to wiki articles (admin/moderator only), then remove old guide](https://github.com/jpDxsoloOrg/league_szn/issues/150)

## Context

Replace the single React Admin Guide with **wiki articles** that cover every section (Quickstart, User Management, Divisions, Manage Players, Seasons, Championships, Events, Schedule Match, Record Results, Tournaments, Challenges, Promos, Contender Config, Data Management, Workflow). Admin-only articles are visible and accessible only to admins/moderators. Once all content is in the wiki and protected, delete the old `AdminGuide` component and the admin menu Help/Guide entry so there is **one** guide (the wiki).

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review wiki, auth, and removed component |
| Before commit | git-commit-helper | Conventional commit message |
| If route or auth logic changes | security-auditor | Verify access control and no info leakage |

## Agents and parallel work

- **Suggested order**: Step 1 (infrastructure) → Step 2 (create articles; can batch) → Step 3 (wire index/sidebar/guard) → Step 4 (i18n + tests) → Step 5 (remove old admin guide).
- **Agent types**: `general-purpose` for routing and wiki components; copy/edit for markdown from AdminGuide content.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/public/wiki/*.md` | Create | New admin-only wiki articles (see Step 2 for list) |
| `frontend/public/wiki/de/*.md` | Create | Optional German versions for admin articles |
| `frontend/public/wiki/index.json` or admin index | Modify or Create | Include admin-only entries with a flag (e.g. `adminOnly: true`) so UI can filter |
| `frontend/src/components/WikiArticle.tsx` | Modify | For admin-only slugs: require `isAdminOrModerator`; redirect or access denied if not |
| `frontend/src/components/WikiIndex.tsx` | Modify | Load index (or admin index); show only non-admin articles for public; append or filter admin articles when `isAdminOrModerator` |
| `frontend/src/components/WikiSidebar.tsx` | Modify | Same: show admin articles in sidebar only when `isAdminOrModerator` |
| `frontend/src/i18n/locales/en.json` | Modify | Add `wiki.articles.*` for each admin article title |
| `frontend/src/i18n/locales/de.json` | Modify | Same for German |
| `frontend/src/config/navConfig.ts` | Modify | Remove Help link from admin menu (`/admin/guide` from system group and `getAdminGroupForPath`) |
| `frontend/src/components/admin/AdminPanel.tsx` | Modify | Remove `guide` tab: AdminGuide import, AdminTab/VALID_TABS, `activeTab === 'guide'` branch |
| `frontend/src/components/TopBar.tsx` | Modify | Remove `guide` from admin tab map and tab-to-group map |
| `frontend/src/components/admin/AdminGuide.tsx` | Delete | Replaced by wiki articles |
| `frontend/src/components/admin/AdminGuide.css` | Delete | No longer needed |
| `frontend/src/components/admin/__tests__/AdminGuide.test.tsx` | Delete or repurpose | Component removed; add wiki tests for admin articles if needed |
| `frontend/src/components/admin/__tests__/AdminPanel.test.tsx` | Modify | Remove AdminGuide mock |

## Implementation steps

### Step 1: Wiki infrastructure for admin-only articles

- **Index format**: Decide how to mark admin-only articles. Option A: add `adminOnly: true` to entries in `index.json` for admin slugs (keeps one file; filter in UI). Option B: separate `admin-index.json` or section in index that is only loaded when `isAdminOrModerator`. Prefer Option A so one index drives both; filter by `adminOnly` when rendering.
- **Access control in WikiArticle**: In `frontend/src/components/WikiArticle.tsx`, when loading an article by slug, if the article is admin-only (from index or a known list of admin slugs), check `isAdminOrModerator`. If not authenticated → redirect to login. If authenticated but not admin/moderator → show "Access denied". Otherwise render as usual. Ensure admin-only slugs cannot be bypassed by direct URL.
- **Route order**: If using a single `:slug` route, WikiArticle already loads by slug; add the guard inside WikiArticle when the loaded article is admin-only. No new route required unless you add a dedicated admin layout.

### Step 2: Create wiki articles that span all Admin Guide content

- Convert the content of `AdminGuide.tsx` (and any inline text) into markdown. Create **wiki articles** so that every current section is covered. Suggested mapping (one article per topic or group):
  - **admin-quickstart** — Quickstart Guide (steps 1–10, demo mode).
  - **admin-user-management** — User Management (roles, Admin/Moderator/Wrestler/Fantasy).
  - **admin-divisions** — Divisions (create, assign players, division-locked contenders).
  - **admin-manage-players** — Manage Players (edit, images, divisions, delete).
  - **admin-seasons** — Seasons (create, active season, end season, standings).
  - **admin-championships** — Championships (create, images, current champion, history).
  - **admin-events** — Events (create, match card builder, reorder matches).
  - **admin-schedule-match** — Schedule Match (match type, participants, stipulation, championship/tournament, season, event).
  - **admin-record-results** — Record Results (select match, winners/losers/draws, auto-updates).
  - **admin-tournaments** — Tournaments (single-elimination, round-robin, brackets).
  - **admin-challenges** — Challenges (admin view, moderation).
  - **admin-promos** — Promos (admin view, moderation).
  - **admin-contender-config** — Contender Config (ranking period, min matches, division lock, recalculate).
  - **admin-data-management** — Data Management (Danger Zone: clear data, seed data; super-admin only).
  - **admin-workflow** — Typical Weekly Workflow (summary/checklist).
- Add each to `frontend/public/wiki/` as `<slug>.md`. Add a corresponding entry in the wiki index with `adminOnly: true` and a `titleKey` (e.g. `wiki.articles.adminQuickstart`).
- Optionally add `frontend/public/wiki/de/<slug>.md` and the same titleKey in German locale for each.

### Step 3: Show admin articles in wiki index and sidebar only for admins/moderators

- **WikiIndex**: When building the list from the index, filter or append: for non-admin users, exclude entries with `adminOnly: true`; for admin/moderator users, include them (e.g. under an "Admin" group or inline). Use `useAuth()` and `isAdminOrModerator`.
- **WikiSidebar**: Same logic: when rendering the sidebar, include admin-only entries only when `isAdminOrModerator`. Highlight current slug when on an admin article.
- Ensure search (if any) respects the same visibility so admin articles are only searchable by admins.

### Step 4: i18n and tests

- Add translation keys for every new admin article (e.g. `wiki.articles.adminQuickstart`, `wiki.articles.adminUserManagement`, …) in `en.json` and `de.json`.
- Tests: (1) Wiki index/sidebar do not show admin articles when `isAdminOrModerator` is false; they show when true. (2) Visiting an admin-only slug when not admin/moderator yields redirect or access denied; when admin/moderator, article content renders. (3) After Step 5, AdminPanel and nav no longer reference AdminGuide or the guide tab.

### Step 5: Remove old admin guide and help link from admin menu

- **navConfig**: Remove the system group item `{ path: '/admin/guide', i18nKey: 'admin.panel.tabs.help' }` and remove `'/admin/guide'` from the `system` array in `getAdminGroupForPath`.
- **AdminPanel**: Remove `AdminGuide` import; remove `'guide'` from `AdminTab` and `VALID_TABS`; remove the branch `{activeTab === 'guide' && <AdminGuide />}`.
- **TopBar**: Remove `guide` from `adminTabMap` and `tabToGroup`.
- **Delete**: `frontend/src/components/admin/AdminGuide.tsx`, `frontend/src/components/admin/AdminGuide.css`.
- **Tests**: Remove `vi.mock('../AdminGuide', ...)` from AdminPanel test. Remove or repurpose `AdminGuide.test.tsx` (e.g. delete or replace with wiki article tests).

## Dependencies and order

- Step 1 (infrastructure: index format + guard in WikiArticle) must be done first.
- Step 2 (create all wiki articles) can be done next; can be batched or split.
- Step 3 (index/sidebar filtering) depends on Step 1 and index format.
- Step 4 (i18n and tests) after 2 and 3.
- Step 5 (remove old guide) only after admin content is fully available in the wiki (Steps 1–4 complete).
- **Suggested order**: Step 1 → Step 2 → Step 3 → Step 4 → Step 5.

## Testing and verification

- Manual: As admin/moderator, open Help → see all admin articles in index/sidebar → open each and confirm content. As non-admin, open Help → no admin articles; direct URL to an admin slug → login or access denied. After Step 5: no Guide/Help in admin panel; no AdminGuide component.
- Unit/integration: Index/sidebar visibility; WikiArticle guard for admin slugs; AdminPanel and nav no longer reference guide.

## Risks and edge cases

- **Single source of truth**: After Step 5, the only admin guide is the wiki; no duplicate content anywhere.
- **Direct URLs**: All admin-only slugs must be protected in WikiArticle (or equivalent) so non-admins cannot see content.
- **Index**: Keeping `adminOnly` in the same `index.json` is simpler; ensure the file does not expose sensitive data (only titles/slugs). If you prefer not to list admin slugs in a public file, use a separate admin index loaded only when user is admin.
