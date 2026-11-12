# Patch Notes

Static release notes served at `/patch-notes` (latest release) and `/patch-notes/vX.Y.Z` (one release). Like the wiki, there is no admin UI: edit these files and redeploy.

## Files

- `index.json`: `{ "releases": [...], "next": { "file": "next-features.md" } }`. Releases are listed newest first. Each one has:
  - `version`: `MAJOR.MINOR.PATCH`, no leading `v`
  - `date`: `YYYY-MM-DD`
  - `title` and `summary`: English. These are also the fallback for German.
  - `titleDe` and `summaryDe` (optional): German
  - `file`: the markdown post, e.g. `v1.2.0.md`
- `vX.Y.Z.md`: the English post. Use `##` for its sections. The page supplies the version, date and title, so the post starts with its intro paragraph.
- `next-features.md`: the "Coming Next" section.
- `de/`: German copies with the same file names. A missing German file falls back to English.

## Version numbers

The site was 1.0 before patch notes existed. The first post is 1.1.0.

- **Feature release**: bump MINOR and reset PATCH (`1.1.0` -> `1.2.0`).
- **Fixes-only release**: bump PATCH (`1.2.0` -> `1.2.1`).
- MAJOR changes only for a ground-up overhaul of the site.

`nextVersion(latest, 'minor' | 'patch')` in `frontend/src/components/patchNotes/versions.ts` computes it.

## Publishing the next release

1. Write `vX.Y.Z.md` here and `de/vX.Y.Z.md` in German.
2. End each section with a `**Read more:**` line that links to the wiki articles explaining that feature, e.g. `[Call-Ups: Young Boys to the Main Roster](/guide/wiki/call-ups)`. Use the same paths in the German post, with the German article titles from `wiki.articles.*` in `de.json`. Only link to articles that exist, and never to staff-only (`adminOnly`) articles: patch notes are public.
3. Add the entry to the **top** of `releases` in `index.json`, with `title`, `summary`, `titleDe` and `summaryDe`.
4. Set `version` in `frontend/package.json` (and the two matching lines at the top of `package-lock.json`) to the new version.
5. Update `next-features.md` and `de/next-features.md`: remove what just shipped and add what's next. Don't link to wiki articles that don't exist yet.
6. Run `npx vitest run src/components/patchNotes` in `frontend/`.

## Copy rules

- Never mention sprints, dates, deadlines or timeframes in the posts or in Coming Next.
- Write for players: what changed for them, in plain words. In German, use the informal "du" and keep established product names in English (Call-Ups, Young Boys, division names), matching `de.json`.

## What the tests check

`frontend/src/components/patchNotes/__tests__/patchNotesContent.test.ts` fails the build when:

- a version is not valid `MAJOR.MINOR.PATCH`, or is repeated
- releases are not strictly newest first by version, or dates go up down the list
- a `file` doesn't exist
- `frontend/package.json` `version` is not the latest release
- a `/guide/wiki/<slug>` link in any post points to an article that isn't in `public/wiki/index.json`, or to a staff-only one
