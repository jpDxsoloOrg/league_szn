# [RIV-12] Detail tab: Messages (with audience toggle, polling, optimistic UI)

**Phase:** 4 — Frontend
**Estimate:** L
**Blocked by:** RIV-09 (shell), RIV-04 (messaging backend)
**Blocks:** none
**Reference:** [plan-rivalries.md § Phase 4, step 20](../plan-rivalries.md); Stitch mockup `screens/617995aa3b1b47b99127ce0262e4d0d7`

## Goal
The two-way thread UI scoped to a single rivalry. Renders the conversation, supports the "Loop in Opponent" audience toggle, polls for new messages, and provides optimistic-send UX.

## Scope
**In:** `MessagesTab.tsx` (left rail + right thread), composer with audience toggle, polling refresh, optimistic-send rollback on failure.
**Out:** Real-time WebSocket transport (deferred per CLAUDE.md "Known Limitations" #7), file attachments.

## Subtasks
- [ ] `frontend/src/components/rivalries/tabs/MessagesTab.tsx` — two-column layout per Stitch messages mockup:
  - Left rail (~30%): "Participants" card listing the two wrestlers + assigned GMs with avatars, names, online-status placeholder dots. "Message Settings" card with toggles: "Push notifications", "Email alerts", "Loop in Opponent" (binds to rivalry's `defaultMessageAudience` — when off, default audience is `'gm-only'`; when on, default is `'all-participants'`). Toggle changes call `rivalriesApi.update(rivalryId, { defaultMessageAudience: ... })`.
  - Right pane (~70%): chronological thread of message bubbles. Own messages right-aligned with subtle gold tint; others left-aligned with avatar. System messages (e.g., "GM scheduled a match…") rendered with a distinct styled row, no bubble.
  - Composer at bottom: sunken textarea, attach + emoji icons (placeholder buttons OK for now, no actual attach handler), gold "Send" button. Below the input: character counter and the hint text "Messages are private between you and the GMs." (or "…and your opponent." when Loop in Opponent is on — bind to current audience).
- [ ] Polling: fetch new messages every 15s when the tab is visible (use the Page Visibility API to pause when hidden). Debounce on server load: skip the next poll if a manual refresh or post just happened.
- [ ] Optimistic send: append the new message to the thread immediately with a sending state, fire `rivalriesApi.messages.post`, swap to confirmed on success, mark as failed (with retry button) on error.
- [ ] Per-message audience override: a small toggle on the composer to send a single message as `'gm-only'` even when the thread default is `'all-participants'` (and vice versa).
- [ ] Auto-mark-as-read when the tab is opened.
- [ ] Empty state ("No messages yet — say hi to your GM").
- [ ] Vitest tests: optimistic-send rollback on failure, polling pauses when tab hidden, audience toggle updates default and persists, system messages render distinct from user messages.

## Files Touched
- `frontend/src/components/rivalries/tabs/MessagesTab.tsx` (create)
- `frontend/src/components/rivalries/tabs/__tests__/MessagesTab.test.tsx` (create)

## Acceptance Criteria
- Polling works: a message posted by another participant appears within 15s without a page reload.
- Optimistic send shows the message instantly; on a backend 500 the message flips to a "Failed — Retry" state without disappearing.
- Toggling "Loop in Opponent" persists across page reloads (server-side via `rivalriesApi.update`).
- A `'gm-only'` message is rendered with a small visual indicator (lock icon or muted color) so the sender knows it's not visible to the opponent.
- Composer hint text reflects the current default audience.

## Notes / Risks
- Polling fan-out — every active Messages tab makes one request every 15s. With many concurrent users this could pressure the API. If load is a concern at scale, file a follow-up for a long-poll or SSE variant; do not block this ticket.
- The optimistic-send UX is critical because polling latency is otherwise visible to the sender.
- The "Loop in Opponent" rivalry-level toggle should be GM-controlled or both-wrestler-controlled, not solely the requester's. Confirm with product before merging if ambiguous.
