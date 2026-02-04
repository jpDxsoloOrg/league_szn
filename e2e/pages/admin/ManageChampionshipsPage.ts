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
    await this.page.waitForSelector(selectors.championships.heading, { timeout: 10000 }).catch(() => {});
  }

  async clickAddChampionship(): Promise<void> {
    const addBtn = this.page.locator('button:has-text("Create New Championship"), button:has-text("Create Championship")');
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  async createChampionship(data: ChampionshipData): Promise<void> {
    await this.clickAddChampionship();

    const nameInput = this.page.locator('input[type="text"]').first();
    await nameInput.fill(data.name);

    const typeSelect = this.page.locator('select').first();
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption(data.type);
    }

    if (data.currentChampion) {
      const championSelect = this.page.locator('select').nth(1);
      if (await championSelect.isVisible()) {
        await championSelect.selectOption(data.currentChampion);
      }
    }

    await this.page.locator('button:has-text("Create Championship"), button:has-text("Create")').first().click();
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(1000);
  }

  async championshipExists(championshipName: string): Promise<boolean> {
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(500);
    const pageContent = await this.page.content();
    return pageContent.includes(championshipName);
  }

  async deleteChampionship(championshipName: string): Promise<void> {
    // Use xpath to find the h4 with exact text, then navigate to parent and find delete button
    const deleteButton = this.page.locator(`//h4[text()="${championshipName}"]/parent::div//button[contains(text(),"Delete")]`).first();

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

  async getChampionshipCount(): Promise<number> {
    await this.waitForNetworkIdle();
    const heading = await this.page.locator('h3:has-text("All Championships")').textContent().catch(() => '(0)');
    const match = heading?.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 0;
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    const pageContent = await this.page.content();
    return /success|created/i.test(pageContent);
  }
}
