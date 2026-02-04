import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { ManageChampionshipsPage } from '../../pages/admin/ManageChampionshipsPage';
import { adminCredentials } from '../../config/credentials';

test.describe('Championship CRUD Operations', () => {
  let loginPage: LoginPage;
  let championshipsPage: ManageChampionshipsPage;
  const timestamp = Date.now();
  const testChampionshipName = `E2E Test Championship ${timestamp}`;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    championshipsPage = new ManageChampionshipsPage(page);

    await loginPage.navigateToAdmin();
    await loginPage.login(adminCredentials.username, adminCredentials.password);
    await championshipsPage.selectTab();
  });

  test('should display championships grid', async () => {
    const count = await championshipsPage.getChampionshipCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should create a singles championship', async () => {
    await championshipsPage.createChampionship({
      name: testChampionshipName,
      type: 'singles',
    });

    // Use poll to retry assertion until it passes or times out
    await expect.poll(
      async () => championshipsPage.championshipExists(testChampionshipName),
      { timeout: 10000, intervals: [500, 1000, 2000] }
    ).toBe(true);
  });

  test('should create a tag team championship', async () => {
    const tagChampName = `E2E Tag Championship ${timestamp}`;

    await championshipsPage.createChampionship({
      name: tagChampName,
      type: 'tag',
    });

    // Use poll to retry assertion until it passes or times out
    await expect.poll(
      async () => championshipsPage.championshipExists(tagChampName),
      { timeout: 10000, intervals: [500, 1000, 2000] }
    ).toBe(true);

    // Cleanup
    await championshipsPage.deleteChampionship(tagChampName);
  });

  test('should delete a championship', async ({ page }) => {
    const deleteTestChamp = `Delete Test Champ ${timestamp}`;
    await championshipsPage.createChampionship({
      name: deleteTestChamp,
      type: 'singles',
    });

    // Use poll to retry assertion until it passes or times out
    await expect.poll(
      async () => championshipsPage.championshipExists(deleteTestChamp),
      { timeout: 10000, intervals: [500, 1000, 2000] }
    ).toBe(true);

    await championshipsPage.deleteChampionship(deleteTestChamp);

    await page.reload();
    await championshipsPage.selectTab();
    // Use poll to retry assertion until it passes or times out
    await expect.poll(
      async () => championshipsPage.championshipExists(deleteTestChamp),
      { timeout: 10000, intervals: [500, 1000, 2000] }
    ).toBe(false);
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    const cleanup = new ManageChampionshipsPage(page);
    const login = new LoginPage(page);

    await login.navigateToAdmin();
    await login.login(adminCredentials.username, adminCredentials.password);
    await cleanup.selectTab();

    if (await cleanup.championshipExists(testChampionshipName)) {
      await cleanup.deleteChampionship(testChampionshipName);
    }

    await page.close();
  });
});
