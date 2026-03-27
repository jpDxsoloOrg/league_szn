# Implementation Plan: Stables and Tag Teams

## Executive Summary

This plan adds two interrelated group features to the league: **Stables** (groups of 2-6 players) and **Tag Teams** (exactly 2 players). Both follow the existing invitation/approval pattern established by the Challenges system. Stats are pre-computed and updated transactionally inside `recordResult.ts` (the same pattern used for player standings and season standings). Both features are gated behind a single `stables` feature flag in `SiteConfigContext`.

The implementation spans 5 phases, with each phase producing a deployable increment.

---

## 1. Data Model Design

### 1.1 Stables Table

```
Table: ${service}-stables-${stage}
PK: stableId (S)

Attributes:
  stableId: string          // uuid
  name: string              // stable display name
  leaderId: string          // playerId of leader/creator
  memberIds: string[]       // all member playerIds (including leader), 2-6 items
  imageUrl?: string         // optional stable logo/image
  status: 'pending' | 'approved' | 'active' | 'disbanded'
  wins: number              // aggregate all-time W
  losses: number            // aggregate all-time L
  draws: number             // aggregate all-time D
  createdAt: string
  updatedAt: string
  disbandedAt?: string

GSIs:
  LeaderIndex: PK=leaderId, SK=createdAt  (find stables by leader)
  StatusIndex: PK=status, SK=createdAt    (list active/pending stables)
```

**Rationale**: `memberIds` as a list attribute avoids a separate membership table. Since max 6 members, this is always a small array. The `status` field tracks the approval workflow: pending → approved → active (once leader + at least 1 invited member accept) → disbanded.

### 1.2 Tag Teams Table

```
Table: ${service}-tag-teams-${stage}
PK: tagTeamId (S)

Attributes:
  tagTeamId: string         // uuid
  name: string              // tag team display name
  player1Id: string         // first player (requestor)
  player2Id: string         // second player (invited)
  imageUrl?: string
  status: 'pending_partner' | 'pending_admin' | 'active' | 'dissolved'
  wins: number              // aggregate W from tag matches together
  losses: number
  draws: number
  createdAt: string
  updatedAt: string
  dissolvedAt?: string

GSIs:
  Player1Index: PK=player1Id, SK=createdAt
  Player2Index: PK=player2Id, SK=createdAt
  StatusIndex: PK=status, SK=createdAt
```

**Rationale**: Two separate player GSIs rather than a `memberIds` list because we always need to look up "which tag team does player X belong to" and DynamoDB cannot query inside a list attribute.

### 1.3 Stable Invitations Table

```
Table: ${service}-stable-invitations-${stage}
PK: invitationId (S)

Attributes:
  invitationId: string
  stableId: string
  invitedPlayerId: string
  invitedByPlayerId: string   // always the leader
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  message?: string
  expiresAt: string           // 7-day expiration (same as challenges)
  createdAt: string
  updatedAt: string

GSIs:
  StableIndex: PK=stableId, SK=createdAt
  InvitedPlayerIndex: PK=invitedPlayerId, SK=createdAt
```

**Rationale**: Separate table rather than embedding in Stables because invitations have their own lifecycle (expire, can be re-sent) and need efficient queries by invited player.

### 1.4 Players Table Additions

Add two optional attributes to the existing Players table (no schema migration needed for DynamoDB):
- `stableId?: string` — current stable membership (null if none)
- `tagTeamId?: string` — current tag team membership (null if none)

### 1.5 Head-to-Head Records

**Decision: Compute on read, not stored.** Head-to-head stable and tag team records are computed by scanning completed matches and cross-referencing membership. This avoids maintaining a combinatorial explosion of H2H records. For the detail page of a single stable/tag-team, the query cost is acceptable (scan completed matches, filter by participant membership). If performance becomes an issue later, a denormalized H2H table can be added.

### 1.6 Match-Type Breakdown

