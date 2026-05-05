# [RIV-04] Rivalry messaging backend (post + list with audience filtering)

**Phase:** 2 — Backend handlers
**Estimate:** M
**Blocked by:** RIV-01, RIV-06 (notification types)
**Blocks:** RIV-12 (Messages tab)
**Reference:** [plan-rivalries.md § Phase 2, step 9](../plan-rivalries.md)

## Goal
The first two-way thread primitive in the codebase, scoped to a single rivalry, with per-message audience control (`gm-only` vs `all-participants`).

## Scope
**In:** post + list message handlers, audience filtering on both write and read paths, notification dispatch, tests.
**Out:** Frontend chat UI (RIV-12), polling/WebSocket transport, attachments.

## Subtasks
- [ ] `backend/functions/rivalries/messages/postMessage.ts` — body: `{ content, audience? }`. If `audience` omitted, default to the rivalry's `defaultMessageAudience`. Validate `req.user.userId` is in the rivalry's allowed participant set (the two wrestlers + assigned GMs). Reject otherwise (403).
- [ ] On successful post, create `'rivalry_message'` notifications for every other participant **filtered by audience** — a `'gm-only'` message only notifies GMs (and the author themselves for sent-confirmation if the existing notification convention requires it), never the opposing wrestler.
- [ ] `backend/functions/rivalries/messages/listMessages.ts` — paginated by `createdAt` descending. Gated on participant membership AND on per-message audience: a wrestler must not see `'gm-only'` messages authored by the opposing wrestler. GMs see everything.
- [ ] Wire HTTP events: `GET /rivalries/{id}/messages`, `POST /rivalries/{id}/messages`. Both authenticated.
- [ ] Vitest tests: post by participant (success), post by non-participant (403), `gm-only` message visibility (opposing wrestler can't see it, GMs can, author can), notification fan-out matches audience, pagination cursor round-trip.

## Files Touched
- `backend/functions/rivalries/messages/postMessage.ts` (create)
- `backend/functions/rivalries/messages/listMessages.ts` (create)
- `backend/functions/rivalries/messages/__tests__/*.test.ts` (create)
- `backend/serverless.yml` (modify — 2 HTTP events)

## Acceptance Criteria
- Audience filter tests pass on both post (notification fan-out) and list (visibility).
- A `gm-only` message authored by Wrestler A is visible to A and to all assigned GMs, invisible to Wrestler B.
- An `all-participants` message is visible to both wrestlers and all GMs.
- A non-participant calling either endpoint gets 403, not 404 (don't leak rivalry existence).
- System messages (e.g., from `respondRivalry` in RIV-02) appear in the list with `isSystem: true` and `audience: 'all-participants'`.

## Notes / Risks
- Notification volume — a 4-participant rivalry produces 3 notifications per message. Per-recipient debouncing or server-side batching is a deferred follow-up.
- No real-time transport — the frontend will poll. That's a frontend concern (RIV-12), but the list endpoint should be cheap enough that 15-30s polling is fine.
- The `audience` field is also written by `respondRivalry`'s system message in RIV-02. Confirm both sides agree on the enum values before merging.
