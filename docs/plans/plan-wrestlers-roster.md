# Plan: Wrestler Roster Database (replace free-text `currentWrestler`)

**Status:** draft · **Author:** Claude (for jpDxsolo) · **Date:** 2026-04-21 · **Deliverable of this plan:** the plan doc itself. Implementation follows in a separate PR.

---

## 1. Goal

Replace the free-text `currentWrestler` / `alternateWrestler` inputs on Players with a managed roster table (`Wrestlers`). Admins curate the roster, import in bulk, toggle availability, and set each wrestler's Overall Cap. Players pick their wrestler from a searchable dropdown filtered to available entries.

### Why

- Free text allows typos, duplicates, and inconsistent casing — no canonical identity for a wrestler.
- Two players can silently claim the same wrestler.
- No place to store wrestler metadata (Promotion, Overall Cap) that the league wants to expose.
- Bulk roster setup (e.g. importing a WWE/AEW game roster at the start of a season) is impossible without a structured table.

---

## 2. Non-goals

- **No per-match wrestler swapping** — the roster assignment is per-Player, not per-Match. Same behavior as today's `currentWrestler` field.
- **No wrestler stats beyond Overall Cap in v1** — no weight class, height, finishers, etc. Keep the schema tight and extend later.
- **No public-facing wrestler profile pages** in v1. The public display keeps the status quo (wrestler name text next to player name).
- **No rework of fantasy economy.** `WrestlerCosts` remains keyed by `playerId`. We only link to `Wrestlers` optionally — see §9.
- **No merging of `alternateWrestler`** into the same field. Players still have primary + alternate; both become FK references to `Wrestlers`.

---

## 3. Data model

### 3.1 New table: `Wrestlers`

Declared in `backend/serverless.yml` alongside `DivisionsTable` / `StipulationsTable`:

```yaml
WrestlersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: ${self:provider.environment.WRESTLERS_TABLE}
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: wrestlerId
        AttributeType: S
      - AttributeName: promotion
        AttributeType: S
      - AttributeName: isInUse
        AttributeType: S   # stored as "true"/"false" since DynamoDB GSI keys can't be Bool
    KeySchema:
      - AttributeName: wrestlerId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: PromotionIndex
        KeySchema:
          - AttributeName: promotion
            KeyType: HASH
          - AttributeName: wrestlerId
            KeyType: RANGE
        Projection: { ProjectionType: ALL }
      - IndexName: AvailabilityIndex
        KeySchema:
          - AttributeName: isInUse
            KeyType: HASH
          - AttributeName: wrestlerId
            KeyType: RANGE
        Projection: { ProjectionType: ALL }
```

