Create a GitHub issue and an execution plan for the user's request. The plan includes which skills and agents to use and how to run work in parallel.

## Arguments

The user provides the request as: `$ARGUMENTS`

Example: `newIssue Add dark mode toggle to settings` or `newIssue Support tag team matches in the frontend`

## Step 1: Create the GitHub issue

Create an issue in the repository **jpDxsolo/league_szn**:

- **Title**: Short, clear summary of the request (e.g. "Add dark mode toggle to settings").
- **Body**: Expand the user's request into a proper issue description:
  - **Summary**: What we want to achieve.
  - **Acceptance criteria** (bullets): What "done" looks like.
  - **Context**: Any relevant scope (e.g. frontend only, backend API, both).
  - **Notes**: Optional constraints, links, or follow-ups.

Use the GitHub MCP tool `issue_write` with `method: create`, `owner: jpDxsolo`, `repo: league_szn`.

After creating, note the **issue number** for the plan.

## Step 2: Research and draft the plan

Using the same request and the issue body:

1. **Scope the work**: Identify which parts of the codebase are affected (frontend, backend, docs, tests).
2. **List relevant skills**: From the project's available skills, choose which apply and when:
   - **api-documenter**: API or endpoint changes.
   - **code-reviewer**: After implementation or for refactors.
   - **dependency-auditor**: If adding or changing dependencies.
   - **git-commit-helper**: When committing the change.
   - **readme-updater**: If setup, structure, or features change.
   - **secret-scanner**: If touching auth, env, or credentials.
   - **security-auditor**: Auth, permissions, or security-sensitive code.
   - **test-generator**: New or changed behavior that needs tests.
3. **Identify parallel work**: Group tasks that have no dependency on each other (e.g. backend types + frontend types, or unrelated components) so they can be run in parallel by agents.

## Step 3: Create branch and write the plan file

### Step 3a: Create a new branch

Before writing any files, create a new branch so the plan is committed on a dedicated branch:

- Branch name: **feat/&lt;issue_number&gt;-&lt;short-slug&gt;** (e.g. `feat/152-wiki-german-raw-html`). Use **fix/** instead of **feat/** if the issue is clearly a bug fix.
- Use the same **short-slug** you will use for the plan filename (kebab-case from the issue title).
- Commands: `git checkout -b feat/<issue_number>-<short-slug>` (or `fix/...`).

### Step 3b: Write the plan file

Create a single plan file with a **unique name** that is not already in use (see CLAUDE.md). Use the path **docs/plans/plan-issue-&lt;issue_number&gt;-&lt;short-slug&gt;.md**, where &lt;short-slug&gt; is a kebab-case version of the issue title (e.g. "Add admin guide to help wiki" → `wiki-admin-guide`). Check existing files in `docs/plans/` to avoid duplicates. The plan must have this structure so it works with the **execute-plan** command and with skills/agents:

```markdown
# Plan: <Short title from the issue>

**GitHub issue:** #<issue_number> — [title](https://github.com/jpDxsolo/league_szn/issues/<issue_number>)

## Context

Brief summary of the request and why it matters. One or two sentences.

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review changed files |
| Before commit | git-commit-helper | Conventional commit message |
| If API changed | api-documenter | Update API docs |
| … | … | … |

Only include skills that actually apply to this request.

## Agents and parallel work

- **Suggested order**: List steps that can run in parallel with `+`, and order with `->`. Example: `Steps 1+2 -> Step 3 -> Steps 4+5`.
- **Agent types**: For each step or group, suggest agent type (e.g. `general-purpose`, `test-engineer`, `security-auditor`) per the execute-plan rules.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `path/to/file` | Modify / Create / Delete | What changes and why |

Include every file that likely needs changes; add "TBD" where discovery is needed.

## Implementation steps

Numbered steps with enough detail for an agent (or human) to implement without extra context. Each step should:
- Reference specific file paths (and line numbers if known).
- Say what to change and why.
- Follow existing project patterns (see CLAUDE.md).

Use subsections if helpful, e.g. `### Step 1: …`, `### Step 2: …`.

## Dependencies and order

- Which steps depend on others.
- **Suggested order**: Same as in "Agents and parallel work", e.g. `Steps 1+2 -> Step 3 -> Steps 4+5`.
- This format is used by execute-plan to build waves of parallel agents.

## Testing and verification

- What to test manually.
- What existing tests might be affected.
- What new tests to add (and consider using **test-generator** skill).

## Risks and edge cases

Backward compatibility, config/env, or edge cases to watch for.
```

## Step 4: Commit, push, and open a pull request

### Step 4a: Stage and commit using the commit skill

1. Stage the plan file: `git add docs/plans/plan-issue-<issue_number>-<short-slug>.md`.
2. **Use the git-commit-helper skill**: Read the skill at `~/.claude/skills/git-commit-helper/SKILL.md` (or the path from available skills). Follow its process:
   - Run `git diff --staged` to analyze the change.
   - Generate a conventional commit message (e.g. `docs: add plan for #<number> <short description>`). Prefer type `docs` and include the issue number in the body (e.g. `Closes #<number>` or in the subject).
   - Run `git commit -m "<generated message>"`.

### Step 4b: Push the branch and create a PR

1. Push the branch: `git push -u origin feat/<issue_number>-<short-slug>` (or `fix/...`).
2. Create a pull request using the GitHub MCP tool **create_pull_request**:
   - **owner** / **repo**: Same as in Step 1 (e.g. `jpDxsolo`, `league_szn` — or the actual repo owner if different).
   - **title**: Short summary referencing the issue (e.g. `Add plan for #152 — wiki German raw HTML fix`).
   - **head**: The branch you just pushed (e.g. `feat/152-wiki-german-raw-html`).
   - **base**: `main`.
   - **body**: Brief description and link to the issue (e.g. `Plan and branch for #152. Implements [issue link].`).

## Step 5: Report back

Tell the user:

1. **Issue**: Link to the new issue (e.g. `https://github.com/jpDxsolo/league_szn/issues/<number>`).
2. **Plan**: Path to the plan file (e.g. `docs/plans/plan-issue-<number>-<slug>.md`).
3. **Branch**: Name of the branch created (e.g. `feat/152-wiki-german-raw-html`).
4. **PR**: Link to the new pull request.
5. **Next step**: "Run the **execute-plan** command with this plan to implement it with parallel agents, or edit the plan file first and then run execute-plan."

## Important rules

- **Always create** the GitHub issue, then a **new branch**, then the plan file, then **commit** (using git-commit-helper), **push**, and **create a PR**.
- **Branch before file**: Create the branch (Step 3a) before writing the plan file (Step 3b).
- **Commit skill**: Use the git-commit-helper skill to generate the commit message before committing (Step 4a).
- **Plan filename**: Use a unique name per CLAUDE.md (e.g. `docs/plans/plan-issue-<number>-<slug>.md`). Do not overwrite an existing plan; pick a slug that is not already in use.
- **Owner/repo**: Use the same owner and repo for all GitHub MCP calls (issue, PR); e.g. `owner: jpDxsolo`, `repo: league_szn` (or the actual repo owner if different).
- **Plan format**: Keep "Implementation steps", "Files to modify", "Dependencies and order", and "Suggested order" so execute-plan and agents can use it.
- **Skills and agents**: Only recommend skills and agent types that fit the request; use parallel work (e.g. `Steps 1+2 -> Step 3`) where steps are independent.
