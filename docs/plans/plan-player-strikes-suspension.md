# Plan: player strikes, suspension and deactivation

Branch `feat/player-strikes` (worktree `league_szn-strikes`), based on `feat/site-redesign` at `0c3f823`. All paths are repo-relative.

## 1. The request

> i'd like a feature admins can use in order to suspend wrestlers. Maybe the gm gives a player a strike. First strike is a warning and remains on the account for a week. If they get a 2nd strike it refreshes the cooldown to 14 days and prevents them from signing up for 1 week. If during that last week of the cooldown they get a third strike their account is deactivated (this should be reverseable by an admin but they should not be able to login / sign up for shows / appear in standings etc.

## 2. Design in brief

- **All state lives on the Player row.** No new table, no new resource type, no new IAM action, no change to the Cognito pool or to how its triggers are attached. Only the `preSignUp` handler's code changes (§7.1).
- **Windows are computed at read time** from strike timestamps by one pure function. There is no sweep job, so a block cannot outlive its date and nothing competes for the account's 10-slot Lambda concurrency. The one stored flag is `deactivatedAt`, because deactivation ends only by admin action, not by date.
- **Deactivation is a flag, never a soft delete.** `softDeletePatch` wipes the account link and wrestler and cannot be undone. The row stays readable through `players.list()` and `findById`, so history, `recordResult` and wrestler assignment keep working.
- **Hiding comes from widening `isPlayerVisible`.** About 30 read paths then hide the player with no edit.
- **Login is cut off in two layers.** Cognito disable blocks new logins and refreshes. A Player-row check wherever a token is accepted (`authenticate` and router `dispatch`) stops tokens already issued, which otherwise work for up to 24 hours.
- **No feature flag.** Switching off a flag must never lift a suspension, and there is nothing to phase in.
- **No new admin tab.** Everything hangs off Manage Players, which reaches every player, including the 3 on prod with no linked account.

## 3. Rules

Durations are exact 24-hour multiples added to a UTC instant, so there are no calendar or daylight-saving effects. A "day" means 24 hours from the exact strike time, and members are told so (§10). `T1` is the strike that started a warning. `T2` is the **latest** strike of a run of two or more. A window ends at its boundary: at exactly `T + 7d` the time has passed. Elsewhere in this plan, "strike 3" and "third strike" mean the strike that deactivates.

### States

| State (`status`) | Active strikes | Lasts until | Can sign up | Can log in | In standings and rosters |
|---|---|---|---|---|---|
| `clear` | 0 | | Yes | Yes | Yes |
| `warned` | 1 | `T1 + 7d` | Yes | Yes | Yes |
| `signup-blocked` | 2 or more | `T2 + 7d`, then `cooldown` | **No** | Yes | Yes |
| `cooldown` | 2 or more | `T2 + 14d` | Yes | Yes | Yes |
| `deactivated` | 3 or more | An Admin reactivates | **No** | **No** | **No** |

A third strike deactivates at any point in the 14 days, in `signup-blocked` or `cooldown` (owner decision 2, answered).

### Transitions

| From | Event | To | Effect |
|---|---|---|---|
| `clear` | Strike | `warned` | 7-day cooldown from now. Notify. |
| `warned` | 7 days pass | `clear` | Count returns to 0. No write, no notification. |
| `warned` | Strike | `signup-blocked` | Cooldown refreshes to 14 days from this strike. 7-day block starts. Clear soft holds. Notify. |
| `signup-blocked` | 7 days pass | `cooldown` | No write. |
| `cooldown` | 7 more days pass | `clear` | Count returns to 0. No write. |
| `signup-blocked` | Strike | `deactivated` | Set `deactivatedAt`. Disable Cognito user. Clear soft holds. |
| `cooldown` | Strike | `deactivated` | Set `deactivatedAt`. Disable Cognito user. Clear soft holds. |
| `deactivated` | Strike | refused | 409 `ALREADY_DEACTIVATED` |
| `deactivated` | Admin reactivates | `clear` | Active strikes cleared, history kept, Cognito user enabled unless it was already disabled. Notify. |
| `deactivated` | Admin reactivates with "restore earlier strikes" | Recomputed | Only the deactivating strike is cleared. Replay of the rest decides the state from their own dates, and `clear` if those windows have passed. Cognito as above. Notify. |
| `warned`, `signup-blocked`, `cooldown` | Admin removes an active strike | Recomputed | Replay of the remaining strikes. Notify. |
| Any state but `deactivated` | Admin removes a strike that is cleared or has lapsed | refused | 409 `STRIKE_NOT_ACTIVE`. It has no effect on the account, so there is nothing to remove. |
| `deactivated` | Admin removes a strike | refused | 409 `PLAYER_DEACTIVATED`. Reactivate instead. |

Removal examples, which all fall out of the replay:
- Remove the only strike: `clear`.
- Remove strike 1 of 2: strike 2 becomes a first strike, so it is a 7-day warning from its own date and the block ends.
- Remove strike 2 of 2: strike 1 resumes its own 7 days from its own date, or `clear` if that has passed.

Removing a strike does not restore soft holds it cleared.

## 4. Decisions for the owner

Decision 2 needs the owner's answer before Stream A starts. The rest proceed on these defaults. Each can change without redesign.

