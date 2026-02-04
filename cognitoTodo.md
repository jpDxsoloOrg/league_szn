# Cognito Authentication Architecture Improvement Plan

## Executive Summary

The League Szn application currently shares a single Cognito User Pool (`us-east-1_o0xMTyzI5`) between development and production environments. Combined with AWS Amplify's default behavior of storing authentication tokens in localStorage (which persists across browser sessions), this creates token collision issues when users switch between environments. A temporary workaround of calling `signOut()` before every `signIn()` has been implemented to clear stale sessions.

This document outlines three architectural approaches to resolve these issues:
- **Option A**: Create separate Cognito User Pools for dev and prod (recommended)
- **Option B**: Configure Amplify to use sessionStorage instead of localStorage
- **Option C**: Hybrid approach combining environment-prefixed storage keys with separate pools

---

## Current State Analysis

### Infrastructure
- **Shared Cognito User Pool**: `us-east-1_o0xMTyzI5`
- **Shared Client ID**: `5loqna6cm7ip5cka75koovla07`
- **Backend**: Serverless Framework creates a new Cognito User Pool per stage (see `serverless.yml` lines 382-414), but the frontend hardcodes the shared pool
- **Environments**:
  - Dev: `dev.leagueszn.jpdxsolo.com` (deployed via `deploy-dev.yml`)
  - Prod: `leagueszn.jpdxsolo.com` (deployed via `deploy-prod.yml`)

### Current Token Storage
- Application stores tokens in `sessionStorage` (see `cognito.ts` lines 64-65, 111-112)
- However, Amplify internally uses `localStorage` for its own session management
- The `signOut()` before `signIn()` workaround (lines 39-43) attempts to clear Amplify's internal cache

### Key Observation
The `serverless.yml` already defines stage-specific Cognito resources (`AdminUserPool` and `AdminUserPoolClient`), but the CI/CD workflows hardcode the shared pool IDs instead of using the dynamically created ones. This is the root cause of the issue.

---

## Option A: Separate Cognito User Pools for Dev/Prod (RECOMMENDED)

### Overview
Leverage the existing Serverless Framework configuration to create separate Cognito User Pools per stage and update the CI/CD pipelines to use the correct pool for each environment.

### Pros
- Complete isolation between environments
- Eliminates all token collision issues
- Can have different password policies or settings per environment
- Follows AWS security best practices
- Infrastructure already defined in `serverless.yml`
- No code changes to frontend authentication logic

### Cons
- Requires re-creating admin users in each pool
- Slight increase in AWS resources (minimal cost impact)
- Need to update CI/CD to fetch dynamic Cognito IDs

### AWS Resources Required
No new resources need to be created. The existing `serverless.yml` already defines:
- `AdminUserPool` (line 383-395)
- `AdminUserPoolClient` (line 397-414)

These are created per stage automatically via the `${self:provider.stage}` variable.

### Code Changes Required

#### 1. File: `/home/jpdev/source/league_szn/league_szn/.github/workflows/deploy-dev.yml`

**Current (lines 47-50):**
```yaml
env:
  VITE_API_BASE_URL: ${{ secrets.DEV_API_BASE_URL }}
  VITE_COGNITO_USER_POOL_ID: us-east-1_o0xMTyzI5
  VITE_COGNITO_CLIENT_ID: 5loqna6cm7ip5cka75koovla07
```

**Change to:**
```yaml
env:
  VITE_API_BASE_URL: ${{ secrets.DEV_API_BASE_URL }}
  VITE_COGNITO_USER_POOL_ID: ${{ secrets.DEV_COGNITO_USER_POOL_ID }}
  VITE_COGNITO_CLIENT_ID: ${{ secrets.DEV_COGNITO_CLIENT_ID }}
```

**Add step after backend deploy (after line 62):**
```yaml
- name: Get Cognito IDs from CloudFormation
  id: cognito
  run: |
    USER_POOL_ID=$(aws cloudformation describe-stacks \
      --stack-name wwe-2k-league-api-devtest \
      --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
      --output text)
    CLIENT_ID=$(aws cloudformation describe-stacks \
      --stack-name wwe-2k-league-api-devtest \
      --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolClientId'].OutputValue" \
      --output text)
    echo "user_pool_id=$USER_POOL_ID" >> $GITHUB_OUTPUT
    echo "client_id=$CLIENT_ID" >> $GITHUB_OUTPUT

- name: Rebuild frontend with correct Cognito IDs
  working-directory: frontend
  run: npm run build -- --mode devtest
  env:
    VITE_API_BASE_URL: ${{ secrets.DEV_API_BASE_URL }}
    VITE_COGNITO_USER_POOL_ID: ${{ steps.cognito.outputs.user_pool_id }}
    VITE_COGNITO_CLIENT_ID: ${{ steps.cognito.outputs.client_id }}
    VITE_AWS_REGION: us-east-1
```

