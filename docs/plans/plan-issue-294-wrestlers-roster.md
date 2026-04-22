# Plan: Wrestler Roster Database (P0 — Infrastructure + Admin UI)

**GitHub issue:** [#294 Wrestler roster database (replace free-text currentWrestler)](https://github.com/jpDxsoloOrg/league_szn/issues/294)

**Design doc:** [`docs/plans/plan-wrestlers-roster.md`](plan-wrestlers-roster.md)

---

## Context

This PR ships **P0 only** from the design doc: the new `Wrestlers` DynamoDB table, the repository + handler layer, the `ManageWrestlers` admin screen, and the bulk-import endpoint. **No Player changes** (no FK fields, no migration, no `ManagePlayers` dropdown). Admins can curate the roster; players keep the existing free-text field until P1 ships.

### Decisions baked in

- **Promotion** is a string-literal enum — `AAA | AEW | NJPW | ROH | TNA | WCW | WWE | OTHER` — distinct from the existing `Companies` domain (which represents other leagues). The constant is `WRESTLER_PROMOTIONS`.
- **Overall Cap** is an integer, 70–93 inclusive.
- `isInUse` is stored on-disk as string `"true"` / `"false"` so it can be a GSI hash key; exposed as `boolean` by the repository.
- Wrestlers live under the existing `roster` aggregate (`RosterRepository.wrestlers`), alongside `players`, `tagTeams`, etc.
- Handler layer uses the existing handler factories from `backend/lib/handlers.ts` — **no direct `dynamoDb` imports**.
- The import endpoint rejects duplicate `(promotion, name)` pairs (case-insensitive on name) and returns a structured `{ created, skipped, errors[] }` response.

---

## Skills to use

| When | Skill | Purpose |
|---|---|---|
| During implementation | `code-reviewer` | Spot-check each agent's output for quality + convention alignment |
| Before commit | `verify-backend` | Run backend lint + tests |
| Before commit | `verify-frontend` | Run frontend lint + tests |
| Commit step | `git-commit-helper` | Generate conventional commit message |

---

## Agents and parallel work

Suggested order: `Wave 1 (A + B) -> Wave 2 (C + D) -> Wave 3 (verify)`

- **Wave 1** (two parallel agents, disjoint file ownership):
  - **Agent A** — `backend-api-architect`: Backend foundation (types, repository interface + Dynamo/InMemory impls, unit-of-work extensions, serverless.yml infrastructure).
  - **Agent B** — `general-purpose`: Frontend foundation (TypeScript types, API client, re-exports).
- **Wave 2** (two parallel agents, both depend on Wave 1):
  - **Agent C** — `backend-api-architect`: Backend handlers (6 wrestler endpoints + router + tests).
  - **Agent D** — `general-purpose`: Admin UI (`ManageWrestlers.tsx` + CSS + `AdminPanel` nav wiring).
- **Wave 3**: verification via `verify-backend` + `verify-frontend` skills (parallel), then commit + push + PR.

---

## Files to modify

### New files

| File | Purpose |
|---|---|
| `backend/functions/wrestlers/handler.ts` | Router — dispatches GET/POST/PUT/DELETE + `/import` |
| `backend/functions/wrestlers/createWrestler.ts` | `createHandlerFactory` |
| `backend/functions/wrestlers/listWrestlers.ts` | `listHandlerFactory` + optional filter hook (`?promotion=`, `?available=true`) |
| `backend/functions/wrestlers/getWrestler.ts` | `getHandlerFactory` |
| `backend/functions/wrestlers/updateWrestler.ts` | `updateHandlerFactory` |
| `backend/functions/wrestlers/deleteWrestler.ts` | `deleteHandlerFactory` with 409 guard when `isInUse=true` |
| `backend/functions/wrestlers/importWrestlers.ts` | Custom handler — bulk create w/ validation and dedupe |
| `backend/functions/wrestlers/__tests__/handler.test.ts` | Router routing test |
| `backend/functions/wrestlers/__tests__/createWrestler.test.ts` | Happy path + duplicate + invalid enum/cap |
| `backend/functions/wrestlers/__tests__/importWrestlers.test.ts` | Bulk happy path + per-row error reporting |
| `backend/lib/repositories/__tests__/wrestlers.test.ts` | Repository CRUD + `listByPromotion`/`listAvailable`/`findByName`/`bulkCreate` |
| `frontend/src/services/api/wrestlers.api.ts` | API client (CRUD + `importBulk`) |
| `frontend/src/components/admin/ManageWrestlers.tsx` | Admin screen |
| `frontend/src/components/admin/ManageWrestlers.css` | Styling (mirror `ManageDivisions.css`) |

### Modified files

| File | Action | Purpose |
|---|---|---|
| `backend/serverless.yml` | Edit | Add `WrestlersTable`, `WRESTLERS_TABLE` env var, IAM entry, `wrestlers` function block with 6 HTTP events |
| `backend/lib/repositories/types.ts` | Edit | Add `WRESTLER_PROMOTIONS` const, `WrestlerPromotion` type, `OVERALL_CAP_MIN`/`MAX`, `Wrestler`, `WrestlerCreateInput`, `WrestlerPatch`, `WrestlerImportResult` |
| `backend/lib/repositories/RosterRepository.ts` | Edit | Add `wrestlers: WrestlersMethods` to `RosterRepository` interface |
| `backend/lib/repositories/dynamo/DynamoRosterRepository.ts` | Edit | Add dynamo implementation of `wrestlers` sub-repo |
| `backend/lib/repositories/inMemory/InMemoryRosterRepository.ts` | Edit | Add in-memory `wrestlers` sub-repo (mirror pattern used for `players`) |
| `frontend/src/types/index.ts` | Edit | Add `WRESTLER_PROMOTIONS`, `WrestlerPromotion`, `Wrestler` (mirror backend) |
| `frontend/src/services/api/index.ts` | Edit | `export { wrestlersApi } from './wrestlers.api'` |
| `frontend/src/components/admin/AdminPanel.tsx` | Edit | Add `'wrestlers'` to `AdminTab` union, `VALID_TABS` array, and `tabContent` record |

### Untouched (by design)

- `Player` type, Player handlers, `ManagePlayers.tsx` — P1 work, deferred.
- `WrestlerCostsTable` — see design doc §9.
- `Companies` domain — unrelated (represents other leagues).

---

## Implementation steps

### Step 1 (Wave 1, Agent A): Backend foundation

**Files:** `backend/lib/repositories/types.ts`, `backend/lib/repositories/RosterRepository.ts`, `backend/lib/repositories/dynamo/DynamoRosterRepository.ts`, `backend/lib/repositories/inMemory/InMemoryRosterRepository.ts`, `backend/serverless.yml`.

**1a. Types** (`backend/lib/repositories/types.ts`):

Add the following block, after existing roster-related types:

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
  wrestlerId: string;
  promotion: WrestlerPromotion;
  name: string;
  overallCap: number;
  isInUse: boolean;
  assignedPlayerId?: string;
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
  isInUse?: boolean;
}

