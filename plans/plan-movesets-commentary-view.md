# Plan: Wrestler Bio & Movesets, Commentary View, Profile Setup Gate

## Context

Four related features that give commentators something to read from and make sure every wrestler has filled in the data they need:

1. **Bio + Signatures + Finishers on the wrestler profile** — every player gets a bio and up to 5 signatures and 5 finishers. Each move has the in-game move name and the name the player wants it called on commentary.
2. **Commentary View** — a public, broadcast-style page reachable from any event page. It shows the next uncompleted match on the card: participants, their sigs/fins, head-to-head record between them, and season + all-time records.
3. **Profile setup gate** — detect a logged-in wrestler who is still "Needs Wrestler" and/or has no signature or finisher, and prompt them to fix it.
4. **Booking picker: last booked + streak** — the slot/participant picker shows when each player was last booked and their current streak, and sorts the most recently booked players to the bottom so under-used wrestlers surface first.

### Stitch designs (project `League SZN — Movesets & Commentary View`, id `9179569574991024500`)

- **Profile setup modal** — `screens/7821bf73e36346b894ad67b67e2e5b3b`
- **Edit My Wrestler Profile** (bio + 5 sigs + 5 fins) — `screens/0dd4e7438977450f8b63b96d08929577`
- **Commentary View — Triple Threat** (3 full cards + 3×3 h2h grid) — `screens/147f53fc4edb4f3397c5c9af700dada2`
- **Commentary View — 6-Man** (6 compact cards, multi-man chips, 6×6 h2h grid) — `screens/cb6021ea97e14b2e8fa5c939373ae7db`
- **Booking picker — last booked + streak** — `screens/663468326e1d4e8384f1f73bd900ada1`

Stitch also added "OVR" badges, a stipulation box, and a "desk telemetry" sidebar to the commentary screens on its own — ignore those; they are not in scope.

Design system: dark, gold `#d4af37` primary, crimson `#dc2626` secondary, Barlow Condensed headings, Manrope body, 0px radius. Match the existing app CSS variables rather than copying Stitch's Tailwind output verbatim.

### Decisions made up front

- **Storage**: bio and moves live on the Players table as attributes (`bio`, `signatures[]`, `finishers[]`). No new table — the data is always read with the player and is tiny.
- **Move shape**: `{ gameName: string; customName: string }`. `customName` may be empty; when empty the UI displays `gameName`. Max 5 entries per list, enforced on both ends. Empty rows (both fields blank) are dropped on save so the stored array is always compact.
- **Commentary data**: one new backend endpoint `GET /events/{eventId}/commentary` returns everything the page needs in a single call (matches in card order, participant profiles with moves, season + all-time records, pairwise head-to-head). Computing this client-side would need N+1 requests and would duplicate the head-to-head logic already in `getStatistics.ts`.
- **Multi-man matches**: matches can have anywhere from 2 to 6 participants (singles, tag, triple threat, fatal four-way, 6-man / 6-way, 3-on-3). Every part of the Commentary View is built for N participants, not a pair: cards lay out in a responsive grid, head-to-head is the full pairwise set (up to 15 pairs for 6), and the card switches to a compact mode at 5+ so all wrestlers stay on one screen.
- **"Next match"**: the backend returns *all* matches on the card in order; the client defaults to the first match whose status is not `completed`/`cancelled` and offers Prev/Next so a commentator can look ahead or back. If every match is completed, default to the last one.
- **Setup gate**: extend the existing `ProfileCompletionModal` (already mounted in `App.tsx` and already probes `getMyProfile` on every authenticated load) rather than adding a second global modal. The modal collects the minimum inline (wrestler + one sig + one fin) and links to `/profile` for the rest. "Remind me later" snoozes per browser session via `sessionStorage`.
- **Wrestler entry in the modal**: mirror `WRESTLER_NAME_ENTRY_MODE` from `WrestlerProfile.tsx` — free-text input in `text` mode, the wrestler `<select>` in FK mode. Do not introduce a third entry path.

---

## Feature 1: Bio, Signatures, Finishers

### Backend types

