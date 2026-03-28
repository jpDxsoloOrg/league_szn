<objective>
Create a detailed implementation plan for adding Tag Team Call Outs to the challenge system.

Currently, challenges are strictly 1v1: a player (challengerId) calls out another player (challengedId). The user wants a tag team member to be able to call out an entire tag team — meaning both members of the challenger's tag team face both members of the challenged tag team.

This plan should cover backend, frontend, and data model changes needed to support tag team challenges alongside existing 1v1 challenges.
</objective>

<context>
This is a WWE 2K League management app (React + TypeScript frontend, Node.js + Serverless Framework backend, DynamoDB).

Read these files to understand the current systems:

**Challenge System (current 1v1 only):**
- `frontend/src/types/challenge.ts` — Challenge interface, CreateChallengeInput, ChallengeWithPlayers
- `backend/functions/challenges/createChallenge.ts` — Creates a 1v1 challenge (challengerId, challengedId)
- `backend/functions/challenges/respondToChallenge.ts` — Accept/decline/counter a challenge
- `backend/functions/challenges/handler.ts` — All challenge routes
- `frontend/src/components/challenges/IssueChallenge.tsx` — UI for issuing a challenge (player picker)
- `frontend/src/components/challenges/ChallengeDetail.tsx` — View a single challenge
- `frontend/src/components/challenges/ChallengeBoard.tsx` — Public challenge feed
- `frontend/src/components/challenges/MyChallenges.tsx` — Player's own challenges
- `frontend/src/services/api/challenges.api.ts` — Challenge API client

**Tag Team System (exists but no challenge integration):**
- `backend/functions/tagTeams/handler.ts` — Tag team CRUD routes
- `backend/serverless.yml` — TAG_TEAMS_TABLE definition (PK: tagTeamId, fields: name, player1Id, player2Id, status, wins, losses, draws)
- `backend/lib/dynamodb.ts` — TableNames including TAG_TEAMS

**Stable System (for reference on group patterns):**
- `frontend/src/types/stable.ts` — Stable interface (memberIds[], leaderId)

**Notifications:**
- `backend/lib/notifications.ts` — createNotification helper

**Auth:**
- `backend/lib/auth.ts` — getAuthContext, hasRole (role hierarchy: Fantasy < Wrestler < Moderator < Admin)

Read `CLAUDE.md` for project conventions, code style, and deployment details.
</context>

<requirements>
Thoroughly analyze the existing challenge and tag team systems, then create a comprehensive implementation plan that covers:

### 1. Data Model Changes
- How to extend the Challenge record to support tag team challenges (e.g., new fields like `challengeType: 'singles' | 'tag_team'`, `challengerTagTeamId`, `challengedTagTeamId`)
- Whether to add new fields to the existing Challenges DynamoDB table or create a separate table
- Any new GSIs needed for querying tag team challenges
- How the enriched response (ChallengeWithPlayers) changes to include tag team info

### 2. Backend Changes
- **createChallenge.ts**: Support creating a tag team challenge where:
  - The challenger must be a member of an active tag team
  - The challenged entity is a tag team (not an individual player)
  - Both tag teams must be active
  - A tag team cannot challenge itself
  - Notifications go to BOTH members of the challenged tag team
- **respondToChallenge.ts**: Either member of the challenged tag team can accept/decline
- **getChallenges.ts**: Filter/include tag team challenges in listings
- **getChallenge.ts**: Enrich with tag team names and member details
- **cancelChallenge.ts**: Either member of the challenger's tag team can cancel

### 3. Frontend Changes
- **IssueChallenge.tsx**: Add a toggle/selector for "Singles Challenge" vs "Tag Team Challenge"
  - When "Tag Team" is selected, show tag teams as opponents instead of individual players
  - Only show this option if the current player is in an active tag team
- **ChallengeBoard.tsx**: Display tag team challenges with both team names
- **ChallengeDetail.tsx**: Show tag team info (team name, both members) instead of single player
- **MyChallenges.tsx**: Include tag team challenges where the player's tag team is involved
- **Types**: Update Challenge, ChallengeWithPlayers, CreateChallengeInput types

### 4. API Changes
- Update the challenges API client to support tag team challenge creation
- Ensure backward compatibility — existing 1v1 challenges must continue working unchanged

### 5. Notification Changes
- Tag team challenges notify both members of the challenged tag team
- Notification message should reference the tag team name

### 6. i18n
- Add translation keys for tag team challenge UI elements (English and German)

### 7. Edge Cases to Address
- What happens if a tag team is dissolved while a challenge is pending?
- What happens if a member leaves a tag team with an active challenge?
- Can a tag team member also have individual challenges simultaneously?
- Should tag team challenges convert to tag team matches when accepted?
</requirements>

<constraints>
- Do NOT write any code — this is a planning task only
- Follow the plan file format used by this project (see `docs/plans/` for examples)
- The plan should be broken into discrete, numbered steps that can be executed by parallel agents where possible
- Identify which steps can run in parallel vs which have dependencies
- Maximum 300 lines per implementation file (plan should account for this)
- Edit existing files instead of creating new ones wherever possible
- Use TypeScript with no `any` types
- Follow existing patterns: handler router pattern, fetchWithAuth, role-based auth, notification system
- The plan must not break existing 1v1 challenge functionality
</constraints>

<output>
Save the implementation plan to: `./docs/plans/plan-015-tag-team-callout.md`

The plan should follow the format of existing plans in `docs/plans/` with:
- Overview section explaining the feature
- Step-by-step implementation sections (numbered)
- Files to modify/create listed per step
- Parallel execution groups identified
- Testing/verification checklist
- Rollback considerations
</output>

<verification>
Before finalizing the plan, verify:
- All existing challenge functionality is preserved (backward compatible)
- The plan references actual file paths that exist in the codebase
- No step is missing — trace the full flow from UI click to DB write to notification
- Edge cases are addressed
- i18n keys are included for both English and German
</verification>

<success_criteria>
- A complete, actionable plan saved to `./docs/plans/plan-015-tag-team-callout.md`
- Plan covers: data model, backend handlers, frontend components, API client, notifications, i18n, edge cases
- Steps are numbered and parallelizable where possible
- Each step lists specific files to modify and what changes to make
- The plan can be handed to an execution agent (via `/execute-plan`) and produce a working feature
</success_criteria>
