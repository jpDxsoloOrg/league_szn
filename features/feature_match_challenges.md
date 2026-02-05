# Feature: Match Challenges

## Executive Summary

A wrestler-to-wrestler challenge system that allows players to formally call out opponents, creating storyline-driven match requests that build anticipation and engagement. Challenges can be accepted, declined, or countered with modified terms, mimicking the dramatic confrontations seen in professional wrestling.

## Problem Statement

Currently, matches are scheduled exclusively by administrators without any input from players themselves. This creates a passive experience where players wait to be booked rather than actively driving their own rivalries. In professional wrestling, some of the most memorable feuds begin with one wrestler calling out another - this organic storyline-building element is missing from the application.

## Goals

1. Allow players to challenge other players to matches
2. Enable challenged players to accept, decline, or counter-propose
3. Create a visible "challenge board" for drama and anticipation
4. Give admins control to approve/schedule accepted challenges
5. Track challenge history for potential rivalry features

## Non-Goals

1. Automatic match scheduling without admin approval
2. Real-time notifications (WebSockets) - out of scope
3. In-game chat or trash talk features
4. Betting or stakes attached to challenges

## Proposed Solution

### High-Level Architecture

```
+-------------------+       +-------------------+       +-------------------+
|   Frontend        |       |   API Gateway     |       |   Lambda          |
|   Challenge UI    | ----> |   /challenges     | ----> |   Functions       |
+-------------------+       +-------------------+       +-------------------+
                                                               |
                                                               v
                                                        +-------------------+
                                                        |   DynamoDB        |
                                                        |   Challenges      |
                                                        +-------------------+
```

### User Flow

1. Player A logs in and navigates to "Issue Challenge"
2. Player A selects opponent, match type, optional stipulation, and message
3. Challenge is created with status "pending"
4. Player B sees pending challenge in their inbox/challenge board
5. Player B can: Accept, Decline, or Counter (modify terms)
6. If accepted, admin is notified and can schedule the match
7. Admin schedules match, challenge status updates to "scheduled"

## Technical Specification

### Data Model: Challenges Table

