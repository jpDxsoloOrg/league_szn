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
- [x] P1: `frontend/src/components/auth/Login.tsx` — Renders form with email/password fields; shows loading on submit; displays error on failed login; calls signIn with correct args; navigates on success (~5 tests) ✅ `components/auth/__tests__/Login.test.tsx`
- [x] P1: `frontend/src/components/auth/Signup.tsx` — Renders signup form; validates fields; calls signUp; handles confirmation code flow; shows errors (~5 tests) ✅ `components/auth/__tests__/Signup.test.tsx`
- [x] P0: `frontend/src/components/ProtectedRoute.tsx` — Renders children when authenticated with correct role; redirects to login when not authenticated; shows access denied for wrong role; shows loading during auth check (~4 tests) ✅ `components/__tests__/ProtectedRoute.test.tsx`
- [x] P0: `frontend/src/components/FeatureRoute.tsx` — Renders children when feature enabled; redirects to home when disabled; shows loading during config fetch (~3 tests) ✅ `components/__tests__/FeatureRoute.test.tsx`

### Frontend Service Tests
- [x] P0: `frontend/src/services/cognito.ts` — signIn: calls Amplify signIn, stores tokens in sessionStorage, returns auth result (~3 tests) ✅ `services/__tests__/cognito.test.ts`
- [x] P0: `frontend/src/services/cognito.ts` — signUp/confirmSignUp: calls Amplify SDK, returns correct shape (~3 tests) ✅ `services/__tests__/cognito.test.ts`
- [x] P0: `frontend/src/services/cognito.ts` — signOut: calls Amplify signOut, clears sessionStorage (~2 tests) ✅ `services/__tests__/cognito.test.ts`
- [x] P0: `frontend/src/services/cognito.ts` — Token management: getAccessToken/getIdToken read from sessionStorage; getUserGroups parses groups; isAuthenticated checks session (~4 tests) ✅ `services/__tests__/cognito-roles.test.ts`
- [x] P0: `frontend/src/services/cognito.ts` — Role helpers: hasRole respects hierarchy (Admin > Moderator > Wrestler); isAdmin checks group membership; isWrestler checks group (~4 tests) ✅ `services/__tests__/cognito-roles.test.ts`
- [x] P1: `frontend/src/services/cognito.ts` — JWT helpers: decodeJwtPayload parses valid JWT; handles malformed token; getGroupsFromToken extracts cognito:groups (~3 tests) ✅ `services/__tests__/cognito-roles.test.ts`
- [x] P0: `frontend/src/services/cognito.ts` — refreshSession: calls Amplify fetchAuthSession with forceRefresh; updates sessionStorage; handles refresh failure (~3 tests) ✅ `services/__tests__/cognito.test.ts`

### Frontend Context Tests
- [x] P0: `frontend/src/contexts/AuthContext.tsx` — Initializes: fetches current user on mount; sets isAuthenticated; extracts groups; fetches player profile for Wrestlers (~4 tests) ✅ `contexts/__tests__/AuthContext.test.tsx`
- [x] P0: `frontend/src/contexts/AuthContext.tsx` — Role helpers: isAdmin/isSuperAdmin/isModerator/isWrestler/isFantasy return correct values based on groups; hasRole checks hierarchy (~6 tests) ✅ `contexts/__tests__/AuthContext.test.tsx`
- [x] P1: `frontend/src/contexts/AuthContext.tsx` — Sign in/out: signIn updates state; signOut clears state; refreshProfile re-fetches player (~3 tests) ✅ `contexts/__tests__/AuthContext.test.tsx`
- [x] P1: `frontend/src/contexts/AuthContext.tsx` — Cleanup: uses mounted flag; doesn't update state after unmount (~2 tests) ✅ `contexts/__tests__/AuthContext.test.tsx`

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
- [x] P1: `frontend/src/components/admin/ManagePlayers.tsx` — Renders player list; shows add form on button click; creates player via API; edits existing player; deletes with confirmation; handles image upload (presigned URL + S3); shows loading/error/success states (~8 tests) ✅ `components/admin/__tests__/ManagePlayers.test.tsx`

**Backend tests written: 28/28 ✅** | Frontend tests remaining: ~8
**Section total: ~36 tests**

---

## Feature: Divisions

### Backend Unit Tests
- [x] P1: `backend/functions/divisions/createDivision.ts` — Creates division with name; returns 400 if name missing; auth requires Admin (7 tests) ✅ `functions/divisions/__tests__/divisions.test.ts`
- [x] P1: `backend/functions/divisions/getDivisions.ts` — Returns all divisions via scan; returns empty array (3 tests) ✅ `functions/divisions/__tests__/divisions.test.ts`
- [x] P1: `backend/functions/divisions/updateDivision.ts` — Updates division fields; returns 404 if not found; updates updatedAt; auth requires Admin (7 tests) ✅ `functions/divisions/__tests__/divisionsModify.test.ts`
- [x] P1: `backend/functions/divisions/deleteDivision.ts` — Deletes division; returns 404 if not found; returns 409 if players assigned (referential integrity); auth requires Admin (7 tests) ✅ `functions/divisions/__tests__/divisionsModify.test.ts`

