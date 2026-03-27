<objective>
Create an implementation plan for two related features:
1. **Main & Alternate Wrestler** — Allow players to set both a "main" wrestler and an "alternate" wrestler on their profile. No separate stat tracking needed; purely cosmetic/informational.
2. **Public Player Profile** — A new public-facing profile page accessible by clicking a player in the Standings table. Shows the same info as the authenticated WrestlerProfile (minus edit capabilities), plus quick links to head-to-head stats and the ability to challenge/call out the player.
</objective>

<context>
This is the League SZN project — a WWE 2K league management app (React + TypeScript + Vite frontend, Serverless + Node.js + DynamoDB backend).

Read the project conventions from `CLAUDE.md` before starting.

**Current state (verified by codebase exploration):**

- **Player type** (`frontend/src/types/index.ts`): Has `currentWrestler: string` (single field). No alternate wrestler field exists.
- **WrestlerProfile** (`frontend/src/components/profile/WrestlerProfile.tsx`): Authenticated-only profile editor at `/profile`. Shows image, name, character name, PSN ID, W-L-D record, win%, season records, and embedded player stats. Has edit mode toggle and image upload.
- **Standings** (`frontend/src/components/Standings.tsx`): Public table with clickable rows that navigate to `/stats/player/{playerId}` (PlayerStats detail page). Uses `PlayerHoverCard` on hover.
- **PlayerStats** (`frontend/src/components/statistics/PlayerStats.tsx`): Detailed stats page at `/stats/player/:playerId`. Not a "profile" — it's a stats dashboard.
- **Head-to-Head** already exists at `/stats/head-to-head` via `HeadToHeadComparison.tsx`. Takes two player IDs.
- **Challenges** already exist (`/challenges`, `IssueChallenge.tsx`) — feature-gated, requires Wrestler role.
- **Backend endpoints**: `GET /players` (public list), `GET /players/me` (auth), `PUT /players/me` (auth), `GET /players/{playerId}/statistics`. No `GET /players/{playerId}` for a single player's public profile data.
- **Routing** (`frontend/src/App.tsx`): Uses `ProtectedRoute` for auth-gated pages, `FeatureRoute` for feature-flagged pages.

**Key files to examine:**
- `frontend/src/types/index.ts` — Player interface
- `frontend/src/components/profile/WrestlerProfile.tsx` — Current profile component
- `frontend/src/components/Standings.tsx` — Where clicking should navigate to public profile
- `frontend/src/components/statistics/PlayerStats.tsx` — Existing stats page
- `frontend/src/components/statistics/HeadToHeadComparison.tsx` — Existing H2H
- `frontend/src/components/challenges/IssueChallenge.tsx` — Existing challenge flow
- `frontend/src/services/api.ts` or `frontend/src/services/api/` — API client
- `frontend/src/App.tsx` — Routing
- `backend/functions/players/` — Player handlers
- `backend/serverless.yml` — API route definitions
</context>

<requirements>
Thoroughly analyze the codebase and create a detailed, step-by-step implementation plan covering:

### Feature 1: Main & Alternate Wrestler
1. **Data model change**: Add `alternateWrestler?: string` to the Player type (frontend and backend). Keep `currentWrestler` as the "main" wrestler — do NOT rename it (avoid breaking changes).
2. **Backend**: Update `PUT /players/me` (and `PUT /players/{id}` admin endpoint) to accept and persist `alternateWrestler`. Update `GET /players` and `GET /players/me` to return it.
3. **Frontend type**: Add `alternateWrestler` to the Player interface in `types/index.ts`.
4. **WrestlerProfile edit form**: Add an input for alternate wrestler in the edit mode of WrestlerProfile.
5. **Display**: Show both main and alternate wrestler on the profile view (both WrestlerProfile read-mode and the new PublicProfile).

### Feature 2: Public Player Profile
1. **New component**: `PublicProfile.tsx` — a read-only profile page for any player.
   - Shows: player image, name, main wrestler, alternate wrestler, PSN ID, division, stable/tag team (if any), all-time record, win%, season records, form, streak.
   - Does NOT include edit functionality or image upload.
   - Includes a "View Head-to-Head" button that navigates to `/stats/head-to-head` pre-selecting the viewed player.
   - Includes a "Challenge" button (visible only when challenges feature is enabled AND viewer is an authenticated Wrestler AND viewer is not the same player). This should link to or trigger the existing IssueChallenge flow pre-selecting the target player.
   - Includes a link to "Full Stats" that goes to `/stats/player/{playerId}`.
2. **New route**: `/player/{playerId}` — public, no auth required.
3. **Backend**: May need a `GET /players/{playerId}` endpoint to fetch a single player's data, OR the frontend can fetch all players and filter client-side (evaluate which approach is better — likely a dedicated endpoint is cleaner).
4. **Standings navigation**: Update Standings.tsx so clicking a player row navigates to `/player/{playerId}` (the new public profile) instead of `/stats/player/{playerId}`. Optionally keep a separate link/button for "Full Stats".
5. **Styling**: Match the existing WrestlerProfile visual style. Use existing CSS patterns — check for a profile CSS file or module.
6. **i18n**: All new UI strings must have translation keys in both `en.json` and `de.json`.

### Plan structure
- Break the plan into numbered steps with clear file paths
- Each step should be small enough for one agent to handle
- Identify which steps can run in parallel vs which have dependencies
- Include verification steps (TypeScript compilation, lint)
- Note any edge cases or decisions that need to be made
</requirements>

<constraints>
- Do NOT write any code — this is a planning task only.
- Do NOT rename `currentWrestler` — it's used everywhere and renaming would be a large breaking change.
- Do NOT track stats separately for main vs alternate wrestler — this is purely informational.
- Keep the plan focused on these two features only — no scope creep.
- Maximum 300 lines per file in the plan's implementation steps.
- Edit existing files instead of creating new ones when possible.
- Follow existing patterns in the codebase (component structure, CSS approach, API patterns).
- The plan should be saved as a markdown file in `docs/plans/`.
</constraints>

<output>
Save the implementation plan to: `./docs/plans/plan-014-wrestler-profile-public-view.md`

The plan should follow the format used by other plans in `docs/plans/` (check existing plans for the format if any exist).

Include:
- Overview / goal
- Steps numbered and grouped by phase (backend, frontend types, frontend components, routing, i18n, verification)
- File paths for each step
- Parallelization notes (which steps can run concurrently)
- Edge cases and open questions
</output>

<verification>
Before declaring the plan complete:
1. Verify all referenced files actually exist in the codebase
2. Ensure the plan covers both features completely
3. Check that i18n is included
4. Confirm no breaking changes to existing functionality
5. Verify the plan file follows the format of existing plans in `docs/plans/`
</verification>

<success_criteria>
- A complete, actionable implementation plan in `docs/plans/plan-014-wrestler-profile-public-view.md`
- Every step has specific file paths and clear instructions
- Dependencies between steps are documented
- The plan can be executed by `/execute-plan` with parallel agents
</success_criteria>