**Table Name**: `wwe-2k-league-api-challenges-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `challengeId` (PK) | String | UUID for the challenge |
| `challengerId` | String | playerId of the challenger |
| `challengedId` | String | playerId of the challenged player |
| `matchType` | String | singles, tag, triple-threat, etc. |
| `stipulation` | String (optional) | ladder, cage, hell-in-a-cell, etc. |
| `championshipId` | String (optional) | If challenging for a title |
| `message` | String (optional) | Promo/callout message (max 500 chars) |
| `status` | String | pending, accepted, declined, countered, scheduled, expired, cancelled |
| `responseMessage` | String (optional) | Response from challenged player |
| `counteredChallengeId` | String (optional) | Reference to counter-challenge |
| `matchId` | String (optional) | Once scheduled, links to the match |
| `expiresAt` | String | ISO timestamp, challenges expire after 7 days |
| `createdAt` | String | ISO timestamp |
| `updatedAt` | String | ISO timestamp |

**GSI: ChallengerIndex**
- Partition Key: `challengerId`
- Sort Key: `createdAt`
- Purpose: Query all challenges issued by a player

**GSI: ChallengedIndex**
- Partition Key: `challengedId`
- Sort Key: `createdAt`
- Purpose: Query all challenges received by a player

**GSI: StatusIndex**
- Partition Key: `status`
- Sort Key: `createdAt`
- Purpose: Query challenges by status (e.g., all pending for admin view)

### TypeScript Interface

```typescript
export interface Challenge {
  challengeId: string;
  challengerId: string;
  challengedId: string;
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'countered' | 'scheduled' | 'expired' | 'cancelled';
  responseMessage?: string;
  counteredChallengeId?: string;
  matchId?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
```

### API Endpoints

#### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/challenges` | Get all active challenges (public challenge board) |
| GET | `/challenges/{challengeId}` | Get specific challenge details |

#### Authenticated Endpoints (Player or Admin)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/challenges` | Create a new challenge |
| GET | `/challenges/my/sent` | Get challenges I've sent |
| GET | `/challenges/my/received` | Get challenges I've received |
| PUT | `/challenges/{challengeId}/accept` | Accept a challenge |
| PUT | `/challenges/{challengeId}/decline` | Decline a challenge |
| POST | `/challenges/{challengeId}/counter` | Counter with modified terms |
| DELETE | `/challenges/{challengeId}` | Cancel a challenge (only challenger) |

#### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/challenges` | Get all challenges with filters |
| PUT | `/admin/challenges/{challengeId}/schedule` | Schedule accepted challenge as match |
| PUT | `/admin/challenges/{challengeId}/expire` | Manually expire a challenge |

### Request/Response Examples

**Create Challenge**
```json
POST /challenges
{
  "challengedId": "player-uuid-456",
  "matchType": "singles",
  "stipulation": "Steel Cage",
  "message": "You've been ducking me for weeks. Time to settle this in the cage!"
}

Response:
{
  "challengeId": "challenge-uuid-123",
  "challengerId": "player-uuid-123",
  "challengedId": "player-uuid-456",
  "matchType": "singles",
  "stipulation": "Steel Cage",
  "message": "You've been ducking me for weeks...",
  "status": "pending",
  "expiresAt": "2026-02-11T17:00:00Z",
  "createdAt": "2026-02-04T17:00:00Z",
  "updatedAt": "2026-02-04T17:00:00Z"
}
```

**Accept Challenge**
```json
PUT /challenges/{challengeId}/accept
{
  "responseMessage": "You're on! Prepare to be locked in with your worst nightmare."
}
```

**Counter Challenge**
```json
POST /challenges/{challengeId}/counter
{
  "matchType": "singles",
  "stipulation": "Hell in a Cell",
  "message": "Steel Cage? That's too easy for you. Let's make it Hell in a Cell."
}
```

## Frontend Components

### New Pages/Components

1. **ChallengeBoard.tsx** (Public)
   - Displays all active/recent challenges
   - Shows challenger vs challenged with messages
   - Status badges and countdown timers
   - Card-based layout with wrestling poster aesthetic

2. **IssueChallenge.tsx** (Authenticated)
   - Opponent selector dropdown
   - Match type and stipulation options
   - Optional title challenge checkbox (if eligible)
   - Message textarea with character limit
   - Preview before submission

3. **MyChallenges.tsx** (Authenticated)
   - Tab view: Sent / Received
   - Action buttons for received: Accept, Decline, Counter
   - Cancel button for sent pending challenges
   - History of past challenges

4. **ChallengeDetail.tsx** (Public)
   - Full view of a single challenge
   - Challenge and response messages
   - Counter-challenge chain if applicable
   - Link to scheduled match if exists

5. **AdminChallenges.tsx** (Admin)
   - Table of all challenges with filters
   - Bulk actions for expired cleanup
   - "Schedule Match" button for accepted challenges

### Navigation Updates

- Add "Challenges" to main navigation (public)
- Add "My Challenges" to authenticated user menu
- Add "Manage Challenges" to admin panel

### UI Mockup (Text)

```
+--------------------------------------------------+
|  CHALLENGE BOARD                                  |
+--------------------------------------------------+
|  [Active Challenges]  [Recent Results]            |
|                                                   |
|  +--------------------------------------------+  |
|  | JOHN CENA challenges THE ROCK              |  |
|  | Match: Singles | Stipulation: Last Man     |  |
|  | Standing                                    |  |
|  |                                            |  |
|  | "You think you're the People's Champ?     |  |
|  | Prove it!"                                 |  |
|  |                                            |  |
|  | Status: PENDING | Expires in 5 days        |  |
|  +--------------------------------------------+  |
|                                                   |
|  +--------------------------------------------+  |
|  | STONE COLD vs TRIPLE H - ACCEPTED!         |  |
|  | Match: Singles | For: WWE Championship     |  |
|  | Awaiting Admin Scheduling                  |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
```

## Integration with Existing Functionality

### Player Authentication
- Challenges require player authentication (not just admin)
- Need to extend auth system to identify which player the user controls
- Option: Admin creates player accounts with login credentials
- Alternative: Players self-register and admin links accounts

### Match Scheduling
- When admin schedules from challenge, pre-populate match form
- Link challenge to created match via `matchId`
- Update challenge status to "scheduled"

### Championships
- If challenger holds no title, cannot challenge for title
- If challenged is champion, challenger can request title match
- Championship challenges display title image/name

### Divisions
- Consider restricting cross-division challenges (optional rule)
- Display division badges on challenge cards

## Implementation Phases

### Phase 1: Core Infrastructure (Backend)
**Prerequisites**: None
**Estimated Complexity**: Medium

#### Steps:
1. Add Challenges table to `serverless.yml` with GSIs
   - Details: Define table, indexes, and IAM permissions
   - Validation: Deploy succeeds, table visible in AWS console

2. Create challenge TypeScript types in backend
   - Details: Add to new `types/challenge.ts` file
   - Validation: TypeScript compiles without errors

3. Implement `createChallenge.ts` Lambda
   - Details: Validate players exist, set expiration, handle championship logic
   - Validation: Can create challenge via API, stored in DynamoDB

4. Implement `getChallenges.ts` Lambda
   - Details: Support public list and filtered queries
   - Validation: Returns challenges sorted by date

#### Interfaces:
- Input: Challenge creation payload
- Output: Challenge object with generated ID

#### Testing Criteria:
- Unit test: Challenge creation with valid/invalid data
- Integration test: Full flow from API to DynamoDB

---

### Phase 2: Challenge Responses (Backend)
**Prerequisites**: Phase 1
**Estimated Complexity**: Medium

#### Steps:
1. Implement `acceptChallenge.ts` Lambda
   - Details: Update status, add response message
   - Validation: Status changes to "accepted"

2. Implement `declineChallenge.ts` Lambda
   - Details: Update status, optional decline reason
   - Validation: Status changes to "declined"

3. Implement `counterChallenge.ts` Lambda
   - Details: Create new challenge referencing original, update original status
   - Validation: Chain of challenges linked correctly

4. Implement `cancelChallenge.ts` Lambda
   - Details: Only challenger can cancel, only pending challenges
   - Validation: Authorization enforced, status updates

5. Add scheduled job for challenge expiration (EventBridge)
   - Details: Daily scan for expired challenges, update status
   - Validation: Old challenges auto-expire

#### Testing Criteria:
- Only correct player can respond to their challenges
- Status transitions are valid (no accepting declined challenge)

---

### Phase 3: Admin Management (Backend)
**Prerequisites**: Phase 2
**Estimated Complexity**: Low

#### Steps:
1. Implement `adminGetChallenges.ts` Lambda
   - Details: Filter by status, player, date range
   - Validation: Returns comprehensive list with filters

2. Implement `adminScheduleChallenge.ts` Lambda
   - Details: Creates match from challenge data, updates challenge
   - Validation: Match created with challenge details, linked

3. Add challenge counts to admin dashboard API
   - Details: Return pending/accepted counts
   - Validation: Accurate counts returned

#### Testing Criteria:
- Admin can view all challenges
- Scheduling creates properly configured match

---

### Phase 4: Frontend - Public Views
**Prerequisites**: Phase 1
**Estimated Complexity**: Medium

#### Steps:
1. Add Challenge TypeScript types to frontend
   - Details: Mirror backend types in `types/index.ts`
   - Validation: Types compile correctly

2. Add challenges API service functions
   - Details: Add to `services/api.ts`
   - Validation: Can fetch challenges from backend

3. Create `ChallengeBoard.tsx` component
   - Details: Grid of challenge cards, status filters
   - Validation: Displays challenges correctly

4. Create `ChallengeBoard.css` styles
   - Details: Wrestling poster aesthetic, status badges
   - Validation: Visually appealing, responsive

5. Add route and navigation link
   - Details: Update `App.tsx` and navigation
   - Validation: Can navigate to challenge board

#### Testing Criteria:
- Challenge board loads without errors
- Filters work correctly
- Responsive on mobile

---

### Phase 5: Frontend - Player Features
**Prerequisites**: Phase 4, Player Auth System
**Estimated Complexity**: High

#### Steps:
1. Create `IssueChallenge.tsx` component
   - Details: Form with opponent select, match options, message
   - Validation: Can submit challenge successfully

2. Create `MyChallenges.tsx` component
   - Details: Tabs for sent/received, action buttons
   - Validation: Correct challenges shown per tab

3. Implement challenge response UI
   - Details: Accept/decline/counter modals
   - Validation: Responses submitted correctly

4. Add i18n translations
   - Details: English and German strings
   - Validation: All text translatable

#### Testing Criteria:
- Full challenge flow works end-to-end
- UI prevents invalid actions
- Error states handled gracefully

---

### Phase 6: Frontend - Admin Features
**Prerequisites**: Phase 3, Phase 4
**Estimated Complexity**: Low

#### Steps:
1. Create `AdminChallenges.tsx` component
   - Details: Table view with filters, bulk actions
   - Validation: Admin can manage all challenges

2. Implement "Schedule from Challenge" flow
   - Details: Pre-populated match form, link creation
   - Validation: Match created with challenge reference

3. Add to admin panel navigation
   - Details: New menu item in admin panel
   - Validation: Accessible from admin dashboard

#### Testing Criteria:
- Admin can view and manage all challenges
- Scheduling workflow intuitive

## Technology Recommendations

### Player Authentication Extension
Currently, only admin authentication exists. For challenges to work properly, players need authentication:

**Option A: Admin-Created Player Accounts**
- Admin creates Cognito users for each player
- Simple, maintains control
- Players get username/password

**Option B: Player Self-Registration**
- New Cognito user pool for players
- Admin approval workflow
- More complex but scalable

**Recommendation**: Start with Option A for simplicity, as the league likely has a fixed roster.

### EventBridge for Expiration
Use AWS EventBridge scheduled rules to run a Lambda daily that:
- Scans for challenges past `expiresAt`
- Updates status to "expired"
- More reliable than client-side expiration checks

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| No player auth system | High | Phase 5 depends on this; prioritize auth extension |
| Challenge spam | Medium | Rate limit challenges per player (max 3 pending) |
| Stale challenges | Low | Auto-expiration via EventBridge |
| Complex counter-chains | Medium | Limit counter depth to 2 levels |

## Open Questions

1. Should players be able to challenge for titles they're not contending for?
2. What is the maximum number of pending challenges a player can have?
3. Should declined challenges be visible publicly or only to participants?
4. Do we need admin approval before challenges go public?
5. Should challenges integrate with a future "rivalry" tracking system?

## Estimated Total Effort

| Phase | Effort |
|-------|--------|
| Phase 1 | 4-6 hours |
| Phase 2 | 4-6 hours |
| Phase 3 | 2-3 hours |
| Phase 4 | 4-6 hours |
| Phase 5 | 6-8 hours |
| Phase 6 | 2-3 hours |
| **Total** | **22-32 hours** |

Note: Player authentication extension not included; estimate separately.
