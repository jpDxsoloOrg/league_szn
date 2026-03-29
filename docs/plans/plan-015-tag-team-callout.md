# Implementation Plan: Tag Team Call Outs

## Executive Summary

Extend the existing 1v1 challenge system to support tag team challenges. A player who belongs to an active tag team can issue a challenge on behalf of their entire tag team against another active tag team. Both members of the challenged tag team receive notifications and either member can accept, decline, or counter. Either member of the challenger's tag team can cancel. Existing 1v1 challenge functionality remains completely unchanged.

No new DynamoDB tables are needed. The existing Challenges table gains optional fields. No new GSIs are required — tag team challenges are discoverable via existing ChallengerIndex, ChallengedIndex, and StatusIndex because the `challengerId`/`challengedId` fields will store player IDs for tag team challenges too, differentiated by a new `challengeMode` field.

Total estimated: ~350 lines of changes across 13 files.

---

## 1. Data Model Changes

### 1.1 Challenges Table — New Optional Fields

Add these optional attributes to Challenge records (no table schema changes needed since DynamoDB is schemaless):

| Field | Type | Description |
|-------|------|-------------|
| `challengeMode` | `'singles' \| 'tag_team'` | Defaults to `'singles'` for backward compat |
| `challengerTagTeamId` | `string` (optional) | Set when `challengeMode === 'tag_team'` |
| `challengedTagTeamId` | `string` (optional) | Set when `challengeMode === 'tag_team'` |

**Design decision**: For tag team challenges, `challengerId` and `challengedId` still hold player IDs (the issuing player and a representative player from the challenged team). This preserves backward compatibility with existing GSIs (ChallengerIndex, ChallengedIndex). The `challengerTagTeamId` / `challengedTagTeamId` fields provide the tag team reference for enrichment.

**Alternative considered and rejected**: Using tag team IDs in `challengerId`/`challengedId` would break existing queries and require new GSIs.

### 1.2 No New GSIs Required

