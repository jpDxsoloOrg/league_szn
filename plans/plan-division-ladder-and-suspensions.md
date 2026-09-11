# Plan: Division ladder (auto promotion/demotion) and player suspensions

## Context

Two admin features:

1. **Division ladder.** Admins order divisions into a hierarchy (bottom = "jobber" tier, top = main event tier) and set streak thresholds. When a match result is recorded, a player on a 5-match win streak (default) moves up one division; a player on a 5-match loss streak (default) moves down one division. Nobody is demoted below the bottom division or promoted above the top one.
2. **Suspensions.** Admins search for a player (reusing the booking picker), suspend them until a date or for a number of shows, and reinstate them early. When an admin logs in and any suspension has been served, a modal offers one-click reinstatement. Suspended players still appear in the booking picker, flagged as suspended, and can still be booked.

### Findings that shape the design

- `Division` (`backend/lib/repositories/types.ts:1-7`) has no order/rank field; "Jobber" exists only as a division name in the wiki. We add `rank`.
- `Player` has no status/suspension field. Streaks are not persisted; they are computed from completed matches (`backend/lib/stats/recentFormAndStreak.ts` computes over the full history, `lib/recentForm.ts` caps at 5). We compute the ladder streak from completed matches dated after the player's last division change, so a promotion resets the count without a persisted counter that can drift when results are corrected.
- "Shows" for suspension purposes are `LeagueEvent`s with `status === 'completed'` (`leagueOps.events.listByStatus`). `Show` is a brand definition and has no status. Completion happens in `recordResult.ts` (`autoCompleteEvent`) and `events/updateEvent.ts`.
- Single-document admin config already lives in `SiteConfigRepository` (`getHeatTunables`/`updateHeatTunables`, handlers `functions/admin/getHeatConfig.ts` + `updateHeatConfig.ts`). We copy that pattern.
- `PlayerBookingPicker` (`frontend/src/components/events/PlayerBookingPicker.tsx`) is a searchable dropdown fed by `players: Player[]`, not a modal. We reuse it as the search control and open our own dialog on selection.
- Post-login modals are siblings in `AppLayout` (`frontend/src/App.tsx:133-134`): `AnnouncementModal` then `ProfileCompletionModal`, coordinated with `useAnnouncementOpen()` and a `sessionStorage` snooze key cleared on sign-out. We add a third one.
- `AdminLogin.tsx` is dead code. Real login goes through `AuthContext.handleSignIn`.
- Adding an admin tab touches `AdminPanel.tsx` (`AdminTab`, `VALID_TABS`, `tabContent`), `config/navConfig.ts` (`ADMIN_NAV_GROUPS`, `getAdminGroupForPath`), `AdminHub.tsx` (`HUB_GROUPS`, `HUB_ICON_SHAPES`), and `admin.panel.tabs.*` i18n keys.

## Data model changes

### Division (existing table, new field)

```ts
/** Position in the ladder. 0 = bottom (jobber tier). Higher = more prestigious. */
rank?: number;
```

Divisions without a rank are treated as unranked: sorted after ranked ones by `createdAt`, excluded from auto movement.

### Site config document `divisionLadder`

```ts
export interface DivisionLadderRules {
  enabled: boolean;          // default true
  promoteWinStreak: number;  // default 5, bounds 2..20
  demoteLossStreak: number;  // default 5, bounds 2..20
}
```

### Player (existing table, new fields)

```ts
/** ISO timestamp of the last division change (manual, transfer, or automatic). Ladder streaks count only matches after this. */
divisionChangedAt?: string;

suspension?: PlayerSuspension;

export interface PlayerSuspension {
  suspendedAt: string;          // ISO
  suspendedBy?: string;         // admin userId/email
  reason?: string;
  /** Exactly one of `until` / `showsRequired` is set. */
  until?: string;               // YYYY-MM-DD
  showsRequired?: number;       // completed events after suspendedAt
}
```

