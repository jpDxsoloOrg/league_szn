# Plan: Fix Local Dev Broken by Split Stacks

## Context

The `serverless-plugin-split-stacks` (v1.14.0) was added to `backend/serverless.yml` at line 107 to split CloudFormation resources into nested stacks and avoid the AWS 500-resource limit. This plugin works correctly for AWS deployments but breaks local development via `serverless-offline` (line 108). The split-stacks plugin runs during the packaging/deployment lifecycle and attempts to reorganize CloudFormation resources into nested stacks. When `serverless-offline` tries to start, the split-stacks plugin interferes because offline mode has no concept of nested stacks.

The recommended fix is **conditionally disable split-stacks when running offline** using a dedicated `offline` stage. This follows the existing stage-based variable pattern already used in the project (e.g., `custom.allowedOrigin` at lines 119-122) and is the least disruptive approach.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/serverless.yml` | Modify (lines 105-144) | Conditionally disable `splitStacks` config for `offline` stage; add `offline` entries to all stage-dependent custom variables |
| `backend/package.json` | Modify (line 10) | Update the `offline` script to pass `--stage offline` |
| `README.md` | Modify (lines 515-648) | Update the Local Development section to document the fix |

## Implementation Steps

### Step 1: Add `offline` stage entries to all stage-dependent custom variables in serverless.yml

**File**: `backend/serverless.yml` (lines 119-144)

Before modifying the splitStacks config, ensure all existing stage-based variable maps include an `offline` entry to avoid resolution errors:

- `custom.allowedOrigin` (lines 119-122): Add `offline: '*'` (or `offline: http://localhost:3000`)
- `custom.frontendBucket` (lines 133-136): Add `offline: 'localhost'` (placeholder, not used)
- `custom.frontendDomain` (lines 137-140): Add `offline: 'localhost'` (placeholder, not used)
- `custom.certificateArn` (lines 141-144): Add `offline: ''` (placeholder, not used)

**Why**: When using `--stage offline`, the Serverless Framework resolves all `${self:custom.someMap.${self:provider.stage}}` references. Missing entries cause deployment/startup failures.

### Step 2: Add a `splitStacksEnabled` stage-based variable and modify the splitStacks config

**File**: `backend/serverless.yml` (lines 111-114)

Add a new custom variable block:
```
splitStacksEnabled:
  dev: true
  devtest: true
  offline: false
```

Then update the `splitStacks` config at lines 112-114 so that `perType` resolves to `false` for the `offline` stage. Use the pattern `${self:custom.splitStacksEnabled.${self:provider.stage}, true}` as the value for `perType` (and similarly for `perFunction` and `perGroupFunction` if they exist).

**Why**: This effectively makes the plugin a no-op when running locally. The plugin still loads but does not reorganize any resources, avoiding conflicts with `serverless-offline`.

### Step 3: Update the `offline` npm script in package.json

**File**: `backend/package.json` (line 10)

Change from: `SLS_RUNTIME=nodejs20.x serverless offline start`
Change to: `SLS_RUNTIME=nodejs20.x serverless offline start --stage offline`

**Why**: This triggers the stage-based conditional in Step 2, disabling split-stacks during local dev. The `npm run offline` command stays the same for developers -- the `--stage offline` is added internally.

### Step 4: Handle Cognito CloudFormation references for offline stage

**File**: `backend/serverless.yml` (lines 33-34)

The environment variables `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` reference `!Ref LeagueUserPool` and `!Ref LeagueUserPoolClient` which are CloudFormation intrinsic functions. With a custom `offline` stage, these cannot resolve locally.

Check if the `serverless-offline` plugin already handles this gracefully (it typically provides mock values). If not, add explicit environment overrides in the `custom.serverless-offline.environment` block (line 117) with dummy values for these Cognito references, or add stage-based conditional environment variable maps.

**Why**: Lambda functions that validate JWT tokens need these values. For local development, the auth flow may use different values or be bypassed entirely.

### Step 5: Verify `IS_OFFLINE` environment variable behavior

**File**: `backend/serverless.yml` (line 118) and `backend/lib/dynamodb.ts` (line 20)

