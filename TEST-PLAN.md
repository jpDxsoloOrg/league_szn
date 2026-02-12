# League SZN — Test Plan by Feature

## Technology Stack

| Layer | Tool | Rationale |
|-------|------|-----------|
| Backend unit tests | **Vitest** | ESM-native, fast, works with Serverless/TypeScript |
| Frontend component tests | **Vitest + React Testing Library** | Standard for React 18 + Vite projects |
| Mocking (backend) | **vitest built-in mocks** | Mock DynamoDB DocumentClient, Cognito SDK, S3 client |
| Mocking (frontend) | **vitest built-in mocks + msw** | Mock fetch/API calls, Cognito Amplify SDK |
| Existing E2E | **Playwright** (already configured) | Not in scope — this plan covers unit + component tests only |

### Setup Notes
- Add `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` to frontend
- ~~Add `vitest` to backend~~ ✅ Done — `vitest@3` installed, `vitest.config.mts` configured, `npm test` / `npm run test:watch` scripts added
- Configure `vitest.config.ts` in frontend root (backend done: `backend/vitest.config.mts`)
- Mock pattern: `vi.hoisted()` + `vi.mock()` for AWS SDK, Cognito, S3 clients (established in auth tests)

## Running Tests

### Backend
```bash
cd backend

# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Run a specific test file
npx vitest run lib/__tests__/auth.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose auth

# Run with coverage
npx vitest run --coverage
```

### Frontend (not yet configured)
```bash
cd frontend

# Once vitest is set up:
npm test
npm run test:watch
```

### E2E (existing Playwright)
```bash
cd e2e
npx playwright test
```

---

## Priority Legend

| Priority | Description | Criteria |
|----------|-------------|----------|
| **P0** | Critical | Shared libs, auth, complex handlers with cascading updates |
| **P1** | High | All remaining CRUD handlers, API service functions, core UI components |
| **P2** | Medium | UI components with moderate logic, utility functions |
| **P3** | Low | Simple/presentational components, static displays |

---

## Feature: Auth & Authorization

### Backend Unit Tests
- [x] P0: `backend/lib/auth.ts` — getAuthContext extracts username/email/sub/groups; handles missing authorizer; trims whitespace in groups; empty groups string → empty array (4 tests) ✅ `lib/__tests__/auth.test.ts`
- [x] P0: `backend/lib/auth.ts` — hasRole: exact role match; Admin access to all; Moderator access to non-Admin; Moderator blocked from Admin-only; multiple roles; empty groups (7 tests) ✅ `lib/__tests__/auth.test.ts`
- [x] P0: `backend/lib/auth.ts` — isSuperAdmin: true for Admin; false for Moderator; false for non-admin roles (3 tests) ✅ `lib/__tests__/auth.test.ts`
- [x] P0: `backend/lib/auth.ts` — requireRole: returns null when authorized; returns 403 when unauthorized; Moderator passes non-Admin check (3 tests) ✅ `lib/__tests__/auth.test.ts`
- [x] P0: `backend/lib/auth.ts` — requireSuperAdmin: returns null for Admin; returns 403 for Moderator; returns 403 for Wrestler (3 tests) ✅ `lib/__tests__/auth.test.ts`
- [x] P0: `backend/functions/auth/authorizer.ts` — Lambda authorizer: valid token → Allow policy with context; no groups; empty token; non-Bearer format; extra parts; expired token; missing username fallback (7 tests) ✅ `functions/auth/__tests__/authorizer.test.ts`
- [x] P1: `backend/functions/auth/postConfirmation.ts` — Adds user to Fantasy group; non-blocking on SDK error; correct userPoolId/userName (3 tests) ✅ `functions/auth/__tests__/postConfirmation.test.ts`
- [x] P1: `backend/functions/auth/createAdminUser.ts` — Setup key validation (missing/wrong/unset env); body validation (missing/invalid JSON/missing email/short password); duplicate user; happy path; unexpected Cognito error (10 tests) ✅ `functions/auth/__tests__/createAdminUser.test.ts`

### Frontend Component Tests
- [ ] P1: `frontend/src/components/auth/Login.tsx` — Renders form with email/password fields; shows loading on submit; displays error on failed login; calls signIn with correct args; navigates on success (~5 tests)
- [ ] P1: `frontend/src/components/auth/Signup.tsx` — Renders signup form; validates fields; calls signUp; handles confirmation code flow; shows errors (~5 tests)
- [ ] P0: `frontend/src/components/ProtectedRoute.tsx` — Renders children when authenticated with correct role; redirects to login when not authenticated; shows access denied for wrong role; shows loading during auth check (~4 tests)
- [ ] P0: `frontend/src/components/FeatureRoute.tsx` — Renders children when feature enabled; redirects to home when disabled; shows loading during config fetch (~3 tests)