**Decision: Compute on read.** Same rationale as H2H. The stable/tag-team detail endpoint will scan completed matches and group by `matchFormat`. This keeps writes simple and avoids maintaining another denormalized table.

### 1.7 Season-Specific Stats

Add `StableSeasonStandings` and `TagTeamSeasonStandings` in Phase 5 following the exact pattern of `SeasonStandings`. For Phases 1-4, only all-time stats are tracked on the Stables/TagTeams tables directly.

---

## 2. Backend API Endpoints

All new endpoints use the consolidated handler pattern (single Lambda with router). Auth levels follow the existing role hierarchy.

### 2.1 Stables Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/stables` | Public | List all stables (filterable by `?status=active`) |
| `GET` | `/stables/{stableId}` | Public | Get stable detail (roster, stats, H2H, match-type breakdown) |
| `GET` | `/stables/standings` | Public | Stable standings (ranked by wins, with recentForm, streak) |
| `POST` | `/stables` | Wrestler | Request to create a stable (creates with status `pending`) |
| `PUT` | `/stables/{stableId}` | Wrestler/Admin | Update stable (name, image; leader or admin only) |
| `POST` | `/stables/{stableId}/approve` | Moderator | Admin approves a pending stable |
| `POST` | `/stables/{stableId}/reject` | Moderator | Admin rejects a pending stable |
| `POST` | `/stables/{stableId}/invite` | Wrestler | Leader invites a player (creates StableInvitation) |
| `POST` | `/stables/{stableId}/invitations/{invitationId}/respond` | Wrestler | Invited player accepts/declines |
| `POST` | `/stables/{stableId}/disband` | Wrestler/Admin | Disband stable (leader or admin) |
| `POST` | `/stables/{stableId}/remove-member` | Wrestler/Admin | Leader removes a member |
| `DELETE` | `/stables/{stableId}` | Admin | Hard delete (admin only, for cleanup) |

**Key Request/Response Shapes:**

`POST /stables`:
```json
Request: { "name": "string", "imageUrl?": "string" }
Response: { "stableId", "name", "leaderId", "memberIds": ["leaderId"], "status": "pending", ... }
```

`POST /stables/{stableId}/invite`:
```json
Request: { "playerId": "string", "message?": "string" }
Response: { "invitationId", "stableId", "invitedPlayerId", "status": "pending", "expiresAt", ... }
```

`POST /stables/{stableId}/invitations/{invitationId}/respond`:
```json
Request: { "action": "accept" | "decline" }
Response: { "invitation": { ...updated }, "stable": { ...updated memberIds if accepted } }
```

### 2.2 Tag Teams Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/tag-teams` | Public | List all tag teams (filterable by `?status=active`) |
| `GET` | `/tag-teams/{tagTeamId}` | Public | Get tag team detail (members, stats, H2H, match-type breakdown) |
| `GET` | `/tag-teams/standings` | Public | Tag team standings |
| `POST` | `/tag-teams` | Wrestler | Request to form a tag team (status `pending_partner`) |
| `PUT` | `/tag-teams/{tagTeamId}` | Wrestler/Admin | Update tag team (name, image) |
| `POST` | `/tag-teams/{tagTeamId}/respond` | Wrestler | Partner accepts/declines (moves to `pending_admin` or rejected) |
| `POST` | `/tag-teams/{tagTeamId}/approve` | Moderator | Admin approves |
| `POST` | `/tag-teams/{tagTeamId}/reject` | Moderator | Admin rejects |
| `POST` | `/tag-teams/{tagTeamId}/dissolve` | Wrestler/Admin | Either member or admin dissolves |
| `DELETE` | `/tag-teams/{tagTeamId}` | Admin | Hard delete |

`POST /tag-teams`:
```json
Request: { "name": "string", "partnerId": "string", "imageUrl?": "string" }
Response: { "tagTeamId", "name", "player1Id", "player2Id", "status": "pending_partner", ... }
```