#### 2. File: `/home/jpdev/source/league_szn/league_szn/.github/workflows/deploy-prod.yml`

**Current (lines 47-50):**
```yaml
env:
  VITE_API_BASE_URL: ${{ secrets.PROD_API_BASE_URL }}
  VITE_COGNITO_USER_POOL_ID: us-east-1_o0xMTyzI5
  VITE_COGNITO_CLIENT_ID: 5loqna6cm7ip5cka75koovla07
```

**Change to (same pattern as dev):**
```yaml
# Remove the frontend build before backend deploy, or move it after
```

**Add step after backend deploy (after line 62):**
```yaml
- name: Get Cognito IDs from CloudFormation
  id: cognito
  run: |
    USER_POOL_ID=$(aws cloudformation describe-stacks \
      --stack-name wwe-2k-league-api-dev \
      --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
      --output text)
    CLIENT_ID=$(aws cloudformation describe-stacks \
      --stack-name wwe-2k-league-api-dev \
      --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolClientId'].OutputValue" \
      --output text)
    echo "user_pool_id=$USER_POOL_ID" >> $GITHUB_OUTPUT
    echo "client_id=$CLIENT_ID" >> $GITHUB_OUTPUT

- name: Build frontend with correct Cognito IDs
  working-directory: frontend
  run: npm run build
  env:
    VITE_API_BASE_URL: ${{ secrets.PROD_API_BASE_URL }}
    VITE_COGNITO_USER_POOL_ID: ${{ steps.cognito.outputs.user_pool_id }}
    VITE_COGNITO_CLIENT_ID: ${{ steps.cognito.outputs.client_id }}
    VITE_AWS_REGION: us-east-1
```

#### 3. File: `/home/jpdev/source/league_szn/league_szn/frontend/.env.devtest`

**Current:**
```
VITE_COGNITO_USER_POOL_ID=us-east-1_o0xMTyzI5
VITE_COGNITO_CLIENT_ID=5loqna6cm7ip5cka75koovla07
```

**Change to (placeholder for local development):**
```
VITE_COGNITO_USER_POOL_ID=<DEV_POOL_ID_FROM_AWS>
VITE_COGNITO_CLIENT_ID=<DEV_CLIENT_ID_FROM_AWS>
```

#### 4. File: `/home/jpdev/source/league_szn/league_szn/frontend/.env.production`

**Change to:**
```
VITE_COGNITO_USER_POOL_ID=<PROD_POOL_ID_FROM_AWS>
VITE_COGNITO_CLIENT_ID=<PROD_CLIENT_ID_FROM_AWS>
```

#### 5. File: `/home/jpdev/source/league_szn/league_szn/frontend/src/services/cognito.ts`

**Remove the workaround (lines 37-43):**
```typescript
// Current workaround - can be removed after implementing Option A
try {
  await signOut();
} catch {
  // Ignore errors from signOut - user may not be signed in
}
```

### Migration Considerations

1. **Existing Users**: Admin users in the shared pool will not exist in the new stage-specific pools
   - Action: Create new admin users in each pool using `aws cognito-idp admin-create-user`
   - The application has an `/auth/setup` endpoint for this purpose

2. **Deployment Order**:
   - Deploy backend first (creates the Cognito pools)
   - Retrieve pool IDs from CloudFormation outputs
   - Build and deploy frontend with correct IDs

3. **Rollback Strategy**:
   - Keep the old shared pool active until new pools are verified
   - Can revert CI/CD to use hardcoded IDs if needed

### Step-by-Step Implementation Instructions for Agents