**Backend tests written: 24/24 ✅**

### Frontend Component Tests
- [ ] P2: `frontend/src/components/admin/ManageDivisions.tsx` — Renders division list; create/edit/delete flows; shows error on delete with assigned players (~5 tests)

**Section total: ~17 tests**

---

## Feature: Matches

### Backend Unit Tests
- [x] P0: `backend/functions/matches/recordResult.ts` — **Core transaction**: updates match status to completed; increments winner wins + loser losses in player stats; increments season standings (5 tests) ✅ `functions/matches/__tests__/recordResult.test.ts`
- [x] P0: `backend/functions/matches/recordResult.ts` — **Validation**: returns 400 if winners/losers empty; returns 400 if overlap between winners and losers; returns 404 if match not found; returns 400 if match already completed (7 tests) ✅ `functions/matches/__tests__/recordResult.test.ts`
- [x] P0: `backend/functions/matches/recordResult.ts` — **Championship transaction**: title defense increments defenses; title change updates currentChampion + closes old reign + creates new reign; sets isTitleDefense flag; handles tag team championships (6 tests) ✅ `functions/matches/__tests__/recordResultChampionship.test.ts`
- [x] P0: `backend/functions/matches/recordResult.ts` — **Tournament progression (round-robin)**: updates standings; status transitions; initializes new participants (4 tests) ✅ `functions/matches/__tests__/recordResultTournament.test.ts`
- [x] P0: `backend/functions/matches/recordResult.ts` — **Tournament progression (single-elimination)**: advances winner to next bracket round; detects tournament completion; status transitions (4 tests) ✅ `functions/matches/__tests__/recordResultTournament.test.ts`
- [x] P0: `backend/functions/matches/recordResult.ts` — **Event auto-complete**: finds events containing match; marks event completed if all matches done; marks in-progress if partial; succeeds if auto-complete throws (4 tests) ✅ `functions/matches/__tests__/recordResultTournament.test.ts`
- [x] P0: `backend/functions/matches/recordResult.ts` — **Background ops**: fires ranking recalculation + cost recalculation via Promise.allSettled; doesn't fail if background ops fail (2 tests) ✅ `functions/matches/__tests__/recordResult.test.ts`
- [x] P0: `backend/functions/matches/recordResult.ts` — **Concurrency**: uses optimistic locking (version field); returns 400 with retry message on TransactionCancelled (2 tests) ✅ `functions/matches/__tests__/recordResult.test.ts`
- [x] P1: `backend/functions/matches/scheduleMatch.ts` — Creates match with matchType + participants; validates 2+ participants; no duplicate participants; all participants must exist; championship must exist if isChampionship; division restriction for championship matches; auto-adds to event matchCards (18 tests) ✅ `functions/matches/__tests__/scheduleMatch.test.ts`
- [x] P1: `backend/functions/matches/getMatches.ts` — Returns all matches via scan; filters by status; sorts by date descending; error handling (5 tests) ✅ `functions/matches/__tests__/getMatches.test.ts`

### Frontend Component Tests
- [x] P1: `frontend/src/components/Matches.tsx` — Renders match list; shows scheduled vs completed; displays participant names (~3 tests) ✅ `components/__tests__/Matches.test.tsx`
- [x] P1: `frontend/src/components/admin/ScheduleMatch.tsx` — Renders form with match type, participants, options; loads players/championships/tournaments/seasons/events; handles tag team mode (multiple teams); submits match; shows validation errors (~6 tests) ✅ `components/admin/__tests__/ScheduleMatch.test.tsx`
- [x] P1: `frontend/src/components/admin/RecordResult.tsx` — Lists scheduled matches; filters by event; selects winners (team vs individual); submits result; handles loading/error/success (~5 tests) ✅ `components/admin/__tests__/RecordResult.test.tsx`

**Backend tests written: 57/57 ✅** | Frontend tests remaining: ~14
**Section total: ~71 tests**

---

## Feature: Championships

### Backend Unit Tests
- [x] P1: `backend/functions/championships/createChampionship.ts` — Creates singles/tag championship; validates name, type; optional fields; null body (6 tests) ✅ `functions/championships/__tests__/championships.test.ts`
- [x] P1: `backend/functions/championships/getChampionships.ts` — Filters isActive !== false; empty array (2 tests) ✅ `functions/championships/__tests__/championships.test.ts`
- [x] P1: `backend/functions/championships/getChampionshipHistory.ts` — Returns history descending; empty; missing championshipId (3 tests) ✅ `functions/championships/__tests__/championships.test.ts`
- [x] P1: `backend/functions/championships/updateChampionship.ts` — Updates fields; dynamic expression; 404; no valid fields; missing id (5 tests) ✅ `functions/championships/__tests__/championships.test.ts`
- [x] P1: `backend/functions/championships/deleteChampionship.ts` — Cascading delete with history; no history; 404; missing id (4 tests) ✅ `functions/championships/__tests__/championships.test.ts`
- [x] P1: `backend/functions/championships/vacateChampionship.ts` — Full vacate transaction; no open history; already vacant; 404; missing id (5 tests) ✅ `functions/championships/__tests__/championships.test.ts`

