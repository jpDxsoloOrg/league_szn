import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { selectors } from '../../config/selectors';

type AdminTab = 'players' | 'divisions' | 'schedule' | 'results' | 'championships' | 'tournaments' | 'seasons' | 'help' | 'danger';

const tabRoutes: Record<AdminTab, string> = {
  players: '/admin/players',
  divisions: '/admin/divisions',
  schedule: '/admin/schedule',
  results: '/admin/results',
  championships: '/admin/championships',
  tournaments: '/admin/tournaments',
  seasons: '/admin/seasons',
  help: '/admin/guide',
  danger: '/admin/danger',
};

export class AdminPanelPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async selectTab(tab: AdminTab): Promise<void> {
    const route = tabRoutes[tab];
    await this.page.goto(route);
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(500);
  }

  async isAdminPanelVisible(): Promise<boolean> {
    return await this.page.locator(selectors.admin.title).isVisible({ timeout: 5000 }).catch(() => false);
  }

  async logout(): Promise<void> {
    await this.page.locator(selectors.admin.logoutButton).click();
    await this.waitForNetworkIdle();
  }
}
