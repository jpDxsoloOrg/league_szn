import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { selectors } from '../../config/selectors';
import { AdminPanelPage } from './AdminPanelPage';

export interface MatchData {
  date: string;
  matchType: string;
  stipulation?: string;
  participants: string[];
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
}

export class ScheduleMatchPage extends BasePage {
  private adminPanel: AdminPanelPage;

  constructor(page: Page) {
    super(page);
    this.adminPanel = new AdminPanelPage(page);
  }

  async selectTab(): Promise<void> {
    await this.adminPanel.selectTab('schedule');
  }

  async scheduleMatch(data: MatchData): Promise<void> {
    await this.page.locator(selectors.scheduleMatch.dateInput).fill(data.date);

    const matchTypeSelect = this.page.locator(selectors.scheduleMatch.matchTypeSelect);
    if (await matchTypeSelect.isVisible()) {
      await matchTypeSelect.selectOption(data.matchType);
    }

    if (data.stipulation) {
      const stipSelect = this.page.locator(selectors.scheduleMatch.stipulationSelect);
      if (await stipSelect.isVisible()) {
        await stipSelect.selectOption(data.stipulation);
      }
    }

    // Select participants - this varies by UI implementation
    for (const participant of data.participants) {
      const participantSelects = this.page.locator(selectors.scheduleMatch.participantSelect);
      const count = await participantSelects.count();
      for (let i = 0; i < count; i++) {
        const select = participantSelects.nth(i);
        const value = await select.inputValue();
        if (!value) {
          await select.selectOption({ label: participant });
          break;
        }
      }
    }

    if (data.championshipId) {
      const champSelect = this.page.locator(selectors.scheduleMatch.championshipSelect);
      if (await champSelect.isVisible()) {
        await champSelect.selectOption(data.championshipId);
      }
    }

    if (data.seasonId) {
      const seasonSelect = this.page.locator(selectors.scheduleMatch.seasonSelect);
      if (await seasonSelect.isVisible()) {
        await seasonSelect.selectOption(data.seasonId);
      }
    }

    await this.page.locator(selectors.scheduleMatch.submitButton).click();
    await this.waitForNetworkIdle();
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(selectors.scheduleMatch.successMessage);
  }

  async hasError(): Promise<boolean> {
    return await this.isElementVisible(selectors.scheduleMatch.errorMessage);
  }
}
