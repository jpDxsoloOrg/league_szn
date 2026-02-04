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
  }

  async clickAddPlayer(): Promise<void> {
    await this.page.locator(selectors.players.addButton).click();
    await this.page.waitForTimeout(500);
  }

  async createPlayer(data: PlayerData): Promise<void> {
    await this.clickAddPlayer();

    await this.page.locator(selectors.players.nameInput).fill(data.name);
    await this.page.locator(selectors.players.wrestlerInput).fill(data.wrestler);

    if (data.divisionId) {
      await this.page.locator(selectors.players.divisionSelect).selectOption(data.divisionId);
    }

    await this.page.locator(selectors.players.submitButton).click();
    await this.waitForNetworkIdle();
  }

  async playerExists(playerName: string): Promise<boolean> {
    await this.waitForNetworkIdle();
    const playerCards = this.page.locator(selectors.players.playerCard);
    const count = await playerCards.count();

    for (let i = 0; i < count; i++) {
      const text = await playerCards.nth(i).textContent();
      if (text && text.includes(playerName)) {
        return true;
      }
    }
    return false;
  }

  async deletePlayer(playerName: string): Promise<void> {
    const playerCards = this.page.locator(selectors.players.playerCard);
    const count = await playerCards.count();

    for (let i = 0; i < count; i++) {
      const card = playerCards.nth(i);
      const text = await card.textContent();
      if (text && text.includes(playerName)) {
        // Handle confirmation dialog
        this.page.on('dialog', dialog => dialog.accept());
        await card.locator(selectors.players.deleteButton).click();
        await this.waitForNetworkIdle();
        break;
      }
    }
  }

  async editPlayer(playerName: string, newData: Partial<PlayerData>): Promise<void> {
    const playerCards = this.page.locator(selectors.players.playerCard);
    const count = await playerCards.count();

    for (let i = 0; i < count; i++) {
      const card = playerCards.nth(i);
      const text = await card.textContent();
      if (text && text.includes(playerName)) {
        await card.locator(selectors.players.editButton).click();
        await this.page.waitForTimeout(500);

        if (newData.name) {
          await this.page.locator(selectors.players.nameInput).fill(newData.name);
        }
        if (newData.wrestler) {
          await this.page.locator(selectors.players.wrestlerInput).fill(newData.wrestler);
        }

        await this.page.locator(selectors.players.submitButton).click();
        await this.waitForNetworkIdle();
        break;
      }
    }
  }

  async getPlayerCount(): Promise<number> {
    await this.waitForNetworkIdle();
    return await this.page.locator(selectors.players.playerCard).count();
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(selectors.players.successMessage);
  }
}
