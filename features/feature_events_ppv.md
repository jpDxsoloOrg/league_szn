# Feature: Events & Pay-Per-Views (PPV)

## Executive Summary

A structured event system that organizes matches into themed shows like professional wrestling pay-per-views (WrestleMania, SummerSlam, Royal Rumble). Events group matches together, create build-up storylines, and provide a calendar of upcoming attractions. This feature transforms individual matches into cohesive shows with branding, match cards, and historical significance.

## Problem Statement

Currently, matches exist as isolated entries without the context of belonging to larger events. In professional wrestling, pay-per-views and weekly shows are major attractions that bundle matches into themed events with storylines building toward them. The lack of event structure means:
- No sense of build-up or anticipation for big matches
- Championship matches don't feel "special" without event context
- No historical record of events like "WrestleMania 1"
- Difficult to plan or promote upcoming shows

## Goals

1. Create and manage named events (PPVs, weekly shows, special events)
2. Assign matches to events with card ordering
3. Display event history with match cards and results
4. Enable event-specific features (main event designation, championship matches)
5. Create event calendar for upcoming shows
6. Track event attendance/participation statistics

## Non-Goals

1. Ticket sales or real event management
2. Live streaming or broadcast integration
3. Complex multi-day event scheduling
4. Venue management
5. Automated event generation

## Proposed Solution

### Event Types

1. **Pay-Per-View (PPV)**: Major premium events (WrestleMania, SummerSlam)
2. **Weekly Show**: Regular programming (Raw, SmackDown)
3. **Special Event**: One-off events (Tribute shows, Tournaments)
4. **House Show**: Non-televised/recorded shows

### Event Structure

Each event contains:
- Event name and date
- Event type and theme
- Match card (ordered list of matches)
- Main event designation
- Co-main event(s)
- Pre-show matches
- Associated championship matches
- Event poster/image

### High-Level Architecture

```
+-------------------+       +-------------------+       +-------------------+
|   Frontend        |       |   API Gateway     |       |   Lambda          |
|   Event Manager   | ----> |   /events         | ----> |   Functions       |
+-------------------+       +-------------------+       +-------------------+
                                                               |
                                                               v
                                                        +-------------------+
                                                        |   DynamoDB        |
                                                        |   Events Table    |
                                                        +-------------------+
```

## Technical Specification

### Data Model: Events Table

**Table Name**: `wwe-2k-league-api-events-{stage}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `eventId` (PK) | String | UUID for the event |
| `name` | String | Event name (e.g., "WrestleMania 40") |
| `eventType` | String | ppv, weekly, special, house |
| `date` | String | Event date (ISO format) |
| `venue` | String (optional) | Venue name for flavor |
| `description` | String (optional) | Event description/tagline |
| `imageUrl` | String (optional) | Event poster image |
| `themeColor` | String (optional) | Hex color for branding |
| `status` | String | upcoming, in-progress, completed, cancelled |
| `seasonId` | String (optional) | Associated season |
| `matchCards` | List | Ordered match entries (see below) |
| `attendance` | Number (optional) | Fictional attendance for fun |
| `rating` | Number (optional) | Post-event rating (1-5 stars) |
| `createdAt` | String | ISO timestamp |
| `updatedAt` | String | ISO timestamp |

### Match Card Entry Structure

```typescript
interface MatchCardEntry {
  position: number;           // Order on the card (1 = opening, highest = main event)
  matchId: string;            // Reference to match
  designation: 'pre-show' | 'opener' | 'midcard' | 'co-main' | 'main-event';
  notes?: string;             // Special notes (e.g., "For the WWE Championship")
}
```

**GSI: DateIndex**
- Partition Key: `eventType`
- Sort Key: `date`
- Purpose: Query events by type in date order

**GSI: StatusIndex**
- Partition Key: `status`
- Sort Key: `date`
- Purpose: Get upcoming/completed events

**GSI: SeasonIndex**
- Partition Key: `seasonId`
- Sort Key: `date`
- Purpose: Get events for a season

### TypeScript Interfaces

```typescript
export type EventType = 'ppv' | 'weekly' | 'special' | 'house';
export type EventStatus = 'upcoming' | 'in-progress' | 'completed' | 'cancelled';
export type MatchDesignation = 'pre-show' | 'opener' | 'midcard' | 'co-main' | 'main-event';

