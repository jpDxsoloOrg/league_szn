# Plan: Hide response promos from the main promo feed

**GitHub issue:** [#284 — Hide response promos from the main promo feed](https://github.com/jpDxsoloOrg/league_szn/issues/284)

## Context

Today, the public promo feed at `/promos` shows every visible promo — including "response" promos that reply to another promo. Because a response only makes sense in the context of its parent, mixing them into the top-level feed creates noise and redundant cards (the response and its parent both appear separately).

We want the main feed to show **only top-level promos**. Response promos should only be reachable by opening the original promo's thread view (`/promos/:promoId`), which already renders the parent promo plus its full response list. The filter tab "Responses" should be removed from the feed because, by design, no responses will appear there.

A promo is a "response" when it has `targetPromoId` set and `promoType === 'response'` ([frontend/src/types/promo.ts:12-32](frontend/src/types/promo.ts#L12-L32)).

## Skills to use

| When | Skill | Purpose |
|------|-------|---------|
| After all code edits | `code-reviewer` | Sanity-check the backend/frontend diffs for pattern consistency and bugs. |
| On new/updated tests | `test-generator` | Ensure test coverage stays meaningful when we add the `excludeResponses` scenarios. |
| Before pushing | `git-commit-helper` | Generate a conventional commit message for the final commit. |
| During verification | `verify` (project script) | Runs lint + unit tests for frontend and backend. |

## Agents and parallel work

- **Wave 1** — Step 1 (backend handler). Single agent (`general-purpose`).
- **Wave 2** — Step 2 (backend tests) **+** Step 3 (frontend API client), in parallel. Two agents: `test-engineer` for the backend test, `general-purpose` for the API client.
- **Wave 3** — Step 4 (PromoFeed component). Single agent (`general-purpose`).
- **Wave 4** — Step 5 (PromoFeed tests) **+** Step 6 (i18n cleanup) **+** Step 7 (wiki docs), in parallel. Three agents: `test-engineer` for tests, `general-purpose` for i18n, `general-purpose` for wiki.
- Step 8 is manual verification and is **not** executed by an agent — it belongs to the human reviewer.

**Suggested order:** `Step 1 -> (Step 2 + Step 3) -> Step 4 -> (Step 5 + Step 6 + Step 7)`

## Files to modify

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | [backend/functions/promos/getPromos.ts](backend/functions/promos/getPromos.ts) | Modify | Accept a new `excludeResponses` query parameter; when `'true'`, filter out promos with `targetPromoId` set before enrichment/return. |
| 2 | [backend/functions/promos/__tests__/getPromos.test.ts](backend/functions/promos/__tests__/getPromos.test.ts) | Modify | Add tests for the new filter: verify responses are excluded when the flag is set, and included (default) when it isn't. |
| 3 | [frontend/src/services/api/promos.api.ts](frontend/src/services/api/promos.api.ts) | Modify | Extend `promosApi.getAll` signature with `excludeResponses?: boolean`; forward it as a query-string parameter. |
| 4 | [frontend/src/components/promos/PromoFeed.tsx](frontend/src/components/promos/PromoFeed.tsx) | Modify | Call `promosApi.getAll({ excludeResponses: true }, signal)`; remove the `'response'` option from `FeedFilter` + `FILTER_TABS`; simplify `matchesFilter` accordingly; adjust `pinnedPromos` filter so a pinned response never surfaces either. |
| 5 | [frontend/src/components/promos/__tests__/PromoFeed.test.tsx](frontend/src/components/promos/__tests__/PromoFeed.test.tsx) | Modify | Update mocked `getAll` to assert the new argument, remove expectations around a "Responses" tab, add coverage proving that responses are not rendered in the main feed. |
| 6 | [frontend/src/i18n/locales/en.json](frontend/src/i18n/locales/en.json) | Modify | Remove the unused `promos.feed.filterResponses` key (and surrounding stale entries if any) to keep translations lean. |
| 7 | [frontend/src/i18n/locales/de.json](frontend/src/i18n/locales/de.json) | Modify | Same cleanup as en.json for parity. |
| 8 | [frontend/public/wiki/promos.md](frontend/public/wiki/promos.md) | Modify (if it mentions the Responses tab) | Update user-facing docs to reflect that responses are reached via their parent promo only. |
| 9 | [frontend/public/wiki/de/promos.md](frontend/public/wiki/de/promos.md) | Modify (if it mentions the Responses tab) | German parity with the wiki update above. |
| 10 | [frontend/src/components/admin/AdminPromos.tsx](frontend/src/components/admin/AdminPromos.tsx) | **Do NOT change (recommended)** | Admins still need to moderate responses, so the admin table should continue listing them. See "Risks and edge cases" for rationale. |

## Implementation steps

### Step 1: Backend — add `excludeResponses` query parameter to `getPromos`

**File:** [backend/functions/promos/getPromos.ts](backend/functions/promos/getPromos.ts)

- In the handler's destructuring on line 7, pull `excludeResponses` out of `event.queryStringParameters` alongside the existing params.
- After the promos are loaded (whichever branch of the `if (playerId) / else if (promoType) / else` was taken) and **before** the enrichment/filter pipeline on lines 64–102, short-circuit any promo whose `targetPromoId` is truthy when `excludeResponses === 'true'`.
  - The cleanest place is to combine it with the existing `includeHidden` filter on line 66 so there's one `.filter(...)` that handles both visibility and top-level-only logic.
  - Treat `excludeResponses` as a query string string (as we do for `includeHidden` on line 66). Only exclude when the literal string is `'true'`.
- **Why** we filter *after* the scan/query rather than in the DynamoDB expression: responses still need to be present in the `promos` array during the `responseCounts` computation (lines 55–62), otherwise top-level promos will report `responseCount: 0` even when responses exist in the system. Do the count first, then drop the response rows from the enriched output.
- **Gotcha:** Do not also exclude responses from `playerMap` lookups or `targetPromo` embedding — those aren't referenced once the responses are dropped, but leaving them untouched is still cheap and keeps the control flow linear.
- **Pattern to follow:** Mirror the style of the existing `includeHidden === 'true'` string check on line 66 for consistency.

### Step 2: Backend — update tests

**File:** [backend/functions/promos/__tests__/getPromos.test.ts](backend/functions/promos/__tests__/getPromos.test.ts)

- Add at least two new tests around the existing "returns enriched promos" and "includes hidden when flag set" tests:
  1. **Excludes responses when `?excludeResponses=true`** — mock a dataset with a parent promo and a response to it, assert the response is NOT present in the returned array, and assert the parent's `responseCount` is still `1` (so the response-count logic still sees the response during counting).
  2. **Includes responses by default** — same dataset, no `excludeResponses` query param; response must still appear (preserves current behaviour for anything else calling this endpoint).
- Look at the existing test around line 161 that verifies `targetPromo` enrichment — your new tests can reuse its fixture style.
- **Why:** These tests protect against accidental regressions if someone later changes the filter order or refactors the handler.

### Step 3: Frontend API client — plumb the new parameter

**File:** [frontend/src/services/api/promos.api.ts](frontend/src/services/api/promos.api.ts)

- Extend the `filters` parameter type of `getAll` (line 5) with `excludeResponses?: boolean`.
- When `filters?.excludeResponses` is truthy, append `params.set('excludeResponses', 'true')` — use the same guard-and-set shape as the `includeHidden` branch on line 9.
- **Why:** Keeps the frontend API surface aligned with the new backend query parameter so callers can opt in.
- **Gotcha:** Don't make this the default — admin and other callers may still want responses included. The feed should pass it explicitly.

### Step 4: Frontend feed — request without responses and remove the Responses tab

**File:** [frontend/src/components/promos/PromoFeed.tsx](frontend/src/components/promos/PromoFeed.tsx)

- **4a. Call the API with the new flag.** In the `useEffect` at line 66, change the call from `promosApi.getAll(undefined, controller.signal)` to `promosApi.getAll({ excludeResponses: true }, controller.signal)`.
- **4b. Remove the `'response'` filter tab.**
  - Update the `FeedFilter` type on line 11 to drop `'response'`.
  - Remove the `{ key: 'response', ... }` entry from `FILTER_TABS` on line 16.
  - Remove the `case 'response':` branch from `matchesFilter` on line 43–44. (The function should still cover the remaining cases.)
- **4c. Defensive client-side filter.** In `pinnedPromos` (line 96) and `filteredPromos` (line 103), add an extra guard so that even if a response slips through (e.g. stale cache, test double, or a future caller), the UI still hides it:
  - Conceptually: also require `!p.targetPromoId` when deriving both arrays.
  - **Why:** The backend filter is authoritative, but this guard makes the UI resilient and keeps the contract explicit at the render boundary.
- **4d. Nothing else should change visually.** The "Pinned" section, date grouping, "Cut a Promo" button, read-tracking, and reaction handlers all continue to work unchanged — they already operate on whatever `promos` contains.
- **Gotcha:** `PromoCard`'s "N responses" footer link still needs to work, so make sure `responseCount` is preserved on the parent promos returned by the API (the Step 1 backend change keeps this intact).
- **Pattern to follow:** The existing `matchesFilter` switch — keep it exhaustive after the removal so TypeScript will flag any future divergence.

### Step 5: Frontend feed — update tests

**File:** [frontend/src/components/promos/__tests__/PromoFeed.test.tsx](frontend/src/components/promos/__tests__/PromoFeed.test.tsx)

- Update any mock of `promosApi.getAll` so the arguments match `{ excludeResponses: true }` (look for `getAll` in the existing mock setup around the top of the file).
- Remove/replace any test that asserts the "Responses" tab exists or that clicking it filters to responses.
- Add a new test: given a fixture where the mocked `getAll` returns a parent promo and (mistakenly) a response promo, assert the response is not rendered in the feed (defence-in-depth from Step 4c).
- Confirm that the existing "click through to thread" flow (if any) still passes — the PromoCard still points to `/promos/:promoId` via the response-count link.

### Step 6: Remove unused translation keys

**Files:** [frontend/src/i18n/locales/en.json](frontend/src/i18n/locales/en.json) (line 1292), [frontend/src/i18n/locales/de.json](frontend/src/i18n/locales/de.json) (line 1291)

- Delete the `promos.feed.filterResponses` entry in both locales to keep i18n files tidy.
- **Gotcha:** Grep the frontend for `filterResponses` before deleting to make sure no other component references it; based on current code it's used only in `PromoFeed.tsx`.
- **Why:** Unused translations rot. This is a one-line cleanup per file.

### Step 7: Update wiki if relevant

**Files:** [frontend/public/wiki/promos.md](frontend/public/wiki/promos.md), [frontend/public/wiki/de/promos.md](frontend/public/wiki/de/promos.md)

- Skim both files for any sentence that describes "Responses" as a filter tab or says that replies appear in the main feed.
- Rewrite that sentence to say something like: "Responses live inside the promo they reply to — open an original promo to read and reply to the thread."
- If neither file mentions it, leave them alone.

### Step 8: Manual verification

- Start the app locally (`docker run … dynamodb-local`, `npm run offline`, `npm run seed`, `npm run dev`).
- Visit `/promos` as an unauthenticated user.
  - Confirm: no promo card shows `Responding to …`. Every card in the feed is top-level.
  - Confirm: the filter bar no longer has a "Responses" tab.
  - Confirm: a top-level promo with responses still shows its "N responses" footer and clicking it navigates to `/promos/:promoId`.
- Open that thread view and confirm the responses are listed there exactly as before.
- Sign in as admin, visit the admin promos panel, and confirm the admin table still lists responses (we deliberately did not change that).

## Dependencies and order

- **Step 1** (backend handler) must be done before **Step 2** (backend tests) and before **Step 3** (API client can be typed without it, but end-to-end testing needs the handler live).
- **Steps 1 → 3 → 4** form the critical path: handler → client → UI.
- **Step 2** (backend tests) and **Step 3** (API client) are independent of each other after Step 1, so they can run in parallel.
- **Step 5** (frontend tests) depends on Step 4. **Step 6** (i18n cleanup) depends on Step 4 because Step 4 is what stops referencing the key.
- **Steps 7 and 8** come last.

**Suggested order:** `Step 1 → (Step 2 + Step 3 in parallel) → Step 4 → (Step 5 + Step 6 in parallel) → Step 7 → Step 8`

## Testing and verification

- **Backend unit tests** — run `cd backend && npm test` after Step 2. New tests from Step 2 must pass; nothing else should regress.
- **Frontend unit tests** — run `cd frontend && npm test` after Step 5. Adjusted PromoFeed tests must pass.
- **Type checks** — per the project workflow, run `cd backend && npx tsc --project tsconfig.json --noEmit` and `cd frontend && npx tsc --project tsconfig.app.json --noEmit` before pushing.
- **Manual end-to-end** — see Step 8 above.
- **Regression watch** — the admin promos panel, PromoThread, PromoEditor (especially "respond to a promo" flow), and the `?promoType=response&targetPromoId=…` navigation from PromoCard's "Responding to" link must all still work. Specifically walk through: feed → click parent's "N responses" → thread → click reply → editor pre-filled → submit → navigate back into the thread.

## Risks and edge cases

- **Admin moderation parity.** If we *also* hide responses from the admin panel, admins lose the ability to moderate them. Recommendation: keep admin behaviour as-is (no `excludeResponses` flag). If product wants a response-specific admin view later, that's a separate plan.
- **Response counts.** Step 1 explicitly computes `responseCounts` before filtering out responses. If someone later refactors and flips that order, parent promos will incorrectly show "0 responses". The backend test in Step 2 pins this behaviour.
- **Pinned responses.** A response could theoretically be pinned by an admin. Step 4c's client-side guard and the backend filter together make sure a pinned response still disappears from the public feed.
- **Backward compatibility.** Existing API consumers that don't pass `excludeResponses` continue to get responses in the result — this is additive and non-breaking. Only the feed UI opts in.
- **Stale caches / service workers.** If the app caches the old API response shape, users may briefly see responses after deploy. Step 4c's defensive client filter covers this.
- **i18n lingering references.** Grep for the removed translation key before deleting it (Step 6). If a downstream component still reads it, restore the key first and revisit later.
- **Mock data.** The current mock dataset in [frontend/src/mocks/promoMockData.ts](frontend/src/mocks/promoMockData.ts) includes response promos. The mocks don't need edits, but be aware when running Storybook-style demos: responses will still appear unless the mock consumer filters them.
