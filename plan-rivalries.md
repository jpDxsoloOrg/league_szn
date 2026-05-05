# Plan: Rivalries Feature

## Context

A new first-class feature: wrestlers can request a **Rivalry** with another wrestler — a long-form, ongoing storyline container that aggregates everything tied to that pairing in one place: storyline notes, GM-authored plans, completed match results, scheduled future matches, promos, and a private threaded conversation between the wrestler(s) and the GMs (admins/moderators).

This is **distinct from Challenges**. Challenges are short-lived, one-off match requests with a 7-day expiry. Rivalries are persistent, multi-match story arcs that may produce many challenges, matches, and promos over weeks or months. A rivalry pairs two wrestlers, has a status (`pending` → `active` → `concluded` / `rejected`), and is moderated by a GM.

The closest existing analog is **Challenges**, which we will model the lifecycle/admin-moderation pattern after. The closest existing UI analog for the messaging panel is the existing **Promos thread** view. There is **no existing thread/conversation primitive** in the codebase — the only inter-user surface today is one-way `Notifications` (system → user). The Messages portion of this feature introduces the first real two-way threaded messaging in the app, scoped to a single rivalry.

A separate Google Stitch project (`projects/10219259134533090941` — "League SZN — Rivalries Feature") was created to host visual mockups for the four key screens (Hub, Detail, Messages, Request form). Mockup generation timed out during the planning session — re-run via the Stitch MCP later if needed.

## Files to Modify

### Backend