`suspension` absent = not suspended. Reinstating deletes the attribute (`REMOVE`) rather than writing a null.

### New table `DivisionMovements`

PK `playerId`, SK `movedAt`. Attributes: `movementId`, `fromDivisionId`, `toDivisionId`, `direction: 'promoted' | 'demoted' | 'manual'`, `trigger: 'streak' | 'admin' | 'transfer'`, `matchId?`, `streakCount?`. Used by the ladder admin screen ("recent movements") and the activity feed. Env var `DIVISION_MOVEMENTS_TABLE`, `TableNames.DIVISION_MOVEMENTS`.

## API changes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/admin/division-ladder` | Admin | `{ rules: DivisionLadderRules, divisions: Division[] (sorted by rank), recentMovements: DivisionMovement[] }` |
| PUT | `/admin/division-ladder` | Admin | Body `{ rules?: Partial<DivisionLadderRules>, order?: string[] }`. `order` is the full list of divisionIds bottom → top; server writes `rank` = index. |
| GET | `/players/suspensions` | Admin/Moderator | `SuspensionRow[]`: player summary + suspension + computed `showsServed`, `eligibleForReinstatement`, `eligibleReason` |
| POST | `/players/{playerId}/suspend` | Admin/Moderator | Body `{ until?: string, showsRequired?: number, reason?: string }` (exactly one of until/showsRequired). 409 if already suspended. |
| POST | `/players/{playerId}/reinstate` | Admin/Moderator | Removes `suspension`. 404 if not suspended. |

