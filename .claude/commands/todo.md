Implement a TODO item from TO-DOS.md by title.

## Arguments

The user provides a partial or full TODO title as: `$ARGUMENTS`

## Step 1: Find the TODO

Read `/home/jpdev/source/league_szn/league_szn/TO-DOS.md` and search for a TODO item matching the provided title (case-insensitive partial match is fine).

If no match is found, list all available TODOs and ask the user to clarify.

If multiple matches are found, list them and ask the user to clarify which one.

## Step 2: Parse the TODO details

Extract from the matched TODO:
- **Title**: The bold text after the checkbox
- **Problem**: The description of what's wrong
- **Files**: The files that need to be modified
- **Solution**: The proposed approach

## Step 3: Plan the implementation

Enter plan mode to design the implementation approach. Use the TODO's problem description, files list, and proposed solution as your starting point. Research the codebase as needed to understand the context.

## Step 4: Implement the TODO

After the plan is approved, implement the solution:
- If both frontend and backend changes are needed, launch agents in parallel where possible
- Follow existing code patterns in the codebase
- Ensure TypeScript types are properly defined (no `any`)
- Add appropriate error handling

## Step 5: Run verification

Once implementation is complete, invoke the `/verify` skill to:
1. Run lint and tests for frontend and backend
2. If all pass, create a conventional commit

## Step 6: Update TO-DOS.md

If verify passes and a commit is created, update the TODO item in TO-DOS.md:
- Change `- [ ]` to `- [x]` to mark it complete
- Add a completion note with the date