### Frontend Component Tests
- [x] P1: `frontend/src/components/Championships.tsx` — Renders championship list with current holders; handles empty state (~3 tests) ✅ `components/__tests__/Championships.test.tsx`
- [x] P1: `frontend/src/components/admin/ManageChampionships.tsx` — Create/edit/delete championships; image upload; vacate title; shows current champion; division assignment (~7 tests) ✅ `components/admin/__tests__/ManageChampionships.test.tsx`

**Backend tests written: 25/25 ✅** | Frontend tests remaining: ~10
**Section total: ~35 tests**

---

## Feature: Tournaments

### Backend Unit Tests
- [x] P1: `backend/functions/tournaments/createTournament.ts` — Creates tournament; validates name + type + 2+ participants; generates single-elimination bracket with byes; initializes round-robin standings; auth requires Admin (13 tests) ✅ `functions/tournaments/__tests__/createTournament.test.ts`
- [x] P1: `backend/functions/tournaments/getTournaments.ts` — Returns all tournaments via scan; public endpoint (3 tests) ✅ `functions/tournaments/__tests__/getTournaments.test.ts`
- [x] P1: `backend/functions/tournaments/updateTournament.ts` — Updates tournament; returns 404 if not found; dynamic update; auth requires Admin (11 tests) ✅ `functions/tournaments/__tests__/updateTournament.test.ts`

**Backend tests written: 27/27 ✅**

### Frontend Component Tests
- [x] P2: `frontend/src/components/Tournaments.tsx` — Renders tournament list; shows bracket view for single-elimination; shows standings for round-robin (~4 tests) ✅ `components/__tests__/Tournaments.test.tsx`
- [x] P2: `frontend/src/components/admin/CreateTournament.tsx` — Creates tournament with type/participants; validates min participants (~3 tests) ✅ `components/admin/__tests__/CreateTournament.test.tsx`

**Section total: ~17 tests**

---

## Feature: Seasons

### Backend Unit Tests
- [x] P1: `backend/functions/seasons/createSeason.ts` — Creates season with default status 'active'; validates name + startDate; conflict with existing active season (8 tests) ✅ `functions/seasons/__tests__/getAndCreateSeason.test.ts`
- [x] P1: `backend/functions/seasons/getSeasons.ts` — Returns all seasons via scan sorted descending; public endpoint (3 tests) ✅ `functions/seasons/__tests__/getAndCreateSeason.test.ts`
- [x] P1: `backend/functions/seasons/updateSeason.ts` — Updates season; returns 404 if not found; active-season conflict; auto-endDate on complete (13 tests) ✅ `functions/seasons/__tests__/updateSeason.test.ts`
- [x] P1: `backend/functions/seasons/deleteSeason.ts` — Deletes season + cascades to standings; returns 404 if not found (6 tests) ✅ `functions/seasons/__tests__/deleteSeason.test.ts`

**Backend tests written: 30/30 ✅**

### Frontend Component Tests
- [ ] P2: `frontend/src/components/admin/ManageSeasons.tsx` — Create/edit/delete seasons; end active season; shows status (~4 tests)

**Section total: ~15 tests**

---

## Feature: Standings

### Backend Unit Tests
- [x] P1: `backend/functions/standings/getStandings.ts` — Returns all-time standings sorted by wins; season standings merged with players via SeasonIndex GSI; sorts by wins then losses; public endpoint (17 tests) ✅ `functions/standings/__tests__/getStandings-allTime.test.ts`, `functions/standings/__tests__/getStandings-season.test.ts`

**Backend tests written: 17/17 ✅**

### Frontend Component Tests
- [ ] P2: `frontend/src/components/Standings.tsx` — Renders standings table; filters by season; shows W-L-D + win%; handles empty state (~4 tests)

**Section total: ~9 tests**

---

## Feature: Events