Modify `backend/lib/repositories/types.ts`
- Add `export interface WrestlerMove { gameName: string; customName: string }`
- Add to `Player`: `bio?: string`, `signatures?: WrestlerMove[]`, `finishers?: WrestlerMove[]`

Modify `backend/lib/repositories/RosterRepository.ts`
- Add the same three optional fields to `PlayerPatch` (and `PlayerCreateInput` if it is a distinct type)

### Validation helper

Create `backend/lib/movesets.ts`
- `export const MAX_MOVES = 5`, `MAX_MOVE_NAME_LENGTH = 60`, `MAX_BIO_LENGTH = 500`
- `export function parseMoveList(value: unknown, field: string): { moves: WrestlerMove[] } | { error: string }`
  - must be an array of ≤ 5 objects, each with string `gameName`/`customName` ≤ 60 chars
  - trims both fields; drops entries where `gameName` is blank; `customName` is stored as-is (may be empty)
- `export function parseBio(value: unknown): { bio: string } | { error: string }` — string, trimmed, ≤ 500 chars; empty string clears the field
- `export function hasMoveset(player: Pick<Player, 'signatures' | 'finishers'>): boolean` — at least one signature AND at least one finisher with a non-blank `gameName`. Used by Feature 3 and by tests.

Create `backend/lib/__tests__/movesets.test.ts` — cover limits, trimming, blank-row dropping, non-array input.

### Handlers

Modify `backend/functions/players/updateMyProfile.ts`
- After the string-field loop, handle `bio`, `signatures`, `finishers` via the helper. `bio: ''` clears; `signatures: []` clears.

Modify `backend/functions/players/updatePlayer.ts` (admin) — same handling so admins can fix a player's moveset.

Read paths (`getPlayer`, `getPlayers`, `getMyProfile`) already return the whole item — verify nothing strips unknown fields. Add the fields to `backend/functions/players/__tests__/updateMyProfile.test.ts`.

### Frontend types + API

Modify `frontend/src/types/index.ts`
- Add `WrestlerMove` and the three optional fields on `Player`

Modify `frontend/src/services/api/profile.api.ts` — widen the `updateMyProfile` updates type with `bio?`, `signatures?`, `finishers?`.

Modify `frontend/src/services/api/players.api.ts` — same for the admin `update` call if its payload is typed explicitly.

### Shared editor component

Create `frontend/src/components/profile/MovesetEditor.tsx` + `MovesetEditor.css`
- Props: `label`, `helperText`, `value: WrestlerMove[]`, `onChange(moves: WrestlerMove[])`, `idPrefix`
- Always renders exactly 5 numbered rows (pad `value` with blanks); each row has two inputs: "In-game move name" and "What you call it" (placeholder: the game name once typed)
- `maxLength={60}` on inputs; a11y: `aria-label` per input, `<fieldset>`/`<legend>` for the group
- Unit test `frontend/src/components/profile/__tests__/MovesetEditor.test.tsx`: renders 5 rows, typing calls `onChange` with the padded array, rows beyond 5 never rendered

### Profile edit form

Modify `frontend/src/components/profile/WrestlerProfile.tsx`
- Add `bio`, `signatures`, `finishers` to `formData` (seeded from the profile)
- Insert, after the Alignment radio group and before Overalls: a "Bio" textarea (500 max, live counter using `t('profile.bio.counter', { count, max })`) then two `MovesetEditor`s ("Signature Moves", "Finishers")
- On save: compact the lists (drop rows with blank `gameName`) and send only if changed
- Read-only view (desktop `stats-section` area and the mobile "Details" card): show Bio, then "Signatures" and "Finishers" lists using `customName || gameName` in bold and `gameName` in muted text when they differ

### Public profile

Modify `frontend/src/components/profile/PublicProfile.tsx` + `.css`
- Add a "Bio" block under the header when present, and a two-column "Signatures / Finishers" section after the record cards. Same display rule as above. Extract the list rendering into `frontend/src/components/profile/MoveList.tsx` so the Commentary View reuses it.

### i18n

