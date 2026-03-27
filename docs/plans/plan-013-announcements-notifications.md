# Implementation Plan: Admin Announcements & Notification System

## Executive Summary

This plan adds two features:

1. **Admin Announcements** — Admins create HTML announcements displayed to users via a modal. Dismissals tracked in localStorage (lightweight, no extra table) with a backend endpoint for active announcements.
2. **Notification System** — Bell icon in TopNav/Sidebar with unread badge. Notifications generated as side-effects when promos, challenges, or matches are created. Gated behind a `notifications` feature flag.

Both features follow existing patterns: consolidated `handler.ts` routers, `dynamoDb` helpers, `parseBody`, `response.ts` helpers, `fetchWithAuth` API client, and the `SiteFeatures` flag system.

---

## 1. Data Model

### 1.1 Announcements Table

```
Table: ${service}-announcements-${stage}
PK: announcementId (S)

Attributes:
  announcementId: string      // uuid
  title: string               // short heading
  body: string                // HTML content (scrollable in modal)
  createdBy: string           // admin username/email
  isActive: boolean           // only active announcements shown to users
  priority: number            // higher = shown first (1=low, 2=medium, 3=high)
  expiresAt?: string          // ISO date; null = never expires
  createdAt: string
  updatedAt: string

GSIs:
  ActiveIndex: PK=isActive (S, "true"/"false"), SK=createdAt (S)
    - Used by public get-active endpoint to fetch only active announcements efficiently
```

**Dismissal tracking**: localStorage key `dismissed_announcements` stores a JSON array of announcementId strings. This avoids a join table and works well because announcements are infrequent (few per month). Users who clear localStorage simply see announcements again, which is acceptable.

### 1.2 Notifications Table

```
Table: ${service}-notifications-${stage}
PK: userId (S)        // Cognito sub of the recipient
SK: createdAt (S)     // ISO timestamp — gives chronological ordering per user

Attributes:
  notificationId: string     // uuid (for mark-read operations)
  userId: string             // recipient's Cognito sub
  type: string               // 'promo_mention' | 'challenge_received' | 'match_scheduled' | 'announcement'
  message: string            // human-readable summary (e.g. "John Cena challenged you!")
  sourceId: string           // promoId, challengeId, matchId, or announcementId
  sourceType: string         // 'promo' | 'challenge' | 'match' | 'announcement'
  isRead: boolean
  createdAt: string
  updatedAt: string

GSIs:
  NotificationIdIndex: PK=notificationId (S)
    - Used by mark-read endpoint to find notification by ID without knowing userId+createdAt
  UnreadIndex: PK=userId (S), SK=createdAt (S)
    FilterExpression: isRead = false (sparse index not possible in DynamoDB, so use filter)
    - Actually, we will just query by userId and filter isRead=false in code, which is efficient
      since each user will have at most ~100 notifications. No GSI needed for this.
```

**Simplified**: Only one GSI (`NotificationIdIndex`) is needed. The main table PK=userId, SK=createdAt gives efficient "get my notifications" sorted newest-first via `ScanIndexForward: false`.

---

## 2. API Endpoints

### 2.1 Announcements

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/announcements/active` | Public | Returns active, non-expired announcements sorted by priority desc |
| `GET` | `/admin/announcements` | Admin/Mod | Returns all announcements (active + inactive) |
| `POST` | `/admin/announcements` | Admin/Mod | Create new announcement |
| `PUT` | `/admin/announcements/{announcementId}` | Admin/Mod | Update announcement (title, body, isActive, priority, expiresAt) |
| `DELETE` | `/admin/announcements/{announcementId}` | Admin/Mod | Delete announcement |

**Request/Response shapes:**

```typescript
// POST /admin/announcements
Request: { title: string; body: string; priority?: number; isActive?: boolean; expiresAt?: string }
Response: 201 { announcementId, title, body, ... }

// GET /announcements/active
Response: 200 Announcement[] (filtered: isActive=true, expiresAt > now or null)

