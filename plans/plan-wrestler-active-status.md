# Plan — Active / Inactive Wrestler Status

**Branch:** `feat/wrestler-active-status`

## Goal

A wrestler (a `Player` record — the league member, not the WWE roster entry in the
Wrestlers table) is **active** once they have completed at least one match in the
**current active season**. They stay active for the rest of that season. When a new
season starts, everyone is inactive again until they complete a match in it.

Inactive wrestlers must not appear in — or contribute to — standings, rankings, and
contenders.

---

## Core design decision: derive from `lastActiveSeasonId`, don't store a boolean

Instead of a raw `isActive: boolean` that has to be reset by a job at season rollover,
store **one field on `Player`**:

```ts
lastActiveSeasonId?: string;   // seasonId of the most recent season in which
                               // this player completed a match
```

and derive everywhere:

```ts
isActive = !!activeSeason && player.lastActiveSeasonId === activeSeason.seasonId
```

Why this shape:

- **No reset job.** Creating/activating a new season automatically makes everyone
  inactive, because no one's `lastActiveSeasonId` matches the new season yet. A stored
  boolean would need a bulk-write over the whole roster at rollover, which can partially
  fail and drift.
- **Idempotent + self-healing.** Recording a result just sets the field to the match's
  `seasonId`; replaying is harmless. A backfill can recompute it from completed matches
  at any time.
- **Single source of truth.** No possibility of `isActive: true` while the player has no
  matches this season.

The API still exposes a plain `isActive: boolean` on player/standings payloads, so the
frontend never has to know about the mechanism.

### Manual override

Admins can force a player's status independently of matches (injury, break, guest
appearance). Second field on `Player`:

```ts
activeOverride?: boolean;   // true = force active, false = force inactive,
                            // undefined = derive from lastActiveSeasonId
```

Resolution order: `activeOverride ?? derived`. The override is **cleared automatically
at season rollover** — since it lives on the player and seasons roll over implicitly,
it must be stamped with the season it applies to:

```ts
activeOverride?: { seasonId: string; value: boolean; setBy: string; setAt: string };
```

An override only counts when `activeOverride.seasonId === activeSeason.seasonId`, so a
forced-active player in Season 4 reverts to derived behaviour in Season 5 — same
no-reset-job property as `lastActiveSeasonId`.

### Where the rules land

| Surface | Behaviour |
|---|---|
| Standings — **All-time** view | Show **everyone** (no active filter). |
| Standings — **season** view | Active only. Current season → flag/override; past season → had standings in it. |
| Contenders / rankings | Active only. |
| Championship / belt holders | **Always shown**, active or not — a champion is a champion. |
| Division listings | Active only. |
| Matchmaking, schedulers, roster pickers, profiles | **Everyone** — inactive players must remain selectable, that is how they become active. |

---

## Backend changes

### 1. Types & repository (`backend/lib/repositories/`)

- `types.ts` → `Player`: add `lastActiveSeasonId?: string` and
  `activeOverride?: ActiveOverride` (`{ seasonId, value, setBy, setAt }`), with a comment
  explaining the derivation rule.
- `RosterRepository.ts` → `PlayerPatch`: add `lastActiveSeasonId?: string` and
  `activeOverride?: ActiveOverride | null` (`null` clears it).
- `unitOfWork.ts` + `dynamo/DynamoUnitOfWork.ts` + `inMemory/InMemoryUnitOfWork.ts`:
  add `tx.markPlayerActiveInSeason(playerId, seasonId)` — a `SET lastActiveSeasonId = :s`
  update on the Players table, so activation lands in the *same* transaction as the
  win/loss increment.

### 2. Shared helper — `backend/lib/activeStatus.ts` (new)

```ts
type ActivityFields = { lastActiveSeasonId?: string; activeOverride?: ActiveOverride };

export function isPlayerActive(
  player: ActivityFields,
  activeSeasonId: string | undefined,
): boolean;   // override (same season) wins, else lastActiveSeasonId === activeSeasonId

export function filterActivePlayers<T extends ActivityFields>(
  players: T[], activeSeasonId: string | undefined,
): T[];
```

