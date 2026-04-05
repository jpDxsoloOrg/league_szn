Plan: Storyline Requests, Challenge Rework, Recent Results, In-Progress Events, GM Wizard

## Context

Five feature requests to evolve the league's booking and communication experience:

1. **Storyline / Backstage Attack / Rivalry Requests** — Players can formally request a GM-driven narrative (storyline, backstage attack, or rivalry) against another player
2. **Challenge System Rework** — Decouple challenges from promos; support multi-wrestler challenges; notification-driven accept/decline flow with reasons
3. **Recent Results — Last 3 Days** — Dashboard recent results change from a fixed count to a 3-day rolling window
4. **In-Progress Events Section** — Dashboard (and events page) surfaces events currently underway separately from upcoming ones
5. **GM Announcement Wizard** — Step-by-step wizard for GMs to produce a formatted HTML match card (5-match card + promo text) and a Breaking News announcement

---

## Feature 1: Storyline / Backstage Attack / Rivalry Requests

### New DynamoDB Table

Modify `backend/serverless.yml`

Add `StorylineRequestsTable`:
- PK: `requestId` (S)
- Attrs: `requesterId` (S), `targetPlayerIds` (SS — one or more), `requestType` ('storyline' | 'backstage_attack' | 'rivalry'), `description` (S, max 500 chars), `status` ('pending' | 'acknowledged' | 'declined'), `gmNote` (S, optional), `createdAt`, `updatedAt`
- GSI: `RequesterIndex` (requesterId, createdAt) — player views own requests
- GSI: `StatusIndex` (status, createdAt) — admin views pending requests

### New Backend Lambda Functions

Create `backend/functions/storylineRequests/` directory:

- `createStorylineRequest.ts` — `POST /storyline-requests` (player auth)
  - Accepts `{ requestType, targetPlayerIds[], description }`
  - Validates requestType is one of the three valid types
  - Validates targetPlayerIds exist and aren't the requester
  - Creates record with status `pending`
  - Fires a notification to all GMs (insert into Notifications table with type `storyline_request`)

- `getMyStorylineRequests.ts` — `GET /storyline-requests/me` (player auth)
  - Returns all requests submitted by the logged-in player, newest first

- `getStorylineRequests.ts` — `GET /admin/storyline-requests` (admin auth)
  - Accepts optional `?status=pending` query param
  - Returns all requests with requester name and target player names joined

- `reviewStorylineRequest.ts` — `PUT /admin/storyline-requests/{requestId}` (admin auth)
  - Body: `{ status: 'acknowledged' | 'declined', gmNote?: string }`
  - Updates status + gmNote + updatedAt
  - Sends notification to the requester player with the outcome

Modify `backend/serverless.yml` — add 4 new routes and the new table

### Frontend — Player Profile

Modify `frontend/src/components/profile/WrestlerProfile.tsx`

Add a "Request a Storyline" card/section:
- Request type radio/select: Storyline / Backstage Attack / Rivalry
- Target player(s) multi-select (searchable, excludes self)
- Description textarea (max 500 chars)
- Submit button
- Below form: list of player's past requests with status badge (Pending / Acknowledged / Declined) and GM note if declined

### Frontend — Admin Panel

Modify `frontend/src/components/admin/AdminPanel.tsx`
- Add `'storyline-requests'` to the AdminTab type

Create `frontend/src/components/admin/ManageStorylineRequests.tsx`
- Tabs: "Pending" | "All"
- Table columns: Requester | Type | Target(s) | Description | Date | Actions
- Actions: "Acknowledge" button + optional note field, "Decline" button + required note field
- History tab shows resolved requests with GM notes

### API Service

Modify `frontend/src/services/api.ts`
- Add `storylineRequestsApi`: `create`, `getMine`, `getAll`, `review`

### Types

Modify `frontend/src/types/index.ts`
- Add `StorylineRequest` interface

---

## Feature 2: Challenge System Rework

### What Changes

Currently `IssueChallenge.tsx` is reachable from the Promos/Challenge area and the two are intertwined. This feature:
- Removes promo prerequisites / promo framing from the challenge flow
- Supports challenging more than one opponent (multi-select)
- Adds notification-driven accept/decline with a reason field for declines

### Backend Changes

