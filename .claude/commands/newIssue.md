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

## Step 3: Write plan.md

Create a single plan file at **docs/plans/plan.md** (overwriting any existing plan there) with this structure so it works with the **execute-plan** command and with skills/agents:

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

## Step 4: Report back

Tell the user:

1. **Issue**: Link to the new issue (e.g. `https://github.com/jpDxsolo/league_szn/issues/<number>`).
2. **Plan**: Path to the plan file (`docs/plans/plan.md`).
3. **Next step**: "Run the **execute-plan** command with this plan to implement it with parallel agents, or edit `docs/plans/plan.md` first and then run execute-plan."

## Important rules

- **Always create both** the GitHub issue and the plan file.
- **Owner/repo**: Use `owner: jpDxsolo`, `repo: league_szn` for all GitHub MCP calls.
- **Plan format**: Keep "Implementation steps", "Files to modify", "Dependencies and order", and "Suggested order" so execute-plan and agents can use it.
- **Skills and agents**: Only recommend skills and agent types that fit the request; use parallel work (e.g. `Steps 1+2 -> Step 3`) where steps are independent.