Modify `frontend/src/i18n/locales/en.json` and `de.json`
- `profile.bio.label`, `profile.bio.placeholder`, `profile.bio.counter`
- `profile.moves.signatures`, `profile.moves.finishers`, `profile.moves.gameName`, `profile.moves.customName`, `profile.moves.helperSignature`, `profile.moves.helperFinisher`, `profile.moves.inGame` ("in-game: {{name}}")

### Seed data

Modify the players seed module under `backend/functions/admin/` (see `seedData.ts` and its modular seed files) — give 3–4 seeded players a bio and a couple of sigs/fins so Commentary View has demo data; leave at least one seeded player with no moves so the setup gate is exercisable.

---

## Feature 2: Commentary View

### Backend — shared head-to-head helper

Create `backend/lib/headToHead.ts`
- Move the pure pair computation out of `backend/functions/statistics/getStatistics.ts` (`case 'head-to-head'`): `computeHeadToHead(completedMatches, player1Id, player2Id)` returning `{ player1Wins, player2Wins, draws, totalMatches, lastMatchDate?, lastMatchId?, lastWinnerId? }`
- Refactor `getStatistics.ts` to call it (behaviour unchanged; existing statistics tests must still pass)

### Backend — commentary endpoint

Create `backend/functions/events/getCommentary.ts` — `GET /events/{eventId}/commentary`, public
- Load the event; 404 if missing
- Resolve matches from `matchCards` in position order, `pre-show` designations first (same split `EventDetail.tsx` uses)
- Collect the distinct participant playerIds across the card (from `participants` and any filled `slots`); batch-load players
- Season record: if `event.seasonId` use it, else `seasons.findActive()`; read `SeasonStandings` for each participant (0-0-0 when absent)
- All-time record: `wins/losses/draws` from the player item
- Head-to-head: load completed matches once (`matches` repo, `status = 'completed'`), then for each match on the card compute **every unordered pair** of participants with `computeHeadToHead` (2 → 1 pair, 3 → 3, 4 → 6, 5 → 10, 6 → 15). Pairs are ordered by participant order so the client can map them into a grid deterministically.
- Also include a per-participant `multiManRecord` — `{ wins, losses, draws }` counting only completed matches with ≥ 3 participants — so the commentator can say "she's 4-1 in multi-man matches".
- Response shape (add to `frontend/src/types/event.ts` as `EventCommentary`):
  ```ts
  interface CommentaryParticipant {
    playerId: string; playerName: string; wrestlerName: string; imageUrl?: string;
    alignment?: 'face' | 'heel' | 'neutral'; divisionName?: string; bio?: string;
    signatures: WrestlerMove[]; finishers: WrestlerMove[];
    seasonRecord: { wins: number; losses: number; draws: number } | null;
    allTimeRecord: { wins: number; losses: number; draws: number };
    multiManRecord: { wins: number; losses: number; draws: number };
  }
  interface CommentaryMatch {
    matchId: string; position: number; designation: MatchDesignation; matchFormat: string;
    stipulationName?: string; isChampionship: boolean; championshipName?: string;
    status: MatchStatus; teams?: string[][]; participants: CommentaryParticipant[];
    headToHead: Array<{ player1Id: string; player2Id: string; player1Wins: number; player2Wins: number; draws: number; lastMatchDate?: string; lastWinnerId?: string }>;
  }
  interface EventCommentary {
    eventId: string; name: string; date: string; seasonName?: string;
    matches: CommentaryMatch[];
  }
  ```
- Uses `getRepositories()` only (repository pattern — no direct `lib/dynamodb` import)
- Test `backend/functions/events/__tests__/getCommentary.test.ts` with mocked repos: card ordering, pre-show first, season fallback to active season, pairwise h2h for a triple threat (3 pairs) and a 6-man (15 pairs, no duplicates or self-pairs), `multiManRecord` ignores singles results, `teams` passed through for 3-on-3, empty-slot matches skipped from participants but kept in the list

Modify `backend/functions/events/handler.ts` — add the route (no auth)
Modify `backend/serverless.yml` — add `GET events/{eventId}/commentary` under the events function

### Frontend — API + route

Modify `frontend/src/services/api/events.api.ts` — `getCommentary(eventId, signal?): Promise<EventCommentary>`
Modify `frontend/src/App.tsx` — `<Route path="/events/:eventId/commentary" element={<CommentaryView />} />` (public, next to the existing event routes)