### Backend Unit Tests
- [x] P1: `backend/functions/events/createEvent.ts` — Creates event; validates name + eventType + date; validates eventType (ppv/weekly/special/house) and status; auth requires Admin (10 tests) ✅ `functions/events/__tests__/createEvent.test.ts`
- [x] P1: `backend/functions/events/getEvents.ts` — Returns events filtered by status (StatusIndex) or seasonId (SeasonIndex) or all via scan; sorts by date descending; public endpoint (7 tests) ✅ `functions/events/__tests__/getEvents.test.ts`
- [x] P1: `backend/functions/events/getEvent.ts` — Returns event with enriched matchCards (full match details + player names); returns 404 if not found; public endpoint (10 tests) ✅ `functions/events/__tests__/getEvent.test.ts`
- [x] P1: `backend/functions/events/updateEvent.ts` — Updates event; supports 13 optional fields; validates eventType/status if provided; returns 404; auth requires Admin (13 tests) ✅ `functions/events/__tests__/updateEvent.test.ts`
- [x] P1: `backend/functions/events/deleteEvent.ts` — Deletes event; removes eventId from associated matches; returns 404 if not found; auth requires Admin (10 tests) ✅ `functions/events/__tests__/deleteEvent.test.ts`

**Backend tests written: 50/50 ✅**

### Frontend Component Tests
- [ ] P2: `frontend/src/components/events/EventsCalendar.tsx` — Renders calendar grid with event dots; navigates months; filters by event type; shows upcoming events list; handles empty state (~5 tests)
- [ ] P1: `frontend/src/components/admin/CreateEvent.tsx` — Creates event with form fields; season selection; theme color picker; validates required fields (~4 tests)
- [ ] P2: `frontend/src/components/admin/MatchCardBuilder.tsx` — Builds event match cards; reorders matches; links to schedule match (~3 tests)

**Section total: ~31 tests**

---

## Feature: Fantasy

### Backend Unit Tests
- [x] P0: `backend/functions/fantasy/submitPicks.ts` — Auth, validation, event status, picks structure, division limits, duplicates, player validation, budget, createdAt preservation (19 tests) ✅ `functions/fantasy/__tests__/submitPicks.test.ts`
- [x] P0: `backend/functions/fantasy/calculateFantasyPoints.ts` — Base scoring, championship bonuses, title defense, zero scoring, breakdown, completed matches only, config defaults, multi-user (13 tests) ✅ `functions/fantasy/__tests__/calculateFantasyPoints.test.ts`
- [x] P1: `backend/functions/fantasy/clearPicks.ts` — Auth, validation, event status checks, deletes with composite key (7 tests) ✅ `functions/fantasy/__tests__/fantasyPicks.test.ts`
- [x] P1: `backend/functions/fantasy/getAllMyPicks.ts` — Auth, GSI query, sort, empty results (5 tests) ✅ `functions/fantasy/__tests__/fantasyPicks.test.ts`
- [x] P1: `backend/functions/fantasy/getFantasyConfig.ts` — Returns config, DEFAULT_CONFIG with 14 fields, error handling (3 tests) ✅ `functions/fantasy/__tests__/fantasyConfig.test.ts`
- [x] P1: `backend/functions/fantasy/getFantasyLeaderboard.ts` — Points aggregation, season filter, perfect picks, streak calculation, sort, username fallback (12 tests) ✅ `functions/fantasy/__tests__/fantasyLeaderboard.test.ts`
- [x] P1: `backend/functions/fantasy/getUserPicks.ts` — Auth, validation, 404, returns picks (6 tests) ✅ `functions/fantasy/__tests__/fantasyPicks.test.ts`
- [x] P1: `backend/functions/fantasy/getWrestlerCosts.ts` — Merged player+cost data, trend calculation, defaults, empty (6 tests) ✅ `functions/fantasy/__tests__/wrestlerCosts.test.ts`
- [x] P1: `backend/functions/fantasy/initializeWrestlerCosts.ts` — Auth, creates new costs, skips existing, custom baseCost (6 tests) ✅ `functions/fantasy/__tests__/wrestlerCosts.test.ts`
- [x] P1: `backend/functions/fantasy/recalculateWrestlerCosts.ts` — Formula, clamping, history, unchanged cost, 20-entry limit, config disabled (12 tests) ✅ `functions/fantasy/__tests__/recalculateWrestlerCosts.test.ts`
- [x] P1: `backend/functions/fantasy/scoreCompletedEvents.ts` — Auth, scores unscored picks, deduplicates events, error resilience (8 tests) ✅ `functions/fantasy/__tests__/scoreCompletedEvents.test.ts`
- [x] P1: `backend/functions/fantasy/updateFantasyConfig.ts` — Auth, validation, merges config, enforces GLOBAL key (7 tests) ✅ `functions/fantasy/__tests__/fantasyConfig.test.ts`
- [x] P1: `backend/functions/fantasy/updateWrestlerCost.ts` — Auth, validation, 404, updates with history, trims to 20 entries (10 tests) ✅ `functions/fantasy/__tests__/wrestlerCosts.test.ts`

