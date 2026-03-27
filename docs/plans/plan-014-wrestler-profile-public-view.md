# Implementation Plan: Main/Alternate Wrestler + Public Player Profile

## Executive Summary

Two related features:

1. **Main & Alternate Wrestler** — Add an optional `alternateWrestler` field to the Player data model. Display both in profiles; allow editing via WrestlerProfile and admin ManagePlayers. No separate stat tracking needed — purely informational.
2. **Public Player Profile** — A new read-only `/player/:playerId` route showing a player's full profile (image, wrestlers, PSN, division, stable, tag team, records, form, streak) with action buttons for Head-to-Head comparison and issuing challenges. Accessible by clicking a player row in Standings.

Both features follow existing patterns: `ALLOWED_FIELDS` whitelist in player handlers, `fetchWithAuth` API client, `useParams`/`useSearchParams` for routing, `SiteFeatures` flag system for conditional UI.

---

## 1. Data Model

### 1.1 Players Table — New Attribute

```
Existing Table: ${service}-players-${stage}
PK: playerId (S)

New Attribute:
  alternateWrestler?: string    // optional secondary wrestler name
```

No new tables, GSIs, or indexes required. DynamoDB is schema-less; the new attribute is stored alongside existing ones.

---

## 2. Backend Changes

### Step 1: Add `alternateWrestler` to player update handlers

**Files to modify:**
- `backend/functions/players/updateMyProfile.ts`
- `backend/functions/players/updatePlayer.ts`

**Changes in `updateMyProfile.ts`:**
1. Add `'alternateWrestler'` to the `ALLOWED_FIELDS` array.
2. Add validation: string type, max `MAX_NAME_LENGTH` characters.
3. Handle empty string — when `alternateWrestler` is `''`, use DynamoDB REMOVE expression to clear the attribute (same pattern used for clearing `divisionId`).

**Changes in `updatePlayer.ts`:**
1. Add `alternateWrestler: body.alternateWrestler` to the `updateFields` object.
2. Add `alternateWrestler` to `removeFields` when empty/null (same pattern as `divisionId` clearing).

No changes needed to `getPlayers.ts` or `getMyProfile.ts` — DynamoDB scan/query returns all attributes automatically.

**Depends on:** Nothing.

### Step 2: Add `GET /players/{playerId}` endpoint

**Files to create:**
- `backend/functions/players/getPlayer.ts`

**Files to modify:**
- `backend/functions/players/handler.ts`
- `backend/serverless.yml`

**New handler `getPlayer.ts`:**
1. Read `playerId` from `event.pathParameters`.
2. `dynamoDb.get()` on `TableNames.PLAYERS` with key `{ playerId }`.
3. Return `notFound` if no item; otherwise return `success(player)`.
4. Also fetch season records (same logic as `getMyProfile.ts` lines ~30-60) so the public profile can show per-season W-L-D.
5. ~40 lines of code.

**Rationale for dedicated endpoint:** The public profile needs season records, which `GET /players` does not return. Adding season-record computation for all players in the list endpoint would be expensive and wasteful.

**In `handler.ts`:** Add route entry `{ resource: '/players/{playerId}', method: 'GET', handler: getPlayerHandler }`.

**In `serverless.yml`:** Add HTTP event (public, no authorizer):
```yaml
- http:
    path: players/{playerId}
    method: get
    cors: *corsConfig
```

**Depends on:** Nothing. Can run in parallel with Step 1.

---

## 3. Frontend Types & API Client

### Step 3: Update frontend types and API client

**Files to modify:**
- `frontend/src/types/index.ts`
- `frontend/src/services/api/players.api.ts`
- `frontend/src/services/api/profile.api.ts`

**In `types/index.ts`:**
- Add `alternateWrestler?: string;` to the `Player` interface (after `currentWrestler`).

**In `players.api.ts`:**
- Add `getById` method:
```typescript
getById: async (playerId: string, signal?: AbortSignal): Promise<Player> => {
  return fetchWithAuth(`${API_BASE_URL}/players/${playerId}`, {}, signal);
},
```

**In `profile.api.ts`:**
- Add `alternateWrestler?: string;` to the `updateMyProfile` parameter type.

**Depends on:** Steps 1-2 (backend must accept the new field and serve the new endpoint).

---