export interface MatchCardEntry {
  position: number;
  matchId: string;
  designation: MatchDesignation;
  notes?: string;
}

export interface Event {
  eventId: string;
  name: string;
  eventType: EventType;
  date: string;
  venue?: string;
  description?: string;
  imageUrl?: string;
  themeColor?: string;
  status: EventStatus;
  seasonId?: string;
  matchCards: MatchCardEntry[];
  attendance?: number;
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventWithMatches extends Event {
  matches: Array<{
    position: number;
    designation: MatchDesignation;
    notes?: string;
    match: Match & {
      participants: Player[];
      winners?: Player[];
      championship?: Championship;
    };
  }>;
}

export interface EventCalendarEntry {
  eventId: string;
  name: string;
  eventType: EventType;
  date: string;
  status: EventStatus;
  matchCount: number;
  championshipMatchCount: number;
  imageUrl?: string;
}
```

### API Endpoints

#### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | Get all events (filterable by type, status, date range) |
| GET | `/events/calendar` | Get event calendar view |
| GET | `/events/upcoming` | Get upcoming events |
| GET | `/events/{eventId}` | Get event details with full match card |
| GET | `/events/{eventId}/results` | Get event results (completed events) |

#### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/events` | Create new event |
| PUT | `/events/{eventId}` | Update event details |
| DELETE | `/events/{eventId}` | Delete event (only if no completed matches) |
| PUT | `/events/{eventId}/matches` | Update match card (add/remove/reorder) |
| PUT | `/events/{eventId}/status` | Change event status |
| POST | `/events/{eventId}/add-match` | Add existing match to event |
| DELETE | `/events/{eventId}/matches/{matchId}` | Remove match from event |

### Request/Response Examples

**Create Event**
```json
POST /events
{
  "name": "WrestleMania 40",
  "eventType": "ppv",
  "date": "2026-04-05T19:00:00Z",
  "venue": "MetLife Stadium",
  "description": "The Showcase of the Immortals",
  "themeColor": "#FFD700",
  "seasonId": "season-uuid-123"
}

Response:
{
  "eventId": "event-uuid-123",
  "name": "WrestleMania 40",
  "eventType": "ppv",
  "date": "2026-04-05T19:00:00Z",
  "venue": "MetLife Stadium",
  "description": "The Showcase of the Immortals",
  "themeColor": "#FFD700",
  "status": "upcoming",
  "seasonId": "season-uuid-123",
  "matchCards": [],
  "createdAt": "2026-02-04T17:00:00Z",
  "updatedAt": "2026-02-04T17:00:00Z"
}
```

**Add Match to Event**
```json
POST /events/event-uuid-123/add-match
{
  "matchId": "match-uuid-456",
  "designation": "main-event",
  "notes": "WWE Championship Match"
}

Response:
{
  "message": "Match added to event",
  "matchCard": {
    "position": 5,
    "matchId": "match-uuid-456",
    "designation": "main-event",
    "notes": "WWE Championship Match"
  }
}
```

**Get Event with Match Card**
```json
GET /events/event-uuid-123

Response:
{
  "eventId": "event-uuid-123",
  "name": "WrestleMania 40",
  "eventType": "ppv",
  "date": "2026-04-05T19:00:00Z",
  "venue": "MetLife Stadium",
  "description": "The Showcase of the Immortals",
  "status": "upcoming",
  "matches": [
    {
      "position": 1,
      "designation": "pre-show",
      "match": {
        "matchId": "match-uuid-789",
        "matchType": "singles",
        "status": "scheduled",
        "participants": [
          { "playerId": "...", "name": "Alex", "wrestlerName": "Triple H" },
          { "playerId": "...", "name": "Chris", "wrestlerName": "Undertaker" }
        ]
      }
    },
    {
      "position": 2,
      "designation": "opener",
      "match": {...}
    },
    {
      "position": 5,
      "designation": "main-event",
      "notes": "WWE Championship Match",
      "match": {
        "matchId": "match-uuid-456",
        "matchType": "singles",
        "isChampionship": true,
        "championshipId": "champ-uuid-111",
        "status": "scheduled",
        "participants": [
          { "playerId": "...", "name": "John", "wrestlerName": "CM Punk" },
          { "playerId": "...", "name": "Mike", "wrestlerName": "The Rock" }
        ],
        "championship": {
          "championshipId": "champ-uuid-111",
          "name": "WWE Championship",
          "imageUrl": "..."
        }
      }
    }
  ],
  "statistics": {
    "totalMatches": 5,
    "championshipMatches": 2,
    "mainEventParticipants": ["CM Punk", "The Rock"]
  }
}
```

**Get Event Calendar**
```json
GET /events/calendar?year=2026&month=4

Response:
{
  "year": 2026,
  "month": 4,
  "events": [
    {
      "eventId": "event-uuid-123",
      "name": "WrestleMania 40",
      "eventType": "ppv",
      "date": "2026-04-05",
      "status": "upcoming",
      "matchCount": 8,
      "championshipMatchCount": 3
    },
    {
      "eventId": "event-uuid-124",
      "name": "Raw Episode 1532",
      "eventType": "weekly",
      "date": "2026-04-07",
      "status": "upcoming",
      "matchCount": 4,
      "championshipMatchCount": 0
    }
  ]
}
```

## Frontend Components

### New Pages/Components

1. **EventsCalendar.tsx** (Public - Main Events Page)
   - Monthly calendar view
   - Event type color coding
   - Click to expand event details
   - Upcoming events list

2. **EventDetail.tsx** (Public - Full Event Page)
   - Event header with poster/branding
   - Match card in order
   - Pre-show separator
   - Championship match highlighting
   - Main event emphasis

3. **EventCard.tsx** (Reusable)
   - Event poster thumbnail
   - Event name and date
   - Match count badge
   - Status indicator

4. **MatchCardBuilder.tsx** (Admin)
   - Drag-and-drop match ordering
   - Designation dropdowns
   - Add/remove matches
   - Preview mode

5. **CreateEvent.tsx** (Admin)
   - Event details form
   - Image upload
   - Theme color picker
   - Season selector

6. **EventResults.tsx** (Public - Post-Event)
   - Results summary
   - Match outcomes
   - Title changes highlighted
   - Event rating display

### UI Mockup - Event Calendar

```
+--------------------------------------------------+
|  EVENTS CALENDAR                                  |
+--------------------------------------------------+
|  < APRIL 2026 >                                  |
+--------------------------------------------------+
|  SUN   MON   TUE   WED   THU   FRI   SAT         |
|                    1     2     3     4           |
|  5     6     7     8     9     10    11          |
|  [WM]  [RAW]                                      |
|  12    13    14    15    16    17    18          |
|        [RAW]                   [SDL]             |
|  19    20    21    22    23    24    25          |
|        [RAW]                   [SDL]             |
|  26    27    28    29    30                      |
|        [RAW] [BCL]             [SDL]             |
+--------------------------------------------------+
|                                                   |
|  UPCOMING EVENTS                                  |
|                                                   |
|  +--------------------------------------------+  |
|  | [WM Logo]  WRESTLEMANIA 40                 |  |
|  | April 5, 2026 | PPV | 8 Matches            |  |
|  | MetLife Stadium                            |  |
|  | Main Event: CM Punk vs The Rock            |  |
|  +--------------------------------------------+  |
|                                                   |
|  +--------------------------------------------+  |
|  | [RAW Logo]  MONDAY NIGHT RAW               |  |
|  | April 6, 2026 | Weekly | 5 Matches         |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
```

### UI Mockup - Event Detail (Upcoming)

```
+--------------------------------------------------+
|  [WrestleMania 40 Poster]                        |
|                                                   |
|  WRESTLEMANIA 40                                  |
|  "The Showcase of the Immortals"                 |
|                                                   |
|  April 5, 2026 | MetLife Stadium                 |
|  STATUS: UPCOMING                                |
+--------------------------------------------------+
|                                                   |
|  MATCH CARD                                      |
|                                                   |
|  --- PRE-SHOW ---                                |
|  1. Triple H vs Undertaker                       |
|     Singles Match                                |
|                                                   |
|  --- MAIN CARD ---                               |
|  2. OPENER: Stone Cold vs Mankind                |
|     Hardcore Match                               |
|                                                   |
|  3. Tag Team Championship                        |
|     The Hardy Boyz vs The Dudley Boyz           |
|     [Tag Titles Image]                           |
|                                                   |
|  4. CO-MAIN: Intercontinental Championship      |
|     Shawn Michaels vs Bret Hart                 |
|     Iron Man Match                              |
|                                                   |
|  5. MAIN EVENT: WWE Championship                |
|     CM Punk (c) vs The Rock                     |
|     [WWE Title Image]                           |
+--------------------------------------------------+
```

### UI Mockup - Event Results (Completed)

```
+--------------------------------------------------+
|  WRESTLEMANIA 40 - RESULTS                       |
|  April 5, 2026 | COMPLETED                       |
|  Event Rating: ★★★★★ (5/5)                       |
+--------------------------------------------------+
|                                                   |
|  RESULTS                                          |
|                                                   |
|  1. Triple H def. Undertaker (15:32)            |
|                                                   |
|  2. Stone Cold def. Mankind (12:45)             |
|     OPENER                                       |
|                                                   |
|  3. The Dudley Boyz def. The Hardy Boyz         |
|     ★ NEW TAG TEAM CHAMPIONS!                   |
|                                                   |
|  4. Shawn Michaels def. Bret Hart (60:00)       |
|     CO-MAIN | Iron Man Match                    |
|     ★ NEW INTERCONTINENTAL CHAMPION!            |
|                                                   |
|  5. The Rock def. CM Punk                        |
|     MAIN EVENT | WWE Championship               |
|     ★ NEW WWE CHAMPION!                         |
|                                                   |
|  TITLE CHANGES: 3                                |
|  TOTAL MATCHES: 5                                |
+--------------------------------------------------+
```

## Integration with Existing Functionality

### Matches Integration
- Add `eventId` field to Match model
- Update match scheduling to optionally assign event
- Display event context on match cards
- Link from match to parent event

### Championships Integration
- Highlight championship matches in event card
- Track "PPV defenses" for championship stats
- Note title changes in event results

### Seasons Integration
- Events belong to seasons
- Season page shows event timeline
- Event statistics contribute to season records

### Tournaments Integration
- Tournament matches can be grouped into events
- "King of the Ring" style tournament-as-event

### Promos Integration (if implemented)
- Associate promos with events
- "Road to WrestleMania" promo collections

## Implementation Phases

### PHASE 0: UI Prototypes with Mock Data
**Prerequisites**: None
**Estimated Complexity**: Medium

This phase creates all UI components with hardcoded data so stakeholders can see the look and flow before backend work begins.

#### Steps:
1. Create event types file with interfaces
   - File: `frontend/src/types/event.ts`
   - Details: All TypeScript interfaces for events feature
   - Validation: TypeScript compiles without errors

2. Create mock data file
   - File: `frontend/src/mocks/eventMockData.ts`
   - Details: Hardcoded events, match cards, calendar entries
   - Validation: Data matches interface shapes

3. Create `EventsCalendar.tsx` page
   - File: `frontend/src/components/EventsCalendar.tsx`
   - Details: Monthly calendar view with events using mock data
   - Validation: Events display on correct dates

4. Create `EventCard.tsx` component
   - File: `frontend/src/components/EventCard.tsx`
   - Details: Event poster thumbnail, name, date, match count badge
   - Validation: Renders correctly

5. Create `EventDetail.tsx` page
   - File: `frontend/src/components/EventDetail.tsx`
   - Details: Full event view with match card using mock data
   - Validation: Displays all event data

6. Create `MatchCardDisplay.tsx` component
   - File: `frontend/src/components/MatchCardDisplay.tsx`
   - Details: Ordered match list with designations (pre-show, main event)
   - Validation: Shows matches in correct order

7. Create `EventResults.tsx` component
   - File: `frontend/src/components/EventResults.tsx`
   - Details: Results view for completed events with title changes
   - Validation: Results display correctly

8. Create `CreateEvent.tsx` admin page
   - File: `frontend/src/components/admin/CreateEvent.tsx`
   - Details: Event creation form with image upload placeholder
   - Validation: Form renders, can "create" with mock

9. Create `MatchCardBuilder.tsx` component
   - File: `frontend/src/components/admin/MatchCardBuilder.tsx`
   - Details: Drag-drop match ordering interface
   - Validation: Can reorder matches visually

10. Create CSS files for all event components
    - Files: `Events*.css` for each component
    - Details: Dark theme, event branding colors, responsive
    - Validation: Consistent with existing app styling

11. Add routing for event pages
    - File: Update `App.tsx`
    - Details: Add routes for `/events/*` paths
    - Validation: All routes accessible

12. Add i18n strings for events feature
    - Files: Update `en.json`, `de.json`
    - Details: All user-facing text translatable
    - Validation: Language switch works

#### Testing Criteria:
- All pages render without errors with mock data
- Calendar navigation works
- Responsive on mobile devices
- Consistent styling with existing app

---

### PHASE 1: Core Event Model (Backend)
**Prerequisites**: Phase 0
**Estimated Complexity**: Medium

#### Steps:
1. Add Events table to `serverless.yml` with GSIs
   - Details: Define table structure and indexes
   - Validation: Table created successfully

2. Create event TypeScript types
   - Details: Add to backend types
   - Validation: Types compile

3. Implement `createEvent.ts` Lambda
   - Details: Event creation with validation
   - Validation: Can create events

4. Implement `getEvents.ts` Lambda
   - Details: List events with filters
   - Validation: Returns events correctly

5. Implement `getEvent.ts` Lambda
   - Details: Single event with enriched data
   - Validation: Returns full event details

#### Testing Criteria:
- Events create with all fields
- Filtering works correctly

---

### PHASE 2: Match Card Management (Backend)
**Prerequisites**: Phase 1
**Estimated Complexity**: Medium

#### Steps:
1. Implement `addMatchToEvent.ts` Lambda
   - Details: Add match to event card
   - Validation: Match appears in event

2. Implement `removeMatchFromEvent.ts` Lambda
   - Details: Remove match from event
   - Validation: Match removed correctly

3. Implement `updateMatchCard.ts` Lambda
   - Details: Reorder matches, update designations
   - Validation: Order persists correctly

4. Update Match model to include `eventId`
   - Details: Add optional eventId field
   - Validation: Matches link to events

#### Testing Criteria:
- Matches can be added/removed
- Ordering persists correctly

---

### PHASE 3: Event Status & Workflow (Backend)
**Prerequisites**: Phase 2
**Estimated Complexity**: Low

#### Steps:
1. Implement `updateEventStatus.ts` Lambda
   - Details: Change event status with validation
   - Validation: Status transitions work

2. Add event completion logic
   - Details: Auto-complete when all matches done
   - Validation: Event completes correctly

3. Implement event deletion with safeguards
   - Details: Prevent deletion of events with results
   - Validation: Safeguards enforced

#### Testing Criteria:
- Status transitions are valid
- Completed events protected

---

### PHASE 4: Connect Frontend to Backend
**Prerequisites**: Phase 1, Phase 2, Phase 3
**Estimated Complexity**: High

#### Steps:
1. Add events API functions
   - Details: Add to `services/api.ts`
   - Validation: Can fetch events

2. Replace mock data in `EventsCalendar.tsx` with API calls
   - Details: Remove mock imports, add useEffect for data fetching
   - Validation: Displays real events from backend

3. Replace mock data in `EventDetail.tsx` with API calls
   - Details: Fetch event details and match card
   - Validation: Shows real event data

4. Replace mock data in admin components with API calls
   - Details: Connect CreateEvent and MatchCardBuilder to backend
   - Validation: Can create and manage events

5. Add loading and error states to all components
   - Details: Skeleton loaders, error boundaries
   - Validation: Graceful handling of loading/errors

6. Add navigation and update routing
   - Details: Events link in navigation
   - Validation: Can navigate to events

#### Testing Criteria:
- Calendar displays real data correctly
- Event cards render properly
- Full event management workflow works

---

### PHASE 5: Integration Updates
**Prerequisites**: Phase 2
**Estimated Complexity**: Low

#### Steps:
1. Update match scheduling to include event selection
   - Details: Optional event dropdown in ScheduleMatch
   - Validation: Matches can be assigned to events

2. Add event context to match cards
   - Details: Show event name on match cards
   - Validation: Event visible on matches

3. Update championships to show PPV defenses
   - Details: Track PPV defense count
   - Validation: Statistics accurate

#### Testing Criteria:
- Event context visible throughout app
- Integration seamless

## Classic WWE PPV Names (Suggestions)

For the league to use as event names:

| PPV Name | Month (Traditional) | Description |
|----------|---------------------|-------------|
| Royal Rumble | January | 30-person battle royal |
| Elimination Chamber | February | Chamber match |
| WrestleMania | March/April | Biggest event of the year |
| Backlash | May | WrestleMania rematches |
| King of the Ring | June | Tournament event |
| Money in the Bank | July | Ladder match for briefcase |
| SummerSlam | August | Second biggest event |
| Clash of Champions | September | All titles defended |
| Hell in a Cell | October | Hell in a Cell matches |
| Survivor Series | November | Team elimination matches |
| TLC: Tables, Ladders & Chairs | December | Stipulation-based |

## Technology Recommendations

### Calendar Component
- **react-big-calendar**: Full-featured calendar
- **react-calendar**: Simpler, lightweight
- **Recommendation**: react-big-calendar for event density

### Drag and Drop
- **react-beautiful-dnd**: Mature, accessible
- **dnd-kit**: Modern, performant
- **Recommendation**: dnd-kit for match card builder

### Image Handling
- Leverage existing S3 image upload system
- Add 'events' folder for event posters
- Suggested aspect ratio: 16:9 for cards, 3:4 for full posters

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Orphaned matches in events | Medium | Validate match existence on event load |
| Complex drag-drop UX | Medium | Thorough testing, fallback to manual input |
| Calendar performance | Low | Lazy load event details, pagination |
| Event without matches | Low | Warning message, allow empty events |

## Open Questions

1. Should matches be required to belong to an event, or is it optional?
2. Can a match belong to multiple events (e.g., tournament across shows)?
3. Should there be recurring event templates (weekly Raw)?
4. How to handle event cancellation with scheduled matches?
5. Should completed events be editable (for corrections)?

## Estimated Total Effort

| Phase | Effort |
|-------|--------|
| Phase 0 (UI Prototypes) | 8-10 hours |
| Phase 1 | 4-5 hours |
| Phase 2 | 4-5 hours |
| Phase 3 | 2-3 hours |
| Phase 4 (Connect Frontend) | 6-8 hours |
| Phase 5 | 2-3 hours |
| **Total** | **26-34 hours** |