### Frontend Service Tests
- [ ] P0: `frontend/src/services/cognito.ts` — signIn: calls Amplify signIn, stores tokens in sessionStorage, returns auth result (~3 tests)
- [ ] P0: `frontend/src/services/cognito.ts` — signUp/confirmSignUp: calls Amplify SDK, returns correct shape (~3 tests)
- [ ] P0: `frontend/src/services/cognito.ts` — signOut: calls Amplify signOut, clears sessionStorage (~2 tests)
- [ ] P0: `frontend/src/services/cognito.ts` — Token management: getAccessToken/getIdToken read from sessionStorage; getUserGroups parses groups; isAuthenticated checks session (~4 tests)
- [ ] P0: `frontend/src/services/cognito.ts` — Role helpers: hasRole respects hierarchy (Admin > Moderator > Wrestler); isAdmin checks group membership; isWrestler checks group (~4 tests)
- [ ] P1: `frontend/src/services/cognito.ts` — JWT helpers: decodeJwtPayload parses valid JWT; handles malformed token; getGroupsFromToken extracts cognito:groups (~3 tests)
- [ ] P0: `frontend/src/services/cognito.ts` — refreshSession: calls Amplify fetchAuthSession with forceRefresh; updates sessionStorage; handles refresh failure (~3 tests)

### Frontend Context Tests
- [ ] P0: `frontend/src/contexts/AuthContext.tsx` — Initializes: fetches current user on mount; sets isAuthenticated; extracts groups; fetches player profile for Wrestlers (~4 tests)
- [ ] P0: `frontend/src/contexts/AuthContext.tsx` — Role helpers: isAdmin/isSuperAdmin/isModerator/isWrestler/isFantasy return correct values based on groups; hasRole checks hierarchy (~6 tests)
- [ ] P1: `frontend/src/contexts/AuthContext.tsx` — Sign in/out: signIn updates state; signOut clears state; refreshProfile re-fetches player (~3 tests)
- [ ] P1: `frontend/src/contexts/AuthContext.tsx` — Cleanup: uses mounted flag; doesn't update state after unmount (~2 tests)

**Backend tests written: 40/40 ✅** | Frontend tests remaining: ~32
**Section total: ~72 tests**

---

## Feature: Shared Backend Libraries

### Backend Unit Tests
- [x] P0: `backend/lib/response.ts` — success (200), created (201), badRequest (400), notFound (404), forbidden (403), serverError (500), unauthorized (401), conflict (409), noContent (204), error(); default messages; CORS + security headers (15 tests) ✅ `lib/__tests__/response.test.ts`
- [x] P0: `backend/lib/dynamodb.ts` — get (returns Item, handles not-found), put, update (returns Attributes), delete, scan (empty table), query (with results, empty), transactWrite (success, TransactionCanceledException), scanAll (single page, multi-page pagination, empty), queryAll (single page, multi-page) (16 tests) ✅ `lib/__tests__/dynamodb.test.ts`
- [x] P0: `backend/lib/parseBody.ts` — Valid JSON returns data; null body returns 400; malformed JSON returns 400; typed generic parameter (4 tests) ✅ `lib/__tests__/parseBody.test.ts`
- [x] P0: `backend/lib/rankingCalculator.ts` — calculateCurrentStreak: consecutive wins, consecutive losses, streak broken, empty history, single win, single loss (6 tests) ✅ `lib/__tests__/rankingCalculator.test.ts`
- [x] P0: `backend/lib/rankingCalculator.ts` — calculatePlayerScore: all components + composite, 40% win% weight, streak cap at 100, quality uses opponent win rates, loss streak → 0 bonus, recency exponential decay (6 tests) ✅ `lib/__tests__/rankingCalculator.test.ts`
- [x] P0: `backend/lib/rankingCalculator.ts` — calculateRankingsForChampionship: sorted by score, excludes champion (string), excludes champion (array/tag), min match threshold, division lock, maxContenders limit, empty matches (7 tests) ✅ `lib/__tests__/rankingCalculator.test.ts`

**All tests written: 54/54 ✅**
**Section total: ~54 tests**

---

## Feature: Players

### Backend Unit Tests
- [x] P1: `backend/functions/players/createPlayer.ts` — Creates with required fields + 201; missing name/wrestler → 400; missing body → 400; validates divisionId exists; creates with valid divisionId (6 tests) ✅ `functions/players/__tests__/players.test.ts`
- [x] P1: `backend/functions/players/getPlayers.ts` — Returns all players; returns empty array (2 tests) ✅ `functions/players/__tests__/players.test.ts`
- [x] P1: `backend/functions/players/updatePlayer.ts` — Updates fields + returns updated; 404 if not found; 400 if no playerId; 400 if no valid fields; REMOVE divisionId on empty string (5 tests) ✅ `functions/players/__tests__/players.test.ts`
- [x] P1: `backend/functions/players/deletePlayer.ts` — Deletes + 204; 404 if not found; 409 if current champion; 400 if no playerId; cleans up season standings (5 tests) ✅ `functions/players/__tests__/players.test.ts`
- [x] P1: `backend/functions/players/getMyProfile.ts` — 403 if not Wrestler; returns profile with season records; 404 if no linked profile; shows 0-0-0 for seasons without standings (4 tests) ✅ `functions/players/__tests__/players.test.ts`
- [x] P1: `backend/functions/players/updateMyProfile.ts` — 403 if not Wrestler; updates via userId; 404 if no profile; 400 for non-whitelisted fields; rejects non-string values; rejects empty name (6 tests) ✅ `functions/players/__tests__/players.test.ts`

### Frontend Component Tests
- [ ] P1: `frontend/src/components/admin/ManagePlayers.tsx` — Renders player list; shows add form on button click; creates player via API; edits existing player; deletes with confirmation; handles image upload (presigned URL + S3); shows loading/error/success states (~8 tests)