Modify `backend/functions/challenges/createChallenge.ts`
- Remove any promo-related fields (`message` used as a promo-style field → rename to `challengeNote`, make truly optional)
- Accept `opponentIds: string[]` instead of a single `opponentId`
  - Singles challenge: exactly 1 opponent
  - Multi-person / tag challenge: 2+ opponents allowed
- On creation, create one Notification per challenged player (type `challenge_received`, payload includes `challengeId`)

Modify `backend/functions/challenges/respondToChallenge.ts`
- Body: `{ response: 'accepted' | 'declined', declineReason?: string }`
- `declineReason` required when `response === 'declined'`
- On respond, notify the challenger with the outcome + declineReason (if declined)
- If any opponent declines → challenge status becomes `partially_declined` or `declined`
- **If all opponents accept → auto-schedule the match:**
  1. Determine the target show date:
     - Find the next upcoming event (`status = 'upcoming'`) with a date after today
     - If the acceptance day is Sunday (`getDay() === 0`), advance to Monday before comparing — i.e. the earliest eligible event date must be on Monday or later
     - If no upcoming event exists, create a bare match record with `date` set to the next eligible day (next calendar day, or Monday if today is Sunday) but no `eventId`
  2. Call the matches create logic (same as `createMatch`) with:
     - `participants`: all challenge participants (challenger + all opponentIds)
     - `matchType`: challenge's `matchType`
     - `stipulation`: challenge's `stipulation` (if set)
     - `status`: `'scheduled'`
     - `designation`: `'pre-show'`
     - `date`: the target show date
     - `eventId`: the upcoming event's `eventId` (if one was found)
     - `isChampionship`: `false` (challenge matches are never auto-scheduled as title matches)
     - `challengeId`: the originating challengeId (stored for traceability)
  3. Update challenge status to `'auto_scheduled'`, store the new `matchId` on the challenge record
  4. Notify all participants (challenger + opponents) with notification type `challenge_scheduled`, payload includes `matchId` and `eventId`

Modify `backend/functions/challenges/getChallenges.ts`
- Ensure the response includes `opponentIds[]`, `declineReasons` map, and per-opponent response status

### Frontend Changes

Modify `frontend/src/components/challenges/IssueChallenge.tsx`
- Replace single-opponent select with a multi-select (using `SearchableSelect` or similar)
  - Minimum 1 opponent; maximum 5
- Remove promo-style "message preview" UI — replace with a simple optional `challengeNote` text area (1–200 chars, no preview step)
- Update submit payload to send `opponentIds[]`

Create `frontend/src/components/challenges/ChallengeResponse.tsx` (new page/modal)
- Route: `/challenges/:challengeId/respond`
- Loads challenge detail (GET `/challenges/:id`)
- Shows: who challenged you, match type, stipulation, optional note
- "Accept" button → calls respondToChallenge with `accepted`
  - If this acceptance makes all parties accepted, the API auto-schedules the match and returns the new `matchId` + event details
  - Show a confirmation banner: "Challenge accepted! Your match has been scheduled as a Pre-Show match on [Event Name / Date]." with a link to the match
- "Decline" button → reveals a required reason textarea, then submits `declined` + reason
- On completion (accept or decline), shows confirmation and navigates back to MyChallenges

Modify `frontend/src/components/NotificationBell.tsx` / notification click handler
- `challenge_received` → navigate to `/challenges/:challengeId/respond`
- `challenge_accepted` / `challenge_declined` → navigate to `/challenges/:challengeId`
- `challenge_scheduled` → navigate to `/matches/:matchId` (the auto-created match)

Modify `frontend/src/components/challenges/MyChallenges.tsx`
- Show per-opponent response status when multiple opponents (accepted/declined/pending per player)
- Show decline reason inline under a declined opponent's name
- Challenges with status `auto_scheduled` show a "Scheduled ✓" badge with a link to the match instead of accept/decline actions

Modify `frontend/src/components/challenges/ChallengeDetail.tsx`
- Display all opponents with individual response status
- Show decline reasons

### Types

Modify `frontend/src/types/index.ts`
- Update `Challenge` interface:
  - `opponentIds: string[]` (was single `opponentId`)
  - `responses: Record<string, { status: 'pending' | 'accepted' | 'declined'; declineReason?: string }>`
  - `challengeNote?: string` (replaces `message`)
  - `status`: extend union to include `'auto_scheduled'`
  - `matchId?: string` — populated once auto-scheduled
  - `scheduledEventId?: string` — the event the match was placed on (if any)