### Frontend Component Tests
- [ ] P1: `frontend/src/components/fantasy/FantasyDashboard.tsx` — Renders upcoming show card; shows current picks preview; displays stats + recent results; auto-scores unscored picks on mount; handles loading state (~5 tests)
- [ ] P1: `frontend/src/components/fantasy/MakePicks.tsx` — Renders division-based picker; enforces budget constraint; enforces picks-per-division limit; submits picks; clears picks; shows wrestler costs (~6 tests)
- [ ] P2: `frontend/src/components/fantasy/FantasyLeaderboard.tsx` — Renders leaderboard table with ranks/points; filters by season; shows streak + perfect picks (~4 tests)
- [ ] P2: `frontend/src/components/fantasy/WrestlerCosts.tsx` — Renders cost table with current/trend; handles empty state (~3 tests)
- [ ] P2: `frontend/src/components/fantasy/ShowResults.tsx` — Renders event results with points breakdown per wrestler (~3 tests)
- [ ] P2: `frontend/src/components/fantasy/BudgetTracker.tsx` — Shows remaining budget; updates in real-time as picks change; warns when over budget (~3 tests)
- [ ] P1: `frontend/src/components/admin/FantasyConfig.tsx` — Renders all 14 config fields; tracks unsaved changes; saves config; resets to original; toggles cost fluctuation fields conditionally (~5 tests)
- [ ] P1: `frontend/src/components/admin/ManageFantasyShows.tsx` — Configures fantasy picks for events; locks/unlocks events (~3 tests)

**Backend tests written: 114/114 ✅** | Frontend tests remaining: ~32
**Section total: ~146 tests**

---

## Feature: Challenges

### Backend Unit Tests
- [x] P1: `backend/functions/challenges/createChallenge.ts` — Creates challenge; validates required fields (opponentId, matchType); cannot challenge self; only linked players; auth requires Wrestler (14 tests) ✅ `functions/challenges/__tests__/createChallenge.test.ts`
- [x] P1: `backend/functions/challenges/getChallenges.ts` — Returns challenges filtered by status/playerId or all; enriches with player names; deduplicates; sorts by createdAt descending; public endpoint (10 tests) ✅ `functions/challenges/__tests__/getChallenges.test.ts`
- [x] P1: `backend/functions/challenges/getChallenge.ts` — Returns single challenge with enriched player info; returns 404 if not found (5 tests) ✅ `functions/challenges/__tests__/getChallenges.test.ts`
- [x] P1: `backend/functions/challenges/respondToChallenge.ts` — Accept/Decline/Counter with transactWrite; only challenged player can respond; challenge must be pending; auth requires Wrestler (16 tests) ✅ `functions/challenges/__tests__/respondToChallenge.test.ts`
- [x] P1: `backend/functions/challenges/cancelChallenge.ts` — Cancels challenge; only issuer or admin can cancel; challenge must be pending; auth requires Wrestler (9 tests) ✅ `functions/challenges/__tests__/cancelChallenge.test.ts`

**Backend tests written: 54/54 ✅**

### Frontend Component Tests
- [ ] P2: `frontend/src/components/challenges/ChallengeBoard.tsx` — Renders challenge list with filters (active/pending/accepted/recent); shows countdown for pending; handles empty state (~4 tests)
- [ ] P2: `frontend/src/components/challenges/IssueChallenge.tsx` — Renders form; filters opponents to linked users; match type/stipulation selection; 500 char message limit; preview before submit; shows success with navigation (~5 tests)
- [ ] P2: `frontend/src/components/challenges/ChallengeDetail.tsx` — Shows challenge details; respond buttons (accept/decline/counter); cancel button for issuer (~4 tests)
- [ ] P2: `frontend/src/components/challenges/MyChallenges.tsx` — Shows issued + received challenges; action buttons based on status (~3 tests)

**Section total: ~39 tests**

---

## Feature: Promos

### Backend Unit Tests
- [x] P1: `backend/functions/promos/createPromo.ts` — Creates promo; validates promoType + content; requires wrestler profile; auto-populates playerId; initializes empty reactions; auth requires Wrestler (13 tests) ✅ `functions/promos/__tests__/createPromo.test.ts`
- [x] P1: `backend/functions/promos/getPromos.ts` — Returns promos filtered by playerId/promoType or all; filters out hidden promos; enriches with player details; public endpoint (9 tests) ✅ `functions/promos/__tests__/getPromos.test.ts`
- [x] P1: `backend/functions/promos/getPromo.ts` — Returns promo with enriched player info + target enrichment; skips enrichment if player deleted; returns 404 (8 tests) ✅ `functions/promos/__tests__/getPromo.test.ts`
- [x] P1: `backend/functions/promos/reactToPromo.ts` — Toggles reaction; updates nested reactions + reactionCounts; validates reactionType; auth requires Wrestler (13 tests) ✅ `functions/promos/__tests__/reactToPromo.test.ts`
- [x] P1: `backend/functions/promos/adminUpdatePromo.ts` — Updates isPinned/isHidden flags; returns 404 if not found; auth requires Admin/Moderator (10 tests) ✅ `functions/promos/__tests__/adminUpdatePromo.test.ts`

