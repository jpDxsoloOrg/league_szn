<objective>
Systematically implement ALL remaining frontend unit and component tests from TEST-PLAN.md, feature by feature.
First, set up the frontend testing infrastructure (Batch 0). Then process up to 3 features in parallel
using Task tool with test-engineer subagents. After each batch of 3 features completes and tests pass,
update TEST-PLAN.md checkboxes and commit the changes. Continue until all frontend features have tests
written and verified.
</objective>

<context>
League SZN is a WWE 2K League Management System — serverless monorepo.
- Frontend: React 18 + TypeScript + Vite at `./frontend/src/`
- Test framework: **Vitest + React Testing Library** (NOT yet installed — Batch 0 sets this up)
- Run tests (after setup): `cd frontend && npm test`
- Test plan: `./TEST-PLAN.md` — contains checkboxes for every frontend test item

**Backend tests are COMPLETE (do NOT redo)** — all backend checkboxes in TEST-PLAN.md are already checked.

**No frontend tests exist yet.** This prompt covers the full frontend test implementation.

**Frontend architecture to understand:**
- All API calls go through `fetchWithAuth` in `frontend/src/services/api.ts` (~650 lines)
- Auth via AWS Amplify/Cognito in `frontend/src/services/cognito.ts`
- Two React contexts: `AuthContext.tsx` (auth state + role helpers) and `SiteConfigContext.tsx` (feature flags)
- Role hierarchy: Fantasy < Wrestler < Moderator < Admin
- Feature flags gate routes: challenges, promos, fantasy, statistics, contenders
- Utility modules: `dateUtils.ts`, `sanitize.ts`, `logger.ts`
- Components organized by domain: `components/{domain}/` (admin, auth, fantasy, challenges, promos, statistics, contenders, events)
</context>

<batch_0_setup>
## Batch 0: Frontend Testing Infrastructure Setup (MUST run first, single agent)

This batch sets up the testing infrastructure. Run this as a SINGLE Task agent before any test batches.

