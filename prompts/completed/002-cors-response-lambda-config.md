<objective>
Fix THREE related critical issues in the backend API configuration layer — CORS preflight/response mismatch, wildcard CORS fallback, missing security headers, and Lambda timeout for recordResult. These all center on `backend/lib/response.ts` and `backend/serverless.yml`.
</objective>

<context>
This is a WWE 2K League Management serverless backend (Serverless Framework v3 + Node.js 24.x + TypeScript on AWS Lambda + API Gateway).

Current state:
- `backend/lib/response.ts` line 5: `'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*'` — the `|| '*'` fallback combined with `Access-Control-Allow-Credentials: true` is INVALID per CORS spec and browsers reject it
- `backend/serverless.yml`: Every function uses `cors: true` which generates `Access-Control-Allow-Origin: *` for OPTIONS preflight, but Lambda responses return the stage-specific origin — this mismatch breaks credentialed requests
- `backend/serverless.yml` line 254: `recordResult` function has no explicit `timeout` — defaults to 6s, but it now awaits `Promise.allSettled()` for ranking recalculations that take 3-8+ seconds
- `backend/lib/response.ts`: Missing standard security headers (X-Content-Type-Options, X-Frame-Options, Cache-Control, Strict-Transport-Security)

The `custom.allowedOrigin` map already exists in serverless.yml:
```yaml
custom:
  allowedOrigin:
    dev: https://leagueszn.jpdxsolo.com
    devtest: https://dev.leagueszn.jpdxsolo.com
    prod: https://leagueszn.jpdxsolo.com
```

Files to modify:
- `backend/lib/response.ts`
- `backend/serverless.yml`
</context>

<requirements>
1. Read both files first to confirm current state

2. **Fix response.ts** — update the shared `headers` object:
   - Change CORS fallback from `|| '*'` to `|| 'https://leagueszn.jpdxsolo.com'` (production domain as safe fallback instead of wildcard)
   - Add security headers:
     - `'X-Content-Type-Options': 'nosniff'`
     - `'X-Frame-Options': 'DENY'`
     - `'Cache-Control': 'no-store'`
     - `'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'`

3. **Fix CORS in serverless.yml** — replace ALL instances of `cors: true` with explicit CORS config:
   ```yaml
   cors:
     origin: ${self:custom.allowedOrigin.${self:provider.stage}, 'https://leagueszn.jpdxsolo.com'}
     headers:
       - Content-Type
       - X-Amz-Date
       - Authorization
       - X-Api-Key
       - X-Amz-Security-Token
       - X-Amz-User-Agent
     allowCredentials: true
   ```
   IMPORTANT: There are many functions with `cors: true`. Replace ALL of them consistently. Use a YAML anchor (`&corsConfig`) at the first occurrence and alias (`*corsConfig`) for all subsequent ones to keep the file DRY.

4. **Add timeout to recordResult** — add `timeout: 29` to the recordResult function definition in serverless.yml (API Gateway max is 29s):
   ```yaml
   recordResult:
     handler: functions/matches/recordResult.handler
     timeout: 29
     events:
   ```

5. Do NOT modify any other files
</requirements>

<implementation>
For the YAML anchor approach in serverless.yml, define the anchor in the `custom` section:
```yaml
custom:
  corsConfig: &corsConfig
    origin: ${self:custom.allowedOrigin.${self:provider.stage}, 'https://leagueszn.jpdxsolo.com'}
    headers:
      - Content-Type
      - X-Amz-Date
      - Authorization
      - X-Api-Key
      - X-Amz-Security-Token
      - X-Amz-User-Agent
    allowCredentials: true
```

Then every function event becomes:
```yaml
  cors: *corsConfig
```

For response.ts, the headers block becomes:
```typescript
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://leagueszn.jpdxsolo.com',
  'Access-Control-Allow-Credentials': true,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};
```
</implementation>

<verification>
After making changes:
1. Verify `response.ts` no longer contains `|| '*'`
2. Verify `response.ts` has all 4 security headers
3. Verify `serverless.yml` has NO remaining `cors: true` (search for it)
4. Verify `serverless.yml` recordResult has `timeout: 29`
5. Verify YAML is syntactically valid: `cd backend && npx serverless print --stage dev 2>&1 | head -20` (or just check with a YAML parser)
6. Verify TypeScript compiles: `cd backend && npx tsc --noEmit`
</verification>

<success_criteria>
- Zero instances of `cors: true` remain in serverless.yml
- Zero instances of `|| '*'` remain in response.ts
- recordResult function has `timeout: 29`
- All CORS configs reference the stage-specific origin with credentials
- Security headers present in every API response
- Both files parse/compile without errors
</success_criteria>
