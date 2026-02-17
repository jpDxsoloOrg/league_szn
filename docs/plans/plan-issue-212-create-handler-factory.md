# Plan: Create createCreateHandler() factory for CRUD create operations

**GitHub issue:** #212 — [Create createCreateHandler() factory for CRUD create operations](https://github.com/jpDxsolo/league_szn/issues/212)

## Context

Nine create handlers across the backend follow an almost identical pattern: parse JSON body, validate required fields, generate a UUID, add timestamps, conditionally add optional fields, DynamoDB put, return 201. The only differences are the table name, ID field name, field names, default values, and occasional pre-save validation logic (e.g., createSeason checks for an active season, createChampionship validates the `type` enum, createPlayer validates that a divisionId exists). Extracting a factory function into `backend/lib/handlers.ts` will eliminate ~250 lines of boilerplate while keeping each handler's unique behavior via configuration and hooks.

## Files to modify

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `backend/lib/handlers.ts` | Create | The factory function `createCreateHandler()` and its TypeScript types |
| 2 | `backend/lib/__tests__/handlers.test.ts` | Create | Unit tests for the factory |
| 3 | `backend/functions/divisions/createDivision.ts` | Modify | Replace with factory call (simplest handler — good first migration) |
| 4 | `backend/functions/stipulations/createStipulation.ts` | Modify | Replace with factory call (identical structure to divisions) |
| 5 | `backend/functions/matchTypes/createMatchType.ts` | Modify | Replace with factory call (identical structure to divisions) |
| 6 | `backend/functions/championships/createChampionship.ts` | Modify | Replace with factory call — needs `validate` hook for type enum check |
| 7 | `backend/functions/players/createPlayer.ts` | Modify | Replace with factory call — needs `validate` hook for divisionId lookup |
| 8 | `backend/functions/seasons/createSeason.ts` | Modify | Replace with factory call — needs `validate` hook for active season check |
| 9 | `backend/functions/events/createEvent.ts` | Modify | Replace with factory call — needs `validate` hook for eventType enum and has many defaults |
| 10 | `backend/functions/promos/createPromo.ts` | Evaluate | May NOT be a good candidate — uses auth context, player lookup via GSI, complex field assembly. Evaluate whether the factory adds value here or just adds forced abstraction. |
| 11 | `backend/functions/challenges/createChallenge.ts` | Evaluate | May NOT be a good candidate — uses auth context, self-challenge check, player existence validation. Same evaluation as promos. |

## Order of operations

### Step 1: Design and create the factory function (`backend/lib/handlers.ts`)

This is the foundation everything else depends on. The factory needs to handle the following patterns observed across all 9 handlers:

**What the config object should accept:**

- `tableName` — a key of `TableNames` (e.g., `'DIVISIONS'`) so the factory calls `TableNames[config.tableName]`
- `idField` — the name of the primary key field (e.g., `'divisionId'`, `'playerId'`, `'seasonId'`)
- `requiredFields` — array of field names that must be present in the body (used for validation and for the error message)
- `optionalFields` — array of field names that should be copied from body if present (the "if (body.x) { item.x = body.x }" pattern)
- `defaults` — object of field-name-to-value for fields that get a hardcoded default (e.g., `{ wins: 0, losses: 0, draws: 0 }` for players, `{ isActive: true }` for championships, `{ status: 'upcoming', matchCards: [] }` for events)
- `nullableFields` — array of field names that should be copied from body with `|| null` fallback (events use this pattern: `venue: body.venue || null`)
- `validate` — optional async function `(body, event) => APIGatewayProxyResult | null`. If it returns a response, that response is sent immediately (short-circuit). This handles createSeason's active-season check, createChampionship's enum validation, createPlayer's division lookup, and createEvent's eventType validation.
- `buildItem` — optional async function `(body, baseItem, event) => Record<string, unknown>`. For handlers that need to override or augment the default item assembly (e.g., createEvent sets `fantasyEnabled: true` regardless of body). If provided, its return value is used as the item instead of the auto-assembled one. This is the escape hatch for complex cases.
- `entityName` — string used in the error log message (e.g., `'division'`, `'player'`). Defaults to a lowercase version of the ID field minus "Id" suffix.

**The factory function's internal flow should be:**