### Step 1: Install dependencies
```bash
cd frontend && npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### Step 2: Create `frontend/vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    root: './',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['node_modules', 'src/test/', 'src/**/*.d.ts', 'src/types/'],
    },
  },
});
```

### Step 3: Create `frontend/src/test/setup.ts`
```typescript
import '@testing-library/jest-dom';
```

### Step 4: Add test scripts to `frontend/package.json`
Add to the "scripts" section:
```json
"test": "vitest run",
"test:watch": "vitest"
```

### Step 5: Verify setup
```bash
cd frontend && npm test
```
Should show "no test files found" or similar — confirming vitest is configured correctly.

### Step 6: Commit setup
```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/test/setup.ts
```
Commit message: `test(frontend): add vitest + react testing library infrastructure`
</batch_0_setup>

<remaining_features>
Process these frontend features IN THIS ORDER (priority-first), 3 per batch:

**Batch 1 (P0/P1 — Services):**
1. **Cognito Service** — `frontend/src/services/cognito.ts` (~22 tests)
   - Test file: `frontend/src/services/__tests__/cognito.test.ts`
   - signIn/signUp/confirmSignUp/signOut, token management (sessionStorage), getUserGroups, isAuthenticated
   - Role helpers: hasRole hierarchy (Admin > Moderator > Wrestler > Fantasy), isAdmin, isWrestler
   - JWT helpers: decodeJwtPayload, getGroupsFromToken
   - refreshSession: fetchAuthSession with forceRefresh
   - Mock `aws-amplify/auth` (signIn, signUp, signOut, confirmSignUp, fetchAuthSession, getCurrentUser)
   - Mock `sessionStorage` (getItem, setItem, removeItem, clear)

2. **API Client Part 1** — `frontend/src/services/api.ts` (fetchWithAuth + first 8 domain APIs, ~35 tests)
   - Test file: `frontend/src/services/__tests__/api-core.test.ts` (fetchWithAuth + authApi + profileApi ~14 tests)
   - Test file: `frontend/src/services/__tests__/api-domains-1.test.ts` (playersApi, matchesApi, championshipsApi, tournamentsApi, standingsApi, seasonsApi, divisionsApi ~21 tests)
   - Mock `global.fetch` with `vi.fn()` — return `Response`-like objects
   - Mock `sessionStorage` for token retrieval
   - Verify correct URL construction, HTTP methods, headers, body serialization
   - Test fetchWithAuth: adds Bearer token when present, omits when absent, handles 204 no-content, throws on non-ok, passes AbortSignal

3. **API Client Part 2** — `frontend/src/services/api.ts` (remaining domain APIs, ~34 tests)
   - Test file: `frontend/src/services/__tests__/api-domains-2.test.ts` (eventsApi, contendersApi, usersApi, siteConfigApi, statisticsApi ~18 tests)
   - Test file: `frontend/src/services/__tests__/api-domains-3.test.ts` (fantasyApi, challengesApi, promosApi, imagesApi ~16 tests)
   - Same mocking approach as Part 1
   - fantasyApi has 12 functions — test each one
   - imagesApi: test generateUploadUrl + uploadToS3 (PUT to presigned URL with binary body)

**Batch 2 (P0/P1 — Contexts + Auth Components + Utilities):**
4. **Contexts** — `frontend/src/contexts/` (~20 tests)
   - Test file: `frontend/src/contexts/__tests__/AuthContext.test.tsx`
   - Test file: `frontend/src/contexts/__tests__/SiteConfigContext.test.tsx`
   - AuthContext: initializes on mount, fetches current user, sets isAuthenticated, extracts groups, fetches player profile for Wrestlers
   - AuthContext role helpers: isAdmin/isSuperAdmin/isModerator/isWrestler/isFantasy, hasRole hierarchy
   - AuthContext sign in/out: updates state, clears state, refreshProfile
   - AuthContext cleanup: mounted flag, no state update after unmount
   - SiteConfigContext: fetches config on mount, provides features via useSiteConfig(), defaults enabled on error, refreshConfig, cleanup
   - Wrap components in providers using `renderHook` from @testing-library/react
   - Mock `../services/cognito` and `../services/api`

5. **Auth Components** — `frontend/src/components/auth/` + route guards (~17 tests)
   - Test file: `frontend/src/components/auth/__tests__/Login.test.tsx`
   - Test file: `frontend/src/components/auth/__tests__/Signup.test.tsx`
   - Test file: `frontend/src/components/__tests__/ProtectedRoute.test.tsx`
   - Test file: `frontend/src/components/__tests__/FeatureRoute.test.tsx`
   - Login: renders form, shows loading on submit, displays error on failed login, calls signIn, navigates on success
   - Signup: renders form, validates fields, calls signUp, confirmation code flow, shows errors
   - ProtectedRoute (P0): renders children when authenticated with correct role, redirects when not authenticated, access denied for wrong role, loading during auth check
   - FeatureRoute (P0): renders children when feature enabled, redirects when disabled, loading during config fetch
   - Mock AuthContext + SiteConfigContext + react-router-dom (useNavigate, Navigate)

6. **Frontend Utilities** — `frontend/src/utils/` (~23 tests)
   - Test file: `frontend/src/utils/__tests__/dateUtils.test.ts`
   - Test file: `frontend/src/utils/__tests__/sanitize.test.ts`
   - Test file: `frontend/src/utils/__tests__/logger.test.ts`
   - dateUtils: formatDate, formatDateTime, formatTime, formatRelativeTime with valid/invalid/edge cases
   - sanitize: sanitizeInput (trim, length, angle brackets), sanitizeName (Unicode), sanitizeDescription, isValidInput, meetsMinLength
   - logger: dev mode logs info/warn/debug; production only logs error (sanitized)
   - Pure function tests — no React rendering needed, straightforward vi.fn() mocks for console

**Batch 3 (P1 — Core Feature Components):**
7. **Match Components** — `frontend/src/components/` (~14 tests)
   - Test file: `frontend/src/components/__tests__/Matches.test.tsx`
   - Test file: `frontend/src/components/admin/__tests__/ScheduleMatch.test.tsx`
   - Test file: `frontend/src/components/admin/__tests__/RecordResult.test.tsx`
   - Matches: renders match list, shows scheduled vs completed, displays participant names
   - ScheduleMatch: renders form with match type/participants/options, loads players/championships/tournaments/seasons/events, tag team mode, submit, validation
   - RecordResult: lists scheduled matches, filters by event, selects winners, submits result, loading/error/success

8. **Championship + Tournament Components** — (~17 tests)
   - Test file: `frontend/src/components/__tests__/Championships.test.tsx`
   - Test file: `frontend/src/components/admin/__tests__/ManageChampionships.test.tsx`
   - Test file: `frontend/src/components/__tests__/Tournaments.test.tsx`
   - Test file: `frontend/src/components/admin/__tests__/CreateTournament.test.tsx`
   - Championships: renders list with current holders, empty state
   - ManageChampionships: create/edit/delete, image upload, vacate title, current champion, division assignment
   - Tournaments: renders list, bracket view for single-elimination, standings for round-robin
   - CreateTournament: creates with type/participants, validates min participants

9. **Admin Management Components** — (~15 tests)
   - Test file: `frontend/src/components/admin/__tests__/ManagePlayers.test.tsx`
   - Test file: `frontend/src/components/admin/__tests__/ManageUsers.test.tsx`
   - ManagePlayers: renders list, add form, creates/edits/deletes player, image upload (presigned URL + S3), loading/error/success
   - ManageUsers: renders list with filters, approve wrestler requests, promote/demote, enable/disable, assign divisions, SuperAdmin-only actions

**Batch 4 (P1/P2 — Feature Components):**
10. **Fantasy Components** — (~19 tests)
    - Test file: `frontend/src/components/fantasy/__tests__/FantasyDashboard.test.tsx`
    - Test file: `frontend/src/components/fantasy/__tests__/MakePicks.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/FantasyConfig.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/ManageFantasyShows.test.tsx`
    - FantasyDashboard: upcoming show card, current picks preview, stats + recent results, auto-scores on mount, loading
    - MakePicks: division-based picker, budget constraint, picks-per-division limit, submit/clear picks, wrestler costs
    - FantasyConfig: renders all 14 config fields, tracks unsaved changes, saves/resets, conditional cost fluctuation fields
    - ManageFantasyShows: configures fantasy picks for events, locks/unlocks events

11. **Events + Seasons Components** — (~16 tests)
    - Test file: `frontend/src/components/events/__tests__/EventsCalendar.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/CreateEvent.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/MatchCardBuilder.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/ManageSeasons.test.tsx`
    - EventsCalendar: calendar grid with event dots, navigates months, filters by type, upcoming events, empty state
    - CreateEvent: form fields, season selection, theme color picker, validates required fields
    - MatchCardBuilder: builds event match cards, reorders matches, links to schedule match
    - ManageSeasons: create/edit/delete seasons, end active season, shows status

12. **Challenge + Promo Components** — (~29 tests)
    - Test file: `frontend/src/components/challenges/__tests__/ChallengeBoard.test.tsx`
    - Test file: `frontend/src/components/challenges/__tests__/IssueChallenge.test.tsx`
    - Test file: `frontend/src/components/challenges/__tests__/ChallengeDetail.test.tsx`
    - Test file: `frontend/src/components/challenges/__tests__/MyChallenges.test.tsx`
    - Test file: `frontend/src/components/promos/__tests__/PromoFeed.test.tsx`
    - Test file: `frontend/src/components/promos/__tests__/PromoEditor.test.tsx`
    - Test file: `frontend/src/components/promos/__tests__/PromoCard.test.tsx`
    - Test file: `frontend/src/components/promos/__tests__/PromoReactions.test.tsx`
    - Challenge components: board with filters, issue form, detail view with respond/cancel, my challenges with actions
    - Promo components: feed with type filters + pinned, editor with type/content/target, card with reactions, reaction buttons
    - Also test `frontend/src/components/challenges/challengeUtils.ts` (~3 tests)

**Batch 5 (P2/P3 — Remaining Components):**
13. **Statistics + Contenders + Standings Components** — (~22 tests)
    - Test file: `frontend/src/components/statistics/__tests__/PlayerStats.test.tsx`
    - Test file: `frontend/src/components/statistics/__tests__/HeadToHeadComparison.test.tsx`
    - Test file: `frontend/src/components/statistics/__tests__/Leaderboards.test.tsx`
    - Test file: `frontend/src/components/statistics/__tests__/RecordBook.test.tsx`
    - Test file: `frontend/src/components/statistics/__tests__/Achievements.test.tsx`
    - Test file: `frontend/src/components/contenders/__tests__/ContenderRankings.test.tsx`
    - Test file: `frontend/src/components/__tests__/Standings.test.tsx`

14. **Navigation/Layout + Admin Utilities Components** — (~21 tests)
    - Test file: `frontend/src/components/__tests__/Sidebar.test.tsx`
    - Test file: `frontend/src/components/__tests__/TopBar.test.tsx`
    - Test file: `frontend/src/components/__tests__/ErrorBoundary.test.tsx`
    - Test file: `frontend/src/components/__tests__/App.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/AdminPanel.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/ManageFeatures.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/ManageDivisions.test.tsx`
    - Sidebar: nav links, admin section for admins, feature-flag gating, expand/collapse, mobile toggle, logout, role-based sections
    - App: renders with providers, public routes accessible, protected routes redirect, feature-gated routes redirect

15. **Low Priority Components** — (~10 tests)
    - Test file: `frontend/src/components/admin/__tests__/ClearAllData.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/AdminGuide.test.tsx`
    - Test file: `frontend/src/components/__tests__/UserGuide.test.tsx`
    - Test file: `frontend/src/components/__tests__/LanguageSwitcher.test.tsx`
    - Test file: `frontend/src/components/admin/__tests__/SearchableSelect.test.tsx`
    - Test file: `frontend/src/components/fantasy/__tests__/FantasySecondary.test.tsx` (FantasyLeaderboard, WrestlerCosts, ShowResults, BudgetTracker ~13 tests)
</remaining_features>

<test_patterns>
## Frontend Test Patterns (follow these exactly)

### Service/Utility Tests (no React rendering)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies at top level
vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  // ...
}));

describe('moduleName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe('functionName', () => {
    it('should do expected behavior', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### API Client Tests (mock global.fetch)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sessionStorage for auth token
const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { store[key] = val; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionStorage.clear();
    mockFetch.mockReset();
  });

  it('fetchWithAuth adds Authorization header when token exists', async () => {
    mockSessionStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'test' }),
      status: 200,
    });
    // Call the API function and verify fetch was called with correct args
  });
});
```