Confirm that `custom.serverless-offline.environment.IS_OFFLINE: 'true'` at line 118 still gets set correctly when using `--stage offline`. The `serverless-offline` plugin also sets `IS_OFFLINE=true` automatically. Verify that the `SLS_RUNTIME=nodejs20.x` prefix in the npm script continues to work.

**Why**: The `IS_OFFLINE` flag is used by `backend/lib/dynamodb.ts` (line 20) to point the DynamoDB client at `localhost:8000` instead of AWS. If this breaks, all local API calls will try to hit AWS DynamoDB.

### Step 6: Update the Local Development section of README.md

**File**: `README.md` (lines 535-543)

The Terminal 2 instructions at line 540 show `npm run offline`. Verify this still works after the script change. No user-facing command changes since `npm run offline` stays the same.

Add a brief note explaining that the `offline` stage disables CloudFormation stack splitting for local compatibility.

### Step 7: Test the fix end-to-end

Run `cd backend && npm run offline` and confirm:
- It starts successfully on port 3001 without split-stacks errors
- All API routes are registered in the output
- Hit `curl http://localhost:3001/dev/players` and verify a 200 response

## Dependencies & Order

1. **Step 1** must happen before or simultaneously with Step 2, because stage-based variables for `allowedOrigin`, `frontendBucket`, `frontendDomain`, and `certificateArn` must have `offline` entries to avoid resolution failures.
2. **Steps 2 and 3** are tightly coupled and should be done together.
3. **Step 4** (Cognito refs) should be verified after Steps 2-3 are complete.
4. **Step 5** is a verification step after the core changes.
5. **Step 6** (README) should be done last after verifying the fix works.

Recommended order: 1 -> 2 -> 3 -> 4 -> 5 -> 7 -> 6

## Testing & Verification

1. **Primary test**: Run `cd backend && npm run offline` and confirm it starts successfully on port 3001 without split-stacks errors. The output should show all API routes being registered.
2. **Smoke test local endpoints**: With the backend running, hit `curl http://localhost:3001/dev/players` and verify a 200 response (or empty array if no seed data).
3. **Full local stack test**: Start DynamoDB Local, run `npm run offline`, seed data, start the frontend, and verify the app loads at `http://localhost:3000`.
4. **Deploy still works**: Run `cd backend && npx serverless deploy --stage devtest --aws-profile league-szn` to the dev environment and confirm split-stacks is still active (check CloudFormation for nested stacks). Alternatively, run `npx serverless package --stage devtest` and inspect the `.serverless/` output for nested stack templates.
5. **No regressions in CI/CD**: Verify that the GitHub Actions workflows (`deploy-dev.yml` uses `--stage devtest`, `deploy-prod.yml` uses default `dev` stage) are unaffected since neither uses `--stage offline`.

## Risks & Edge Cases

1. **Stage variable resolution cascade**: Adding a new `offline` stage means every stage-based variable map in `custom` must include an `offline` entry or have a default fallback. The project uses `${self:custom.someMap.${self:provider.stage}, 'default'}` syntax with defaults in several places, but some maps may not have fallback patterns. Audit all stage-dependent variables.
2. **CloudFormation resource references in offline mode**: Lines 33-34 use `!Ref LeagueUserPool` and `!Ref LeagueUserPoolClient` which are CloudFormation intrinsic functions. With a custom `offline` stage, Serverless Framework may fail to resolve these. The `serverless-offline` plugin typically handles this, but test carefully.
3. **`perType: false` is not the same as unloading the plugin**: Even with all split flags set to `false`, the plugin still loads and hooks into the Serverless lifecycle. If the plugin itself causes errors during offline startup, the conditional config approach may not be sufficient. In that case, fall back to removing the plugin from the plugins list entirely for offline by creating a minimal override config.
4. **Seed and clear-data scripts**: The `npm run seed` and `npm run clear-data` scripts use `ts-node` directly (not `serverless offline`) so they are unaffected by this change.
5. **Table naming for offline stage**: DynamoDB table names in serverless.yml may use the stage name. Ensure tables for the `offline` stage either match the `dev` stage names or are handled by the `IS_OFFLINE` local DynamoDB endpoint override.
