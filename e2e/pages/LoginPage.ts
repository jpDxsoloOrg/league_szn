import { Page, expect } from '@playwright/test';
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
    await this.page.locator(selectors.login.username).fill(username);
    await this.page.locator(selectors.login.password).fill(password);
    await this.page.locator(selectors.login.submitButton).click();
    await this.waitForNetworkIdle();
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.locator(selectors.admin.panel).waitFor({ state: 'visible', timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  async isLoginFormVisible(): Promise<boolean> {
    return await this.isElementVisible(selectors.login.form);
  }

  async logout(): Promise<void> {
    const logoutBtn = this.page.locator(selectors.admin.logoutButton);
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await this.waitForNetworkIdle();
    }
  }

  async getLoginError(): Promise<string> {
    return await this.getText(selectors.login.errorMessage);
  }

  async hasLoginError(): Promise<boolean> {
    return await this.isElementVisible(selectors.login.errorMessage);
  }
}
