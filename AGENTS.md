# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository shape
- Monorepo with three active workspaces:
  - `frontend/`: React + TypeScript + Vite SPA.
  - `backend/`: Serverless Framework + TypeScript Lambda API on DynamoDB.
  - `e2e/`: Playwright test suite.
- Feature proposal docs live in `features/` and are design references, not runtime code.

## Core development commands
Run commands from the workspace directory shown.

### Full local stack (recommended)
- From repo root:
  - `./scripts/local-dev-up.sh`
  - `./scripts/local-dev-down.sh`
- `local-dev-up.sh` brings up DynamoDB Local, creates tables, seeds when empty, and starts backend + frontend with coordinated ports.

### Backend (`backend/`)
- Install: `npm install`
- Run API locally: `npm run offline`
- Lint: `npm run lint`
- Test all: `npm test`
- Test watch: `npm run test:watch`
- Single test file: `npx vitest run functions/matches/__tests__/recordResult.test.ts`
- Create local tables: `npm run create-tables`
- Seed local data: `IS_OFFLINE=true npm run seed`
- Clear local data: `IS_OFFLINE=true npm run clear-data`
- Validate OpenAPI: `npm run validate-api-docs`
- Re-embed docs bundle after API docs edits: `npm run embed-docs`

### Frontend (`frontend/`)
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`
- Lint: `npm run lint`
- Test all: `npm test`
- Test watch: `npm run test:watch`
- Coverage: `npm run test:coverage`
- Single test file: `npx vitest run src/services/__tests__/api-core.test.ts`
- Typecheck only: `npx tsc --project tsconfig.app.json --noEmit`

### E2E (`e2e/`)
- Install: `npm install`
- Install browsers: `npm run install-browsers`
- Run all: `npm test`
- Run local env: `npm run test:local`
- Run dev env: `npm run test:dev`
- Run one suite: `npx playwright test tests/admin/`
- Run one test file: `npx playwright test tests/integration/full-workflow.spec.ts`
- Show HTML report: `npm run report`

## Architecture map (big picture)

### Frontend app composition
- Entry point is `frontend/src/index.tsx`, which mounts `App`.
- `frontend/src/App.tsx` defines a route-heavy SPA with three important layers:
  - Auth + role guards (`ProtectedRoute`) for Wrestler/Fantasy/Moderator/Admin experiences.
  - Feature flag gating (`FeatureRoute`) driven by site config.
  - Shared shell (`Sidebar`, `TopBar`, modals) around route content.
- Global app state is centered in contexts:
  - `AuthContext` handles Cognito session state and role resolution, plus dev session fallback.
  - `SiteConfigContext` fetches feature toggles from `/site-config` and controls feature availability.
  - `PresenceContext` sends matchmaking heartbeat/online status and auto-disables presence on inactivity.
- API access is modularized under `frontend/src/services/api/`:
  - `apiClient.ts` provides `fetchWithAuth` and auth header injection.
  - `index.ts` re-exports domain clients (`playersApi`, `eventsApi`, `matchmakingApi`, etc.), so new frontend work should typically extend a domain module there.

### Backend API structure
- `backend/serverless.yml` is the source of truth for HTTP routes, auth, table names, and resource wiring.
- Most domains use **consolidated handlers**:
  - Example: `functions/matches/handler.ts`, `functions/events/handler.ts`, `functions/matchmaking/handler.ts`.
  - These use `createRouter` from `backend/lib/router.ts` to dispatch by `(method, resource)` to domain functions.
- Shared backend primitives:
  - `backend/lib/dynamodb.ts`: typed DynamoDB wrapper, pagination helpers (`scanAll`, `queryAll`), table env mapping.
  - `backend/lib/auth.ts`: role extraction and guard helpers (`requireRole`, `requireSuperAdmin`).
  - `backend/lib/handlers.ts`: generic create-handler factory used by multiple CRUD-style endpoints.

### Data/update flow patterns
- The system is DynamoDB-first; many read endpoints aggregate from multiple tables in-process (for example dashboard and standings).
- Match result recording (`functions/matches/recordResult.ts`) is a central write path:
  - Uses transactional writes for match state + standings updates.
  - Triggers follow-on effects (event completion state changes, fantasy scoring, ranking recalculation) after result updates.
- Feature flags are persisted server-side (`site-config`) and consumed client-side through `SiteConfigContext`, so disabling a feature impacts route accessibility and UI rendering.

## Critical conventions from existing repo rules
- Never commit directly to `main`; work must happen on feature/fix/chore/refactor branches.
- Avoid TypeScript `any`; use specific types or `unknown` with narrowing.
- Before pushing, run type checks in both apps:
  - `frontend`: `npx tsc --project tsconfig.app.json --noEmit`
  - `backend`: `npx tsc --project tsconfig.json --noEmit`
- If asked to run `newIssue` or `doIssue` workflows, follow the command specs in `.claude/commands/` and the Cursor rules in `.cursor/rules/` (issue creation/fetch, plan creation under `docs/plans/`, branch-first workflow, then PR).
