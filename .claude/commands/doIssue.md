Take an issue number, fetch the issue from GitHub, create a branch and an execution plan, run the plan with parallel agents, then commit, push, and open a PR.

## Arguments

The user provides a GitHub issue number as: `$ARGUMENTS`

Example: `doIssue 128` or `doIssue 152`

## Step 1: Get the issue from GitHub

Fetch the issue from **jpDxsolo/league_szn**:

- Use the GitHub MCP tool **issue_read** with `method: get`, `owner: jpDxsolo`, `repo: league_szn`, `issue_number: <from $ARGUMENTS>`.
- If the issue does not exist or is not accessible, report the error and stop.
- Note the **title** and **body** for the plan. Derive a **short-slug** from the title (kebab-case, e.g. "Add wiki and Help section" → `wiki-help-section`). Use this slug for the branch and plan filename.

## Step 2: Create the branch

Create a new branch **before** writing any files:

- Branch name: **feat/&lt;issue_number&gt;-&lt;short-slug&gt;** (e.g. `feat/128-wiki-help-section`). Use **fix/** if the issue is clearly a bug fix.
- Ensure the repo is on `main` (or default branch), then run: `git checkout -b feat/<issue_number>-<short-slug>` (or `fix/...`).
- If the branch already exists locally, check it out; if it exists remotely, fetch and check it out. The goal is to work on the branch that will hold the implementation.

## Step 3: Research and draft the plan

Using the issue title and body:

1. **Scope the work**: Identify which parts of the codebase are affected (frontend, backend, docs, tests).
2. **List relevant skills**: From the project's available skills, choose which apply and when (api-documenter, code-reviewer, dependency-auditor, git-commit-helper, readme-updater, secret-scanner, security-auditor, test-generator).
3. **Identify parallel work**: Group tasks that have no dependency on each other so they can run in parallel (e.g. `Steps 1+2 -> Step 3 -> Steps 4+5`).

## Step 4: Write the plan file

Create a single plan file with a **unique name**. Use the path **docs/plans/plan-issue-&lt;issue_number&gt;-&lt;short-slug&gt;.md**. If that path already exists, use a unique variant (e.g. append `-do` or a short suffix) and ensure the filename is not already in use under `docs/plans/`. The plan must match the structure required by the **execute-plan** command:

- **# Plan:** &lt;Short title from the issue&gt;
- **GitHub issue:** #&lt;number&gt; — [title](link)
- **Context** (brief summary)
- **Skills to use** (table: When | Skill | Purpose)
- **Agents and parallel work** (Suggested order with `+` and `->`; agent types per step)
- **Files to modify** (table: File | Action | Purpose)
- **Implementation steps** (numbered `### Step N:` with enough detail for an agent to implement)
- **Dependencies and order** (including **Suggested order** line for execute-plan waves)
- **Testing and verification**
- **Risks and edge cases**

Follow the same template and conventions as in **.claude/commands/newIssue.md** (Step 3b) so execute-plan can parse and run the plan.

## Step 5: Execute the plan

Execute the plan you just wrote by following the **execute-plan** command (**.claude/commands/execute-plan.md**):

1. **Find the plan file**: Use the path created in Step 4 (e.g. `docs/plans/plan-issue-128-wiki-help-section.md`).
2. **Parse the plan**: Extract Title, Files to Modify, Implementation Steps, Dependencies and order (or "Dependencies & Order"), Testing and verification.
3. **Build the execution schedule**: Turn the suggested order into waves of parallel work (max 5 agents per wave). Present the schedule to the user and proceed (or wait for explicit "go" if you prefer to confirm).
4. **Execute each wave**: For each wave, run the steps in parallel using the agent type rules from execute-plan. Between waves, confirm success before continuing; if any step fails, pause and report.
5. **Run verification**: After all waves complete, run frontend and backend lint and tests (invoke the project’s verify step or equivalent). Fix lint/test failures up to a reasonable number of attempts (e.g. 2), then re-run verification.
6. **Commit and push**: If verification passes, stage all changes, create a conventional commit (use **git-commit-helper** skill when available), and push the current branch.

Do not create a PR in this step; Step 6 handles the PR.

## Step 6: Create the pull request

After the branch is pushed successfully:

- Use the GitHub MCP tool **create_pull_request**:
  - **owner**: `jpDxsolo`
  - **repo**: `league_szn`
  - **title**: Short summary referencing the issue (e.g. `Implements #128 — Add wiki and Help section`)
  - **head**: The branch you pushed (e.g. `feat/128-wiki-help-section`)
  - **base**: `main`
  - **body**: Brief description of what was implemented and link to the issue (e.g. `Closes #128. Implements [issue title].`).

## Step 7: Report back

Tell the user:

1. **Issue**: Link to the issue (e.g. `https://github.com/jpDxsolo/league_szn/issues/<number>`).
2. **Plan**: Path to the plan file.
3. **Branch**: Name of the branch.
4. **PR**: Link to the new pull request.
5. **Summary**: What was implemented (brief).

## Important rules

- **Branch before plan**: Create the branch (Step 2) before writing the plan file (Step 4).
- **Plan format**: Use the same structure as newIssue/execute-plan (Implementation steps, Files to modify, Dependencies and order, Suggested order) so execute-plan can run it.
- **Unique plan name**: Use `docs/plans/plan-issue-<number>-<slug>.md`; if that file already exists, use a unique variant so you do not overwrite an unrelated plan.
- **Owner/repo**: Use `owner: jpDxsolo`, `repo: league_szn` for all GitHub MCP calls.
- **Execute-plan rules**: When running Step 5, follow execute-plan’s rules (max 5 agents per wave, fail fast, verify before commit, use git-commit-helper for the final commit when available).