### Component Tests (React Testing Library)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import ComponentName from '../ComponentName';

// Mock API service
vi.mock('../../../services/api', () => ({
  someApi: {
    getAll: vi.fn(),
    create: vi.fn(),
  },
}));

// Mock AuthContext
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    isAdmin: () => true,
    isModerator: () => false,
    isWrestler: () => false,
    user: { username: 'testuser', groups: ['Admin'] },
  })),
}));

// Mock SiteConfigContext
vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: vi.fn(() => ({
    features: { challenges: true, promos: true, fantasy: true, statistics: true, contenders: true },
    loading: false,
  })),
}));

// Helper to render with Router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('ComponentName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component', async () => {
    renderWithRouter(<ComponentName />);
    await waitFor(() => {
      expect(screen.getByText('Expected Text')).toBeInTheDocument();
    });
  });
});
```

### Context Tests (renderHook)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

vi.mock('../../services/cognito', () => ({
  getCurrentUser: vi.fn(),
  getAccessToken: vi.fn(),
  getUserGroups: vi.fn(),
  // ...
}));

vi.mock('../../services/api', () => ({
  profileApi: {
    getMyProfile: vi.fn(),
  },
}));

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes as not authenticated', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });
    // Wait for initialization to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.isAuthenticated).toBe(false);
  });
});
```

