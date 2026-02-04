import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { ManagePlayersPage } from '../../pages/admin/ManagePlayersPage';
import { adminCredentials } from '../../config/credentials';

test.describe('Player CRUD Operations', () => {
  let loginPage: LoginPage;
  let playersPage: ManagePlayersPage;
  const timestamp = Date.now();
  const testPlayerName = `E2E Test Player ${timestamp}`;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    playersPage = new ManagePlayersPage(page);

    // Login before each test
    await loginPage.navigateToAdmin();
    await loginPage.login(adminCredentials.username, adminCredentials.password);
    await playersPage.selectTab();
  });

  test('should display players list', async () => {
    const count = await playersPage.getPlayerCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should create a new player', async () => {
    await playersPage.createPlayer({
      name: testPlayerName,
      wrestler: 'Stone Cold Steve Austin',
    });

    expect(await playersPage.playerExists(testPlayerName)).toBe(true);
  });

  test('should delete a player', async ({ page }) => {
    // First create a player to delete
    const deleteTestPlayer = `Delete Test ${timestamp}`;
    await playersPage.createPlayer({
      name: deleteTestPlayer,
      wrestler: 'The Undertaker',
    });

    expect(await playersPage.playerExists(deleteTestPlayer)).toBe(true);

    // Now delete it
    await playersPage.deletePlayer(deleteTestPlayer);

    // Refresh and verify deletion
    await page.reload();
    await playersPage.selectTab();
    expect(await playersPage.playerExists(deleteTestPlayer)).toBe(false);
  });

  test.afterAll(async ({ browser }) => {
    // Cleanup: delete test player if it exists
    const page = await browser.newPage();
    const cleanup = new ManagePlayersPage(page);
    const login = new LoginPage(page);

    await login.navigateToAdmin();
    await login.login(adminCredentials.username, adminCredentials.password);
    await cleanup.selectTab();

    if (await cleanup.playerExists(testPlayerName)) {
      await cleanup.deletePlayer(testPlayerName);
    }

    await page.close();
  });
});
