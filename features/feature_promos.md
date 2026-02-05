# Feature: Wrestler Promos

## Executive Summary

A promo (promotional speech) system that allows wrestlers to cut promos before matches, during feuds, or as standalone content. Promos are a cornerstone of professional wrestling storytelling - this feature brings that drama to the league by letting players trash talk, build storylines, and engage the audience with their character's voice.

## Problem Statement

The current application tracks match results and statistics but lacks the storytelling and character-building elements that make professional wrestling engaging. Promos are how wrestlers establish personalities, build heat for feuds, and create memorable moments. Without promos, the league is just numbers and results - missing the entertainment factor that makes wrestling compelling.

## Goals

1. Allow players to create text-based promos for their characters
2. Support different promo types (pre-match, post-match, open challenge, storyline)
3. Enable promos to target specific opponents or respond to other promos
4. Display promos in a timeline/feed format for community engagement
5. Integrate promos with matches and challenges for context
6. Optional: Allow reactions/ratings from other players

## Non-Goals

1. Video or audio promo uploads
2. Real-time promo battles or live chat
3. AI-generated promo content
4. Explicit content moderation (trust league members)
5. Complex branching storyline trees

## Proposed Solution

### High-Level Architecture

```
+-------------------+       +-------------------+       +-------------------+
|   Frontend        |       |   API Gateway     |       |   Lambda          |
|   Promo Editor    | ----> |   /promos         | ----> |   Functions       |
+-------------------+       +-------------------+       +-------------------+
                                                               |
                                                               v
                                                        +-------------------+
                                                        |   DynamoDB        |
                                                        |   Promos Table    |
                                                        +-------------------+
                                                               |
                                                               v
                                                        +-------------------+
                                                        |   S3 (optional)   |
                                                        |   Promo Images    |
                                                        +-------------------+
```

### Promo Types

1. **Open Mic**: General promo not directed at anyone
2. **Call-Out**: Targeting a specific opponent
3. **Response**: Reply to another promo
4. **Pre-Match**: Tied to an upcoming scheduled match
5. **Post-Match**: Reaction after a completed match
6. **Championship**: Promo about a title (holding or pursuing)
7. **Return**: Character return/debut announcement

### User Flow

1. Player logs in and navigates to "Cut a Promo"
2. Selects promo type and optional target (opponent, match, championship)
3. Writes promo content (with optional image upload)
4. Promo is published to the feed
5. Other players can view, react, and respond
6. Promos appear in match cards and player profiles

## Technical Specification

### Data Model: Promos Table

**Table Name**: `wwe-2k-league-api-promos-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `promoId` (PK) | String | UUID for the promo |
| `playerId` | String | Player who cut the promo |
| `promoType` | String | open-mic, call-out, response, pre-match, post-match, championship, return |
| `title` | String (optional) | Headline for the promo |
| `content` | String | Promo text (max 2000 chars) |
| `targetPlayerId` | String (optional) | Player being called out |
| `targetPromoId` | String (optional) | Promo being responded to |
| `matchId` | String (optional) | Associated match |
| `championshipId` | String (optional) | Associated championship |
| `imageUrl` | String (optional) | Attached promo image |
| `reactions` | Map | { playerId: reactionType } |
| `reactionCounts` | Map | { fire: 5, mic: 3, trash: 1 } |
| `isPinned` | Boolean | Admin can pin featured promos |
| `isHidden` | Boolean | Admin can hide inappropriate promos |
| `createdAt` | String | ISO timestamp |
| `updatedAt` | String | ISO timestamp |

**GSI: PlayerPromoIndex**
- Partition Key: `playerId`
- Sort Key: `createdAt`
- Purpose: Get all promos by a player

**GSI: TargetPlayerIndex**
- Partition Key: `targetPlayerId`
- Sort Key: `createdAt`
- Purpose: Get all promos targeting a player

**GSI: MatchIndex**
- Partition Key: `matchId`
- Sort Key: `createdAt`
- Purpose: Get all promos for a match

**GSI: TypeIndex**
- Partition Key: `promoType`
- Sort Key: `createdAt`
- Purpose: Filter promos by type

### TypeScript Interfaces

```typescript
export type PromoType =
  | 'open-mic'
  | 'call-out'
  | 'response'
  | 'pre-match'
  | 'post-match'
  | 'championship'
  | 'return';

