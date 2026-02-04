import { Page, expect } from '@playwright/test';
import { getEnvironment } from '../config/environments';
import { selectors } from '../config/selectors';

export class BasePage {
  protected page: Page;
  protected baseUrl: string;

  constructor(page: Page) {
    this.page = page;
    this.baseUrl = getEnvironment().baseUrl;
  }

  async navigate(path: string = ''): Promise<void> {
    await this.page.goto(`${this.baseUrl}${path}`);
  }

  async waitForLoading(): Promise<void> {
    const loading = this.page.locator(selectors.common.loading);
    if (await loading.isVisible({ timeout: 1000 }).catch(() => false)) {
      await loading.waitFor({ state: 'hidden', timeout: 30000 });
    }
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async getPageTitle(): Promise<string> {
    return await this.page.title();
  }

  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `./reports/screenshots/${name}.png`, fullPage: true });
  }

  async isElementVisible(selector: string): Promise<boolean> {
    return await this.page.locator(selector).isVisible().catch(() => false);
  }

  async clickElement(selector: string): Promise<void> {
    await this.page.locator(selector).click();
  }

  async fillInput(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).fill(value);
  }

  async selectOption(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).selectOption(value);
  }

  async getText(selector: string): Promise<string> {
    return await this.page.locator(selector).textContent() || '';
  }

  async waitForSelector(selector: string, timeout: number = 10000): Promise<void> {
    await this.page.locator(selector).waitFor({ state: 'visible', timeout });
  }

  async hasSuccessMessage(): Promise<boolean> {
    return await this.isElementVisible('.success-message');
  }

  async hasErrorMessage(): Promise<boolean> {
    return await this.isElementVisible('.error-message');
  }

  async getSuccessMessage(): Promise<string> {
    return await this.getText('.success-message');
  }

  async getErrorMessage(): Promise<string> {
    return await this.getText('.error-message');
  }
}