| File | Action | Purpose |
|------|--------|---------|
| `backend/serverless.yml` | Modify | Add 3 new DynamoDB tables (Rivalries, RivalryMessages, RivalryNotes), 3 GSIs, 14 new HTTP events with auth + handler refs, env vars on all rivalry handlers |
| `backend/functions/rivalries/handler.ts` | Create | Single Lambda dispatcher routing 7 rivalry handlers (mirror `challenges/handler.ts:1-52`) |
| `backend/functions/rivalries/createRivalry.ts` | Create | Wrestler-initiated rivalry request; validates wrestler role, the pair doesn't already have an active rivalry, and second participant exists |
| `backend/functions/rivalries/getRivalries.ts` | Create | List rivalries with filters (status, participantId, seasonId, page) for public board |
| `backend/functions/rivalries/getRivalry.ts` | Create | Single rivalry hub — returns rivalry record + computed stats (head-to-head record, match counts) + pre-fetched related entities (recent promos, next match, latest GM-published notes) |
| `backend/functions/rivalries/respondRivalry.ts` | Create | GM-only: approve/reject/conclude a pending or active rivalry; records reason in `gmResponse` |
| `backend/functions/rivalries/updateRivalry.ts` | Create | GM-only: edit title, heat level, status (active → concluded), seasonId; wrestler-allowed for limited fields (e.g. cancel their own pending request) |
| `backend/functions/rivalries/deleteRivalry.ts` | Create | GM-only: soft-delete (mirror challenges delete); cascades to RivalryMessages + RivalryNotes |
| `backend/functions/rivalries/messages/postMessage.ts` | Create | Append a message to a rivalry's thread; participants are the two wrestlers + assigned GMs; creates a `Notification` for other participants |
| `backend/functions/rivalries/messages/listMessages.ts` | Create | Paginated message history (newest-first by `createdAt`), gated on participant membership |
| `backend/functions/rivalries/notes/upsertNote.ts` | Create | Create or update a storyline note (GM-only) or "plan" entry (GM-only). Wrestler-authored notes are allowed but flagged `authorRole: 'wrestler'` and visible to GMs only by default. |
| `backend/functions/rivalries/notes/listNotes.ts` | Create | Returns notes filtered by `noteType` (`storyline` / `plan`) and visibility |
| `backend/functions/rivalries/__tests__/*.test.ts` | Create | Vitest unit tests per handler. Mock `getRepositories()` per the new repository pattern in [CLAUDE.md](CLAUDE.md#repository-pattern-database-interface-layer) |
| `backend/lib/repositories/rivalries.ts` | Create | New `RivalriesRepository` and `RivalryMessagesRepository` interfaces + DynamoDB implementations. Domain methods only — no PK/SK leakage. Methods: `findById`, `listByParticipant`, `listByStatus`, `create`, `update`, `delete`. Messages: `appendMessage`, `listByRivalry`, `markRead`. |
| `backend/lib/repositories/index.ts` | Modify | Register the new repos in `getRepositories()` factory; export types |
| `backend/lib/repositories/unitOfWork.ts` | Modify | Add `createRivalry`, `updateRivalry`, `appendRivalryMessage` methods to the `UnitOfWork` interface and its DynamoDB implementation. Used by `respondRivalry` (atomic status flip + notification + system message) |
| `backend/lib/notifications.ts` | Modify | Add new notification types: `'rivalry_message'`, `'rivalry_request'`, `'rivalry_status_change'`. Export helper `createRivalryNotification(rivalryId, recipientUserId, type, message)` for handler reuse |
| `backend/functions/matches/getMatches.ts` | Modify | Add an optional `rivalryId` filter param. When present, look up the rivalry's two participants and return matches whose `participants` array contains both. (Today this would be a client-side filter on `list()` — see file at lines 27-103 for the existing client-filter pattern.) |
| `backend/functions/matches/createMatch.ts` | Modify | Accept optional `rivalryId` field; if present, validate that both `participants` are in the rivalry's pair. Persist on the Matches record so the rivalry hub can attribute matches authoritatively (cheaper than recomputing on every fetch). |
| `backend/functions/promos/createPromo.ts` | Modify | Accept optional `rivalryId` field; if a `call-out` or `response` promo is tagged to a rivalry, persist it. Rivalry hub queries promos by `rivalryId` rather than recomputing from `playerId` + `targetPlayerId` overlap. |
| `backend/scripts/seed-data.ts` | Modify | Seed 2-3 example rivalries with messages, notes, and tagged matches/promos for local dev |

### Frontend

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/types/rivalry.ts` | Create | TS interfaces: `Rivalry`, `RivalryStatus`, `RivalryHeat`, `RivalryMessage`, `RivalryNote`, `RivalryNoteType`, `RivalryParticipantRole`, `CreateRivalryInput`, etc. |
| `frontend/src/types/index.ts` | Modify | Re-export the new rivalry types alongside the existing barrel exports |
| `frontend/src/services/api.ts` | Modify | Add `rivalriesApi` namespace with: `list`, `get`, `create`, `respond`, `update`, `delete`, `messages.list`, `messages.post`, `notes.list`, `notes.upsert` — mirroring existing namespaces like `challengesApi` and `promosApi` |
| `frontend/src/components/rivalries/RivalryHub.tsx` | Create | Public board listing all rivalries, with tabs for "Active" vs "My Rivalries", filter chips by heat/status, grid of `RivalryCard`s, and a "Recent Activity" feed below the grid |
| `frontend/src/components/rivalries/RivalryCard.tsx` | Create | Card primitive: two wrestler portraits face-off, title, heat meter, match count, status pill |
| `frontend/src/components/rivalries/RivalryDetail.tsx` | Create | Hub page for a single rivalry. Hero header with both wrestlers and head-to-head record. Tab bar: Overview, Match History, Future Matches, Promos, Notes & Plans, Messages. Each tab loads its own data. |
| `frontend/src/components/rivalries/tabs/OverviewTab.tsx` | Create | Storyline notes summary + GM plans timeline + next-match card + recent-promos preview |
| `frontend/src/components/rivalries/tabs/MatchHistoryTab.tsx` | Create | List of completed matches between the pair (uses existing match list components if reusable, otherwise simpler list) |
| `frontend/src/components/rivalries/tabs/FutureMatchesTab.tsx` | Create | Scheduled matches; admin-only "Schedule Match for this Rivalry" CTA links to `ScheduleMatch.tsx` pre-filled with the pair + `rivalryId` (analog of the challenge→schedule flow described in [TO-DOS.md](TO-DOS.md) line 17) |
| `frontend/src/components/rivalries/tabs/PromosTab.tsx` | Create | List of promos tagged to this rivalry; CTA to compose a new promo pre-filled with `rivalryId` and `targetPlayerId` |
| `frontend/src/components/rivalries/tabs/NotesPlansTab.tsx` | Create | Two columns: storyline notes (GM-published, wrestler-readable) and plans timeline (GM-only). Inline edit affordance for GMs. |
| `frontend/src/components/rivalries/tabs/MessagesTab.tsx` | Create | Two-way threaded chat; left rail with participants + settings, right pane with message bubbles. Composer with attach + emoji + send. Polls or refetches every 15s — no WebSockets (per [CLAUDE.md "Known Limitations" #7](CLAUDE.md#known-limitations--todo)) |
| `frontend/src/components/rivalries/RequestRivalry.tsx` | Create | Two-step form: step 1 (opponent + heat + title + reason), step 2 (storyline pitch + GM tagging). Submits via `rivalriesApi.create`. |
| `frontend/src/components/admin/AdminRivalries.tsx` | Create | GM moderation: list pending requests, approve/reject inline, set status, message wrestler. Mirror `AdminChallenges.tsx` row patterns. |
| `frontend/src/App.tsx` | Modify | Register routes: `/rivalries`, `/rivalries/new`, `/rivalries/:rivalryId`, `/rivalries/:rivalryId/:tab`, `/admin/rivalries`. Wrap public routes in `<FeatureRoute feature="rivalries">` per existing pattern. |
| `frontend/src/config/navConfig.ts` | Modify | Add `rivalries` entry to wrestler nav group (after `promos`); add `rivalries` entry to admin `/admin/content` nav group |
| `frontend/src/components/Dashboard.tsx` | Modify | Add a "My Active Rivalries" card showing the logged-in wrestler's top 2-3 active rivalries with a deep-link to the hub |
| `frontend/src/components/admin/AdminPanel.tsx` | Modify | Register the new `AdminRivalries` tab in the admin tab router |
| `frontend/src/i18n/locales/en.json` | Modify | Add `rivalries.*` namespace: `hub.*` (title, tabs, filters), `card.*` (heatLevels, statusLabels), `detail.*` (tabs, headers, actions), `messages.*` (composer, hints), `notes.*` (storylineTitle, plansTitle, addNote), `request.*` (steps, fields, hints), `admin.*` (approve, reject, conclude), `status.*`, `heat.*` |
| `frontend/src/i18n/locales/de.json` | Modify | German translations for every key above (mirror existing translation coverage in `challenges.*` and `promos.*` blocks) |
| `frontend/public/wiki/index.json` | Modify | Append two entries: `{slug: "rivalries", titleKey: "wiki.articles.rivalries", file: "rivalries.md"}` and `{slug: "admin-rivalries", titleKey: "wiki.articles.adminRivalries", file: "admin-rivalries.md", adminOnly: true}` |
| `frontend/public/wiki/rivalries.md` | Create | User-facing wiki article: how to request a rivalry, what info to include, how messaging works |
| `frontend/public/wiki/admin-rivalries.md` | Create | GM-facing wiki article: how to triage requests, when to approve vs reject, how to conclude |
| `frontend/public/wiki/de/rivalries.md` | Create | German translation |
| `frontend/public/wiki/de/admin-rivalries.md` | Create | German translation |
| `frontend/src/components/rivalries/__tests__/*.test.tsx` | Create | Vitest + React Testing Library tests for the major components (RequestRivalry submission, RivalryDetail tab routing, MessagesTab posting) |

## Implementation Steps

### Phase 1 — Data model & types (foundation; nothing else can land without this)

1. **Define the TypeScript types in [frontend/src/types/rivalry.ts](frontend/src/types/rivalry.ts).** Include `Rivalry` (rivalryId, participantA, participantB, title, status, heatLevel, requestedBy, assignedGMs[], seasonId, **eventId?** (link to the Episode/PPV the rivalry culminates at — see Stitch hub mockup framing of rivalries inside "EPISODE 01: GENESIS"), **defaultMessageAudience: `'gm-only' | 'all-participants'`** (controls the "Loop in Opponent" toggle in the Messages screen — defaults to `'gm-only'`), gmResponse, createdAt, updatedAt), `RivalryStatus` = `'pending' | 'active' | 'concluded' | 'rejected' | 'cancelled'`, `RivalryHeat` = `'slow-burn' | 'brewing' | 'heated' | 'personal'`, `RivalryMessage` (messageId, rivalryId, authorUserId, authorRole, content, isSystem, **audience: `'gm-only' | 'all-participants'`** (per-message override of the rivalry default), createdAt), `RivalryNote` (noteId, rivalryId, noteType: `'storyline' | 'plan'`, content, authorUserId, authorRole, visibility: `'gm-only' | 'participants' | 'public'`, scheduledFor?, **linkedMatchId?**, **linkedEventId?** (the GM Plans timeline in the Detail mockup shows entries like "Royal Rumble Confrontation" and "Main Event: World Title Match" — plans need to deep-link to their target match or event), createdAt). Re-export from `frontend/src/types/index.ts`.

2. **Add three DynamoDB tables to [backend/serverless.yml](backend/serverless.yml).** Mirror the existing ChallengesTable definition (~line 1705-1750 of serverless.yml) for table style and PAY_PER_REQUEST billing.
   - `RivalriesTable` — PK `rivalryId`. GSIs: `ParticipantIndex` (`participantId`, `createdAt` — note: requires denormalizing both participants into a list-able shape; either two writes per rivalry or use a separate `RivalryParticipants` join table — go with two writes, simpler), `StatusIndex` (`status`, `createdAt`).
   - `RivalryMessagesTable` — PK `rivalryId`, SK `createdAt`. Naturally orders messages chronologically per rivalry.
   - `RivalryNotesTable` — PK `rivalryId`, SK `noteId`. GSI `NoteTypeIndex` (`rivalryId`, `noteType`) for filtering.
   - Add `RIVALRIES_TABLE`, `RIVALRY_MESSAGES_TABLE`, `RIVALRY_NOTES_TABLE` env vars to all rivalry handler functions.
   - Add IAM permissions on each new table to the rivalry handler statements.

3. **Build the repository layer in [backend/lib/repositories/rivalries.ts](backend/lib/repositories/rivalries.ts).** Define `RivalriesRepository`, `RivalryMessagesRepository`, `RivalryNotesRepository` interfaces with **domain-named methods only** (no `pk`, `sk`, `gsi` in signatures — see CLAUDE.md "Repository Pattern" section). Implement DynamoDB-backed versions. Register in [backend/lib/repositories/index.ts](backend/lib/repositories/index.ts) under `getRepositories()`.

4. **Extend [backend/lib/repositories/unitOfWork.ts](backend/lib/repositories/unitOfWork.ts).** Add `createRivalry`, `updateRivalry`, `appendRivalryMessage`, `createRivalryNote` to the `UnitOfWork` interface and its DynamoDB transaction-staging implementation. The `respondRivalry` handler will use these to atomically: flip status, append a system message ("GM approved this rivalry"), and create notifications.

### Phase 2 — Backend handlers (pure CRUD first, then composite operations)

5. **Build [backend/functions/rivalries/createRivalry.ts](backend/functions/rivalries/createRivalry.ts).** Validate wrestler role via `requireWrestler()` from `backend/lib/auth.ts`. Check that no `active` or `pending` rivalry exists between the same two participants (call `rivalries.listByParticipant(authorPlayerId)` and filter). Default status to `pending`. Use `getHandlerFactory`-style structure — but since this isn't pure CRUD, write it manually. Return 201 with the created rivalry.

6. **Build the read handlers** — `getRivalries.ts`, `getRivalry.ts`, **`getRivalryActivity.ts`**. `getRivalry.ts` should hydrate the response with: rivalry record, head-to-head match record (call `matches.list({ rivalryId })` once `createMatch.ts` carries `rivalryId`), **next scheduled event** (the Detail mockup foregrounds a "NEXT SCHEDULED EVENT" card showing days-to-event countdown — query the existing Events table for the soonest event matching the rivalry's `eventId` or any event containing a match tagged with this `rivalryId`), most-recent 5 promos (call `promos.list({ rivalryId })`), most-recent 3 messages, and visible notes filtered by the caller's role. **`getRivalryActivity.ts`** powers the hub's "Recent Rivalry Activity" feed (Stitch hub mockup) — it merges the latest events from messages, promos, matches, and notes across the caller's visible rivalries into a single chronologically-sorted, paginated stream. Compute on-the-fly with a small in-handler cache; if it becomes a hot path, materialize a derived `RivalryActivity` table later.

7. **Build [backend/functions/rivalries/respondRivalry.ts](backend/functions/rivalries/respondRivalry.ts) and [backend/functions/rivalries/updateRivalry.ts](backend/functions/rivalries/updateRivalry.ts).** These are GM-only (assert `requireAdminOrModerator()`). `respondRivalry` accepts `{ action: 'approve' | 'reject' | 'conclude', message?: string }` and uses `runInTransaction` from the UnitOfWork to atomically: update rivalry status, append a system message, create a notification for the requesting wrestler.

8. **Build [backend/functions/rivalries/deleteRivalry.ts](backend/functions/rivalries/deleteRivalry.ts).** GM-only. Cascades by enumerating and deleting all messages + notes for the rivalry, then the rivalry itself. Single transaction or chunked transactions if >100 items (per UnitOfWork's 100-item flush).

9. **Build the messaging handlers** — `messages/postMessage.ts` and `messages/listMessages.ts`. `postMessage` accepts an optional `audience` field (defaults to the rivalry's `defaultMessageAudience`). It validates that `req.user.userId` is in the rivalry's allowed participant set (the two wrestlers + assigned GMs). On success, creates a `'rivalry_message'` notification for every other participant **filtered by audience** (a `'gm-only'` message only notifies the GMs and the author, not the opposing wrestler — matches the "Type your message to the GMs..." composer hint in the Stitch Messages mockup). `listMessages` is paginated; gated on the same membership check **and on per-message audience** — a wrestler should not see `'gm-only'` messages authored by the opposing wrestler.

10. **Build the notes handlers** — `notes/upsertNote.ts` and `notes/listNotes.ts`. `upsertNote` enforces: GMs can write any noteType and any visibility; wrestlers can only write `storyline` notes with visibility `'gm-only'` (suggestions to the GM). `listNotes` filters by caller role — wrestlers never see `gm-only` notes authored by other wrestlers, and never see `'plan'` notes unless explicitly published `'participants'`.

11. **Build [backend/functions/rivalries/handler.ts](backend/functions/rivalries/handler.ts).** Single-Lambda dispatcher mirroring [backend/functions/challenges/handler.ts:1-52](backend/functions/challenges/handler.ts). Maps each `event.routeKey` to its handler.

12. **Wire HTTP events in [backend/serverless.yml](backend/serverless.yml).** Mirror the challenges block. Public routes: `GET /rivalries`, `GET /rivalries/{id}` (read auth optional — guests can browse, but `messages` & `gm-only` notes are filtered server-side by absence of identity). Authenticated routes: `POST /rivalries`, `POST /rivalries/{id}/respond` (admin authorizer), `PUT /rivalries/{id}`, `DELETE /rivalries/{id}` (admin authorizer), `GET /rivalries/{id}/messages`, `POST /rivalries/{id}/messages`, `GET /rivalries/{id}/notes`, `POST /rivalries/{id}/notes`. Use the existing custom JWT authorizer for protected routes.

13. **Modify [backend/functions/matches/createMatch.ts](backend/functions/matches/createMatch.ts) and [backend/functions/matches/getMatches.ts](backend/functions/matches/getMatches.ts).** Persist optional `rivalryId` on the match record. Add `rivalryId` filter to `getMatches`. The match-by-participants client-filter pattern at [backend/functions/matches/getMatches.ts:59-63](backend/functions/matches/getMatches.ts#L59-L63) is the existing precedent — `rivalryId` should be a more efficient direct field comparison.

14. **Modify [backend/functions/promos/createPromo.ts](backend/functions/promos/createPromo.ts).** Persist optional `rivalryId` on the promo record so the rivalry hub can query promos by `rivalryId` directly (cheaper than reconstructing the set from `playerId` + `targetPlayerId` overlap with the rivalry pair).

15. **Add notification types in [backend/lib/notifications.ts](backend/lib/notifications.ts).** New types: `'rivalry_message'`, `'rivalry_request'`, `'rivalry_status_change'`. The existing `createNotification` helper is fine — just call it with these new types from the handlers.

16. **Write Vitest unit tests for every backend handler.** Mock `getRepositories` per the CLAUDE.md pattern. Cover: success cases, role rejections, validation failures (e.g. duplicate active rivalry), cascade-delete, transactional respond.

### Phase 3 — Frontend service layer & types

17. **Add `rivalriesApi` namespace to [frontend/src/services/api.ts](frontend/src/services/api.ts).** Mirror the structure of existing `challengesApi` and `promosApi` namespaces. Methods: `list({ status?, participantId?, seasonId?, page? })`, `get(rivalryId)`, `create(input)`, `respond(rivalryId, action, message?)`, `update(rivalryId, patch)`, `delete(rivalryId)`, `messages.list(rivalryId, { cursor? })`, `messages.post(rivalryId, content)`, `notes.list(rivalryId, { noteType? })`, `notes.upsert(rivalryId, note)`.

### Phase 4 — Frontend components (build inside-out: card → hub; tabs → detail)

18. **Build [frontend/src/components/rivalries/RivalryCard.tsx](frontend/src/components/rivalries/RivalryCard.tsx).** Pure presentational card; props are a `Rivalry` plus participant-resolved player avatars. Handle the heat meter (1-5 gold flames mapped from `'slow-burn' | 'brewing' | 'heated' | 'personal'`). Reuse the existing player avatar component from the challenges feature.

19. **Build [frontend/src/components/rivalries/RivalryHub.tsx](frontend/src/components/rivalries/RivalryHub.tsx).** **Three tabs** (Active / My Rivalries / **Legacy Archive** — the third tab surfaces `concluded` rivalries; pure UI filter, no schema impact). The hub is **scoped to the active Episode/Event** by default (matches the "EPISODE 01: GENESIS" framing in the Stitch hub mockup) — show an Event selector in the page header so users can switch episodes. Filter chip row (All / Heated / Brewing / Concluded / Personal), grid of cards, "Recent Activity" feed below. Use `rivalriesApi.list` with the appropriate filters.

20. **Build the six tab components in [frontend/src/components/rivalries/tabs/](frontend/src/components/rivalries/tabs/).** Each tab is independent and lazily fetches its own data when opened. Read tab from URL (`/rivalries/:rivalryId/:tab`) so deep-links work. Default tab is `overview`.

21. **Build [frontend/src/components/rivalries/RivalryDetail.tsx](frontend/src/components/rivalries/RivalryDetail.tsx).** Hero header (both wrestlers, vs divider, head-to-head record, status pill). Tab bar above the tab content area. Bottom-right floating "Message GM" button shortcuts to the Messages tab.

22. **Build [frontend/src/components/rivalries/RequestRivalry.tsx](frontend/src/components/rivalries/RequestRivalry.tsx).** Two-step form. Opponent picker should hit the existing players API for autocomplete. Submit calls `rivalriesApi.create` → on success navigates to the new rivalry's detail page.

23. **Build [frontend/src/components/admin/AdminRivalries.tsx](frontend/src/components/admin/AdminRivalries.tsx).** Mirror the table layout of [frontend/src/components/admin/AdminChallenges.tsx](frontend/src/components/admin/AdminChallenges.tsx). Approve / Reject / Conclude row actions; status filter chips; bulk-clear button (mirrors the [TO-DOS.md](TO-DOS.md) bulk-delete pattern at line 25).

24. **Wire routes in [frontend/src/App.tsx](frontend/src/App.tsx).** Register the new public + admin routes. Wrap public ones in `<FeatureRoute feature="rivalries">` so the feature can be flagged off if needed (existing pattern).

25. **Add nav entries in [frontend/src/config/navConfig.ts](frontend/src/config/navConfig.ts).** Add `rivalries` to the wrestler group (after `promos`, around line 70) and to the admin content group (around line 142).

26. **Add Dashboard surface in [frontend/src/components/Dashboard.tsx](frontend/src/components/Dashboard.tsx).** "My Active Rivalries" card for logged-in wrestlers — top 2-3 with deep-links.

### Phase 5 — Localization, docs, seed data

27. **Add the `rivalries.*` block to [frontend/src/i18n/locales/en.json](frontend/src/i18n/locales/en.json) and [frontend/src/i18n/locales/de.json](frontend/src/i18n/locales/de.json).** Mirror the depth/structure of the existing `challenges.*` block.

28. **Add the two wiki articles** under [frontend/public/wiki/](frontend/public/wiki/) — English + German — and append the entries to [frontend/public/wiki/index.json](frontend/public/wiki/index.json). Add corresponding `wiki.articles.rivalries` and `wiki.articles.adminRivalries` keys to both locale files.

29. **Update [backend/scripts/seed-data.ts](backend/scripts/seed-data.ts).** Seed 2-3 rivalries between existing seeded players, each with: 5-10 messages, 2-3 storyline notes, 1-2 GM plans, 2-3 tagged matches, 2-3 tagged promos. Use a mix of statuses (`active`, `concluded`, `pending`) for visual coverage.

### Phase 6 — Tests & verification

30. **Add component tests under [frontend/src/components/rivalries/__tests__/](frontend/src/components/rivalries/__tests__/).** Cover: RequestRivalry submission and validation, RivalryDetail tab routing, MessagesTab post + display, AdminRivalries approve/reject row actions.

31. **Run frontend + backend lint, typecheck, and test suites.** Resolve all errors before raising the PR.

## Dependencies & Order

Phase 1 must finish before Phase 2 (handlers depend on repositories + types). Phase 2 must finish before Phase 3 (frontend service layer talks to the deployed API shape). Phase 4 depends on Phase 3. Phases 5 and 6 can run in parallel with the tail of Phase 4.

**Critical hot path:** Step 2 (DynamoDB tables) → Step 3 (repositories) → Step 5 (createRivalry) → Step 11/12 (dispatcher + serverless events) → Step 17 (frontend api client) → Step 21 (RivalryDetail.tsx). Everything else is leaves off this trunk.

**Steps 13-15** (matches/promos/notifications additions) are non-blocking for the rivalry hub itself — the hub will just render empty match/promo lists until those are wired. Land them early in Phase 2 anyway so the hub demo is meaningful.

## Testing & Verification

**Manual (local with seed data + DynamoDB Local):**
- Wrestler A logs in → Dashboard shows "My Active Rivalries" card → click through to a seeded rivalry's detail → Overview tab populated, Match History shows seeded matches.
- Wrestler A clicks "Request a Rivalry" → completes both steps → submits → lands on new rivalry detail with status "pending".
- Admin logs in → `/admin/rivalries` shows the pending request → approves → wrestler A receives a notification → status flips to active → system message appears in Messages tab.
- Wrestler A posts a message in Messages tab → admin sees it on refresh → admin replies → wrestler A sees it on refresh.
- Admin schedules a match from the Future Matches tab → match is created with `rivalryId` → appears in both Future Matches tab and Match History after recording.
- Admin tags a promo with `rivalryId` from the promo composer → appears in the Promos tab.
- Switch language to German → all rivalry strings render translated.

**Automated:** `cd backend && npx vitest run` and `cd frontend && npx vitest run` must pass. TS strict checks on both halves must pass.

**Existing tests at risk:**
- `getMatches` tests — adding the `rivalryId` filter param needs new test cases and should not regress existing filter tests.
- `createMatch` tests — verify optional `rivalryId` accepts undefined and validates participant pairing.
- `createPromo` tests — verify optional `rivalryId` accepts undefined.
- Admin nav config tests (if any) — adding nav entries may shift index-based assertions.

**New tests to write:** Per Phase 6 — backend handler tests for every rivalry handler, component tests for the major frontend components.

## Risks & Edge Cases

- **First two-way messaging primitive.** The codebase has no precedent for a thread/conversation entity. The DynamoDB table shape (PK `rivalryId`, SK `createdAt`) is intentionally minimal. If we later need cross-rivalry inboxes ("show me all my unread messages across all rivalries"), we'll need a per-user GSI. Document this as deferred.

- **Notification volume.** Every rivalry message creates a notification per recipient. A chatty rivalry with 4 participants (2 wrestlers + 2 GMs) produces 3 notifications per message. Consider client-side debouncing on the recipient side, or batching multiple messages into a single "X new messages in Rivalry Y" notification on the server. Defer batching unless the firehose becomes a problem.

- **No real-time updates.** Per [CLAUDE.md "Known Limitations" #7](CLAUDE.md#known-limitations--todo) there's no WebSocket support — Messages tab will need a polling refresh (every 15-30s) or a manual "Refresh" button. Optimistic UI updates on send will mask the latency for the sender.

- **Cascade delete cost.** A long-running rivalry could accumulate hundreds of messages and dozens of notes. The cascade-delete in `deleteRivalry.ts` must chunk into 100-item transaction batches (the UnitOfWork's hard cap). Soft-delete (a `deletedAt` flag) is a safer alternative — choose this if the implementer is uncertain.

- **Rivalry uniqueness.** Two wrestlers can have at most one `active` or `pending` rivalry between them at a time. Enforce via a check in `createRivalry.ts` — the alternative is a DynamoDB conditional write with a synthesized unique key (`min(idA, idB)#max(idA, idB)#status`), which is more robust but more code. Start with the read-then-write check; tighten to conditional write later if concurrent creates become a real issue.

- **Notes visibility.** GM "plans" notes can spoil future storyline beats. Default visibility for `'plan'` notes must be `'gm-only'`. The notes list handler must enforce this server-side — never trust the client to filter.

- **Backwards compatibility for matches/promos.** Adding `rivalryId` as optional does not break existing data. Existing matches and promos with `rivalryId === undefined` must still render in their normal listings. No migration needed.

- **Auth on read.** The hub and detail are publicly browsable, but messages and `gm-only` notes are NOT. The handlers must filter by caller identity (or absence of identity) — do not rely on the frontend hiding these. Add explicit handler tests for the unauthenticated path.

- **GM assignment.** `assignedGMs` defaults to all admins/moderators. Allowing the requesting wrestler to "tag" a specific GM in the request form is a UX nicety — implement as a hint, not as exclusive routing. Any GM should still be able to act on any rivalry.

- **Stitch mockups.** All four screens rendered in Stitch project `projects/10219259134533090941`: Rivalries Hub (`screens/23c257203a23450c855d1b0348adba65`), Rivalry Detail (`screens/3e9ac9e3e3084994a0d597fe237f582a`), GM Messages (`screens/617995aa3b1b47b99127ce0262e4d0d7`), Request a Rivalry (`screens/f98b693dbcfc4d0e9689c2d9d1bcb9e0`). The visual design surfaced four schema/UX details that were folded back into this plan: (1) hub framed inside an Episode/Event scope, (2) third "Legacy Archive" tab on the hub, (3) "Loop in Opponent" toggle / per-message `audience` field with GM-only as the default, (4) GM Plans timeline entries deep-linking to specific Matches and Events, (5) "Recent Rivalry Activity" cross-source feed requiring a dedicated activity handler.
