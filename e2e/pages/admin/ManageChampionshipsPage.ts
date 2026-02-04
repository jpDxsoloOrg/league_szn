import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { selectors } from '../../config/selectors';
import { AdminPanelPage } from './AdminPanelPage';

export interface ChampionshipData {
  name: string;
  type: 'singles' | 'tag';
  currentChampion?: string;
}

export class ManageChampionshipsPage extends BasePage {
  private adminPanel: AdminPanelPage;

  constructor(page: Page) {
    super(page);
    this.adminPanel = new AdminPanelPage(page);
  }

  async selectTab(): Promise<void> {
    await this.adminPanel.selectTab('championships');
  }

  async clickAddChampionship(): Promise<void> {
    await this.page.locator(selectors.championships.addButton).click();
    await this.page.waitForTimeout(500);
  }

  async createChampionship(data: ChampionshipData): Promise<void> {
    await this.clickAddChampionship();

    await this.page.locator(selectors.championships.nameInput).fill(data.name);
    await this.page.locator(selectors.championships.typeSelect).selectOption(data.type);

    if (data.currentChampion) {
      await this.page.locator(selectors.championships.championSelect).selectOption(data.currentChampion);
    }

    await this.page.locator(selectors.championships.submitButton).click();
    await this.waitForNetworkIdle();
  }

  async championshipExists(championshipName: string): Promise<boolean> {
    await this.waitForNetworkIdle();
    const cards = this.page.locator(selectors.championships.championshipCard);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).textContent();
      if (text && text.includes(championshipName)) {
        return true;
      }
    }
    return false;
  }

  async deleteChampionship(championshipName: string): Promise<void> {
    const cards = this.page.locator(selectors.championships.championshipCard);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const text = await card.textContent();
      if (text && text.includes(championshipName)) {
        this.page.on('dialog', dialog => dialog.accept());
        await card.locator(selectors.championships.deleteButton).click();
        await this.waitForNetworkIdle();
        break;
      }
    }
  }

  async getChampionshipCount(): Promise<number> {
    await this.waitForNetworkIdle();
    return await this.page.locator(selectors.championships.championshipCard).count();
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(selectors.championships.successMessage);
  }
}
