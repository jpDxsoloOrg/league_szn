# Plan: In-app wiki editing (future)

**Status:** Future / not yet scoped as a GitHub issue.

## Context

Today, wiki content is static markdown in `frontend/public/wiki/*.md`. Editing is done by changing files in the repo and deploying, or (for admins) via the "Edit this page" link that opens GitHub. Users asked whether wiki pages can be edited **without going to GitHub**—i.e. an in-app editor.

In-app editing is a **larger change** because it requires:

- **Persistence**: Something must store the edited markdown. Options include:
  - **Backend API + storage**: New Lambda endpoints (e.g. GET/PUT wiki article by slug) and a store (e.g. S3 object per file, or DynamoDB table for wiki content). Frontend would POST/PUT markdown; backend writes to S3 or DB.
  - **CMS / headless CMS**: Store wiki in a third-party CMS and pull content via API. Bigger architectural shift.
  - **Git-backed**: Backend that commits to the repo via GitHub API (or git over HTTP). Requires tokens and write access to the repo.
- **Auth**: Only admins (or a dedicated “wiki editor” role) should be able to edit. Reuse existing Cognito + `hasRole('Admin')` (or Moderator if desired).
- **UI**: In-app editor (e.g. textarea or rich markdown editor) and save/cancel. Could be a dedicated “Edit” mode on the article page or a separate admin “Manage wiki” screen.
- **Index**: If new articles can be created in-app, the wiki index (`index.json` or equivalent) must be updated too (new slug, titleKey, i18n). So either the backend maintains index + articles, or the UI only allows editing existing articles.

## Suggested scope (when implementing)

1. **Phase 1 – Edit existing articles only**
   - Backend: e.g. Lambda `GET /wiki/:slug` (raw markdown) and `PUT /wiki/:slug` (admin-only, body = markdown). Store in S3 (e.g. `wiki/{slug}.md`) or DynamoDB.
   - Frontend: “Edit” button (admin-only) opens an editor (textarea or simple markdown editor); Save calls PUT, then refetch and exit edit mode.
   - **Caveat**: Initial content today lives in `frontend/public/wiki/`. You’d need a one-time sync (public files → S3 or DB) or switch to loading from API instead of static files.

2. **Phase 2 – Create/delete articles and index**
   - Backend: endpoints to list articles, create (new slug), delete. Index derived from backend or stored as a special document.
   - Frontend: admin “Manage wiki” page to add/remove articles and edit index order/titles.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| Backend design | — | API, storage (S3/DynamoDB), auth |
| After implementation | code-reviewer | Review API and editor UI |
| Before commit | git-commit-helper | Conventional commits |
| If README/setup changes | readme-updater | Document new env or permissions |

## Files likely to change (Phase 1)

| Area | File / resource | Purpose |
|------|------------------|---------|
| Backend | New `functions/wiki/` or `functions/content/` | GET/PUT article by slug; admin auth |
| Backend | `serverless.yml` | Routes, IAM for S3 or DynamoDB |
| Storage | S3 bucket or DynamoDB table | Wiki markdown (and maybe index) |
| Frontend | `WikiArticle.tsx` | Load from API when available; “Edit” button → editor |
| Frontend | New `WikiEditor.tsx` (or inline) | Textarea + Save/Cancel; call PUT |
| Frontend | `api.ts` | `getWikiArticle(slug)`, `updateWikiArticle(slug, markdown)` |

## Dependencies and order

- Backend storage and API first.
- Then frontend: switch article fetch to API (with fallback to static if no API?), then add edit UI for admins.
- Optional: migrate existing `public/wiki/*.md` into the new store.

## Risks and edge cases

- **Migration**: Existing content in repo vs new store. Need a clear story (e.g. “after migration, all wiki is in S3” and build no longer ships `public/wiki/`).
- **Conflicts**: Two admins editing same article; no merge. Simple “last write wins” or lock message.
- **Size limits**: Lambda payload and S3 object size for very long articles.

## Next step

When ready to implement: create a **GitHub issue** (e.g. “Wiki: in-app editing for admins”) with acceptance criteria, then reference this plan in the issue and in `docs/plans/wiki-roadmap.md`.