1. Parse body using `parseBody()` (already exists in `backend/lib/parseBody.ts`)
2. Validate required fields are present — return `badRequest` with a message listing the missing fields
3. Call `validate(body, event)` hook if provided — return its result if non-null
4. Build the item: generate UUID for `idField`, copy `requiredFields` from body, copy `optionalFields` if present, apply `defaults`, apply `nullableFields` with `|| null`, add `createdAt` and `updatedAt` timestamps
5. If `buildItem` is provided, call it instead of step 4's auto-assembly (but still pass it the base item from step 4 so it can extend rather than replace)
6. DynamoDB put to `TableNames[config.tableName]`
7. Return `created(item)`
8. Catch errors and return `serverError('Failed to create <entityName>')`

**Important patterns to preserve:**

- The factory must use `parseBody<T>()` (not raw `JSON.parse`) so handlers that already migrated to `parseBody` keep the same behavior. Note: `createEvent`, `createPromo`, and `createChallenge` still use raw `JSON.parse` — migrating them to the factory will also standardize them onto `parseBody`.
- The return type must be `APIGatewayProxyHandler` to match what `serverless.yml` expects.
- All existing response helpers (`created`, `badRequest`, `serverError`, `notFound`, `conflict`) should be importable by the validate/buildItem hooks, not re-exported from the factory.

**Gotchas:**

- `createChampionship` does NOT use `updatedAt` — it only has `createdAt`. The factory should add both by default but allow `buildItem` to override. Alternatively, add a `timestamps` config option (`'both' | 'createdOnly'`), but that might be over-engineering. Start with always adding both — if the championship migration reveals this matters, add the option then.
- `createEvent` uses `|| null` for many optional fields (venue, description, imageUrl, etc.) rather than omitting them. This is different from `createDivision` which omits `description` if not provided. The `nullableFields` config handles this distinction.
- The `validate` hook must be async because createSeason's validation does a DynamoDB scan and createPlayer's does a DynamoDB get.

### Step 2: Write unit tests for the factory (`backend/lib/__tests__/handlers.test.ts`)

Before migrating any handlers, write tests for the factory itself. Follow the same test structure as `backend/functions/events/__tests__/createEvent.test.ts` — mock `dynamoDb`, `uuid`, use `makeEvent` helper.

**Test cases to cover:**

- Happy path: required fields only — returns 201 with correct item shape, UUID, and timestamps
- Happy path: required + optional fields — optional fields appear in item
- Happy path: required + nullable fields — nullable fields get `|| null` treatment
- Happy path: defaults are applied correctly
- Missing body — returns 400 "Request body is required"
- Invalid JSON — returns 400 "Invalid JSON in request body"
- Missing required field — returns 400 with descriptive message
- Validate hook returns an error — factory short-circuits with that error
- Validate hook returns null — factory proceeds normally
- buildItem hook overrides item assembly
- DynamoDB put fails — returns 500 with entity name in message
- Verify `parseBody` is used (not raw JSON.parse)

**Pattern to follow:** Look at `backend/lib/__tests__/parseBody.test.ts` for how lib tests are structured in this project.

### Step 3: Migrate the three simple handlers (divisions, stipulations, matchTypes)

These three are structurally identical — name is the only required field, description is the only optional field. Migrate them one at a time and run tests between each.

**For each handler:**

1. Replace the entire file contents with an import of `createCreateHandler` and a config object
2. The config should specify: `tableName`, `idField`, `requiredFields: ['name']`, `optionalFields: ['description']`, `entityName`
3. Remove the now-unused imports (`uuid`, `dynamoDb`, `TableNames`, `parseBody`, response helpers)
4. The resulting file should be ~10-15 lines instead of ~44

**Order within this step:** Do `createDivision.ts` first (it has an existing test at `backend/functions/divisions/__tests__/divisionsModify.test.ts`), then `createStipulation.ts`, then `createMatchType.ts`.

**Gotcha:** Stipulations and matchTypes use `Record<string, string>` for their item type instead of `Record<string, any>`. The factory should use `Record<string, unknown>`. This is fine — the existing type was overly narrow anyway (UUIDs and timestamps are strings, but the pattern should be flexible).

### Step 4: Migrate createChampionship

This handler has two special behaviors:
- Enum validation: `type` must be `'singles' | 'tag'`
- `currentChampion` is copied directly from body (not conditional — it can be undefined)
- `isActive` defaults to `true`
- No `updatedAt` field (only `createdAt`)

**Approach:**

