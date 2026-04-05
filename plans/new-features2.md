Plan: Alignment System, Wrestler Overalls, Promotion/Relegation, Division Transfers
Context
Four new features requested to evolve the league experience:

Alignment System – Face/Heel/Neutral labels on players to aid promo writing and GM booking
Wrestler Overalls – Players self-submit ratings for their main + alternate wrestlers; used by GMs to set division caps
Division Promotion & Relegation – At season end, top 3 per division move up, bottom 3 move down; admins apply via UI
Division Transfer Requests – Players can request a division move outside of prom/rel; admins approve/reject
Feature 1: Alignment System
Backend
Modify backend/functions/players/updatePlayer.ts

Add alignment to the list of accepted optional fields
Valid values: 'face' | 'heel' | 'neutral' (null = unset)
Modify frontend/src/types/index.ts

Add alignment?: 'face' | 'heel' | 'neutral' to the Player interface
No new table needed — stored on the Players record.

Admin Frontend
Modify frontend/src/components/admin/ManagePlayers.tsx

Add alignment to formData state
Add alignment select dropdown (Face / Heel / Neutral / Unset) in the edit/create form
Display alignment badge in the player list table
Player Self-Service Frontend
Modify frontend/src/components/WrestlerProfile.tsx (player profile page)

Add an "Alignment" section with Face/Heel/Neutral toggle buttons
On select, call playersApi.update(playerId, { alignment })
Show current alignment prominently on the profile
Public Display
Modify frontend/src/components/Standings.tsx

Add a small alignment badge/icon next to player name (face=green, heel=red, neutral=gray)
Feature 2: Wrestler Overalls
New DynamoDB Table
Modify backend/serverless.yml

Add WrestlerOverallsTable: PK=playerId (S), attrs: mainOverall (N), alternateOverall (N, optional), submittedAt, updatedAt
Scale: 60–99 (matching WWE 2K game)
New Backend Lambda Functions
Create backend/functions/overalls/ directory:

submitOverall.ts – PUT /players/me/overall (player auth required)
Accepts { mainOverall: number, alternateOverall?: number }
Validates 60–99 range
Upserts into WrestlerOverallsTable keyed by playerId from JWT
getOveralls.ts – GET /admin/overalls (admin auth required)
Returns all submitted overalls joined with player names
getMyOverall.ts – GET /players/me/overall (player auth required)
Returns current player's submitted overall
Modify backend/serverless.yml

Add routes for the three new endpoints
Frontend – Player Profile
Modify frontend/src/components/WrestlerProfile.tsx

Add "Wrestler Overalls" card: number inputs for Main (60–99) and Alternate (60–99, optional)
Load existing values on mount via GET /players/me/overall
Submit via PUT /players/me/overall
Show save confirmation
Frontend – Admin Panel
Modify frontend/src/components/admin/AdminPanel.tsx

Add 'overalls' to the AdminTab type
Create frontend/src/components/admin/ManageOveralls.tsx

Fetches all overalls from GET /admin/overalls
Table showing: Player | Wrestler | Main Overall | Alt Overall | Submitted At
Read-only view for GMs to reference when setting division caps
Add to AdminPanel tab map
API Service
Modify frontend/src/services/api.ts (or add overalls.api.ts)

Add submitOverall, getMyOverall, getAllOveralls
Feature 3: Division Promotion & Relegation
Logic
At season end: query SeasonStandingsTable grouped by player's current divisionId
Per division: sort by wins DESC, losses ASC — top 3 promoted, bottom 3 relegated
Champions (current championship holders) are flagged: admin chooses per champion to "Stay" or "Vacate + Move Up"
Applying prom/rel: bulk updates divisionId on each player record
No New Table Required
History can be stored as metadata in the season record or derived from before/after divisionId snapshots. Keep it simple — store final prom/rel decisions on the Season record as a JSON attribute promotionResults.

New Backend Lambda Functions
Create backend/functions/seasons/getPromotionPreview.ts

