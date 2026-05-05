# [RIV-18] Seed data for local development

**Phase:** 5 — Polish
**Estimate:** S
**Blocked by:** RIV-01 (tables), RIV-02 (handlers — for cross-checks), RIV-04, RIV-05 (so seeded messages and notes resolve)
**Blocks:** RIV-19 (E2E verification benefits from realistic data)
**Reference:** [plan-rivalries.md § Phase 5, step 29](../plan-rivalries.md)

## Goal
Seed 2-3 example rivalries with full sub-data so devs running `npm run seed` get a meaningful rivalry feature experience locally.

## Scope
**In:** Modifications to the existing seed script to populate the new tables and tag existing matches/promos with `rivalryId`.
**Out:** A separate seed-rivalries.ts module — wait for the modular seed-data refactor (TO-DOS.md line 7) and add a `seed-rivalries.ts` then.

## Subtasks
- [ ] Modify `backend/scripts/seed-data.ts` to add a Rivalries section that creates:
  - **Rivalry 1 (active, heated):** Two top wrestlers from the existing seeded set. 8-10 messages mixed `gm-only` and `all-participants` (some authored by each wrestler, some by the GM). 3 storyline notes (mixed `gm-only` and `participants` visibility). 2 GM plans with `scheduledFor` dates, one with a `linkedMatchId` to a seeded scheduled match. Tag 3-4 existing seeded completed matches and 2 seeded promos with this `rivalryId`.
  - **Rivalry 2 (concluded, slow-burn):** A historical rivalry between two other wrestlers. 5-6 messages. 2 storyline notes. No active plans (concluded). 5 tagged completed matches. 1 tagged promo.
  - **Rivalry 3 (pending):** A fresh request, no GM response yet. No messages, no notes, no tagged matches/promos.
- [ ] Ensure `defaultMessageAudience` is set to `'all-participants'` for Rivalry 1 (so the seed shows the multi-party thread experience) and `'gm-only'` for Rivalry 2.
- [ ] Add a corresponding clear step to `backend/scripts/clear-data.ts` that empties the three new tables.
- [ ] Document in the seed script header comment which existing seeded players and matches the rivalries reference (so devs know what to look for).

## Files Touched
- `backend/scripts/seed-data.ts` (modify — add Rivalries section)
- `backend/scripts/clear-data.ts` (modify — clear new tables)

## Acceptance Criteria
- `cd backend && npm run seed` completes without errors and the three rivalries are visible at `http://localhost:3000/rivalries`.
- Rivalry 1's detail page shows real matches in History, real promos in Promos, the seeded plans in Notes & Plans, and the seeded message thread in Messages.
- `cd backend && npm run clear-data` empties all three rivalry tables without error.

## Notes / Risks
- Use the existing seeded player IDs explicitly (don't rely on order). Hardcode the IDs at the top of the seed script if not already done.
- Keep the seed deterministic — same script run produces same rivalry IDs, helpful for QA scripts.