| # | Question | Default | Why, or what the alternative costs |
|---|---|---|---|
| 1 | When do strikes stop counting? | Only while the cooldown runs. Its end clears the count, so a later strike is a fresh first strike. | Follows "remains on the account for a week". |
| 2 | **Answered by the owner.** Does a third strike in the first week of the 14 days deactivate? | **Yes.** A third strike at any point in the 14 days deactivates. It is unlikely in the first week, because the player is blocked then. `DEACTIVATION_WINDOW_START_DAYS` is 0. | Doing nothing on a first-week strike would be surprising. |
| 3 | What does reactivating do to strikes? | Clears active strikes, keeps history, player returns to `clear`. For a mistaken third strike, the Admin ticks "restore earlier strikes": only the third strike is cleared and the others keep their own dates. | Re-issuing would restart the windows from today and send new notifications, so restoring is the correction path. |
| 4 | Can a strike be removed? | Yes, by an Admin, with a reason. Not while deactivated. | Corrects mistakes. Kept in history as cleared. |
| 5 | Is a reason required? | Yes, 3 to 500 characters, for strike, removal and reactivation. The player sees the strike reason. | Admins should word reasons knowing that. |
| 6 | **Titles** held by a deactivated player | **Kept. Deactivation is not blocked and nothing is vacated.** The deactivation dialog lists the titles and links to Manage Championships. | Vacating cannot be undone (a new reign starts at 0 defenses) and on a tag title it also strips the innocent partner. A blocked strike would stop discipline over a title. Cost: a deactivated champion stays listed until staff vacate. |
| 7 | **Existing bookings** | **Kept at both strike 2 and strike 3. Only soft holds are cleared** (queue, presence, pending invitations, pending and countered challenges). Strike 3 lists scheduled and open matches, accepted challenges and unfinished tournaments for staff to handle with existing tools. | Automatic vacating would need new guarded logic for slots, could not cover legacy matches, title matches or tournaments, and could not be undone on reactivation. Cost: staff must act on the list. Results can still be recorded. |
| 8 | Who issues strikes? | Admin only. Moderators can read status, so they can book correctly. | The app has no GM role. If "GM" means Moderator, change `ADMIN_ONLY` to `STAFF` on three routes. |
| 9 | Can staff be struck? | No. 409 `STAFF_PROTECTED` for a linked account in the Admin or Moderator group. Remove the role first. | All 10 staff accounts on prod hold player rows, and there is no last-admin guard. This one rule also stops an Admin striking themselves and locking out the last Admin. |
| 10 | What does "signing up" cover? | Check-in as available or tentative, claiming a slot, and matchmaking, challenges and call-out promos, all of which lead to a match. | Narrowing it to shows only means removing the gates in §7.2 rows 3 to 9. |
| 11 | Can staff book a sign-up-blocked player? | Yes, with a warning in the UI. Never a deactivated one, except inside a tournament they already entered (decision 20). | Staff own the card. |
| 12 | Does the block stop tag team and faction actions? | No. Forming a team is not signing up. | |
| 13 | Does the block go by action date or event date? | Action date. Checking in on day 8 for any show is allowed. | Simplest. |
| 14 | Delay after deactivation | None beyond GSI propagation. The row check runs in `dispatch`, so it also covers gateway routes whose authorizer response is cached. | Costs one `UserIdIndex` read per protected call on those routes. The authorizer itself stays unchanged. Any later cross-request cache must keep a TTL under a minute. |
| 15 | Can a player with live discipline be deleted? | No. Both Delete paths return 409 unless the status is `clear`. | Delete erases the trail, frees the email for a clean signup, and would let a Moderator wipe strikes around the Admin-only removal rule. |
| 16 | Blocking a struck person from registering again | A basic check only. While blocked or deactivated, signup is refused for the same email (ignoring case, `+tag` and Gmail dots) or the same PSN ID, and a new account cannot claim that PSN ID. | **Not airtight: a new email with no PSN ID still gets in within minutes**, including during a 7-day sign-up block, and can reuse the wrestler name. Closing that needs a real identity signal. A staff duplicate flag is a sensible follow-up issue. |
| 17 | Auto season awards won by a deactivated player | Recomputed to the runner-up while deactivated, and restored on reactivation. | Follows from widening `isHiddenLivePlayer`. To protect finished seasons, use a name-only check in `getSeasonAwards.ts:240`. |
| 18 | If the status lookup fails or is slow during token check or signup | Fail open after 1.5 seconds: log and allow. | A DynamoDB problem must not sign everyone out or stop signups. Cognito disable still blocks refresh, and handler gates still apply. The Enable and Delete guards in §7.1 fail closed instead. |
| 19 | **Tag partner** of a deactivated player | No special handling. The team stays active but leaves public lists, record included, and cannot issue challenges. The partner can dissolve it and form a new team. | One member's deactivation sidelines the partner, and dissolving cannot be undone if the player returns. Protecting the partner needs a new team state. |
| 20 | **Tournaments** with a deactivated entrant | The player stays entered. Staff can still book that tournament's matches for them and record a forfeit through Record Result, so the tournament can finish. Strike 3 lists these tournaments. | Refusing the booking would leave a round robin open forever and stall a bracket. No separate walkover action, which would need its own bracket logic. This is the one exception to "never book a deactivated player" in decision 11. |

## 5. Contract

Builders code against this section. Changing it means telling the other streams.

### 5.1 Stored fields on `Player` (`backend/lib/repositories/types.ts`)

```ts
export interface PlayerStrike {
  strikeId: string;
  issuedAt: string;            // ISO, server time
  issuedBy: string;            // Cognito sub
  issuedByName: string;        // Admin's player name, else username, else 'League Staff'
  reason: string;
  clearedAt?: string;          // set means it no longer counts
  clearedBy?: string;
  clearedByName?: string;
  clearedReason?: string;
  clearedKind?: 'removed' | 'reactivated';
}

export interface PlayerDeactivation {
  deactivatedAt: string;
  deactivatedBy: string;
  deactivatedByName: string;
  strikeId: string;
  /** The login was already disabled at strike 3, so reactivating must not enable it. */
  cognitoAlreadyDisabled?: boolean;
  reactivatedAt?: string;
  reactivatedBy?: string;
  reactivatedByName?: string;
  reactivationReason?: string;
}

// added to Player
strikes?: PlayerStrike[];
deactivations?: PlayerDeactivation[];
/** Present only while deactivated. Copy of the open PlayerDeactivation record. */
deactivatedAt?: string;
/** Optimistic lock for discipline writes. Absent reads as 0. */
disciplineVersion?: number;
/** toSignupGuardKey(email), stored at any strike that blocks or deactivates. Only used while isSignupBlocked. */
signupGuardKey?: string;
```

These fields are **not** added to `PlayerPatch`, so `players.update` cannot touch them. Write them only through:

```ts
// RosterRepository players
export interface PlayerDisciplinePatch {
  strikes: PlayerStrike[];
  deactivations: PlayerDeactivation[];
  deactivatedAt: string | null;   // null removes the attribute
  signupGuardKey?: string;        // omitted leaves it unchanged
}
updateDiscipline(playerId: string, patch: PlayerDisciplinePatch, expectedVersion: number): Promise<Player>;
```

Dynamo condition: `attribute_exists(playerId) AND attribute_not_exists(deletedAt) AND (attribute_not_exists(disciplineVersion) OR disciplineVersion = :expected)`, with `expectedVersion` 0 meaning absent. Sets `disciplineVersion = expected + 1` and `updatedAt`. Throws `ConcurrencyError` on a failed condition. The in-memory repository mirrors this. Only one row changes, so no unit of work is needed.

```ts
// UserRepository challenges, modelled on expireIfPending
/** Writes only if the status still matches. Resolves false when it has moved on. */
updateIfStatus(challengeId: string, patch: Partial<Challenge>, expectedStatus: ChallengeStatus): Promise<boolean>;
```

### 5.2 `backend/lib/discipline.ts` (pure, no AWS SDK or repository imports)

```ts
export const WARNING_DAYS = 7;
export const COOLDOWN_DAYS = 14;
export const SIGNUP_BLOCK_DAYS = 7;
/** Days after T2 from which another strike deactivates. 0 is anywhere in the 14 days (owner decision 2). */
export const DEACTIVATION_WINDOW_START_DAYS = 0;
export const MIN_REASON_LENGTH = 3;
export const MAX_REASON_LENGTH = 500;

export type DisciplineStatus = 'clear' | 'warned' | 'signup-blocked' | 'cooldown' | 'deactivated';
export type StrikeOutcome = 'warned' | 'signup-blocked' | 'deactivated';

export interface DisciplineFields {
  strikes?: PlayerStrike[];
  deactivatedAt?: string;
}

/** What the player and staff read. Issuer identity is left out on purpose. */
export interface ActiveStrikeView { strikeId: string; issuedAt: string; reason: string; }

export interface PlayerDisciplineSummary {
  status: DisciplineStatus;
  activeStrikeCount: number;           // 3 for a deactivated player
  activeStrikes: ActiveStrikeView[];
  cooldownEndsAt: string | null;
  signupBlockedUntil: string | null;   // non-null only while status is 'signup-blocked'
  deactivatedAt: string | null;
}

export function computeDiscipline(player: DisciplineFields, now?: Date): PlayerDisciplineSummary;
export function isDeactivated(player: { deactivatedAt?: string }): boolean;
export function isSignupBlocked(player: DisciplineFields, now?: Date): boolean; // true for deactivated too
export function validateReason(raw: unknown): { reason: string } | { error: string };
/** What one more strike would do now. The only place that decides deactivation. */
export function nextStrikeOutcome(player: DisciplineFields, now?: Date,
  windowStartDays?: number): StrikeOutcome;   // windowStartDays defaults to DEACTIVATION_WINDOW_START_DAYS
/** Lowercase, drop any +tag, drop dots for gmail.com and googlemail.com. */
export function toSignupGuardKey(email: string): string;

/** Caller acting for themselves: 403 SIGNUP_BLOCKED or 403 PLAYER_DEACTIVATED, else null. */
export function callerRefusal(player: DisciplineFields, now?: Date): APIGatewayProxyResult | null;
/** The other party to a member action: 409 PLAYER_UNAVAILABLE, else null. Says nothing about why. */
export function targetRefusal(player: DisciplineFields, now?: Date): APIGatewayProxyResult | null;
/** Staff action adding this player: 409 PLAYER_DEACTIVATED, else null. Sign-up blocks pass. */
export function bookingRefusal(player: DisciplineFields & { name?: string }): APIGatewayProxyResult | null;
```

