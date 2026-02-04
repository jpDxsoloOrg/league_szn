import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { selectors } from '../../config/selectors';

type AdminTab = 'players' | 'divisions' | 'schedule' | 'results' | 'championships' | 'tournaments' | 'seasons' | 'help' | 'danger';

const tabIndices: Record<AdminTab, number> = {
  players: 0,
  divisions: 1,
  schedule: 2,
  results: 3,
  championships: 4,
  tournaments: 5,
  seasons: 6,
  help: 7,
  danger: 8,
};

export class AdminPanelPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async selectTab(tab: AdminTab): Promise<void> {
    const tabIndex = tabIndices[tab];
    const tabButton = this.page.locator(`${selectors.admin.tabButton}`).nth(tabIndex);
    await tabButton.click();
    await this.waitForNetworkIdle();
  }

  async getActiveTabName(): Promise<string> {
    return await this.getText(selectors.admin.activeTab);
  }

  async isAdminPanelVisible(): Promise<boolean> {
    return await this.isElementVisible(selectors.admin.panel);
  }

  async logout(): Promise<void> {
    await this.clickElement(selectors.admin.logoutButton);
    await this.waitForNetworkIdle();
  }
}
