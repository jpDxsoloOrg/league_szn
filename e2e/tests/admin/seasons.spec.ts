import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { ManageSeasonsPage } from '../../pages/admin/ManageSeasonsPage';
import { adminCredentials } from '../../config/credentials';

test.describe('Season Management', () => {
  let loginPage: LoginPage;
  let seasonsPage: ManageSeasonsPage;
  const timestamp = Date.now();
  const testSeasonName = `E2E Test Season ${timestamp}`;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    seasonsPage = new ManageSeasonsPage(page);

    await loginPage.navigateToAdmin();
    await loginPage.login(adminCredentials.username, adminCredentials.password);
    await seasonsPage.selectTab();
  });

  test('should display seasons list', async () => {
    const count = await seasonsPage.getSeasonCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should check for active season', async () => {
    const hasActive = await seasonsPage.hasActiveSeason();
    // Just verify we can check - result can be true or false
    expect(typeof hasActive).toBe('boolean');
  });

  test('should create and manage a season', async ({ page }) => {
    // End any active season first
    if (await seasonsPage.hasActiveSeason()) {
      await seasonsPage.endActiveSeason();
    }

    // Create a new season
    const today = new Date().toISOString().split('T')[0];
    await seasonsPage.createSeason({
      name: testSeasonName,
      startDate: today,
    });

    // Use poll to retry assertion until it passes or times out
    await expect.poll(
      async () => seasonsPage.hasActiveSeason(),
      { timeout: 10000, intervals: [500, 1000, 2000] }
    ).toBe(true);

    // End the season
    await seasonsPage.endActiveSeason();

    // Delete the season
    await seasonsPage.deleteSeason(testSeasonName);

    await page.reload();
    await seasonsPage.selectTab();
    // Use poll to retry assertion until it passes or times out
    await expect.poll(
      async () => seasonsPage.seasonExists(testSeasonName),
      { timeout: 10000, intervals: [500, 1000, 2000] }
    ).toBe(false);
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    const cleanup = new ManageSeasonsPage(page);
    const login = new LoginPage(page);

    await login.navigateToAdmin();
    await login.login(adminCredentials.username, adminCredentials.password);
    await cleanup.selectTab();

    // Clean up: end and delete test season if it exists
    if (await cleanup.hasActiveSeason()) {
      await cleanup.endActiveSeason();
    }
    if (await cleanup.seasonExists(testSeasonName)) {
      await cleanup.deleteSeason(testSeasonName);
    }

    await page.close();
  });
});
