# PR description draft: INFRA-207 2b + 3 (delete dead targets, docs)

Branch: `refactor/infra-207-2b-cleanup` (stacked on `refactor/infra-207-2a-cutover`).
Plan: `docs/plans/plan-infra-207-api-simplification.md` §6 (PR 2b, PR 3), §7.3, §11.

## Merge gate (required, plan §6 "Merge gate between 2a and 2b")

**Do not merge this PR until every box below is ticked.** `deploy-prod.yml` deploys only the head of `main`, and prod lags main. If 2a and 2b were both on main before the next prod run, prod would jump from PR1 straight to 2b. CloudFormation would then delete the legacy functions, their API Gateway permissions and the authorizer while the stage still served the explicit-route snapshot, and most of the API would return 5xx (plan §4). CI check B (`scripts/check-api-cutover.js`) also refuses a first 2b deploy over a stage that is not proxy-only, but this checklist is the primary gate.

### Devtest (`wwe-2k-league-api-devtest`, API `dgsmskbzb2`)
- [ ] Deploy 2a ran on devtest. Run URL: `<deploy-dev.yml run URL>`
- [ ] "Refresh API stage deployment" succeeded in that run. New `deploymentId`: `<id>`. Previous `deploymentId` (rollback): `<id>`
- [ ] `aws apigateway get-resources --rest-api-id dgsmskbzb2` returns exactly `/` and `/{proxy+}`
- [ ] `aws apigateway get-deployment --rest-api-id dgsmskbzb2 --deployment-id <stage deploymentId> --embed apisummary`: the `apiSummary` keys are a subset of `{'/', '/{proxy+}'}`
- [ ] e2e suite and the manual walkthrough passed on devtest after 2a: login, refresh-on-401 (expired token), image upload, record result (async contenders/progression invoke), `/api-docs`
- [ ] CloudWatch: `wwe-2k-league-api-devtest-api` has traffic; the legacy functions have no invocations since the refresh

### Prod (`wwe-2k-league-api-dev`, API `9pcccl0caj`)
- [ ] Deploy 2a ran on prod (owner, **Deploy to Production** from `main`). Run URL: `<deploy-prod.yml run URL>`
- [ ] "Refresh API stage deployment" succeeded in that run. New `deploymentId`: `<id>`. Previous `deploymentId` (rollback): `<id>`
- [ ] `aws apigateway get-resources --rest-api-id 9pcccl0caj` returns exactly `/` and `/{proxy+}`
- [ ] The stage's deployment `apiSummary` keys are a subset of `{'/', '/{proxy+}'}`
- [ ] Read-only smoke test on prod after 2a (GET with token, tokenless non-GET for 401/403, OPTIONS)
- [ ] CloudWatch: `wwe-2k-league-api-dev-api` has traffic; the legacy functions have no invocations since the refresh

## Summary

Deploy 2b deletes the targets that 2a left alive for the stale-snapshot window. Nothing routes to them any more: every HTTP request goes through `api` behind `ANY /{proxy+}`.

PR 2b:
- `backend/serverless.yml`: removed the 41 legacy HTTP functions (§6 2b list) and `adminAuthorizer`. Removed the `legacy-bridge.js` resources entry and turned `resources:` back into a mapping. Kept functions: `api`, `contenders`, `progression`, `postConfirmation`, `preSignUp`, `expireChallenges`, `expireContractOffers`, `weeklyJobs`, `recalculateContenders`.
- Deleted `backend/legacy-bridge.js`, `backend/functions/auth/authorizer.ts` and its test. No source file imported `authorizer.ts`. All handler source files stay, because `functions/api/routes.ts` imports them.
- Deleted `backend/scripts/diff-live-template.js` and its test (it imported `legacy-bridge.js`), its `npm` script, and the "Diff packaged templates against live stack" step in `deploy-dev.yml` and `deploy-prod.yml`.
- `backend/lib/__tests__/serverlessConfig.test.ts`: replaced the 2a bridge assertions. The test now checks that only `api` has `http` events (one root `ANY /{proxy+}`), that the function set is exactly the kept set, that no `authorizer:` and no `adminAuthorizer` remain, that `legacy-bridge.js` is gone, and that neither workflow runs the live diff.

PR 3:
- Parity fixture: dropped `POST /auth/login` from `legacyGatewayRoutes.json` (208 entries) and the `DELETED_ON_PURPOSE` exception from `legacyParity.test.ts`. Every remaining pre-migration route must now be served.
- Docs: `CLAUDE.md` (Lambda and API Gateway rows, aws-jwt-verify row, auth section now in-Lambda only, new "Adding an endpoint" note), `README.md`, the `backend/stacks-map.js` header (now inert, kept on purpose), and comments in `lib/router.ts` and `lib/authenticate.ts`.

## Expected deploy effect (plan §6 2b)

CloudFormation creates nothing except the new Deployment. Cleanup deletes about 41 functions, their log groups and API Gateway permissions, the Authorizer and the now-empty `PermissionsNestedStack`. Retained `AWS::Lambda::Version` resources are orphaned. Tables, Cognito, buckets and CloudFront are untouched.

Local `npx serverless package --stage devtest` (read-only against the live stack):
- root 63 / 450, Overflow 35, Versions 9. `PermissionsNestedStack` is no longer emitted; live it holds only `*LambdaPermissionApiGateway` resources of deleted functions.
- `check-stack-cycles.js`: no cycles.
- No kept resource changes stack. The only resources not already live are the PR 1 proxy resources, because devtest has not yet run PR 1.
- `check-api-cutover.js --dry-run` on devtest currently **fails check D** (no live `/{proxy+}`): devtest has not run PR 1 or 2a. That is the gate working as intended.

## Verify after the 2b deploy (each stage)
- [ ] e2e suite plus the manual walkthrough
- [ ] `aws apigateway get-resources` shows 2 resources
- [ ] Stack events: `UPDATE_COMPLETE`, with no cleanup-phase failures. Cleanup failures do not roll back, so delete any stragglers by hand.
- [ ] `describe-stack-resource --logical-resource-id AdminAuthorizerApiGatewayAuthorizer` reports "does not exist" (checks A and B retire, check C is armed)

## Rollback
A 2b problem is fixed forward (plan §6 2b). Routing does not depend on the deleted targets. A template revert of 2b is not supported, and check C refuses it. A function that is needed again is re-added in a new PR without the authorizer or the bridge.

## Freeze
Until 2b has reached both stages, other PRs must be rebased on the migration. Check C blocks a 2a-era template over a stage that has run 2b.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
