Generate an implementation plan for a TODO item from TO-DOS.md — no code, just the plan.

## Arguments

The user provides a partial or full TODO title as: `$ARGUMENTS`

## Step 1: Find the TODO

Read all TO-DOS.md files in the project (check project root and subdirectories like `frontend/`). Search for a TODO item matching the provided title (case-insensitive partial match is fine).

If no match is found, list all available TODOs and ask the user to clarify.

If multiple matches are found, list them and ask the user to clarify which one.

## Step 2: Parse the TODO details

Extract from the matched TODO:
- **Title**: The bold text after the checkbox
- **Problem**: The description of what's wrong or what needs to change
- **Files**: The files that need to be modified
- **Solution**: The proposed approach (if provided)

## Step 3: Research the codebase

Thoroughly explore all files referenced in the TODO and their surrounding context:
- Read each file listed in the TODO
- Understand the current implementation, types, patterns, and imports
- Identify related files not listed in the TODO that may need changes (tests, types, routes, etc.)
- Check how similar patterns are implemented elsewhere in the codebase for consistency
- Note any dependencies, shared utilities, or conventions that the implementation should follow

## Step 4: Generate the plan

Write a `plan.md` file in the project root with the following structure:

```markdown
# Plan: <TODO Title>

## Context
Brief summary of the problem and why it needs to change.

## Files to Modify
List every file that needs changes, including ones discovered during research that weren't in the original TODO.

| File | Action | Purpose |
|------|--------|---------|
| `path/to/file` | Modify / Create / Delete | What changes and why |

## Implementation Steps

Numbered, ordered steps with enough detail that someone (or an agent) could follow them without further research. Each step should:
- Reference specific file paths and line numbers
- Describe WHAT to change (not the code itself, but the logic/structure)
- Explain WHY (how it fits into the overall solution)
- Note any existing patterns to follow for consistency

## Dependencies & Order
Call out which steps depend on others and suggest a logical order (e.g., types first, then backend, then frontend).

## Testing & Verification
- What to test manually
- What existing tests might break
- What new tests should be written

## Risks & Edge Cases
Anything that could go wrong, backward-compatibility concerns, or edge cases to handle.
```

## Important Rules

- **Do NOT write any code.** No code snippets, no diffs, no implementation. Describe changes in plain language.
- **Do NOT enter plan mode.** Write the plan.md file directly.
- **Do NOT implement anything.** The output is only the plan.md file.
- **Be specific.** Reference exact file paths, line numbers, function names, and type names discovered during research.
- **Be complete.** Include every file that needs to change, even if the TODO didn't mention it (e.g., barrel exports, route definitions, test files).
