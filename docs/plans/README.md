# Execution plans

Plans are written with unique names in this directory (e.g. `plan-issue-150-wiki-admin-guide.md`), per CLAUDE.md.

- **newIssue**: Creates a GitHub issue and a plan file `docs/plans/plan-issue-<number>-<slug>.md` with skills, agents, and parallel work. Then commit, push, and open a PR for the plan.
- **doIssue**: Takes an issue number, fetches the issue from GitHub, creates a branch and plan file, **executes** the plan with parallel agents (execute-plan), then commit, push, and open a PR for the implementation.
- **execute-plan**: Runs a plan by executing implementation steps in waves (parallel agents where the plan allows). Use after newIssue to implement, or as the execution phase inside doIssue.

Edit the plan file as needed, then run the execute-plan command to implement. Or run **doIssue &lt;number&gt;** to do an existing issue end-to-end.