When `activeSeasonId` is `undefined` (no active season), `isPlayerActive` returns
`false` — but callers that would then render nothing (see the standings/division rules)
skip the filter entirely rather than showing an empty page.

Mirrors the existing `lib/wrestlerRole.ts` pattern (`hasWrestlerRole`) so the filters
compose: `players.filter(hasWrestlerRole).filter(p => isPlayerActive(p, seasonId))`.

### 3. Write paths — set the flag

- **`functions/matches/recordResult.ts`** — inside the existing `runInTransaction`
  block, where season standings are incremented (`if (match.seasonId)`), also call
  `tx.markPlayerActiveInSeason(playerId, match.seasonId)` for **every participant**
  (winners + losers + draw participants). Participation, not victory, is what counts.
- **`functions/matches/deleteMatch.ts`** — reverses records for a deleted completed
  match. Deciding whether to un-activate here needs a scan of that player's remaining
  completed matches in the season, which is not worth doing inline. **Recommendation:**
  leave `lastActiveSeasonId` untouched on delete (a player stays active), and let the
  admin backfill endpoint below correct it if it matters. Document this.
- Check whether any other path completes a match (`updateMatch.ts` status change,
  tournament progression, `seedData.ts`) — if a match can reach `completed` outside
  `recordResult`, the same marking must be applied there. **Investigate during
  implementation.**

### 4. Read paths — filter

- **`functions/standings/getStandings.ts`**
  - Fetch the active season alongside overalls/matches.
  - **All-time branch (no `?seasonId=`): show everyone**, unfiltered. Still return
    `isActive` per player so the UI can badge them.
  - **Season branch (`?seasonId=`): active only.**
    - `seasonId === activeSeason.seasonId` → `isPlayerActive(player, seasonId)`.
    - Past/completed season → the flag is meaningless (it only tracks the latest
      season), so filter by presence in `SeasonStandings` for that season with a
      non-zero W/L/D. Historical views therefore keep working unchanged.
  - Add `?includeInactive=true` to opt back in (admin views, debugging), and return
    `isActive` on every player object in both branches.
  - Note: [Standings.tsx:71](frontend/src/components/Standings.tsx#L71) defaults the
    selector to the **active season**, so the filtered view is what users land on;
    "All-time" is the explicit opt-out.
- **`lib/rankingCalculator.ts`** — already scoped to the active season and gated by
  `minimumMatches`, so players with zero season matches cannot rank. Add an explicit
  active check anyway when `minimumMatches` is configured to `0`, and make sure inactive
  players are excluded from the *quality-of-wins* denominator so scores don't shift.
- **`functions/contenders/getContenders.ts`** — drop rankings whose player is inactive
  before re-numbering `adjustedRank`, so the displayed rank stays contiguous. The
  **current champion block is exempt** — it is built separately (step 5 of that handler)
  and must render regardless of the champion's activity.
- **Championships** (`functions/championships/*`) — no filtering. Belt holders always
  show. Verify `getChampionships` / history / `ChampionCarousel` never route through an
  active-filtered player list.
- **Divisions** — division listings show active players only. Apply the filter wherever
  a division's roster is materialised (`functions/divisions/getDivisions.ts` if it
  returns members, plus any player-list endpoint consumed by `DivisionFilter.tsx` /
  division pages). Confirm during implementation which handler actually owns this.
- **Do NOT filter**: `functions/matchmaking/*`, match scheduling / slot pickers
  (`claimSlot`, `hydrateSlots`, `ScheduleMatch`), `functions/players/getPlayers.ts`,
  public profiles, challenges. Inactive players must stay bookable — that is the only
  route back to active.
- **Sweep and decide** for `functions/dashboard/getDashboard.ts`,
  `functions/statistics/*`, `functions/seasonAwards/*` — list findings before changing
  behaviour rather than blanket-filtering.

### 5. Admin override endpoint

`PUT /players/{playerId}/active-status` (auth-protected), body
`{ value: boolean | null }`:

- `true` / `false` → write `activeOverride = { seasonId: <active season>, value, setBy, setAt }`.
- `null` → delete `activeOverride`, reverting to derived.
- `409` if there is no active season (nothing to scope the override to).