// PUT /admin/announcements/{id}
Request: { title?: string; body?: string; isActive?: boolean; priority?: number; expiresAt?: string }
Response: 200 Announcement
```

### 2.2 Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/notifications` | Wrestler+ | Get current user's notifications (paginated, newest first) |
| `GET` | `/notifications/unread-count` | Wrestler+ | Get count of unread notifications for badge |
| `PUT` | `/notifications/{notificationId}/read` | Wrestler+ | Mark single notification as read |
| `PUT` | `/notifications/mark-all-read` | Wrestler+ | Mark all user's notifications as read |

**Request/Response shapes:**

```typescript
// GET /notifications?limit=20&cursor=<createdAt>
Response: 200 { notifications: Notification[], nextCursor: string | null }

// GET /notifications/unread-count
Response: 200 { count: number }

// PUT /notifications/{notificationId}/read
Response: 200 { success: true }

// PUT /notifications/mark-all-read
Response: 200 { updated: number }
```

---

## 3. Implementation Steps

### Phase 1: Backend Infrastructure (Steps 1-3, parallelizable)

#### Step 1: DynamoDB Tables & Serverless Config
**Files to modify:**
- `backend/serverless.yml`

**Changes:**
1. Add environment variables:
   - `ANNOUNCEMENTS_TABLE: ${self:service}-announcements-${self:provider.stage}`
   - `NOTIFICATIONS_TABLE: ${self:service}-notifications-${self:provider.stage}`
2. Add IAM permissions for both new tables (including `/index/*` for GSIs)
3. Add `AnnouncementsTable` resource definition:
   - PK: `announcementId` (S)
   - GSI `ActiveIndex`: PK=`isActive` (S), SK=`createdAt` (S), ProjectionType: ALL
4. Add `NotificationsTable` resource definition:
   - PK: `userId` (S), SK: `createdAt` (S)
   - GSI `NotificationIdIndex`: PK=`notificationId` (S), ProjectionType: ALL
5. Add Lambda function entries for `announcements` and `notifications` handlers (see endpoint table above)

**Depends on:** Nothing

#### Step 2: Backend Shared Library Updates
**Files to modify:**
- `backend/lib/dynamodb.ts`

**Changes:**
1. Add `ANNOUNCEMENTS` and `NOTIFICATIONS` to `TableNames` object

**New files to create:**
- `backend/lib/notifications.ts` — Notification creation utility

```typescript
// Utility function: createNotification(userId, type, message, sourceId, sourceType)
// Used by promos, challenges, matches, and announcements handlers as a side-effect
// Imports dynamoDb, TableNames from dynamodb.ts
// Generates notificationId via uuid, sets isRead=false, timestamps
// Wraps in try-catch so notification failures don't break the main operation
```

**Depends on:** Nothing (can be done in parallel with Step 1)

#### Step 3: TypeScript Types
**Files to modify:**
- `frontend/src/types/index.ts`

**New types to add:**
```typescript
export interface Announcement {
  announcementId: string;
  title: string;
  body: string;          // HTML content
  createdBy: string;
  isActive: boolean;
  priority: number;      // 1=low, 2=medium, 3=high
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType = 'promo_mention' | 'challenge_received' | 'match_scheduled' | 'announcement';

export interface AppNotification {
  notificationId: string;
  userId: string;
  type: NotificationType;
  message: string;
  sourceId: string;
  sourceType: 'promo' | 'challenge' | 'match' | 'announcement';
  isRead: boolean;
  createdAt: string;
}
```

**Depends on:** Nothing (can be done in parallel with Steps 1-2)

---

### Phase 2: Backend Handlers (Steps 4-5, parallelizable with each other, depend on Steps 1-2)

#### Step 4: Announcements Backend Handlers
**New files to create:**
- `backend/functions/announcements/handler.ts` — Consolidated router (pattern: match `event.httpMethod` + `event.resource`)
- `backend/functions/announcements/getActiveAnnouncements.ts` — Public: query ActiveIndex where isActive="true", filter expired, sort by priority desc
- `backend/functions/announcements/listAnnouncements.ts` — Admin: scan all announcements
- `backend/functions/announcements/createAnnouncement.ts` — Admin: validate body, generate uuid, put item
- `backend/functions/announcements/updateAnnouncement.ts` — Admin: get-or-404, build update expression, update
- `backend/functions/announcements/deleteAnnouncement.ts` — Admin: delete item