### Frontend — components

Create `frontend/src/components/events/CommentaryView.tsx` + `CommentaryView.css`
- Loads commentary; picks the default match index = first with status not in `completed`/`cancelled`, else last
- Top bar: event name + date, "Match N of M · {designation} · {matchFormat} · {stipulation}", `UP NEXT` pill on the default match, `LIVE`/`COMPLETED` pill otherwise, Prev/Next buttons (disabled at ends), "Back to event" link to `/events/:eventId`
- Body: a grid of `CommentaryWrestlerCard`s sized by participant count:
  - 2 → two columns, full cards
  - 3 → three columns, full cards
  - 4 → 2×2, full cards
  - 5–6 → three columns × two rows, **compact** cards (`compact` prop: smaller portrait, name + record on one line, sigs/fins as a two-column list, bio truncated to 2 lines with a "more" toggle)
  - Mobile: always one column, full cards, with a sticky participant chip row at the top to jump between wrestlers
  - Tag / multi-team matches: group cards by `teams` (2-on-2, 3-on-3) with a "vs" divider between team groups; team groups get a shared coloured top rail so it's obvious who's together
- Below: `HeadToHeadStrip` — for 2 participants a single line "A 3 — 2 B · Last met {date} ({winner} won)"; for 3+ a **pairwise grid**: wrestlers as both rows and columns, each cell shows the row wrestler's record vs the column wrestler ("3–1", "—" on the diagonal, "0–0" for first meeting). 6 participants = 6×6 grid, which fits on desktop; on mobile render it as a scrollable list of pairs instead. Also show each participant's `multiManRecord` in a small row above the grid when the match has 3+ participants.
- Keyboard: ← / → change match

Create `frontend/src/components/events/CommentaryWrestlerCard.tsx`
- Portrait, wrestler name (display type), "played by {playerName}", alignment badge (reuse existing alignment badge styles from `PublicProfile.css`), division, Season / All-Time record blocks, Signatures + Finishers via `MoveList`, italic bio. Shows "No moves entered yet" when both lists are empty.

Create `frontend/src/components/events/HeadToHeadStrip.tsx`

Tests `frontend/src/components/events/__tests__/CommentaryView.test.tsx`: default match selection (skips completed), Prev/Next bounds, 3-participant view renders a 3×3 h2h grid, 6-participant view renders six compact cards and a 6×6 grid, 3-on-3 groups cards by team with a "vs" divider.

### Entry point

Modify `frontend/src/components/events/EventDetail.tsx` — add a "Commentary View" button next to the existing header actions (visible to everyone, not just admins), linking to `/events/:eventId/commentary`. Also add it to `EventCard.tsx` if the card already has an actions row; otherwise leave it on the detail page only.

### i18n

`events.commentary.title`, `.backToEvent`, `.upNext`, `.live`, `.completed`, `.prevMatch`, `.nextMatch`, `.matchOf` ("Match {{n}} of {{total}}"), `.playedBy`, `.seasonRecord`, `.allTime`, `.headToHead`, `.firstMeeting`, `.lastMet`, `.noMoves`, `.openCommentary` (button label on EventDetail)

---

## Feature 3: Profile Setup Gate

### Detection

Create `frontend/src/utils/profileSetup.ts`
- `getProfileSetupGaps(player: Player): { needsWrestler: boolean; needsSignature: boolean; needsFinisher: boolean }` using `isNeedsWrestler(player.currentWrestler)` and blank-`gameName`-aware list checks
- `hasSetupGaps(gaps)` convenience
- Unit test `frontend/src/utils/__tests__/profileSetup.test.ts`

### Modal

Modify `frontend/src/components/ProfileCompletionModal.tsx` + `.css`
- Extend `missingFields` to include `wrestler`, `signature`, `finisher`
- After the existing name/psnId check, run `getProfileSetupGaps`; show the modal if any gap exists
- Respect a `sessionStorage` key `profileSetup.snoozed` — skip the check when set (set by "Remind me later"); cleared on logout by the existing auth flow if it clears storage, otherwise it naturally expires with the tab
- Render, per the Stitch design, a checklist: each item shows a ✓ or ✗ status and only the *missing* items expand to inputs:
  - Wrestler: text input in `text` mode, or the wrestler select (reuse `wrestlerOptions.ts` helpers) in FK mode
  - Signature: one row of "In-game move name" + "What you call it"
  - Finisher: one row of the same
