# Plan: Add wiki sections for all the new features

**GitHub issue:** #201 — [Add to the wiki sections for all the new features](https://github.com/jpDxsoloOrg/league_szn/issues/201)

## Context

The app has added Dashboard, Activity feed, and Statistics (leaderboards, records, rivalries, tale of the tape, achievements, best matches). The Help wiki has no articles for these features. This plan adds one wiki article per feature and registers them in the wiki index and i18n so users can find guidance from Help.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review new markdown and index/i18n changes |
| Before commit | git-commit-helper | Conventional commit message |
| If README or wiki process changes | readme-updater | Document how to add wiki articles |

## Agents and parallel work

- **Suggested order**: Step 1 (Dashboard + Activity + Statistics articles) can be done in parallel; Step 2 (index + i18n) depends on Step 1.
- **Agent types**: Step 1 — `docs-writer` or `general-purpose` (author markdown). Step 2 — `general-purpose` (edit JSON/JSON i18n).

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/public/wiki/dashboard.md` | Create | Dashboard / league overview article |
| `frontend/public/wiki/activity.md` | Create | Activity feed article |
| `frontend/public/wiki/statistics.md` | Create | Statistics section article (leaderboards, records, rivalries, tale of tape, achievements, best matches) |
| `frontend/public/wiki/de/dashboard.md` | Create | German translation for dashboard (optional but recommended) |
| `frontend/public/wiki/de/activity.md` | Create | German translation for activity (optional but recommended) |
| `frontend/public/wiki/de/statistics.md` | Create | German translation for statistics (optional but recommended) |
| `frontend/public/wiki/index.json` | Modify | Add entries for dashboard, activity, statistics (slug, titleKey, file) |
| `frontend/src/i18n/locales/en.json` | Modify | Add wiki.articles.dashboard, wiki.articles.activity, wiki.articles.statistics |
| `frontend/src/i18n/locales/de.json` | Modify | Same keys with German titles |

## Implementation steps

### Step 1: Create wiki articles (EN)

1. **dashboard.md**  
   - Path: `frontend/public/wiki/dashboard.md`.  
   - Content: Explain the League Dashboard (home page): Current Champions strip, Upcoming Events, Recent Results, Season Progress, Quick Stats (e.g. most wins, longest streak, newest champion), Active Challenges link. Mention navigation to Standings, Events, Championships, etc. Match tone and structure of existing articles (e.g. `standings.md`, `events.md`).

2. **activity.md**  
   - Path: `frontend/public/wiki/activity.md`.  
   - Content: Explain the Activity feed: what it shows (match results, championship changes, season events, tournament results, challenges, promos), how items are ordered (e.g. by time), and how to use the type filter. Reference related pages (Events, Championships, Standings) where relevant.

3. **statistics.md**  
   - Path: `frontend/public/wiki/statistics.md`.  
   - Content: Describe the Statistics section and its sub-pages: Leaderboards, Records, Rivalries, Tale of the Tape, Achievements, Best Matches. For each, briefly state what the page shows and how users can use it (e.g. compare two wrestlers in Tale of the Tape, view head-to-head in Rivalries). One article covering all stats sub-pages is sufficient; use headings for each area.

### Step 2: Register articles in index and i18n

4. **index.json**  
   - In `frontend/public/wiki/index.json`, add three entries after the existing public articles (e.g. after `tips`), in order: dashboard, activity, statistics.  
   - Each entry: `{ "slug": "dashboard", "titleKey": "wiki.articles.dashboard", "file": "dashboard.md" }`, and similarly for `activity` and `statistics`. Do not set `adminOnly` (these are public).

5. **en.json**  
   - In `frontend/src/i18n/locales/en.json`, under `wiki.articles`, add:  
     - `"dashboard": "Dashboard"`  
     - `"activity": "Activity"`  
     - `"statistics": "Statistics"`  
   - Place them in a logical order (e.g. after `standings` or after `tips` so they appear near related nav).

6. **de.json**  
   - In `frontend/src/i18n/locales/de.json`, under `wiki.articles`, add the same keys with German titles, e.g.:  
     - `"dashboard": "Dashboard"` (or "Übersicht" if preferred)  
     - `"activity": "Aktivität"`  
     - `"statistics": "Statistiken"`

### Step 3: German wiki content (optional)

7. **de/dashboard.md**, **de/activity.md**, **de/statistics.md**  
   - Add German versions under `frontend/public/wiki/de/` with the same structure as the English files. If time is limited, this step can be deferred (the app falls back to EN when DE is missing).

## Dependencies and order

- Step 1 (all three articles) can be done in parallel.
- Step 2 depends on knowing the slugs and titleKeys (index + i18n); can be done right after or in parallel with Step 1 if keys are agreed.
- Step 3 depends on Step 1 (translate existing EN content).

**Suggested order**: Steps 1a+1b+1c (three articles) → Step 2 (index + en + de i18n) → Step 3 (DE markdown, optional).

## Testing and verification

- Open `/guide/wiki` and confirm three new articles appear in the index with correct titles (EN and DE).
- Open `/guide/wiki/dashboard`, `/guide/wiki/activity`, `/guide/wiki/statistics` and confirm content renders and "Edit this page" (if configured) points to the correct file.
- Switch language to German and confirm titles and, if Step 3 was done, German article body.
- No new automated tests required unless the project already tests wiki index contents.

## Risks and edge cases

- **Index order**: New entries affect article order on the wiki index page; place them so the Help experience stays coherent (e.g. Dashboard near top or after Getting started).
- **Fallback**: If German markdown is omitted, the app shows the English article with the "showing English fallback" message; acceptable per existing wiki behavior.