**Pattern to follow:** `backend/functions/promos/handler.ts` for router, `backend/functions/promos/createPromo.ts` for create handler. Use `parseBody`, `getAuthContext`/`hasRole`, `dynamoDb`, `response.ts` helpers.

**Key behaviors:**
- `getActiveAnnouncements`: Query `ActiveIndex` where `isActive = "true"`, then filter client-side for `expiresAt > now || !expiresAt`. Return sorted by priority descending. This is a public endpoint (no auth).
- `createAnnouncement`: Requires Admin/Moderator role. Optionally trigger notification creation for all users (see Step 6 for notification side-effects — skip for announcements initially; can be added later since it requires listing all Wrestler users from Cognito).
- Store `isActive` as string `"true"`/`"false"` in DynamoDB for GSI compatibility (DynamoDB GSI keys must be S/N/B).

**Depends on:** Steps 1, 2

#### Step 5: Notifications Backend Handlers
**New files to create:**
- `backend/functions/notifications/handler.ts` — Consolidated router
- `backend/functions/notifications/getNotifications.ts` — Auth'd: query by userId (from auth sub), ScanIndexForward=false, optional limit+cursor pagination
- `backend/functions/notifications/getUnreadCount.ts` — Auth'd: query by userId, filter isRead=false, return count
- `backend/functions/notifications/markRead.ts` — Auth'd: get via NotificationIdIndex, verify ownership, update isRead=true
- `backend/functions/notifications/markAllRead.ts` — Auth'd: query all user's unread, batch update to isRead=true

**Key behaviors:**
- `getNotifications`: Uses main table PK=userId, SK=createdAt (descending). Supports cursor-based pagination via `ExclusiveStartKey` using `createdAt` value.
- `getUnreadCount`: Query all for userId, FilterExpression `isRead = :false`. Return `Items.length`. Efficient for <100 items per user.
- `markRead`: Query `NotificationIdIndex` to get the item, verify `userId` matches auth sub, then update the main table item.
- `markAllRead`: Query all user's notifications where `isRead=false`, then batch update. Use `dynamoDb.queryAll` + loop of update calls.
- All endpoints require at minimum `Wrestler` role (use `hasRole(auth, 'Wrestler')`).

**Depends on:** Steps 1, 2

---

### Phase 3: Notification Side-Effects (Step 6, depends on Steps 2, 5)

#### Step 6: Add Notification Triggers to Existing Handlers
**Files to modify:**
- `backend/functions/promos/createPromo.ts` — After promo creation, if `targetPlayerId` is set, look up target player's `userId` and call `createNotification(userId, 'promo_mention', message, promoId, 'promo')`
- `backend/functions/challenges/createChallenge.ts` (or wherever challenge creation lives) — After challenge creation, look up challenged player's `userId` and call `createNotification(userId, 'challenge_received', message, challengeId, 'challenge')`
- `backend/functions/matches/scheduleMatch.ts` — After match creation, for each participant playerId, look up their `userId` (from Players table) and call `createNotification(userId, 'match_scheduled', message, matchId, 'match')`

**Key behaviors:**
- The `createNotification` utility (from `backend/lib/notifications.ts`) wraps calls in try-catch so a notification failure never breaks the main operation.
- Player lookup: Each player record has an optional `userId` field (Cognito sub). Only create notifications for players that have a linked `userId` (i.e., players with user accounts).
- Message format examples:
  - Promo: `"${playerName} cut a promo calling you out!"`
  - Challenge: `"${challengerName} has challenged you to a match!"`
  - Match: `"You've been scheduled in a ${matchFormat} match"`

**Depends on:** Steps 2, 5

---

### Phase 4: Frontend API & Feature Flag (Steps 7-8, parallelizable)

#### Step 7: Frontend API Modules
**New files to create:**
- `frontend/src/services/api/announcements.api.ts`

```typescript
// announcementsApi = {
//   getActive(signal?): Promise<Announcement[]>          // GET /announcements/active
//   getAll(signal?): Promise<Announcement[]>              // GET /admin/announcements
//   create(data): Promise<Announcement>                   // POST /admin/announcements
//   updateById(id, data): Promise<Announcement>           // PUT /admin/announcements/{id}
//   deleteById(id): Promise<void>                         // DELETE /admin/announcements/{id}
// }
```

