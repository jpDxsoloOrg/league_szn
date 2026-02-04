import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { adminCredentials } from '../../config/credentials';

test.describe('Admin Authentication', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
  });

  test('should display login form on admin page', async () => {
    await loginPage.navigateToAdmin();
    expect(await loginPage.isLoginFormVisible()).toBe(true);
  });

  test('should login successfully with valid credentials', async () => {
    await loginPage.navigateToAdmin();
    await loginPage.login(adminCredentials.username, adminCredentials.password);
    expect(await loginPage.isLoggedIn()).toBe(true);
  });

  test('should show error with invalid credentials', async () => {
    await loginPage.navigateToAdmin();
    await loginPage.login('wronguser', 'wrongpassword');
    expect(await loginPage.hasLoginError()).toBe(true);
  });

  test('should logout successfully', async () => {
    await loginPage.navigateToAdmin();
    await loginPage.login(adminCredentials.username, adminCredentials.password);
    expect(await loginPage.isLoggedIn()).toBe(true);

    await loginPage.logout();
    expect(await loginPage.isLoginFormVisible()).toBe(true);
  });
});
