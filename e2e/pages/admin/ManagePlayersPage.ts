import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { selectors } from '../../config/selectors';
import { AdminPanelPage } from './AdminPanelPage';

export interface PlayerData {
  name: string;
  wrestler: string;
  divisionId?: string;
}

export class ManagePlayersPage extends BasePage {
  private adminPanel: AdminPanelPage;

  constructor(page: Page) {
    super(page);
    this.adminPanel = new AdminPanelPage(page);
  }

  async selectTab(): Promise<void> {
    await this.adminPanel.selectTab('players');
    await this.page.waitForSelector(selectors.players.heading, { timeout: 10000 }).catch(() => {});
  }

  async clickAddPlayer(): Promise<void> {
    await this.page.locator(selectors.players.addButton).click();
    await this.page.waitForTimeout(500);
  }

  async createPlayer(data: PlayerData): Promise<void> {
    await this.clickAddPlayer();

    const nameInputs = this.page.locator('input[type="text"]');
    await nameInputs.first().fill(data.name);

    const allInputs = await nameInputs.all();
    if (allInputs.length > 1) {
      await allInputs[1].fill(data.wrestler);
    }

    if (data.divisionId) {
      const divisionSelect = this.page.locator('select').first();
      if (await divisionSelect.isVisible()) {
        await divisionSelect.selectOption(data.divisionId);
      }
    }

    await this.page.locator(selectors.players.submitButton).click();
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(1000);
  }

  async playerExists(playerName: string): Promise<boolean> {
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(500);
    const pageContent = await this.page.content();
    return pageContent.includes(playerName);
  }

  async deletePlayer(playerName: string): Promise<void> {
    // Players are in a table - find the row with the player name, then find delete button in that row
    const deleteButton = this.page.locator(`//td[text()="${playerName}"]/ancestor::tr//button[contains(text(),"Delete")]`).first();

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

  async editPlayer(playerName: string, newData: Partial<PlayerData>): Promise<void> {
    const card = this.page.locator(`div:has(h4:text-is("${playerName}"))`).first();

    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      await card.locator('button:has-text("Edit")').click();
      await this.page.waitForTimeout(500);

      if (newData.name) {
        const nameInput = this.page.locator('input[type="text"]').first();
        await nameInput.fill(newData.name);
      }
      if (newData.wrestler) {
        const wrestlerInputs = await this.page.locator('input[type="text"]').all();
        if (wrestlerInputs.length > 1) {
          await wrestlerInputs[1].fill(newData.wrestler);
        }
      }

      await this.page.locator('button:has-text("Save")').click();
      await this.waitForNetworkIdle();
    }
  }

  async getPlayerCount(): Promise<number> {
    await this.waitForNetworkIdle();
    const heading = await this.page.locator('h3:has-text("All Players")').textContent().catch(() => '(0)');
    const match = heading?.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 0;
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    const pageContent = await this.page.content();
    return /success|created|saved/i.test(pageContent);
  }
}