---

## Feature 3: Recent Results — Last 3 Days

### Backend

Modify `backend/functions/dashboard/getDashboard.ts`

In the "Recent results" section (currently slices to 20 then maps):
- After filtering `completedMatches`, add a date filter:
  ```
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const recentCompletedMatches = completedMatches.filter(m => (m.updatedAt || m.date) >= threeDaysAgo);
  ```
- Apply this filtered list instead of `completedMatches.slice(0, 20)`
- Keep a reasonable safety cap (e.g. 50) to avoid unbounded response if somehow many matches land in 3 days

No frontend changes needed — the component already renders whatever the API returns.

---

## Feature 4: In-Progress Events

### Backend

Modify `backend/functions/events/getEvents.ts` and `backend/functions/events/updateEvent.ts`
- Ensure `in_progress` is a valid event status value alongside `upcoming`, `completed`, `cancelled`

Modify `backend/functions/dashboard/getDashboard.ts`
- The dashboard currently queries events with `status = 'upcoming'` (KeyConditionExpression on a GSI)
- Add a second query for `status = 'in_progress'` in parallel with the upcoming query
- Return `inProgressEvents: DashboardEvent[]` in the response alongside `upcomingEvents`

Modify `DashboardResponse` interface in `getDashboard.ts`:
- Add `inProgressEvents: DashboardEvent[]`

### Frontend — Dashboard

Modify `frontend/src/components/Dashboard.tsx`
- Add `inProgressEvents` to the dashboard data type
- Render a new "In Progress" section above the "Upcoming Events" section when `inProgressEvents.length > 0`
- Style distinctly (e.g. pulsing/live indicator badge on each card)

### Frontend — Events Calendar/List

Modify `frontend/src/components/events/EventsCalendar.tsx` (or the events list page)
- Add "In Progress" as a visible status filter option and/or render in-progress events in a highlighted section at the top

### Admin — Create/Edit Event

Modify `frontend/src/components/admin/CreateEvent.tsx`
- Add `in_progress` to the status dropdown so GMs can mark an event as underway

### Types

Modify `frontend/src/types/event.ts`
- Add `'in_progress'` to the `LeagueEvent` status union type

---

## Feature 5: GM Announcement Wizard

A two-mode wizard for GMs to generate structured announcements:

**Mode A — Match Card** (5 matches + optional promo text → HTML card announcement)
**Mode B — Breaking News** (headline + body + optional image → Breaking News announcement)

### Backend

No new Lambda functions needed. Both modes call the existing announcements system:
- `POST /announcements` with `{ title, body (HTML), priority, isActive, expiresAt? }`
- The wizard generates the `body` HTML client-side then posts it via `announcementsApi.create()`

Optional enhancement: add a `subtype` field (`'match_card' | 'breaking_news' | 'general'`) to the announcements table + `createAnnouncement.ts` to allow filtering/display logic later. This is a minor additive change.

Modify `backend/functions/announcements/createAnnouncement.ts`
- Accept optional `subtype?: 'match_card' | 'breaking_news' | 'general'`
- Store it on the record (no validation required — default to `'general'` if absent)

Modify `backend/serverless.yml` (Announcements table)
- No table changes needed; `subtype` is a new optional attribute on existing records

### Frontend — New Wizard Component

Create `frontend/src/components/admin/AnnouncementWizard.tsx`

Multi-step wizard using a `step` state variable. Shared state for both modes.

#### Step 0 — Choose Mode
- Two large cards: "Match Card Announcement" | "Breaking News"
- Selecting a mode advances to Step 1 of that mode

---

#### Match Card Mode — Step 1: Event Details
- Select existing event from dropdown (optional — links the card to an event) OR enter free-form show name
- Show date (auto-filled from event if selected, otherwise date picker)
- Optional tagline / subtitle text

#### Match Card Mode — Step 2: Matches (1–5)
- Ordered list of up to 5 match slots (minimum 1, max 5)
- Per slot:
  - Match designation: Pre-Show / Opener / Midcard / Co-Main / Main Event
  - Participant A (searchable player select)
  - vs. label (auto, or "& " for tag)
  - Participant B (searchable player select)
  - Optional stipulation text (free text, e.g. "Ladder Match", "Iron Man Match")
  - Championship toggle → if on, select championship from dropdown
  - Optional match teaser line (short flavor text, e.g. "The rivalry ends here!")