`computeDiscipline` replays strikes. This is the whole rule:

```ts
const strikes = (player.strikes ?? [])
  .filter((strike) => !strike.clearedAt)
  .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
let run: PlayerStrike[] = [];
let cooldownEnd = 0;
for (const strike of strikes) {
  const issued = Date.parse(strike.issuedAt);
  if (issued >= cooldownEnd) run = [];
  run.push(strike);
  cooldownEnd = issued + (run.length === 1 ? WARNING_DAYS : COOLDOWN_DAYS) * DAY_MS;
}
// A deactivated player's strikes stay active until reactivation, however long that takes.
if (!player.deactivatedAt && now.getTime() >= cooldownEnd) run = [];
// status: deactivatedAt set -> 'deactivated', with cooldownEndsAt null.
// run.length 0 -> 'clear', 1 -> 'warned'.
// run.length >= 2 -> 'signup-blocked' if now < lastIssued + SIGNUP_BLOCK_DAYS, else 'cooldown'.
```

The replay never decides deactivation: only `deactivatedAt` does, so removing a strike can never deactivate anyone. `nextStrikeOutcome` decides it for a strike about to be issued:

```ts
const { activeStrikes } = computeDiscipline(player, now);
if (activeStrikes.length === 0) return 'warned';
if (activeStrikes.length === 1) return 'signup-blocked';
const lastIssued = Date.parse(activeStrikes[activeStrikes.length - 1].issuedAt);   // activeStrikes is oldest first
return now.getTime() >= lastIssued + windowStartDays * DAY_MS ? 'deactivated' : 'signup-blocked';
```

Refusal body shape, built by a new helper in `backend/lib/response.ts`:

```ts
export type RefusalCode = 'SIGNUP_BLOCKED' | 'PLAYER_DEACTIVATED' | 'PLAYER_UNAVAILABLE'
  | 'ALREADY_DEACTIVATED' | 'NOT_DEACTIVATED' | 'STAFF_PROTECTED' | 'DISCIPLINE_CONFLICT' | 'STRIKE_NOT_ACTIVE'
  | 'DISCIPLINE_ACTIVE' | 'PSN_ID_UNAVAILABLE' | 'PSN_ID_LOCKED';
export const refused = (statusCode: number, code: RefusalCode, message: string,
  extra?: { blockedUntil?: string }): APIGatewayProxyResult;
// body: { message, code, blockedUntil? }
```

`message` stays English; the frontend translates by `code`.

### 5.3 Routes

All on the existing `players` Lambda, in-Lambda auth through `lib/router.ts`, so no gateway authorizer. New `http` events in `serverless.yml`; `stacks-map.js` already sends these to the Overflow stack.

| Method and path | Access | Body | Success |
|---|---|---|---|
| `GET /players/{playerId}/discipline` | `STAFF` | | 200 `PlayerDisciplineDetail` |
| `POST /players/{playerId}/strikes` | `ADMIN_ONLY` | `{ reason: string; expectedVersion: number; expectedOutcome: StrikeOutcome }` | 201 `DisciplineActionResult` |
| `POST /players/{playerId}/strikes/{strikeId}/remove` | `ADMIN_ONLY` | `{ reason: string; expectedVersion: number }` | 200 `DisciplineActionResult` |
| `POST /players/{playerId}/reactivate` | `ADMIN_ONLY` | `{ reason: string; expectedVersion: number; restorePriorStrikes?: boolean }` | 200 `DisciplineActionResult` |

```ts
export interface DisciplineHoldings {
  titles: { championshipId: string; name: string }[];
  matches: { matchId: string; date: string; status: 'scheduled' | 'open-signups'; matchFormat?: string; opponents: string[]; eventId?: string; tournamentId?: string }[];
  challenges: { challengeId: string; opponentName: string }[];     // status 'accepted', tag team membership included
  tournaments: { tournamentId: string; name: string; status: string }[];  // any not completed that the player is in
}

export interface PlayerDisciplineDetail {
  playerId: string;
  version: number;                      // disciplineVersion, 0 when absent; send back as expectedVersion
  summary: PlayerDisciplineSummary;
  nextStrikeOutcome: StrikeOutcome | null;  // null while deactivated; send back as expectedOutcome
  strikes: PlayerStrike[];              // full history, newest first
  deactivations: PlayerDeactivation[];  // newest first
  hasLinkedAccount: boolean;            // false for an unlinked player or a dead link
  isStaffAccount: boolean | null;       // false when unlinked, null on a Cognito error
  accountEnabled: boolean | null;       // null when unlinked or on a Cognito error
  holdings: DisciplineHoldings;
}

export interface DisciplineActionResult {
  playerId: string;
  version: number;
  summary: PlayerDisciplineSummary;
  accountSync: 'ok' | 'failed' | 'not-linked' | 'not-needed';   // not-needed: no Cognito change was due
  softHoldsCleared: boolean;
  holdings: DisciplineHoldings;         // filled only when the action deactivated the player
}
```

Errors: 400 for a bad reason or a missing `expectedVersion` or `expectedOutcome`, 404 for a missing player or strike. 409 with code: `ALREADY_DEACTIVATED` (strike), `STAFF_PROTECTED` (strike), `PLAYER_DEACTIVATED` (remove), `STRIKE_NOT_ACTIVE` (remove of a strike not in `summary.activeStrikes`, whether cleared or lapsed), `NOT_DEACTIVATED` (reactivate), `DISCIPLINE_CONFLICT` (all three actions: `expectedVersion` differs from the row, `expectedOutcome` differs from `nextStrikeOutcome`, or the write lost the version race; nothing is written, and the modal reloads). `DISCIPLINE_ACTIVE` is for the Delete paths (§7.1).

Changes to existing responses:
- `GET /players`, `GET /players/{id}`, `GET /standings`: `toPublicPlayer` removes `strikes`, `deactivations`, `deactivatedAt`, `disciplineVersion` and `signupGuardKey` for everyone, and adds `discipline: PlayerDisciplineSummary` only for staff or the player themselves.
- `GET /players/me`, `PUT /players/me`: raw discipline fields removed, `discipline` added.
- `GET /players?view=directory`: entries gain `deactivated?: true`. Name and wrestler stay, for history.

### 5.4 Notifications

Added to `NotificationType`: `strike_issued`, `strike_removed`, `account_reactivated`. Added to `NotificationSourceType`: `discipline`. `sourceId` is the strike id, or the player id for reactivation. Links to `/profile`.

| Event | Notify | Message (stored English, as all notifications are) |
|---|---|---|
| Strike 1 | Player | "You received a strike. Check your profile for details." |
| Strike 2 | Player | "You received a second strike. You cannot sign up for matches for 7 days." |
| Deactivating strike | Nobody | The player can no longer sign in to read it. |
| Strike removed | Player | "A strike was removed from your account." |
| Reactivated | Player | "Your account has been reactivated." |

Players with no `userId` get nothing, which all three actions must skip rather than fail on. Expiry sends nothing, since no job runs. There is no email: the Cognito sending cap rules it out.

## 6. Behaviour of each action

