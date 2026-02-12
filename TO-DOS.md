# TO-DOS

## Code Review Findings - Must Fix Before Merge - 2026-02-12 09:27

- [x] ~~**Fix backend hasRole() to exclude Moderators from Admin**~~ - Fixed 2026-02-12. Added `&& !requiredRoles.includes('Admin')` guard to `backend/lib/auth.ts:38`. Moderators can no longer escalate to Admin via direct API calls.

- [x] ~~**Add timeout to recordResult Lambda**~~ - Fixed 2026-02-12. Added `timeout: 29` to recordResult in `backend/serverless.yml`. Immediate fix applied; decoupling via async invocation remains a medium-term goal.

- [x] ~~**Add ADMIN_SETUP_KEY to CI/CD workflows**~~ - Fixed 2026-02-12. Added `ADMIN_SETUP_KEY: ${{ secrets.ADMIN_SETUP_KEY }}` to both `deploy-prod.yml` and `deploy-dev.yml`. **Action required:** Set the `ADMIN_SETUP_KEY` secret in GitHub repo settings (Settings > Secrets > Actions) with a strong random value.

- [x] ~~**Fix CORS preflight/response origin mismatch**~~ - Fixed 2026-02-12. Replaced all 65 instances of `cors: true` with explicit CORS config via YAML anchor referencing stage-specific `allowedOrigin` with `allowCredentials: true` in `backend/serverless.yml`.

- [x] ~~**Change CORS fallback from wildcard to production domain**~~ - Fixed 2026-02-12. Changed `|| '*'` to `|| 'https://leagueszn.jpdxsolo.com'` in `backend/lib/response.ts`.

## Code Review Findings - Short Term - 2026-02-12 09:27

- [x] ~~**Complete JSON parse hardening on remaining handlers**~~ - Fixed 2026-02-12. Created shared `parseBody<T>()` utility in `backend/lib/parseBody.ts` and applied to all 17 handlers. Malformed JSON now returns descriptive 400 instead of generic 500.

- [x] ~~**Fix sanitizeName for international characters**~~ - Fixed 2026-02-12. Updated regex in `frontend/src/utils/sanitize.ts:41` to Unicode-aware `/[^\p{L}\p{N}\s\-'.]/gu` pattern. Accented characters now preserved.

- [x] ~~**Exclude source map files from S3 deployment**~~ - Fixed 2026-02-12. Added `--exclude "*.map"` to `aws s3 sync` in both `deploy-prod.yml` and `deploy-dev.yml`.

## Code Review Findings - Medium Term - 2026-02-12 09:27

- [ ] **Clarify isAdmin context property naming** - `isAdmin` includes Moderators, which is misleading. **Problem:** `AuthContext.tsx:165` sets `isAdmin: state.groups.includes('Admin') || state.groups.includes('Moderator')` while `hasRole('Admin')` was fixed to exclude Moderators. Used by Sidebar and AdminPanel for access gating. **Files:** `frontend/src/contexts/AuthContext.tsx:165`, `frontend/src/components/Sidebar.tsx:173`, `frontend/src/components/admin/AdminPanel.tsx:42`. **Solution:** Rename to `isAdminOrModerator` for clarity, or add a comment documenting the intentional inclusion.

- [x] ~~**Add security headers to API responses**~~ - Fixed 2026-02-12. Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, `Strict-Transport-Security` to shared headers in `backend/lib/response.ts`.

- [ ] **Decouple recalculations from recordResult** - Background work blocks API response. **Problem:** `triggerRankingRecalculation()` and `recalculateCosts()` are now awaited, adding 3-8+ seconds of full-table scans to every match result recording. The immediate timeout fix (29s) is applied, but the core architecture issue remains. **Files:** `backend/functions/matches/recordResult.ts:672-683`. **Solution:** Move to async Lambda invocation (`InvocationType: 'Event'`), SQS queue, or DynamoDB Streams on match status changes.
