import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { ManageDivisionsPage } from '../../pages/admin/ManageDivisionsPage';
import { adminCredentials } from '../../config/credentials';

test.describe('Division CRUD Operations', () => {
  let loginPage: LoginPage;
  let divisionsPage: ManageDivisionsPage;
  const timestamp = Date.now();
  const testDivisionName = `E2E Test Division ${timestamp}`;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    divisionsPage = new ManageDivisionsPage(page);

    await loginPage.navigateToAdmin();
    await loginPage.login(adminCredentials.username, adminCredentials.password);
    await divisionsPage.selectTab();
  });

  test('should display divisions list', async () => {
    const count = await divisionsPage.getDivisionCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should create a new division', async () => {
    await divisionsPage.createDivision({
      name: testDivisionName,
      description: 'Test division for E2E tests',
    });

    expect(await divisionsPage.divisionExists(testDivisionName)).toBe(true);
  });

  test('should delete a division', async ({ page }) => {
    const deleteTestDiv = `Delete Test Division ${timestamp}`;
    await divisionsPage.createDivision({
      name: deleteTestDiv,
    });

    expect(await divisionsPage.divisionExists(deleteTestDiv)).toBe(true);

    await divisionsPage.deleteDivision(deleteTestDiv);

    await page.reload();
    await divisionsPage.selectTab();
    expect(await divisionsPage.divisionExists(deleteTestDiv)).toBe(false);
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    const cleanup = new ManageDivisionsPage(page);
    const login = new LoginPage(page);

    await login.navigateToAdmin();
    await login.login(adminCredentials.username, adminCredentials.password);
    await cleanup.selectTab();

    if (await cleanup.divisionExists(testDivisionName)) {
      await cleanup.deleteDivision(testDivisionName);
    }

    await page.close();
  });
});