### 2.3 Lambda Function Configuration (serverless.yml)

Two new consolidated Lambda functions:

```yaml
stables:
  handler: functions/stables/handler.handler
  events:
    - http: { path: stables, method: get, cors: true }
    - http: { path: stables/standings, method: get, cors: true }
    - http: { path: stables/{stableId}, method: get, cors: true }
    - http: { path: stables, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: stables/{stableId}, method: put, cors: true, authorizer: adminAuthorizer }
    - http: { path: stables/{stableId}/approve, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: stables/{stableId}/reject, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: stables/{stableId}/invite, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: stables/{stableId}/invitations/{invitationId}/respond, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: stables/{stableId}/disband, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: stables/{stableId}/remove-member, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: stables/{stableId}, method: delete, cors: true, authorizer: adminAuthorizer }

tagTeams:
  handler: functions/tagTeams/handler.handler
  events:
    - http: { path: tag-teams, method: get, cors: true }
    - http: { path: tag-teams/standings, method: get, cors: true }
    - http: { path: tag-teams/{tagTeamId}, method: get, cors: true }
    - http: { path: tag-teams, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: tag-teams/{tagTeamId}, method: put, cors: true, authorizer: adminAuthorizer }
    - http: { path: tag-teams/{tagTeamId}/respond, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: tag-teams/{tagTeamId}/approve, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: tag-teams/{tagTeamId}/reject, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: tag-teams/{tagTeamId}/dissolve, method: post, cors: true, authorizer: adminAuthorizer }
    - http: { path: tag-teams/{tagTeamId}, method: delete, cors: true, authorizer: adminAuthorizer }
```

---

## 3. Frontend Types, Pages & Components

### 3.1 New TypeScript Types

File: `frontend/src/types/stable.ts`
```
Stable, StableInvitation, StableWithMembers, StableStanding, CreateStableInput
```

File: `frontend/src/types/tagTeam.ts`
```
TagTeam, TagTeamWithPlayers, TagTeamStanding, CreateTagTeamInput
```

### 3.2 New API Service Files

- `frontend/src/services/api/stables.api.ts` — follows pattern of challenges API
- `frontend/src/services/api/tagTeams.api.ts`
- Export both from `frontend/src/services/api/index.ts`

### 3.3 New Routes (in App.tsx)

```
/stables                    -- Stables listing/standings (public, feature-gated)
/stables/:stableId          -- Stable detail page (public, feature-gated)
/tag-teams                  -- Tag teams listing/standings (public, feature-gated)
/tag-teams/:tagTeamId       -- Tag team detail page (public, feature-gated)
```

Admin management via existing `/admin/:tab` pattern:
- Tab: `stables` — Admin stable management
- Tab: `tag-teams` — Admin tag team management

### 3.4 Component Tree

```
frontend/src/components/
  stables/
    StablesList.tsx          -- Public listing of all active stables
    StablesList.css
    StableDetail.tsx         -- Detail page: roster, stats, H2H, match-type breakdown
    StableDetail.css
    StableStandings.tsx      -- Standings table (W/L/D, win%, form, streak)
    StableStandings.css
    StableCard.tsx           -- Card component for stable (reusable in lists)
    StableCard.css
    CreateStableModal.tsx    -- Wrestler-facing form to request a new stable
    CreateStableModal.css
    InviteToStableModal.tsx  -- Leader-facing form to invite a player
    InviteToStableModal.css
    MyStable.tsx             -- Wrestler's view of their own stable + pending invitations
    MyStable.css

  tagTeams/
    TagTeamsList.tsx         -- Public listing of all active tag teams
    TagTeamsList.css
    TagTeamDetail.tsx        -- Detail page: members, stats, H2H, match-type breakdown
    TagTeamDetail.css
    TagTeamStandings.tsx     -- Standings table
    TagTeamStandings.css
    TagTeamCard.tsx          -- Card component
    TagTeamCard.css
    CreateTagTeamModal.tsx   -- Wrestler-facing form to request a new tag team
    CreateTagTeamModal.css
    MyTagTeam.tsx            -- Wrestler's view of their tag team
    MyTagTeam.css

  admin/
    ManageStables.tsx        -- Admin: approve/reject pending stables, disband, manage
    ManageStables.css
    ManageTagTeams.tsx       -- Admin: approve/reject, dissolve, manage
    ManageTagTeams.css
```

