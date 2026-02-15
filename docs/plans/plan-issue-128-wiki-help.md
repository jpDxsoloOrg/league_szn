# Plan: Add site wiki and surface it in the Help section

**GitHub issue:** [#128](https://github.com/jpDxsolo/league_szn/issues/128) — Add site wiki and surface it in the Help section

## Context

Introduce a wiki (expandable, multi-topic docs) for the league site and integrate it into the existing Help section so users can reach both the current User Guide and wiki content from one place. The Help entry point is `/guide` (UserGuide.tsx); the wiki should be discoverable and usable from there.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review new routes, wiki components, and Help integration |
| Before commit | git-commit-helper | Conventional commit message |
| If adding tests | test-generator | Scaffold tests for wiki routes and Help entry points |
| If README/setup changes | readme-updater | Document wiki content location or editing process |

Only include skills that actually apply to this request.

## Agents and parallel work

- **Suggested order**: Step 1 (wiki content + data shape) → Step 2 (wiki routes + components) → Step 3 (Help section integration + nav) → Step 4 (i18n + tests).
- **Agent types**:
  - **Step 1**: `docs-writer` — Define wiki content format and add initial articles (e.g. markdown in repo or JSON index).
  - **Steps 2–3**: `refactor-expert` — New routes, wiki viewer, and changes to `/guide` (UserGuide) to add wiki entry.
  - **Step 4**: `i18n-specialist` (i18n keys and en/de translations) + `test-engineer` (tests).

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/App.tsx` | Modify | Add route(s) for wiki (e.g. `/guide/wiki`, `/guide/wiki/:slug`) |
| `frontend/src/config/navConfig.ts` | Modify | No change required if wiki is under `/guide`; optional extra nav item TBD |
| `frontend/src/components/UserGuide.tsx` | Modify | Add entry point to wiki (link or section "Wiki" / "More help") |
| `frontend/src/components/UserGuide.css` | Modify | Style wiki link/section if needed |
| New: `frontend/src/components/Wiki.tsx` (or `WikiIndex.tsx`, `WikiArticle.tsx`) | Create | Wiki index and article viewer |
| New: `frontend/src/components/Wiki.css` | Create | Styles for wiki layout and content |
| New: `frontend/public/wiki/*.md` or `frontend/src/content/wiki/*` | Create | Wiki content (markdown or structured data); exact path TBD in Step 1 |
| `frontend/src/i18n/locales/en.json` | Modify | Add keys for "Wiki", "More help", wiki index labels |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys, German translations |
| `frontend/src/components/__tests__/UserGuide.test.tsx` | Modify | Assert wiki entry point present on Help page |
| New: `frontend/src/components/__tests__/Wiki.test.tsx` (optional) | Create | Basic wiki route and index/article render tests |

## Implementation steps

### Step 1: Wiki content format and initial content

- **Decide format**: Prefer static markdown in repo (e.g. `frontend/public/wiki/*.md` or `frontend/src/content/wiki/*.md`) so no backend is required. Alternative: JSON index + markdown body or MDX if the stack supports it.
- **Define index**: Create a wiki index (e.g. `wiki/index.json` or derive from file names) with: `slug`, `title`, optional `i18nKey`, and path to content. Keep it simple so the app can list "Articles" or "Topics" on a wiki index page.
- **Add 1–2 initial articles**: e.g. "Getting started" and "FAQs" or "Standings explained", so the wiki is visibly useful. Store in the chosen path; ensure they are loadable at build or runtime (Vite can import raw text or use `fetch` for `public/`).

### Step 2: Wiki routes and components

- **Routes**: In `App.tsx`, add:
  - `/guide/wiki` — wiki index (list of articles).
  - `/guide/wiki/:slug` — single article page (load markdown or content by slug).
- **Components**:
  - Wiki index: list links to `/guide/wiki/:slug` for each article; use titles from index or i18n.
  - Wiki article: fetch or import markdown for the slug; render with a simple markdown renderer (e.g. `react-markdown` if already a dependency, or a minimal custom renderer). Use existing layout (e.g. same as UserGuide) so it feels part of Help.
- **Styling**: Add `Wiki.css` for index list and article typography; align with existing guide styles where possible.

### Step 3: Help section integration

- **UserGuide.tsx**: Add a clear entry point to the wiki:
  - Option A: A section at the top or bottom of the User Guide with a link "Browse the Wiki" or "More help (Wiki)" linking to `/guide/wiki`.
  - Option B: A persistent link in the guide layout (e.g. sidebar or banner) that goes to `/guide/wiki`.
- Ensure the Help page (`/guide`) remains the main landing for "Help"; wiki is one step away. Breadcrumb or back link from wiki back to `/guide` is recommended.
- **Admin**: No admin UI for editing wiki in this issue; editing = changing files in repo. Document in README or CLAUDE.md where wiki content lives and how to add articles.

### Step 4: i18n and tests

- **i18n**: Add keys such as `nav.wiki`, `userGuide.wikiLink`, `wiki.title`, `wiki.indexTitle`, `wiki.backToGuide` in `en.json` and `de.json`. Use them in UserGuide (wiki link) and Wiki components (titles, back link).
- **Tests**:
  - UserGuide: Assert that the wiki link or "Wiki" section is present and points to `/guide/wiki` (or equivalent).
  - Optionally add `Wiki.test.tsx`: render wiki index with mock index data; render article with mock slug/content; ensure back-to-guide link works.
- Run existing tests and fix regressions.

## Dependencies and order

- Step 1 (content format + initial articles) should be done first so Step 2 has real content to render.
- Step 2 (routes + components) depends on Step 1; Step 3 (Help integration) depends on Step 2.
- Step 4 can be done in parallel for i18n once keys are known; tests after components are stable.

**Suggested order**: Step 1 → Step 2 → Step 3 → Step 4.

## Testing and verification

- **Manual**: Open Help (`/guide`); confirm wiki entry is visible and links to wiki index. Open `/guide/wiki` and see at least one article; open `/guide/wiki/:slug` and see rendered content; use "Back to guide" to return to `/guide`. Switch locale and confirm wiki labels translate.
- **Existing tests**: UserGuide tests may need updates for new link/section; no regression on existing guide content.
- **New tests**: Wiki link on Help page; optional wiki index and article render.

## Risks and edge cases

- **Markdown dependency**: If adding `react-markdown`, run dependency-auditor and note in plan; otherwise use a minimal safe renderer to avoid XSS (no raw `dangerouslySetInnerHTML` with user content).
- **Routing**: Hash routing or SPA redirects—ensure `/guide/wiki` and `/guide/wiki/:slug` work with React Router and that direct navigation to a slug works after refresh.
- **Content location**: If wiki lives in `public/`, consider cache headers or versioning for future edits; if in `src/`, content changes require rebuild. Document the choice.
- **Admin help**: This issue is user Help only; admin guide (`/admin/guide`) can later link to the same wiki or a subset if desired.