**Backend tests written: 28/28 ✅** | Frontend tests remaining: ~8
**Section total: ~36 tests**

---

## Feature: Divisions

### Backend Unit Tests
- [ ] P1: `backend/functions/divisions/createDivision.ts` — Creates division with name; returns 400 if name missing; auth requires Admin (~3 tests)
- [ ] P1: `backend/functions/divisions/getDivisions.ts` — Returns all divisions via scan; returns empty array (~2 tests)
- [ ] P1: `backend/functions/divisions/updateDivision.ts` — Updates division fields; returns 404 if not found; updates updatedAt; auth requires Admin (~3 tests)
- [ ] P1: `backend/functions/divisions/deleteDivision.ts` — Deletes division; returns 404 if not found; returns 409 if players assigned (referential integrity); auth requires Admin (~4 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/admin/ManageDivisions.tsx` — Renders division list; create/edit/delete flows; shows error on delete with assigned players (~5 tests)

**Section total: ~17 tests**

---

## Feature: Matches

### Backend Unit Tests
- [ ] P0: `backend/functions/matches/recordResult.ts` — **Core transaction**: updates match status to completed; increments winner wins + loser losses in player stats; increments season standings; handles draw (both sides get draws) (~6 tests)
- [ ] P0: `backend/functions/matches/recordResult.ts` — **Validation**: returns 400 if winners/losers empty; returns 400 if overlap between winners and losers; returns 404 if match not found; returns 400 if match already completed (~4 tests)
- [ ] P0: `backend/functions/matches/recordResult.ts` — **Championship transaction**: title defense increments defenses; title change updates currentChampion + closes old reign + creates new reign; sets isTitleDefense flag; handles tag team championships (array vs string) (~5 tests)
- [ ] P0: `backend/functions/matches/recordResult.ts` — **Tournament progression (round-robin)**: updates standings; detects completion; determines winner by wins (~3 tests)
- [ ] P0: `backend/functions/matches/recordResult.ts` — **Tournament progression (single-elimination)**: advances winner to next bracket round; handles byes; detects tournament completion (~3 tests)
- [ ] P0: `backend/functions/matches/recordResult.ts` — **Event auto-complete**: finds events containing match; marks event completed if all matches done; marks in-progress if partial; triggers calculateFantasyPoints on event completion (~4 tests)
- [ ] P0: `backend/functions/matches/recordResult.ts` — **Background ops**: fires ranking recalculation + cost recalculation via Promise.allSettled; doesn't fail if background ops fail (~2 tests)
- [ ] P0: `backend/functions/matches/recordResult.ts` — **Concurrency**: uses optimistic locking (version field); returns 400 with retry message on TransactionCancelled (~2 tests)
- [ ] P1: `backend/functions/matches/scheduleMatch.ts` — Creates match with matchType + participants; validates 2+ participants; no duplicate participants; all participants must exist; championship must exist if isChampionship; division restriction for championship matches; auto-adds to event matchCards (~8 tests)
- [ ] P1: `backend/functions/matches/getMatches.ts` — Returns all matches via scan; filters by tournamentId via TournamentIndex GSI; sorts by date descending (~3 tests)

### Frontend Component Tests
- [ ] P1: `frontend/src/components/Matches.tsx` — Renders match list; shows scheduled vs completed; displays participant names (~3 tests)
- [ ] P1: `frontend/src/components/admin/ScheduleMatch.tsx` — Renders form with match type, participants, options; loads players/championships/tournaments/seasons/events; handles tag team mode (multiple teams); submits match; shows validation errors (~6 tests)
- [ ] P1: `frontend/src/components/admin/RecordResult.tsx` — Lists scheduled matches; filters by event; selects winners (team vs individual); submits result; handles loading/error/success (~5 tests)

**Section total: ~54 tests**

---

## Feature: Championships

### Backend Unit Tests
- [ ] P1: `backend/functions/championships/createChampionship.ts` — Creates championship; validates name + type (singles/tag); auth requires Admin (~3 tests)
- [ ] P1: `backend/functions/championships/getChampionships.ts` — Returns active championships (isActive !== false); returns empty array (~2 tests)
- [ ] P1: `backend/functions/championships/getChampionshipHistory.ts` — Returns history sorted by wonDate descending; public endpoint (~2 tests)
- [ ] P1: `backend/functions/championships/updateChampionship.ts` — Updates championship; returns 404 if not found; dynamic update expression; auth requires Admin (~3 tests)
- [ ] P1: `backend/functions/championships/deleteChampionship.ts` — Deletes championship + cascades to history; returns 404 if not found; auth requires Admin (~3 tests)
- [ ] P1: `backend/functions/championships/vacateChampionship.ts` — Vacates championship via transaction; closes current reign with daysHeld; returns 400 if already vacant; auth requires Admin (~4 tests)

### Frontend Component Tests
- [ ] P1: `frontend/src/components/Championships.tsx` — Renders championship list with current holders; handles empty state (~3 tests)
- [ ] P1: `frontend/src/components/admin/ManageChampionships.tsx` — Create/edit/delete championships; image upload; vacate title; shows current champion; division assignment (~7 tests)

**Section total: ~27 tests**

---

## Feature: Tournaments

### Backend Unit Tests
- [ ] P1: `backend/functions/tournaments/createTournament.ts` — Creates tournament; validates name + type + 2+ participants; generates single-elimination bracket with byes; initializes round-robin standings; auth requires Admin (~5 tests)
- [ ] P1: `backend/functions/tournaments/getTournaments.ts` — Returns all tournaments via scan; public endpoint (~2 tests)
- [ ] P1: `backend/functions/tournaments/updateTournament.ts` — Updates tournament; returns 404 if not found; dynamic update; auth requires Admin (~3 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/Tournaments.tsx` — Renders tournament list; shows bracket view for single-elimination; shows standings for round-robin (~4 tests)
- [ ] P2: `frontend/src/components/admin/CreateTournament.tsx` — Creates tournament with type/participants; validates min participants (~3 tests)

**Section total: ~17 tests**

---

## Feature: Seasons

### Backend Unit Tests
- [ ] P1: `backend/functions/seasons/createSeason.ts` — Creates season with default status 'active'; validates name; auth requires Admin (~3 tests)
- [ ] P1: `backend/functions/seasons/getSeasons.ts` — Returns all seasons via scan; public endpoint (~2 tests)
- [ ] P1: `backend/functions/seasons/updateSeason.ts` — Updates season; returns 404 if not found; auth requires Admin (~3 tests)
- [ ] P1: `backend/functions/seasons/deleteSeason.ts` — Deletes season + cascades to standings; returns 404 if not found; auth requires Admin (~3 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/admin/ManageSeasons.tsx` — Create/edit/delete seasons; end active season; shows status (~4 tests)

**Section total: ~15 tests**

---

## Feature: Standings

### Backend Unit Tests
- [ ] P1: `backend/functions/standings/getStandings.ts` — Returns standings for season (via SeasonIndex GSI) or all; calculates win percentage; enriches with player name/wrestler/division; sorts by wins then win%; public endpoint (~5 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/Standings.tsx` — Renders standings table; filters by season; shows W-L-D + win%; handles empty state (~4 tests)

**Section total: ~9 tests**

---

## Feature: Events

### Backend Unit Tests
- [ ] P1: `backend/functions/events/createEvent.ts` — Creates event; validates name + eventType + date; validates eventType (ppv/weekly/special/house) and status; auth requires Admin (~4 tests)
- [ ] P1: `backend/functions/events/getEvents.ts` — Returns events filtered by status (StatusIndex) or seasonId (SeasonIndex) or all via scan; sorts by date descending; public endpoint (~4 tests)
- [ ] P1: `backend/functions/events/getEvent.ts` — Returns event with enriched matchCards (full match details + player names); returns 404 if not found; public endpoint (~3 tests)
- [ ] P1: `backend/functions/events/updateEvent.ts` — Updates event; supports 13 optional fields; validates eventType/status if provided; returns 404; auth requires Admin (~4 tests)
- [ ] P1: `backend/functions/events/deleteEvent.ts` — Deletes event; removes eventId from associated matches; returns 404 if not found; auth requires Admin (~4 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/events/EventsCalendar.tsx` — Renders calendar grid with event dots; navigates months; filters by event type; shows upcoming events list; handles empty state (~5 tests)
- [ ] P1: `frontend/src/components/admin/CreateEvent.tsx` — Creates event with form fields; season selection; theme color picker; validates required fields (~4 tests)
- [ ] P2: `frontend/src/components/admin/MatchCardBuilder.tsx` — Builds event match cards; reorders matches; links to schedule match (~3 tests)

**Section total: ~31 tests**

---

## Feature: Fantasy

### Backend Unit Tests
- [ ] P0: `backend/functions/fantasy/submitPicks.ts` — Happy path: creates picks for event; validates event not completed/cancelled/locked; validates picks object structure; enforces picksPerDivision limit; rejects duplicate players across divisions; validates all players exist and belong to correct division; enforces budget constraint; preserves createdAt on update (~10 tests)
- [ ] P0: `backend/functions/fantasy/calculateFantasyPoints.ts` — Scoring: base points = (participants - 1) * baseWinPoints; championship bonus +5; title win +10; title defense +5; only counts completed matches; wrestlers who didn't compete get 0 with reason; stores breakdown per wrestler (~8 tests)
- [ ] P1: `backend/functions/fantasy/clearPicks.ts` — Deletes user picks; validates event not completed/locked; only deletes own picks via fantasyUserId; auth requires Fantasy (~4 tests)
- [ ] P1: `backend/functions/fantasy/getAllMyPicks.ts` — Returns user picks via UserPicksIndex GSI; sorts by eventId descending; auth requires Fantasy (~2 tests)
- [ ] P1: `backend/functions/fantasy/getFantasyConfig.ts` — Returns config; returns DEFAULT_CONFIG with 12 settings if none exists; public endpoint (~2 tests)
- [ ] P1: `backend/functions/fantasy/getFantasyLeaderboard.ts` — Aggregates points across events; filters by seasonId; calculates perfect picks; calculates current streak (consecutive events with points > 0); skips non-participated events for streak; auth requires Fantasy (~6 tests)
- [ ] P1: `backend/functions/fantasy/getUserPicks.ts` — Returns picks for event; returns 404 if no picks; auth requires Fantasy (~3 tests)
- [ ] P1: `backend/functions/fantasy/getWrestlerCosts.ts` — Returns all wrestler costs via scan; public endpoint (~2 tests)
- [ ] P1: `backend/functions/fantasy/initializeWrestlerCosts.ts` — Creates costs for players without existing costs; skips players that already have costs; auth requires Admin (~3 tests)
- [ ] P1: `backend/functions/fantasy/recalculateWrestlerCosts.ts` — Analyzes matches from last 30 days; newCost = baseCost + (wins * costPerWin) - (losses * costPerLoss); clamps between 50%-200% of baseCost; keeps last 20 cost history entries; only runs if costFluctuationEnabled (~6 tests)
- [ ] P1: `backend/functions/fantasy/scoreCompletedEvents.ts` — Finds completed events with unscored picks; calls calculateFantasyPoints for each; returns scored event IDs (~3 tests)
- [ ] P1: `backend/functions/fantasy/updateFantasyConfig.ts` — Merges with existing config; auth requires Admin (~2 tests)
- [ ] P1: `backend/functions/fantasy/updateWrestlerCost.ts` — Updates cost; validates playerId + (currentCost or baseCost); adds history entry with admin reason; keeps last 20 history entries; auth requires Admin (~4 tests)

### Frontend Component Tests
- [ ] P1: `frontend/src/components/fantasy/FantasyDashboard.tsx` — Renders upcoming show card; shows current picks preview; displays stats + recent results; auto-scores unscored picks on mount; handles loading state (~5 tests)
- [ ] P1: `frontend/src/components/fantasy/MakePicks.tsx` — Renders division-based picker; enforces budget constraint; enforces picks-per-division limit; submits picks; clears picks; shows wrestler costs (~6 tests)
- [ ] P2: `frontend/src/components/fantasy/FantasyLeaderboard.tsx` — Renders leaderboard table with ranks/points; filters by season; shows streak + perfect picks (~4 tests)
- [ ] P2: `frontend/src/components/fantasy/WrestlerCosts.tsx` — Renders cost table with current/trend; handles empty state (~3 tests)
- [ ] P2: `frontend/src/components/fantasy/ShowResults.tsx` — Renders event results with points breakdown per wrestler (~3 tests)
- [ ] P2: `frontend/src/components/fantasy/BudgetTracker.tsx` — Shows remaining budget; updates in real-time as picks change; warns when over budget (~3 tests)
- [ ] P1: `frontend/src/components/admin/FantasyConfig.tsx` — Renders all 14 config fields; tracks unsaved changes; saves config; resets to original; toggles cost fluctuation fields conditionally (~5 tests)
- [ ] P1: `frontend/src/components/admin/ManageFantasyShows.tsx` — Configures fantasy picks for events; locks/unlocks events (~3 tests)

**Section total: ~80 tests**

---

## Feature: Challenges

### Backend Unit Tests
- [ ] P1: `backend/functions/challenges/createChallenge.ts` — Creates challenge; validates required fields (opponentId, matchType); cannot challenge self; only linked players; enforces max pending challenges; auth requires Wrestler (~6 tests)
- [ ] P1: `backend/functions/challenges/getChallenges.ts` — Returns challenges filtered by status/playerId or all; enriches with player names; sorts by createdAt descending; public endpoint (~4 tests)
- [ ] P1: `backend/functions/challenges/getChallenge.ts` — Returns single challenge with enriched player info; returns 404 if not found (~2 tests)
- [ ] P1: `backend/functions/challenges/respondToChallenge.ts` — Accept: updates status to accepted; Decline: updates to declined; Counter: creates new challenge in transaction with counteredChallengeId; only challenged player can respond; challenge must be pending; auth requires Wrestler (~7 tests)
- [ ] P1: `backend/functions/challenges/cancelChallenge.ts` — Cancels challenge; only issuer can cancel; challenge must be pending; auth requires Wrestler (~4 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/challenges/ChallengeBoard.tsx` — Renders challenge list with filters (active/pending/accepted/recent); shows countdown for pending; handles empty state (~4 tests)
- [ ] P2: `frontend/src/components/challenges/IssueChallenge.tsx` — Renders form; filters opponents to linked users; match type/stipulation selection; 500 char message limit; preview before submit; shows success with navigation (~5 tests)
- [ ] P2: `frontend/src/components/challenges/ChallengeDetail.tsx` — Shows challenge details; respond buttons (accept/decline/counter); cancel button for issuer (~4 tests)
- [ ] P2: `frontend/src/components/challenges/MyChallenges.tsx` — Shows issued + received challenges; action buttons based on status (~3 tests)

**Section total: ~39 tests**

---

## Feature: Promos

### Backend Unit Tests
- [ ] P1: `backend/functions/promos/createPromo.ts` — Creates promo; validates promoType + content; requires wrestler profile; validates targetPlayerId/targetPromoId if provided; auto-populates playerId; initializes empty reactions; auth requires Wrestler (~6 tests)
- [ ] P1: `backend/functions/promos/getPromos.ts` — Returns promos filtered by playerId/promoType or all; filters out hidden promos; sorts by isPinned then createdAt; enriches with player details; public endpoint (~5 tests)
- [ ] P1: `backend/functions/promos/getPromo.ts` — Returns promo with enriched player info + target enrichment; skips enrichment if player deleted; returns 404 (~3 tests)
- [ ] P1: `backend/functions/promos/reactToPromo.ts` — Toggles reaction (add if not present, remove if present); updates nested reactions + reactionCounts; validates reactionType (fire/mic/trash/mind-blown/clap); uses if_not_exists for initialization; auth requires Wrestler (~5 tests)
- [ ] P1: `backend/functions/promos/adminUpdatePromo.ts` — Updates isPinned/isHidden flags; returns 404 if not found; auth requires Admin (~3 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/promos/PromoFeed.tsx` — Renders promo list with type filters; shows pinned section; handles empty state (~4 tests)
- [ ] P2: `frontend/src/components/promos/PromoEditor.tsx` — Creates promo with type/content/target selection; validates content (~3 tests)
- [ ] P2: `frontend/src/components/promos/PromoCard.tsx` — Displays promo content + player info; shows reactions; links to thread (~3 tests)
- [ ] P2: `frontend/src/components/promos/PromoReactions.tsx` — Renders reaction buttons; highlights user's active reactions; calls react API on click (~3 tests)

**Section total: ~35 tests**

---

## Feature: Statistics

### Backend Unit Tests
- [ ] P0: `backend/functions/statistics/getStatistics.ts` — **player-stats section**: computes stats for 5 match types (overall/singles/tag/ladder/cage); calculates championship history per title; computes achievements earned (~6 tests)
- [ ] P0: `backend/functions/statistics/getStatistics.ts` — **head-to-head section**: computes H2H record between two players; returns recent 5 results; includes overall stats for both (~4 tests)
- [ ] P0: `backend/functions/statistics/getStatistics.ts` — **leaderboards section**: most wins, best win% (min 5 matches), longest streak, most championships, longest reign (~5 tests)
- [ ] P0: `backend/functions/statistics/getStatistics.ts` — **records section**: overall records + championship records + streak records + match type records + active threats (~5 tests)
- [ ] P0: `backend/functions/statistics/getStatistics.ts` — **achievements section**: evaluates 17 achievement definitions; tracks player progress; milestone/record/special types; "Deadman Walking" checks win after 4-loss streak; Grand Slam checks all active championships (~6 tests)
- [ ] P0: `backend/functions/statistics/getStatistics.ts` — **Helper functions**: categorizeMatch maps stipulation/matchType to stat type; computeStreaks calculates current/longest win/loss; computePlayerStatistics aggregates per type; handles tag championships (array vs string); handles ongoing reigns (~5 tests)
- [ ] P1: `backend/functions/statistics/getStatistics.ts` — **Validation**: returns 400 if section missing; validates section values; returns 400 if head-to-head without player IDs (~3 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/statistics/PlayerStats.tsx` — Renders player selector; shows W-L-D card + streak + match type breakdown + championship history + achievements; handles loading/error (~5 tests)
- [ ] P2: `frontend/src/components/statistics/HeadToHeadComparison.tsx` — Selects two players; shows H2H record + recent results (~3 tests)
- [ ] P2: `frontend/src/components/statistics/Leaderboards.tsx` — Renders category leaderboards with tabs (~3 tests)
- [ ] P2: `frontend/src/components/statistics/RecordBook.tsx` — Shows all-time records with active threats (~3 tests)
- [ ] P2: `frontend/src/components/statistics/Achievements.tsx` — Shows achievement badges and progress bars (~3 tests)

**Section total: ~51 tests**

---

## Feature: Contenders

### Backend Unit Tests
- [ ] P0: `backend/functions/contenders/calculateRankings.ts` — Calculates rankings using rankingCalculator lib; preserves previousRank/peakRank/weeksAtTop; deletes old rankings before writing new; writes ranking history with weekKey; optional championshipId filter; auth requires Admin (~6 tests)
- [ ] P1: `backend/functions/contenders/getContenders.ts` — Returns contenders for championship via RankIndex GSI; filters out current champion; enriches with player names/wrestlers/images; calculates movement (previousRank - currentRank); re-ranks after filtering; public endpoint (~5 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/contenders/ContenderRankings.tsx` — Renders championship selector (grouped by division); shows current champion card; displays ranked contenders with movement indicators; handles loading/error/empty states (~5 tests)

**Section total: ~16 tests**

---

## Feature: Users (Admin)

### Backend Unit Tests
- [ ] P1: `backend/functions/users/listUsers.ts` — Lists Cognito users with groups; formats output with email/username/enabled/groups; auth requires Admin (~3 tests)
- [ ] P1: `backend/functions/users/toggleUserEnabled.ts` — Enables/disables user; validates username required; auth requires Admin (~3 tests)
- [ ] P0: `backend/functions/users/updateUserRole.ts` — Promotes/demotes roles; validates username + role + action; only Super Admin can manage Admin/Moderator roles; promoting to Wrestler auto-adds to Fantasy + auto-creates Player record; uses Cognito sub for Player.userId; non-blocking player creation; auth requires Admin (~8 tests)

### Frontend Component Tests
- [ ] P1: `frontend/src/components/admin/ManageUsers.tsx` — Renders user list with filters (all/wrestler-requests/wrestlers/admins/disabled); approve wrestler requests; promote/demote roles; enable/disable users; assign divisions; SuperAdmin-only actions for Admin/Moderator management (~7 tests)

**Section total: ~21 tests**

---

## Feature: Admin Utilities

### Backend Unit Tests
- [ ] P1: `backend/functions/admin/getSiteConfig.ts` — Returns site config features; returns defaults if none exists; public endpoint (~2 tests)
- [ ] P1: `backend/functions/admin/updateSiteConfig.ts` — Updates site features; auth requires Admin (~2 tests)
- [ ] P1: `backend/functions/admin/seedData.ts` — Seeds sample data; returns created counts; auth requires Super Admin (~2 tests)
- [ ] P1: `backend/functions/admin/clearAll.ts` — Clears all data from all tables; returns deleted counts; auth requires Super Admin (~2 tests)

### Frontend Component Tests
- [ ] P2: `frontend/src/components/admin/ManageFeatures.tsx` — Toggles feature flags on/off; saves via API; shows error state (~3 tests)
- [ ] P2: `frontend/src/components/admin/AdminPanel.tsx` — Renders correct tab based on URL; shows all 17 admin tabs; admin/SuperAdmin access checks (~3 tests)
- [ ] P3: `frontend/src/components/admin/ClearAllData.tsx` — Shows danger zone; requires confirmation; calls clearAll API; SuperAdmin only (~3 tests)
- [ ] P3: `frontend/src/components/admin/AdminGuide.tsx` — Renders admin documentation (~1 test)

**Section total: ~18 tests**

---

## Feature: Images

### Backend Unit Tests
- [ ] P1: `backend/functions/images/generateUploadUrl.ts` — Generates S3 presigned URL; validates fileName + fileType required; validates file types (jpeg/png/gif/webp); enforces 5MB size limit; generates unique key with timestamp + UUID; sets 5-min expiration; auth requires Admin (~6 tests)

**Section total: ~6 tests**

---

## Feature: Frontend API Client

### Frontend Service Tests
- [ ] P1: `frontend/src/services/api.ts` — fetchWithAuth: adds Authorization header when token exists; omits header when no token; handles 204 (no content); throws on non-ok responses; passes AbortSignal through (~5 tests)
- [ ] P1: `frontend/src/services/api.ts` — playersApi: getAll/create/update/delete call correct endpoints with correct methods and params (~4 tests)
- [ ] P1: `frontend/src/services/api.ts` — matchesApi: getAll with filters, schedule, recordResult (~3 tests)
- [ ] P1: `frontend/src/services/api.ts` — championshipsApi: getAll/create/getHistory/update/delete/vacate (~6 tests)
- [ ] P1: `frontend/src/services/api.ts` — tournamentsApi: getAll/getById/create/update (~4 tests)
- [ ] P1: `frontend/src/services/api.ts` — standingsApi: get with optional seasonId (~2 tests)
- [ ] P1: `frontend/src/services/api.ts` — seasonsApi + divisionsApi: CRUD operations (~4 tests)
- [ ] P1: `frontend/src/services/api.ts` — eventsApi: getAll with filters, getById, create/update/delete (~5 tests)
- [ ] P1: `frontend/src/services/api.ts` — contendersApi: getForChampionship, recalculate (~2 tests)
- [ ] P1: `frontend/src/services/api.ts` — fantasyApi: all 12 functions (getConfig, updateConfig, getCosts, initializeCosts, recalculateCosts, updateCost, getLeaderboard, scoreEvents, submitPicks, getUserPicks, getAllMyPicks, clearPicks) (~12 tests)
- [ ] P1: `frontend/src/services/api.ts` — usersApi: list, updateRole, toggleEnabled (~3 tests)
- [ ] P1: `frontend/src/services/api.ts` — siteConfigApi: getFeatures, updateFeatures (~2 tests)
- [ ] P1: `frontend/src/services/api.ts` — authApi: setToken/clearToken/isAuthenticated/getToken use sessionStorage correctly (~4 tests)
- [ ] P1: `frontend/src/services/api.ts` — profileApi: getMyProfile, updateMyProfile (~2 tests)
- [ ] P1: `frontend/src/services/api.ts` — statisticsApi: getPlayerStats/getHeadToHead/getLeaderboards/getRecords/getAchievements (~5 tests)
- [ ] P1: `frontend/src/services/api.ts` — challengesApi + promosApi: all functions with correct endpoints (~6 tests)
- [ ] P1: `frontend/src/services/api.ts` — imagesApi: generateUploadUrl + uploadToS3 (PUT to presigned URL) (~2 tests)

**Section total: ~69 tests**

---

## Feature: Frontend Utilities

### Frontend Unit Tests
- [ ] P2: `frontend/src/utils/dateUtils.ts` — formatDate: valid date string returns "Jan 15, 2024"; invalid date returns fallback (~2 tests)
- [ ] P2: `frontend/src/utils/dateUtils.ts` — formatDateTime: includes time "Jan 15, 2024, 2:30 PM"; handles invalid input (~2 tests)
- [ ] P2: `frontend/src/utils/dateUtils.ts` — formatTime: returns "2:30 PM"; handles edge cases (~2 tests)
- [ ] P2: `frontend/src/utils/dateUtils.ts` — formatRelativeTime: "2 days ago", "in 3 hours", "just now"; handles future and past (~3 tests)
- [ ] P2: `frontend/src/utils/sanitize.ts` — sanitizeInput: trims, limits length, removes `<>`; handles empty/null (~3 tests)
- [ ] P2: `frontend/src/utils/sanitize.ts` — sanitizeName: allows Unicode letters/numbers, spaces, hyphens, apostrophes, periods; strips other chars (~3 tests)
- [ ] P2: `frontend/src/utils/sanitize.ts` — sanitizeDescription: trims, limits length, removes `<>` (~2 tests)
- [ ] P2: `frontend/src/utils/sanitize.ts` — isValidInput: non-empty after trim returns true; whitespace-only returns false (~2 tests)
- [ ] P2: `frontend/src/utils/sanitize.ts` — meetsMinLength: "abc" with minLength 3 returns true; "ab" returns false (~2 tests)
- [ ] P3: `frontend/src/utils/logger.ts` — Dev mode: info/warn/debug log to console; Production: only error logs (sanitized) (~4 tests)

**Section total: ~25 tests**

---

## Feature: Frontend Contexts

### Frontend Context Tests
- [ ] P1: `frontend/src/contexts/SiteConfigContext.tsx` — Fetches config on mount; provides features via useSiteConfig(); defaults all features enabled on fetch error; refreshConfig re-fetches; uses mounted flag for cleanup (~5 tests)

**Section total: ~5 tests**

---

## Feature: Core Navigation & Layout

### Frontend Component Tests
- [ ] P2: `frontend/src/components/Sidebar.tsx` — Renders nav links; shows admin section when admin; hides features behind feature flags (challenges, promos, contenders, statistics, fantasy); expand/collapse admin section; mobile toggle; logout button; role-based sections (Wrestler, Admin, SuperAdmin) (~7 tests)
- [ ] P2: `frontend/src/components/TopBar.tsx` — Renders dynamic page title with breadcrumbs based on route (~2 tests)
- [ ] P2: `frontend/src/components/ErrorBoundary.tsx` — Renders children normally; catches errors and shows fallback; reload button resets state (~3 tests)
- [ ] P3: `frontend/src/components/UserGuide.tsx` — Renders guide content (~1 test)
- [ ] P3: `frontend/src/components/LanguageSwitcher.tsx` — Toggles language; updates i18n (~2 tests)
- [ ] P2: `frontend/src/App.tsx` — Renders with providers (Auth, SiteConfig, Router); public routes accessible; protected routes redirect when not authenticated; feature-gated routes redirect when disabled (~4 tests)

**Section total: ~19 tests**

---

## Feature: Reusable Admin Components

### Frontend Component Tests
- [ ] P3: `frontend/src/components/admin/SearchableSelect.tsx` — Renders dropdown with search; filters options on input; selects option; handles empty state (~3 tests)
- [ ] P2: `frontend/src/components/challenges/challengeUtils.ts` — MATCH_TYPES array has expected values; STIPULATIONS array has expected values; getInitial returns first character of name (~3 tests)

**Section total: ~6 tests**

---

## Summary

| Category | P0 | P1 | P2 | P3 |
|----------|----|----|----|----|
| Auth & Authorization | 42 | 30 | 0 | 0 |
| Shared Backend Libraries | 44 | 0 | 0 | 0 |
| Players | 0 | 29 | 0 | 0 |
| Divisions | 0 | 12 | 5 | 0 |
| Matches | 29 | 25 | 0 | 0 |
| Championships | 0 | 24 | 3 | 0 |
| Tournaments | 0 | 10 | 7 | 0 |
| Seasons | 0 | 11 | 4 | 0 |
| Standings | 0 | 5 | 4 | 0 |
| Events | 0 | 15 | 16 | 0 |
| Fantasy | 18 | 44 | 18 | 0 |
| Challenges | 0 | 23 | 16 | 0 |
| Promos | 0 | 22 | 13 | 0 |
| Statistics | 31 | 3 | 17 | 0 |
| Contenders | 6 | 5 | 5 | 0 |
| Users (Admin) | 8 | 10 | 3 | 0 |
| Admin Utilities | 0 | 8 | 6 | 4 |
| Images | 0 | 6 | 0 | 0 |
| Frontend API Client | 0 | 69 | 0 | 0 |
| Frontend Utilities | 0 | 0 | 19 | 6 |
| Frontend Contexts | 0 | 5 | 0 | 0 |
| Core Navigation & Layout | 0 | 0 | 16 | 3 |
| Reusable Components | 0 | 0 | 3 | 3 |
| **Totals** | **178** | **356** | **155** | **16** |

### Grand Total: ~705 tests

### Existing E2E Coverage (not in scope, for reference)
- `e2e/tests/public/` — championships, tournaments, standings, navigation, matches (5 specs)
- `e2e/tests/admin/` — auth, divisions.crud, players.crud, championships.crud, seasons (5 specs)
- `e2e/tests/integration/` — full-workflow (1 spec)

### Recommended Implementation Order
1. **Phase 1 — Foundation** (P0): Shared libs + auth + response helpers (~44 tests)
2. **Phase 2 — Critical Paths** (P0): recordResult + statistics + fantasy scoring + contender ranking (~134 tests)
3. **Phase 3 — Backend CRUD** (P1): All remaining handlers (~200 tests)
4. **Phase 4 — Frontend Services** (P1): api.ts + cognito.ts + contexts (~80 tests)
5. **Phase 5 — Frontend Components** (P1): Core UI components (~76 tests)
6. **Phase 6 — Remaining** (P2/P3): Secondary components + utilities (~171 tests)
