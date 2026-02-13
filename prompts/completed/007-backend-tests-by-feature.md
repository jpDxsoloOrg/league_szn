<objective>
Systematically implement ALL remaining backend unit tests from TEST-PLAN.md, feature by feature.
Process up to 3 features in parallel using Task tool with senior-backend subagents. After each batch
of 3 features completes and tests pass, update TEST-PLAN.md checkboxes and commit the changes.
Continue until all backend features have tests written and verified.
</objective>

<context>
League SZN is a WWE 2K League Management System — serverless monorepo.
- Backend: Serverless Framework + Node.js 24.x + DynamoDB at `./backend/`
- Test framework: Vitest (already configured at `backend/vitest.config.mts`)
- Run tests: `cd backend && npm test`
- Test plan: `./TEST-PLAN.md` — contains checkboxes for every test item

**Already completed (DO NOT redo):**
- Auth & Authorization backend (40 tests) — `lib/__tests__/auth.test.ts`, `functions/auth/__tests__/*.test.ts`
- Shared Backend Libraries (54 tests) — `lib/__tests__/response.test.ts`, `dynamodb.test.ts`, `parseBody.test.ts`, `rankingCalculator.test.ts`
- Players backend (28 tests) — `functions/players/__tests__/players.test.ts`

**Established test patterns** — follow these exactly:
- Test files go in `backend/functions/{domain}/__tests__/{domain}.test.ts`
- Use `vi.hoisted()` + `vi.mock()` for AWS SDK and shared lib mocks
- Mock `../../../lib/dynamodb` for DynamoDB operations
- Mock `../../../lib/auth` for auth context and role checks
- Mock `../../../lib/parseBody` for request body parsing
- Mock `../../../lib/response` for response helpers (import real implementations to verify status codes)
- Each test uses `beforeEach(() => vi.clearAllMocks())`
- Use `describe` blocks per handler function, nested `describe` for logical groups
- Reference `backend/functions/players/__tests__/players.test.ts` as the canonical example
</context>

<remaining_features>
Process these backend features IN THIS ORDER (priority-first):

**Batch 1 (P0 Critical):**
1. Matches — `backend/functions/matches/` — recordResult.ts (~29 tests), scheduleMatch.ts (~8 tests), getMatches.ts (~3 tests) — MOST COMPLEX
2. Statistics — `backend/functions/statistics/` — getStatistics.ts (~34 tests across 7 sections)
3. Contenders — `backend/functions/contenders/` — calculateRankings.ts (~6 tests), getContenders.ts (~5 tests)

**Batch 2 (P0/P1):**
4. Fantasy — `backend/functions/fantasy/` — 13 handlers (~55 tests) — LARGE
5. Users (Admin) — `backend/functions/users/` — listUsers.ts (~3), toggleUserEnabled.ts (~3), updateUserRole.ts (~8)
6. Championships — `backend/functions/championships/` — 6 handlers (~17 tests)

**Batch 3 (P1):**
7. Events — `backend/functions/events/` — 5 handlers (~19 tests)
8. Challenges — `backend/functions/challenges/` — 5 handlers (~23 tests)
9. Promos — `backend/functions/promos/` — 5 handlers (~22 tests)

**Batch 4 (P1):**
10. Divisions — `backend/functions/divisions/` — 4 handlers (~12 tests)
11. Seasons — `backend/functions/seasons/` — 4 handlers (~11 tests)
12. Tournaments — `backend/functions/tournaments/` — 3 handlers (~10 tests)

**Batch 5 (P1):**
13. Standings — `backend/functions/standings/` — getStandings.ts (~5 tests)
14. Admin Utilities — `backend/functions/admin/` — 4 handlers (~8 tests)
15. Images — `backend/functions/images/` — generateUploadUrl.ts (~6 tests)
</remaining_features>

<workflow>
For EACH batch, follow this exact process:

### Step 1: Launch 3 parallel senior-backend agents via Task tool
For each feature in the batch, launch a Task with `subagent_type: "backend-api-architect"`:

```
Task prompt for each feature:
"Write backend unit tests for the {FEATURE} feature in League SZN.

READ THESE FILES FIRST:
1. The handler source files in backend/functions/{domain}/*.ts — understand every code path
2. The existing test example at backend/functions/players/__tests__/players.test.ts — follow this exact pattern
3. The TEST-PLAN.md section for this feature — implement every checkbox item listed

TEST FILE LOCATION: backend/functions/{domain}/__tests__/{domain}.test.ts

PATTERNS TO FOLLOW:
- vi.hoisted() + vi.mock() for all mocks (dynamodb, auth, parseBody, response)
- Mock dynamodb operations: get, put, update, delete, query, scan, transactWrite, scanAll, queryAll
- Mock auth: getAuthContext returns {username, email, groups}, requireRole/requireSuperAdmin return null (pass) or 403 response (fail)
- Mock parseBody: return {statusCode, data} where statusCode is null on success
- Import real response functions to verify correct status codes in assertions
- beforeEach(() => vi.clearAllMocks())
- Test happy paths, validation failures, auth failures, not-found cases, edge cases
- Use descriptive test names that explain the expected behavior

IMPORTANT:
- Read ALL handler source code before writing tests — don't guess at behavior
- Cover every code branch visible in the source
- Do NOT modify any source files — only create test files
- Keep test files under 300 lines. If more are needed, split into multiple test files (e.g., recordResult.test.ts, scheduleMatch.test.ts)
- Make sure all imports are correct relative paths"
```

Launch all 3 Task agents in a SINGLE message (parallel execution).

### Step 2: Verify tests pass
After all 3 agents complete, run:
```bash
cd backend && npm test
```

If any tests FAIL:
- Read the error output carefully
- Fix the failing tests (do NOT modify source code, only test files)
- Re-run until all pass
- If a test is genuinely wrong about expected behavior, re-read the source to understand the actual behavior

### Step 3: Update TEST-PLAN.md
For each completed feature, update the checkboxes:
- Change `- [ ]` to `- [x]` for every backend test item in that feature section
- Add ` ✅ \`functions/{domain}/__tests__/{domain}.test.ts\`` after each checked item
- Update the "Backend tests written: X/Y ✅" count in the section
- Update the Summary table P0/P1/P2/P3 counts if applicable

### Step 4: Commit using git-commit-helper skill
After updating TEST-PLAN.md, stage and commit:
- Stage test files: `git add backend/functions/{domain1}/__tests__/ backend/functions/{domain2}/__tests__/ backend/functions/{domain3}/__tests__/ TEST-PLAN.md`
- Use the `/commit` skill (Skill tool with skill: "git-commit-helper") to generate a conventional commit message
- Commit message format: `test({domains}): add backend unit tests for {feature1}, {feature2}, {feature3} ({N} tests)`

### Step 5: Repeat for next batch
Move to the next batch and repeat Steps 1-4.
</workflow>

<constraints>
- NEVER modify backend source files — only create/modify test files
- NEVER skip reading source files before writing tests
- Each test file must be under 300 lines — split large features into multiple test files
- Always run tests and verify they pass BEFORE committing
- Always update TEST-PLAN.md BEFORE committing
- If a handler has complex logic (like recordResult.ts), split into multiple test files by logical section
- Follow established mock patterns exactly — reference players.test.ts
- Do NOT install new packages — vitest is already configured
- Do NOT create vitest config files — already exists at backend/vitest.config.mts
</constraints>

<verification>
After ALL batches are complete:
1. Run full test suite: `cd backend && npm test` — ALL tests must pass
2. Run with verbose output: `cd backend && npx vitest run --reporter=verbose` — verify test count
3. Check TEST-PLAN.md — ALL backend test items should be checked off
4. Run `git log --oneline -10` — verify commit history shows all batch commits
5. Count total backend tests — should be ~290+ (122 existing + ~170 new)
</verification>

<success_criteria>
- All 14 remaining backend features have passing unit tests
- TEST-PLAN.md is fully updated with all backend checkboxes checked
- 5 clean commits (one per batch) in git history
- Zero test failures when running `npm test`
- Test patterns are consistent across all feature test files
</success_criteria>