**Backend tests written: 53/53 ✅**

### Frontend Component Tests
- [ ] P2: `frontend/src/components/promos/PromoFeed.tsx` — Renders promo list with type filters; shows pinned section; handles empty state (~4 tests)
- [ ] P2: `frontend/src/components/promos/PromoEditor.tsx` — Creates promo with type/content/target selection; validates content (~3 tests)
- [ ] P2: `frontend/src/components/promos/PromoCard.tsx` — Displays promo content + player info; shows reactions; links to thread (~3 tests)
- [ ] P2: `frontend/src/components/promos/PromoReactions.tsx` — Renders reaction buttons; highlights user's active reactions; calls react API on click (~3 tests)

**Section total: ~35 tests**

---

## Feature: Statistics

### Backend Unit Tests
- [x] P0: `backend/functions/statistics/getStatistics.ts` — **player-stats section**: computes stats for 5 match types; championship history per title; ongoing reigns; achievements (7 tests) ✅ `functions/statistics/__tests__/getStatistics.test.ts`
- [x] P0: `backend/functions/statistics/getStatistics.ts` — **head-to-head section**: computes H2H record; recent results; overall stats; no matches case (4 tests) ✅ `functions/statistics/__tests__/getStatistics.test.ts`
- [x] P0: `backend/functions/statistics/getStatistics.ts` — **leaderboards section**: most wins, best win%, longest streak, most championships, longest reign (5 tests) ✅ `functions/statistics/__tests__/getStatistics-leaderboards.test.ts`
- [x] P0: `backend/functions/statistics/getStatistics.ts` — **records section**: overall + championship + streak + match type records + active threats (5 tests) ✅ `functions/statistics/__tests__/getStatistics-leaderboards.test.ts`
- [x] P0: `backend/functions/statistics/getStatistics.ts` — **achievements section**: 18 achievement definitions; milestone/record/special types; Deadman Walking; Grand Slam; Cage Master; Peoples Champion (12 tests) ✅ `functions/statistics/__tests__/getStatistics-achievements.test.ts`
- [x] P0: `backend/functions/statistics/getStatistics.ts` — **Helper functions**: categorizeMatch maps stipulations; computeStreaks; computePlayerStatistics; handles tag championships (5 tests) ✅ `functions/statistics/__tests__/getStatistics-achievements.test.ts`
- [x] P1: `backend/functions/statistics/getStatistics.ts` — **Validation**: returns 400 if section missing; unknown section; error handling (3 tests) ✅ `functions/statistics/__tests__/getStatistics.test.ts`

### Frontend Component Tests
- [ ] P2: `frontend/src/components/statistics/PlayerStats.tsx` — Renders player selector; shows W-L-D card + streak + match type breakdown + championship history + achievements; handles loading/error (~5 tests)
- [ ] P2: `frontend/src/components/statistics/HeadToHeadComparison.tsx` — Selects two players; shows H2H record + recent results (~3 tests)
- [ ] P2: `frontend/src/components/statistics/Leaderboards.tsx` — Renders category leaderboards with tabs (~3 tests)
- [ ] P2: `frontend/src/components/statistics/RecordBook.tsx` — Shows all-time records with active threats (~3 tests)
- [ ] P2: `frontend/src/components/statistics/Achievements.tsx` — Shows achievement badges and progress bars (~3 tests)

**Backend tests written: 41/41 ✅** | Frontend tests remaining: ~17
**Section total: ~58 tests**

---

## Feature: Contenders

### Backend Unit Tests
- [x] P0: `backend/functions/contenders/calculateRankings.ts` — Calculates rankings using rankingCalculator lib; preserves previousRank/peakRank/weeksAtTop; deletes old rankings; writes ranking history with weekKey; optional championshipId filter; error handling (7 tests) ✅ `functions/contenders/__tests__/contenders.test.ts`
- [x] P1: `backend/functions/contenders/getContenders.ts` — Returns contenders for championship via RankIndex GSI; filters out current champion; enriches with player names; calculates movement; missing championshipId; not-found; error handling (7 tests) ✅ `functions/contenders/__tests__/contenders.test.ts`

### Frontend Component Tests
- [ ] P2: `frontend/src/components/contenders/ContenderRankings.tsx` — Renders championship selector (grouped by division); shows current champion card; displays ranked contenders with movement indicators; handles loading/error/empty states (~5 tests)

**Backend tests written: 14/14 ✅** | Frontend tests remaining: ~5
**Section total: ~19 tests**

---

## Feature: Users (Admin)