- Footer: "Save and continue" (primary), "Open full profile" link to `/profile`, "Remind me later"
- Save: builds an `updateMyProfile` payload with only the changed fields. Signature/finisher rows are sent as one-element arrays merged with any existing entries (never overwrite existing moves)
- Do not show the modal on `/profile`, `/login`, `/signup`, `/welcome` (use `useLocation`), so the full form isn't covered by the modal
- Existing name/psnId behaviour unchanged; a user missing both PSN and moves sees one modal with all items

Test `frontend/src/components/__tests__/ProfileCompletionModal.test.tsx` (extend or create): shows for Needs Wrestler, shows for missing finisher only, hidden when complete, hidden on `/profile`, snooze suppresses for the session, save payload contains only changed fields.

### Optional banner on Standings

`Standings.tsx` already shows a "Needs Wrestler" pill. No change needed; the modal covers the nudge.

### i18n

`profileModal.setupTitle`, `.setupSubtitle`, `.pickWrestler`, `.listedAsNeedsWrestler`, `.addSignature`, `.addFinisher`, `.saveAndContinue`, `.openFullProfile`, `.remindLater`

---

## Feature 4: Booking Picker — Last Booked & Streak

### What "last booked" means

The most recent `Match.date` across every non-cancelled match the player appears in (`participants`, or a filled `slots[].playerId`). Scheduled matches count — a player booked on next week's card is "recently booked" even though the match hasn't happened. Cancelled matches are ignored. Players with no matches at all are "Never booked" and sort to the very top.

### Backend — shared streak helper

Create `backend/lib/recentForm.ts`
- Move `computeRecentFormAndStreak` and `getResultForPlayer` out of `backend/functions/standings/getStandings.ts` unchanged; `getStandings.ts` imports them. Existing standings tests must still pass.

### Backend — booking summary endpoint

Create `backend/functions/players/getBookingSummary.ts` — `GET /players/booking-summary`, admin auth (same authorizer the slot-edit endpoints use; this is only consumed by booking screens)
- Loads all players (roster repo) and all matches with status `scheduled` or `completed` (matches repo; one scan, not per-player)
- For each player: `lastBookedAt` = max `date` over their matches, `lastBookedMatchId`, `lastBookedEventId?` (from the match if present), `currentStreak` via `computeRecentFormAndStreak` on the completed subset
- Response: `Record<string, PlayerBookingInfo>` keyed by playerId:
  ```ts
  interface PlayerBookingInfo {
    lastBookedAt: string | null;      // ISO date, null = never booked
    lastBookedMatchId?: string;
    lastBookedEventId?: string;
    currentStreak: { type: 'W' | 'L' | 'D'; count: number }; // count 0 = no streak
  }
  ```
- Test `backend/functions/players/__tests__/getBookingSummary.test.ts`: scheduled match counts as booked, cancelled ignored, slot-only booking counts, never-booked → null, streak matches standings output for the same fixture

