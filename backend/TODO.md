# Backend Code Review - Action Items

This document tracks issues identified during the comprehensive backend code review.

---

## Critical Issues (Must Fix Immediately)

### 1. ~~Unused/Missing Dependencies~~ COMPLETED
- **Location:** `package.json`
- **Issue:** `jsonwebtoken` is listed but `aws-jwt-verify` is actually used; AWS SDK versions are inconsistent
- **Fix:**
  - [x] Remove `jsonwebtoken` and `@types/jsonwebtoken` from dependencies
  - [x] Align all AWS SDK packages to version 3.982.0

### 2. ~~Race Conditions in recordResult.ts~~ COMPLETED
- **Location:** `functions/matches/recordResult.ts`
- **Issue:** Multiple DynamoDB operations without transactions can cause data inconsistency
- **Fix:**
  - [x] Refactor to use `TransactWriteCommand` for atomic updates
  - [x] Group match update + player standings + season standings + championship updates in single transaction
  - [x] Add optimistic locking with version fields

### 3. ~~Inefficient Scan Operations~~ COMPLETED
- **Location:** `functions/matches/recordResult.ts`, `functions/players/deletePlayer.ts`
- **Issue:** Full table scans instead of targeted queries
- **Fix:**
  - [ ] Add GSI to Championships table for `isActive` + `currentChampion` queries (deferred - small table)
  - [x] Use Query instead of Scan for match lookup in recordResult.ts
  - [ ] Update deletePlayer.ts to use GSI query for championship check (deferred - small table)

### 4. ~~Insecure Admin Setup Endpoint~~ COMPLETED
- **Location:** `functions/auth/createAdminUser.ts`
- **Issue:** `ADMIN_SETUP_KEY` validation happens after Cognito operations
- **Fix:**
  - [x] Move `ADMIN_SETUP_KEY` validation to the very beginning of the handler
  - [x] Return 401 immediately if key is missing or invalid
  - [x] Use timing-safe comparison to prevent timing attacks
  - [ ] Add rate limiting to prevent brute force attacks (optional enhancement)

### 5. ~~Missing Input Validation in scheduleMatch~~ COMPLETED
- **Location:** `functions/matches/scheduleMatch.ts`
- **Issue:** No validation that participants exist, championship/tournament/season references are valid
- **Fix:**
  - [x] Add player existence validation before scheduling
  - [x] Validate championshipId references valid championship
  - [x] Validate tournamentId references valid tournament
  - [x] Validate seasonId references valid/active season
  - [x] Check for duplicate participants in array

---

## High Priority Issues (Warning)

### 6. ~~Authorizer JWT Caching Issues~~ COMPLETED
- **Location:** `functions/auth/authorizer.ts`
- **Issue:** JWT verifier created per-request instead of reusing across invocations
- **Fix:**
  - [x] Move `CognitoJwtVerifier.create()` outside handler function
  - [x] Initialize once at module level for Lambda container reuse

  *Note: This was already correctly implemented - verifier is at module level (lines 8-12)*

### 7. ~~Missing Pagination in Data Retrieval~~ COMPLETED
- **Location:** `functions/standings/getStandings.ts`, `functions/admin/clearAll.ts`
- **Issue:** Scan operations don't handle pagination; will fail for >1MB results
- **Fix:**
  - [x] Create `scanAll` helper in `lib/dynamodb.ts`
  - [x] Create `queryAll` helper in `lib/dynamodb.ts`
  - [x] Update getStandings.ts to use scanAll/queryAll
  - [x] Update clearAll.ts to use scanAll for paginated deletion

### 8. TypeScript Type Safety Issues
- **Location:** Multiple files
- **Issue:** Inconsistent use of `any` types, missing interface definitions
- **Fix:**
  - [ ] Create `lib/types.ts` with all shared interfaces:
    - Player, Match, Championship, Tournament, Season, Division
    - CreatePlayerBody, UpdatePlayerBody, ScheduleMatchBody, etc.
  - [ ] Update all handlers to import and use typed interfaces
  - [ ] Replace `Record<string, any>` with specific types

### 9. Overly Permissive S3 Bucket Configuration
- **Location:** `serverless.yml` (ImagesBucket resource)
- **Issue:** Public read access on entire bucket, no lifecycle policies
- **Fix:**
  - [ ] Add CloudFront OAI for secure access
  - [ ] Remove public bucket policy
  - [ ] Add lifecycle rules for orphaned images:
    ```yaml
    LifecycleConfiguration:
      Rules:
        - Id: DeleteOrphanedImages
          Status: Enabled
          Prefix: temp/
          ExpirationInDays: 1
    ```

### 10. No API Rate Limiting/Throttling
- **Location:** `serverless.yml`
- **Issue:** Lambda functions have no throttling configuration
- **Fix:**
  - [ ] Add API Gateway throttling:
    ```yaml
    provider:
      apiGateway:
        throttle:
          burstLimit: 200
          rateLimit: 100
    ```
  - [ ] Add `reservedConcurrency` for expensive operations (recordResult, clearAll)

---

## Medium Priority Issues (Informational)

### 11. Environment Variable Validation
- **Location:** `lib/dynamodb.ts`
- **Issue:** Non-null assertion (`!`) on env vars without runtime validation
- **Fix:**
  - [ ] Add startup validation for required environment variables
  - [ ] Fail fast with clear error message if env vars missing
  ```typescript
  const requiredEnvVars = ['PLAYERS_TABLE', 'MATCHES_TABLE', ...];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
  ```