### Backend Unit Tests
- [x] P1: `backend/functions/users/listUsers.ts` — Auth, formatted user list with groups, error handling, group fetch failure per user (4 tests) ✅ `functions/users/__tests__/users.test.ts`
- [x] P1: `backend/functions/users/toggleUserEnabled.ts` — Auth, validation, enable/disable commands, error handling (6 tests) ✅ `functions/users/__tests__/users.test.ts`
- [x] P0: `backend/functions/users/updateUserRole.ts` — Auth, validation, role/action checks, Moderator rejection, promote/demote, Wrestler auto-Fantasy + auto-Player, skip existing player, non-blocking errors (10 tests) ✅ `functions/users/__tests__/users.test.ts`

### Frontend Component Tests
- [x] P1: `frontend/src/components/admin/ManageUsers.tsx` — Renders user list with filters (all/wrestler-requests/wrestlers/admins/disabled); approve wrestler requests; promote/demote roles; enable/disable users; assign divisions; SuperAdmin-only actions for Admin/Moderator management (~7 tests) ✅ `components/admin/__tests__/ManageUsers.test.tsx`

**Backend tests written: 20/20 ✅** | Frontend tests remaining: ~7
**Section total: ~27 tests**

---

## Feature: Admin Utilities

### Backend Unit Tests
- [x] P1: `backend/functions/admin/getSiteConfig.ts` — Returns site config features; returns defaults if none exists; public endpoint (4 tests) ✅ `functions/admin/__tests__/siteConfig.test.ts`
- [x] P1: `backend/functions/admin/updateSiteConfig.ts` — Updates site features; validates feature keys/values; merges with existing; auth requires Admin (10 tests) ✅ `functions/admin/__tests__/siteConfig.test.ts`
- [x] P1: `backend/functions/admin/seedData.ts` — Seeds sample data; returns created counts; auth requires Super Admin (2 tests) ✅ `functions/admin/__tests__/seedAndClear.test.ts`
- [x] P1: `backend/functions/admin/clearAll.ts` — Clears all data from all tables; returns deleted counts; partial failure handling; auth requires Super Admin (9 tests) ✅ `functions/admin/__tests__/seedAndClear.test.ts`

**Backend tests written: 25/25 ✅**

### Frontend Component Tests
- [ ] P2: `frontend/src/components/admin/ManageFeatures.tsx` — Toggles feature flags on/off; saves via API; shows error state (~3 tests)
- [ ] P2: `frontend/src/components/admin/AdminPanel.tsx` — Renders correct tab based on URL; shows all 17 admin tabs; admin/SuperAdmin access checks (~3 tests)
- [ ] P3: `frontend/src/components/admin/ClearAllData.tsx` — Shows danger zone; requires confirmation; calls clearAll API; SuperAdmin only (~3 tests)
- [ ] P3: `frontend/src/components/admin/AdminGuide.tsx` — Renders admin documentation (~1 test)

**Section total: ~18 tests**

---

## Feature: Images

### Backend Unit Tests
- [x] P1: `backend/functions/images/generateUploadUrl.ts` — Generates S3 presigned URL; validates fileName + fileType + folder; validates file types (jpeg/png/gif/webp); S3 command construction; auth requires Wrestler+ (30 tests) ✅ `functions/images/__tests__/images.test.ts`, `functions/images/__tests__/images-s3.test.ts`

**Backend tests written: 30/30 ✅**

**Section total: ~6 tests**

---

## Feature: Frontend API Client

