# [RIV-03] Rivalry activity feed handler

**Phase:** 2 — Backend handlers
**Estimate:** M
**Blocked by:** RIV-01, RIV-02 (needs the Rivalry repos and the matches/promos integrations from RIV-06 — see Notes)
**Blocks:** RIV-08 (Hub uses this feed)
**Reference:** [plan-rivalries.md § Phase 2, step 6 (`getRivalryActivity.ts`)](../plan-rivalries.md)

## Goal
Power the "Recent Rivalry Activity" feed shown on the Hub: a single chronologically-sorted, paginated stream that merges messages, promos, matches, and notes across the caller's visible rivalries.

## Scope
**In:** One read-only handler that does the cross-source merge. HTTP route. Tests.
**Out:** Materializing a `RivalryActivity` derived table — defer until / unless this becomes a hot path. Frontend consumption (RIV-08).

## Subtasks
- [ ] `backend/functions/rivalries/getRivalryActivity.ts` — accept query params: `participantId?` (defaults to caller), `eventId?`, `limit` (default 25), `cursor?`.
- [ ] Resolve the set of visible rivalries (filtered by participant + event + caller's role for visibility).
- [ ] Fan out to messages / promos / matches / notes repos in parallel; cap each per-source pull at `limit * 2` to bound work.
- [ ] Merge into a single `RivalryActivityItem[]` typed union with discriminator `kind: 'message' | 'promo' | 'match' | 'note'` and a normalized `occurredAt` field.
- [ ] Sort descending by `occurredAt`, slice to `limit`, return with a `nextCursor` (encoded `occurredAt` of the tail item).
- [ ] Filter out activity items the caller can't see (e.g., `gm-only` messages from the other wrestler).
- [ ] Add an in-handler memoization step keyed on `(participantId, eventId, cursor)` with a 30-second TTL — cheap protection against rapid hub re-renders.
- [ ] Wire `GET /rivalries/activity` in `backend/serverless.yml` (public read; auth optional — caller identity is derived from the JWT if present).
- [ ] Vitest tests: empty case, mixed-source merge ordering, audience filtering (`gm-only` message hidden from opposing wrestler), pagination cursor round-trip.

## Files Touched
- `backend/functions/rivalries/getRivalryActivity.ts` (create)
- `backend/functions/rivalries/__tests__/getRivalryActivity.test.ts` (create)
- `backend/serverless.yml` (modify — one HTTP event)
- `frontend/src/types/rivalry.ts` (modify — add `RivalryActivityItem` discriminated union)

## Acceptance Criteria
- Handler returns a stable order regardless of which source (messages vs matches vs promos) currently has the latest item.
- Audience filter test passes: a `gm-only` message authored by Wrestler B does NOT appear in the activity feed when Wrestler A is the caller.
- Cursor pagination: fetching page 2 with the returned `nextCursor` returns the next slice with no overlap and no gap.
- Cold-start handler latency < 800ms with 5 visible rivalries each having 50 items per source (sanity check, not a hard SLA).

## Notes / Risks
- This ticket can technically land before RIV-06 if the matches/promos integrations aren't wired yet — the activity feed will just show messages and notes only until `rivalryId` is persisted on matches/promos. List both as upstream so reviewers know.
- If the on-the-fly merge proves too slow at real data volumes, file a follow-up ticket for the materialized `RivalryActivity` derived table. Don't over-engineer here.
