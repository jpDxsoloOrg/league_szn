---
description: Take an issue number, fetch issue from GitHub, create branch and plan, execute plan with parallel agents, then commit, push, and open a PR
---
Take an issue number, fetch the issue from GitHub, create a branch and an execution plan, run the plan with parallel agents, then commit, push, and open a PR.

## Arguments

The user provides a GitHub issue number as: `$ARGUMENTS`

Example: `doIssue 128` or `doIssue 152`

## Step 1: Get the issue from GitHub

Fetch the issue from **jpDxsolo/league_szn** using the GitHub MCP tool **issue_read** with `method: get`, `owner: jpDxsolo`, `repo: league_szn`, `issue_number: <from $ARGUMENTS>`.

If the issue does not exist or is not accessible, report the error and stop. From the issue, note **title** and **body**. Derive a **short-slug** from the title (kebab-case) for use in branch and plan filename.

## Step 2: Create the branch

Create a new branch **before** writing any files: **feat/<issue_number>-<short-slug>** (or **fix/** for bug fixes). Run `git checkout -b feat/<issue_number>-<short-slug>`. If the branch already exists, check it out.

## Step 3: Research and draft the plan

Using the issue title and body: scope the work, list relevant skills (api-documenter, code-reviewer, dependency-auditor, git-commit-helper, readme-updater, secret-scanner, security-auditor, test-generator), and identify parallel work (e.g. `Steps 1+2 -> Step 3`).

## Step 4: Write the plan file

Create **docs/plans/plan-issue-<issue_number>-<short-slug>.md** with a unique name (use a variant suffix if that path already exists). Use the same structure as newIssue so **execute-plan** can parse and run it:

- Plan title, GitHub issue link, Context, Skills to use, Agents and parallel work, Files to modify, Implementation steps, Dependencies and order (with **Suggested order**), Testing and verification, Risks and edge cases.

## Step 5: Execute the plan

Follow **.claude/commands/execute-plan.md** (or **.agent/workflows/execute-plan.md**):

1. Find the plan file (path from Step 4).
2. Parse the plan (title, files to modify, implementation steps, dependencies and order, testing).
3. Build the execution schedule (waves of parallel work, max 5 agents per wave). Present the schedule and proceed.
4. Execute each wave with the appropriate agent types; do not proceed to the next wave if one fails.
5. Run verification (frontend and backend lint + tests); fix and re-run up to a reasonable number of attempts.
6. Commit (use git-commit-helper when available) and push. Do **not** create the PR in this step.

## Step 6: Create the pull request

After push, use the GitHub MCP tool **create_pull_request** with owner `jpDxsolo`, repo `league_szn`, head = current branch, base `main`, title and body referencing the issue (e.g. "Closes #128").

## Step 7: Report back

Report: issue link, plan path, branch name, PR link, and a brief summary of what was implemented.

## Important rules

- Create the branch before writing the plan file.
- Plan file must use the structure required by execute-plan (Implementation steps, Dependencies and order, Suggested order).
- Use a unique plan filename; if plan-issue-<number>-<slug>.md exists, use a variant.
- Use `jpDxsolo` / `league_szn` for all GitHub MCP calls.
- When executing the plan, follow execute-plan rules (max 5 agents per wave, verify before commit, fail fast).