### Issue strike (`functions/players/issueStrike.ts`)
1. `findById`, 404 if missing. 409 `ALREADY_DEACTIVATED` if deactivated. Validate the body.
2. Compute `nextStrikeOutcome` at `now`. 409 `DISCIPLINE_CONFLICT` if `expectedVersion` differs from the row, or the outcome differs from `expectedOutcome`. This is what stops a stale modal or a second Admin turning "second strike" into a deactivation, and stops a modal that said "Deactivate" issuing a fresh warning after the window ends.
3. If linked, `AdminListGroupsForUser` with `userId`. 409 `STAFF_PROTECTED` on Admin or Moderator. If the outcome is not `warned`, also `AdminGetUser`, for `Enabled` and the email. `UserNotFoundException` on either means a dead link: carry on as unlinked. Other errors: 500, nothing written.
4. Build the strike. Outcome not `warned`: set `signupGuardKey` when an email was read. Outcome `deactivated`: set `deactivatedAt` and append a `PlayerDeactivation`, with `cognitoAlreadyDisabled` true if `Enabled` was false.
5. `updateDiscipline` with `expectedVersion`. `ConcurrencyError` gives 409 `DISCIPLINE_CONFLICT`. **The row is the source of truth, and it is written first** so that enforcement starts even if a later step fails.
6. Best-effort follow-up, in this order, each failure logged and reported in the result:
   - `deactivated`: `AdminDisableUser` **first, before anything slow**, skipped with `not-needed` if already disabled. Then `clearSoftHolds`, then compute `holdings`.
   - `signup-blocked`: `clearSoftHolds`, then notification.
   - `warned`: notification.

### Remove strike (`functions/players/removeStrike.ts`)
1. `findById`, 404 if the player or strike is missing. 409 `PLAYER_DEACTIVATED` if deactivated. Validate the body.
2. 409 `DISCIPLINE_CONFLICT` if `expectedVersion` differs. 409 `STRIKE_NOT_ACTIVE` unless `strikeId` is in `summary.activeStrikes`.
3. `updateDiscipline`, stamping the strike with `clearedKind: 'removed'`. Return `accountSync: 'not-needed'`.
4. Best-effort notification, skipped with no `userId`.

### Clear soft holds (`clearSoftHolds(playerId)` in `backend/lib/disciplineActions.ts`)
- `deletePresence`, `deleteQueue`.
- Expire pending invitations in both directions. Export `expirePendingInvitations` from `leavePresence.ts` and pass `'pending'` as the third argument to `updateInvitation`. A failed condition means the invitation moved on, so treat it as handled. Leaving presence gets the same protection.
- Cancel pending and countered challenges with `updateIfStatus(challengeId, { status: 'cancelled' }, challenge.status)`. `false` means it moved on, so treat it as handled. Use `challenges.listByStatus` for each status and match `challengerId`, `challengedId`, or tag team membership through `challengerTagTeamId` and `challengedTagTeamId`. **Do not use `listByPlayer`**: it misses tag partners.
- Leaves check-ins, card bookings and `accepted` challenges alone. Accepted challenges are in `holdings`, in line with decision 7.

### Reactivate (`functions/players/reactivatePlayer.ts`)
1. 409 `NOT_DEACTIVATED` unless deactivated. Validate the body. 409 `DISCIPLINE_CONFLICT` if `expectedVersion` differs.
2. `updateDiscipline`: `deactivatedAt: null` and stamp the open `PlayerDeactivation`. With `restorePriorStrikes`, mark only `PlayerDeactivation.strikeId` `clearedKind: 'reactivated'`. Without it, mark each strike in `summary.activeStrikes`. Strikes that had already lapsed before deactivation stay as they are.
3. `AdminEnableUser`, unless `cognitoAlreadyDisabled` is set: then skip it and return `accountSync: 'not-needed'`. Then the notification.

The player then logs in again. These come back with no extra work: standings, record, wrestler, check-ins, season rows. Faction and tag team membership, bookings and titles also come back unless someone changed them during deactivation. The partner can dissolve the team, an Admin can disband a frozen faction, and staff can swap the player off cards or vacate a title. None of that is undone. The reactivate form shows the current `holdings` so the Admin can see what is left and restore the rest by hand.

These do not come back:
- Contender ranking rows (`peakRank`, `weeksAtTop`) are deleted on the next 6-hour run and restart as new.
- Queue, invitations and cancelled challenges stay gone.
- A league-wide `resetAssignments` run during deactivation also clears this player's wrestler.

### Partial failure between Cognito and the row
A Lambda timeout or a lost response can hide `accountSync`, so the modal does not rely on it. `GET discipline` reads `accountEnabled`, and the modal warns whenever the two disagree: deactivated but enabled, or not deactivated but disabled. A retried action cannot help, because it returns `ALREADY_DEACTIVATED` or `NOT_DEACTIVATED`.

The fix is the existing Manage Users toggle, which needs no new route: disable is always allowed, and enable is allowed once the row is clear. Until then the row check still returns 401, and `fetchWithAuth` signs out on a 401 after a successful refresh too, so a failed disable does not leave working access.

The `disciplineActions.ts` wrappers turn `UserNotFoundException` into `not-linked` for disable and enable, so a dead link never sends an Admin to a user who does not exist. This is common on devtest, whose rows carry prod subs. `GET discipline` treats a dead link as `hasLinkedAccount: false`, and on any other Cognito error returns `isStaffAccount: null` and `accountEnabled: null` rather than failing. The strike route still checks staff status itself.

### Deliberately unchanged
- `recordResult`: not gated. Staff must be able to finish held matches and record tournament forfeits, and the flag leaves `findById` and `tx.incrementPlayerRecord` working.
- `getTournaments`, match history, title history: history stays. `resolveBilledName` keeps names right.
- Tag team: stays active and leaves public lists through `hasHiddenMember`. Do not dissolve, because there is no way to restore one. The partner can dissolve it (owner decision 19).
- Faction: membership stays. A deactivated leader freezes the faction because no leader transfer exists; Admins can disband. Known gap, left out to keep this change small.
- `hasWrestlerRole`, `currentWrestler`, `deletedAt`: never used for this. Sync jobs rewrite the first, and the others destroy data.

## 7. Enforcement points

### 7.1 Login and tokens (Stream B)
New `backend/lib/accountStatus.ts`. It imports `lib/dynamodb` and `lib/discipline` only, not `getRepositories` or any Cognito client, to keep cold starts small:

```ts
export const ACCOUNT_CHECK_TIMEOUT_MS = 1500;
/** True when any non-deleted row for this sub is deactivated, read straight from UserIdIndex.
 *  Fails open: a timeout or error logs and returns false. */
export async function isAccountDeactivated(sub: string): Promise<boolean>;
/** The same, remembered per event in a WeakMap so one request pays for one query. */
export function isCallerDeactivated(event: APIGatewayProxyEvent, sub: string): Promise<boolean>;
/** True when an isSignupBlocked row matches the guard key or PSN ID (trimmed, ignoring case). Same timeout, fails open. */
export async function isSignupRefused(input: { email?: string; psnId?: string; excludePlayerId?: string }): Promise<boolean>;
```

In `backend/lib/disciplineActions.ts` (Stream A), because it needs Cognito:

```ts
/** The linked player for a Cognito username, through AdminGetUser's sub. Null when unlinked.
 *  Errors propagate: this guards Enable and Delete, which must fail closed. */
export async function findPlayerForCognitoUsername(username: string): Promise<Player | null>;
```