Modify `backend/functions/players/handler.ts` + `backend/serverless.yml` — add the route (must be registered **before** `/players/{playerId}` so `booking-summary` isn't captured as an id — check how `players/me` is ordered and copy that)

### Frontend — API + types

Modify `frontend/src/types/index.ts` — add `PlayerBookingInfo`
Modify `frontend/src/services/api/players.api.ts` — `getBookingSummary(signal?): Promise<Record<string, PlayerBookingInfo>>`

### Frontend — picker

Modify `frontend/src/components/events/PlayerBookingPicker.tsx` + `.css`
- New optional prop `bookingInfoByPlayerId?: ReadonlyMap<string, PlayerBookingInfo>`
- Sorting inside each check-in bucket changes from name-only to: never booked first → oldest `lastBookedAt` first → most recent last → name as tiebreak. Check-in grouping stays the outer order (the recent change in #380/#382 must not regress).
- Each option row gains a right-aligned meta column:
  - "Never booked" (muted) or "Last booked {relative}" — use `dateUtils` if it has a relative formatter, else "Aug 29" style short date; `title` attr carries the full date
  - Streak chip when `count >= 2`: `W3` (green), `L2` (red), `D2` (grey). No chip for count 0/1 to keep rows quiet.
- Rows for players booked ≥ 14 days ago or never get a subtle "fresh" left rail so the eye lands on them first; keep it CSS-only
- The selected-player trigger text is unchanged
- Extend `frontend/src/components/events/__tests__/PlayerBookingPicker.test.tsx`: never-booked sorts above booked, most recent sorts last within a bucket, check-in grouping still wins over recency, streak chip only at count ≥ 2, no crash when `bookingInfoByPlayerId` is omitted

### Frontend — callers

Modify `frontend/src/components/events/EventDetail.tsx` and `frontend/src/components/admin/ScheduleMatch.tsx`
- Fetch `playersApi.getBookingSummary()` alongside the existing `playersApi.getAll()` (only when the user is admin — both screens already gate booking UI on admin), convert to a `Map`, pass to every `PlayerBookingPicker` (including the one inside `SlotEditDialog`, which receives it as a prop)
- Failure to load booking info must not block the picker — catch and pass `undefined`

### i18n

`events.booking.neverBooked`, `events.booking.lastBooked` ("Last booked {{when}}"), `events.booking.streak.W` ("W{{count}}"), `.L`, `.D`, `events.booking.streakTitle` ("On a {{count}}-match {{type}} streak")

---

## Execution waves

**Wave 1 (parallel, no dependencies)**
- A. Backend Feature 1: types, `movesets.ts` helper + tests, `updateMyProfile` / `updatePlayer` validation, seed data
- B. Backend Feature 2: `headToHead.ts` extraction + `getStatistics.ts` refactor, `getCommentary.ts` + tests, router + `serverless.yml`
- C. Frontend shared: `WrestlerMove` / `PlayerBookingInfo` types, `EventCommentary` types, `profile.api.ts` / `events.api.ts` / `players.api.ts` additions, `MovesetEditor` + `MoveList` + tests, `profileSetup.ts` util + tests, all i18n keys (en + de)
- G. Backend Feature 4: `recentForm.ts` extraction + `getStandings.ts` refactor, `getBookingSummary.ts` + tests, router + `serverless.yml` (touches `serverless.yml` like B — agents must append their own route blocks, not rewrite the file)

**Wave 2 (parallel, depends on Wave 1)**
- D. `WrestlerProfile.tsx` + `PublicProfile.tsx` edits (uses C)
- E. `CommentaryView`, `CommentaryWrestlerCard`, `HeadToHeadStrip`, route, EventDetail button + tests (uses B, C)
- F. `ProfileCompletionModal` extension + tests (uses A, C)
- H. `PlayerBookingPicker` sorting + meta column + tests, then wire `EventDetail` / `ScheduleMatch` / `SlotEditDialog` (uses C, G). H and E both edit `EventDetail.tsx` — H owns the data-loading block, E owns the header button; keep the edits disjoint.

**Wave 3 — verify**
- `cd frontend && npx tsc --project tsconfig.app.json --noEmit`
- `cd backend && npx tsc --project tsconfig.json --noEmit`
- `/verify` (lint + unit tests both sides)
- Manual: seed (make sure the seed includes at least one 6-man and one tag match on an upcoming event), open an event, click Commentary View, confirm next match + h2h grid for 2, 3, and 6 participants; open a slot picker as admin and confirm never-booked players are at the top, the most recently booked at the bottom, and streak chips appear for seeded players on a run; log in as a seeded player with no moves and confirm the modal; fill one sig/fin and confirm it clears

## Out of scope

- Editing another player's moves from the public profile
- Commentary View auto-advancing when results are recorded (manual Prev/Next only; can add polling later)
- Tag-team combined records in the head-to-head strip (pairwise singles records only)
- Matches with more than 6 participants (battle royals) — the grid still renders, but no compact layout tuning beyond 6