GET /seasons/{seasonId}/promotions (admin auth)
Only works for completed seasons
Queries SeasonStandings for that season
For each player, looks up their current divisionId
Groups by division, ranks by wins
Identifies top 3 (promoted), bottom 3 (relegated), middle (stay), champions (flagged)
Returns structured preview: { divisions: [{ divisionId, name, players: [...ranked with promotionStatus] }] }
Create backend/functions/seasons/applyPromotions.ts

POST /seasons/{seasonId}/promotions/apply (admin auth)
Body: { promotions: [{ playerId, newDivisionId }] } — admin-confirmed moves
Bulk update player divisionIds via DynamoDB transactWrite
Saves promotionResults metadata to the Season record
Modify backend/serverless.yml

Add two new routes under seasons
Frontend – Admin Panel
Modify frontend/src/components/admin/ManageSeasons.tsx

On a completed season, add a "View Promotions & Relegations" button
Clicking opens a modal or expands a section showing the preview
Create frontend/src/components/admin/PromotionPreview.tsx

Fetches GET /seasons/{seasonId}/promotions
Shows per-division ranked table with color-coded zones:
Top 3: green "↑ Promoted"
Bottom 3: red "↓ Relegated"
Champions: gold badge + Stay / Vacate toggle
"Apply Promotions & Relegations" button → calls POST /seasons/{seasonId}/promotions/apply
Confirmation dialog before applying (irreversible)
Types
Modify frontend/src/types/index.ts

Add PromotionPreview, PromotionResult interfaces
Feature 4: Division Transfer Requests
New DynamoDB Table
Modify backend/serverless.yml

Add TransferRequestsTable:
PK: requestId (S)
Attrs: playerId (S), fromDivisionId (S), toDivisionId (S), reason (S), status ('pending' | 'approved' | 'rejected'), createdAt, updatedAt, reviewedBy (optional)
GSI: PlayerTransfersIndex (playerId) — to query a player's own requests
GSI: StatusIndex (status) — to query all pending requests for admin
New Backend Lambda Functions
Create backend/functions/transfers/ directory:

createTransferRequest.ts – POST /transfers (player auth)
Player can only have one pending request at a time
Auto-populates fromDivisionId from player's current divisionId
Validates target division exists
getTransferRequests.ts – GET /admin/transfers (admin auth)
Query all requests (optionally filter by status=pending)
Join player name + division names
getMyTransferRequests.ts – GET /transfers/me (player auth)
Returns the player's own transfer request history
reviewTransferRequest.ts – PUT /admin/transfers/{requestId} (admin auth)
Body: { status: 'approved' | 'rejected', note?: string }
If approved: updates player's divisionId to toDivisionId
Updates request status + reviewedBy + updatedAt
Modify backend/serverless.yml

Add routes for all four endpoints
Frontend – Player Profile
Modify frontend/src/components/WrestlerProfile.tsx

Add "Division Transfer" card
Shows current division
If no pending request: form with target division dropdown + reason text area + submit button
If pending request exists: shows "Request pending — [target division]" with cancel option
Frontend – Admin Panel
Modify frontend/src/components/admin/AdminPanel.tsx

Add 'transfers' to AdminTab type
Create frontend/src/components/admin/ManageTransfers.tsx

Tabs: "Pending" | "History"
Pending: table of pending requests with player name, from/to division, reason, date — Approve / Reject buttons
History: all processed requests with outcome
API Service
Modify frontend/src/services/api.ts (or add transfers.api.ts)

Add createTransferRequest, getMyTransferRequests, getAllTransferRequests, reviewTransferRequest
Types
Modify frontend/src/types/index.ts