- `requiredFields: ['name', 'type']`
- `optionalFields: ['currentChampion', 'divisionId', 'imageUrl']`
- `defaults: { isActive: true }`
- Add a `validate` hook that checks `if (!['singles', 'tag'].includes(body.type))` and returns `badRequest`
- For the missing `updatedAt`: either use `buildItem` to strip it, or accept the minor behavior change of adding `updatedAt`. Since `updatedAt` is harmless and would be useful for future update operations, adding it is probably the better choice. Note this in the PR description.

### Step 5: Migrate createPlayer

This handler has:
- Required: `name`, `currentWrestler`
- Optional: `imageUrl`, `divisionId`
- Defaults: `{ wins: 0, losses: 0, draws: 0 }`
- Validation: if `divisionId` is provided, look it up in DynamoDB and return 404 if not found

**Approach:**

- `requiredFields: ['name', 'currentWrestler']`
- `optionalFields: ['imageUrl']` — do NOT put divisionId here because it needs validation before being added
- `defaults: { wins: 0, losses: 0, draws: 0 }`
- `validate` hook: if `body.divisionId` is set, do the DynamoDB get and return `notFound` if missing. Return null otherwise.
- The validate hook should also add `divisionId` to the item... but the validate hook runs before item assembly. Two options: (a) use `buildItem` to handle the division addition, or (b) have the validate hook be a no-op and put `divisionId` in `optionalFields`, with the validation happening as a separate async check. Option (b) is cleaner — put `divisionId` in `optionalFields` and use `validate` purely for the existence check (return `notFound` if not found, null if found or not provided).

**Gotcha:** The existing handler checks `if (body.divisionId)` before doing the lookup. The validate hook must also only check when divisionId is present.

### Step 6: Migrate createSeason

This handler has:
- Required: `name`, `startDate`
- Optional: `endDate` (with `|| null` fallback)
- Defaults: `{ status: 'active' }`
- Validation: scan the Seasons table for any active season — return 409 `conflict` if found

**Approach:**

- `requiredFields: ['name', 'startDate']`
- `nullableFields: ['endDate']`
- `defaults: { status: 'active' }`
- `validate` hook: do the DynamoDB scan for active seasons, return `conflict(...)` if found

**Gotcha:** The validate hook needs access to `dynamoDb` and `TableNames` — it should import them directly. The factory doesn't need to provide them.

### Step 7: Migrate createEvent

This is the most complex of the "simple" handlers. It has:
- Required: `name`, `eventType`, `date`
- Enum validation: `eventType` must be one of `ppv`, `weekly`, `special`, `house`
- Many nullable fields: `venue`, `description`, `imageUrl`, `themeColor`, `seasonId`, `fantasyBudget`, `fantasyPicksPerDivision`
- Defaults: `{ status: 'upcoming', matchCards: [], attendance: null, rating: null, fantasyEnabled: true }`
- Does NOT use `parseBody` — uses raw `JSON.parse`. Migrating to factory standardizes this.

**Approach:**

- `requiredFields: ['name', 'eventType', 'date']`
- `nullableFields: ['venue', 'description', 'imageUrl', 'themeColor', 'seasonId', 'fantasyBudget', 'fantasyPicksPerDivision']`
- `defaults: { status: 'upcoming', matchCards: [], attendance: null, rating: null, fantasyEnabled: true }`
- `validate` hook: check eventType enum, return `badRequest` if invalid

**Gotcha:** The existing createEvent test (`backend/functions/events/__tests__/createEvent.test.ts`) tests for the exact error message "Request body is required" and "Invalid JSON in request body". After migration, these messages will come from `parseBody` instead of inline code. The messages are identical, so tests should pass without changes. But verify.

**Gotcha:** The existing test also checks that `body.fantasyEnabled` is `true` — this comes from the `defaults` config, not from the body. Make sure the factory applies defaults correctly even when the body doesn't include the field.

### Step 8: Evaluate createPromo and createChallenge

These two handlers are significantly different from the others:

**createPromo:**
- Uses `getAuthContext` and `hasRole` for authorization (role: Wrestler)
- Looks up the player via `UserIdIndex` GSI to get `playerId` from auth sub
- Has content length validation (min 50, max 2000 chars)
- Has a `VALID_PROMO_TYPES` enum check
- Assembles a complex item with nested objects (`reactions: {}`, `reactionCounts: { fire: 0, ... }`)