### 3.5 Page Layouts

**Stable Detail Page** (`/stables/:stableId`):
1. Header: Stable name, logo, leader badge, status
2. Roster section: Member cards with individual W/L/D and link to player profile
3. Stats section: Overall W/L/D, win%, form (last 10 across all members), streak
4. Match-type breakdown table: rows per match format (singles, tag, triple-threat, etc.)
5. Head-to-head section: Table of other stables with W/L/D vs each
6. Recent matches: Last 10 matches involving any stable member

**Tag Team Detail Page** (`/tag-teams/:tagTeamId`):
1. Header: Tag team name, logo, both members
2. Stats section: W/L/D from tag matches together, win%, form, streak
3. Match-type breakdown table
4. Head-to-head section: vs other tag teams
5. Recent matches: Last 10 tag matches featuring this team

---

## 4. Integration with Existing Systems

### 4.1 recordResult.ts Integration (CRITICAL PATH)

After the existing core transaction and championship logic, add a new section:

**Stable stats update** (after the main transaction in current `recordResult.ts`):
1. For each participant in the match, look up their `stableId` (from Player record, already fetched or batch-get).
2. Group participants by stableId. For each unique stableId present:
   - If any member of that stable is in `winners` (and not a draw): increment stable's `wins` by 1.
   - If any member is in `losers`: increment stable's `losses` by 1.
   - If draw: increment stable's `draws` by 1.
   - **Important**: Each stable gets at most +1 per match result type, not +1 per member. If two members of the same stable both won, the stable still gets +1 win.

**Tag team stats update**:
1. For each participant, look up their `tagTeamId`.
2. A tag team match counts toward tag team stats only if BOTH members of the tag team are on the same team in this match.
3. Check: match has `teams` field, and both `player1Id` and `player2Id` of the tag team are in the same team array.
4. If so, and the team won: increment tag team `wins`. If lost: `losses`. If draw: `draws`.

**Implementation approach**: Extract the stable/tag-team stat update logic into a separate file `backend/functions/matches/updateGroupStats.ts` (called from `recordResult.ts`) to keep `recordResult.ts` under 300 lines. This function takes the match result and updates the Stables and TagTeams tables via separate `dynamoDb.update` calls (not in the main transaction, since these are non-critical side-effects — same pattern as event auto-complete and contender recalculation).

### 4.2 Feature Flag Integration

**Files to modify:**

1. `frontend/src/services/api/siteConfig.api.ts` — add `stables: boolean` to `SiteFeatures`
2. `frontend/src/contexts/SiteConfigContext.tsx` — add `stables: true` to `DEFAULT_FEATURES`
3. `frontend/src/components/admin/ManageFeatures.tsx` — add `stables` entry to `FEATURE_LABELS`
4. `backend/functions/admin/updateSiteConfig.ts` — add `'stables'` to `VALID_FEATURES` array
5. `frontend/src/components/Sidebar.tsx` — conditionally show Stables/Tag Teams nav items based on `features.stables`

The single `stables` flag gates both stables and tag teams (they are conceptually linked).

### 4.3 Challenge System Integration (Phase 5)

When a stable is active, members can issue challenges on behalf of the stable:
- Add optional `stableId` to the `CreateChallengeInput` type and Challenges table.
- When both challenger and challenged have stable memberships, the challenge UI can show "Stable vs Stable" framing.

### 4.4 Promo System Integration (Phase 4)