### Key Mocking Guidelines
- **API calls**: Mock the imported API objects (`playersApi`, `matchesApi`, etc.) from `../../services/api`
- **Auth state**: Mock `useAuth()` from `../../contexts/AuthContext` to control auth state per test
- **Feature flags**: Mock `useSiteConfig()` from `../../contexts/SiteConfigContext`
- **Router**: Wrap components in `<BrowserRouter>` or mock `useNavigate`, `useParams`, `useLocation`
- **User interactions**: Use `@testing-library/user-event` (not fireEvent) for realistic user simulation
- **Async operations**: Use `waitFor` or `findBy*` queries for async state updates
- **CSS imports**: vitest.config.ts has `css: false` — CSS imports are automatically ignored
- **import.meta.env**: Mock via `vi.stubEnv()` or define in vitest config's `define` option
</test_patterns>

<workflow>
For EACH batch, follow this exact process:

### Step 0 (Batch 0 only): Setup Infrastructure
Launch a SINGLE Task agent with `subagent_type: "test-engineer"` to set up frontend testing infrastructure as described in batch_0_setup. Wait for completion and verify `cd frontend && npm test` runs without errors before proceeding.

### Step 1: Launch 3 parallel test-engineer agents via Task tool
For each feature in the batch, launch a Task with `subagent_type: "test-engineer"`:

```
Task prompt for each feature:
"Write frontend tests for the {FEATURE} in League SZN.

READ THESE FILES FIRST:
1. The source files being tested — understand every code path, prop, state variable, and effect
2. The vitest setup at frontend/vitest.config.ts and frontend/src/test/setup.ts
3. The TEST-PLAN.md section for this feature — implement every checkbox item listed
4. For components: also read the AuthContext.tsx, SiteConfigContext.tsx, and api.ts to understand what to mock

TEST FILE LOCATIONS:
- Service tests: frontend/src/services/__tests__/{name}.test.ts
- Context tests: frontend/src/contexts/__tests__/{name}.test.tsx
- Utility tests: frontend/src/utils/__tests__/{name}.test.ts
- Component tests: frontend/src/components/{domain}/__tests__/{name}.test.tsx
  (or frontend/src/components/__tests__/{name}.test.tsx for top-level components)

PATTERNS TO FOLLOW:
- Use vi.mock() for all external dependencies (api services, contexts, router, aws-amplify)
- Mock useAuth() to control auth state (isAuthenticated, isAdmin, user, groups)
- Mock useSiteConfig() to control feature flags
- Wrap components in <BrowserRouter> for router-dependent components
- Use @testing-library/user-event for user interactions (click, type, etc.)
- Use screen.getByRole, screen.getByText, screen.findByText for queries (prefer accessible queries)
- Use waitFor() for async state updates after API calls
- beforeEach(() => vi.clearAllMocks())
- Use describe blocks per component/function, nested describe for logical groups
- Test: renders correctly, user interactions, API calls, loading states, error states, empty states, auth/role gating

IMPORTANT:
- Read ALL source code before writing tests — don't guess at behavior
- Cover every meaningful code branch visible in the source
- Do NOT modify any source files — only create test files
- Keep test files under 300 lines. If more tests are needed, split into multiple test files
- Make sure all imports use correct relative paths
- Do NOT install any packages — all dependencies are already installed
- For component tests, if a component imports CSS, vitest handles it (css: false in config)"
```

Launch all 3 Task agents in a SINGLE message (parallel execution).

### Step 2: Verify tests pass
After all 3 agents complete, run:
```bash
cd frontend && npm test
```

If any tests FAIL:
- Read the error output carefully
- Fix the failing tests (do NOT modify source code, only test files)
- Re-run until all pass
- If a test is genuinely wrong about expected behavior, re-read the source to understand the actual behavior

### Step 3: Update TEST-PLAN.md
For each completed feature, update the checkboxes:
- Change `- [ ]` to `- [x]` for every frontend test item in that feature section
- Add ` ✅ \`{test-file-path}\`` after each checked item
- Update the "Frontend tests remaining: X" count to reflect completed items
- Update the Summary table counts if applicable

### Step 4: Commit using git-commit-helper skill
After updating TEST-PLAN.md, stage and commit:
- Stage test files and TEST-PLAN.md
- Use the `/commit` skill to generate a conventional commit message
- Commit message format: `test(frontend): add {category} tests for {feature1}, {feature2}, {feature3} ({N} tests)`

### Step 5: Repeat for next batch
Move to the next batch and repeat Steps 1-4.
</workflow>

<constraints>
- NEVER modify frontend source files — only create/modify test files
- NEVER skip reading source files before writing tests
- Each test file must be under 300 lines — split large features into multiple test files
- Always run tests and verify they pass BEFORE committing
- Always update TEST-PLAN.md BEFORE committing
- Follow established mock patterns exactly — mock api services, contexts, router
- Do NOT install additional packages beyond Batch 0 — vitest + testing-library + jsdom + user-event are sufficient
- Do NOT create or modify vitest config after Batch 0
- Do NOT use `fireEvent` — use `@testing-library/user-event` for all user interactions
- Use accessible queries (getByRole, getByLabelText) over getByTestId where possible
- For components that call APIs on mount, mock the API before render and use waitFor/findBy for assertions
- When testing contexts, use renderHook with the Provider as wrapper
- Do NOT use `act()` directly — prefer waitFor() which wraps act internally
</constraints>

<verification>
After ALL batches are complete:
1. Run full test suite: `cd frontend && npm test` — ALL tests must pass
2. Run with verbose output: `cd frontend && npx vitest run --reporter=verbose` — verify test count
3. Check TEST-PLAN.md — ALL frontend test items should be checked off
4. Run `git log --oneline -15` — verify commit history shows setup + all batch commits
5. Count total frontend tests — should be ~280+ across services, contexts, utilities, and components
6. Run backend tests too to confirm nothing broken: `cd backend && npm test`
</verification>

<success_criteria>
- Frontend testing infrastructure is set up (vitest + RTL + jsdom)
- All frontend service tests pass (cognito.ts, api.ts — ~91 tests)
- All frontend context tests pass (AuthContext, SiteConfigContext — ~20 tests)
- All frontend utility tests pass (dateUtils, sanitize, logger — ~23 tests)
- All frontend component tests pass (~170+ tests across all domains)
- TEST-PLAN.md is fully updated with all frontend checkboxes checked
- 6 clean commits in git history (1 setup + 5 batch commits)
- Zero test failures when running `npm test`
- Test patterns are consistent across all test files
- Backend tests still pass (no regressions)
</success_criteria>