### Frontend Service Tests
- [x] P1: `frontend/src/services/api.ts` — fetchWithAuth: adds Authorization header when token exists; omits header when no token; handles 204 (no content); throws on non-ok responses; passes AbortSignal through (~5 tests) ✅ `services/__tests__/api-core.test.ts`
- [x] P1: `frontend/src/services/api.ts` — playersApi: getAll/create/update/delete call correct endpoints with correct methods and params (~4 tests) ✅ `services/__tests__/api-domains-1.test.ts`
- [x] P1: `frontend/src/services/api.ts` — matchesApi: getAll with filters, schedule, recordResult (~3 tests) ✅ `services/__tests__/api-domains-1.test.ts`
- [x] P1: `frontend/src/services/api.ts` — championshipsApi: getAll/create/getHistory/update/delete/vacate (~6 tests) ✅ `services/__tests__/api-domains-1.test.ts`
- [x] P1: `frontend/src/services/api.ts` — tournamentsApi: getAll/getById/create/update (~4 tests) ✅ `services/__tests__/api-domains-1.test.ts`
- [x] P1: `frontend/src/services/api.ts` — standingsApi: get with optional seasonId (~2 tests) ✅ `services/__tests__/api-domains-1.test.ts`
- [x] P1: `frontend/src/services/api.ts` — seasonsApi + divisionsApi: CRUD operations (~4 tests) ✅ `services/__tests__/api-domains-1.test.ts`
- [x] P1: `frontend/src/services/api.ts` — eventsApi: getAll with filters, getById, create/update/delete (~5 tests) ✅ `services/__tests__/api-domains-2.test.ts`
- [x] P1: `frontend/src/services/api.ts` — contendersApi: getForChampionship, recalculate (~2 tests) ✅ `services/__tests__/api-domains-2.test.ts`
- [x] P1: `frontend/src/services/api.ts` — fantasyApi: all 12 functions (getConfig, updateConfig, getCosts, initializeCosts, recalculateCosts, updateCost, getLeaderboard, scoreEvents, submitPicks, getUserPicks, getAllMyPicks, clearPicks) (~12 tests) ✅ `services/__tests__/api-domains-3.test.ts`
- [x] P1: `frontend/src/services/api.ts` — usersApi: list, updateRole, toggleEnabled (~3 tests) ✅ `services/__tests__/api-domains-2.test.ts`
- [x] P1: `frontend/src/services/api.ts` — siteConfigApi: getFeatures, updateFeatures (~2 tests) ✅ `services/__tests__/api-domains-2.test.ts`
- [x] P1: `frontend/src/services/api.ts` — authApi: setToken/clearToken/isAuthenticated/getToken use sessionStorage correctly (~4 tests) ✅ `services/__tests__/api-core.test.ts`
- [x] P1: `frontend/src/services/api.ts` — profileApi: getMyProfile, updateMyProfile (~2 tests) ✅ `services/__tests__/api-core.test.ts`
- [x] P1: `frontend/src/services/api.ts` — statisticsApi: getPlayerStats/getHeadToHead/getLeaderboards/getRecords/getAchievements (~5 tests) ✅ `services/__tests__/api-domains-2.test.ts`
- [x] P1: `frontend/src/services/api.ts` — challengesApi + promosApi: all functions with correct endpoints (~6 tests) ✅ `services/__tests__/api-domains-3.test.ts`
- [x] P1: `frontend/src/services/api.ts` — imagesApi: generateUploadUrl + uploadToS3 (PUT to presigned URL) (~2 tests) ✅ `services/__tests__/api-domains-3.test.ts`

**Frontend service tests written: 123/69 ✅** (exceeded plan — more thorough coverage)
**Section total: ~69 tests**

---

## Feature: Frontend Utilities

### Frontend Unit Tests
- [x] P2: `frontend/src/utils/dateUtils.ts` — formatDate: valid date string returns "Jan 15, 2024"; invalid date returns fallback (~2 tests) ✅ `utils/__tests__/dateUtils.test.ts`
- [x] P2: `frontend/src/utils/dateUtils.ts` — formatDateTime: includes time "Jan 15, 2024, 2:30 PM"; handles invalid input (~2 tests) ✅ `utils/__tests__/dateUtils.test.ts`
- [x] P2: `frontend/src/utils/dateUtils.ts` — formatTime: returns "2:30 PM"; handles edge cases (~2 tests) ✅ `utils/__tests__/dateUtils.test.ts`
- [x] P2: `frontend/src/utils/dateUtils.ts` — formatRelativeTime: "2 days ago", "in 3 hours", "just now"; handles future and past (~3 tests) ✅ `utils/__tests__/dateUtils.test.ts`
- [x] P2: `frontend/src/utils/sanitize.ts` — sanitizeInput: trims, limits length, removes `<>`; handles empty/null (~3 tests) ✅ `utils/__tests__/sanitize.test.ts`
- [x] P2: `frontend/src/utils/sanitize.ts` — sanitizeName: allows Unicode letters/numbers, spaces, hyphens, apostrophes, periods; strips other chars (~3 tests) ✅ `utils/__tests__/sanitize.test.ts`
- [x] P2: `frontend/src/utils/sanitize.ts` — sanitizeDescription: trims, limits length, removes `<>` (~2 tests) ✅ `utils/__tests__/sanitize.test.ts`
- [x] P2: `frontend/src/utils/sanitize.ts` — isValidInput: non-empty after trim returns true; whitespace-only returns false (~2 tests) ✅ `utils/__tests__/sanitize.test.ts`
- [x] P2: `frontend/src/utils/sanitize.ts` — meetsMinLength: "abc" with minLength 3 returns true; "ab" returns false (~2 tests) ✅ `utils/__tests__/sanitize.test.ts`
- [x] P3: `frontend/src/utils/logger.ts` — Dev mode: info/warn/debug log to console; Production: only error logs (sanitized) (~4 tests) ✅ `utils/__tests__/logger.test.ts`

**Frontend utility tests written: 28/25 ✅**
**Section total: ~25 tests**

---

## Feature: Frontend Contexts

### Frontend Context Tests
- [x] P1: `frontend/src/contexts/SiteConfigContext.tsx` — Fetches config on mount; provides features via useSiteConfig(); defaults all features enabled on fetch error; refreshConfig re-fetches; uses mounted flag for cleanup (~5 tests) ✅ `contexts/__tests__/SiteConfigContext.test.tsx`

**Frontend context tests written: 6/5 ✅**
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
