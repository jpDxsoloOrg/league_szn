import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { selectors } from '../../config/selectors';

type AdminTab = 'players' | 'divisions' | 'schedule' | 'results' | 'championships' | 'tournaments' | 'seasons' | 'help' | 'danger';

const tabSelectors: Record<AdminTab, string> = {
  players: selectors.admin.tabPlayers,
  divisions: selectors.admin.tabDivisions,
  schedule: selectors.admin.tabSchedule,
  results: selectors.admin.tabResults,
  championships: selectors.admin.tabChampionships,
  tournaments: selectors.admin.tabTournaments,
  seasons: selectors.admin.tabSeasons,
  help: selectors.admin.tabHelp,
  danger: selectors.admin.tabDangerZone,
};

export class AdminPanelPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async selectTab(tab: AdminTab): Promise<void> {
    const selector = tabSelectors[tab];
    await this.page.locator(selector).click();
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(500); // Wait for tab content to load
  }

  async isAdminPanelVisible(): Promise<boolean> {
    return await this.page.locator(selectors.admin.title).isVisible({ timeout: 5000 }).catch(() => false);
  }

  async logout(): Promise<void> {
    await this.page.locator(selectors.admin.logoutButton).click();
    await this.waitForNetworkIdle();
  }
}