| Point | Change |
|---|---|
| `backend/lib/authenticate.ts` | After `verify`, return `{ ok: false }` if `isCallerDeactivated`. Router gives 401; `getVerifiedCaller` gives the anonymous view. Offline bypass untouched. |
| `backend/lib/router.ts`, `dispatch` | When `principalId` is already set by the gateway authorizer, return `unauthorized()` if `isCallerDeactivated`. Skip when offline. One edit covers 55 of the 56 gateway-authorized events. It must be a 401: only that reaches the frontend sign-out path. |
| `backend/functions/images/generateUploadUrl.ts` | The one gateway-authorized handler outside `dispatch`. Same check, same 401. |
| `backend/functions/users/toggleUserEnabled.ts` | `enabled: true` on a deactivated player gives 409 `PLAYER_DEACTIVATED`. Stops two sources of truth. A lookup error gives 500 with no Cognito call. |
| `backend/functions/users/deleteUser.ts`, `functions/players/deletePlayer.ts` | Refuse unless `computeDiscipline(...).status` is `clear`: 409 `PLAYER_DEACTIVATED` while deactivated, else 409 `DISCIPLINE_ACTIVE`. In `deleteUser` a lookup error gives 500 with no Cognito call. |
| `backend/functions/auth/preSignUp.ts` | Before auto-confirming, throw if `isSignupRefused` for `email` and `custom:psn_id`. Message: "This account cannot be registered. Please contact an administrator." Update the file's removal comment and the note in `serverless.yml`: at the SES cutover **keep this handler and drop only the auto-confirm lines**. Handler code only, so no pool change. |
| `backend/functions/players/updateMyProfile.ts` | When `psnId` changes, 409 `PSN_ID_UNAVAILABLE` if `isSignupRefused` with `excludePlayerId` set to the caller. While the caller is sign-up blocked, 403 `PSN_ID_LOCKED` for any change to a stored PSN ID, because moving it off the row would free it for a new account. |

`functions/auth/authorizer.ts` is **not** changed. `dispatch` does the job, and leaving it alone keeps a slow lookup from failing the authorizer, which has the 6-second default timeout and would return 500 on every gateway route.

Suspension is never enforced here. A 401 would loop through refresh for a player who is only blocked from signing up.

### 7.2 Member actions (Stream B)
Run the discipline check **before** any `isPlayerVisible` check at that site, so the player gets the right message and not "Set your wrestler name first".

| # | Action | File and anchor | Caller | Other party |
|---|---|---|---|---|
| 1 | Check in | `events/checkIn.ts` after :41 | `callerRefusal`, only for `available` and `tentative`. `unavailable` stays open. | |
| 2 | Claim slot | `matches/claimSlot.ts` before :68 | `callerRefusal` | |
| 3 | Heartbeat | `matchmaking/heartbeat.ts` after :20 | `callerRefusal` | |
| 4 | Join queue | `matchmaking/joinQueue.ts` before :62 | `callerRefusal` | |
| 5 | Send invitation | `matchmaking/createInvitation.ts` after :33, before :69 | `callerRefusal` | `targetRefusal` |
| 6 | Accept invitation | `matchmaking/acceptInvitation.ts` **before :89** | `callerRefusal` | `targetRefusal` on the inviter |
| 7 | Issue challenge | `challenges/createChallenge.ts` :65, :109, :160 | `callerRefusal`; `targetRefusal` on caller's tag partner, loading that row (only loaded for titles today) | `targetRefusal`, singles and every tag member |
| 8 | Accept or counter challenge | `challenges/respondToChallenge.ts` **before :80**, after the expiry check at :74-76, when `action !== 'decline'` | `callerRefusal`. Decline stays open. | `targetRefusal` on the challenger. For `challengeMode === 'tag_team'`, load both teams by `challengerTagTeamId` and `challengedTagTeamId` and run it on all four members except the responder. |
| 9 | Call-out promo | `promos/createPromo.ts` before :69 and :94 | `callerRefusal`, `promoType === 'call-out'` only | `targetRefusal`, same condition |

Row 6 must come before :89, which marks the invitation accepted before scheduling. Row 8 must come before :80, because accept returns at :88 and never reaches the counter checks at :98 and :103. Update the comment at :95-97, which says accepting stays open, and make the accept write `updateIfStatus(challengeId, patch, 'pending')`, answering `false` with the existing "no longer pending" error, so an accept cannot bring back a cancelled challenge. Row 9 gates the promo, not the later challenge, because PromoEditor creates the promo first and would orphan it.

Left open: `deleteCheckIn`, `releaseSlot`, `declineInvitation`, `leaveQueue`, `leavePresence`, `cancelChallenge`, storyline and transfer requests.

### 7.3 Staff booking and targets (Stream B)
`bookingRefusal` applies only to players **newly added** by the edit. A deactivated player already on a match must not stop staff editing that match.

| Action | File and anchor | Note |
|---|---|---|
| Schedule match | `matches/scheduleMatch.ts`, after the tournament lookup at :227-237 | Applies to all participants. Inside `scheduleMatchInternal`, the choke point for all new matches. Give `ScheduleMatchError` an optional `code`. Deactivated only, so staff can book a sign-up-blocked player. **Skip for a player in `tournament.participants` when `input.tournamentId` is set** (owner decision 20). |
| Assign slot | `matches/adminUpdateSlot.ts` :95-99 | Newly assigned player |
| Swap participants | `matches/updateMatch.ts` :57-67, and `body.teams`, which is stored unchecked today | Added ids only |
| Create tournament | `tournaments/createTournament.ts` | Add a lookup of participants; it has none today |
| Assign champion | `championships/assignChampion.ts:56` | |
| Set champion directly | `championships/updateChampionship.ts:22`, `createChampionship.ts` through its `validate` hook | Newly added ids in `currentChampion`. Direct API only; the frontend does not send it. |
| Create rivalry | `rivalries/createRivalry.ts:87` | |
| Contender override | `contenders/setOverride.ts` before :90 | |
| Create tag team | `tagTeams/createTagTeam.ts:48` | Partner. `targetRefusal` is too broad here; check `isDeactivated` and return `PLAYER_UNAVAILABLE`. |
| Approve tag team | `tagTeams/approveTagTeam.ts:33-44` | Either member |
| Invite to stable | `stables/inviteToStable.ts:62` | Invited player, as for create tag team |
| Reactivate stable | `stables/reactivateStable.ts:40-60` | Skip deactivated members |
| Approve stable | `stables/approveStable.ts` | Refuse when the leader is deactivated |

A deactivated caller of the remaining team and faction routes is stopped by §7.1. `updateTournament` is an accepted exception: it writes `winner`, `brackets` and `standings` as given, is staff-only, and has no frontend caller.

### 7.4 Reads (Stream B)

| Change | File |
|---|---|
| `isPlayerVisible` becomes `!isNeedsWrestler(player.currentWrestler) && !player.deactivatedAt`. Widen the parameter types there, in `isHiddenLivePlayer` and `findHiddenPlayerIds`. Fixes about 30 read paths: standings, statistics, dashboard, contenders, profile, online, queue, stables, tag teams, rivalries, activity, promos, awards. | `backend/lib/needsWrestler.ts` |
| **Add `deactivatedAt` to the ProjectionExpression and pass it in the literal.** Otherwise this compiles but the player keeps a contender slot on every run. It is the only caller not passing a full row. | `backend/lib/rankingCalculator.ts:102,108` |
| Add `deactivated: true` to directory entries. | `functions/players/getPlayers.ts:25-33` |
| Skip deactivated players entirely, so they do not reach the booking list. Rows are kept, so they return on reactivation. | `functions/events/getCheckIns.ts:64-69` |
| Skip deactivated players in the counts too, using one `players.list()` as `getCheckIns` does, so summary and list agree. Rows are kept. | `functions/events/getCheckInSummary.ts` |
| Also skip `isSignupBlocked` players for everyone but themselves, so the listing is right even if `clearSoftHolds` failed or a late heartbeat re-created a row. | `functions/matchmaking/getQueue.ts:58`, `getOnline.ts:73` |
| Mask `psnId` when `deactivatedAt` is set. | `functions/matches/hydrateSlots.ts:48`, `functions/events/getEvent.ts:121` |

### 7.5 Leak audit (Stream A)
`toPublicPlayer` spreads `...rest`, so the new fields must be stripped there. Checked in this plan: `getStatistics` spreads rows but maps to named fields before responding, and stables, tag teams and contenders build summaries. The raw rows left are `getMyProfile.ts:48`, `updateMyProfile.ts:203,207` (both fixed by Stream A) and staff-only `updatePlayer.ts:222,226`, which may stay as is. The admin export keeps the fields, which is correct.