- `frontend/src/services/api/notifications.api.ts`

```typescript
// notificationsApi = {
//   getAll(limit?, cursor?): Promise<{ notifications: AppNotification[], nextCursor: string | null }>
//   getUnreadCount(signal?): Promise<{ count: number }>
//   markRead(notificationId): Promise<void>
//   markAllRead(): Promise<void>
// }
```

**Files to modify:**
- `frontend/src/services/api/index.ts` — Add exports for `announcementsApi` and `notificationsApi`

**Depends on:** Step 3

#### Step 8: Feature Flag Updates
**Files to modify:**
- `frontend/src/services/api/siteConfig.api.ts` — Add `notifications: boolean` to `SiteFeatures` interface
- `frontend/src/contexts/SiteConfigContext.tsx` — Add `notifications: true` to `DEFAULT_FEATURES`

**Depends on:** Nothing

---

### Phase 5: Frontend Components — Announcements (Steps 9-11, sequential)

#### Step 9: Admin ManageAnnouncements Component
**New files to create:**
- `frontend/src/components/admin/ManageAnnouncements.tsx` — Admin CRUD UI
- `frontend/src/components/admin/ManageAnnouncements.css`

**Features:**
- List all announcements with status badges (active/inactive/expired)
- Create form: title input, HTML body textarea, priority dropdown (Low/Medium/High), expiration date picker, active toggle
- HTML preview panel (render body as `dangerouslySetInnerHTML` in a sandboxed preview div)
- Edit mode: inline editing or modal
- Delete with confirmation
- Follow existing admin component patterns (e.g., `ManageSeasons.tsx`, `ManageCompanies.tsx`)

**Files to modify:**
- `frontend/src/components/admin/AdminPanel.tsx`:
  - Import `ManageAnnouncements`
  - Add `'announcements'` to `AdminTab` type and `VALID_TABS` array
  - Add `announcements: <ManageAnnouncements />` to `tabContent`

**Depends on:** Step 7

#### Step 10: Admin Nav Config for Announcements
**Files to modify:**
- `frontend/src/config/navConfig.ts`:
  - Add `{ path: '/admin/announcements', i18nKey: 'admin.panel.tabs.announcements' }` to the `contentSocial` group in `ADMIN_NAV_GROUPS`
  - Add `'/admin/announcements'` to the `contentSocial` array in `getAdminGroupForPath()`

**Depends on:** Step 9

#### Step 11: User-Facing Announcement Modal
**New files to create:**
- `frontend/src/components/AnnouncementModal.tsx` — Modal overlay shown after login
- `frontend/src/components/AnnouncementModal.css`

**Features:**
- On mount (when user is authenticated), fetch `GET /announcements/active`
- Filter out any `announcementId` values found in `localStorage.getItem('dismissed_announcements')`
- If remaining announcements exist, show modal with:
  - Title at top
  - Scrollable HTML body (`dangerouslySetInnerHTML` in a scrollable container)
  - "Don't show again" button (adds announcementId to localStorage array)
  - "Next" / "Close" buttons if multiple announcements
  - Sorted by priority descending
- Render this component in `App.tsx` (or the layout wrapper), only when `isAuthenticated` is true

**Files to modify:**
- `frontend/src/App.tsx` (or main layout component) — Add `<AnnouncementModal />` after login check

**Depends on:** Step 7

---

### Phase 6: Frontend Components — Notifications (Steps 12-14, sequential)

#### Step 12: Notification Bell Component
**New files to create:**
- `frontend/src/components/NotificationBell.tsx` — Bell icon with unread badge + dropdown panel
- `frontend/src/components/NotificationBell.css`

**Features:**
- Bell SVG icon (inline SVG, no external dependency)
- Red badge circle with unread count (hidden when 0)
- Polling: fetch unread count every 60 seconds via `setInterval` + `notificationsApi.getUnreadCount()`. Clear interval on unmount.
- Also re-fetch count on page navigation (listen to `location` changes)
- Click bell → toggle dropdown panel
- Dropdown shows last 20 notifications with:
  - Type icon (different for promo/challenge/match/announcement)
  - Message text
  - Relative timestamp ("2 hours ago")
  - Read/unread visual distinction (bold for unread)
  - Click notification → `markRead` + navigate to source (`/promos/{id}`, `/challenges/{id}`, `/matches`, etc.)
