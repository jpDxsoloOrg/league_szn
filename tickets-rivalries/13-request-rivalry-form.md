# [RIV-13] Request a Rivalry form (2-step)

**Phase:** 4 — Frontend
**Estimate:** M
**Blocked by:** RIV-07
**Blocks:** none
**Reference:** [plan-rivalries.md § Phase 4, step 22](../plan-rivalries.md); Stitch mockup `screens/f98b693dbcfc4d0e9689c2d9d1bcb9e0`

## Goal
Wrestler-facing two-step form to pitch a new rivalry to the GMs.

## Scope
**In:** `RequestRivalry.tsx` two-step form, opponent autocomplete, GM tagging, validation, submit-and-redirect flow.
**Out:** Backend handler (RIV-02 already covers `createRivalry`).

## Subtasks
- [ ] `frontend/src/components/rivalries/RequestRivalry.tsx` — page layout per Stitch request mockup. Centered form on a `surface_container_high` card, max-width ~720px.
- [ ] Two-step indicator at top: Step 1 "Who & Why" / Step 2 "Pitch & Plans".
- [ ] **Step 1 fields:**
  - "Your Wrestler" — read-only chip showing current logged-in wrestler portrait + name (resolves from auth context).
  - "Opponent" — autocomplete dropdown calling players API, showing portrait + name + record per result. Filter out self from the suggestions.
  - "Rivalry Title" — text input with placeholder "e.g. Bloodline Civil War", required, max 80 chars.
  - "Proposed Heat Level" — radio chips: Slow Burn / Brewing / Heated / Personal.
  - "Why this rivalry?" — large textarea, required, 50-1500 char counter.
  - "Tag your GM" — chips with assigned-GMs avatars; one or more can be selected (passed as a hint, not an exclusive routing — see RIV-02 notes).
  - "Continue to Step 2" gold button (disabled until required fields valid). "Cancel" outline button.
- [ ] **Step 2 fields:**
  - "Storyline Pitch" — larger rich-text-style textarea (just textarea is fine for v1; rich text deferred), 100-3000 chars.
  - "Proposed Plans" — optional list of 1-5 plan-entry rows (text + optional `scheduledFor` date) — these are saved as initial `'plan'` notes (visibility `'gm-only'`) after the rivalry is created.
  - "Submit Rivalry Request" gold button. "Back" button → returns to Step 1 preserving state.
- [ ] On submit: call `rivalriesApi.create(input)`. On success, also create the proposed plan notes via `rivalriesApi.notes.upsert` (one per plan row). Navigate to `/rivalries/:newRivalryId`.
- [ ] Validation: surface inline errors per field; do not allow Step 1 → 2 progression with invalid required fields.
- [ ] Vitest tests: required-field validation blocks Step 1, opponent autocomplete excludes self, submit creates rivalry then notes then navigates, back button preserves Step 1 state.

## Files Touched
- `frontend/src/components/rivalries/RequestRivalry.tsx` (create)
- `frontend/src/components/rivalries/__tests__/RequestRivalry.test.tsx` (create)

## Acceptance Criteria
- Form matches Stitch request mockup visually — gold accent only on the active step indicator and the primary CTA, sharp 4px corners, sunken input fills.
- Submitting with required fields returns the user on the new rivalry's detail page within 1s on a typical connection.
- A failed submit (e.g., duplicate-active 409 from RIV-02) shows an inline error without losing form state.
- The plan-row creation runs sequentially after rivalry creation; if a plan-note write fails, it does not roll back the rivalry but does flag the failure to the user with a "Some plans failed to save — edit later in the rivalry detail" banner.

## Notes / Risks
- Keep Step 1 + Step 2 inside a single component with internal state — using React Router for the two steps adds complexity without payoff at this size.
- The Step 2 plan-rows are a UX nicety; if scope-cutting, defer Step 2 entirely and let the user add plans from the Notes & Plans tab post-creation.