## 8. Admin UI (Stream C)

- **Manage Players** (`components/admin/ManagePlayers.tsx`):
  - New `DisciplineBadge` in the status column, driven by `player.discipline`.
  - New row action opening `PlayerDisciplineModal`.
  - Deactivated rows are hidden by default and come back with the existing "Show hidden" toggle, so include them in `hiddenCount`.
- **`PlayerDisciplineModal`** (new, `components/admin/PlayerDisciplineModal.tsx` with its own CSS):
  - Loads `GET /players/{id}/discipline`.
  - Shows status with dates, active strikes, and full history with who did what.
  - Admins get forms for Issue strike, Remove (per strike), Reactivate, each with a required reason. Moderators see it read-only. `isStaffAccount` disables Issue and explains why.
  - The primary button states `nextStrikeOutcome`: "Issue warning", "Issue second strike", "Deactivate account". Submit sends the `version` and `nextStrikeOutcome` the modal loaded, and is disabled while a request is in flight. On `DISCIPLINE_CONFLICT` the modal reloads and shows the new state.
  - Remove appears only on strikes in `summary.activeStrikes`.
  - The Reactivate form has a "Restore earlier strikes (the last strike was a mistake)" checkbox, and shows the current `holdings`.
  - When `accountEnabled` disagrees with the row, a warning points to Manage Users (§6).
- **Deactivation confirm** (`ConfirmModal`): lists `holdings`, with links to each match, Manage Championships, each accepted challenge's existing admin cancel, and each tournament. It says none are changed automatically. The same list shows after the action.
- `accountSync: 'failed'` shows a warning pointing to Manage Users. `'not-linked'` says there is no login to disable. `'not-needed'` on a reactivation says the login was already disabled, and to enable it in Manage Users if wanted. `softHoldsCleared: false` shows a warning that queue or challenge cleanup did not finish. Accept-time gates and the listing filters in §7.4 still hold.
- **Pickers** (`utils/pickablePlayers.ts`): drop `discipline.status === 'deactivated'` unless in `keepIds`. Widen `RosterPlayer`. All 7 pickers and `pickableTagTeams` follow. `ScheduleMatch.tsx` adds the selected tournament's `participants` to `keepIds`, or staff could not book the match decision 20 allows.
- **Booking warning**: `ScheduleMatch.tsx` and `SlotEditDialog.tsx` show a non-blocking warning when a chosen player has `status === 'signup-blocked'`. `ScheduleMatch.tsx` shows one for a deactivated tournament entrant, saying the match can be recorded as a forfeit.
- **Manage Users** (`ManageUsers.tsx`): show the `PLAYER_DEACTIVATED` refusal on Enable and Delete; it arrives through §9's translated error.

## 9. Member UI (Stream C)

**Owner requirement.** A player must always be able to see, on a Strikes panel in the Me section and on their own profile: each active strike with its date and reason; how long until their strikes fall off, as a live countdown ("Falls off in 5 days 3 hours") plus the exact date; and, while blocked, how long the suspension has left plus the date it lifts. The same suspension time shows wherever they would normally sign up. A player with no active strikes sees nothing. Past strikes are not shown to the player.

- **Translated refusals in one place.** In `apiClient.ts`, add `code?: string` to `ApiError`, and map known codes to `t('discipline.errors.<code>', { date })` through the i18n instance. Call sites that show `err.message` then get a translated message with no edits. This was not confirmed for each one, so check the sites listed below during the build and fix any that hide the message: `EventDetail`, `FindMatchWidget`, `FindMatchPage`, `IssueChallenge`, `ChallengeDetail`, `MyChallenges`, `PromoCard`, `PromoEditor`, `CreateTagTeamModal`, `MyTagTeam`, `CreateFactionModal`, `MyFaction`, `InviteToFactionModal`, `FactionManage`.
- **`DisciplineNotice`** (new): on `MeHub.tsx` beside the hidden-player notice, and on the player's own `WrestlerProfile.tsx`. Shows status, end dates, and each active strike's reason. Renders nothing for `clear`. Reads `profile.discipline` from `AuthContext`.
- **Controls off while blocked**, using one helper in `utils/discipline.ts`, `isBlockedNow(discipline) = until !== null && Date.parse(until) > Date.now()`, with the end date beside them. The server stays the authority:
  - `EventCheckIn` available and tentative (unavailable stays on), `EventDetail.tsx:863`.
  - Slot claim, `claimDisabled` at `EventDetail.tsx:734-745`.
  - `FindMatchPage.tsx` and `FindMatchWidget.tsx`.
  - `IssueChallenge.tsx`.
- **Windows that end or start in an open tab**:
  - `AuthContext` sets one timeout at the next of `signupBlockedUntil` and `cooldownEndsAt` that calls `refreshProfile`, clamped to the 2^31 ms timer limit.
  - `apiClient` fires an event on any `SIGNUP_BLOCKED` response, and `AuthContext` refreshes on it.
- `contexts/PresenceContext.tsx`: do not start the heartbeat while blocked. On a `SIGNUP_BLOCKED` heartbeat response, call `disablePresence()`, which stops a running loop. Do not re-enable presence on its own when the block ends; the player turns it back on.
- **Dates**: add `formatInstant(iso, locale)` to `utils/dateUtils.ts`: date and time in the viewer's timezone, with `timeZoneName: 'short'`. Use it for `signupBlockedUntil`, `cooldownEndsAt`, `blockedUntil` and strike history. **Never use `formatCalendarDate` for these**: it cuts the value to its UTC day, so the shown date can be a day late.
- **Search**: `searchIndex.ts:46` and `MatchSearch.tsx:182` skip `deactivated` directory entries. `Championships.tsx`: render a deactivated champion's name without a profile link, which would 404.
- **Signup**: show the `preSignUp` refusal as `auth.signupRefused`, in place of Cognito's raw `UserLambdaValidationException` text.
- **Login**: move the hard-coded message at `cognito.ts:145` to i18n. Wording: "Your account has been deactivated or disabled. Please contact an administrator."
- **Notifications**: add the types and `discipline` source to `types/index.ts:429,437`; `NotificationBell.tsx` `sourceTypeLabel` gets `notifications.typeDiscipline` and `getNavigationPath` goes to `/profile`.

## 10. Translations and wiki (Stream C)

en and de in `frontend/src/i18n/locales/`; `localeParity.test.ts` fails on any one-sided key.

```
discipline.status.{clear,warned,signupBlocked,cooldown,deactivated}
discipline.errors.{SIGNUP_BLOCKED,PLAYER_DEACTIVATED,PLAYER_UNAVAILABLE,ALREADY_DEACTIVATED,
                   NOT_DEACTIVATED,STAFF_PROTECTED,DISCIPLINE_CONFLICT,STRIKE_NOT_ACTIVE,
                   DISCIPLINE_ACTIVE,PSN_ID_UNAVAILABLE,PSN_ID_LOCKED}
discipline.notice.{title,cooldownEnds,signupBlockedUntil,strikeReason}
discipline.admin.{title,history,issueWarning,issueSecond,deactivateAccount,remove,reactivate,
                  restorePriorStrikes,reason,reasonHint,staffProtected,readOnly,accountSyncFailed,
                  accountMismatch,loginAlreadyDisabled,softHoldsFailed,notLinked,holdingsTitle,
                  holdingsNotChanged,bookingWarning,tournamentForfeitWarning}
notifications.typeDiscipline
auth.accountDisabled, auth.signupRefused (or the existing namespace cognito errors use)
```

