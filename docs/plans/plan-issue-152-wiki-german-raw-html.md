# Plan: Admin wiki shows raw HTML when language is German

**GitHub issue:** [#152](https://github.com/jpDxsoloOrg/league_szn/issues/152) — [Admin wiki shows raw HTML (index.html) when language is German](https://github.com/jpDxsoloOrg/league_szn/issues/152)

## Context

When the app language is German and the user opens an admin wiki article, the server can return the SPA’s `index.html` (e.g. due to 404 fallback). The wiki code treats that response as article content and displays it as raw HTML text. We need to detect HTML responses, treat them as invalid, and either fall back to English content or show a clear message.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review WikiArticle and fetch logic |
| Before commit | git-commit-helper | Conventional commit message |
| If behavior changes | test-generator | Tests for HTML detection and fallback |

## Agents and parallel work

- **Suggested order**: Step 1 (detect HTML + fallback in WikiArticle) → Step 2 (optional: CloudFront/docs).
- **Agent types**: General-purpose for frontend changes; optional DevOps/docs for deploy verification.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/components/WikiArticle.tsx` | Modify | Detect HTML in fetched content; on HTML, treat as failed and use English fallback or show message |
| `frontend/src/i18n/locales/en.json` | Modify | Add key for “article not available in German, showing English” (if we show a notice) |
| `frontend/src/i18n/locales/de.json` | Modify | Same key in German |
| `CLAUDE.md` or deploy docs | Modify (optional) | Note that `/wiki/*` must serve static .md files, not index.html |
| `frontend/src/components/__tests__/Wiki.test.tsx` or new test file | Modify / Create | Test that HTML response is not used as content and fallback/error is shown |

## Implementation steps

### Step 1: Detect HTML and fix fallback in WikiArticle.tsx

1. **Location**: `frontend/src/components/WikiArticle.tsx`, in the `useEffect` that fetches wiki content (around the `fetch(contentPath)` and `.then((res) => ...)` chain).

2. **Add an HTML detector**: After getting `text` from `res.text()`, check if the content looks like HTML before calling `setContent(text)`. For example: if the trimmed string starts with `<!doctype` or `<!DOCTYPE` or (after trimming) `<html`, treat it as an invalid response.

3. **When HTML is detected**:
   - If the current request was for **German** (`locale === 'de'`), do **not** set this HTML as content. Instead, fetch the English path explicitly: `/wiki/${slug}.md` (same as existing fallback), and only set content if that response is **not** HTML (and is ok). If the English fetch also returns HTML (e.g. production SPA fallback), set an error state and do not render the HTML (e.g. show “Article not found” or “Content not available”).
   - If the current request was already for **English** and we get HTML, set error state (e.g. “Article not found” or “Content not available”) and do not set content.

4. **Optional UX**: When we show English content because German was requested but missing or invalid, set a small notice (e.g. “This article is not yet available in German; showing English.”) and add i18n keys in `en.json` and `de.json` for that message. Only show the notice when `locale === 'de'` and the displayed content came from the English path.

5. **Refactor fallback**: Ensure the existing 404 fallback for German (fetch `/wiki/${slug}.md`) also runs the same “is this HTML?” check on the fallback response before calling `setContent`. So: after any `fetch(...).then(res => res.text())`, run the HTML check; if HTML, treat as failure (retry English once if we haven’t, or set error).

### Step 2: (Optional) Verify production static serving

- Confirm that in production (S3 + CloudFront), requests to `/wiki/*.md` and `/wiki/de/*.md` return the actual markdown files, not `index.html`. If the SPA fallback is applied to these paths, adjust CloudFront error pages or behavior so that `/wiki/` paths serve static assets. Document in CLAUDE.md or deploy docs that wiki markdown must be served as static files.

## Dependencies and order

- Step 1 is required and self-contained.
- Step 2 is optional and can follow Step 1.

**Suggested order**: Step 1 → Step 2 (optional).

## Testing and verification

- **Manual**: Set app language to German, open Admin wiki (or any admin-only article). You should see either the English article content (with optional “not available in German” notice) or a clear error—never raw HTML.
- **Unit test**: Mock `fetch` to return a response with body `<!doctype html><html>...` for `/wiki/de/admin.md`. Assert that the component does not set that as content; assert that it either shows English content (from a second mocked fetch) or an error state. Consider **test-generator** for scaffolding.
- **Edge case**: English locale requesting `/wiki/admin.md` and getting HTML (e.g. broken deploy)—should show error, not raw HTML.

## Risks and edge cases

- **False positives**: Very unlikely that real markdown starts with `<!doctype` or `<html`; keep the check simple (e.g. trim and `startsWith`).
- **Production**: If CloudFront always serves index.html for unknown paths, the “fallback” fetch to `/wiki/admin.md` may still return HTML. The code fix (reject HTML and show error) still improves UX; for a full fix, production must serve wiki .md files correctly (Step 2).
- **Backward compatibility**: No API or schema changes; only frontend fetch and display logic.