**createChallenge:**
- Uses `getAuthContext` and `hasRole` for authorization (role: Wrestler)
- Looks up the challenger's player via `UserIdIndex` GSI
- Validates challenger !== challenged
- Validates challenged player exists
- Calculates `expiresAt` (7 days from now)
- Uses `|| undefined` pattern (not `|| null`)

**Recommendation:** Do NOT migrate these two. The factory's value is in eliminating boilerplate for handlers that follow the standard pattern. Promos and challenges have enough unique logic (auth, player lookups, complex validation, non-standard item shapes) that forcing them into the factory would require so many hooks and overrides that the resulting code would be harder to read than the original. Leave them as-is and note in the PR that they were intentionally excluded.

If in the future more auth-aware create handlers emerge, consider a separate `createAuthenticatedCreateHandler` factory. But don't build it now.

## Dependencies between steps

- **Step 1 must be done first** — everything depends on the factory existing.
- **Step 2 should be done immediately after Step 1** — tests validate the factory before any migration.
- **Steps 3–7 are independent of each other** but should be done in the listed order (simplest to most complex) because each migration builds confidence and may reveal factory design issues that are cheaper to fix early.
- **Step 8 is independent** — it's an evaluation decision, not a code change.

**Suggested order:** Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Step 6 -> Step 7 -> Step 8

Steps 3–7 could technically be parallelized, but doing them sequentially (simple-to-complex) catches factory design issues early before they cascade.

## Testing and verification

**After Step 1+2:**
- Run `npm test` in `backend/` to verify factory tests pass
- Run full backend test suite to verify no regressions

**After each migration (Steps 3–7):**
- Run the specific domain's tests (e.g., `npx vitest run functions/divisions` after migrating createDivision)
- Run the full backend test suite after each migration to catch any breakage
- Manual verification: if running locally with `serverless-offline`, test each migrated endpoint with a quick POST request to confirm 201 response and correct item shape

**Existing tests that may be affected:**
- `backend/functions/events/__tests__/createEvent.test.ts` — should pass as-is since error messages match, but verify
- `backend/functions/divisions/__tests__/divisionsModify.test.ts` — if it tests createDivision, verify
- `backend/functions/seasons/__tests__/getAndCreateSeason.test.ts` — if it tests createSeason, verify
- `backend/functions/championships/__tests__/championships.test.ts` — if it tests createChampionship, verify
- `backend/functions/players/__tests__/players.test.ts` — if it tests createPlayer, verify

**New tests to write:**
- `backend/lib/__tests__/handlers.test.ts` — comprehensive factory tests (Step 2)
- Consider adding a thin integration-style test that creates a handler with a config and invokes it with a mock event, to verify the full flow end-to-end within the factory

## Risks and edge cases

- **Behavior change: `updatedAt` on championships.** The current createChampionship does not set `updatedAt`. The factory will add it by default. This is a harmless addition (extra field on a new item) but technically changes the API response shape. Document in the PR.
- **Behavior change: `parseBody` on createEvent.** createEvent currently uses raw `JSON.parse`. Migrating to the factory standardizes it to `parseBody`. The error messages are identical so this should be transparent, but verify the test suite.
- **Optional fields: `if (body.x)` vs `|| null` vs `|| undefined`.** The handlers use three different patterns for optional fields. The factory should clearly distinguish between "omit if falsy" (optionalFields), "include with null fallback" (nullableFields), and "include with undefined fallback" (currently only challenges, which are not being migrated). Document this distinction clearly in the factory's JSDoc.
- **Falsy value edge case:** The `if (body.x)` pattern used for optionalFields will skip `0`, `false`, and `""`. This matches the existing handler behavior, but be aware that if a field like `fantasyBudget` is `0`, the `|| null` pattern in nullableFields would correctly set it to `0` (since `0 || null` is `null` — actually this is wrong, `0 || null` evaluates to `null`). Consider using `body.x !== undefined && body.x !== null` for nullableFields instead of `body.x || null`. Or use `body.x ?? null` (nullish coalescing) which only falls back for `undefined` and `null`, preserving `0` and `false`. Use `??` for nullableFields.
- **TypeScript generics.** The factory should be generic on the body type so handlers keep type safety. The config should accept `<T>` and `parseBody<T>` should use it. This prevents `any` leaking into handler code.
- **Future extensibility.** The factory is designed for create operations only. Don't try to generalize it for update/delete/get — those have different enough patterns to warrant separate factories if needed later. Keep scope tight.