- "Add Another Match" button (up to 5)
- Drag-to-reorder matches (optional UX enhancement)

#### Match Card Mode — Step 3: Promo Text (optional)
- Large textarea: GM can write optional opening promo / narrative text that appears at the top of the card
- Character limit: 800

#### Match Card Mode — Step 4: Preview & Publish
- Renders a visual preview of the HTML card using the same CSS as the public announcement modal
- Shows the generated HTML (collapsible) for advanced users
- Fields: Title (auto-generated from show name), Priority (1/2/3), Expiry (optional)
- "Publish" → calls `announcementsApi.create({ title, body: generatedHtml, subtype: 'match_card', priority, isActive: true, expiresAt })`
- On success: success toast + offer "Create Another" or "Back to Announcements"

**Generated HTML structure for match card:**
```html
<div class="match-card-announcement">
  <div class="card-header">
    <h2 class="show-name">{showName}</h2>
    <span class="show-date">{date}</span>
    {tagline && <p class="tagline">{tagline}</p>}
  </div>
  {promoText && <div class="card-promo">{promoText}</div>}
  <div class="card-matches">
    {matches.map(match => (
      <div class="card-match card-match--{designation}">
        <span class="match-designation">{designationLabel}</span>
        {match.isChampionship && <span class="championship-badge">🏆 {championshipName}</span>}
        <div class="match-participants">{participantA} vs. {participantB}</div>
        {match.stipulation && <span class="match-stip">{stipulation}</span>}
        {match.teaser && <p class="match-teaser">{teaser}</p>}
      </div>
    ))}
  </div>
</div>
```

---

#### Breaking News Mode — Step 1: Headline & Body
- Headline input (max 100 chars) — becomes announcement title
- Body rich text (textarea, max 1000 chars) — supports newlines, rendered as `<p>` tags
- Optional image URL field (if provided, renders as header image in the HTML)

#### Breaking News Mode — Step 2: Preview & Publish
- Visual preview in the announcement modal style
- Priority select (Low / Medium / High)
- Expiry date (optional)
- "Publish" → calls `announcementsApi.create({ title: headline, body: generatedHtml, subtype: 'breaking_news', priority, isActive: true })`
- On success: success toast

**Generated HTML structure for breaking news:**
```html
<div class="breaking-news-announcement">
  {imageUrl && <img class="breaking-news-image" src="{imageUrl}" alt="Breaking News" />}
  <div class="breaking-news-badge">⚡ BREAKING NEWS</div>
  <div class="breaking-news-body">
    {paragraphs.map(p => <p>{p}</p>)}
  </div>
</div>
```

### Frontend — Integration Into Admin Panel

Modify `frontend/src/components/admin/AdminPanel.tsx`
- Add `'announcement-wizard'` to the AdminTab type
- Add tab label "Card Wizard" (or similar)
- Render `<AnnouncementWizard />` for this tab

Alternatively, add an "Create with Wizard" button inside `ManageAnnouncements.tsx` that shows the wizard in a full-screen modal overlay — this keeps the wizard accessible without cluttering the tab list.

### CSS

Create `frontend/src/components/admin/AnnouncementWizard.css`
- Step indicator bar (Step 1 of 4)
- Match slot cards with colored left-border per designation (matching existing `designationColors` in `MatchCardBuilder.tsx`)
- Preview container styled to match the public `AnnouncementModal.css` appearance

---

## Files to Create (New)

| File | Purpose |
|------|---------|
| `backend/functions/storylineRequests/createStorylineRequest.ts` | Player submits storyline/attack/rivalry request |
| `backend/functions/storylineRequests/getMyStorylineRequests.ts` | Player views own requests |
| `backend/functions/storylineRequests/getStorylineRequests.ts` | Admin views all requests |
| `backend/functions/storylineRequests/reviewStorylineRequest.ts` | Admin acknowledges or declines |
| `frontend/src/components/admin/ManageStorylineRequests.tsx` | Admin UI for storyline requests |
| `frontend/src/components/admin/ManageStorylineRequests.css` | Styles |
| `frontend/src/components/challenges/ChallengeResponse.tsx` | Accept/Decline challenge page |
| `frontend/src/components/challenges/ChallengeResponse.css` | Styles |
| `frontend/src/components/admin/AnnouncementWizard.tsx` | GM multi-step wizard |
| `frontend/src/components/admin/AnnouncementWizard.css` | Wizard styles |

