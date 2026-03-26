# Plan: Contender Manual Ranking Overrides

## Summary

Add the ability for admins to manually override contender rankings for any championship, supporting "bump to #1" and "send to bottom" operations. Overrides are purely positional adjustments that do not create artificial wins or losses. They are stored in a separate DynamoDB table so they survive the existing "delete all, rewrite" recalculation cycle. The algorithmic ranking remains the baseline source of truth; overrides are applied as a post-processing layer after each recalculation.

## Approach

### Chosen Design: Separate CONTENDER_OVERRIDES Table

Overrides are persisted in a new `CONTENDER_OVERRIDES` DynamoDB table, independent from `CONTENDER_RANKINGS`. When `calculateRankings` runs, it:
1. Computes algorithmic rankings as today
2. Reads active overrides for the championship
3. Applies positional adjustments (bump to #1, send to bottom)
4. Writes the final adjusted rankings to `CONTENDER_RANKINGS`

Overrides are **permanent until explicitly removed** by an admin (or auto-removed by system events like becoming champion).

### Why Alternatives Were Rejected

**Alternative A: Add override fields to CONTENDER_RANKINGS table.**
Rejected because `calculateRankings` deletes all rows and rewrites them. Any override fields stored in `CONTENDER_RANKINGS` would be lost on every recalculation unless we added complex read-before-delete logic. A separate table is cleaner and survives the delete-rewrite cycle naturally.

**Alternative B: Time-limited overrides (auto-expire).**
Rejected as the primary mechanism because storyline decisions don't follow predictable timelines. An admin who bumps a player for a PPV storyline should decide when to remove it. However, we include an optional `expiresAt` field for admins who want auto-expiration as a convenience.

**Alternative C: Override the ranking score rather than the position.**
Rejected because artificially inflating/deflating scores would be misleading in the UI and could create confusing interactions with the algorithm's natural scoring. Position-based overrides are transparent: "this player is #1 because an admin placed them there."

## Data Model Changes

### New Table: CONTENDER_OVERRIDES

```
Table Name: ${service}-contender-overrides-${stage}
Billing: PAY_PER_REQUEST

Key Schema:
  PK: championshipId (S) - HASH
  SK: playerId (S) - RANGE

Attributes:
  championshipId: string    — which championship this override applies to
  playerId: string          — the overridden player
  overrideType: string      — "bump_to_top" | "send_to_bottom"
  reason: string            — admin-provided reason (required, for audit trail)
  createdBy: string         — username of admin who created the override
  createdAt: string         — ISO timestamp
  expiresAt?: string        — optional ISO timestamp for auto-expiration
  active: boolean           — true if override is currently applied

GSI: ActiveOverridesIndex
  PK: championshipId (S) - HASH
  SK: createdAt (S) - RANGE
  Projection: ALL
  (Used for listing active overrides per championship, sorted by creation date)
```

### Modifications to CONTENDER_RANKINGS Table

No schema changes. Two new optional attributes will be written to existing ranking items:

- `isOverridden: boolean` — true if this player's rank was adjusted by a manual override
- `overrideType: string` — "bump_to_top" | "send_to_bottom" (only present when isOverridden is true)
- `organicRank: number` — the algorithmic rank before override was applied (only present when isOverridden is true)

### Override History

Override creation/removal events are implicitly tracked because:
1. Each override record has `createdBy`, `createdAt`, and `reason`
2. Overrides are soft-deleted (set `active: false`) rather than hard-deleted, preserving a full audit trail
3. The existing `RANKING_HISTORY` weekly snapshots will capture the overridden ranks, and the `isOverridden` flag on each ranking record provides context

## Implementation Steps

### Step 1: Define TypeScript Types for Overrides
- **File**: `frontend/src/types/contender.ts` (modify)
- **Changes**: Add `ContenderOverride` interface and extend `ContenderWithPlayer` with optional override fields (`isOverridden`, `overrideType`, `organicRank`)
- **Dependencies**: None
- **Complexity**: S

```typescript
export type OverrideType = 'bump_to_top' | 'send_to_bottom';

export interface ContenderOverride {
  championshipId: string;
  playerId: string;
  overrideType: OverrideType;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  active: boolean;
}

// Add to ContenderWithPlayer:
//   isOverridden?: boolean;
//   overrideType?: OverrideType;
//   organicRank?: number;
```

### Step 2: Add DynamoDB Table Definition in serverless.yml
- **File**: `backend/serverless.yml` (modify)
- **Changes**:
  1. Add `CONTENDER_OVERRIDES_TABLE` environment variable (~line 24)
  2. Add IAM permissions for the new table (~line 70)
  3. Add `ContenderOverridesTable` CloudFormation resource (~after line 1137)
- **Dependencies**: None
- **Complexity**: S

```yaml
# Environment variable
CONTENDER_OVERRIDES_TABLE: ${self:service}-contender-overrides-${self:provider.stage}

# Resource definition
ContenderOverridesTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: ${self:provider.environment.CONTENDER_OVERRIDES_TABLE}
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: championshipId
        AttributeType: S
      - AttributeName: playerId
        AttributeType: S
      - AttributeName: createdAt
        AttributeType: S
    KeySchema:
      - AttributeName: championshipId
        KeyType: HASH
      - AttributeName: playerId
        KeyType: RANGE
    GlobalSecondaryIndexes:
      - IndexName: ActiveOverridesIndex
        KeySchema:
          - AttributeName: championshipId
            KeyType: HASH
          - AttributeName: createdAt
            KeyType: RANGE
        Projection:
          ProjectionType: ALL
```

### Step 3: Register Table Name in dynamodb.ts
- **File**: `backend/lib/dynamodb.ts` (modify)
- **Changes**: Add `CONTENDER_OVERRIDES: process.env.CONTENDER_OVERRIDES_TABLE!` to `TableNames` (~line 130)
- **Dependencies**: Step 2
- **Complexity**: S

### Step 4: Create Override Application Logic
- **File**: `backend/lib/overrideApplicator.ts` (create)
- **Changes**: Create a pure function that takes algorithmic `RankingResult[]` and active overrides, returns adjusted `RankingResult[]` with override metadata. This keeps the logic testable and separate from DB operations.
- **Dependencies**: Step 1, Step 3
- **Complexity**: M

The function signature:

```typescript
export interface RankingWithOverride extends RankingResult {
  isOverridden?: boolean;
  overrideType?: OverrideType;
  organicRank?: number;
}

export interface ActiveOverride {
  playerId: string;
  overrideType: OverrideType;
}

export function applyOverrides(
  rankings: RankingResult[],
  overrides: ActiveOverride[],
): RankingWithOverride[]
```

Algorithm:
1. Start with the algorithmic ranking list (already sorted by score, ranks assigned 1..N)
2. For each "bump_to_top" override: remove the player from their current position, insert at position 0, mark with `isOverridden: true`, `organicRank` = original rank
3. For each "send_to_bottom" override: remove the player from their current position, append at end, mark with `isOverridden: true`, `organicRank` = original rank
4. If both "bump_to_top" and "send_to_bottom" exist for the same player: the most recent override wins (caller should filter before passing, but as a safety the `bump_to_top` takes precedence since it's more intentional)
5. Re-number all ranks 1..N
6. Non-overridden players shift naturally to fill gaps

**Note**: If a "bump_to_top" player is NOT in the algorithmic rankings (e.g., doesn't meet minimum matches), they are NOT added — overrides can only adjust position of players already eligible. This is a deliberate constraint to avoid admins accidentally adding ineligible players.

### Step 5: Create Backend Handler for Setting Overrides
- **File**: `backend/functions/contenders/setOverride.ts` (create)
- **Changes**: POST endpoint to create/update an override. Validates:
  - Championship exists and is active
  - Player exists
  - Player is not the current champion of that championship
  - If championship is division-locked, player is in the correct division
  - Override type is valid
  - Reason is provided (non-empty string)
  - If player already has an active override for this championship, deactivate the old one first
- After creating the override, triggers a ranking recalculation for that championship
- **Dependencies**: Steps 2, 3, 4
- **Complexity**: M

Request body:
```typescript
interface SetOverrideBody {
  championshipId: string;
  playerId: string;
  overrideType: 'bump_to_top' | 'send_to_bottom';
  reason: string;
  expiresAt?: string; // optional ISO date
}
```

### Step 6: Create Backend Handler for Removing Overrides
- **File**: `backend/functions/contenders/removeOverride.ts` (create)
- **Changes**: DELETE endpoint to deactivate an override (soft-delete: sets `active: false`). Triggers ranking recalculation after removal.
- **Dependencies**: Steps 2, 3
- **Complexity**: S

### Step 7: Create Backend Handler for Listing Active Overrides
- **File**: `backend/functions/contenders/getOverrides.ts` (create)
- **Changes**: GET endpoint that returns all active overrides for a championship (or all championships if no ID specified). Used by the admin UI.
- **Dependencies**: Steps 2, 3
- **Complexity**: S

### Step 8: Update Contender Handler Router
- **File**: `backend/functions/contenders/handler.ts` (modify)
- **Changes**: Add routing for the three new endpoints:
  - `POST admin/contenders/overrides` → `setOverride`
  - `DELETE admin/contenders/overrides/{championshipId}/{playerId}` → `removeOverride`
  - `GET admin/contenders/overrides` (with optional `?championshipId=`) → `getOverrides`
- **Dependencies**: Steps 5, 6, 7
- **Complexity**: S

### Step 9: Add API Gateway Routes in serverless.yml
- **File**: `backend/serverless.yml` (modify)
- **Changes**: Add three new HTTP events to the `contenders` function definition (~line 572):
  ```yaml
  - http:
      path: admin/contenders/overrides
      method: post
      cors: *corsConfig
      authorizer: adminAuthorizer
  - http:
      path: admin/contenders/overrides/{championshipId}/{playerId}
      method: delete
      cors: *corsConfig
      authorizer: adminAuthorizer
  - http:
      path: admin/contenders/overrides
      method: get
      cors: *corsConfig
      authorizer: adminAuthorizer
  ```
- **Dependencies**: Step 8
- **Complexity**: S

### Step 10: Modify calculateRankings to Apply Overrides
- **File**: `backend/functions/contenders/calculateRankings.ts` (modify)
- **Changes**:
  1. After computing algorithmic rankings (line ~118), fetch active overrides for the championship from `CONTENDER_OVERRIDES` table
  2. Filter out expired overrides (check `expiresAt` if present)
  3. Call `applyOverrides()` from Step 4
  4. Write the adjusted rankings (with `isOverridden`, `overrideType`, `organicRank` fields) to `CONTENDER_RANKINGS`
  5. Include override metadata in `RANKING_HISTORY` entries
- **Dependencies**: Steps 3, 4
- **Complexity**: M

Key insertion point (after line 118, before line 121):
```typescript
// 2c-bis. Fetch and apply manual overrides
const activeOverrides = await dynamoDb.queryAll({
  TableName: TableNames.CONTENDER_OVERRIDES,
  KeyConditionExpression: 'championshipId = :cid',
  ExpressionAttributeValues: { ':cid': championshipId },
  FilterExpression: 'active = :true',
  ExpressionAttributeValues: { ':cid': championshipId, ':true': true },
});

// Filter expired overrides
const now = new Date().toISOString();
const validOverrides = activeOverrides
  .filter(o => !o.expiresAt || o.expiresAt > now)
  .map(o => ({ playerId: o.playerId as string, overrideType: o.overrideType as OverrideType }));

const adjustedRankings = applyOverrides(rankings, validOverrides);
```

### Step 11: Modify getContenders to Return Override Metadata
- **File**: `backend/functions/contenders/getContenders.ts` (modify)
- **Changes**: Include `isOverridden`, `overrideType`, and `organicRank` in the contender response objects (lines ~131-153). These fields are already persisted in `CONTENDER_RANKINGS` by Step 10, so this is just reading and passing them through.
- **Dependencies**: Step 10
- **Complexity**: S

Add to the contender map output (~line 138):
```typescript
isOverridden: ranking.isOverridden || false,
overrideType: ranking.overrideType || null,
organicRank: ranking.organicRank || null,
```

### Step 12: Auto-Remove Override When Player Becomes Champion
- **File**: `backend/functions/matches/recordResult.ts` (modify)
- **Changes**: After a championship title change (line ~363-431), if the new champion has an active override for that championship, deactivate it. This is ~10 lines of code added after the championship transaction.
- **Dependencies**: Step 3
- **Complexity**: S

```typescript
// After championship transaction completes, auto-remove override for new champion
if (!isTitleDefense) {
  const newChampionId = typeof newChampion === 'string' ? newChampion : newChampion[0];
  try {
    const existingOverride = await dynamoDb.get({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Key: { championshipId: match.championshipId, playerId: newChampionId },
    });
    if (existingOverride.Item && existingOverride.Item.active) {
      await dynamoDb.update({
        TableName: TableNames.CONTENDER_OVERRIDES,
        Key: { championshipId: match.championshipId, playerId: newChampionId },
        UpdateExpression: 'SET active = :false, removedAt = :now, removedReason = :reason',
        ExpressionAttributeValues: {
          ':false': false,
          ':now': new Date().toISOString(),
          ':reason': 'auto-removed: player became champion',
        },
      });
    }
  } catch (err) {
    console.warn('Failed to auto-remove contender override:', err);
  }
}
```

### Step 13: Add Frontend API Client Methods
- **File**: `frontend/src/services/api/contenders.api.ts` (modify)
- **Changes**: Add methods:
  - `setOverride(body: SetOverrideRequest): Promise<ContenderOverride>`
  - `removeOverride(championshipId: string, playerId: string): Promise<void>`
  - `getOverrides(championshipId?: string): Promise<ContenderOverride[]>`
- **Dependencies**: Step 1
- **Complexity**: S

### Step 14: Add i18n Translation Keys
- **Files**: `frontend/src/i18n/locales/en.json` and `frontend/src/i18n/locales/de.json` (modify)
- **Changes**: Add keys under `contenders.overrides` and `contenders.admin.overrides`:
- **Dependencies**: None
- **Complexity**: S

English keys:
```json
"contenders": {
  "overrides": {
    "badge": "Manual Override",
    "bumpedToTop": "Bumped to #1",
    "sentToBottom": "Sent to Bottom",
    "organicRank": "Algorithmic Rank: #{{rank}}",
    "overriddenBy": "Set by {{admin}}",
    "reason": "Reason: {{reason}}",
    "expires": "Expires: {{date}}"
  },
  "admin": {
    "overrides": {
      "title": "Manual Overrides",
      "subtitle": "Override contender positions for storyline or disciplinary reasons",
      "selectPlayer": "Select Player",
      "overrideType": "Override Type",
      "bumpToTop": "Bump to #1 Contender",
      "sendToBottom": "Send to Bottom",
      "reason": "Reason (required)",
      "reasonPlaceholder": "e.g., Storyline decision for upcoming PPV",
      "expiresAt": "Auto-expire (optional)",
      "apply": "Apply Override",
      "remove": "Remove Override",
      "confirmApply": "Are you sure you want to override {{player}}'s contender ranking for {{championship}}?",
      "confirmRemove": "Remove the override for {{player}}? Their rank will return to the algorithmic position on next recalculation.",
      "activeOverrides": "Active Overrides",
      "noOverrides": "No active overrides",
      "applySuccess": "Override applied for {{player}}",
      "removeSuccess": "Override removed for {{player}}",
      "errorNotEligible": "This player is not in the current rankings. They must meet minimum match requirements first.",
      "errorIsChampion": "Cannot override the current champion's ranking",
      "errorWrongDivision": "This player is not in the correct division for this championship"
    }
  }
}
```

German keys:
```json
"contenders": {
  "overrides": {
    "badge": "Manuelle Anpassung",
    "bumpedToTop": "Auf #1 gesetzt",
    "sentToBottom": "Ans Ende gesetzt",
    "organicRank": "Algorithmischer Rang: #{{rank}}",
    "overriddenBy": "Gesetzt von {{admin}}",
    "reason": "Grund: {{reason}}",
    "expires": "Läuft ab: {{date}}"
  },
  "admin": {
    "overrides": {
      "title": "Manuelle Anpassungen",
      "subtitle": "Herausforderer-Positionen für Storyline oder disziplinarische Gründe anpassen",
      "selectPlayer": "Spieler auswählen",
      "overrideType": "Anpassungstyp",
      "bumpToTop": "Auf #1 Herausforderer setzen",
      "sendToBottom": "Ans Ende setzen",
      "reason": "Grund (erforderlich)",
      "reasonPlaceholder": "z.B. Storyline-Entscheidung für kommendes PPV",
      "expiresAt": "Automatisch ablaufen (optional)",
      "apply": "Anpassung anwenden",
      "remove": "Anpassung entfernen",
      "confirmApply": "Möchten Sie wirklich das Ranking von {{player}} für {{championship}} anpassen?",
      "confirmRemove": "Anpassung für {{player}} entfernen? Der Rang wird bei der nächsten Berechnung auf die algorithmische Position zurückgesetzt.",
      "activeOverrides": "Aktive Anpassungen",
      "noOverrides": "Keine aktiven Anpassungen",
      "applySuccess": "Anpassung für {{player}} angewendet",
      "removeSuccess": "Anpassung für {{player}} entfernt",
      "errorNotEligible": "Dieser Spieler ist nicht in den aktuellen Rankings. Mindestanzahl an Kämpfen muss erfüllt sein.",
      "errorIsChampion": "Das Ranking des aktuellen Champions kann nicht angepasst werden",
      "errorWrongDivision": "Dieser Spieler ist nicht in der richtigen Division für diese Meisterschaft"
    }
  }
}
```

### Step 15: Create Admin Override Management Component
- **File**: `frontend/src/components/admin/AdminContenderOverrides.tsx` (create)
- **Changes**: New component with:
  1. Championship selector (reuse pattern from `AdminContenderConfig.tsx`)
  2. Player dropdown (filtered to eligible players for selected championship)
  3. Override type radio buttons (bump to #1 / send to bottom)
  4. Reason text input (required)
  5. Optional expiry date picker
  6. "Apply Override" button with confirmation dialog
  7. Active overrides list showing: player name, override type, reason, created by, created at, with "Remove" button
- **Dependencies**: Steps 13, 14
- **Complexity**: L

### Step 16: Create Admin Override Management CSS
- **File**: `frontend/src/components/admin/AdminContenderOverrides.css` (create)
- **Changes**: Styles for the override management component, following existing patterns from `AdminContenderConfig.css`
- **Dependencies**: Step 15
- **Complexity**: S

### Step 17: Add Override Badge to ContenderCard
- **File**: `frontend/src/components/contenders/ContenderCard.tsx` (modify)
- **Changes**:
  1. Update `ContenderCardProps` to use updated `ContenderWithPlayer` type (which now has optional override fields)
  2. Add an override badge/indicator when `contender.isOverridden` is true
  3. Show the organic rank in a tooltip or subtitle (e.g., "Algorithmic Rank: #3")
  4. Differentiate styling for "bump_to_top" vs "send_to_bottom" overrides
- **Dependencies**: Steps 1, 11, 14
- **Complexity**: S

Add after the top-contender badge (~line 92):
```tsx
{contender.isOverridden && (
  <div className={`override-badge ${contender.overrideType}`}>
    <span className="override-label">
      {contender.overrideType === 'bump_to_top'
        ? t('contenders.overrides.bumpedToTop')
        : t('contenders.overrides.sentToBottom')}
    </span>
    {contender.organicRank && (
      <span className="organic-rank">
        {t('contenders.overrides.organicRank', { rank: contender.organicRank })}
      </span>
    )}
  </div>
)}
```

### Step 18: Update ContenderCard CSS for Override Styling
- **File**: `frontend/src/components/contenders/ContenderCard.css` (modify)
- **Changes**: Add `.override-badge`, `.override-badge.bump_to_top`, `.override-badge.send_to_bottom`, `.organic-rank` styles
- **Dependencies**: Step 17
- **Complexity**: S

### Step 19: Register Override Management in Admin Panel
- **File**: `frontend/src/components/admin/AdminPanel.tsx` (modify)
- **Changes**: Add `AdminContenderOverrides` component to the admin panel navigation/sections, placed near the existing `AdminContenderConfig` section
- **Dependencies**: Step 15
- **Complexity**: S

### Step 20: Update seed-data and clear-data Scripts
- **File**: `backend/scripts/seed-data.ts` (modify)
- **Changes**: Add sample override data for testing (e.g., one "bump_to_top" override for a player)
- **File**: `backend/functions/admin/clearAll.ts` (modify)
- **Changes**: Add `clearTable('contenderOverrides', TableNames.CONTENDER_OVERRIDES, 'championshipId', 'playerId')` to the clear-all function
- **File**: `backend/functions/admin/seedData.ts` (modify)
- **Changes**: Add sample override to seed data
- **File**: `backend/functions/admin/dataTransferConfig.ts` (modify)
- **Changes**: Add contender overrides table to data transfer config
- **Dependencies**: Steps 2, 3
- **Complexity**: S

## Edge Case Handling

### 1. Overridden player becomes champion
**Resolution**: Handled in Step 12. When `recordResult.ts` processes a title change, it checks if the new champion has an active override for that championship and deactivates it with reason "auto-removed: player became champion". The next recalculation will naturally exclude the champion from contender rankings.

### 2. Overridden player is removed from the league
**Resolution**: When a player is deleted (`DELETE /players/{id}`), the override remains in the database but becomes inert. The `applyOverrides()` function in Step 4 only adjusts players who appear in the algorithmic rankings. Since a deleted player won't have matches, they won't appear in rankings, and the override has no effect. The override record persists for audit history. Optionally, the delete-player handler could deactivate overrides, but this is not strictly necessary.

### 3. Conflicting overrides: "bump to #1" and "send to bottom" for the same player
**Resolution**: The `setOverride` handler (Step 5) deactivates any existing active override for the same championship+player before creating a new one. It is impossible for both types to be active simultaneously. If a conflicting request arrives, the newer override replaces the older one.

### 4. Other players' ranks shift when someone is bumped to #1
**Resolution**: Handled naturally by the `applyOverrides()` function in Step 4. When a player is moved to position 0 (top), all other players shift down by one. When a player is moved to the end, players below their former position shift up by one. Final ranks are re-numbered sequentially (1..N).

### 5. Overridden player doesn't meet minimum match requirements
**Resolution**: The `applyOverrides()` function only adjusts players already present in the algorithmic rankings. If a player doesn't meet the minimum match requirement, they won't be in the rankings array and the override has no effect. The `setOverride` handler does NOT block creating the override (the player may meet requirements after their next match), but the response indicates whether the override is currently effective. The admin UI shows a warning via the `errorNotEligible` translation key.

### 6. Division-locked championship: override for a player not in the division
**Resolution**: The `setOverride` handler (Step 5) validates that the player belongs to the championship's division (if one exists). If not, it returns a 400 error with the `errorWrongDivision` message. This validation happens at override creation time, not at recalculation time.

### 7. Override expiration during recalculation
**Resolution**: Step 10 filters out expired overrides before applying them. When a recalculation runs, any override with `expiresAt` in the past is ignored (but not deactivated — a separate cleanup could be added later if needed). The next recalculation naturally drops the expired override.

### 8. Multiple "bump to #1" overrides for different players on the same championship
**Resolution**: The `applyOverrides()` function processes bump_to_top overrides in order of creation (oldest first). The most recently created bump_to_top player ends up at #1, and earlier bump_to_top players are at #2, #3, etc. This is deterministic and predictable. In practice, admins should only have one bump_to_top at a time, but the system handles multiples gracefully.

## Testing Strategy

### Unit Tests
- **`backend/lib/__tests__/overrideApplicator.test.ts`**: Test the pure `applyOverrides()` function:
  - Bump to #1: verify player moves to rank 1, others shift down
  - Send to bottom: verify player moves to last rank, others shift up
  - No overrides: verify rankings are unchanged
  - Override for player not in rankings: verify rankings are unchanged
  - Multiple overrides: verify correct ordering
  - Both bump_to_top and send_to_bottom for different players: verify correct positions

### Integration Tests
- **`backend/functions/contenders/__tests__/overrides.test.ts`**: Test the handler endpoints:
  - Create override: happy path
  - Create override: missing reason → 400
  - Create override: invalid override type → 400
  - Create override: player is current champion → 400
  - Create override: wrong division → 400
  - Remove override: happy path
  - Remove override: override doesn't exist → 404
  - List overrides: returns only active overrides
  - Recalculation: verify overrides are applied after calculation

### Manual Testing
- Seed data with an override, view contender rankings page, verify badge appears
- Apply override via admin UI, verify rankings update
- Record a match result, verify rankings recalculate with override preserved
- Have overridden player win championship, verify override auto-removed

## Migration Notes

### No Data Migration Required

This feature is purely additive:
1. A new DynamoDB table is created (no existing tables are modified structurally)
2. New optional attributes (`isOverridden`, `overrideType`, `organicRank`) are added to `CONTENDER_RANKINGS` items — DynamoDB is schemaless, so existing items simply won't have these attributes (which the code handles via `|| false` / `|| null` defaults)
3. The `CONTENDER_OVERRIDES` table starts empty
4. The next ranking recalculation after deployment will run as normal since there are no overrides to apply

### Deployment Order
1. Deploy backend first (creates new table, updates Lambda code)
2. Deploy frontend second (new admin UI and contender card updates)
3. No downtime required — the feature is dormant until an admin creates the first override
