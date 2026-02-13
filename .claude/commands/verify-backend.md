Run backend lint and unit tests in parallel.

1. Run ESLint: `cd /home/jpdev/source/league_szn/league_szn/backend && npx eslint functions/ lib/`
2. Run Vitest: `cd /home/jpdev/source/league_szn/league_szn/backend && npx vitest run`

Run both commands in parallel. Report a summary of results: lint errors/warnings and test pass/fail counts.
