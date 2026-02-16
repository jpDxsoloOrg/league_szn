---
description: Run backend lint and unit tests in parallel
---
Run backend lint and unit tests in parallel.

// turbo-all
1. Run ESLint: `cd /home/jpdev/source/league_szn/league_szn/backend && npx eslint functions/ lib/`
2. Run Vitest: `cd /home/jpdev/source/league_szn/league_szn/backend && npx vitest run`

Run both commands in parallel. Report a summary of results: lint errors/warnings and test pass/fail counts.

## Step 3: Commit if all passed

If ALL of the above passed with zero errors and zero test failures, invoke the `/commit` workflow to create a conventional commit.

If any step failed, do NOT commit. Instead, report the failures clearly so they can be fixed.