Stable creation narrative:
- When a stable is approved, optionally auto-create a promo of type `stable-formation` linking to the stable.
- When a player accepts a stable invitation, create a promo of type `stable-join`.
- When a stable is disbanded, create a promo of type `stable-disband`.
- Add `stableId` as an optional field on the Promos table.

### 4.5 Contender Rankings (Phase 5)

Tag team championships already exist (`type: 'tag'` in Championships table). The contender rankings system should be extended to support tag-team contenders:
- When computing contender rankings for a tag championship, rank tag teams (not individual players) by their tag team W/L/D.

### 4.6 Navigation Integration

In `Sidebar.tsx` and `TopNav.tsx`, add a "Factions" section (visible when `features.stables` is true) with:
- Stables
- Tag Teams

In `AdminPanel.tsx`, add tabs:
- Manage Stables
- Manage Tag Teams

### 4.7 Player Profile Integration

On the `WrestlerProfile` page, add:
- Current stable membership (with link to stable page)
- Current tag team membership (with link to tag team page)
- "Create Stable" / "Create Tag Team" buttons if not in one

---

## 5. Implementation Phases

### Phase 1: Data Model + Basic CRUD (Large)

**Entry criteria**: Feature branch created from `main`.

**Tasks**:
1. Add 3 new DynamoDB table definitions to `serverless.yml` (Stables, TagTeams, StableInvitations)
2. Add env vars and IAM permissions for new tables in `serverless.yml`
3. Add table names to `backend/lib/dynamodb.ts` `TableNames` object
4. Add `stables` to feature flag system (backend `VALID_FEATURES`, frontend `SiteFeatures`, `DEFAULT_FEATURES`, `ManageFeatures`)
5. Create `backend/functions/stables/` directory with handler files:
   - `handler.ts` (router)
   - `getStables.ts`, `getStable.ts` (public)
   - `createStable.ts` (Wrestler role, creates pending stable)
   - `updateStable.ts` (leader/admin)
   - `approveStable.ts`, `rejectStable.ts` (Moderator)
   - `inviteToStable.ts` (Wrestler, leader only)
   - `respondToInvitation.ts` (Wrestler, invited player)
   - `disbandStable.ts` (leader/admin)
   - `removeMember.ts` (leader/admin)
   - `deleteStable.ts` (Admin)
6. Create `backend/functions/tagTeams/` directory with handler files:
   - `handler.ts`, `getTagTeams.ts`, `getTagTeam.ts`, `createTagTeam.ts`, `updateTagTeam.ts`, `respondToTagTeam.ts`, `approveTagTeam.ts`, `rejectTagTeam.ts`, `dissolveTagTeam.ts`, `deleteTagTeam.ts`
7. Create TypeScript types: `frontend/src/types/stable.ts`, `frontend/src/types/tagTeam.ts`
8. Create API service files: `frontend/src/services/api/stables.api.ts`, `frontend/src/services/api/tagTeams.api.ts`
9. Export from `frontend/src/services/api/index.ts`
10. Add `stableId` and `tagTeamId` optional fields to Player type in `frontend/src/types/index.ts`

**Exit criteria**: All CRUD endpoints work locally via serverless-offline. Feature flag toggles stables on/off. No frontend pages yet.

### Phase 2: Frontend Pages - Listings & Detail (Medium)

**Entry criteria**: Phase 1 complete and merged.

**Tasks**:
1. Create `frontend/src/components/stables/` directory with:
   - `StablesList.tsx` + CSS
   - `StableDetail.tsx` + CSS
   - `StableCard.tsx` + CSS
2. Create `frontend/src/components/tagTeams/` directory with:
   - `TagTeamsList.tsx` + CSS
   - `TagTeamDetail.tsx` + CSS
   - `TagTeamCard.tsx` + CSS
3. Add routes in `App.tsx` wrapped in `FeatureRoute feature="stables"`
4. Add navigation items in `Sidebar.tsx` and `TopNav.tsx`
5. Add i18n keys in `en.json` and `de.json`

