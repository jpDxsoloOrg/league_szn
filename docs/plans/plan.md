# Plan: Refresh admin help documentation

**GitHub issue:** [#123](https://github.com/jpDxsolo/league_szn/issues/123) — Refresh admin help documentation

## Context

The admin help guide (`AdminGuide.tsx`) is currently inline content with no table of contents and no documentation for **Challenges** or **Promos** admin flows. The Wrestler role still says "challenges (coming soon), promos (coming soon)." This plan adds a TOC, groups content into clear sections, documents Challenges and Promos admin (schedule from challenge/promo, delete, bulk clear), documents Schedule Match pre-fill from challenge/promo, and updates User Management copy.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review AdminGuide structure, TOC, and heading hierarchy |
| Before commit | git-commit-helper | Conventional commit message |
| When adding/updating tests | test-generator | Extend AdminGuide tests for TOC and new sections |

Only include skills that actually apply to this request.

## Agents and parallel work

- **Suggested order**: Step 1 (TOC + section IDs) → Step 2 (reorder + group sections + add Challenges/Promos + update User Management & Schedule Match) → Step 3 (tests).
- **Agent types**: `general-purpose` for Steps 1–2; `general-purpose` or `test-engineer` for Step 3.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/components/admin/AdminGuide.tsx` | Modify | Add TOC with anchor links; assign `id` to each major section; reorder/group sections (Quickstart, League setup, Match operations, Content & social, Contender config, Data management, Workflow); add Challenges and Promos sections; update User Management (remove "coming soon"); update Schedule Match (pre-fill from challenge/promo); update Typical Weekly Workflow to mention challenges/promos where relevant |
| `frontend/src/components/admin/AdminGuide.css` | Modify | Style TOC (e.g. sticky or compact list, links); optional section-group heading styles |
| `frontend/src/components/admin/__tests__/AdminGuide.test.tsx` | Modify | Assert TOC is present with correct links; assert new section headings (Challenges, Promos, Content & social); assert "coming soon" is removed; optional a11y for TOC nav |

## Implementation steps

### Step 1: Table of contents and section IDs

- In `AdminGuide.tsx`, add a **TOC block** after the intro paragraph and before the first content section.
- Define a stable list of section IDs used for anchors, e.g.:
  - `quickstart`, `league-setup`, `user-management`, `divisions`, `manage-players`, `seasons`, `championships`, `match-operations`, `events`, `schedule-match`, `record-results`, `tournaments`, `content-social`, `challenges`, `promos`, `contender-config`, `data-management`, `workflow`
- Use these as `id` on the wrapping `<section>` (e.g. `<section id="quickstart" className="admin-guide-section">`) or on the section heading so TOC links work (e.g. `<h4 id="quickstart">`). Ensure target elements are focusable for skip links if needed (`tabIndex={-1}`).
- TOC can be a `<nav aria-label="Table of contents">` with a list of anchor links (`<a href="#quickstart">Quickstart</a>`, etc.). Use consistent heading levels: e.g. `h4` for main sections, `h5` for subsections, so the TOC maps to the same hierarchy.
- Keep existing CSS classes (`admin-guide`, `admin-guide-section`, `guide-block`, etc.) on existing sections.

### Step 2: Section grouping, new content, and copy updates

- **Reorder and group** sections to match the issue:
  - **Quickstart** (unchanged concept; ensure step list is still accurate; add `id="quickstart"`).
  - **League setup** (group heading only if desired): User Management, Divisions, Manage Players, Seasons, Championships — each with its own `id` (e.g. `user-management`, `divisions`, `manage-players`, `seasons`, `championships`).
  - **Match operations**: Events, Schedule Match, Record Results, Tournaments — with IDs `events`, `schedule-match`, `record-results`, `tournaments`.
  - **Content & social**: New group containing **Challenges** and **Promos** (see below). Use IDs `content-social`, `challenges`, `promos`.
  - **Contender configuration** — keep as-is with `id="contender-config"`.
  - **Data management (Danger Zone)** — keep as-is with `id="data-management"`.
  - **Typical weekly workflow** — keep with `id="workflow"`; add a brief mention of reviewing/clearing challenges and promos where relevant (e.g. after recording results or in weekly cleanup).

- **Challenges section** (new): Document AdminChallenges tab.
  - Where to find it: Admin → Challenges tab.
  - View/filter: Status filter (pending, countered, accepted, scheduled, expired, cancelled, etc.); explain which statuses appear on the public challenge board.
  - **Schedule**: "Schedule" button navigates to Schedule Match with pre-fill (participants, match type, optional stipulation from challenge); the scheduled match stores a link to the challenge.
  - Per-row **Delete** (removes the challenge).
  - **Clear Resolved** bulk action: removes cancelled, expired, and scheduled challenges; confirm dialog.
  - Use `h4` for "Challenges" and `h5` for subsections (e.g. "Viewing and filtering", "Scheduling a match from a challenge", "Deleting challenges", "Clear Resolved").

- **Promos section** (new): Document AdminPromos tab.
  - Where to find it: Admin → Promos tab.
  - View/filter: Promo list; filter by type (open-mic, call-out, response, etc.).
  - **Pin / Unpin**: Pinned promos appear at top of public feed.
  - **Hide**: Hidden promos are removed from the public feed; explain that scheduling a match from a call-out promo can hide it from the feed (if that’s current behavior, document it).
  - **Schedule Match** (for call-out promos): Navigate to Schedule Match with pre-fill from promo (participants, etc.); match stores link to promo.
  - Per-row **Delete**.
  - **Bulk clear** (e.g. "Clear hidden promos" or equivalent): Document the bulk action that clears hidden (or similar) promos.
  - Use `h4` for "Promos" and `h5` for subsections.

- **Schedule Match section** (update existing): Add a subsection (e.g. **Pre-fill from challenge or promo**):
  - You can open Schedule Match from the Challenges tab ("Schedule" on a challenge) or from the Promos tab ("Schedule Match" on a call-out promo). Participants, match type, and optional stipulation are pre-filled; you can change them. The scheduled match stores a link to the challenge or promo for reference.

- **User Management / Wrestler role** (update): Remove the phrase "challenges (coming soon), promos (coming soon)". Replace with wording that Wrestler role includes access to profile, challenges, and promos (e.g. "Access to personal profile page with stats, contender status, challenges, and promos").

- **Review** other sections (Manage Players, Divisions, Seasons, Championships, Events, Match Card Builder, Record Results, Tournaments, Contender Config, Danger Zone) for accuracy and consistency with the current UI; fix any outdated steps or labels.

- Ensure every major section has an `id` that appears in the TOC so anchor links work.

### Step 3: Tests and verification

- **AdminGuide.test.tsx**:
  - Assert that a TOC (or nav with table-of-contents semantics) is present and contains links to the major sections (e.g. `#quickstart`, `#challenges`, `#promos`, `#schedule-match`, `#data-management`, `#workflow`).
  - Assert that section headings "Challenges" and "Promos" (or "Content & social" and subsections) are present.
  - Assert that the Wrestler role description no longer contains "coming soon" (e.g. expect not to find that exact text in the document).
  - If the test currently relies on exact heading order or count, update it to allow the new structure (e.g. more headings for Challenges/Promos subsections).
- Run existing tests and fix any regressions.
- Optionally use **test-generator** for TOC link count or accessibility assertions.

## Dependencies and order

- Step 1 must be done first (TOC and section IDs) so the rest of the guide can link to them.
- Step 2 depends on Step 1 and adds new sections, grouping, and copy updates.
- Step 3 depends on Steps 1–2.

**Suggested order**: Step 1 → Step 2 → Step 3.

## Testing and verification

- **Manual**: Open Admin Guide; confirm TOC at top with links to each major section. Click each TOC link and confirm scroll/focus lands on the correct section. Confirm section groups (League setup, Match operations, Content & social, etc.) and new Challenges and Promos content match the AdminChallenges and AdminPromos UI (filter, Schedule, delete, bulk clear). Confirm User Management no longer says "coming soon" and Schedule Match documents pre-fill from challenge/promo. Confirm Data management and Workflow sections still accurate.
- **Existing tests**: AdminGuide tests assert headings and intro; update for TOC and new sections and "coming soon" removal.
- **New tests**: TOC presence and links; Challenges and Promos sections present; "coming soon" absent.

## Risks and edge cases

- **Heading hierarchy**: Use consistent `h4` for main sections and `h5` for subsections so the TOC and accessibility tree stay consistent. If the component currently uses mixed levels, normalize to this pattern.
- **Deep links**: If the app later supports hash routing (e.g. `/admin#challenges`), the same `id` values will work.
- **Copy accuracy**: Challenges statuses and Promos bulk actions must match the actual AdminChallenges and AdminPromos behavior (e.g. "Clear Resolved" = cancelled/expired/scheduled; promo bulk clear = hidden or as implemented). Verify against the components and API before finalizing copy.
- **User help**: Issue 123 is admin help only; user help refresh is issue 122 and not in scope.