Add `WRESTLERS_TABLE: ${self:service}-wrestlers-${self:provider.stage}` to `provider.environment` and add the ARN + `/index/*` to the IAM block at [backend/serverless.yml:67-124](backend/serverless.yml#L67-L124).

### 3.2 TypeScript type

Add to `backend/lib/repositories/types.ts` and mirror in `frontend/src/types/index.ts`:

```typescript
export const WRESTLER_PROMOTIONS = [
  'AAA',
  'AEW',
  'NJPW',
  'ROH',
  'TNA',
  'WCW',
  'WWE',
  'OTHER',
] as const;
export type WrestlerPromotion = (typeof WRESTLER_PROMOTIONS)[number];

export const OVERALL_CAP_MIN = 70;
export const OVERALL_CAP_MAX = 93;

export interface Wrestler {
  wrestlerId: string;          // uuid
  promotion: WrestlerPromotion;    // enum, see WRESTLER_PROMOTIONS
  name: string;                // display name
  overallCap: number;          // 70-93 inclusive
  isInUse: boolean;            // derived from assignedPlayerId existence
  assignedPlayerId?: string;   // which player currently has it (primary OR alternate)
  assignedSlot?: 'primary' | 'alternate';
  createdAt: string;
  updatedAt: string;
}

export interface WrestlerCreateInput {
  promotion: WrestlerPromotion;
  name: string;
  overallCap: number;
}

export interface WrestlerPatch {
  promotion?: WrestlerPromotion;
  name?: string;
  overallCap?: number;
  isInUse?: boolean;           // admin override (e.g. benching a wrestler)
}
```

The `WRESTLER_PROMOTIONS` constant lives in a shared module (`backend/lib/repositories/types.ts` re-exported to the frontend via `frontend/src/types/index.ts`) so the dropdown options and server-side validation stay in sync. Adding a new promotion later = appending one string to the array.

Note: store `isInUse` on-disk as string `"true"`/`"false"` for GSI compatibility, but expose it as `boolean` through the repository layer.

### 3.3 Changes to existing tables

- **Players table**: add optional `currentWrestlerId?: string` and `alternateWrestlerId?: string`.
  - Keep `currentWrestler` and `alternateWrestler` string fields as **denormalized display caches** — populated on write from the wrestler's name. This avoids a join on every read (Standings, Dashboard, PublicProfile all read `player.currentWrestler` today).
  - During migration, the string fields remain authoritative for existing rows that don't yet have a `wrestlerId`.
- **WrestlerCosts**: no schema change. See §9.

### 3.4 Uniqueness

No enforced uniqueness at the DynamoDB level on `(promotion, name)` — that would require a second table or conditional writes. Instead, the `POST /wrestlers` handler does a scan-with-filter pre-check, and the bulk import dedupes within the payload. Document this as "best-effort unique" and add a follow-up todo to migrate to Postgres where a UNIQUE constraint is natural.

---

## 4. Backend changes

### 4.1 New repository

`backend/lib/repositories/WrestlersRepository.ts` — extend the existing `RosterRepository` aggregate ([backend/lib/repositories/RosterRepository.ts:158-169](backend/lib/repositories/RosterRepository.ts#L158-L169)) to include `wrestlers`:

```typescript
export interface WrestlersMethods extends CrudRepository<Wrestler, WrestlerCreateInput, WrestlerPatch> {
  listByPromotion(promotion: string): Promise<Wrestler[]>;
  listAvailable(): Promise<Wrestler[]>;
  findByName(promotion: string, name: string): Promise<Wrestler | null>;
  bulkCreate(inputs: WrestlerCreateInput[]): Promise<{ created: number; skipped: number }>;
}

export interface RosterRepository {
  players: /* unchanged */;
  tagTeams: /* unchanged */;
  stables: StablesMethods;
  overalls: OverallsMethods;
  transfers: TransfersMethods;
  wrestlers: WrestlersMethods;   // NEW
}
```

The Dynamo implementation uses the factory pattern from the existing `Divisions` / `Stipulations` repos as a template.

### 4.2 Unit of Work extension

Add to `backend/lib/repositories/unitOfWork.ts` (interface at [backend/lib/repositories/unitOfWork.ts:25-78](backend/lib/repositories/unitOfWork.ts#L25-L78)):

```typescript
interface UnitOfWork {
  // ... existing ...
  assignWrestlerToPlayer(params: {
    wrestlerId: string;
    playerId: string;
    slot: 'primary' | 'alternate';
  }): void;

  releaseWrestlerFromPlayer(params: {
    wrestlerId: string;
  }): void;
}
```

Both methods stage a single TransactWriteItem per call so the caller can combine them with the matching `updatePlayer(...)` in one atomic commit.

### 4.3 New handlers

Create `backend/functions/wrestlers/` using handler factories ([backend/lib/handlers.ts:40-199](backend/lib/handlers.ts#L40-L199)) — **no direct `dynamoDb` imports**, per CLAUDE.md repo pattern rules.

| Handler | Factory | Required fields | Notes |
|---|---|---|---|
| `createWrestler.ts` | `createHandlerFactory` | `promotion, name, overallCap` | Admin only. Pre-check duplicate by (promotion, name). Sets `isInUse=false`. |
| `listWrestlers.ts` | `listHandlerFactory` | — | Public. Supports `?promotion=`, `?available=true` query params via `validate` hook. |
| `getWrestler.ts` | `getHandlerFactory` | — | Public. |
| `updateWrestler.ts` | `updateHandlerFactory` | — | Admin only. Allows `promotion, name, overallCap, isInUse`. If toggling `isInUse=false` while assigned, must also clear the corresponding player field (transactional). |
| `deleteWrestler.ts` | `deleteHandlerFactory` | — | Admin only. Refuse if `isInUse=true` with a 409 Conflict — admin must reassign the player first. |
| `importWrestlers.ts` | custom (see §7) | `wrestlers: WrestlerCreateInput[]` | Admin only. Loops `bulkCreate`. Returns `{ created, skipped, errors }`. |

### 4.4 Updated handlers

- `backend/functions/players/createPlayer.ts` ([backend/functions/players/createPlayer.ts:1-21](backend/functions/players/createPlayer.ts#L1-L21)):
  - Accept optional `currentWrestlerId` and `alternateWrestlerId`. If present, `validate()` looks up each wrestler, confirms `isInUse=false` (or already assigned to this player), and on success wraps the create in `runInTransaction` with `assignWrestlerToPlayer` calls. The denormalized `currentWrestler` / `alternateWrestler` strings are populated from the looked-up wrestler's `name`.
  - Keep the existing free-string path working during migration (see §6) — if only `currentWrestler` string is provided, behave as today.
- `backend/functions/players/updatePlayer.ts` ([backend/functions/players/updatePlayer.ts:1-94](backend/functions/players/updatePlayer.ts#L1-L94)):
  - Handle transitions: assign new wrestler ↔ release old wrestler in one transaction. Mirror the logic for `alternateWrestlerId`.
  - If the request sets `currentWrestlerId: null`, clear the assignment and release the wrestler.
- `backend/functions/players/deletePlayer.ts`:
  - Release both assigned wrestlers (if any) in the same transaction as the player delete.
- `backend/functions/players/updateMyProfile.ts` ([backend/functions/players/updateMyProfile.ts](backend/functions/players/updateMyProfile.ts)):
  - Replace the free-string field in `ALLOWED_FIELDS` with `currentWrestlerId` / `alternateWrestlerId`. Users choose from available wrestlers; same availability + transaction rules as admin update.

### 4.5 Serverless events

Add to `backend/serverless.yml` (template from divisions block at [backend/serverless.yml:600-622](backend/serverless.yml#L600-L622)):

```yaml
wrestlers:
  handler: functions/wrestlers/handler.handler
  events:
    - http: { path: wrestlers, method: get,  cors: *corsConfig }
    - http: { path: wrestlers/{wrestlerId}, method: get, cors: *corsConfig }
    - http: { path: wrestlers, method: post, cors: *corsConfig, authorizer: adminAuthorizer }
    - http: { path: wrestlers/{wrestlerId}, method: put, cors: *corsConfig, authorizer: adminAuthorizer }
    - http: { path: wrestlers/{wrestlerId}, method: delete, cors: *corsConfig, authorizer: adminAuthorizer }
    - http: { path: wrestlers/import, method: post, cors: *corsConfig, authorizer: adminAuthorizer }
```

---

## 5. Frontend changes

### 5.1 New API client

`frontend/src/services/api/wrestlers.api.ts` using `createCrudApi` ([frontend/src/services/api/crudFactory.ts:10-36](frontend/src/services/api/crudFactory.ts#L10-L36)) + a handwritten `importBulk` call (since bulk is not in the generic factory). Re-export from `frontend/src/services/api/index.ts`.

### 5.2 Updated `ManagePlayers.tsx`

[frontend/src/components/admin/ManagePlayers.tsx:28-36](frontend/src/components/admin/ManagePlayers.tsx#L28-L36) and [:281-290](frontend/src/components/admin/ManagePlayers.tsx#L281-L290):

- Replace the two `<input type="text">` boxes for `currentWrestler` and `alternateWrestler` with a searchable, grouped dropdown (native `<select>` with `<optgroup>` by Promotion is fine for v1; a combobox can follow).
- Data source: `wrestlersApi.getAll()` called on mount. Filter the options to `isInUse=false` **plus** the player's current selection (so an edit form still shows the current pick).
- Each option label: `{name} — {overallCap}` with `optgroup label={promotion}`.
- Form state holds `currentWrestlerId` / `alternateWrestlerId` instead of the string fields.
- On submit, send the IDs. Backend denormalizes the names.

### 5.3 New `ManageWrestlers.tsx`

New admin page (sibling of `ManageDivisions.tsx`) with:

- Table: `Promotion | Name | Overall Cap | In Use | Assigned To | Actions`.
- Create form: Promotion, Name, Overall Cap.
- Per-row edit of `overallCap` and `isInUse` toggle.
- Delete button (disabled + tooltip if `isInUse=true`).
- "Import from file" button opens a modal with file upload (JSON or CSV) — parses client-side, previews the row count, then POSTs to `/wrestlers/import`. On success shows `{ created, skipped }` summary.
- Filter bar: Promotion dropdown + "Show only available" toggle.

Add a nav entry in `AdminPanel.tsx` under the roster section.

### 5.4 Public display (no change)

`Standings.tsx:264,286`, `PublicProfile.tsx:177`, `WrestlerProfile.tsx`, and `Dashboard.ts:125/211/219/286/298` all continue to read `player.currentWrestler`. Because we keep the denormalized string, these screens don't need changes.

### 5.5 Types

Update `frontend/src/types/index.ts`:

- `Player.currentWrestler` stays `string` (denormalized display cache). Add `currentWrestlerId?: string` and `alternateWrestlerId?: string`.
- Add `Wrestler` interface matching §3.2.

---

## 6. Migration

One-time script `backend/scripts/migrate-wrestlers-roster.ts`, invoked via `npm run migrate:wrestlers -- --stage=devtest`.

Steps:

1. **Scan Players.** Collect `(currentWrestler, alternateWrestler)` strings, trim/dedupe case-insensitively.
2. **Create a `Wrestler` row per unique string** with `promotion = "Unknown"`, `overallCap = 0`, `isInUse` set according to whether it's claimed by a live player. Track a map `normalizedName -> wrestlerId`.
3. **Back-fill Players**: for each player, set `currentWrestlerId` / `alternateWrestlerId` from the map. Leave the existing string field in place (denormalized cache).
4. **Write assignedPlayerId + assignedSlot** on each claimed wrestler row.
5. Log a summary `{ wrestlersCreated, playersLinked, conflictsDetected }`. Conflicts (two players claiming the same wrestler name exactly) are logged but not auto-resolved — admin fixes via `ManageWrestlers`.

Post-migration, admins iterate through `ManageWrestlers` to set real Promotion values and Overall Caps. A follow-up cleanup PR can drop the free-string field once every Player has `currentWrestlerId` and every consumer reads from the denormalized string (no code change needed to drop it; we just stop writing it).

**Rollback:** the migration is additive — it only writes new rows and adds new fields. Rollback = drop the `Wrestlers` table and ignore the new FK fields on Players.

---

## 7. Import format

### 7.1 JSON

```json
{
  "wrestlers": [
    { "promotion": "WWE",  "name": "Cody Rhodes",      "overallCap": 94 },
    { "promotion": "AEW",  "name": "Kenny Omega",      "overallCap": 95 },
    { "promotion": "NJPW", "name": "Kazuchika Okada",  "overallCap": 96 }
  ]
}
```

### 7.2 CSV (client parses, sends JSON)

```
promotion,name,overallCap
WWE,Cody Rhodes,94
AEW,Kenny Omega,95
NJPW,Kazuchika Okada,96
```

### 7.3 Validation

- `promotion` required, must be one of `WRESTLER_PROMOTIONS` (case-sensitive match; CSV parser uppercases before validating so `wwe` → `WWE`). Unknown values → reject with `errors[].reason = "unknown promotion"`; the admin can edit the CSV or remap to `OTHER`.
- `name` required, non-empty, ≤128 chars.
- `overallCap` required, integer, **70–93 inclusive**. Out-of-range → reject with `errors[].reason = "overallCap out of range"`.
- Duplicate detection:
  - Within the payload — dedupe by `(promotion, name.toLowerCase())`, keep the first.
  - Against existing rows — scan once at the start, build a set, skip matches.
- Response: `{ created: number, skipped: number, errors: Array<{ row: number, reason: string }> }`.

---

## 8. Availability lifecycle (transactional)

The invariant: **each wrestler is assigned to at most one `(playerId, slot)` pair.** Two players can't both hold `wrestler_123` as primary, and one player can't have the same wrestler as both primary and alternate.

Enforced via `runInTransaction` ([backend/lib/repositories/unitOfWork.ts:25-78](backend/lib/repositories/unitOfWork.ts#L25-L78)) on every create/update that touches wrestler FKs:

```typescript
await runInTransaction(async (tx) => {
  if (oldWrestlerId) {
    tx.releaseWrestlerFromPlayer({ wrestlerId: oldWrestlerId });
  }
  if (newWrestlerId) {
    tx.assignWrestlerToPlayer({
      wrestlerId: newWrestlerId,
      playerId,
      slot: 'primary',
    });
  }
  tx.updatePlayer(playerId, {
    currentWrestlerId: newWrestlerId ?? null,
    currentWrestler: newWrestlerName ?? null,
  });
});
```

The `assignWrestlerToPlayer` stage uses a `ConditionExpression: attribute_not_exists(assignedPlayerId)` to prevent two concurrent callers from double-claiming. If the condition fails, the transaction aborts with 409 Conflict.

**Admin override** (`PUT /wrestlers/{id}` with `isInUse=false`): if the wrestler is currently assigned, the handler also clears the linked player's `current/alternateWrestlerId` in the same transaction. This is a "benching" action — use with care; the plan should surface a confirmation modal in the UI.

---

## 9. Relationship to `WrestlerCosts`

**Decision: keep separate, link later if needed.**

Rationale:
- `WrestlerCosts` is keyed by `playerId` ([backend/serverless.yml:1656-1668](backend/serverless.yml#L1656-L1668)), not by a wrestler identity. It models "what does this player's slot cost in fantasy," which is really a function of the player's performance, not the wrestler they currently play as.
- Renaming `WrestlerCosts` to `PlayerFantasyCosts` would be more accurate but is out-of-scope here.
- If we later want "cost follows the wrestler" (e.g. Cody Rhodes costs $10M regardless of who plays him), we'd add `wrestlerId` as an optional FK on `WrestlerCosts` and migrate — but that's a fantasy-rebalance decision, not a roster decision.

**Action in this plan:** none. Leave `WrestlerCosts` alone. Add a note to the follow-up todo list to evaluate wrestler-scoped fantasy costs once the roster is in production.

---

## 10. Rollout phases

| Phase | What ships | Gate before next phase |
|---|---|---|
| **P0 — Infrastructure** | `Wrestlers` table, repository, handlers, serverless events, API client. `ManageWrestlers` admin screen functional. No Player changes yet. | All P0 handlers unit-tested. Admin can create / list / update / delete / import wrestlers via UI. |
| **P1 — Player linkage** | `currentWrestlerId` + `alternateWrestlerId` added to Player. Create/Update/Delete handlers updated with transactional assignment. Migration script run on devtest. | Integration test: schedule a match using two players whose wrestlers were picked from the roster; record result; verify standings + recent form still render the wrestler names correctly. |
| **P2 — UI cutover** | `ManagePlayers` text inputs replaced with dropdown. `updateMyProfile` (self-service) switches to FK fields. | Manual QA on devtest: create new player, edit existing, delete player — all produce consistent assignment/release events on wrestlers. |
| **P3 — Production migration** | Run migration script on prod. Deploy frontend. | Smoke test: standings, dashboard, public profile, fantasy all still display wrestler names. |
| **P4 — Cleanup (follow-up PR)** | Drop the requirement to send `currentWrestler` string in API requests (handlers compute it from FK). Consider dropping the denormalized cache if we're willing to accept a join cost. | — |

P0 and P1 can ship in the same PR; P2 is a separate PR to keep review scope sane.

---

## 11. Testing

- **Repository unit tests** (`backend/lib/repositories/__tests__/wrestlers.test.ts`): CRUD, listByPromotion, listAvailable, bulkCreate dedupe, findByName.
- **Unit of Work tests**: assign + release transactional semantics, including the `attribute_not_exists` condition failure path.
- **Handler tests** per existing pattern — mock `getRepositories()` per CLAUDE.md guidance, not `@aws-sdk/lib-dynamodb`.
- **Integration test** (new, under `backend/__tests__/integration/`): full flow of create-wrestler → create-player-with-wrestler → update-player-to-different-wrestler → verify old wrestler released, new one claimed.
- **Frontend tests**: `ManagePlayers` renders grouped dropdown; `ManageWrestlers` import modal previews + submits; API client `importBulk` handles partial success responses.
- **Migration dry-run mode**: `migrate-wrestlers-roster.ts --dry-run` prints the summary without writes.

---

## 12. Open questions

1. **Wrestler image** — defer to v2. The existing `Player.imageUrl` is per-player (e.g. the real-life person's photo or avatar), not per-wrestler, so adding `Wrestler.imageUrl` is additive and non-urgent.
2. **Contender rankings & championships** — both reference `playerId`, not wrestler identity, so no schema impact. Confirm during implementation.
3. **Tag teams** — `TagTeam` members are `playerId`s, not wrestler identities. Roster impact is zero; no changes.
4. **Soft vs hard delete** — current plan is hard delete with a 409 guard for assigned wrestlers. If admins want to archive historical rosters per-season, we'd switch to soft delete later.

### Resolved

- **Promotion values** — constrained enum `AAA | AEW | NJPW | ROH | TNA | WCW | WWE | OTHER`. Adding a promotion later = append one string to `WRESTLER_PROMOTIONS`.
- **Overall Cap range** — integer 70–93 inclusive.

---

## 13. Files touched (summary)

### New
- `backend/functions/wrestlers/{createWrestler,listWrestlers,getWrestler,updateWrestler,deleteWrestler,importWrestlers,handler}.ts`
- `backend/lib/repositories/WrestlersRepository.ts`
- `backend/lib/repositories/dynamo/DynamoWrestlersRepository.ts`
- `backend/scripts/migrate-wrestlers-roster.ts`
- `frontend/src/services/api/wrestlers.api.ts`
- `frontend/src/components/admin/ManageWrestlers.tsx` (+ CSS)

### Modified
- `backend/serverless.yml` — add table, env var, IAM, 6 HTTP events
- `backend/lib/repositories/types.ts` — `Wrestler`, `WrestlerCreateInput`, `WrestlerPatch`; extend `Player` with FK fields
- `backend/lib/repositories/RosterRepository.ts` — add `wrestlers` to aggregate
- `backend/lib/repositories/unitOfWork.ts` — add `assignWrestlerToPlayer` / `releaseWrestlerFromPlayer`
- `backend/lib/repositories/index.ts` — wire new repo into factory
- `backend/functions/players/{createPlayer,updatePlayer,deletePlayer,updateMyProfile}.ts` — accept FK fields, transactional assignment
- `backend/scripts/seed-data.ts` — seed a small wrestler roster for dev
- `frontend/src/types/index.ts` — `Wrestler` type, `Player.currentWrestlerId/alternateWrestlerId`
- `frontend/src/services/api/index.ts` — re-export `wrestlersApi`
- `frontend/src/components/admin/ManagePlayers.tsx` — dropdown instead of text input
- `frontend/src/components/admin/AdminPanel.tsx` — add "Manage Wrestlers" nav entry

### Untouched (by design)
- `backend/serverless.yml` `WrestlerCostsTable` block — see §9
- `frontend/src/components/Standings.tsx`, `PublicProfile.tsx`, `Dashboard.tsx`, `WrestlerProfile.tsx` — keep reading `player.currentWrestler` string
