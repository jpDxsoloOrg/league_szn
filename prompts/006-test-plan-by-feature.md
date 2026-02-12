<objective>
Create a comprehensive test TODO list organized by feature for the League SZN codebase.
This is a PLANNING phase only — do NOT write any test code. The output is a structured
TODO document that other agents (test-engineer, backend-api-architect, frontend-code-reviewer)
will follow later to implement the actual tests.
</objective>

<context>
League SZN is a WWE 2K League Management System — full-stack serverless monorepo.
- **Frontend**: React 18 + TypeScript + Vite at `./frontend/src/`
- **Backend**: Serverless Framework + Node.js 24.x + DynamoDB at `./backend/`
- **E2E tests exist**: Playwright at `./e2e/tests/` (public + admin + integration)
- **No unit tests exist yet** — zero `.test.ts` or `.spec.ts` files outside e2e and node_modules
- **No test framework configured** in frontend or backend package.json yet

Key architecture:
- All API calls go through `fetchWithAuth` in `./frontend/src/services/api.ts` (~659 lines)
- Auth via Cognito: `./frontend/src/services/cognito.ts` (~348 lines)
- Role hierarchy: Fantasy < Wrestler < Moderator < Admin
- Feature flags via SiteConfigContext
- DynamoDB single-table with `dynamoDb` wrapper in `./backend/lib/dynamodb.ts`
- Lambda handlers use `./backend/lib/response.ts` helpers
- `recordResult.ts` is the most complex handler (~695 lines) with cascading multi-table updates
</context>

<research>
Use parallel agents to explore the codebase simultaneously. Launch these as parallel Task agents:

**Agent 1 — Backend Feature Inventory** (Explore agent):
Examine every handler in `./backend/functions/` across all 17 domains:
admin, auth, challenges, championships, contenders, divisions, events, fantasy,
images, matches, players, promos, seasons, standings, statistics, tournaments, users.
For each handler, note: exported function signature, what DynamoDB operations it performs,
what validation/auth it requires, edge cases visible in the code.

**Agent 2 — Frontend Component Inventory** (Explore agent):
Examine all components in `./frontend/src/components/` (including subdirectories:
admin, auth, challenges, contenders, events, fantasy, promos, profile, statistics),
all contexts (`AuthContext.tsx`, `SiteConfigContext.tsx`), services (`api.ts`, `cognito.ts`),
and utility files in `./frontend/src/utils/`. For each, note: props/state, API calls made,
user interactions, conditional rendering logic.

**Agent 3 — Shared Libs & Infrastructure** (Explore agent):
Examine `./backend/lib/` files (auth.ts, dynamodb.ts, parseBody.ts, rankingCalculator.ts,
response.ts) and `./backend/serverless.yml` for IAM roles, environment variables, and
API Gateway configuration. These are foundational — many handlers depend on them.
</research>

<requirements>
After research completes, synthesize findings into a single TODO document organized by feature.

For EACH feature domain, create a section with:

1. **Backend Unit Tests** — what to test for each Lambda handler:
   - Happy path (valid input → expected DynamoDB operations + response)
   - Auth/role checks (unauthorized, wrong role, missing token)
   - Validation failures (missing fields, invalid data, bad JSON)
   - Edge cases specific to that handler (e.g., duplicate detection, not-found, race conditions)
   - For complex handlers like `recordResult.ts`, break into sub-sections by logical flow

2. **Frontend Component Tests** — what to test for each React component:
   - Rendering with various props/states (loading, error, empty, populated)
   - User interactions (clicks, form submissions, navigation)
   - API call mocking (success, failure, loading states)
   - Feature flag gating (components behind feature flags)
   - Auth-gated behavior (role-based UI differences)

3. **Frontend Service/Utility Tests** — what to test for shared code:
   - `api.ts`: each API function with mocked fetch (success, error, auth header inclusion)
   - `cognito.ts`: auth flows with mocked Cognito SDK
   - Utility functions: pure function input/output coverage

4. **Shared Library Tests** — what to test for backend libs:
   - `auth.ts`: token verification, role extraction, authorization checks
   - `dynamodb.ts`: wrapper operations with mocked DynamoDB client
   - `parseBody.ts`: JSON parsing, malformed input handling
   - `rankingCalculator.ts`: ranking algorithm correctness
   - `response.ts`: each helper returns correct status code and format

**Technology Recommendations** (include at top of TODO):
- Backend: Vitest (fast, ESM-native, works with Serverless/TypeScript)
- Frontend: Vitest + React Testing Library (standard for React 18 + Vite)
- Mocking: vitest built-in mocks for DynamoDB, fetch, Cognito SDK
- Note: Playwright e2e tests already exist — this plan covers unit + component tests only

**Priority Tiers** (tag each test group):
- P0 (Critical): Shared libs, auth, complex handlers (recordResult, submitPicks, calculateFantasyPoints)
- P1 (High): All remaining CRUD handlers, API service functions, core UI components
- P2 (Medium): UI components with simpler logic, utility functions
- P3 (Low): Static/presentational components, CSS-only components
</requirements>

<constraints>
- Do NOT write any test code — only create the TODO plan document
- Do NOT create test files, config files, or install any packages
- Each TODO item should be specific enough that a test-engineer agent can implement it
  without re-reading the source (include function names, expected behaviors, mock strategies)
- Group by feature domain, not by test type — each feature section has both backend + frontend
- Include file paths for every source file that needs tests
- Keep each TODO item to 1-2 lines — concise but actionable
- Estimate test count per section (e.g., "~8 tests") so we can gauge scope
</constraints>

<output>
Save the complete TODO document to: `./TEST-PLAN.md`

Structure:
```
# League SZN — Test Plan by Feature

## Technology Stack
[Recommendations]

## Priority Legend
[P0-P3 descriptions]

## Feature: [Domain Name]
### Backend Unit Tests
- [ ] P0: `handler.ts` — [specific test description] (~N tests)
### Frontend Component Tests
- [ ] P1: `Component.tsx` — [specific test description] (~N tests)
### Frontend Service Tests (if applicable)
- [ ] P1: `api.ts:functionName` — [specific test description] (~N tests)

[Repeat for all 17 backend domains + frontend-only features]

## Shared Libraries
### Backend Libs
- [ ] P0: `auth.ts` — ...
### Frontend Services
- [ ] P0: `cognito.ts` — ...

## Summary
- Total estimated tests: ~NNN
- P0: ~NN | P1: ~NN | P2: ~NN | P3: ~NN
```
</output>

<verification>
Before declaring complete, verify:
- Every handler in `./backend/functions/` is represented in the plan
- Every component directory in `./frontend/src/components/` is covered
- All shared libs (`./backend/lib/*.ts`) have test entries
- All frontend services (`api.ts`, `cognito.ts`) have test entries
- Priority tags are assigned to every item
- Estimated test counts are included for every section
- The document is actionable — another agent could pick up any section and start writing tests
</verification>

<success_criteria>
- Complete `./TEST-PLAN.md` covering all 17 backend domains + frontend components + shared libs
- Every TODO item is specific, actionable, and includes the source file path
- Priority tiers are consistently applied
- Test count estimates are reasonable and totaled in summary
- Technology recommendations are included
- No test code was written — plan only
</success_criteria>