export interface WrestlerImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}
```

**1b. Repository interface** (`backend/lib/repositories/RosterRepository.ts`):

Extend the `RosterRepository` interface:

```typescript
export interface WrestlersMethods extends CrudRepository<Wrestler, WrestlerCreateInput, WrestlerPatch> {
  listByPromotion(promotion: WrestlerPromotion): Promise<Wrestler[]>;
  listAvailable(): Promise<Wrestler[]>;
  findByName(promotion: WrestlerPromotion, name: string): Promise<Wrestler | null>;
  bulkCreate(inputs: WrestlerCreateInput[]): Promise<WrestlerImportResult>;
}

export interface RosterRepository {
  players: /* unchanged */;
  tagTeams: /* unchanged */;
  stables: StablesMethods;
  overalls: OverallsMethods;
  transfers: TransfersMethods;
  wrestlers: WrestlersMethods;
}
```

Import `Wrestler`, `WrestlerCreateInput`, `WrestlerPatch`, `WrestlerPromotion`, `WrestlerImportResult` from `./types`.

**1c. Dynamo implementation** (`backend/lib/repositories/dynamo/DynamoRosterRepository.ts`):

Add a `wrestlers` property implementing `WrestlersMethods`. Wrap a `DynamoCrudRepository` for the base CRUD, then add the domain methods (`listByPromotion`, `listAvailable`, `findByName`, `bulkCreate`). Implementation hints:

- `listByPromotion(promotion)` → query `PromotionIndex` GSI with `promotion` as hash.
- `listAvailable()` → query `AvailabilityIndex` GSI with `isInUse = "false"`.
- `findByName(promotion, name)` → query `PromotionIndex` with `promotion` hash, then filter `name` case-insensitively in memory (case-folding is small-N).
- `bulkCreate(inputs)` → for each input: validate (see §Validation below), check duplicates via `findByName`, then `create`. Collect errors into `errors[]`.
- Persist `isInUse` on-disk as `"true"` / `"false"` strings; convert to `boolean` on read. Handle this in the `buildItem` / read transforms.

**1d. InMemory implementation** (`backend/lib/repositories/inMemory/InMemoryRosterRepository.ts`):

Mirror the same methods. Use a Map keyed by `wrestlerId`. Store `isInUse` as boolean natively (in-memory has no GSI constraint). This is for unit-test repos.

**1e. Serverless.yml** (`backend/serverless.yml`):

Four edits, all in-file:

1. Add env var near other table env vars:
   ```yaml
   WRESTLERS_TABLE: ${self:service}-wrestlers-${self:provider.stage}
   ```
2. Add IAM resource entries (in the `iamRoleStatements` DynamoDB block around lines 67–124):
   ```yaml
   - arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.WRESTLERS_TABLE}
   - arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.WRESTLERS_TABLE}/index/*
   ```
3. Add the function block (place alongside other CRUD-style functions, e.g. near `divisions` ~line 601):
   ```yaml
   wrestlers:
     handler: functions/wrestlers/handler.handler
     events:
       - http: { path: wrestlers, method: get, cors: *corsConfig }
       - http: { path: wrestlers/{wrestlerId}, method: get, cors: *corsConfig }
       - http: { path: wrestlers, method: post, cors: *corsConfig, authorizer: adminAuthorizer }
       - http: { path: wrestlers/{wrestlerId}, method: put, cors: *corsConfig, authorizer: adminAuthorizer }
       - http: { path: wrestlers/{wrestlerId}, method: delete, cors: *corsConfig, authorizer: adminAuthorizer }
       - http: { path: wrestlers/import, method: post, cors: *corsConfig, authorizer: adminAuthorizer }
   ```
4. Add the table resource (in the `resources.Resources` block, near `DivisionsTable` ~line 1478):
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
           AttributeType: S
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

**1f. Repository unit tests** (`backend/lib/repositories/__tests__/wrestlers.test.ts`):

Tests against the InMemory implementation:
- `create` returns entity with `isInUse: false` and generated `wrestlerId`, `createdAt`, `updatedAt`.
- `listByPromotion('WWE')` returns only WWE entries.
- `listAvailable()` filters `isInUse: true` entries out.
- `findByName` is case-insensitive on the `name` arg.
- `bulkCreate` dedupes within payload + against existing + reports per-row errors (invalid enum, out-of-range cap, missing name).
- Update `isInUse=true` without issue.

**Output of Step 1:** Types, repo interface + impls, serverless infra wired, repo tests passing. No handlers yet.

---

### Step 2 (Wave 1, Agent B): Frontend foundation

**Files:** `frontend/src/types/index.ts`, `frontend/src/services/api/wrestlers.api.ts` (new), `frontend/src/services/api/index.ts`.

**2a. Types** (`frontend/src/types/index.ts`):

Mirror the backend block:

```typescript
export const WRESTLER_PROMOTIONS = [
  'AAA', 'AEW', 'NJPW', 'ROH', 'TNA', 'WCW', 'WWE', 'OTHER',
] as const;
export type WrestlerPromotion = (typeof WRESTLER_PROMOTIONS)[number];

export const OVERALL_CAP_MIN = 70;
export const OVERALL_CAP_MAX = 93;

export interface Wrestler {
  wrestlerId: string;
  promotion: WrestlerPromotion;
  name: string;
  overallCap: number;
  isInUse: boolean;
  assignedPlayerId?: string;
  assignedSlot?: 'primary' | 'alternate';
  createdAt: string;
  updatedAt: string;
}

export interface WrestlerImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}
```

**2b. API client** (`frontend/src/services/api/wrestlers.api.ts`, new):

```typescript
import type { Wrestler, WrestlerImportResult, WrestlerPromotion } from '../../types';
import { createCrudApi } from './crudFactory';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

type WrestlerCreatePayload = {
  promotion: WrestlerPromotion;
  name: string;
  overallCap: number;
};

const baseCrud = createCrudApi<Wrestler, WrestlerCreatePayload>('wrestlers');

export const wrestlersApi = {
  getAll: async (signal?: AbortSignal): Promise<Wrestler[]> => baseCrud.getAll(signal),

  create: async (wrestler: WrestlerCreatePayload): Promise<Wrestler> => baseCrud.create(wrestler),

  update: async (wrestlerId: string, updates: Partial<Wrestler>): Promise<Wrestler> =>
    baseCrud.updateById(wrestlerId, updates),

  delete: async (wrestlerId: string): Promise<void> => baseCrud.deleteById(wrestlerId),

  importBulk: async (wrestlers: WrestlerCreatePayload[]): Promise<WrestlerImportResult> => {
    return fetchWithAuth(`${API_BASE_URL}/wrestlers/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wrestlers }),
    });
  },
};
```

**2c. Re-export** (`frontend/src/services/api/index.ts`):

Add one line alongside other domain re-exports:

```typescript
export { wrestlersApi } from './wrestlers.api';
```

**Output of Step 2:** Types + API client available for downstream UI work.

---

### Step 3 (Wave 2, Agent C): Backend handlers

**Files:** all under `backend/functions/wrestlers/`.

**3a. `createWrestler.ts`** — `createHandlerFactory`:

```typescript
import { createHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import {
  WRESTLER_PROMOTIONS, OVERALL_CAP_MIN, OVERALL_CAP_MAX,
  type Wrestler, type WrestlerCreateInput,
} from '../../lib/repositories/types';
import { badRequest } from '../../lib/response';

export const handler = createHandlerFactory<WrestlerCreateInput, Wrestler>({
  repo: () => getRepositories().roster.wrestlers,
  entityName: 'wrestler',
  requiredFields: ['promotion', 'name', 'overallCap'],
  validate: async (body) => {
    const { promotion, name, overallCap } = body as Partial<WrestlerCreateInput>;
    if (typeof promotion !== 'string' || !WRESTLER_PROMOTIONS.includes(promotion as never)) {
      return badRequest('promotion must be one of: ' + WRESTLER_PROMOTIONS.join(', '));
    }
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 128) {
      return badRequest('name must be a non-empty string up to 128 chars');
    }
    if (typeof overallCap !== 'number' || !Number.isInteger(overallCap) ||
        overallCap < OVERALL_CAP_MIN || overallCap > OVERALL_CAP_MAX) {
      return badRequest(`overallCap must be an integer between ${OVERALL_CAP_MIN} and ${OVERALL_CAP_MAX}`);
    }
    // Duplicate check
    const repo = getRepositories().roster.wrestlers;
    const existing = await repo.findByName(promotion as never, name);
    if (existing) return badRequest('a wrestler with this promotion + name already exists');
    return null;
  },
});
```

**3b. `listWrestlers.ts`** — `listHandlerFactory`, but with query-param filtering:

Use `listHandlerFactory<Wrestler>({ repo: () => getRepositories().roster.wrestlers, entityName: 'wrestlers' })` for the simple `GET /wrestlers` case. The factory will return all wrestlers. Query-string filtering (`?promotion=WWE`, `?available=true`) can be added as a thin wrapper around `listHandlerFactory`'s output — if needed, write a custom handler that checks `event.queryStringParameters` and delegates to `listByPromotion` / `listAvailable` / `list`.

**3c. `getWrestler.ts`** — `getHandlerFactory`:

```typescript
export const handler = getHandlerFactory<Wrestler>({
  repo: () => getRepositories().roster.wrestlers,
  entityName: 'wrestler',
  idParam: 'wrestlerId',
});
```

**3d. `updateWrestler.ts`** — `updateHandlerFactory`:

```typescript
export const handler = updateHandlerFactory<WrestlerPatch, Wrestler>({
  repo: () => getRepositories().roster.wrestlers,
  entityName: 'wrestler',
  idParam: 'wrestlerId',
  patchFields: ['promotion', 'name', 'overallCap', 'isInUse'],
});
```

Add a `validate` hook that re-runs the same promotion/cap checks as create when those fields are present. Also reject patches that transition from `isInUse=false` to `isInUse=true` when no `assignedPlayerId` — admin can only toggle `isInUse=false` on an assigned wrestler (the detach path is out of P0 scope; leave it as a simple boolean for now, documented in tests).

**3e. `deleteWrestler.ts`** — `deleteHandlerFactory` with `preDelete` guard:

```typescript
preDelete: async (id, wrestler) => {
  if (wrestler.isInUse) {
    throw { statusCode: 409, message: 'cannot delete a wrestler currently in use; release the assignment first' };
  }
},
```

Return the error as a `badRequest` / custom 409 response — match the pattern used by `deleteDivision.ts`.

**3f. `importWrestlers.ts`** — custom handler:

- Parse body: `{ wrestlers: Array<{ promotion, name, overallCap }> }`.
- Validate each row with the same rules as `createWrestler`. Accumulate errors with `{ row, reason }`.
- Dedupe within payload by `(promotion, name.toLowerCase())`, keep first.
- For remaining rows, call `repo.bulkCreate(...)`.
- Return 200 with `WrestlerImportResult`.

**3g. `handler.ts`** — router:

Mirror the divisions pattern (`backend/functions/divisions/handler.ts`). Routes:

```typescript
const routes = [
  { method: 'GET',    path: '/wrestlers',                handler: listHandler },
  { method: 'GET',    path: '/wrestlers/{wrestlerId}',   handler: getHandler },
  { method: 'POST',   path: '/wrestlers',                handler: createHandler },
  { method: 'PUT',    path: '/wrestlers/{wrestlerId}',   handler: updateHandler },
  { method: 'DELETE', path: '/wrestlers/{wrestlerId}',   handler: deleteHandler },
  { method: 'POST',   path: '/wrestlers/import',         handler: importHandler },
];
export const handler = createRouter(routes);
```

**3h. Tests** (`__tests__/*.test.ts`):

- `handler.test.ts`: router dispatches each path correctly (mock each sub-handler).
- `createWrestler.test.ts`: happy path, duplicate rejection, invalid promotion, invalid cap, missing fields.
- `importWrestlers.test.ts`: mixed valid/invalid rows produce correct `WrestlerImportResult`.

Mock `getRepositories()` per CLAUDE.md:
```typescript
vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({ roster: { wrestlers: mockRepo } }),
}));
```

**Output of Step 3:** Backend end-to-end. Admin API is live (pending deploy).

---

### Step 4 (Wave 2, Agent D): Admin UI

**Files:** `frontend/src/components/admin/ManageWrestlers.tsx` (new), `frontend/src/components/admin/ManageWrestlers.css` (new), `frontend/src/components/admin/AdminPanel.tsx` (edit).

**4a. `ManageWrestlers.tsx`** — mirror the structure of `ManageDivisions.tsx`:

- State: `wrestlers: Wrestler[]`, `loading`, `error`, `success`, `showAddForm`, `editingWrestler: Wrestler | null`, `deleting: string | null`, `formData: { promotion: WrestlerPromotion; name: string; overallCap: number }`, `filter: { promotion: WrestlerPromotion | ''; onlyAvailable: boolean }`, `showImport: boolean`.
- `useEffect` on mount → `wrestlersApi.getAll()`.
- `handleCreate`, `handleUpdate`, `handleDelete` — follow the existing handler pattern, with a confirmation modal for delete.
- Per-row edit uses inline form or opens the same form in edit mode (mirror `ManageDivisions`).
- Per-row "Release" button visible when `isInUse=true` — calls `wrestlersApi.update(id, { isInUse: false })` with a confirmation.
- Import modal:
  - File input accepting `.json` or `.csv`.
  - Parse client-side. For CSV, uppercase the `promotion` column before submit.
  - Preview: show first 5 rows + total row count.
  - On submit, `wrestlersApi.importBulk(rows)` → display `{ created, skipped, errors }` summary.
- Filter bar at the top: promotion dropdown (with "All"), "Show only available" checkbox. Filter client-side against the loaded list.
- Table columns: Promotion · Name · Overall Cap · In Use · Assigned To (displays `assignedPlayerId` — could be a playerId string in P0; P1 will join to player name) · Actions.
- Delete button disabled (+ tooltip) when `isInUse=true`.

**4b. `ManageWrestlers.css`** — styles consistent with `ManageDivisions.css`.

**4c. `AdminPanel.tsx`** — three edits:

1. Import: `import ManageWrestlers from './ManageWrestlers';`
2. `AdminTab` union: add `'wrestlers'`.
3. `VALID_TABS`: add `'wrestlers'`.
4. `tabContent`: add `wrestlers: <ManageWrestlers />`.
5. Nav list: add a "Manage Wrestlers" entry (use a mic/wrestler-ish icon if available, or reuse a generic roster icon).

Place the `'wrestlers'` entry alphabetically adjacent to the `'players'` / `'divisions'` / `'tag-teams'` roster group so it's discoverable.

**Output of Step 4:** Admin can now CRUD + import wrestlers from the UI.

---

### Step 5 (Wave 3): Verification

Run in parallel:

1. `verify-backend` skill (or `cd backend && npm run lint && npm test`).
2. `verify-frontend` skill (or `cd frontend && npm run lint && npx vitest run`).
3. TypeScript checks: `cd backend && npx tsc --project tsconfig.json --noEmit` and `cd frontend && npx tsc --project tsconfig.app.json --noEmit` (per CLAUDE.md pre-push requirement).

Fix issues up to 2 attempts, then escalate to the user if still failing.

---

### Step 6: Commit, push, PR

1. Stage every new + modified file under `backend/`, `frontend/`, and `docs/plans/`. Intentionally exclude `.claude/settings.json`, `.mcp.json`, `backend/neon/`, `whats-next.md` (unrelated local state).
2. Stage `TO-DOS.md` too (contains the wrestler roster todo + the three newer todos from this session — all related to pending wrestler/roster work).
3. Conventional commit via `git-commit-helper` skill. Suggested shape: `feat(wrestlers): add wrestler roster database + admin screen (P0 of #294)`.
4. `git push -u origin feat/294-wrestlers-roster`.
5. Open PR via `gh pr create` targeting `main`, title `Implements #294 — Wrestler roster database (P0)`, body references the issue and plan.

---

## Dependencies and order

**Suggested order:** `Step 1 + Step 2 -> Step 3 + Step 4 -> Step 5 -> Step 6`

- Steps 1 and 2 are independent (disjoint file ownership) and run in parallel in Wave 1.
- Step 3 depends on Step 1 (types, repo). Step 4 depends on Step 2 (API client, types). Steps 3 and 4 are independent of each other and run in parallel in Wave 2.
- Step 5 depends on all prior steps completing. Step 6 depends on Step 5 passing.

---

## Testing and verification

- **Backend**: `cd backend && npm run lint && npm test && npx tsc --project tsconfig.json --noEmit`
- **Frontend**: `cd frontend && npm run lint && npx vitest run && npx tsc --project tsconfig.app.json --noEmit`
- **Manual sanity** (post-deploy, not blocking this PR): deploy to devtest, open `/admin/wrestlers`, create a wrestler, import a 3-row CSV, toggle availability, attempt to delete an "in-use" wrestler (should 409).

---

## Risks and edge cases

1. **GSI key as string boolean** — `isInUse` on-disk is `"true"` / `"false"`. Every read must convert; every write must serialize. Enforce in `DynamoRosterRepository`'s `buildItem` / read transform. Drift risk if a caller writes a native boolean directly. Mitigation: only the repo layer touches the raw DynamoDB item; handlers never read/write raw items.
2. **Empty IAM region match** — The IAM block uses `${self:provider.region}` and `*` for account. New table arn must follow the exact same pattern as existing entries, or the Lambda will get AccessDenied at runtime.
3. **`isInUse=true` toggle without assignment** — Design doc says admin can bench, but P0 doesn't implement the full "bench" flow (which needs to clear the player's FK, a P1 concern). Keep P0 simple: allow `isInUse=true/false` patches, don't cross-reference Player. Document this in a comment on `updateWrestler.ts`.
4. **Import CSV / JSON parse errors** — Client-side parsing. If CSV has mismatched columns, reject with a clear client-side message; never send malformed rows to the server.
5. **Alphabetization of the `WRESTLER_PROMOTIONS` enum** — keep it alphabetical but with `OTHER` last. Add a lint comment.
6. **Case-insensitive name dedupe** — `findByName` compares lowercase. An admin who creates "Cody Rhodes" then tries to create "CODY RHODES" gets a 400. Document this in the duplicate error message.
7. **Router path ordering** — Put `/wrestlers/import` before `/wrestlers/{wrestlerId}` in the router so `import` isn't matched as a path param. Verify by test.
8. **Frontend type duplication** — We're duplicating `WRESTLER_PROMOTIONS` between backend and frontend instead of sharing. This matches the existing convention in this repo (types are mirrored, not shared). Follow that.
9. **Nav icon** — If no suitable icon exists, use a placeholder (a simple text label works). Don't block on icon design.
