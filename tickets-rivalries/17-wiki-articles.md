# [RIV-17] Wiki articles (English + German)

**Phase:** 5 — Polish
**Estimate:** S
**Blocked by:** none (write any time after the feature scope is firm)
**Blocks:** none
**Reference:** [plan-rivalries.md § Phase 5, step 28](../plan-rivalries.md); CLAUDE.md "Help and Wiki" section

## Goal
Two static wiki articles — one user-facing, one GM-facing — covering how to use the rivalry feature.

## Scope
**In:** 4 markdown files (en + de × user + admin), 2 entries in `index.json`, 2 i18n title keys.
**Out:** Any in-app onboarding or tour.

## Subtasks
- [ ] Write `frontend/public/wiki/rivalries.md` (English, user-facing). Cover:
  - What is a rivalry vs a challenge — when to use which.
  - How to request a rivalry (link to the request form).
  - What "Heat Level" means and how to choose one.
  - How GM messages work — default audience, "Loop in Opponent" toggle, how messages stay private.
  - What happens after a request is submitted (GM review, approval, status meaning).
  - How matches and promos get tagged to a rivalry.
- [ ] Write `frontend/public/wiki/admin-rivalries.md` (English, GM-facing). Cover:
  - How to triage pending requests (criteria for approval / rejection).
  - How to write storyline notes vs GM plans, and the visibility model.
  - How to schedule matches against a rivalry from the Future Matches tab.
  - When to conclude a rivalry vs leave it active.
  - Bulk-clear and cleanup workflow.
- [ ] Translate both articles to German under `frontend/public/wiki/de/rivalries.md` and `frontend/public/wiki/de/admin-rivalries.md`. Keep section structure 1:1.
- [ ] Append two entries to `frontend/public/wiki/index.json`:
  - `{ "slug": "rivalries", "titleKey": "wiki.articles.rivalries", "file": "rivalries.md" }`
  - `{ "slug": "admin-rivalries", "titleKey": "wiki.articles.adminRivalries", "file": "admin-rivalries.md", "adminOnly": true }`
- [ ] Add `wiki.articles.rivalries` and `wiki.articles.adminRivalries` keys to both `en.json` and `de.json`.
- [ ] Verify the articles render correctly in `/guide/wiki/rivalries` and `/guide/wiki/admin-rivalries` in both languages.
- [ ] Verify the "Edit this page" link resolves to the correct GitHub URL (env vars `VITE_GITHUB_REPO` and optional `VITE_GITHUB_BRANCH` per CLAUDE.md).

## Files Touched
- `frontend/public/wiki/rivalries.md` (create)
- `frontend/public/wiki/admin-rivalries.md` (create)
- `frontend/public/wiki/de/rivalries.md` (create)
- `frontend/public/wiki/de/admin-rivalries.md` (create)
- `frontend/public/wiki/index.json` (modify)
- `frontend/src/i18n/locales/en.json` (modify — wiki title keys)
- `frontend/src/i18n/locales/de.json` (modify — wiki title keys)

## Acceptance Criteria
- Both articles render without any markdown rendering glitches in both locales.
- The German fallback works: deleting `de/rivalries.md` temporarily falls back to the English version (per CLAUDE.md wiki spec).
- Admin article shows up only when an admin is logged in (the `adminOnly: true` flag in `index.json` is respected).

## Notes / Risks
- Don't drift the article copy from the actual UI labels — if RIV-16 changes terminology, update the wiki too.
- The GM-facing article must explicitly cover the visibility model for plans (`gm-only` default) so GMs don't accidentally publish spoilers.