**Exit criteria**: Users can browse stables and tag teams, view detail pages (stats will be 0-0-0 since Phase 3 hasn't run).

### Phase 3: Stats Computation + recordResult Integration (Large)

**Entry criteria**: Phase 1 complete (Phase 2 can run in parallel).

**Tasks**:
1. Create `backend/functions/matches/updateGroupStats.ts`:
   - Function that takes match result data (winners, losers, isDraw, participants, teams)
   - Looks up stableId/tagTeamId for each participant
   - Updates Stables table W/L/D for affected stables
   - Updates TagTeams table W/L/D for affected tag teams (only if both members on same team)
2. Call `updateGroupStats` from `recordResult.ts` after the main transaction (non-transactional, try/catch with warning log on failure)
3. Create `backend/functions/stables/getStableStandings.ts`:
   - Query all active stables, compute recentForm and currentStreak by scanning recent completed matches
   - Return sorted by wins descending
4. Create `backend/functions/tagTeams/getTagTeamStandings.ts`:
   - Same pattern for tag teams
5. Enhance `getStable.ts` to compute and return:
   - Head-to-head records vs other stables (scan matches, group by opponent stable)
   - Match-type breakdown (scan matches, group by matchFormat)
6. Enhance `getTagTeam.ts` similarly
7. Create `frontend/src/components/stables/StableStandings.tsx` + CSS
8. Create `frontend/src/components/tagTeams/TagTeamStandings.tsx` + CSS

**Exit criteria**: Match results update stable/tag-team W/L/D. Standings pages show rankings with form and streak. Detail pages show H2H and match-type breakdown.

### Phase 4: Admin Management + User-Facing Flows (Medium)

**Entry criteria**: Phase 1 complete.

**Tasks**:
1. Create `frontend/src/components/admin/ManageStables.tsx` + CSS:
   - List pending stables with approve/reject buttons
   - List active stables with disband button
   - View stable roster, remove members
2. Create `frontend/src/components/admin/ManageTagTeams.tsx` + CSS:
   - List pending tag teams with approve/reject
   - List active tag teams with dissolve button
3. Register admin tabs in `AdminPanel.tsx`
4. Create wrestler-facing UI components:
   - `MyStable.tsx` — shows current stable, pending invitations to respond to, option to create
   - `CreateStableModal.tsx` — form for requesting new stable
   - `InviteToStableModal.tsx` — leader invites a player
   - `MyTagTeam.tsx` — shows current tag team, option to create
   - `CreateTagTeamModal.tsx` — form for requesting new tag team
5. Add "My Stable" / "My Tag Team" links in wrestler profile and/or sidebar (visible when logged in as Wrestler)
6. Promo integration: add `stableId` field to Promos table, auto-create promos on stable formation/join/disband events

**Exit criteria**: Full creation/invitation/approval workflow works end-to-end. Admin can manage all stables and tag teams. Promo feed shows stable events.

### Phase 5: Advanced Integration (Small)

**Entry criteria**: Phases 1-4 complete.

**Tasks**:
1. Season-specific stable/tag-team standings (new `StableSeasonStandings` and `TagTeamSeasonStandings` tables, update `recordResult.ts`)
2. Tag team contender rankings for tag championships
3. Stable vs stable challenges (add `stableId` to Challenges)
4. Seed data update (`backend/scripts/seed-data.ts`) to include sample stables and tag teams
5. Wiki articles for stables and tag teams
6. Dashboard integration: show active stables count in quickStats

**Exit criteria**: Full feature parity with player-level features.

---

## 6. Edge Cases & Considerations

### 6.1 Player Deletion
When a player who is in a stable is deleted:
- Remove them from the stable's `memberIds`
- If they were the leader, promote the next member (by join order) to leader. If no members remain, set stable status to `disbanded`
- Remove their `stableId`/`tagTeamId` from the player record
- Dissolve any tag team they belong to
- **Implementation**: Add checks in the existing `deletePlayer.ts` handler

### 6.2 Player Division Change
Division changes have no effect on stable/tag-team membership. Stables can span divisions. No action needed.

### 6.3 Constraint: One Stable, One Tag Team
When a player tries to join a stable and already has a `stableId`, return `badRequest('Player already belongs to a stable')`. Same for tag teams. Enforced in `respondToInvitation.ts` and `respondToTagTeam.ts`.

### 6.4 Tag Team Championships
The existing `Championship.type: 'tag'` and `currentChampion: string[]` already support tag team champions. When recording a tag match championship result, the `winners` array should contain both tag team member IDs. The tag team's `tagTeamId` should be stored on the championship record for display purposes. Add optional `tagTeamId` to Championships table.

### 6.5 Retroactive Stats from Existing Matches
Do NOT retroactively populate stats. The stable/tag-team stats start fresh from the moment they are created. Historical matches before stable formation do not count. This is simpler and avoids complex backfill logic. Document this in the wiki.

### 6.6 Performance Considerations
- Stable standings: scanning all completed matches for form/streak computation is acceptable for league sizes under ~1000 matches (same approach as current player standings). For larger leagues, consider a materialized view.
- H2H computation: for a single stable detail page, scanning matches and filtering is acceptable. The response should be cached client-side.
- The `updateGroupStats` function in `recordResult.ts` adds 2-4 DynamoDB operations per match result (lookup stableId/tagTeamId for participants, then update). This is acceptable latency since it runs after the main transaction.

### 6.7 Concurrent Membership Transitions
If a player accepts a stable invitation at the same time as being invited to another stable, the conditional write on `stableId` (only set if currently null) prevents double-membership. Use a `ConditionExpression: 'attribute_not_exists(stableId) OR stableId = :null'` on the Player update.

### 6.8 DynamoDB Transaction Limits
The stable/tag-team stats are updated outside the main transaction in `recordResult.ts` (separate `dynamoDb.update` calls). This avoids pushing the main transaction past the 100-item DynamoDB limit.

---

## 7. Files Requiring Modification (Existing)

| File | Change |
|------|--------|
| `backend/serverless.yml` | Add 3 table definitions, 2 Lambda functions, env vars, IAM permissions |
| `backend/lib/dynamodb.ts` | Add `STABLES`, `TAG_TEAMS`, `STABLE_INVITATIONS` to `TableNames` |
| `backend/functions/matches/recordResult.ts` | Call `updateGroupStats()` after main transaction |
| `backend/functions/admin/updateSiteConfig.ts` | Add `'stables'` to `VALID_FEATURES` |
| `frontend/src/types/index.ts` | Add `stableId?` and `tagTeamId?` to `Player` interface |
| `frontend/src/services/api/siteConfig.api.ts` | Add `stables: boolean` to `SiteFeatures` |
| `frontend/src/services/api/index.ts` | Export `stablesApi` and `tagTeamsApi` |
| `frontend/src/contexts/SiteConfigContext.tsx` | Add `stables: true` to `DEFAULT_FEATURES` |
| `frontend/src/components/admin/ManageFeatures.tsx` | Add `stables` to `FEATURE_LABELS` |
| `frontend/src/components/Sidebar.tsx` | Add Stables/Tag Teams nav items |
| `frontend/src/components/TopNav.tsx` | Add Stables/Tag Teams nav items |
| `frontend/src/components/admin/AdminPanel.tsx` | Add ManageStables and ManageTagTeams tabs |
| `frontend/src/App.tsx` | Add routes for `/stables`, `/stables/:stableId`, `/tag-teams`, `/tag-teams/:tagTeamId` |
| `frontend/src/i18n/locales/en.json` | Add all stables/tag-teams translation keys |
| `frontend/src/i18n/locales/de.json` | Add German translations |
| `backend/functions/players/deletePlayer.ts` | Add stable/tag-team cleanup on player deletion |
