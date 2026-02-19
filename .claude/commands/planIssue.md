Create an implementation plan for a GitHub issue, designed for a human coder. No code — just a clear, actionable plan as a markdown document.

## Arguments

The user provides a GitHub issue number as: `$ARGUMENTS`

Example: `planIssue 128` or `planIssue 205`

## Step 1: Fetch the issue from GitHub

Fetch the issue from **jpDxsolo/league_szn**:

- Run: `gh issue view <issue_number> --repo jpDxsolo/league_szn`
- If the issue does not exist or is not accessible, report the error and stop.
- Note the **title**, **body**, and **labels** for the plan.
- Derive a **short-slug** from the title (kebab-case, e.g. "Add wiki and Help section" → `wiki-help-section`).

## Step 2: Research the codebase

Thoroughly explore the codebase to understand what the issue requires:

1. **Identify affected areas**: Determine which parts of the codebase are affected (frontend, backend, infrastructure, docs, tests).
2. **Read relevant files**: Open and read every file that will likely need changes. Understand current implementations, types, patterns, imports, and conventions.
3. **Discover related files**: Look for files the issue didn't mention but that will need changes — types, barrel exports, route definitions, test files, translations, config files, etc.
4. **Check existing patterns**: Find how similar features or fixes were done elsewhere in the codebase to ensure consistency.
5. **Note dependencies**: Identify shared utilities, context providers, API endpoints, database tables, or other dependencies the implementation should use or modify.

Spend real effort here. The quality of the plan depends on understanding the code.

## Step 3: Write the plan file

Create the plan at **docs/plans/plan-issue-&lt;issue_number&gt;-&lt;short-slug&gt;.md**. If that path already exists, append a short suffix to make it unique (e.g. `-v2`). Check existing files in `docs/plans/` to avoid collisions.

The plan must follow this structure:

```markdown
# Plan: <Short title from the issue>

**GitHub issue:** #<issue_number> — [title](https://github.com/jpDxsolo/league_szn/issues/<issue_number>)

## Context

Brief summary of the problem, what needs to change, and why it matters. Two to four sentences.

## Files to modify

Every file that needs changes, including ones discovered during research. Order them by the sequence a human should work through them.

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `path/to/file` | Modify / Create / Delete | What changes and why |
| 2 | … | … | … |

## Order of operations

A numbered walkthrough of how a human coder should tackle this, from start to finish. Each step should:

- **Reference specific file paths** (and line numbers or function names when known).
- **Describe WHAT to change** in plain language — the logic, structure, or behavior to add/modify/remove.
- **Explain WHY** — how this step fits into the overall solution and what it enables.
- **Note patterns to follow** — point to existing code that serves as a good example for consistency.
- **Call out gotchas** — anything non-obvious the coder should watch out for in that step.

Group related changes together where it makes sense (e.g. "Update the type, then the API call, then the component that uses it"). Use sub-steps for complex operations.

### Step 1: <Title>

Detailed description…

### Step 2: <Title>

Detailed description…

(Continue for all steps…)

## Dependencies between steps

- Which steps must be done before others (e.g. "Step 1 must be done before Steps 2–4").
- Which steps are independent and could be done in any order.
- **Suggested order**: A concise summary like `Step 1 -> Steps 2+3 (parallel) -> Step 4 -> Steps 5+6 (parallel)`.

## Testing and verification

- What to test manually after each major step.
- What existing tests might break and how to fix them.
- What new tests should be written (describe intent, not code).
- How to verify the full feature works end-to-end.

## Risks and edge cases

- Backward-compatibility concerns.
- Edge cases to handle.
- Config or environment considerations.
- Anything that could go wrong during implementation.
```

## Important rules

- **Do NOT write any code.** No code snippets, no diffs, no implementation. Describe changes in plain language only.
- **Do NOT implement anything.** The output is only the plan markdown file.
- **Do NOT create a branch, commit, push, or open a PR.** This command only produces the plan document.
- **Be specific.** Reference exact file paths, line numbers, function names, type names, and translation keys discovered during research.
- **Be complete.** Include every file that needs to change, even ones the issue didn't mention.
- **Be practical.** Write for a human who will read this plan and implement it step by step. Avoid jargon-heavy abstractions — be clear and concrete.
- **Order matters.** The "Order of operations" section is the core value. Put real thought into the sequence — what needs to exist before other things can be built on top of it.
- **Unique filename.** Per CLAUDE.md, use a unique plan filename that is not already in use in `docs/plans/`.

## Step 4: Report back

Tell the user:

1. **Issue**: Link to the issue and a one-line summary.
2. **Plan**: Path to the plan file (e.g. `docs/plans/plan-issue-205-feature-slug.md`).
3. **Files affected**: Count of files to modify.
4. **Steps**: Count of implementation steps.
5. **Next step**: "Review the plan, then implement it manually or run `execute-plan docs/plans/<filename>` to have agents implement it."