Tag team challenges are still discoverable via:
- **ChallengerIndex** (by the issuing player's playerId) — works because `challengerId` remains a player ID
- **ChallengedIndex** (by the challenged player's playerId) — works with enhancement (see getChallenges changes)
- **StatusIndex** (by status) — works unchanged

For MyChallenges, since a tag team has 2 members but only one is stored in `challengedId`, we need to also query for challenges where `challengedTagTeamId` matches the player's tag team. This is handled in getChallenges.

### 1.3 Enriched Response Changes

`ChallengeWithPlayers` gains optional tag team info:

```typescript
interface TagTeamChallengeInfo {
  tagTeamId: string;
  tagTeamName: string;
  player1: ChallengePlayerInfo;
  player2: ChallengePlayerInfo;
}

interface ChallengeWithPlayers extends Challenge {
  challengeMode: 'singles' | 'tag_team';
  challenger: ChallengePlayerInfo;         // kept for singles; for tag_team = issuing player
  challenged: ChallengePlayerInfo;         // kept for singles; for tag_team = representative player
  challengerTagTeam?: TagTeamChallengeInfo; // present when challengeMode === 'tag_team'
  challengedTagTeam?: TagTeamChallengeInfo; // present when challengeMode === 'tag_team'
}
```

---

## 2. File Inventory

**Files to Modify (13 total):**

| # | File | Change Summary |
|---|------|----------------|
| 1 | `frontend/src/types/challenge.ts` | Add challengeMode, tag team fields, TagTeamChallengeInfo interface |
| 2 | `backend/functions/challenges/createChallenge.ts` | Support tag_team challengeMode with validation + dual notifications |
| 3 | `backend/functions/challenges/respondToChallenge.ts` | Allow either challenged team member to respond |
| 4 | `backend/functions/challenges/cancelChallenge.ts` | Allow either challenger team member to cancel |
| 5 | `backend/functions/challenges/getChallenge.ts` | Enrich single challenge with tag team data |
| 6 | `backend/functions/challenges/getChallenges.ts` | Enrich list with tag team data; support tag team member queries |
| 7 | `frontend/src/services/api/challenges.api.ts` | Update CreateChallengeInput usage |
| 8 | `frontend/src/components/challenges/IssueChallenge.tsx` | Add singles/tag_team toggle + tag team picker |
| 9 | `frontend/src/components/challenges/ChallengeBoard.tsx` | Render tag team challenges with team names |
| 10 | `frontend/src/components/challenges/ChallengeDetail.tsx` | Show tag team info in detail view |
| 11 | `frontend/src/components/challenges/MyChallenges.tsx` | Include tag team challenges for both team members |
| 12 | `frontend/src/i18n/locales/en.json` | Add tag team challenge translation keys |
| 13 | `frontend/src/i18n/locales/de.json` | Add German translations |

**No new files needed.**

---

## 3. Implementation Steps

### Step 1: Update TypeScript Types (Frontend)

**File:** `frontend/src/types/challenge.ts`
**Changes:** ~25 lines added

- Add `TagTeamChallengeInfo` interface with `tagTeamId`, `tagTeamName`, `player1`, `player2`
- Add to `Challenge` interface:
  - `challengeMode?: 'singles' | 'tag_team'`
  - `challengerTagTeamId?: string`
  - `challengedTagTeamId?: string`
- Add to `ChallengeWithPlayers` interface:
  - `challengerTagTeam?: TagTeamChallengeInfo`
  - `challengedTagTeam?: TagTeamChallengeInfo`
- Add to `CreateChallengeInput`:
  - `challengeMode?: 'singles' | 'tag_team'`
  - `challengedTagTeamId?: string`

**Depends on:** Nothing

---

### Step 2: Backend — createChallenge.ts

**File:** `backend/functions/challenges/createChallenge.ts`
**Changes:** ~60 lines added, ~5 lines modified

- Add `challengeMode` and `challengedTagTeamId` to `CreateChallengeBody`
- Add helper function `findPlayerActiveTagTeam(playerId)`:
  - Query TagTeams table Player1Index and Player2Index in parallel
  - Filter for `status === 'active'`
  - Return first match or null
- When `challengeMode === 'tag_team'`:
  1. Require `challengedTagTeamId` (badRequest if missing)
  2. Find challenger's active tag team (badRequest if none)
  3. Fetch challenged tag team, validate it exists and is active
  4. Validate not challenging own tag team
  5. Store challenge with `challengeMode`, `challengerTagTeamId`, `challengedTagTeamId`
  6. Set `challengedId` to `challengedTagTeam.player1Id` (for GSI compatibility)
  7. Send notifications to BOTH members of challenged tag team (type: `'challenge_received'`, message references tag team name)
- When `challengeMode` absent or `'singles'`: existing logic unchanged, set `challengeMode: 'singles'`

**Depends on:** Step 1

---

### Step 3: Backend — respondToChallenge.ts

**File:** `backend/functions/challenges/respondToChallenge.ts`
**Changes:** ~15 lines modified

- After fetching challenge and responder's player record:
  - If `challenge.challengeMode === 'tag_team'`:
    - Fetch challenged tag team by `challenge.challengedTagTeamId`
    - Verify responder's playerId matches either `player1Id` or `player2Id`
    - If not, return forbidden `'Only members of the challenged tag team can respond'`
    - Also verify tag team status is still `'active'` (edge case 5.1)
  - If not tag team: existing logic unchanged
- For counter challenges from tag team challenges:
  - Inherit `challengeMode: 'tag_team'`
  - Swap: `challengerTagTeamId` = original `challengedTagTeamId`, `challengedTagTeamId` = original `challengerTagTeamId`

**Depends on:** Step 1

---

### Step 4: Backend — cancelChallenge.ts

**File:** `backend/functions/challenges/cancelChallenge.ts`
**Changes:** ~10 lines modified

- After fetching the challenge:
  - If `challenge.challengeMode === 'tag_team'`:
    - Fetch challenger's tag team by `challenge.challengerTagTeamId`
    - Verify canceller's playerId matches either `player1Id` or `player2Id`
    - If not, return forbidden `'Only members of the challenger tag team or an admin can cancel'`
  - If not tag team: existing logic unchanged

**Depends on:** Step 1

---

### Step 5: Backend — getChallenge.ts (single challenge enrichment)

**File:** `backend/functions/challenges/getChallenge.ts`
**Changes:** ~30 lines added

- After existing player enrichment:
  - If `challenge.challengeMode === 'tag_team'`:
    - Fetch both tag team records in parallel (`challengerTagTeamId`, `challengedTagTeamId`)
    - Fetch all 4 member players (2 per team) to build `TagTeamChallengeInfo` objects
    - Add `challengerTagTeam` and `challengedTagTeam` to enriched response
  - Add `challengeMode: challenge.challengeMode || 'singles'` to response

**Depends on:** Step 1

---

### Step 6: Backend — getChallenges.ts (list + tag team member queries)

**File:** `backend/functions/challenges/getChallenges.ts`
**Changes:** ~40 lines added

- **Tag team member query support** (when `playerId` filter provided):
  - After existing ChallengerIndex + ChallengedIndex queries:
  - Find player's active tag team (if any)
  - If found, additionally scan for challenges where `challengerTagTeamId` or `challengedTagTeamId` matches that tag team ID
  - Merge into deduplication set (by challengeId)
- **Enrichment** for tag team challenges:
  - Batch-fetch tag team records for all `tag_team` mode challenges
  - Batch-fetch member player records
  - Add `challengerTagTeam` and `challengedTagTeam` to each enriched response

**Depends on:** Step 1

---

### Step 7: Frontend — IssueChallenge.tsx

**File:** `frontend/src/components/challenges/IssueChallenge.tsx`
**Changes:** ~50 lines added, ~10 modified

- Add state: `challengeMode`, `tagTeams`, `playerTagTeam`, `selectedTagTeamId`
- In `useEffect`, also fetch `tagTeamsApi.getAll({ status: 'active' })`. Determine if current player is in an active tag team → set `playerTagTeam`
- **UI additions** (before opponent selector):
  - If `playerTagTeam` is not null: show radio buttons for "Singles Challenge" / "Tag Team Challenge"
  - If `playerTagTeam` is null: hide toggle (singles only)
- **When `challengeMode === 'tag_team'`**:
  - Replace opponent player `<select>` with tag team `<select>` (exclude own tag team)
  - Store in `selectedTagTeamId`
- **On submit**: Send `{ challengeMode: 'tag_team', challengedTagTeamId: selectedTagTeamId, challengedId: '', matchType, ... }`
- **Preview**: Show team names and both members when tag team mode

**Depends on:** Step 1, Step 11 (i18n keys)

---

### Step 8: Frontend — ChallengeBoard.tsx

**File:** `frontend/src/components/challenges/ChallengeBoard.tsx`
**Changes:** ~25 lines modified

- In challenge card rendering (`.challenge-versus` section):
  - If `challengeMode === 'tag_team'` and tag team data present:
    - Show tag team name as primary identifier
    - Show both member wrestler names below (smaller text)
  - If `'singles'` or absent: existing rendering unchanged
- Add a visual badge for tag team challenges: `t('challenges.board.tagTeamMatch')`

**Depends on:** Steps 1, 6, 11

---

### Step 9: Frontend — ChallengeDetail.tsx

**File:** `frontend/src/components/challenges/ChallengeDetail.tsx`
**Changes:** ~30 lines modified

- In versus section:
  - If `challengeMode === 'tag_team'`: show team name + both members, label "Challenger Team" / "Challenged Team"
  - Otherwise: existing display unchanged
- **Response actions**: Update `isReceived` check to include tag team membership:
  ```typescript
  const isReceived = challenge.challengedId === currentPlayerId ||
    (challenge.challengeMode === 'tag_team' &&
     challenge.challengedTagTeam &&
     (challenge.challengedTagTeam.player1.playerId === currentPlayerId ||
      challenge.challengedTagTeam.player2.playerId === currentPlayerId));
  ```
- Similarly update `isSent` for cancel button to include challenger tag team membership

**Depends on:** Steps 1, 5, 6, 11

---

### Step 10: Frontend — MyChallenges.tsx

**File:** `frontend/src/components/challenges/MyChallenges.tsx`
**Changes:** ~15 lines modified

- Update sent/received filtering to check tag team membership:
  ```typescript
  const sentChallenges = challenges.filter((c) =>
    c.challengerId === currentPlayerId ||
    (c.challengeMode === 'tag_team' && c.challengerTagTeam &&
     (c.challengerTagTeam.player1.playerId === currentPlayerId ||
      c.challengerTagTeam.player2.playerId === currentPlayerId))
  );
  ```
  Same pattern for `receivedChallenges`.
- In `renderChallengeItem`: when tag team mode, show opposing tag team name + members

**Depends on:** Steps 1, 6, 11

---

### Step 11: i18n Translation Keys

**File:** `frontend/src/i18n/locales/en.json`
**Changes:** ~15 lines added under `challenges`

```json
{
  "challenges": {
    "board": {
      "tagTeamMatch": "Tag Team Match"
    },
    "issue": {
      "challengeMode": "Challenge Type",
      "singlesChallenge": "Singles Challenge",
      "tagTeamChallenge": "Tag Team Challenge",
      "selectOpponentTeam": "Select Opponent Tag Team",
      "selectOpponentTeamPlaceholder": "Choose a tag team...",
      "noActiveTagTeam": "You must be in an active tag team to issue a tag team challenge",
      "onBehalfOf": "On behalf of"
    },
    "detail": {
      "challengerTeam": "Challenger Team",
      "challengedTeam": "Challenged Team"
    }
  }
}
```

**File:** `frontend/src/i18n/locales/de.json`
**Changes:** ~15 lines added (matching structure)

```json
{
  "challenges": {
    "board": {
      "tagTeamMatch": "Tag Team Match"
    },
    "issue": {
      "challengeMode": "Herausforderungstyp",
      "singlesChallenge": "Einzelkampf-Herausforderung",
      "tagTeamChallenge": "Tag Team-Herausforderung",
      "selectOpponentTeam": "Gegnerisches Tag Team wählen",
      "selectOpponentTeamPlaceholder": "Tag Team wählen...",
      "noActiveTagTeam": "Du musst in einem aktiven Tag Team sein, um eine Tag Team-Herausforderung auszusprechen",
      "onBehalfOf": "Im Namen von"
    },
    "detail": {
      "challengerTeam": "Herausforderer-Team",
      "challengedTeam": "Herausgefordertes Team"
    }
  }
}
```

**Depends on:** Nothing

---

## 4. Parallel Execution Groups

| Wave | Steps | Description |
|------|-------|-------------|
| **Wave 1** | Steps 1, 11 | Types + i18n (no dependencies) |
| **Wave 2** | Steps 2, 3, 4, 5, 6 | All backend handlers (depend on Wave 1 types) |
| **Wave 3** | Steps 7, 8, 9, 10 | All frontend components (depend on Wave 2 backend) |

---

## 5. Edge Cases

### 5.1 Tag team dissolved while challenge is pending
Let the challenge remain. When members try to respond, the backend checks tag team status. If dissolved, return badRequest `'The challenged tag team has been dissolved'`. The challenge expires after 7 days per existing TTL.

### 5.2 Member leaves a tag team with an active challenge
Tag teams dissolve entirely (`dissolveTagTeam` sets status to `'dissolved'`). No partial membership changes. Same handling as 5.1.

### 5.3 Tag team member has individual challenges simultaneously
**Allowed.** A player can have both singles challenges (as themselves) and tag team challenges (through their tag team) at the same time. These are independent.

### 5.4 Tag team challenges converting to tag team matches
**Out of scope.** When accepted, status becomes `'accepted'` like singles. Admin schedules the actual match. The `challengerTagTeamId`/`challengedTagTeamId` fields provide info for the admin.

### 5.5 Counter challenges for tag team challenges
Counter inherits `challengeMode: 'tag_team'` with swapped tag team IDs. The counter is also a tag team challenge.

### 5.6 Backward compatibility
Existing challenges have no `challengeMode` field. Frontend and backend treat missing `challengeMode` as `'singles'`. All existing GSI queries continue to work.

---

## 6. Testing/Verification Checklist

- [ ] Existing 1v1 challenge creation still works unchanged
- [ ] Existing 1v1 challenge response (accept/decline/counter) still works
- [ ] Existing 1v1 challenge cancellation still works
- [ ] Tag team challenge can be created by a member of an active tag team
- [ ] Tag team challenge creation fails if player has no active tag team
- [ ] Tag team challenge creation fails if challenged tag team is not active
- [ ] Tag team challenge creation fails if challenging own tag team
- [ ] Both members of challenged tag team receive notifications
- [ ] Either member of challenged tag team can accept/decline/counter
- [ ] Either member of challenger tag team can cancel
- [ ] ChallengeBoard shows tag team challenges with team names and member info
- [ ] ChallengeDetail shows full tag team info for tag team challenges
- [ ] MyChallenges shows tag team challenges for both team members
- [ ] IssueChallenge shows tag team toggle only when player is in an active tag team
- [ ] IssueChallenge shows tag team picker when tag team mode is selected
- [ ] Counter challenge from tag team challenge is also a tag team challenge
- [ ] Dissolved tag team → pending challenge returns descriptive error on respond
- [ ] All new UI text appears correctly in English and German
- [ ] TypeScript compiles with no errors (frontend: `npx tsc --project tsconfig.app.json --noEmit`, backend: `npx tsc --project tsconfig.json --noEmit`)

---

## 7. Rollback Considerations

- **No DynamoDB schema changes** — only optional fields added to existing records
- **No new tables or GSIs** — no infrastructure to roll back
- The `challengeMode` field defaults gracefully (missing = singles)
- If rolled back, existing tag team challenges display as singles challenges (degraded but not broken)
- No data migration needed in either direction
