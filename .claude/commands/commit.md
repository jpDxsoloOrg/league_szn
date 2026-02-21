Create a conventional commit for the latest changes and push to remote.

## Step 1: Analyze changes

Run these commands in parallel to understand the current state:

1. `git status` - See all untracked and modified files
2. `git diff --staged` - See staged changes
3. `git diff` - See unstaged changes
4. `git log --oneline -5` - See recent commit message style

## Step 2: Stage changes

Stage all relevant changes. Prefer staging specific files rather than `git add -A`:
- Do NOT stage files that contain secrets (.env, credentials, etc.)
- Review what will be committed

## Step 3: Create conventional commit

Create a commit message following the Conventional Commits specification:

**Format:** `<type>(<scope>): <description>`

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, missing semi-colons, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependencies, configs

**Rules:**
- Keep the first line under 72 characters
- Use imperative mood ("add" not "added")
- Don't end with a period
- Add body for complex changes explaining the "why"

Example:
```
feat(match-types): add admin CRUD for match types/stipulations

- Create backend Lambda handlers (GET, POST, PUT, DELETE)
- Add MatchTypesTable to DynamoDB
- Create ManageMatchTypes admin UI component
- Add matchTypesApi to frontend services
```

## Step 4: Validate TypeScript (required before push)

Run TypeScript validation and stop if either command fails:

```bash
cd frontend && npx tsc --project tsconfig.app.json --noEmit
cd ../backend && npx tsc --project tsconfig.json --noEmit
```

## Step 5: Push to remote

After committing, push to the current branch:

```bash
git push origin HEAD
```

If the branch has no upstream, use:

```bash
git push -u origin HEAD
```

## Step 6: Report result

Provide a summary:
- Commit hash
- Branch name
- Files changed
- Link format: `https://github.com/jpDxsoloOrg/league_szn/commit/<hash>`