## 4. Frontend Components

### Step 4: Update WrestlerProfile for alternateWrestler

**Files to modify:**
- `frontend/src/components/profile/WrestlerProfile.tsx`

**Changes:**
1. Add `alternateWrestler` to `formData` state initialization.
2. Update `loadProfile` to populate `alternateWrestler` in formData.
3. Update `handleEdit`/`handleCancel` to reset `alternateWrestler`.
4. Update `handleSubmit` to include `alternateWrestler` in the updates object.
5. Add form input for "Alternate Wrestler" in edit mode, after the "Current Wrestler" input.
6. Update view-mode profile header to display `alternateWrestler` below `currentWrestler` (when set):
```tsx
{player.alternateWrestler && (
  <p className="profile-alternate-wrestler">
    {t('profile.alternate')}: {player.alternateWrestler}
  </p>
)}
```

**Depends on:** Step 3.

### Step 5: Update admin ManagePlayers for alternateWrestler

**Files to modify:**
- `frontend/src/components/admin/ManagePlayers.tsx`

**Changes:**
1. Add `alternateWrestler` to `formData` state initialization.
2. Add `alternateWrestler` to the create/update API call body.
3. Add `alternateWrestler` to the edit prefill.
4. Add `alternateWrestler` to the form reset.
5. Add form input field after "Current Wrestler" input.
6. Add column in the players table to display `alternateWrestler`.

**Depends on:** Step 3. Can run in parallel with Step 4.

### Step 6: Create PublicProfile component

**Files to create:**
- `frontend/src/components/profile/PublicProfile.tsx`
- `frontend/src/components/profile/PublicProfile.css`

**PublicProfile.tsx structure:**
1. Read `playerId` from route params via `useParams<{ playerId: string }>()`.
2. Fetch player data via `playersApi.getById(playerId)` on mount with AbortController cleanup.
3. Fetch standings via `standingsApi.get()` and filter by playerId for `recentForm` and `currentStreak`.
4. Fetch divisions, stables, tag teams in parallel (for display names).
5. Display sections:
   - **Profile header:** image, name, main wrestler (`currentWrestler`), alternate wrestler (`alternateWrestler`), PSN ID.
   - **Division badge** (resolved from `divisionId`).
   - **Stable name** (resolved from `stableId`, if stables feature enabled).
   - **Tag team name** (resolved from `tagTeamId`, if stables feature enabled).
   - **All-Time Record:** wins-losses-draws, win%.
   - **Season Records** (from season records returned by `GET /players/{playerId}`).
   - **Form dots and streak badge** (from standings data).
6. **Action buttons:**
   - "View Head-to-Head" → `<Link to={`/stats/head-to-head?player1=${playerId}`}>`
   - "Full Stats" → `<Link to={`/stats/player/${playerId}`}>`
   - "Challenge" → visible only when `features.challenges && authState.playerId && authState.playerId !== playerId`. Links to `/promos/new?promoType=call-out&targetId=${playerId}`.
7. Loading: `Skeleton` component. Error/not found: `EmptyState` component.
8. Use `useDocumentTitle` hook with the player name.
9. All strings use `t()` with keys under `publicProfile.*`.

**PublicProfile.css:** Reuse WrestlerProfile.css class patterns with a `public-profile` wrapper class.

**Depends on:** Step 3.

### Step 7: Update Standings.tsx navigation target

**Files to modify:**
- `frontend/src/components/Standings.tsx`

**Changes:**
1. Change row `onClick` navigation from `/stats/player/${player.playerId}` to `/player/${player.playerId}`.
2. Change `onKeyDown` navigation similarly.
3. Change `<Link>` in the player name cell to `/player/${player.playerId}`.

**Depends on:** Step 6. Can run in parallel with Steps 4-5.

---

## 5. Routing & Navigation

### Step 8: Add route and update HeadToHeadComparison for URL params

**Files to modify:**
- `frontend/src/App.tsx`
- `frontend/src/components/statistics/HeadToHeadComparison.tsx`

**In `App.tsx`:**
1. Import `PublicProfile` from `'./components/profile/PublicProfile'`.
2. Add public route: `<Route path="/player/:playerId" element={<PublicProfile />} />`