- "Mark all as read" button at top of dropdown
- Close dropdown on outside click (same pattern as TopNav dropdown)
- Only render when `isAuthenticated && (isWrestler || isAdminOrModerator)` and `features.notifications`

**Depends on:** Steps 7, 8

#### Step 13: Integrate Bell into TopNav
**Files to modify:**
- `frontend/src/components/TopNav.tsx`:
  - Import `NotificationBell`
  - In desktop layout: add `<NotificationBell />` in `topnav-bar-right` div, before `LanguageSwitcher`
  - In mobile layout: add `<NotificationBell />` in `topnav-bar-right` div, before `LanguageSwitcher`
  - Conditionally render: `{isAuthenticated && features.notifications && (isWrestler || isAdminOrModerator) && <NotificationBell />}`

- `frontend/src/components/Sidebar.tsx`:
  - Same bell integration in the sidebar header area

**Depends on:** Step 12

#### Step 14: Notification Dropdown Styling & Mobile
**Files to modify:**
- `frontend/src/components/NotificationBell.css` — Ensure mobile responsive:
  - Desktop: absolute positioned dropdown below bell
  - Mobile: full-width dropdown or slide-in panel
- `frontend/src/components/TopNav.css` — Minor adjustments for bell positioning in bar-right

**Depends on:** Step 13

---

### Phase 7: i18n (Step 15, depends on Steps 9-14)

#### Step 15: Translation Keys
**Files to modify:**
- `frontend/src/i18n/locales/en.json`:
  ```
  admin.panel.tabs.announcements: "Announcements"
  announcements.title: "Announcements"
  announcements.create: "Create Announcement"
  announcements.edit: "Edit Announcement"
  announcements.delete: "Delete Announcement"
  announcements.deleteConfirm: "Are you sure you want to delete this announcement?"
  announcements.fields.title: "Title"
  announcements.fields.body: "Body (HTML)"
  announcements.fields.priority: "Priority"
  announcements.fields.expiresAt: "Expires At"
  announcements.fields.isActive: "Active"
  announcements.priority.low: "Low"
  announcements.priority.medium: "Medium"
  announcements.priority.high: "High"
  announcements.modal.dismiss: "Don't show again"
  announcements.modal.next: "Next"
  announcements.modal.close: "Close"
  announcements.preview: "Preview"
  notifications.title: "Notifications"
  notifications.empty: "No notifications"
  notifications.markAllRead: "Mark all as read"
  notifications.types.promo_mention: "Promo"
  notifications.types.challenge_received: "Challenge"
  notifications.types.match_scheduled: "Match"
  notifications.types.announcement: "Announcement"
  ```

- `frontend/src/i18n/locales/de.json`:
  - German translations for all keys above

**Depends on:** Steps 9-14

---

## 4. Testing Strategy

### Backend Unit Tests
- `backend/functions/announcements/__tests__/` — Test CRUD operations, active filtering, expiration logic
- `backend/functions/notifications/__tests__/` — Test get, unread count, mark-read, mark-all-read
- `backend/lib/__tests__/notifications.test.ts` — Test `createNotification` utility, verify it handles errors gracefully

### Frontend Component Tests
- `frontend/src/components/admin/__tests__/ManageAnnouncements.test.tsx` — Test form validation, create/edit/delete flows
- `frontend/src/components/__tests__/AnnouncementModal.test.tsx` — Test dismissal logic, localStorage interaction, filtering
- `frontend/src/components/__tests__/NotificationBell.test.tsx` — Test badge rendering, polling, dropdown toggle, mark-read

### Integration Testing
- Create announcement → verify it appears in active list → dismiss → verify dismissed in localStorage → re-fetch → verify filtered
- Create challenge targeting player → verify notification created → verify unread count increments → mark read → verify count decrements
- Schedule match with participants → verify notifications created for each participant with userId

---

## 5. Rollout & Feature Flags

