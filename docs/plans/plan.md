# Plan: Migrate User Guide to Wiki and remove standalone User Guide

**GitHub issue:** [#148](https://github.com/jpDxsolo/league_szn/issues/148) — Migrate User Guide to Wiki and remove standalone User Guide

## Context

The User Guide is currently a standalone React page at `/guide` with all content in i18n and conditional sections (e.g. profile/challenges/promos only when authenticated or feature-flagged). The wiki already exists at `/guide/wiki` with markdown articles. This plan moves all User Guide content into wiki articles (preserving and optionally improving the content), then removes the User Guide component and route so Help is a single wiki-based experience.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review wiki articles, routing, and removed references |
| Before commit | git-commit-helper | Conventional commit message |
| If README or CLAUDE.md change | readme-updater | Keep docs in sync with Help/wiki structure |
| When updating tests | test-generator | Adjust or add tests for wiki as Help entry |

Only include skills that actually apply to this request.

## Agents and parallel work

- **Suggested order**: Step 1 (wiki content + index + i18n) → Step 2 (routing + remove User Guide + nav/breadcrumbs) → Step 3 (tests + cleanup).
- **Agent types**: `general-purpose` for Steps 1–2; `general-purpose` or `test-engineer` for Step 3.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/public/wiki/index.json` | Modify | Add entries for new wiki articles (slug, titleKey, file) |
| `frontend/public/wiki/*.md` | Create | New markdown articles for each User Guide section (see steps) |
| `frontend/src/i18n/locales/en.json` | Modify | Add `wiki.articles.*` keys for new articles; remove or keep `userGuide.*` only if still needed (e.g. nav) |
| `frontend/src/i18n/locales/de.json` | Modify | Same as en.json for new wiki title keys |
| `frontend/src/App.tsx` | Modify | Remove `/guide` route that renders UserGuide; add redirect `/guide` → `/guide/wiki` (or make `/guide` render wiki index) |
| `frontend/src/components/UserGuide.tsx` | Delete | No longer used |
| `frontend/src/components/UserGuide.css` | Delete | No longer used |
| `frontend/src/components/Wiki.tsx` | Modify | "Back to guide" link: point to `/guide/wiki` (index) or remove if redundant |
| `frontend/src/components/WikiBreadcrumbs.tsx` | Modify | Ensure "Help" / breadcrumb for `/guide` context points to wiki index; no broken "Back to User Guide" |
| `frontend/src/config/navConfig.ts` | Modify | Ensure Help path is `/guide` (redirect) or `/guide/wiki` as desired |
| `frontend/src/components/TopBar.tsx` | Modify | If Help link is changed, update to match (e.g. `/guide` or `/guide/wiki`) |
| `frontend/src/components/__tests__/UserGuide.test.tsx` | Delete | Component removed |
| `frontend/src/components/__tests__/App.test.tsx` | Modify | Remove UserGuide mock; assert `/guide` redirects or renders wiki |
| `frontend/src/components/__tests__/Wiki.test.tsx` | Modify | Update expectations for back link / breadcrumb if they pointed to `/guide` |
| `e2e/take-screenshots.ts` | Modify | If `/guide` is now wiki, update route name or path if needed |
| `e2e/config/selectors.ts` | Modify | Only if guide selector or href changes |
| `CLAUDE.md` | Modify | Update Help and Wiki section: Help is wiki at `/guide` (redirect to wiki) or `/guide/wiki`; remove User Guide reference |
| `README.md` | Modify | If it mentions "User Guide" at `/guide`, update to "Help (Wiki)" or similar |
| `frontend/public/wiki/getting-started.md` | Modify | Update "Use Help to open the User Guide" → "Use Help to browse the Wiki" (or similar) |
| `frontend/public/wiki/faqs.md` | Modify | Update "The User Guide (Help menu)" → "The Wiki (Help menu)" if present |

## Implementation steps

### Step 1: Add wiki articles from User Guide content

- **Source**: All content currently in `UserGuide.tsx` and i18n keys `userGuide.*` in `en.json` / `de.json` (sections: standings, seasons, divisions, championships, events, tournaments, contenders, profile, challenges, promos, fantasy, tips).
- **Approach**: Create one markdown file per major section (or group a few into single articles). Suggested articles:
  - `standings.md` — Standings page, columns, how rankings work, formula.
  - `seasons.md` — What seasons are, all-time vs season standings, season end.
  - `divisions.md` — What divisions are, viewing player divisions.
  - `championships.md` — Viewing championships, viewing history (steps).
  - `events.md` — Events & PPV, browsing by type, event details.
  - `tournaments.md` — Tournament types (single elimination, round robin), tournament information.
  - `contenders.md` — What contender rankings are, reading rankings (rank, score, win %, streak).
  - `profile.md` — My Profile (what you can see); note "for logged-in wrestlers."
  - `challenges.md` — Challenge board, issuing, responding, statuses; note "for wrestlers" / when feature is on.
  - `promos.md` — Promo feed, creating, types, reactions, call-outs and challenges.
  - `fantasy.md` — How fantasy works, features (picks, leaderboard, costs, results); note "when Fantasy is enabled."
  - `tips.md` — Tips for following the league (same six tips as current guide).
- **Punch-up**: When converting i18n strings to markdown, improve clarity or add a sentence where it helps; keep all existing information. Optionally add a short "How to use this site" or "Help overview" article that links to these.
- **i18n**: Add `wiki.articles.standings`, `wiki.articles.seasons`, … in `en.json` and `de.json` (use same text as current `userGuide.toc.*` or section titles where appropriate).
- **index.json**: Append one entry per new file: `{ "slug": "standings", "titleKey": "wiki.articles.standings", "file": "standings.md" }`, etc. Order can match the current guide (e.g. public content first, then authenticated, then tips).

### Step 2: Route Help to wiki and remove User Guide

- **Routing** (e.g. in `App.tsx`):
  - Remove the route that renders `<UserGuide />` at `/guide`.
  - Add a redirect from `/guide` to `/guide/wiki` (e.g. `<Route path="/guide" element={<Navigate to="/guide/wiki" replace />} />`) so "Help" in the nav can stay as `/guide` and bookmarks work.
  - Keep existing `/guide/wiki` and `/guide/wiki/:slug` routes unchanged.
- **Component removal**: Delete `frontend/src/components/UserGuide.tsx` and `frontend/src/components/UserGuide.css`. Remove any import of `UserGuide` from `App.tsx`.
- **Wiki layout**: In `Wiki.tsx`, the "Back to guide" (or similar) link currently goes to `/guide`. After the change, `/guide` redirects to `/guide/wiki`, so the link can remain `to="/guide"` (user lands on wiki index) or be set to `to="/guide/wiki"` for clarity. In `WikiBreadcrumbs.tsx`, ensure the first-level "Help" link points to `/guide` or `/guide/wiki` and that no copy says "Back to User Guide" if that page no longer exists; use "Help" or "Wiki" as appropriate.
- **Nav**: In `navConfig.ts` and `TopBar.tsx`, keep Help path as `/guide` (so redirect applies) or change to `/guide/wiki` if preferred; ensure one consistent choice.
- **CLAUDE.md**: In the "Help and Wiki" section, state that Help is the wiki at `/guide/wiki`, with `/guide` redirecting there; remove the sentence that says "Help is the User Guide at `/guide` (UserGuide.tsx)."
- **README.md**: If it mentions "User Guide" at `/guide`, update to "Help (Wiki)" or equivalent.
- **Wiki content**: In `getting-started.md` and `faqs.md`, replace references to "User Guide" with "Wiki" or "Help" so copy stays accurate.

### Step 3: Tests and cleanup

- **Remove** `frontend/src/components/__tests__/UserGuide.test.tsx` (component no longer exists).
- **App.test.tsx**: Remove mock for `UserGuide`; ensure test that visits `/guide` expects redirect to `/guide/wiki` or that the page content is wiki (index or article).
- **Wiki.test.tsx**: If tests assert "back to guide" link href or text, update so they expect `/guide` or `/guide/wiki` and no "User Guide" wording.
- **E2E**: In `e2e/take-screenshots.ts`, if there is a step for `/guide`, confirm it still works (redirect or wiki); update `e2e/config/selectors.ts` only if the Help link href or selector changes.
- **i18n cleanup**: Once no component uses `userGuide.*`, remove the `userGuide` block from `en.json` and `de.json` (or leave a minimal set if something still references it, e.g. a nav tooltip). Ensure all new `wiki.articles.*` keys are present in both locales.

## Dependencies and order

- Step 1 must be done first so the wiki has all content before we remove the User Guide.
- Step 2 depends on Step 1 (wiki index and articles in place).
- Step 3 depends on Step 2.

**Suggested order**: Step 1 → Step 2 → Step 3.

## Testing and verification

- **Manual**: Click "Help" in nav; confirm redirect to `/guide/wiki` and wiki index loads. Open each new article (standings, seasons, …) and confirm content matches or improves on the old User Guide. Check breadcrumbs and "Back" link. Switch locale and confirm wiki article titles translate. Ensure Getting Started and FAQs no longer say "User Guide."
- **Existing tests**: Remove UserGuide tests; update App and Wiki tests as above.
- **New tests**: Optionally add a smoke test that `/guide` redirects to `/guide/wiki` and that wiki index lists the new articles (e.g. by slug or titleKey).

## Risks and edge cases

- **Deep links**: Old links to `/guide` will redirect to `/guide/wiki`; links to `/guide#standings` may land on wiki index without hash (acceptable; user can click Standings in wiki).
- **Conditional content**: Profile, Challenges, Promos, Fantasy are "for wrestlers" or feature-gated. Wiki articles are visible to everyone; state in the article intro that the feature is for logged-in wrestlers or when the feature is enabled, so no conditional rendering is needed in the wiki.
- **Admin help**: Unchanged; admin guide remains at `/admin/guide` and is out of scope.