Wiki, in `frontend/public/wiki/` with German copies in `wiki/de/`:
- New `strikes-and-suspensions.md` (members): the rules, what each state stops, how to see your status, and that windows are counted in 24-hour days from the exact strike time, so an end can fall at any hour. Link it from `league-rules.md`.
- New `admin-strikes.md` (`adminOnly: true`, `parent: "admin"`, `navTitleKey`): issuing, removing, reactivating, what to do with the holdings list, including tournaments and how to record a forfeit (decision 20), restoring earlier strikes, `accountSync` failures and the mismatch warning.
- Add both to `index.json`, with keys under `wiki.articles` and `wiki.navLabels` in en and de.
- Update `admin-manage-players.md`, `admin-user-management.md`, `events.md`, `faqs.md` and their German copies.
- Member pages must not link to staff pages (`wikiLinks.test.ts`).

## 11. Tests

### Stream A
`backend/lib/__tests__/discipline.test.ts`, with a fixed `now`:

| Strikes (day issued) | Now (day) | Expect |
|---|---|---|
| none | 0 | `clear`, 0 |
| 0 | 6.9 | `warned`, ends day 7 |
| 0 | 7 | `clear`, boundary |
| 0, 5 | 5 | `signup-blocked`, until 12, cooldown 19 |
| 0, 5 | 12 | `cooldown`, block null |
| 0, 5 | 19 | `clear` |
| 0, 8 | 8 | `warned`, first lapsed, fresh first strike |
| 0, 7 | 7 | `warned`, ends 14, fresh first strike on the boundary |
| 0, 6.999 | 7 | `signup-blocked`, until 13.999 |
| 0, 5, then 21 | 21 | `warned`, count reset |
| 0, 5, 19 | 19 | `warned`, ends 26, fresh first strike on the boundary |
| 0 (cleared), 5 | 6 | `warned`, ends 12 |
| 0, 5 (cleared) | 6 | `warned`, ends 7 |
| 0 (cleared at 15), 5 | 15 | `clear`, removal after strike 2's own warning has lapsed |
| 0, 5, 12, `deactivatedAt` | any | `deactivated`, count 3, on the block boundary |
| 0, 5, 18.999, `deactivatedAt` | any | `deactivated`, count 3 |
| 0, 5, 13, `deactivatedAt` | 400 | `deactivated`, still 3 active far past the windows |
| 0, 20, 22, 30, `deactivatedAt` | 31 | `deactivated`, 3 active, first lapsed |
| 0, then 20, 22, 30 cleared by reactivation | 31 | `clear`, 0 stays uncleared |
| 0, 5, 13 cleared by reactivation, then 14 | 14 | `warned`, ends 21 |
| 0, 5, 13 with only 13 cleared by restore | 13.5 | `cooldown`, ends 19, the original dates |
| 0, 5, 13 with only 13 cleared by restore | 19 | `clear` |
| unsorted input | | Same as sorted |

`nextStrikeOutcome`, at the default of 0:

| Strikes (day issued) | Now (day) | Expect |
|---|---|---|
| none | 0 | `warned` |
| 0 | 3 | `signup-blocked` |
| 0 | 7 | `warned` |
| 0, 5 | 8, which is `T2 + 3d` | `deactivated` |
| 0, 5 | 12, which is `T2 + 7d` exactly | `deactivated` |
| 0, 5 | 19 minus 1 ms | `deactivated` |
| 0, 5 | 19 | `warned` |

Also:
- `callerRefusal`, `targetRefusal` (no reason leaked), `bookingRefusal` (passes a sign-up block), `validateReason`, `toSignupGuardKey`.
- Handlers on the in-memory repository: each row of §3 transitions; staff protected; unlinked player on all three actions; notification failure does not fail the action; no notification on the deactivating strike.
- `DISCIPLINE_CONFLICT`, each writing nothing and not deactivating: a stale `expectedVersion` on a player in `cooldown`; two Admins both sent "second strike" against one `warned` row; `expectedOutcome: 'deactivated'` landing after the cooldown ended, with the version unchanged.
- Remove: lapsed strike and cleared strike both give `STRIKE_NOT_ACTIVE`, with no notification.
- Reactivate: `restorePriorStrikes` day by day, as in the table above; `cognitoAlreadyDisabled` skips `AdminEnableUser` and returns `not-needed`.
- Cognito: disable failure gives `accountSync: 'failed'` with the row still written; `AdminDisableUser` runs before `clearSoftHolds`; dead link on groups, get, disable and enable gives `not-linked`; `GET discipline` on a dead link and on a Cognito error returns 200 with nulls; reactivate with a failed enable followed by a reload shows `accountEnabled: false`.
- `clearSoftHolds`, including a tag partner's challenge, and an invitation or challenge that moved on before the write staying as it is.
- `getHoldings`: accepted challenges, including through a tag team; tournaments not yet completed.
- `updateDiscipline` version guard and `challenges.updateIfStatus`, Dynamo and in-memory.
- `publicPlayer.test.ts`: fields stripped for anonymous and other members; `discipline` only for staff and self.
- `routeAccess.test.ts`: add to `ADMIN_ONLY_ROUTES` and the gateway-event check.

### Stream B
- `authenticate` and `dispatch`: deactivated gives 401, including with `principalId` already set; lookup error fails open; a lookup that never resolves fails open at the timeout; a second row for the same sub that is deactivated still counts; one query per event; offline bypass. `generateUploadUrl` gives 401.
- `preSignUp`: refused for a matching guard key, a case-changed email, a `+tag` variant and a matching PSN ID while blocked or deactivated; allowed once a block has ended; allowed on a lookup error. `updateMyProfile` refuses a blocked player's PSN ID.
- New `functions/__tests__/disciplineGates.test.ts`, modelled on `hiddenPlayerBlocks.test.ts`: every §7.2 and §7.3 row refused, sign-up block versus deactivated, open paths staying open (`unavailable` check-in, decline, release), staff booking a blocked player passing, edit of a match already holding a deactivated player passing, no write on `acceptInvitation` when refused, and a promo that is not a call-out passing. Accept is a separate case from counter, asserting `challenges.update` is not called. Also: a blocked teammate on either side of a tag challenge, the added §7.3 rows, and a deactivated tournament entrant booked with `tournamentId` passing while the same player without it is refused.
- A round robin with a deactivated entrant runs to `completed`, by booking the match and recording a forfeit.
- `needsWrestler.test.ts`, `rankingCalculator.test.ts` (proves the projection), `readPathVisibility.test.ts`.
- `recordResult` still records a held match with a deactivated participant.
- `toggleUserEnabled`, `deleteUser`, `deletePlayer` refusals, with `deleteUser` and `deletePlayer` covering `warned`, `signup-blocked`, `cooldown` and `deactivated`. A lookup error in `toggleUserEnabled` and in `deleteUser` gives 500 with no Cognito call.
- `getCheckInSummary` matches `getCheckIns`. `getQueue` and `getOnline` hide a blocked player from others and show them to themselves.

Existing handler tests that mock `getRepositories` without `findByUserId` pass through the fail-open path; any asserting `findByUserId` call counts on an authenticated route may need updating.

### Stream C
Vitest: `ApiError` code translation, `DisciplineNotice` per state, modal for Admin and Moderator, deactivation holdings, conflict reload, Remove only on active strikes, mismatch warning, `pickablePlayers` including tournament `keepIds`, search dropping deactivated entries, check-in and claim disabled while blocked. Locale parity and `wikiLinks` must pass.

- `isBlockedNow` and the `AuthContext` timeout with fake timers across the boundary; refresh on a `SIGNUP_BLOCKED` event; presence stopped by a refused heartbeat and not restarted on its own.
- `formatInstant` with a pinned `TZ` in en and de, including a window that crosses a daylight-saving change.

### On dev after integration
Using QA accounts; devtest tables are a copy of prod data, so do not strike real players.

