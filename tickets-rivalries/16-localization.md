# [RIV-16] Localization (English + German)

**Phase:** 5 — Polish
**Estimate:** S
**Blocked by:** can land in parallel with frontend tickets, but easiest after RIV-08 through RIV-14 settle their copy
**Blocks:** none (the components fall back to keys if translations are missing — but ship before public release)
**Reference:** [plan-rivalries.md § Phase 5, step 27](../plan-rivalries.md)

## Goal
Add the full `rivalries.*` translation namespace to both locale files so every visible string is localized in English and German.

## Scope
**In:** Every user-facing string in the new components, in both locales.
**Out:** The wiki articles' translations (RIV-17).

## Subtasks
- [ ] Add the `rivalries.*` block to `frontend/src/i18n/locales/en.json` mirroring the depth of the existing `challenges.*` block. Required sub-namespaces:
  - `rivalries.hub.*` — page title, tagline, tabs (active / myRivalries / legacyArchive), filterChipLabels, requestCta, episodeSelectorLabel, recentActivityHeading
  - `rivalries.card.*` — heatLabels (slow-burn / brewing / heated / personal), statusLabels (pending / active / concluded / rejected / cancelled), matchCountLabel, lastActivityLabel
  - `rivalries.detail.*` — heroVsLabel, daysToEvent, recordLabel, tabLabels (overview / matchHistory / futureMatches / promos / notesPlans / messages), messageGmCta
  - `rivalries.overview.*` — storylineNotesHeading, gmPlansHeading, nextMatchHeading, recentPromosHeading, lastEncountersHeading, emptyStates.*
  - `rivalries.notes.*` — storylineColumnHeading, plansColumnHeading, addStorylineCta, addPlanCta, scheduledForLabel, linkedMatchLabel, linkedEventLabel, wrestlerSuggestionHint, staleLink
  - `rivalries.messages.*` — composerPlaceholder.gmOnly, composerPlaceholder.allParticipants, composerHint.gmOnly, composerHint.allParticipants, sendCta, retryCta, loopInOpponentLabel, pushNotificationsLabel, emailAlertsLabel, emptyState
  - `rivalries.request.*` — pageTitle, pageSubtitle, stepLabels (whoAndWhy / pitchAndPlans), fields.* (yourWrestler, opponent, title, heat, why, tagGm, storylinePitch, plans), helpText.*, submitCta, backCta, cancelCta, validationErrors.*
  - `rivalries.admin.*` — tabTitle, statusFilterLabels, actions (approve / reject / conclude / delete / clearResolved), confirmModals.* (rejectReason, concludeReason, deleteConfirm, bulkClearConfirm)
  - `rivalries.status.*` — same enum keys as `card.statusLabels` but suitable for inline status pills
  - `rivalries.heat.*` — same enum keys as `card.heatLabels` but suitable for chips
  - `rivalries.dashboard.*` — myActiveRivalriesHeading, viewAllLink, emptyState
- [ ] Add German translations for every key above to `frontend/src/i18n/locales/de.json`. Keep depth/structure identical.
- [ ] Replace any hardcoded English strings in the new components (RIV-08 through RIV-14) with `t()` calls referencing the new keys. Grep the new files for literal strings.

## Files Touched
- `frontend/src/i18n/locales/en.json` (modify — add `rivalries.*`)
- `frontend/src/i18n/locales/de.json` (modify — add `rivalries.*` translations)
- All `frontend/src/components/rivalries/**/*.tsx` (modify — replace hardcoded strings with `t()` calls; many of these will already be using `t()` if the component-author followed convention)
- `frontend/src/components/admin/AdminRivalries.tsx` (modify — same)

## Acceptance Criteria
- Switching language to German renders every visible string in the rivalry feature in German with no missing-key warnings in the console.
- The `wiki.articles.rivalries` and `wiki.articles.adminRivalries` keys are present too (RIV-17 also touches these — coordinate ordering).
- No hardcoded English string remains in any rivalry component (grep verifies).

## Notes / Risks
- German translations should mirror tone of existing `challenges.*` and `promos.*` blocks. If the original engineer doesn't speak German, defer to whoever did the existing translations.
- Heat / status enum labels are referenced from multiple places (`card.*`, `status.*`, `heat.*` namespaces). Keep the actual displayed text consistent across them, even if the keys differ.