Add TransferRequest interface
Files to Create (New)
File	Purpose
backend/functions/overalls/submitOverall.ts	Player submits their wrestler overalls
backend/functions/overalls/getOveralls.ts	Admin gets all submitted overalls
backend/functions/overalls/getMyOverall.ts	Player gets their own overall
backend/functions/seasons/getPromotionPreview.ts	Compute prom/rel preview for a season
backend/functions/seasons/applyPromotions.ts	Apply bulk division changes
backend/functions/transfers/createTransferRequest.ts	Player submits transfer request
backend/functions/transfers/getTransferRequests.ts	Admin views all transfer requests
backend/functions/transfers/getMyTransferRequests.ts	Player views own requests
backend/functions/transfers/reviewTransferRequest.ts	Admin approves/rejects
frontend/src/components/admin/ManageOveralls.tsx	Admin view of all wrestler overalls
frontend/src/components/admin/PromotionPreview.tsx	Prom/rel review + apply UI
frontend/src/components/admin/ManageTransfers.tsx	Admin transfer request management
Files to Modify (Key)
File	What Changes
backend/functions/players/updatePlayer.ts	Accept alignment field
backend/serverless.yml	Add 3 new DynamoDB tables, 9 new routes
frontend/src/types/index.ts	Add alignment, overalls, promotion, transfer types
frontend/src/components/WrestlerProfile.tsx	Alignment picker, overalls form, transfer request form
frontend/src/components/admin/ManagePlayers.tsx	Alignment field in edit form + display
frontend/src/components/admin/AdminPanel.tsx	Add overalls, transfers tabs
frontend/src/components/admin/ManageSeasons.tsx	Add prom/rel button for completed seasons
frontend/src/components/Standings.tsx	Show alignment badge next to player name
Suggested Implementation Order
Alignment System — smallest scope, pure field addition, good warm-up
Division Transfer Requests — self-contained new table + CRUD + player UI
Wrestler Overalls — self-contained new table + player self-submit + admin view
Promotion & Relegation — most complex (computed logic), do last
Verification
Alignment: Edit a player as admin → alignment saved and visible. Log in as a player → change own alignment from profile. Check Standings badge displays.
Overalls: Log in as player → submit overall → see it on profile. Log in as admin → see all overalls in ManageOveralls tab.
Promotions: End a season → go to ManageSeasons → click "View Promotions" → preview shows correct top/bottom 3 per division → apply → check player divisionIds updated.
Transfers: Log in as player → submit request to new division. Log in as admin → see pending request → approve → verify player's divisionId changed.
Run TypeScript validation: cd frontend && npx tsc --project tsconfig.app.json --noEmit and cd backend && npx tsc --project tsconfig.json --noEmit
User approved the plan
Here's the plan summary:

4 Features — Implementation Plan
Feature 1: Alignment System (smallest)
Add alignment?: 'face' | 'heel' | 'neutral' to the Player model
Backend: update updatePlayer.ts to accept the field
Admin: alignment dropdown in ManagePlayers edit form
Player: alignment toggle buttons on WrestlerProfile
Public: small badge in Standings next to player name
Feature 2: Wrestler Overalls
New WrestlerOverallsTable (DynamoDB) — PK=playerId, scale 60–99
3 new Lambdas: player submit (PUT /players/me/overall), player fetch, admin fetch all
Player profile: form to enter Main + Alternate overalls
Admin: new Overalls tab — read-only table for GMs to reference when setting division caps
Feature 3: Division Promotion & Relegation (most complex)
2 new Lambdas: compute preview + apply bulk changes
Preview endpoint: groups SeasonStandings by division, ranks players, flags top 3 (↑), bottom 3 (↓), and champions (choice: stay or vacate + move up)
Admin ManageSeasons: "View Promotions" button on completed seasons
New PromotionPreview.tsx component with color-coded table and confirm-to-apply button
Feature 4: Division Transfer Requests
New TransferRequestsTable with status tracking and GSIs
4 new Lambdas: player create/view, admin list + approve/reject
Player profile: "Request a Move" card (shows pending status if request exists)
Admin: new Transfers tab with Pending / History views
Implementation order: Alignment → Transfers → Overalls → Promotions