1. Full walk: strike 1, 2, 3, reactivate, with checks at each step.
2. A deactivated user with an open tab is signed out on the next protected call.
3. `AdminDisableUser` works with the sub as `Username`.
4. Forgot password on a disabled account does not re-enable it.
5. Signup with a disabled account's email is refused, and so is a case-changed copy of it.
6. Read `UsernameConfiguration` from `aws cognito-idp describe-user-pool` on both pools. `serverless.yml` sets none, so the pools may be case-sensitive. If so, a case-changed email counts as a new user for anyone not blocked, which is harmless, and `preSignUp` covers those who are.

## 12. Work split

Three streams with no shared files, in one worktree. Each starts at once from §5; **do not commit** until integration. Stream A writes §5.1 and `lib/discipline.ts` first, since Stream B imports them. Stream B writes `lib/accountStatus.ts` early, since Stream A's `updateMyProfile` imports `isSignupRefused`.

### Stream A: backend domain and routes
Create: `backend/lib/discipline.ts`, `backend/lib/disciplineActions.ts` (`clearSoftHolds`, `getHoldings`, Cognito disable/enable/groups wrappers), `backend/functions/players/{getPlayerDiscipline,issueStrike,removeStrike,reactivatePlayer}.ts`, their tests.

Edit: `backend/lib/repositories/types.ts`, `RosterRepository.ts`, `UserRepository.ts`, `dynamo/DynamoRosterRepository.ts`, `dynamo/DynamoUserRepository.ts`, `inMemory/InMemoryRosterRepository.ts`, `inMemory/InMemoryUserRepository.ts`, `backend/lib/response.ts`, `backend/lib/publicPlayer.ts` and test, `backend/lib/notifications.ts`, `backend/functions/players/{handler,getMyProfile,updateMyProfile}.ts`, `backend/functions/matchmaking/leavePresence.ts`, `backend/serverless.yml`, `backend/docs/openapi.yaml` then `npm run embed-docs`, `backend/functions/__tests__/routeAccess.test.ts`.

`getHoldings` uses `matches.listByStatus` for `scheduled` and `open-signups` with the `playerIdsOn` logic from `getBookingSummary.ts:18-24`, and the champion check from `deletePlayer.ts:49-63`, plus `challenges.listByStatus('accepted')` with the membership matching from `clearSoftHolds`, and `tournaments.list()` filtered to not completed. It scans, so it runs only on modal open and on strike 3.

### Stream B: enforcement in existing handlers
Create: `backend/lib/accountStatus.ts`, `backend/functions/__tests__/disciplineGates.test.ts`.

Edit: `backend/lib/{authenticate,router,needsWrestler,rankingCalculator}.ts`, `backend/functions/auth/preSignUp.ts`, `backend/functions/images/generateUploadUrl.ts`, the `preSignUp` comment in `serverless.yml` (one line; Stream A owns the rest of that file, so merge at integration), `backend/functions/users/{toggleUserEnabled,deleteUser}.ts`, `backend/functions/players/{deletePlayer,getPlayers}.ts`, and every handler in §7.2 to §7.4, plus their tests.

### Stream C: frontend
Everything under `frontend/`: §8, §9, §10. Mirror §5 in `frontend/src/types/index.ts`, add `disciplineApi` to `services/api/players.api.ts`, and own `apiClient.ts`.

### Integration (lead, after all three)
1. `cd backend && npx tsc --project tsconfig.json --noEmit` and `cd frontend && npx tsc --project tsconfig.app.json --noEmit`.
2. `/verify-backend`, `/verify-frontend`.
3. `grep` that no handler reads discipline fields except through `lib/discipline.ts`, and that no `any` was added.
4. Commit, with `repositories/types.ts`, `publicPlayer.ts` and its test as **their own first commit**, so a safe rollback point exists (§13). Then push.
5. Deploy to dev (§13) and run §11's dev checks.

## 13. Deployment

- **Stack limit**: the root stack is at exactly 500 on prod and devtest. This plan adds 13 resources: 5 API Gateway Resources, 4 Methods and 4 CORS OPTIONS methods, all routed to Overflow by `stacks-map.js`. No new Lambda Permission is created, because the existing players permission already covers these paths. Do not add any other resource type. CI's `check-stack-cycles.js` counts neither root resources nor Overflow parameters, so before the first dev dispatch run `npx serverless package --stage devtest` and confirm from `.serverless` that root is at or under 500 and every nested stack has under 200 parameters. Repeat with `--stage dev` before the owner deploys prod, since its split may differ.
- **Nothing else infra**: no pool property change (so no trigger detach and no `setup-cognito.sh` run), no IAM change (`AdminDisableUser`, `AdminEnableUser`, `AdminGetUser`, `AdminListGroupsForUser` are already granted, and the shared role already lets `preSignUp` read Players), no data migration (absent fields mean `clear`).
- **Pre-deploy audit, read-only, both stages**: scan Players and list any `userId` held by more than one row with no `deletedAt`. `UserIdIndex` does not enforce uniqueness, and sign-up gates read only the first row, so fix any duplicates before release. Prod data has not been checked for this.
- **Dev**: a PR based on `feat/site-redesign` does not trigger `deploy-dev.yml`. Use `gh workflow run deploy-dev.yml --ref feat/player-strikes` after pushing. Devtest is shared with PR #388, and each push overwrites the other, so check before testing. Before handing the stage back to #388, reactivate and clear all QA strikes (see Rollback).
- **Prod**: the owner deploys it.
- **Announcement**: after the prod deploy, the owner posts `docs/announcements/strike-system.html` as a new announcement, then deactivates the older active announcements so it is easy to find. Within a priority the newest shows first, but anyone who closes the popup hides the whole queue for that session.
- **Rollback**: not neutral once one strike exists.
  - Older code spreads `...rest` in `toPublicPlayer`, so it would publish strike reasons and issuer names on public `GET /players`. It would also show deactivated players again while their logins stay disabled.
  - A safe rollback target therefore includes the first commit from §12 integration. The owner can deploy that commit ahead of the feature to make every later rollback safe.
  - To go below it: first reactivate every deactivated player, reconcile their logins in Manage Users, and remove all discipline attributes from the rows.
- **Conflict watch**: open PR #378 (active/inactive wrestler status) touches `Player` types, unit of work, `getStandings`, `getPlayers`, the players handler and `ManagePlayers`. Keep the word "deactivated" here so the two are not confused.
- **Docs**: add a short section to `CLAUDE.md` once merged, covering §2 and the `lib/discipline.ts` entry point. The notes on removing the PreSignUp trigger must now say to keep the handler.

## 14. Risks

| Risk | Handling |
|---|---|
| A write path is missed | `scheduleMatchInternal` is the choke point for new matches; `disciplineGates.test.ts` lists each route in §7, and `updateTournament` is the one named exception. |
| `rankingCalculator` ignores the flag | Named in §7.4 and proved by test. |
| Strike data leaks publicly | Stripped in `toPublicPlayer`, audited in §7.5, tested. |
| Member learns another player's status from a refusal | `targetRefusal` gives one neutral message. The directory's `deactivated` flag is public, but so is the missing profile. |
| Extra read per authenticated call | One `UserIdIndex` query per request that carries a token, public GETs included, remembered per event so repeat checks are free. It adds to Lambda duration under the 10-slot limit, bounded at 1.5 seconds. Watch burst 500s on dev. The fallback is a per-container cache with a TTL under a minute, which would weaken decision 14. |
| A deactivated champion stays listed | Owner decision 6. |
| Bookings need manual cleanup | Owner decision 7. Staff get the list at the moment of the third strike. |
| Ban evasion by new email | Owner decision 16. The basic check stops the same email and PSN ID only. |
| Cognito and the row end up different | The row decides access. The modal's mismatch warning shows it, and Manage Users fixes it (§6). |