```
## Phase 1: Update CI/CD Workflow Files
Prerequisites: None
Estimated Complexity: Low

### Steps:
1. Open `/home/jpdev/source/league_szn/league_szn/.github/workflows/deploy-dev.yml`
   - Move the "Build frontend" step to AFTER "Deploy backend to dev"
   - Add a new step "Get Cognito IDs from CloudFormation" between backend deploy and frontend build
   - Update the frontend build step to use the outputs from the Cognito step
   - Validation: YAML syntax is valid, step references are correct

2. Open `/home/jpdev/source/league_szn/league_szn/.github/workflows/deploy-prod.yml`
   - Apply the same pattern as deploy-dev.yml
   - Ensure stack name is `wwe-2k-league-api-dev` (prod uses 'dev' stage per current config)
   - Validation: YAML syntax is valid, step references are correct

### Testing Criteria:
- Run `yamllint` on both workflow files
- Verify CloudFormation output names match serverless.yml exports

## Phase 2: Update Environment Files
Prerequisites: Phase 1 complete
Estimated Complexity: Low

### Steps:
1. Update `/home/jpdev/source/league_szn/league_szn/frontend/.env.devtest`
   - Add comment indicating values are overridden in CI/CD
   - Keep placeholder values for documentation

2. Update `/home/jpdev/source/league_szn/league_szn/frontend/.env.production`
   - Add comment indicating values are overridden in CI/CD
   - Keep placeholder values for documentation

### Testing Criteria:
- Local development still works with .env (not .env.devtest or .env.production)

## Phase 3: Remove Workaround from cognito.ts
Prerequisites: Phase 1 and 2 deployed and verified
Estimated Complexity: Low

### Steps:
1. Open `/home/jpdev/source/league_szn/league_szn/frontend/src/services/cognito.ts`
   - Remove the try/catch block that calls signOut() before signIn() (lines 37-43)
   - Update the logger.debug message if needed
   - Validation: TypeScript compiles without errors

### Testing Criteria:
- Login works correctly on dev environment
- Login works correctly on prod environment
- Switching between environments does not cause token conflicts

## Phase 4: Create Admin Users in New Pools
Prerequisites: Backend deployed with new pools
Estimated Complexity: Low

### Steps:
1. Get the new User Pool IDs from AWS Console or CloudFormation
2. For each environment, create admin user:
   ```bash
   aws cognito-idp admin-create-user \
     --user-pool-id <POOL_ID> \
     --username <ADMIN_USERNAME> \
     --temporary-password <TEMP_PASSWORD> \
     --message-action SUPPRESS

   aws cognito-idp admin-set-user-password \
     --user-pool-id <POOL_ID> \
     --username <ADMIN_USERNAME> \
     --password <PERMANENT_PASSWORD> \
     --permanent
   ```

### Testing Criteria:
- Can log in to dev environment with dev admin credentials
- Can log in to prod environment with prod admin credentials
```

---

## Option B: Configure Amplify to Use sessionStorage

### Overview
Configure AWS Amplify to use sessionStorage instead of localStorage for token persistence. This prevents tokens from persisting across browser sessions and isolates tokens per tab.

### Pros
- Simple code change
- No infrastructure changes needed
- Immediate fix for token collision

### Cons
- Users must re-authenticate every time they open a new browser session
- Tokens don't persist across tabs (each tab requires separate login)
- Does not solve the fundamental issue of shared user pools
- Poor user experience for frequent users

### Code Changes Required

#### 1. File: `/home/jpdev/source/league_szn/league_szn/frontend/src/services/cognito.ts`

**Add custom storage adapter before Amplify.configure():**

```typescript
import { Amplify } from 'aws-amplify';
import { signIn, signOut, fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { logger } from '../utils/logger';

// Custom storage adapter using sessionStorage
const sessionStorageAdapter = {
  setItem(key: string, value: string): void {
    sessionStorage.setItem(key, value);
  },
  getItem(key: string): string | null {
    return sessionStorage.getItem(key);
  },
  removeItem(key: string): void {
    sessionStorage.removeItem(key);
  },
  clear(): void {
    sessionStorage.clear();
  },
};

// Cognito configuration from environment variables
const cognitoConfig = {
  userPoolId: import.meta.env['VITE_COGNITO_USER_POOL_ID'] ?? '',
  userPoolClientId: import.meta.env['VITE_COGNITO_CLIENT_ID'] ?? '',
  region: import.meta.env['VITE_AWS_REGION'] ?? 'us-east-1',
};

// Configure Amplify with custom storage
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: cognitoConfig.userPoolId,
      userPoolClientId: cognitoConfig.userPoolClientId,
    },
  },
}, {
  storage: sessionStorageAdapter,
});
```