Add the route + function to `serverless.yml` under the existing admin authorizer, and a
`playersApi.setActiveStatus()` client method in `frontend/src/services/api.ts`.

### 6. Admin backfill / recompute endpoint

`POST /admin/recompute-active-status` (auth-protected): scans completed matches for the
active season, sets `lastActiveSeasonId` for every participant, and clears it for the
rest. Leaves `activeOverride` alone. Covers the initial migration for existing data and
repairs drift after match deletions. Add it to `serverless.yml`.

---

## Frontend changes

- `frontend/src/types/index.ts` → `Player`: add `isActive?: boolean`,
  `lastActiveSeasonId?: string`, `activeOverride?: { seasonId: string; value: boolean;
  setBy: string; setAt: string }`.
- **`components/Standings.tsx`** — filtering is server-side, so no list logic changes.
  In the **season** view add an "Inactive wrestlers are hidden" note plus a
  **"Show inactive"** toggle (`includeInactive=true`) rendering those rows dimmed with an
  `INACTIVE` badge. The **All-time** view shows everyone with no note.
- **`components/admin/ManagePlayers.tsx`** — the override UI lives here:
  - Active/Inactive badge per player, marked `(override)` when forced.
  - A three-state control per player — **Auto / Force active / Force inactive** — calling
    `PUT /players/{id}/active-status` with `null` / `true` / `false`. A small select or
    segmented control fits the existing row layout better than a checkbox, because
    "auto" is a real third state, not the absence of a choice.
  - Disable the control with an explanatory tooltip when there is no active season.
  - A "Recompute active status" admin button hitting the backfill endpoint.
- **`components/contenders/*`**, championship pages — no change expected once the API
  filters; verify champions still render when inactive.
- i18n: add keys to `frontend/src/i18n/locales/en.json` and `de.json`
  (`standings.inactiveHidden`, `standings.showInactive`, `common.active`,
  `common.inactive`, `admin.players.activeStatus.{auto,forceActive,forceInactive,
  overridden,noActiveSeason,recompute}`).

---

## Tests

- `backend/lib/__tests__/activeStatus.test.ts` — helper truth table: derived active /
  inactive, override true / false, **stale override from a previous season is ignored**,
  `activeSeasonId === undefined`.
- `recordResult` test: all participants (winners, losers, draw) get
  `lastActiveSeasonId` set; a match with no `seasonId` sets nothing.
- `getStandings` tests: all-time returns everyone; season view hides inactive;
  `includeInactive=true` returns them flagged; past-season query unaffected by the
  current-season flag.
- `getContenders` test: an inactive contender is dropped, ranks renumber contiguously,
  and an inactive **champion** still appears in `currentChampion`.
- `setActiveStatus` test: sets/clears the override, stamps the active season, 409s with
  no active season.
- Division listing test: inactive players excluded.
- Matchmaking / scheduling test: inactive players still selectable (regression guard).
- Frontend: `Standings.test.tsx` for the toggle and badge;
  `ManagePlayers.test.tsx` for the three-state override control.

---

## Rollout

1. Deploy backend (field is additive; absent field = inactive).
2. Run `POST /admin/recompute-active-status` against dev, then prod, to backfill.
   **Before the backfill runs, everyone reads as inactive** — so ship the backfill in the
   same deploy window as the frontend filter, or standings will briefly appear empty.
3. Deploy frontend.
4. Update `CLAUDE.md` with the Active/Inactive rule and the backfill endpoint.

---

## Decisions (confirmed)

1. **Activity is season-scoped.** Matches with no `seasonId` do not make anyone active.
2. **All-time standings show everyone**; season standings show active only.
3. **Champions always appear as belt holders**, active or not.
4. **Manual override supported**, managed from Manage Players, season-scoped so it
   expires at rollover.
5. **Divisions: active only.** Matchmaking, scheduling and any picker needed to *get* a
   match stay unfiltered.

## Remaining unknowns (resolve during implementation, no decision needed)

- Which handler actually materialises a division's player list.
- Whether any path other than `recordResult` can set a match to `completed`
  (`updateMatch`, tournament progression, `seedData`) and therefore also needs to mark
  activity.
- Whether dashboard / statistics / season awards should filter — report findings before
  changing them.
