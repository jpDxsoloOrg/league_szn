import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { selectors } from '../../config/selectors';
import { AdminPanelPage } from './AdminPanelPage';

export interface TournamentData {
  name: string;
  type: 'single-elimination' | 'round-robin';
  participants?: string[];
}

export class CreateTournamentPage extends BasePage {
  private adminPanel: AdminPanelPage;

  constructor(page: Page) {
    super(page);
    this.adminPanel = new AdminPanelPage(page);
  }

  async selectTab(): Promise<void> {
    await this.adminPanel.selectTab('tournaments');
  }

  async clickCreateTournament(): Promise<void> {
    await this.page.locator(selectors.tournaments.addButton).click();
    await this.page.waitForTimeout(500);
  }

  async createTournament(data: TournamentData): Promise<void> {
    await this.clickCreateTournament();

    await this.page.locator(selectors.tournaments.nameInput).fill(data.name);
    await this.page.locator(selectors.tournaments.typeSelect).selectOption(data.type);

    if (data.participants) {
      for (const participant of data.participants) {
        const participantSelects = this.page.locator(selectors.tournaments.participantSelect);
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
    }

    await this.page.locator(selectors.tournaments.submitButton).click();
    await this.waitForNetworkIdle();
  }

  async tournamentExists(tournamentName: string): Promise<boolean> {
    await this.waitForNetworkIdle();
    const cards = this.page.locator(selectors.tournaments.tournamentCard);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).textContent();
      if (text && text.includes(tournamentName)) {
        return true;
      }
    }
    return false;
  }

  async getTournamentCount(): Promise<number> {
    await this.waitForNetworkIdle();
    return await this.page.locator(selectors.tournaments.tournamentCard).count();
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(selectors.tournaments.successMessage);
  }
}