1. **Feature flag**: Add `notifications: boolean` to `SiteFeatures`. Default `true` in `DEFAULT_FEATURES`. Admin can disable via Manage Features page.
2. **Announcements**: No feature flag needed — always available to admins. User-facing modal only shows when there are active announcements.
3. **Gradual rollout**: Deploy backend first (tables + handlers), then frontend. Notifications feature flag allows disabling if issues arise.
4. **Cleanup**: localStorage `dismissed_announcements` is self-cleaning — old announcement IDs are harmless and small.

---

## 6. File Summary

### New Files (19 files)

**Backend (10):**
- `backend/lib/notifications.ts`
- `backend/functions/announcements/handler.ts`
- `backend/functions/announcements/getActiveAnnouncements.ts`
- `backend/functions/announcements/listAnnouncements.ts`
- `backend/functions/announcements/createAnnouncement.ts`
- `backend/functions/announcements/updateAnnouncement.ts`
- `backend/functions/announcements/deleteAnnouncement.ts`
- `backend/functions/notifications/handler.ts`
- `backend/functions/notifications/getNotifications.ts`
- `backend/functions/notifications/getUnreadCount.ts`
- `backend/functions/notifications/markRead.ts`
- `backend/functions/notifications/markAllRead.ts`

**Frontend (6):**
- `frontend/src/services/api/announcements.api.ts`
- `frontend/src/services/api/notifications.api.ts`
- `frontend/src/components/admin/ManageAnnouncements.tsx`
- `frontend/src/components/admin/ManageAnnouncements.css`
- `frontend/src/components/AnnouncementModal.tsx`
- `frontend/src/components/AnnouncementModal.css`
- `frontend/src/components/NotificationBell.tsx`
- `frontend/src/components/NotificationBell.css`

### Modified Files (12)

- `backend/serverless.yml` — Tables, env vars, IAM, function entries
- `backend/lib/dynamodb.ts` — TableNames
- `backend/functions/promos/createPromo.ts` — Notification side-effect
- `backend/functions/challenges/` (create handler) — Notification side-effect
- `backend/functions/matches/scheduleMatch.ts` — Notification side-effect
- `frontend/src/types/index.ts` — New interfaces
- `frontend/src/services/api/index.ts` — New exports
- `frontend/src/services/api/siteConfig.api.ts` — `notifications` flag
- `frontend/src/contexts/SiteConfigContext.tsx` — `notifications` default
- `frontend/src/components/admin/AdminPanel.tsx` — Announcements tab
- `frontend/src/config/navConfig.ts` — Admin nav entry
- `frontend/src/components/TopNav.tsx` — NotificationBell
- `frontend/src/components/Sidebar.tsx` — NotificationBell
- `frontend/src/i18n/locales/en.json` — Translation keys
- `frontend/src/i18n/locales/de.json` — Translation keys
- `frontend/src/App.tsx` — AnnouncementModal

---

## 7. Dependency Graph

```
Step 1 (serverless.yml) ──┐
Step 2 (lib updates)  ────┤
Step 3 (TS types)     ────┤
                           │
                           ▼
            ┌──── Step 4 (Announcements BE)
            │     Step 5 (Notifications BE)
            │              │
            │              ▼
            │     Step 6 (Side-effects in existing handlers)
            │
            ▼
Step 7 (FE API modules) ◄── Step 3
Step 8 (Feature flag)
            │
            ▼
Step 9  (ManageAnnouncements) ──► Step 10 (Nav config) ──► Step 11 (Modal)
Step 12 (NotificationBell)   ──► Step 13 (TopNav/Sidebar) ──► Step 14 (Mobile CSS)
            │
            ▼
Step 15 (i18n — all translations)
```

**Parallelizable waves:**
- Wave 1: Steps 1, 2, 3 (all independent)
- Wave 2: Steps 4, 5 (both depend on 1+2, independent of each other)
- Wave 3: Steps 6, 7, 8 (6 depends on 2+5; 7 depends on 3; 8 independent)
- Wave 4: Steps 9, 12 (independent of each other, depend on 7)
- Wave 5: Steps 10, 11, 13 (depend on 9 or 12)
- Wave 6: Steps 14, 15 (final polish)