`PUT /divisions/{id}` also accepts `rank` (added to `patchFields`), and `GET /divisions` returns divisions sorted by rank.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/lib/repositories/types.ts` | Modify | Add `rank` to `Division`; add `divisionChangedAt`, `suspension`, `PlayerSuspension` to `Player`; add `DivisionMovement` |
| `backend/lib/repositories/SiteConfigRepository.ts` | Modify | Add `DivisionLadderRules`, `DEFAULT_DIVISION_LADDER_RULES`, `getDivisionLadderRules`, `updateDivisionLadderRules` |
| `backend/lib/repositories/dynamo/DynamoUserRepository.ts` | Modify | Implement the two ladder-rules methods on `SiteConfigDelegate` (configKey `divisionLadder`) |
| `backend/lib/repositories/inMemory/*` (site config, roster, leagueOps) | Modify | In-memory equivalents for tests |
| `backend/lib/repositories/LeagueOpsRepository.ts` | Modify | `DivisionCreateInput`/`DivisionPatch` gain `rank`; add `divisionMovements` repo (`create`, `listByPlayer`, `listRecent(limit)`) |
| `backend/lib/repositories/dynamo/DynamoLeagueOpsRepository.ts` | Modify | Dynamo impl for `divisionMovements` |
| `backend/lib/repositories/RosterRepository.ts` | Modify | `PlayerPatch` gains `divisionChangedAt`, `suspension`; add `players.clearSuspension(playerId)` (REMOVE attribute) |
| `backend/lib/repositories/dynamo/DynamoRosterRepository.ts` | Modify | Implement `clearSuspension` |
| `backend/lib/divisionLadder.ts` | Create | Pure helpers: `sortDivisionsByRank`, `getAdjacentDivision(divisions, currentId, direction)`, `computeLadderStreak(playerId, completedMatches, since)`, `evaluateLadderMove(...)` |
| `backend/lib/suspensions.ts` | Create | Pure helpers: `countShowsServed(events, suspendedAt)`, `isSuspensionServed(suspension, showsServed, today)`, `validateSuspensionInput` |
| `backend/functions/admin/getDivisionLadder.ts` | Create | GET handler |
| `backend/functions/admin/updateDivisionLadder.ts` | Create | PUT handler (rules bounds + reorder) |
| `backend/functions/admin/handler.ts` | Modify | Route the two ladder endpoints |
| `backend/functions/divisions/createDivision.ts`, `updateDivision.ts`, `getDivisions.ts` | Modify | Accept `rank`; sort output by rank |
| `backend/functions/players/suspendPlayer.ts` | Create | POST suspend |
| `backend/functions/players/reinstatePlayer.ts` | Create | POST reinstate |
| `backend/functions/players/getSuspensions.ts` | Create | GET list with eligibility |
| `backend/functions/players/handler.ts` | Modify | Route the three suspension endpoints |
| `backend/functions/players/updatePlayer.ts` | Modify | When `divisionId` changes, set `divisionChangedAt` and write a `manual` movement |
| `backend/functions/transfers/reviewTransferRequest.ts` | Modify | Same on approve (`trigger: 'transfer'`) |
| `backend/functions/matches/recordResult.ts` | Modify | After the core transaction, call `applyDivisionLadder(winners, losers, matchId)` |
| `backend/lib/notifications.ts` | Modify | Add `NotificationType` values `division_promoted`, `division_demoted`, `player_suspended`, `player_reinstated`; source type `division` / `suspension` |
| `backend/functions/activity/getActivity.ts` | Modify | Add `division_movement` items from `divisionMovements.listRecent` |
| `backend/serverless.yml` | Modify | New table `DivisionMovementsTable`, env var, IAM, five new http events |
| `backend/functions/admin/seedData.ts` | Modify | Seed ranks for the seeded divisions (Jobber=0, Midcard=1, Main Event=2) |
| `frontend/src/types/index.ts` | Modify | Mirror `Division.rank`, `Player.suspension`, `Player.divisionChangedAt`, `PlayerSuspension`, `DivisionLadderRules`, `DivisionMovement`, `SuspensionRow` |
| `frontend/src/services/api/admin.api.ts` (or new `divisionLadder.api.ts`) | Modify/Create | `divisionLadderApi.get()`, `.update({ rules?, order? })` |
| `frontend/src/services/api/players.api.ts` | Modify | `getSuspensions()`, `suspend(playerId, input)`, `reinstate(playerId)` |
| `frontend/src/components/admin/ManageDivisionLadder.tsx` + `.css` | Create | Admin screen: ordered list with move up/down buttons (bottom labelled "Jobber tier"), rules form, recent movements table |
| `frontend/src/components/admin/ManageSuspensions.tsx` + `.css` | Create | Admin screen: `PlayerBookingPicker` search + active suspensions table with "Reinstate" |
| `frontend/src/components/admin/SuspendPlayerDialog.tsx` + `.css` | Create | Dialog opened after picking a non-suspended player: date or # shows, reason |
| `frontend/src/components/admin/ReinstatePlayerDialog.tsx` | Create | Dialog opened after picking a suspended player: shows details, "Reinstate early" |
| `frontend/src/components/SuspensionReinstateModal.tsx` + `.css` | Create | Post-login modal listing served suspensions with per-row and "Reinstate all" buttons |
| `frontend/src/App.tsx` | Modify | Render `SuspensionReinstateModal` after `ProfileCompletionModal` |
| `frontend/src/contexts/AuthContext.tsx` | Modify | Clear the suspension-modal snooze key on sign-out (same as profile snooze) |
| `frontend/src/components/events/PlayerBookingPicker.tsx` + `.css` | Modify | Render a "Suspended" chip (with tooltip: until date / shows remaining) when `player.suspension` is set; row stays selectable |
| `frontend/src/components/admin/AdminPanel.tsx` | Modify | Tabs `divisionLadder`, `suspensions` |
| `frontend/src/config/navConfig.ts` | Modify | Nav items under `rosterSeasons` (ladder) and `rosterSeasons` (suspensions); `getAdminGroupForPath` |
| `frontend/src/components/admin/AdminHub.tsx` | Modify | Hub items + icons |
| `frontend/src/components/admin/ManageDivisions.tsx` | Modify | Show rank badge and a link to the ladder screen; sort by rank |
| `frontend/src/i18n/locales/en.json`, `de.json` | Modify | All new strings (`admin.divisionLadder.*`, `admin.suspensions.*`, `events.booking.suspended*`, `admin.panel.tabs.*`, `notifications.*`) |
| `frontend/public/wiki/admin-divisions.md` (+ `de/`) | Modify | Document ladder and suspensions |
| `backend/functions/admin/__tests__/divisionLadder.test.ts` | Create | Handler tests (in-memory repos) |
| `backend/lib/__tests__/divisionLadder.test.ts` | Create | Pure helper tests |
| `backend/lib/__tests__/suspensions.test.ts` | Create | Pure helper tests |
| `backend/functions/players/__tests__/suspensions.test.ts` | Create | suspend/reinstate/getSuspensions handler tests |
| `backend/functions/matches/__tests__/recordResult.ladder.test.ts` | Create | End-to-end: 5th straight win promotes, 5th loss demotes, bottom/top clamps, streak resets after move |
| `frontend/src/components/admin/__tests__/ManageDivisionLadder.test.tsx` | Create | Reorder + rules save |
| `frontend/src/components/admin/__tests__/ManageSuspensions.test.tsx` | Create | Pick → suspend dialog; pick suspended → reinstate dialog |
| `frontend/src/components/__tests__/SuspensionReinstateModal.test.tsx` | Create | Shows only eligible rows; one-click reinstate; snooze |
| `frontend/src/components/events/__tests__/PlayerBookingPicker.test.tsx` | Modify | Suspended chip rendered, row still selectable |

## Implementation Steps

### Step 1: Backend types, repositories, and site config

1. `types.ts`: add fields listed under "Data model changes". Add `DivisionMovement` interface.
2. `SiteConfigRepository.ts`: add `DivisionLadderRules`, `DEFAULT_DIVISION_LADDER_RULES = { enabled: true, promoteWinStreak: 5, demoteLossStreak: 5 }`, and `getDivisionLadderRules()` / `updateDivisionLadderRules(patch)`. Implement in `SiteConfigDelegate` (`DynamoUserRepository.ts`) with configKey `divisionLadder`, merge-with-defaults on read, exactly like heat tunables. Add the in-memory implementation.
3. `LeagueOpsRepository.ts`: `DivisionCreateInput.rank?`, `DivisionPatch.rank?`; new `DivisionMovementsRepository { create(input): Promise<DivisionMovement>; listByPlayer(playerId): Promise<DivisionMovement[]>; listRecent(limit: number): Promise<DivisionMovement[]> }` exposed as `leagueOps.divisionMovements`. Dynamo impl uses `DIVISION_MOVEMENTS_TABLE` (query by playerId; `listRecent` scans and sorts by `movedAt` desc — table is small). In-memory impl for tests.
4. `RosterRepository.ts`: `PlayerPatch` gains `divisionChangedAt?: string` and `suspension?: PlayerSuspension`; add `players.clearSuspension(playerId): Promise<void>` implemented with an `UpdateExpression: 'REMOVE suspension SET updatedAt = :now'`. In-memory impl deletes the key.
5. `serverless.yml`: `DivisionMovementsTable` (HASH `playerId`, RANGE `movedAt`, PAY_PER_REQUEST), env var `DIVISION_MOVEMENTS_TABLE`, IAM statement, and `TableNames.DIVISION_MOVEMENTS` in `lib/dynamodb.ts`.
6. `seedData.ts`: give the three seeded divisions ranks 0/1/2.

### Step 2: Ladder pure helpers and tests

Create `backend/lib/divisionLadder.ts`:

- `sortDivisionsByRank(divisions)`: ranked first ascending by `rank`, then unranked by `createdAt`.
- `getAdjacentDivision(divisions, currentDivisionId, 'up' | 'down')`: returns the neighbouring ranked division or `null` when at the top/bottom or when the current division is unranked.
- `computeLadderStreak(playerId, completedMatches, since?)`: filter matches where the player participated, `status === 'completed'`, and `date > since` (when `since` is set); sort by date desc; walk from the newest match counting consecutive results of the same type. Reuse `lib/stats/recentFormAndStreak.ts` result mapping (win if in `winners`, loss if in `losers`, otherwise draw). Return `{ type, count }`.
- `evaluateLadderMove({ player, streak, rules, divisions })`: returns `{ direction: 'promoted' | 'demoted', toDivisionId } | null`. Rules: `rules.enabled`; player has a ranked `divisionId`; `W` streak `>= promoteWinStreak` → up if a higher division exists; `L` streak `>= demoteLossStreak` → down if a lower division exists; draws never move.

Tests in `backend/lib/__tests__/divisionLadder.test.ts` cover: exact threshold, streak below threshold, bottom division loss streak (no move), top division win streak (no move), unranked division (no move), `since` cut-off ignoring pre-move matches, disabled rules.

### Step 3: Suspension pure helpers and tests

Create `backend/lib/suspensions.ts`:

- `validateSuspensionInput(body)`: exactly one of `until` (valid `YYYY-MM-DD`, not in the past) or `showsRequired` (integer 1..52); `reason` optional string ≤ 500 chars. Returns `{ ok: true, value } | { ok: false, message }`.
- `countShowsServed(events, suspendedAt)`: count `LeagueEvent`s with `status === 'completed'` and `date > suspendedAt` (compare on ISO date; anchor bare dates at UTC noon as `bookingRecency.ts` does).
- `isSuspensionServed(suspension, showsServed, todayIsoDate)`: `until <= today` or `showsServed >= showsRequired`.
- `buildSuspensionRow(player, events, today)`: `{ playerId, name, currentWrestler, imageUrl, divisionId, suspension, showsServed, showsRemaining, eligibleForReinstatement, eligibleReason: 'date' | 'shows' | null }`.

Tests in `backend/lib/__tests__/suspensions.test.ts`.

### Step 4: Ladder admin handlers

- `functions/admin/getDivisionLadder.ts`: `requireRole(event, 'Admin')`; returns `{ rules, divisions: sortDivisionsByRank(all), recentMovements: listRecent(20) }`.
- `functions/admin/updateDivisionLadder.ts`: `requireRole(event, 'Admin')`; `parseBody`; validate `rules` with a `FIELD_BOUNDS` map like `updateHeatConfig.ts` (`promoteWinStreak` and `demoteLossStreak` 2..20, `enabled` boolean); if `order` present, verify it is a permutation of existing divisionIds (400 otherwise), then `leagueOps.divisions.update(id, { rank: index })` for each. Respond with the same shape as GET.
- Wire both in `functions/admin/handler.ts` and `serverless.yml` under the `admin` function with `authorizer: adminAuthorizer`.
- `divisions/createDivision.ts`: `optionalFields` add `rank`; `updateDivision.ts`: `patchFields` add `rank`; `getDivisions.ts`: sort with `sortDivisionsByRank`.
- Tests in `functions/admin/__tests__/divisionLadder.test.ts` (in-memory repos, `makeEvent` factory as in `divisionsModify.test.ts`).

### Step 5: Apply the ladder on match results and manual moves

- Create `applyDivisionLadder({ matchId, winners, losers })` in `backend/lib/divisionLadder.ts` (or a sibling `applyDivisionLadder.ts` so the pure module stays IO-free). It loads rules, ranked divisions, and `matches.listCompleted()` once, then for every distinct player in winners+losers: load the player, compute the streak since `divisionChangedAt`, evaluate, and on a move: `roster.players.update(playerId, { divisionId, divisionChangedAt: now })`, `divisionMovements.create({...trigger: 'streak', matchId, streakCount})`, and `createNotification` to the player's `userId` (`division_promoted` / `division_demoted`). Wrap in try/catch and log so a ladder failure never fails result recording.
- `recordResult.ts`: call it after the core transaction and before `autoCompleteEvent`. Skip when the match is a draw (no winners).
- `players/updatePlayer.ts`: when the resolved `divisionId` differs from the current value, also set `divisionChangedAt` and write a movement with `direction: 'manual'`, `trigger: 'admin'`.
- `transfers/reviewTransferRequest.ts`: on approve, set `divisionChangedAt` and write a movement with `trigger: 'transfer'`.
- `activity/getActivity.ts`: add `'division_movement'` to `ActivityItemType`, map recent movements to items ("X was promoted to Main Event after a 5-match win streak").
- Tests `recordResult.ladder.test.ts`: seed three ranked divisions and matches, record the 5th straight win → player moves up and a movement row exists; 5th straight loss in bottom division → no move; after a promotion the 6th win does not move again; rules disabled → no move.

### Step 6: Suspension handlers

- `players/suspendPlayer.ts`: `requireRole(event, 'Admin', 'Moderator')`; 404 if player missing; 409 if `player.suspension` set; validate input; write `suspension` with `suspendedAt = now`, `suspendedBy` from the authorizer context; notify the player's user (`player_suspended`); return the updated player.
- `players/reinstatePlayer.ts`: 404 if not suspended; `players.clearSuspension`; notify (`player_reinstated`); return updated player.
- `players/getSuspensions.ts`: staff only; load all players with `suspension`, `events.listByStatus('completed')`, build rows via `buildSuspensionRow`; sort eligible first, then by `suspendedAt`.
- Route in `players/handler.ts` (`/players/suspensions` must be matched before `/players/{playerId}`), and add the three http events to `serverless.yml` with `authorizer: adminAuthorizer`.
- Tests in `functions/players/__tests__/suspensions.test.ts`.

### Step 7: Frontend types and API clients

- `types/index.ts`: mirror the backend types (`Division.rank`, `Player.suspension`, `Player.divisionChangedAt`, `PlayerSuspension`, `DivisionLadderRules`, `DivisionMovement`, `SuspensionRow`, `DivisionLadderResponse`).
- `services/api/divisionLadder.api.ts` (export from `services/api/index.ts`): `get(signal)`, `update({ rules?, order? })`.
- `players.api.ts`: `getSuspensions(signal)`, `suspend(playerId, { until?, showsRequired?, reason? })`, `reinstate(playerId)`.
- i18n: add every key used by Steps 8–11 to `en.json` and `de.json` in the same commit so tests can render.

### Step 8: Division ladder admin screen

`ManageDivisionLadder.tsx` at `/admin/division-ladder`:

- Loads `divisionLadderApi.get()`. Renders the ladder top-to-bottom as a vertical list with ▲/▼ buttons per row (no drag library). The bottom row carries a "Jobber tier — nobody is demoted below this" caption; the top row "Top tier — nobody is promoted above this". Unranked divisions render in a separate "Not in ladder" list with an "Add to ladder" button that appends them at the bottom.
- Rules card: `enabled` toggle, `promoteWinStreak` and `demoteLossStreak` number inputs (2..20) with helper text ("Win N in a row → move up one division").
- Single "Save" sends `{ rules, order }`; shows success/error banners consistent with `ManageDivisions.tsx`.
- "Recent movements" table: date, player, from → to, direction badge, trigger.
- Register the tab: `AdminPanel.tsx` (`'divisionLadder'`), `navConfig.ts` (under `rosterSeasons`, next to Divisions), `AdminHub.tsx` item + icon, `admin.panel.tabs.divisionLadder`.
- `ManageDivisions.tsx`: sort by rank, show a small rank badge, add a link to the ladder screen. Keep the rest untouched.
- Test: reorder via buttons produces the expected `order` payload; rules validation blocks out-of-range values.

### Step 9: Suspensions admin screen and dialogs

`ManageSuspensions.tsx` at `/admin/suspensions`:

- Loads `playersApi.getAll()`, `playersApi.getBookingSummary().catch(() => undefined)`, and `playersApi.getSuspensions()`.
- Search control: `<PlayerBookingPicker mode="single" players={players} value="" onChange={handlePick} bookingInfoByPlayerId={bookingInfo} placeholder={t('admin.suspensions.searchPlaceholder')} />`. The picker is uncontrolled here: after `handlePick` the value stays `''` so the same control can be reused for the next search.
- `handlePick(playerId)`: if the player has `suspension` → open `ReinstatePlayerDialog`; otherwise open `SuspendPlayerDialog`.
- `SuspendPlayerDialog`: player header (image, wrestler, name), radio "Until date" (date input, min = tomorrow) or "Number of shows" (number input 1..52), optional reason textarea, Cancel / Suspend. On success, refresh the list and show a banner.
- `ReinstatePlayerDialog`: shows suspended date, condition, shows served / remaining, eligibility badge, and a "Reinstate now" button (label "Reinstate early" when not yet eligible). On success refresh.
- "Current suspensions" table below the search: player, since, condition, progress (`2 / 4 shows` or `until Sep 30`), eligibility badge, "Reinstate" button that opens the same reinstate dialog.
- Register the tab (`'suspensions'`) in `AdminPanel.tsx`, `navConfig.ts` (under `rosterSeasons`), `AdminHub.tsx`, i18n.
- Use the existing `ui/` dialog primitives if present (check `frontend/src/components/ui/`); otherwise follow `SlotEditDialog.tsx` for modal structure and focus handling.
- Tests: picking a non-suspended player opens the suspend dialog and submits `{ showsRequired: 3 }`; picking a suspended player opens the reinstate dialog and calls `reinstate`.

### Step 10: Post-login reinstatement modal

`SuspensionReinstateModal.tsx`, rendered in `AppLayout` right after `ProfileCompletionModal`:

- Gate: `isAuthenticated && !isLoading && isAdminOrModerator`, `!useAnnouncementOpen()`, path not in `isProfileSetupExcludedPath`, and not snoozed (`sessionStorage['suspension_reinstate_snooze']`). Also wait until the profile modal is not showing: expose a small `useProfileSetupOpen` hook mirroring `useAnnouncementOpen`, or check the profile snooze key; pick whichever is smaller in the code and note it in the PR.
- Fetch `playersApi.getSuspensions()`, keep rows with `eligibleForReinstatement`. Render nothing when empty.
- Content: title "Suspensions served", one row per player with condition met ("Date passed Sep 8" / "4 of 4 shows served") and a "Reinstate" button; a "Reinstate all" button; "Remind me later" sets the snooze key. Each reinstate calls `playersApi.reinstate` and removes the row; the modal closes when the list empties.
- `AuthContext.handleSignOut`: clear the snooze key alongside the profile snooze key, so the modal shows again on the next login.
- Test: renders only eligible rows; clicking Reinstate calls the API and removes the row; snooze hides the modal.

### Step 11: Booking picker suspended indicator

`PlayerBookingPicker.tsx`:

- When `player.suspension` is set, render a `booking-picker-suspended` chip ("Suspended") after the name, with a `title` built by a new `formatSuspensionTooltip(suspension)` helper in `utils/suspensions.ts` ("Suspended until Sep 30" / "Suspended for 3 shows since Sep 10").
- Do not change bookability: the row stays in its check-in bucket and remains selectable in both modes. Add a `booking-picker-option--suspended` modifier (muted text, red rail) in the CSS.
- `ScheduleMatch.tsx` and `EventDetail.tsx` need no changes because `Player` objects already carry `suspension`.
- i18n `events.booking.suspended`, `events.booking.suspendedUntil`, `events.booking.suspendedShows`.
- Extend `PlayerBookingPicker.test.tsx`: chip is rendered for a suspended player, and selecting that row still fires `onChange`.

### Step 12: Docs

- `frontend/public/wiki/admin-divisions.md` and `wiki/de/admin-divisions.md`: add "Division ladder" and "Suspensions" sections.
- `CLAUDE.md`: add the new endpoints to the Admin API list and a short "Division ladder tunables" note under the heat tunables section.

## Dependencies & Order

- **Suggested order**: `Steps 1+2+3 -> Steps 4+5+6+7 -> Steps 8+9+10+11 -> Step 12`
- Step 1 must land before 4/5/6 (repos and types). Steps 2 and 3 are pure modules with no repo dependency and can run alongside Step 1.
- Step 7 depends only on the API shapes above, so it can run in wave 2; Steps 8–11 depend on 7.
- Agent types: backend steps `general-purpose`; pure helper + test steps (2, 3) `general-purpose`; frontend steps `general-purpose`; Step 12 `general-purpose` with model `haiku`.
- Each wave-2 backend agent must avoid editing `serverless.yml` and `handler.ts` routers concurrently: Step 4 owns `admin/handler.ts`, Step 6 owns `players/handler.ts`, Step 1 owns the `serverless.yml` table/env changes and pre-adds the five http events so Steps 4 and 6 do not touch `serverless.yml`.

## Testing & Verification

1. `cd backend && npx tsc --project tsconfig.json --noEmit && npm test`
2. `cd frontend && npx tsc --project tsconfig.app.json --noEmit && npm test`
3. Local walkthrough with `npm run seed`: order divisions Jobber → Midcard → Main Event in the ladder screen; record five straight wins for a Midcard player and confirm they appear in Main Event with a movement row and a notification; record five straight losses for a Jobber player and confirm no movement.
4. Suspend a player for 2 shows; complete two events; log out and back in as admin; confirm the reinstatement modal lists them and one click clears the suspension.
5. Suspend a player until a past-proof date (tomorrow), then set the machine clock or use a date-based row to confirm date eligibility; confirm "Reinstate early" works before eligibility.
6. Open Schedule Match and the event slot editor: the suspended player shows the chip and can still be booked.

## Risks & Edge Cases

1. **Streak history vs. `divisionChangedAt` for existing players.** Players who have never been moved have no cut-off, so a player already on a long streak is moved on the next result. Acceptable, and the rules `enabled` toggle lets admins opt in after ordering divisions.
2. **Result corrections.** Because the streak is computed from match history, editing or deleting a result changes the streak but does not undo an earlier movement. Movements are logged, so admins can revert manually from Manage Players.
3. **Tag/multi-man matches.** Every listed winner counts as a win and every loser as a loss, matching how `incrementPlayerRecord` already treats them.
4. **Multiple players moving on one match.** Each is evaluated independently; a promotion and a demotion can happen in the same call.
5. **Only one ranked division.** `getAdjacentDivision` returns null both ways, so nothing moves.
6. **Show counting scope.** All completed events count, regardless of brand (`showId`). If per-brand suspensions are wanted later, add `showId` to `PlayerSuspension` and filter in `countShowsServed`.
7. **Time zones for `until`.** Compare bare `YYYY-MM-DD` values as dates anchored at UTC noon (existing convention in `bookingRecency.ts`), and compute "today" on the server in UTC so eligibility is consistent between the list endpoint and the modal.
8. **Route precedence.** `/players/suspensions` must be registered before `/players/{playerId}` in both the router and API Gateway; API Gateway resolves literal paths over `{param}` paths, but the in-process router needs the explicit order.
9. **Modal stacking.** Three post-login modals now exist; the reinstatement modal must defer to announcements and profile setup so admins never see two dialogs at once.
10. **Ladder rank drift.** Deleting a ranked division leaves a gap in `rank` values; `sortDivisionsByRank` only relies on relative order, and the PUT with `order` renumbers on the next save.