**Note**: Amplify v6 changed how storage is configured. The exact API may vary. Alternative approach using `cognitoUserPoolsTokenProvider`:

```typescript
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';

// Set up session storage for token provider
cognitoUserPoolsTokenProvider.setKeyValueStorage({
  setItem(key: string, value: string): Promise<void> {
    sessionStorage.setItem(key, value);
    return Promise.resolve();
  },
  getItem(key: string): Promise<string | null> {
    return Promise.resolve(sessionStorage.getItem(key));
  },
  removeItem(key: string): Promise<void> {
    sessionStorage.removeItem(key);
    return Promise.resolve();
  },
  clear(): Promise<void> {
    sessionStorage.clear();
    return Promise.resolve();
  },
});
```

### Impact on User Experience

| Scenario | Current Behavior | With sessionStorage |
|----------|------------------|---------------------|
| Close and reopen browser | Stay logged in | Must re-authenticate |
| Open new tab | Authenticated | Must re-authenticate |
| Refresh page | Stay logged in | Stay logged in |
| Switch dev/prod in same tab | Token conflict | No conflict |

### Step-by-Step Implementation Instructions for Agents

```
## Phase 1: Implement Custom Storage Adapter
Prerequisites: None
Estimated Complexity: Low

### Steps:
1. Open `/home/jpdev/source/league_szn/league_szn/frontend/src/services/cognito.ts`
   - Import `cognitoUserPoolsTokenProvider` from 'aws-amplify/auth/cognito'
   - Create async storage adapter wrapping sessionStorage
   - Call `cognitoUserPoolsTokenProvider.setKeyValueStorage()` before any auth operations
   - Validation: TypeScript compiles without errors

2. Test locally:
   - npm run dev
   - Login, verify tokens stored in sessionStorage (not localStorage)
   - Close browser, reopen, verify must re-login
   - Validation: DevTools shows tokens in sessionStorage only

### Testing Criteria:
- No tokens appear in localStorage after login
- Tokens appear in sessionStorage after login
- Closing browser clears authentication state
- Refreshing page maintains authentication state

## Phase 2: Remove signOut Workaround
Prerequisites: Phase 1 tested and verified
Estimated Complexity: Low

### Steps:
1. Remove the signOut() call before signIn() in cognito.ts
   - Lines 37-43 can be removed
   - Validation: Login still works correctly

### Testing Criteria:
- Login works on first attempt without pre-clearing session
```

---

## Option C: Hybrid Approach

### Overview
Combine environment-aware storage keys with the long-term goal of separate pools. This provides immediate relief while maintaining good UX.

### Implementation

#### Immediate Fix: Environment-Prefixed Storage Keys

Create a custom storage adapter that prefixes all keys with the environment:

```typescript
const getEnvironmentPrefix = (): string => {
  const hostname = window.location.hostname;
  if (hostname.includes('dev.')) return 'dev_';
  if (hostname === 'localhost') return 'local_';
  return 'prod_';
};

const environmentAwareStorage = {
  setItem(key: string, value: string): Promise<void> {
    const prefixedKey = `${getEnvironmentPrefix()}${key}`;
    localStorage.setItem(prefixedKey, value);
    return Promise.resolve();
  },
  getItem(key: string): Promise<string | null> {
    const prefixedKey = `${getEnvironmentPrefix()}${key}`;
    return Promise.resolve(localStorage.getItem(prefixedKey));
  },
  removeItem(key: string): Promise<void> {
    const prefixedKey = `${getEnvironmentPrefix()}${key}`;
    localStorage.removeItem(prefixedKey);
    return Promise.resolve();
  },
  clear(): Promise<void> {
    const prefix = getEnvironmentPrefix();
    Object.keys(localStorage)
      .filter(key => key.startsWith(prefix))
      .forEach(key => localStorage.removeItem(key));
    return Promise.resolve();
  },
};
```

### Pros
- Maintains good UX (sessions persist)
- Provides environment isolation
- Can be implemented immediately
- Compatible with future migration to separate pools

### Cons
- More complex code
- Still sharing a single user pool (security concern)
- Does not follow AWS best practices

### When to Use
- As a bridge solution while planning Option A
- If separate pools are not feasible due to cost or complexity constraints

---