### 12. Missing Input Sanitization
- **Location:** Multiple handler files (createPlayer, createChampionship, etc.)
- **Issue:** User input not sanitized before storage (XSS prevention)
- **Fix:**
  - [ ] Create `lib/sanitize.ts` utility:
    ```typescript
    export const sanitizeString = (input: string, maxLength = 255): string => {
      return input.trim().slice(0, maxLength).replace(/[\x00-\x1F\x7F]/g, '');
    };
    ```
  - [ ] Apply sanitization to all user-provided strings
  - [ ] Validate URL format for imageUrl fields

### 13. ~~Inconsistent HTTP Status Codes~~ COMPLETED
- **Location:** `lib/response.ts` and handler files
- **Issue:** Delete returns 200 instead of 204; missing 409 Conflict for business logic errors
- **Fix:**
  - [x] Add `noContent()` helper returning 204
  - [x] Add `conflict()` helper returning 409
  - [x] Update delete handlers to use `noContent()`
  - [x] Use `conflict()` for "active season exists" errors

### 14. No CloudWatch Alarms
- **Location:** `serverless.yml`
- **Issue:** No monitoring for Lambda errors, DynamoDB throttling, or API 5xx errors
- **Fix:**
  - [ ] Add SNS topic for alerts
  - [ ] Add Lambda error alarm (threshold: 5 errors in 5 min)
  - [ ] Add DynamoDB throttle alarm
  - [ ] Add API Gateway 5xx alarm
  - [ ] Add Lambda duration alarm (threshold: 5 seconds)

### 15. No Database Backup/PITR
- **Location:** `serverless.yml` (DynamoDB tables)
- **Issue:** No Point-in-Time Recovery; data loss risk from clearAll or accidents
- **Fix:**
  - [ ] Enable PITR on all DynamoDB tables:
    ```yaml
    PointInTimeRecoverySpecification:
      PointInTimeRecoveryEnabled: true
    ```
  - [ ] Consider AWS Backup plan for scheduled backups
  - [ ] Enable DynamoDB Streams for audit trail

### 16. Cold Start Performance
- **Location:** All Lambda functions
- **Issue:** Large bundle sizes increase cold start time
- **Fix:**
  - [ ] Add `serverless-esbuild` plugin for optimized bundling
  - [ ] Enable tree-shaking and minification
  - [ ] Consider Lambda layers for shared dependencies
  - [ ] Target cold start under 1 second

---

## Low Priority Issues

### 17. CORS Configuration Improvements
- **Location:** `serverless.yml`, `lib/response.ts`
- **Issue:** Using `*` for Access-Control-Allow-Origin instead of specific domains
- **Fix:**
  - [ ] Configure explicit allowed origins in API Gateway
  - [ ] Add `Vary: Origin` header for proper caching
  - [ ] Use specific domains in production

### 18. No API Versioning
- **Location:** `serverless.yml` (API paths)
- **Issue:** No versioning strategy for breaking changes
- **Fix:**
  - [ ] Consider adding `/v1/` prefix to all endpoints
  - [ ] Add `API-Version` response header
  - [ ] Document versioning strategy

### 19. Missing Response Compression
- **Location:** API Gateway configuration
- **Issue:** Responses not compressed; larger payload sizes
- **Fix:**
  - [ ] Enable API Gateway response compression for responses >1KB
  - [ ] Set minimum compression size appropriately

### 20. Logging Improvements
- **Location:** All handler files
- **Issue:** Inconsistent logging; using console.error without structured format
- **Fix:**
  - [ ] Create structured logging utility
  - [ ] Include request ID in all logs
  - [ ] Use appropriate log levels (info, warn, error)
  - [ ] Add correlation IDs for tracing

---

## Summary

| Priority | Total | Completed |
|----------|-------|-----------|
| Critical | 5 | 5 |
| High | 5 | 3 |
| Medium | 6 | 1 |
| Low | 4 | 0 |
| **Total** | **20** | **9** |

---

## Files to Create

- [ ] `lib/types.ts` - Shared TypeScript interfaces
- [ ] `lib/sanitize.ts` - Input sanitization utilities
- [x] `lib/pagination.ts` - DynamoDB pagination helpers (added to dynamodb.ts)

---

## Files to Modify

- [x] `package.json` - Remove unused deps, align SDK versions
- [ ] `serverless.yml` - Add PITR, throttling, alarms, GSIs
- [x] `lib/dynamodb.ts` - Add pagination helpers (scanAll, queryAll)
- [x] `lib/response.ts` - Add noContent(), conflict() helpers
- [x] `functions/auth/authorizer.ts` - Move JWT verifier to module level
- [x] `functions/auth/createAdminUser.ts` - Fix setup key validation order
- [x] `functions/matches/recordResult.ts` - Add transactions, fix scans
- [x] `functions/matches/scheduleMatch.ts` - Add input validation
- [x] `functions/players/deletePlayer.ts` - Update to use noContent/conflict
- [x] `functions/standings/getStandings.ts` - Add pagination
- [x] `functions/admin/clearAll.ts` - Add pagination for batch delete

---

## Recommended Execution Order

1. **Fix dependencies** - Blocks deployment if broken
2. **Add input validation** - Prevents data corruption
3. **Implement transactions in recordResult** - Prevents race conditions
4. **Optimize database queries** - Reduces costs
5. **Add monitoring and backups** - Operational excellence
6. **Improve security** - Prevents exploits
7. **Optimize performance** - Improves UX
