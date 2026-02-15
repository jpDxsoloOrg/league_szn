# Execution plans

Plans created by the **newIssue** command are written with unique names in this directory (e.g. `plan-issue-150-wiki-admin-guide.md`), per CLAUDE.md.

- **newIssue**: Creates a GitHub issue and a plan file `docs/plans/plan-issue-<number>-<slug>.md` with skills, agents, and parallel work.
- **execute-plan**: Runs a plan by executing implementation steps in waves (parallel agents where the plan allows).

Edit the plan file as needed, then run the execute-plan command to implement.
