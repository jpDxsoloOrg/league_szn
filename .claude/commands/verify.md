Run lint and unit tests for both frontend and backend. If everything passes, create a conventional commit.

## Step 1: Run all checks in parallel

Run these four commands in parallel:

1. Frontend ESLint: `cd /home/jpdev/source/league_szn/league_szn/frontend && npx eslint src/`
2. Frontend Vitest: `cd /home/jpdev/source/league_szn/league_szn/frontend && npx vitest run`
3. Backend ESLint: `cd /home/jpdev/source/league_szn/league_szn/backend && npx eslint functions/ lib/`
4. Backend Vitest: `cd /home/jpdev/source/league_szn/league_szn/backend && npx vitest run`

## Step 2: Report results

Summarize: frontend lint errors/warnings, frontend test pass/fail counts, backend lint errors/warnings, backend test pass/fail counts.

## Step 3: Commit if all passed

If ALL of the above passed with zero errors and zero test failures, invoke the `git-commit-helper` skill to create a conventional commit.

If any step failed, do NOT commit. Instead, report the failures clearly so they can be fixed.