---

## Files to Modify (Key)

| File | What Changes |
|------|--------------|
| `backend/serverless.yml` | Add StorylineRequestsTable, 4 new storyline routes, announcements subtype field, in_progress event status |
| `backend/functions/challenges/createChallenge.ts` | Accept `opponentIds[]`, optional `challengeNote`, fire notifications |
| `backend/functions/challenges/respondToChallenge.ts` | Require `declineReason` on decline, per-opponent response tracking, notify challenger |
| `backend/functions/challenges/getChallenges.ts` | Return `opponentIds[]` and per-opponent response map |
| `backend/functions/dashboard/getDashboard.ts` | 3-day window for recent results; add in-progress events query; add `inProgressEvents` to response |
| `backend/functions/events/getEvents.ts` | Accept `in_progress` as a valid status |
| `backend/functions/announcements/createAnnouncement.ts` | Accept optional `subtype` field |
| `frontend/src/types/index.ts` | Update Challenge interface; add StorylineRequest; add inProgressEvents to Dashboard type |
| `frontend/src/types/event.ts` | Add `'in_progress'` to status union |
| `frontend/src/components/challenges/IssueChallenge.tsx` | Multi-select opponents, remove promo framing, rename message→challengeNote |
| `frontend/src/components/challenges/MyChallenges.tsx` | Show per-opponent response status + decline reasons |
| `frontend/src/components/challenges/ChallengeDetail.tsx` | Show all opponents with individual statuses + decline reasons |
| `frontend/src/components/NotificationBell.tsx` | Route `challenge_received` notifications to ChallengeResponse page |
| `frontend/src/components/Dashboard.tsx` | Render `inProgressEvents` section above upcoming events |
| `frontend/src/components/events/EventsCalendar.tsx` | Surface in-progress events at top with live badge |
| `frontend/src/components/admin/CreateEvent.tsx` | Add `in_progress` to status dropdown |
| `frontend/src/components/admin/AdminPanel.tsx` | Add storyline-requests tab + wizard tab/button |
| `frontend/src/components/admin/ManageAnnouncements.tsx` | Add "Create with Wizard" button |
| `frontend/src/services/api.ts` | Add `storylineRequestsApi`; update `challengesApi` signatures |

---

## Suggested Implementation Order

1. **Recent Results — Last 3 Days** — 1-file backend change, zero frontend work. Warmup.
2. **In-Progress Events** — Small backend addition + dashboard + event status enum change. Low risk.
3. **Storyline / Backstage Attack / Rivalry Requests** — Self-contained new table + 4 lambdas + admin UI. No changes to existing features.
4. **Challenge System Rework** — Modifies existing challenge flow. Do after the above to avoid conflicting work.
5. **GM Announcement Wizard** — Purely frontend (except minor `subtype` backend addition). Do last; heaviest UI work.

---

## Verification

- **Recent Results**: Record a match > 3 days ago and one today — only today's appears on dashboard.
- **In-Progress Events**: Create an event, mark it `in_progress` via admin → verify "In Progress" section appears on dashboard above upcoming events.
- **Storyline Requests**: Log in as player → submit a Backstage Attack request against another player → log in as admin → see it in pending list → acknowledge → requester gets notification.
- **Challenge Rework — Decline**: Log in as player → challenge 2 opponents → one clicks notification → ChallengeResponse page → declines with reason → challenger sees decline reason in ChallengeDetail.
- **Challenge Rework — Auto-Schedule**: Challenge 1 opponent → opponent accepts → verify a new match is created with `designation: 'pre-show'` on the next upcoming event (or next Monday if accepted on Sunday) → both players receive `challenge_scheduled` notification linking to the match → challenge shows "Scheduled ✓" badge in MyChallenges.
- **Wizard — Match Card**: Open wizard as admin → choose Match Card → fill 5 matches + promo text → preview renders correctly → publish → verify announcement appears on public side with correct HTML.
- **Wizard — Breaking News**: Open wizard → choose Breaking News → add headline + body → publish → verify announcement displays with ⚡ badge.
- Run TypeScript validation: `cd frontend && npx tsc --project tsconfig.app.json --noEmit` and `cd backend && npx tsc --project tsconfig.json --noEmit`
