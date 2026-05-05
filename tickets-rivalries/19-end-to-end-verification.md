# [RIV-19] End-to-end verification & release readiness

**Phase:** 6 — Tests & verification
**Estimate:** M
**Blocked by:** every other ticket
**Blocks:** PROD deploy
**Reference:** [plan-rivalries.md § Phase 6, steps 30-31; § Testing & Verification](../plan-rivalries.md)

## Goal
Final sweep: full lint/typecheck/test pass on both halves, manual end-to-end smoke against devtest, accessibility check, and sign-off on the visibility model that gates the highest-leak surfaces.

## Scope
**In:** Full test runs, manual smoke checklist, accessibility pass, visibility audit, deploy to devtest, prod readiness sign-off.
**Out:** New feature work (file follow-ups instead).

## Subtasks
- [ ] Run `cd backend && npx tsc --project tsconfig.json --noEmit` — zero errors.
- [ ] Run `cd frontend && npx tsc --project tsconfig.app.json --noEmit` — zero errors.
- [ ] Run `cd backend && npm run lint && npx vitest run` — zero failures.
- [ ] Run `cd frontend && npm run lint && npx vitest run` — zero failures.
- [ ] Deploy to devtest: `cd backend && npx serverless deploy --stage devtest --aws-profile league-szn` then `cd frontend && npm run build -- --mode devtest && aws s3 sync dist s3://dev.leagueszn.jpdxsolo.com --profile league-szn --delete`.
- [ ] **Manual smoke against devtest** (per plan § Testing & Verification):
  - [ ] Wrestler A logs in → Dashboard "My Active Rivalries" card shows seeded data → click through to seeded rivalry → Overview tab populated.
  - [ ] Wrestler A clicks "Request a Rivalry" → completes both steps → submits → lands on new rivalry detail with status "pending".
  - [ ] Admin logs in → `/admin/rivalries` shows the pending request → approves → wrestler A receives a notification → status flips to active → system message appears in Messages tab.
  - [ ] Wrestler A posts a `'gm-only'` message → admin sees it on refresh → opposing Wrestler B confirms they CANNOT see it. Wrestler A posts an `'all-participants'` message → opposing Wrestler B sees it.
  - [ ] Admin schedules a match from Future Matches tab → match created with `rivalryId` → appears in Future Matches → after recording result, appears in Match History.
  - [ ] Admin tags a promo with `rivalryId` from the promo composer → appears in the rivalry's Promos tab.
  - [ ] Switch language to German → all rivalry strings render translated. Switch back to English.
- [ ] **Visibility audit** — for each of the following matrix cells, verify the wrong party CANNOT see the data via either UI or direct API call (use `curl` with their JWT):
  - [ ] Wrestler B viewing Wrestler A's `'gm-only'` rivalry messages → 200 response excludes them.
  - [ ] Wrestler B viewing GM's `'gm-only'` plan notes → 200 response excludes them.
  - [ ] Unauthenticated viewing the rivalry detail page → no messages, no `'gm-only'` notes in the response.
  - [ ] Non-participant attempting to POST a message → 403.
- [ ] Accessibility pass: keyboard-only navigation through Hub → Detail → Messages tab → composer. Screen reader can read message thread chronologically with author attribution.
- [ ] Performance sanity: Hub TTI under 2s with seed data; Detail page TTI under 2s; Messages tab polling does not produce visible jank.
- [ ] File any follow-up tickets discovered during the smoke (e.g., bulk-message debouncing, real-time transport, in-place rich text editor).

## Files Touched
- None (verification only). Any bugs found get their own follow-up tickets or quick fixes in the relevant feature ticket.

## Acceptance Criteria
- All four lint/typecheck/test commands exit 0.
- Every checkbox in the manual smoke and visibility-audit sections is checked off with a brief note in the PR description.
- Sign-off recorded on the visibility model — explicit confirmation that no role × visibility × noteType combination leaks data.
- DevOps green-light: devtest deploy succeeded, no CloudWatch errors during smoke, no DynamoDB throttling.

## Notes / Risks
- The visibility audit is the most important step — a leak here is the highest-impact bug class in this feature.
- Performance numbers are sanity checks, not hard SLAs. If they regress significantly, file a follow-up rather than blocking release.
- Don't promote to prod without completing the German-locale smoke; missing translation keys are easy to ship by accident.
