# E2E Tests for WWE 2K League Management

Automated end-to-end tests using Playwright for comprehensive site verification.

## Quick Start

```bash
# Install dependencies
npm install

# Install browsers
npx playwright install

# Run all tests against dev environment
npm run test:dev
```

## Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests (default: dev environment) |
| `npm run test:headed` | Run tests with browser visible |
| `npm run test:ui` | Open Playwright UI mode |
| `npm run test:debug` | Run tests in debug mode |
| `npm run test:admin` | Run only admin tests |
| `npm run test:public` | Run only public page tests |
| `npm run test:integration` | Run full workflow test |
| `npm run test:local` | Run against localhost |
| `npm run test:dev` | Run against dev environment |
| `npm run test:prod` | Run against prod environment |
| `npm run verify-site` | Run full site verification |
| `npm run report` | View HTML test report |

## Environment Configuration

Tests can run against different environments:

- **Local**: `http://localhost:3000`
- **Dev**: `http://dev.leagueszn.jpdxsolo.com`
- **Prod**: `http://leagueszn.jpdxsolo.com`

Set the environment using `TEST_ENV`:

```bash
TEST_ENV=prod npm test
```

## Test Structure

```
e2e/
├── config/
│   ├── environments.ts   # Environment URLs
│   ├── credentials.ts    # Admin credentials
│   └── selectors.ts      # CSS selectors registry
├── pages/
│   ├── BasePage.ts       # Base page object
│   ├── LoginPage.ts      # Login page object
│   └── admin/            # Admin page objects
├── tests/
│   ├── admin/            # Admin function tests
│   ├── public/           # Public page tests
│   └── integration/      # Full workflow tests
├── utils/
│   └── mcp-playwright.ts # MCP Playwright integration
└── run-verification.ts   # Site verification script
```

## Writing Tests

Tests use the Page Object Model pattern:

```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { ManagePlayersPage } from '../../pages/admin/ManagePlayersPage';

test('should create a player', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const playersPage = new ManagePlayersPage(page);

  await loginPage.navigateToAdmin();
  await loginPage.login();
  await playersPage.selectTab();
  await playersPage.createPlayer({
    name: 'Test Player',
    wrestler: 'Stone Cold',
  });

  expect(await playersPage.playerExists('Test Player')).toBe(true);
});
```

## MCP Playwright Integration

The `e2e-site-verifier` Claude agent can use MCP Playwright to manually verify the site. See `.claude/agents/e2e-site-verifier.md` for instructions.

## CI/CD Integration

Add to GitHub Actions:

```yaml
- name: Run E2E Tests
  run: |
    cd e2e
    npm ci
    npx playwright install --with-deps
    npm run test:dev
```
