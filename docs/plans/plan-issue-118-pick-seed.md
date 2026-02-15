# Plan: Danger Zone – Pick-and-choose seed data (modular seed)

**GitHub issue:** [#118](https://github.com/jpDxsolo/league_szn/issues/118) — Danger Zone: Pick-and-choose seed data (modular seed)

## Context

The Danger Zone currently has a single **Generate Sample Data** button that runs a monolithic seed and creates everything at once. Issue 118 adds the ability to **select which seed modules** to run (e.g. Core, Championships, Matches, Tournaments, Events, Contenders, Fantasy, Config, Standings) so super-admins can do targeted seeding (e.g. “only divisions + players” or “only matches”) for testing.

This plan builds on **modular seed work** described in `plans/plan-modular-seed-data.md`: seed logic is split into domain modules and an orchestrator runs them in dependency order. The admin Lambda (`backend/functions/admin/seedData.ts`) will accept an optional `modules` array in the POST body and run only the selected modules (with dependency order enforced or auto-included). The Danger Zone UI will show checkboxes for each module and send the selection to the API.

**Prerequisite:** The backend must be able to run seed by module. If `plan-modular-seed-data.md` is not yet implemented, the Lambda can either (a) keep current monolithic behavior and ignore `modules` until modular seed exists, or (b) this work is done after modular seed is in place. The plan below assumes modular seed is available (Lambda imports and runs domain seed functions).

## Skills to use

| When | Skill | Purpose |
|------|--------|---------|
| After implementation | code-reviewer | Review API contract, Lambda body parsing, and ClearAllData UI |
| Before commit | git-commit-helper | Conventional commit message |
| When adding/updating tests | test-generator | Scaffold or extend ClearAllData and seedData handler tests |
| If API surface changes | api-documenter | Update OpenAPI for `POST /admin/seed-data` request body |

Only include skills that actually apply.

## Agents and parallel work

- **Suggested order:** Step 1 (backend API + module execution) → Step 2 (frontend UI + API client) → Step 3 (dependency handling and UX copy) → Step 4 (tests and docs). Steps 1 and 2 can be split across backend vs frontend if two agents run in parallel after the contract is agreed (e.g. request body shape and response `createdCounts`).
- **Agent types:** `general-purpose` for implementation; `test-engineer` or `general-purpose` for tests.

## Files to modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/functions/admin/seedData.ts` | Modify | Parse `event.body` for optional `{ modules: string[] }`; run only selected modules in dependency order; if `modules` empty/omitted, run full seed; return `createdCounts` (per table or per domain) |
| `frontend/src/services/api/admin.api.ts` | Modify | `seedData(options?: { modules?: string[] })` — POST with JSON body when modules provided |
| `frontend/src/components/admin/ClearAllData.tsx` | Modify | Add seed-options UI: checkboxes for each module, “Select all” / “Select none”; call `adminApi.seedData({ modules })` with selected list; display success with counts |
| `frontend/src/components/admin/ClearAllData.css` | Modify | Styles for seed-options block and checkboxes |
| `frontend/src/components/admin/__tests__/ClearAllData.test.tsx` | Modify | Test checkbox selection, API called with selected modules, “select all” behavior; mock `seedData` with body |
| `backend/functions/admin/__tests__/seedAndClear.test.ts` (or seedData unit test) | Modify | Test handler with body `{ modules: ['core'] }` and with empty/omitted body (full seed) |
| `backend/docs/openapi.yaml` (or API docs) | Modify | Document request body for `POST /admin/seed-data` (optional `modules` array) |
| `frontend/src/components/admin/AdminGuide.tsx` | Modify | Update Danger Zone / Generate Sample Data section to describe pick-and-choose seed options (optional, can be follow-up) |

## Implementation steps

### Step 1: Backend – Accept `modules` and run selected seed modules

- In `backend/functions/admin/seedData.ts`, parse the request body:
  - If `event.body` is present, parse JSON and read `modules: string[]` (optional).
  - If `modules` is missing, empty, or not an array, treat as “seed all” (current behavior: run full seed / all modules in order).
- When `modules` is provided and non-empty:
  - Resolve dependency order (see **Dependency order** below). Either: (a) reject invalid combinations (e.g. require `core` when any other module is selected), or (b) auto-include dependencies (e.g. if user selects `matches`, also run `core`, `championships` first). Prefer (b) for better UX.
  - Run only the selected modules (after auto-including dependencies) in the correct order.
- Each domain module should return or accumulate counts; aggregate into `createdCounts: Record<string, number>` (per table or per domain, same shape as today so UI can display “created: divisions 3, players 12, …”).
- Return `{ message, createdCounts }` as today.

**Dependency order** (from `plan-modular-seed-data.md`):  
`core` → `championships` → `matches` → `standings` → `tournaments` → `events` → `contenders` → `fantasy` → `config`. (`config` has no entity dependencies.)

- Define the list of valid module IDs (e.g. `core`, `championships`, `matches`, `standings`, `tournaments`, `events`, `contenders`, `fantasy`, `config`) and the ordered dependency list in one place (e.g. constant array or small helper).

### Step 2: Frontend – API client and Danger Zone UI

- **admin.api.ts:** Change `seedData` to accept an optional argument: `seedData(options?: { modules?: string[] })`. When `modules` is provided and non-empty, send `POST` with body `JSON.stringify({ modules })`. When omitted or empty, keep current behavior (no body or `{}`) for “seed all”.
- **ClearAllData.tsx:**
  - Add state for selected seed modules (e.g. `string[]` or `Set<string>`).
  - Define the same list of module IDs and human-readable labels (e.g. Core, Championships, Matches, Standings, Tournaments, Events, Contenders, Fantasy, Config). Optionally add short descriptions or a note: “Core is required for Championships and Matches.”
  - Render a “Seed options” block above the Generate button: checkboxes (or toggles) for each module, plus “Select all” / “Select none” controls.
  - On “Generate Sample Data” click: if at least one module is selected, call `adminApi.seedData({ modules: selectedModules })`; if none selected, call `adminApi.seedData()` (seed all). Confirm dialog can stay as is.
  - On success, continue to show `createdCounts` as today (list or summary).
- **ClearAllData.css:** Add styles for the seed-options block and checkbox layout so it’s readable and accessible.

### Step 3: Dependency handling and UX

- **Backend:** Implement auto-include of dependencies (recommended): when user selects e.g. `['matches']`, backend adds `core`, `championships` and runs in order `core` → `championships` → `matches`. Document in code or OpenAPI that “selecting a module implies its dependencies.”
- **Frontend (optional):** In the Danger Zone, add a short note: “Core is required for Championships and Matches. Dependencies are added automatically if needed.” Disable “Generate” only when no option is selected if you want to force at least one choice; otherwise “no selection” = seed all (as in Step 2).

### Step 4: Tests and docs

- **ClearAllData.test.tsx:**  
  - Test that with no selection (or “Select all”), `seedData` is called with no args or empty modules (full seed).  
  - Test that with some checkboxes selected, `seedData` is called with `{ modules: ['core', 'championships'] }` (or similar).  
  - Test “Select all” / “Select none” toggles update state and subsequent generate uses correct payload.
- **seedData handler test:**  
  - Event with `body: '{"modules":["core"]}'` → only core module runs; response has `createdCounts`.  
  - Event with no body or `body: '{}'` or `modules: []` → full seed (current behavior).
- **OpenAPI:** Document `POST /admin/seed-data` request body: optional `modules: string[]`; valid values and that dependencies may be auto-included.
- **AdminGuide.tsx (optional):** Update “Generate Sample Data” to mention that admins can choose which areas to seed (list or link to Danger Zone).

## Dependencies and order

- **Depends on:** Modular seed implementation (`plan-modular-seed-data.md`) so that Lambda can invoke domain seed functions (e.g. `seedCore()`, `seedChampionships()`, …). If Lambda is still monolithic, Step 1 can add body parsing and a no-op for `modules` (run full seed only) until modular seed is merged.
- **Order:** Step 1 (backend contract and execution) → Step 2 (frontend) → Step 3 (dependency + UX) → Step 4 (tests + docs). Steps 1 and 2 can be done in parallel by two agents if the request/response contract is fixed first (e.g. “body: { modules?: string[] }, response: { message, createdCounts }”).

## Testing and verification

- **Manual:** In Danger Zone, select only “Core” and generate; verify only divisions/players/seasons (and any core tables) are created. Select “Core” + “Championships” and generate; verify championships exist. “Select all” or no selection should behave like current full seed. Check that `createdCounts` in the UI matches what was created.
- **Unit:** ClearAllData checkbox state and API call args; seedData handler with body with `modules` and without.
- **Regression:** Existing “Generate Sample Data” with no checkboxes (or select all) still works and matches previous behavior.

## Risks and edge cases

- **Modular seed not done yet:** Lambda may still be monolithic. Then implement body parsing and treat any `modules` as “seed all” until modular seed is available; document in plan or issue.
- **Invalid module names:** Backend should ignore or reject unknown module IDs (e.g. return 400 with a message) so the API is safe.
- **Order of execution:** Always run selected modules in dependency order; auto-including dependencies avoids “matches without core” errors.
- **i18n:** If Danger Zone labels for module names are user-facing, add keys to locale files (en, de) for consistency.
