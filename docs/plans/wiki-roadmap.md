# Wiki feature roadmap

The site wiki lives at `/guide/wiki` (index) and `/guide/wiki/:slug` (articles). Content is static markdown in `frontend/public/wiki/`. This doc lists planned enhancements, each tracked in a **separate GitHub issue** so we can ship one feature at a time.

## Current (from #128)

- Wiki index and article viewer
- Markdown rendering (react-markdown)
- "Browse the Wiki" from Help; "Back to guide" on wiki pages
- i18n (en/de) for wiki UI and article titles

## Planned features (one issue each)

| Issue | Feature | Summary | Suggested package |
|-------|--------|---------|--------------------|
| [#132](https://github.com/jpDxsoloOrg/league_szn/issues/132) | **Syntax highlighting** | Code blocks in wiki articles use syntax highlighting (e.g. Prism/Highlight.js style). | `react-syntax-highlighter` (works with react-markdown `components`) |
| [#133](https://github.com/jpDxsoloOrg/league_szn/issues/133) | **Client-side search** | Search box on wiki index (and optionally in layout) to fuzzy-search article titles; optional search in content. | `fuse.js` (lightweight, fuzzy) |
| [#134](https://github.com/jpDxsoloOrg/league_szn/issues/134) | **In-article table of contents** | Long articles show a sticky TOC (sidebar or top) built from H2/H3 headings. | None (parse headings from markdown or DOM) |
| [#135](https://github.com/jpDxsoloOrg/league_szn/issues/135) | **Breadcrumbs** | Show "Help > Wiki > Article title" (or "Guide > Wiki > …") on wiki pages. | None |
| [#136](https://github.com/jpDxsoloOrg/league_szn/issues/136) | **"Edit this page" link** | Link to edit the markdown file in GitHub (or configurable repo) so contributors can suggest edits. | None (config + URL template) |
| [#137](https://github.com/jpDxsoloOrg/league_szn/issues/137) | **Previous / Next article** | At bottom of each article, links to previous and next article by index order. | None |
| [#138](https://github.com/jpDxsoloOrg/league_szn/issues/138) | **Sidebar with article list** | On article view, show wiki index in a sidebar (collapsible on mobile) for quick jump to another article. | None |
| [#139](https://github.com/jpDxsoloOrg/league_szn/issues/139) | **Print-friendly styles** | Print CSS (or "Print" button) so wiki pages print cleanly. | None |

## Future: in-app wiki editing

Editing wiki content **without going to GitHub** (in-app editor for admins) is a larger change: it requires a backend to store markdown (e.g. S3 or DynamoDB), API (GET/PUT article), and an edit UI. See **[plan-wiki-in-app-editing.md](./plan-wiki-in-app-editing.md)** for scope, options, and suggested phases. Until then, only admins see the "Edit this page" link (GitHub).

## Adding new wiki articles

- Add a `.md` file under `frontend/public/wiki/`.
- Add an entry to `frontend/public/wiki/index.json` with `slug`, `titleKey`, and `file`.
- Add the `titleKey` to `frontend/src/i18n/locales/en.json` and `de.json` under `wiki.articles.*`.

## References

- Plan: [plan-issue-128-wiki-help.md](./plan-issue-128-wiki-help.md)
- GitHub issue #128: Add site wiki and surface it in the Help section
