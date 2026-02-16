---
description: Execute a plan from a markdown file by launching parallel agents, then verify and commit
---
Execute a plan from a markdown file by launching parallel agents, then verify and commit.

## Arguments

The user provides a plan filename (partial or full) as: `$ARGUMENTS`

## Step 1: Find the plan file

Search the project for a markdown file matching the provided filename:
- Check exact path first (e.g., `plan.md`, `docs/my-plan.md`)
- If not found, search `*.md` files in the project root, `docs/`, and `prompts/` directories for a filename containing the argument (case-insensitive)
- The file MUST contain an `## Implementation Steps` section to be a valid plan

If no match is found, list all `.md` files that contain `## Implementation Steps` and ask the user to clarify.

If multiple matches are found, list them and ask the user to clarify.

## Step 2: Parse the plan

Read the plan file and extract:

1. **Title**: The `# Plan:` heading
2. **Files to Modify**: The table under `## Files to Modify`
3. **Implementation Steps**: All `### Step N:` sections under `## Implementation Steps`
4. **Dependencies & Order**: The `## Dependencies & Order` section — pay close attention to the **Suggested order** line (e.g., `Steps 1+5+7 -> Step 2 -> Steps 3+4 -> ...`)
5. **Testing & Verification**: The `## Testing & Verification` section

## Step 3: Build the execution schedule

Using the **Dependencies & Order** section, organize steps into sequential **waves** of parallel work:

- Each wave contains steps that can run concurrently (indicated by `+` in the suggested order)
- Steps separated by `->` must run in sequential waves
- **Maximum 5 agents per wave** — if a wave has more than 5 steps, split into sub-waves

Example: If the suggested order is `Steps 1+5+7 -> Step 2 -> Steps 3+4 -> Step 6 -> Step 8`

This becomes:
- **Wave 1** (parallel): Steps 1, 5, 7
- **Wave 2** (sequential): Step 2
- **Wave 3** (parallel): Steps 3, 4
- **Wave 4** (sequential): Step 6
- **Wave 5** (sequential): Step 8

Present the execution schedule to the user and wait for confirmation before proceeding.

## Step 4: Execute each wave

For each wave, launch up to 5 Task agents in parallel. Choose the best agent type for each step:

### Agent type selection rules:

| Step involves | Agent type | When to use |
|---|---|---|
| Backend Lambda handlers, DynamoDB, serverless.yml | `general-purpose` | Any backend code changes |
| React components, hooks, contexts, CSS | `general-purpose` | Any frontend code changes |
| Test files only | `test-engineer` | Writing or updating test files |
| Refactoring / code restructuring | `refactor-expert` | Steps explicitly about refactoring |
| i18n, config files, simple text changes | `general-purpose` with model `haiku` | Trivial changes like locale files, config |
| Security-related changes | `security-auditor` | Auth, permissions, token handling |

### Agent prompt template:

Each agent MUST receive a prompt containing:
1. **The full step description** copied from the plan (the `### Step N:` content)
2. **The files to modify** relevant to that step (from the Files to Modify table)
3. **Context**: The plan's Context section so the agent understands the bigger picture
4. **Instruction to write code**: Explicitly tell the agent to implement the changes described
5. **Codebase conventions**: Remind the agent — TypeScript, no `any`, follow existing patterns, use i18n for user-facing strings, use existing shared utilities

### Between waves:

After each wave completes, briefly review the results:
- Confirm all agents reported success
- If any agent failed or reported issues, pause and inform the user before continuing
- Do NOT proceed to the next wave if a previous wave had failures

## Step 5: Run verification

After ALL waves complete successfully, invoke the `/verify` workflow to:
1. Run frontend lint + tests
2. Run backend lint + tests
3. Report pass/fail results

If verification fails:
- Report the specific failures clearly
- Attempt to fix lint errors and failing tests (up to 2 fix attempts)
- Re-run verification after each fix attempt
- If still failing after 2 attempts, stop and report to the user

## Step 6: Commit and push

If verification passes (all lint clean, all tests pass), invoke the `/commit` workflow to:
1. Stage all changed files
2. Create a conventional commit based on the plan title and changes
3. Push to the current branch

## Important Rules

- **Always confirm the execution schedule** with the user before launching agents (Step 3)
- **Never skip verification** — always run /verify before committing
- **Fail fast** — if a wave fails, do not continue to the next wave
- **Be transparent** — show the user which agents are running and what they're doing
- **Respect dependencies** — never run a step before its dependencies are complete
- **Max 5 parallel agents** — never exceed this limit per wave
- **Use the right agent** — match agent types to the work being done (see selection rules)
- **Include full context in agent prompts** — agents start fresh and need the plan context, file paths, and explicit instructions to write code