**In `HeadToHeadComparison.tsx`:**
1. Import `useSearchParams`.
2. After loading players, check for `?player1=` search param. If present, pre-select that player as `player1Id`.

**Note:** Verify that `PromoEditor.tsx` already reads `targetId` from search params. If it does, no changes needed for the "Challenge" button flow.

**Depends on:** Step 6.

---

## 6. Internationalization

### Step 9: Add i18n translation keys

**Files to modify:**
- `frontend/src/i18n/locales/en.json`
- `frontend/src/i18n/locales/de.json`

**New keys (English):**
```json
{
  "profile": {
    "alternateWrestler": "Alternate Wrestler",
    "alternateWrestlerPlaceholder": "Your backup wrestler",
    "alternate": "Alternate",
    "mainWrestler": "Main Wrestler"
  },
  "publicProfile": {
    "title": "Player Profile",
    "allTimeRecord": "All-Time Record",
    "seasonRecords": "Season Records",
    "record": "Record",
    "winPercent": "Win %",
    "viewHeadToHead": "View Head-to-Head",
    "fullStats": "Full Stats",
    "challenge": "Challenge",
    "division": "Division",
    "stable": "Stable",
    "tagTeam": "Tag Team",
    "notFound": "Player not found",
    "notFoundDescription": "The player you're looking for doesn't exist.",
    "form": "Recent Form",
    "streak": "Current Streak",
    "playingAs": "Playing as",
    "alternateWrestler": "Alternate",
    "psnId": "PSN ID"
  },
  "admin": {
    "players": {
      "alternateWrestler": "Alternate Wrestler"
    }
  }
}
```

Add corresponding German translations in `de.json`.

**Depends on:** Nothing. Can run early.

---

## 7. Verification

### Step 10: End-to-end verification

1. **TypeScript compilation:**
   - `cd frontend && npx tsc --project tsconfig.app.json --noEmit`
   - `cd backend && npx tsc --project tsconfig.json --noEmit`
2. **Lint:** `cd frontend && npx eslint src/` and `cd backend && npx eslint functions/`
3. **Functional checks:**
   - `GET /players` returns players (with `alternateWrestler` if set).
   - `PUT /players/me` accepts and persists `alternateWrestler`.
   - `GET /players/{playerId}` returns single player with season records.
   - WrestlerProfile edit/view modes show alternate wrestler.
   - ManagePlayers admin form includes alternate wrestler.
   - Standings row click navigates to `/player/{playerId}`.
   - PublicProfile displays all info, action buttons work.
   - "View Head-to-Head" pre-selects the player.
   - "Challenge" button visible only for auth'd wrestlers viewing another player.
   - All strings translated (en + de).
4. **No regressions:**
   - `/stats/player/{playerId}` route still works (direct links preserved).
   - `alternateWrestler` is optional — existing players without it display correctly.

---

## Parallelization Summary

| Wave | Steps | Description |
|------|-------|-------------|
| 1 | 1, 2, 9 | Backend changes + i18n keys (all independent) |
| 2 | 3 | Frontend types + API client (depends on Wave 1) |
| 3 | 4, 5, 6 | WrestlerProfile edit, ManagePlayers, PublicProfile (all depend on Wave 2, parallel with each other) |
| 4 | 7, 8 | Standings nav + routing + H2H URL params (depend on Wave 3) |
| 5 | 10 | Verification (depends on all) |

---

## Edge Cases and Open Questions

1. **Form/streak data:** The new `GET /players/{playerId}` returns player data + season records, but NOT `recentForm`/`currentStreak` (which come from the standings computation). PublicProfile should fetch standings and filter client-side. This avoids duplicating match-scanning logic in the new handler.

2. **Clearing alternateWrestler:** When a user clears the field, the backend should REMOVE the attribute from DynamoDB rather than storing an empty string. Use the same pattern as `divisionId` clearing.

3. **PromoEditor targetId:** Verify `PromoEditor.tsx` reads `targetId` from search params. If not, a small update is needed.

4. **PlayerHoverCard:** Consider showing `alternateWrestler` in the hover card. Not in scope — defer to follow-up.

5. **SEO/link sharing:** `/player/{playerId}` uses opaque UUIDs. Future improvement could add slug-based URLs.

6. **No new DynamoDB tables** required. The `alternateWrestler` attribute is stored on the existing Players table.
