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
  }

  async clickCreateSeason(): Promise<void> {
    await this.page.locator(selectors.seasons.addButton).click();
    await this.page.waitForTimeout(500);
  }

  async createSeason(data: SeasonData): Promise<void> {
    await this.clickCreateSeason();

    await this.page.locator(selectors.seasons.nameInput).fill(data.name);
    await this.page.locator(selectors.seasons.startDateInput).fill(data.startDate);

    if (data.endDate) {
      await this.page.locator(selectors.seasons.endDateInput).fill(data.endDate);
    }

    await this.page.locator(selectors.seasons.submitButton).click();
    await this.waitForNetworkIdle();
  }

  async hasActiveSeason(): Promise<boolean> {
    await this.waitForNetworkIdle();
    return await this.isElementVisible(selectors.seasons.activeBanner);
  }

  async endActiveSeason(): Promise<void> {
    this.page.on('dialog', dialog => dialog.accept());
    const endBtn = this.page.locator(selectors.seasons.endButton).first();
    if (await endBtn.isVisible()) {
      await endBtn.click();
      await this.waitForNetworkIdle();
    }
  }

  async seasonExists(seasonName: string): Promise<boolean> {
    await this.waitForNetworkIdle();
    const cards = this.page.locator(selectors.seasons.seasonCard);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).textContent();
      if (text && text.includes(seasonName)) {
        return true;
      }
    }
    return false;
  }

  async deleteSeason(seasonName: string): Promise<void> {
    const cards = this.page.locator(selectors.seasons.seasonCard);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const text = await card.textContent();
      if (text && text.includes(seasonName)) {
        this.page.on('dialog', dialog => dialog.accept());
        await card.locator(selectors.seasons.deleteButton).click();
        await this.waitForNetworkIdle();
        break;
      }
    }
  }

  async getSeasonCount(): Promise<number> {
    await this.waitForNetworkIdle();
    return await this.page.locator(selectors.seasons.seasonCard).count();
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(selectors.seasons.successMessage);
  }
}