export type ReactionType = 'fire' | 'mic' | 'trash' | 'mind-blown' | 'clap';

export interface Promo {
  promoId: string;
  playerId: string;
  promoType: PromoType;
  title?: string;
  content: string;
  targetPlayerId?: string;
  targetPromoId?: string;
  matchId?: string;
  championshipId?: string;
  imageUrl?: string;
  reactions: Record<string, ReactionType>;
  reactionCounts: Record<ReactionType, number>;
  isPinned: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromoWithContext extends Promo {
  player: {
    playerId: string;
    name: string;
    wrestlerName: string;
    imageUrl?: string;
  };
  targetPlayer?: {
    playerId: string;
    name: string;
    wrestlerName: string;
  };
  targetPromo?: Promo;
  match?: {
    matchId: string;
    date: string;
    matchType: string;
  };
  championship?: {
    championshipId: string;
    name: string;
  };
  responseCount: number;
}

export interface CreatePromoInput {
  promoType: PromoType;
  title?: string;
  content: string;
  targetPlayerId?: string;
  targetPromoId?: string;
  matchId?: string;
  championshipId?: string;
  imageUrl?: string;
}
```

### API Endpoints

#### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/promos` | Get promo feed (paginated, filterable) |
| GET | `/promos/{promoId}` | Get specific promo with context |
| GET | `/promos/{promoId}/responses` | Get responses to a promo |
| GET | `/players/{playerId}/promos` | Get player's promo history |
| GET | `/matches/{matchId}/promos` | Get promos for a match |

#### Authenticated Endpoints (Player)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/promos` | Create a new promo |
| PUT | `/promos/{promoId}` | Edit own promo (within 1 hour) |
| DELETE | `/promos/{promoId}` | Delete own promo |
| POST | `/promos/{promoId}/react` | Add reaction to promo |
| DELETE | `/promos/{promoId}/react` | Remove reaction from promo |

#### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/admin/promos/{promoId}/pin` | Pin/unpin a promo |
| PUT | `/admin/promos/{promoId}/hide` | Hide/unhide a promo |
| DELETE | `/admin/promos/{promoId}` | Force delete any promo |

### Request/Response Examples

**Create Promo**
```json
POST /promos
{
  "promoType": "call-out",
  "title": "You're Next!",
  "content": "Hey @TheRock, I've been watching you strut around this league like you own the place. News flash: you don't. At the next event, I'm going to show everyone why I'm the BEST IN THE WORLD! You want some? Come get some!",
  "targetPlayerId": "player-uuid-456"
}

Response:
{
  "promoId": "promo-uuid-123",
  "playerId": "player-uuid-123",
  "promoType": "call-out",
  "title": "You're Next!",
  "content": "Hey @TheRock, I've been watching you...",
  "targetPlayerId": "player-uuid-456",
  "reactions": {},
  "reactionCounts": { "fire": 0, "mic": 0, "trash": 0, "mind-blown": 0, "clap": 0 },
  "isPinned": false,
  "isHidden": false,
  "createdAt": "2026-02-04T17:00:00Z",
  "updatedAt": "2026-02-04T17:00:00Z"
}
```

**Get Promo Feed**
```json
GET /promos?limit=10&promoType=call-out

Response:
{
  "promos": [
    {
      "promoId": "promo-uuid-123",
      "promoType": "call-out",
      "title": "You're Next!",
      "content": "Hey @TheRock...",
      "player": {
        "playerId": "player-uuid-123",
        "name": "John",
        "wrestlerName": "CM Punk",
        "imageUrl": "https://..."
      },
      "targetPlayer": {
        "playerId": "player-uuid-456",
        "name": "Mike",
        "wrestlerName": "The Rock"
      },
      "reactionCounts": { "fire": 12, "mic": 5, "trash": 2 },
      "responseCount": 3,
      "createdAt": "2026-02-04T17:00:00Z"
    }
  ],
  "nextToken": "eyJsYXN0S2V5..."
}
```

**Add Reaction**
```json
POST /promos/{promoId}/react
{
  "reaction": "fire"
}
```

## Frontend Components

### New Pages/Components

1. **PromoFeed.tsx** (Public)
   - Infinite scroll promo timeline
   - Filter by type, player, date
   - Pinned promos at top
   - Response thread expansion

2. **PromoCard.tsx** (Reusable)
   - Player avatar and wrestler name
   - Promo type badge
   - Content with @mentions highlighted
   - Reaction buttons and counts
   - Response count and link
   - Timestamp and edit indicator

3. **PromoEditor.tsx** (Authenticated)
   - Type selector with descriptions
   - Target selector (player, match, championship)
   - Rich text area with character counter
   - Image upload option
   - Preview mode
   - Submit with confirmation

4. **PromoThread.tsx** (Public)
   - Original promo at top
   - Response chain below
   - Reply input at bottom

5. **PlayerPromos.tsx** (Profile Section)
   - Player's promo history
   - Stats: total promos, reactions received
   - "Greatest Hits" section

6. **MatchPromos.tsx** (Match Detail Section)
   - Pre-match promos from participants
   - Post-match reactions
   - Integrated into match card expansion

### UI Mockup (Text)

```
+--------------------------------------------------+
|  PROMO FEED                                       |
+--------------------------------------------------+
|  [All] [Call-Outs] [Responses] [Championship]     |
+--------------------------------------------------+
|                                                   |
|  PINNED                                          |
|  +--------------------------------------------+  |
|  | [CM Punk Avatar]  CM PUNK                  |  |
|  | @JohnDoe                    CALL-OUT       |  |
|  |                                            |  |
|  | "YOU'RE NEXT!"                             |  |
|  |                                            |  |
|  | Hey @TheRock, I've been watching you       |  |
|  | strut around this league like you own     |  |
|  | the place. News flash: you don't...       |  |
|  |                                            |  |
|  | Targeting: The Rock (@Mike)                |  |
|  |                                            |  |
|  | [Fire 12] [Mic 5] [Trash 2]  | 3 responses |  |
|  | 2 hours ago                                |  |
|  +--------------------------------------------+  |
|                                                   |
|  +--------------------------------------------+  |
|  | [Rock Avatar]     THE ROCK                 |  |
|  | @Mike                        RESPONSE      |  |
|  |                                            |  |
|  | Responding to @CMPunk's "You're Next!"     |  |
|  |                                            |  |
|  | IF YA SMELLLLLL what The Rock is cookin'! |  |
|  | You want to run your mouth? The Rock will |  |
|  | shut it for you, jabroni!                 |  |
|  |                                            |  |
|  | [Fire 8] [Mic 15] [Trash 0]  | 1 response  |  |
|  | 1 hour ago                                 |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
```

### Reaction Emojis

| Reaction | Meaning | Emoji |
|----------|---------|-------|
| Fire | Great promo! | 🔥 |
| Mic | Mic drop moment | 🎤 |
| Trash | Bad take | 🗑️ |
| Mind-Blown | Shocking revelation | 🤯 |
| Clap | Applause | 👏 |

## Integration with Existing Functionality

### Match Cards
- Show "View Promos" button on match cards
- Count badge for promo activity
- Auto-link pre/post match promos

### Player Profiles
- Add "Promos" tab to player view
- Show promo stats (total, reactions)
- Featured/pinned promos

### Challenges
- When a challenge is issued, auto-create call-out promo option
- Link challenge and promo together

### Championships
- Current champion can cut championship promos
- Contenders can cut "I want the title" promos
- Link to contender rankings

## Implementation Phases

### PHASE 0: UI Prototypes with Mock Data
**Prerequisites**: None
**Estimated Complexity**: High

This phase creates all UI components with hardcoded data so stakeholders can see the look and flow before backend work begins.

#### Steps:
1. Create promo types file with interfaces
   - File: `frontend/src/types/promo.ts`
   - Details: All TypeScript interfaces for promos feature
   - Validation: TypeScript compiles without errors

2. Create mock data file
   - File: `frontend/src/mocks/promoMockData.ts`
   - Details: Hardcoded promos, reactions, player data, response threads
   - Validation: Data matches interface shapes

3. Create `PromoCard.tsx` component
   - File: `frontend/src/components/PromoCard.tsx`
   - Details: Display single promo with player avatar, type badge, reactions
   - Validation: Renders all promo types correctly

4. Create `PromoFeed.tsx` page
   - File: `frontend/src/components/PromoFeed.tsx`
   - Details: Infinite scroll feed with filters, pinned section using mock data
   - Validation: Feed renders and scrolls

5. Create `PromoThread.tsx` component
   - File: `frontend/src/components/PromoThread.tsx`
   - Details: Original promo + response chain
   - Validation: Thread displays correctly

6. Create `PromoEditor.tsx` component
   - File: `frontend/src/components/PromoEditor.tsx`
   - Details: Full editor with type selection, targets, preview
   - Validation: Form renders, can "submit" with mock

7. Create reaction buttons component
   - File: `frontend/src/components/PromoReactions.tsx`
   - Details: Emoji buttons with counts, visual feedback
   - Validation: Click interactions work

8. Create admin promo management component
   - File: `frontend/src/components/admin/AdminPromos.tsx`
   - Details: List all promos with pin/hide/delete actions
   - Validation: Actions work visually with mock

9. Create CSS styles for promo components
   - Files: `Promo*.css` for each component
   - Details: Wrestling poster aesthetic, reaction animations, responsive
   - Validation: Visually appealing, consistent with app

10. Add routing for promo pages
    - File: Update `App.tsx`
    - Details: Add routes for `/promos/*` paths
    - Validation: All routes accessible

11. Add i18n strings for promos feature
    - Files: Update `en.json`, `de.json`
    - Details: All user-facing text translatable
    - Validation: Language switch works

#### Testing Criteria:
- All pages render without errors with mock data
- Feed scrolls and filters work
- Responsive on mobile devices
- Consistent styling with existing app

---

### PHASE 1: Core Infrastructure (Backend)
**Prerequisites**: Phase 0, Player authentication system
**Estimated Complexity**: Medium

#### Steps:
1. Add Promos table to `serverless.yml` with GSIs
   - Details: Define table, indexes, IAM permissions
   - Validation: Tables created successfully

2. Create promo TypeScript types
   - Details: Add to backend types directory
   - Validation: TypeScript compiles

3. Implement `createPromo.ts` Lambda
   - Details: Validate inputs, handle type-specific logic
   - Validation: Can create promos via API

4. Implement `getPromos.ts` Lambda
   - Details: Pagination, filtering, context enrichment
   - Validation: Returns promos with player info

5. Implement `getPromo.ts` Lambda
   - Details: Single promo with full context
   - Validation: Returns complete promo data

#### Testing Criteria:
- All promo types can be created
- Validation prevents invalid combinations

---

### PHASE 2: Reactions & Responses (Backend)
**Prerequisites**: Phase 1
**Estimated Complexity**: Medium

#### Steps:
1. Implement `addReaction.ts` Lambda
   - Details: Add/update player reaction, update counts
   - Validation: Reactions stored and counted correctly

2. Implement `removeReaction.ts` Lambda
   - Details: Remove reaction, decrement counts
   - Validation: Counts update correctly

3. Implement `getPromoResponses.ts` Lambda
   - Details: Query responses to a promo
   - Validation: Response chain retrieved

4. Add response linking in `createPromo.ts`
   - Details: When promoType is 'response', link to target
   - Validation: Response chain builds correctly

#### Testing Criteria:
- One reaction per player per promo
- Response threads link correctly

---

### PHASE 3: Admin & Moderation (Backend)
**Prerequisites**: Phase 1
**Estimated Complexity**: Low

#### Steps:
1. Implement `pinPromo.ts` Lambda
   - Details: Toggle pin status
   - Validation: Pinned promos appear first

2. Implement `hidePromo.ts` Lambda
   - Details: Toggle hidden status
   - Validation: Hidden promos excluded from feed

3. Implement `adminDeletePromo.ts` Lambda
   - Details: Force delete any promo
   - Validation: Promo removed from all views

#### Testing Criteria:
- Only admins can pin/hide/force-delete
- Hidden promos not visible to public

---

### PHASE 4: Image Uploads (Backend)
**Prerequisites**: Phase 1, existing image upload system
**Estimated Complexity**: Low

#### Steps:
1. Add promo images folder support to `generateUploadUrl.ts`
   - Details: Allow 'promos' as folder parameter
   - Validation: Can generate presigned URL for promo images

2. Update `createPromo.ts` to accept imageUrl
   - Details: Store image URL with promo
   - Validation: Promo displays with image

#### Testing Criteria:
- Images upload successfully
- Images display in promo cards

---

### PHASE 5: Connect Frontend to Backend (Feed & Viewing)
**Prerequisites**: Phase 2
**Estimated Complexity**: Medium

#### Steps:
1. Add promo API service functions
   - Details: Add to `services/api.ts`
   - Validation: Can fetch promos from backend

2. Replace mock data in `PromoFeed.tsx` with API calls
   - Details: Remove mock imports, add useEffect for data fetching
   - Validation: Displays real promos from backend

3. Replace mock data in `PromoThread.tsx` with API calls
   - Details: Fetch promo and responses
   - Validation: Thread displays real data

4. Add loading and error states
   - Details: Skeleton loaders, error boundaries
   - Validation: Graceful handling of loading/errors

5. Add route and navigation
   - Details: Add to main nav as "Promos"
   - Validation: Can navigate to promo feed

#### Testing Criteria:
- Feed loads real data without errors
- Filters work correctly
- Infinite scroll works
- Mobile responsive

---

### PHASE 6: Connect Frontend to Backend (Creation & Interaction)
**Prerequisites**: Phase 5, Player auth
**Estimated Complexity**: High

#### Steps:
1. Connect `PromoEditor.tsx` to API
   - Details: Submit real promos via API
   - Validation: Can create all promo types

2. Connect reaction buttons to API
   - Details: Add/remove reactions via real endpoints
   - Validation: Reactions update in real-time

3. Integrate promos into match cards
   - Details: Show promo count, link to related promos
   - Validation: Match-promo relationship visible

4. Add player promo section
   - Details: Promos tab on player view
   - Validation: Player's promos displayed

#### Testing Criteria:
- Full promo creation flow works
- Reactions update counts correctly
- Integration points function

---

### PHASE 7: Connect Frontend to Backend (Admin Features)
**Prerequisites**: Phase 3, Phase 5
**Estimated Complexity**: Low

#### Steps:
1. Connect `AdminPromos.tsx` to API
   - Details: Fetch all promos, pin/hide/delete via API
   - Validation: Admin can manage promos

2. Add moderation indicators
   - Details: Show pinned/hidden status in admin view
   - Validation: Clear visibility of promo states

#### Testing Criteria:
- Admin can manage all promos
- Actions reflect immediately

## Technology Recommendations

### Content Formatting
Consider supporting basic Markdown or a subset:
- **Bold** for emphasis
- @mentions for player references
- Simple formatting improves readability
- Library: `marked` or `react-markdown`

### Rate Limiting
Prevent promo spam:
- Max 3 promos per player per day
- 30-second cooldown between promos
- Configurable by admin

### Content Length
- Minimum: 50 characters (encourages effort)
- Maximum: 2000 characters (keeps it readable)
- Show character counter in editor

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Inappropriate content | High | Admin hide feature, community guidelines |
| Promo spam | Medium | Rate limiting, daily caps |
| Low engagement | Medium | Pin featured promos, integrate with matches |
| Player auth dependency | High | Feature blocked until auth implemented |

## Open Questions

1. Should promos support basic formatting (bold, italic)?
2. Should there be a character minimum to encourage quality?
3. Should promos be editable after posting, or locked?
4. Should reaction counts be visible to the promo author?
5. Should there be a "Promo of the Week" featured section?
6. Should promos be included in player statistics?

## Estimated Total Effort

| Phase | Effort |
|-------|--------|
| Phase 0 (UI Prototypes) | 8-10 hours |
| Phase 1 | 4-6 hours |
| Phase 2 | 3-4 hours |
| Phase 3 | 2-3 hours |
| Phase 4 | 1-2 hours |
| Phase 5 (Connect Feed) | 3-4 hours |
| Phase 6 (Connect Creation) | 4-6 hours |
| Phase 7 (Connect Admin) | 2-3 hours |
| **Total** | **27-38 hours** |

Note: Requires player authentication system to be implemented first.
