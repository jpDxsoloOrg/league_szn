# [RIV-11] Detail tab: Notes & Plans

**Phase:** 4 — Frontend
**Estimate:** M
**Blocked by:** RIV-09 (shell), RIV-05 (notes backend)
**Blocks:** none
**Reference:** [plan-rivalries.md § Phase 4, step 20](../plan-rivalries.md); Stitch detail mockup "STORYLINE NOTES" + "GM EXECUTIVE PLANS" sections

## Goal
Two-column tab showing storyline notes (visible per role) and the GM-only plans timeline, with inline edit for GMs and deep-links from plan entries to their linked match or event.

## Scope
**In:** `NotesPlansTab.tsx` with role-based UI, inline create/edit for GMs, link rendering for `linkedMatchId` / `linkedEventId`.
**Out:** Note backend (RIV-05).

## Subtasks
- [ ] `frontend/src/components/rivalries/tabs/NotesPlansTab.tsx` — two-column layout:
  - Left column: "Storyline Notes" — list of notes filtered to `noteType: 'storyline'`. Visible to wrestlers and GMs. GMs see all visibilities; wrestlers see only `'participants'` and `'public'` plus their own `'gm-only'` notes (those they authored).
  - Right column: "GM Executive Plans" timeline — list of `noteType: 'plan'` notes. For each entry render: a header (with `scheduledFor` date if set), the content, and if `linkedMatchId` or `linkedEventId` is present, a small clickable badge linking to the match detail page or event detail page. Default visibility for plans is `'gm-only'` (per RIV-05) — wrestlers may see no plans at all unless GMs explicitly publish them.
- [ ] Inline-create form for GMs at the top of each column with: textarea, optional `scheduledFor` date picker, optional `linkedMatchId` / `linkedEventId` selectors (autocomplete from existing matches/events APIs), visibility selector.
- [ ] Inline-edit affordance on each note (GMs only; wrestlers can edit their own `'storyline'` `'gm-only'` notes).
- [ ] Graceful handling of stale links: if `linkedMatchId` or `linkedEventId` no longer resolves, render the badge with a strikethrough and tooltip "Match no longer exists" — do not 404 the page.
- [ ] Wrestler-suggestion mode: a wrestler creating a `'storyline'` note sees a hint "GMs will be notified of your suggestion" (the visibility is server-forced to `'gm-only'`).
- [ ] Vitest tests: GM sees all visibilities, wrestler does not see GM `'gm-only'` notes, plan badge resolves to correct match/event link, stale link renders gracefully.

## Files Touched
- `frontend/src/components/rivalries/tabs/NotesPlansTab.tsx` (create)
- `frontend/src/components/rivalries/tabs/__tests__/NotesPlansTab.test.tsx` (create)

## Acceptance Criteria
- Wrestler caller never sees a `'plan'` note unless its visibility is `'participants'` or `'public'`.
- Wrestler caller sees their own `'storyline'` `'gm-only'` notes (suggestions to the GM) but not other wrestlers' `'gm-only'` notes — confirms server filtering AND client UI alignment.
- GM caller sees everything and can edit any note inline.
- Linked-match / linked-event badges navigate to the right URLs when clicked.
- The "Wrestler suggestion" hint is shown only when the caller is a wrestler creating a `'storyline'` note.

## Notes / Risks
- Plans visibility is the highest leak risk in the feature — if a wrestler ever sees a `'gm-only'` `'plan'` note that wasn't theirs, that's a P0 bug. RIV-05 enforces server-side; this ticket should reinforce by also filtering client-side as defense-in-depth (with a console.warn if the server returned data the client wouldn't show).
