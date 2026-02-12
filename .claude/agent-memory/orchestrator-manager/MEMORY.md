# Orchestrator Manager Memory

## Project: League SZN (WWE 2K League)

### Architecture
- Frontend: React 18 + TypeScript + Vite, React Router DOM 6, i18next, AWS Amplify/Cognito
- Backend: Node.js 20 + TypeScript Lambdas, Serverless Framework 3, DynamoDB, S3, API Gateway
- E2E: Playwright
- CI/CD: GitHub Actions (deploy-dev.yml, deploy-prod.yml)
- Two environments: prod (stage=dev) and devtest (stage=devtest)

### Key File Paths
- Frontend entry: /frontend/src/App.tsx
- Frontend API service: /frontend/src/services/api.ts
- Frontend auth: /frontend/src/services/cognito.ts, /frontend/src/contexts/AuthContext.tsx
- Backend Lambda handlers: /backend/functions/ (17 domain folders, 66+ handlers)
- Backend shared libs: /backend/lib/dynamodb.ts, response.ts, auth.ts, rankingCalculator.ts
- Types: /frontend/src/types/ (7 files), /frontend/src/types/index.ts is the core
- Config: /frontend/vite.config.ts, /backend/serverless.yml, /backend/tsconfig.json

### Build Status (as of 2026-02-11)
- Both frontend and backend compile cleanly (zero TypeScript errors)
- ESLint: 1 error (WrestlerCosts.tsx no-case-declarations), 2 warnings (react-refresh contexts)

### Known Code Quality Patterns
- Backend uses `Record<string, any>` extensively (30+ occurrences) -- should use `unknown`
- response.ts helpers use `any` for data param
- Frontend statistics/ and fantasy/ components use raw console.error instead of logger utility
- Mock data still imported by AdminChallenges, AdminPromos, FantasyLanding (intentional placeholders)
- createEvent.ts ignores body.fantasyEnabled (hardcoded to true)
- authorizer.ts logs full event payload including tokens (security concern)

### Conventions
- Code style: TypeScript, functional components with hooks, async/await, no .then chains
- Git workflow: main branch, feat/* for features, fix/* for bug fixes
- Backend pattern: each Lambda handler exports `handler: APIGatewayProxyHandler`
- Frontend pattern: components import from services/api.ts, use contexts for auth and site config
