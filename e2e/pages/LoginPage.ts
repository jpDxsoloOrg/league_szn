import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { selectors } from '../config/selectors';
import { adminCredentials } from '../config/credentials';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToAdmin(): Promise<void> {
    await this.navigate('/admin');
    await this.waitForNetworkIdle();
  }

  async login(username: string = adminCredentials.username, password: string = adminCredentials.password): Promise<void> {
    // Wait for login form to be visible
    await this.page.waitForSelector(selectors.login.heading, { timeout: 10000 }).catch(() => {});

    // Fill username - try multiple approaches
    const usernameInput = this.page.locator('input').first();
    await usernameInput.fill(username);

    // Fill password
    const passwordInput = this.page.locator('input[type="password"]');
    await passwordInput.fill(password);

    // Click login button
    await this.page.locator(selectors.login.submitButton).click();

    // Wait for either admin panel or error to appear
    await Promise.race([
      this.page.waitForSelector(selectors.admin.title, { timeout: 15000 }),
      this.page.waitForSelector('text=/error|invalid|failed|incorrect/i', { timeout: 15000 }),
      this.page.waitForTimeout(10000) // Fallback timeout
    ]).catch(() => {});

    await this.waitForNetworkIdle();
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.waitForSelector(selectors.admin.title, { state: 'visible', timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  async isLoginFormVisible(): Promise<boolean> {
    try {
      // Wait a bit for page to settle after logout
      await this.page.waitForTimeout(1000);
      const heading = await this.page.locator(selectors.login.heading).isVisible();
      const loginBtn = await this.page.locator(selectors.login.submitButton).isVisible();
      return heading || loginBtn;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    const logoutBtn = this.page.locator(selectors.admin.logoutButton);
    if (await logoutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logoutBtn.click();
      // Wait for navigation back to login page
      await this.page.waitForSelector(selectors.login.heading, { timeout: 10000 }).catch(() => {});
      await this.waitForNetworkIdle();
    }
  }

  async getLoginError(): Promise<string> {
    const errorEl = this.page.locator('text=/error|invalid|failed|incorrect/i');
    if (await errorEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      return await errorEl.textContent() || '';
    }
    return '';
  }

  async hasLoginError(): Promise<boolean> {
    // Wait for login to complete and check for error
    await this.page.waitForTimeout(2000);
    const pageContent = await this.page.content();
    return /error|invalid|failed|incorrect/i.test(pageContent.toLowerCase());
  }
}