## Recommendation

**Option A (Separate Cognito User Pools) is strongly recommended** for the following reasons:

1. **Infrastructure Already Exists**: The `serverless.yml` already defines stage-specific Cognito resources. The fix is primarily in CI/CD configuration, not infrastructure creation.

2. **Security Best Practice**: Isolating environments is a fundamental security principle. Dev and prod should never share authentication infrastructure.

3. **Clean Solution**: Completely eliminates the root cause rather than working around it.

4. **Minimal Code Changes**: The only code change is removing the workaround. No new code complexity.

5. **No UX Degradation**: Unlike Option B, users maintain their session persistence expectations.

6. **Future-Proof**: If you ever need different authentication settings per environment (e.g., MFA in prod only), you're already set up.

### Implementation Priority

1. **Immediate**: Implement Option A (estimated effort: 2-4 hours)
2. **Optional**: If quick fix needed before full implementation, apply Option C as a bridge

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review this document with team
- [ ] Identify current admin users that need to be recreated
- [ ] Document current admin credentials securely

### Phase 1: CI/CD Updates
- [ ] Update `deploy-dev.yml` to fetch Cognito IDs from CloudFormation
- [ ] Update `deploy-prod.yml` to fetch Cognito IDs from CloudFormation
- [ ] Move frontend build step after backend deploy in both workflows
- [ ] Test workflow syntax with `yamllint` or similar

### Phase 2: Deploy and Verify Backend
- [ ] Deploy backend to devtest stage
- [ ] Verify Cognito User Pool created (check CloudFormation outputs)
- [ ] Record new devtest pool ID and client ID
- [ ] Deploy backend to dev stage (production)
- [ ] Verify Cognito User Pool created
- [ ] Record new prod pool ID and client ID

### Phase 3: Create Admin Users
- [ ] Create admin user in devtest Cognito pool
- [ ] Set permanent password for devtest admin
- [ ] Verify devtest admin can authenticate
- [ ] Create admin user in prod Cognito pool
- [ ] Set permanent password for prod admin
- [ ] Verify prod admin can authenticate

### Phase 4: Deploy Frontend
- [ ] Deploy dev frontend (workflow will use new pool IDs)
- [ ] Test login on dev.leagueszn.jpdxsolo.com
- [ ] Deploy prod frontend
- [ ] Test login on leagueszn.jpdxsolo.com

### Phase 5: Cleanup
- [ ] Remove signOut workaround from cognito.ts
- [ ] Update .env.devtest with new pool IDs (for documentation)
- [ ] Update .env.production with new pool IDs (for documentation)
- [ ] Test switching between dev and prod in same browser
- [ ] Consider decommissioning old shared pool (after grace period)

### Verification Tests
- [ ] Login works on dev environment
- [ ] Login works on prod environment
- [ ] Admin operations (create player, etc.) work on dev
- [ ] Admin operations work on prod
- [ ] Opening both environments in same browser works without conflict
- [ ] Token refresh works correctly
- [ ] Logout works correctly

---

## Files Reference

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `/home/jpdev/source/league_szn/league_szn/frontend/src/services/cognito.ts` | Frontend auth logic | Remove signOut workaround |
| `/home/jpdev/source/league_szn/league_szn/.github/workflows/deploy-dev.yml` | Dev deployment | Fetch dynamic Cognito IDs |
| `/home/jpdev/source/league_szn/league_szn/.github/workflows/deploy-prod.yml` | Prod deployment | Fetch dynamic Cognito IDs |
| `/home/jpdev/source/league_szn/league_szn/backend/serverless.yml` | Infrastructure definition | No changes (already correct) |
| `/home/jpdev/source/league_szn/league_szn/frontend/.env.devtest` | Dev environment vars | Update with new pool IDs |
| `/home/jpdev/source/league_szn/league_szn/frontend/.env.production` | Prod environment vars | Update with new pool IDs |
| `/home/jpdev/source/league_szn/league_szn/backend/functions/auth/authorizer.ts` | Token validation | No changes (uses env vars) |

---

## Open Questions

1. **Admin User Migration**: Should we use the same credentials in both pools, or different ones for security?
2. **Old Pool Decommission**: How long should we keep the old shared pool active?
3. **Local Development**: Which pool should local development use? (Recommend: devtest pool)
4. **E2E Tests**: Do E2E tests need separate test users per environment?
