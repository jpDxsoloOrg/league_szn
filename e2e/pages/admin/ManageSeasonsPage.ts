import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { selectors } from '../../config/selectors';
import { AdminPanelPage } from './AdminPanelPage';

export interface SeasonData {
  name: string;
  startDate: string;
  endDate?: string;
}

export class ManageSeasonsPage extends BasePage {
  private adminPanel: AdminPanelPage;

  constructor(page: Page) {
    super(page);
    this.adminPanel = new AdminPanelPage(page);
  }

  async selectTab(): Promise<void> {
    await this.adminPanel.selectTab('seasons');
    await this.page.waitForSelector(selectors.seasons.heading, { timeout: 10000 }).catch(() => {});
  }

  async clickCreateSeason(): Promise<void> {
    const createBtn = this.page.locator('button:has-text("Create New Season")');
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  async createSeason(data: SeasonData): Promise<void> {
    await this.clickCreateSeason();

    const nameInput = this.page.locator('input[type="text"]').first();
    await nameInput.fill(data.name);

    const dateInputs = this.page.locator('input[type="date"]');
    await dateInputs.first().fill(data.startDate);

    if (data.endDate) {
      const endDateInput = dateInputs.nth(1);
      if (await endDateInput.isVisible()) {
        await endDateInput.fill(data.endDate);
      }
    }

    await this.page.locator('button[type="submit"]:has-text("Create Season")').click();
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(1000);
  }

  async hasActiveSeason(): Promise<boolean> {
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(500);
    const pageContent = await this.page.content();
    return pageContent.includes('Active Season') ||
           (pageContent.includes('active') && pageContent.includes('End Season'));
  }

  async endActiveSeason(): Promise<void> {
    this.page.once('dialog', async dialog => {
      await dialog.accept();
    });

    const endBtn = this.page.locator('button:has-text("End Season")').first();
    if (await endBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await endBtn.click();
      await this.waitForNetworkIdle();
      await this.page.waitForTimeout(1000);
    }
  }

  async seasonExists(seasonName: string): Promise<boolean> {
    await this.waitForNetworkIdle();
    // Wait for any pending React updates to complete
    await this.page.waitForTimeout(500);
    // Use locator-based check - more reliable than raw page content
    const seasonLocator = this.page.locator(`h4:has-text("${seasonName}")`);
    const count = await seasonLocator.count();
    return count > 0;
  }

  async deleteSeason(seasonName: string): Promise<void> {
    // Seasons have nested structure - find h4 then go up to card that contains both h4 and delete button
    const deleteButton = this.page.locator(`//h4[text()="${seasonName}"]/ancestor::div[.//button[contains(text(),"Delete")]][1]//button[contains(text(),"Delete")]`).first();

    if (await deleteButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Set up dialog handler before clicking
      this.page.once('dialog', async dialog => {
        await dialog.accept();
      });

      await deleteButton.click();
      await this.waitForNetworkIdle();
      await this.page.waitForTimeout(1000);
    }
  }

  async getSeasonCount(): Promise<number> {
    await this.waitForNetworkIdle();
    const heading = await this.page.locator('h3:has-text("All Seasons")').textContent().catch(() => '(0)');
    const match = heading?.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 0;
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    const pageContent = await this.page.content();
    return /success|created|ended/i.test(pageContent);
  }
}
