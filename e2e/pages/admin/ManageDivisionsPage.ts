import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { selectors } from '../../config/selectors';
import { AdminPanelPage } from './AdminPanelPage';

export interface DivisionData {
  name: string;
  description?: string;
}

export class ManageDivisionsPage extends BasePage {
  private adminPanel: AdminPanelPage;

  constructor(page: Page) {
    super(page);
    this.adminPanel = new AdminPanelPage(page);
  }

  async selectTab(): Promise<void> {
    await this.adminPanel.selectTab('divisions');
  }

  async clickAddDivision(): Promise<void> {
    await this.page.locator(selectors.divisions.addButton).click();
    await this.page.waitForTimeout(500);
  }

  async createDivision(data: DivisionData): Promise<void> {
    await this.clickAddDivision();

    await this.page.locator(selectors.divisions.nameInput).fill(data.name);

    if (data.description) {
      const descInput = this.page.locator(selectors.divisions.descriptionInput);
      if (await descInput.isVisible()) {
        await descInput.fill(data.description);
      }
    }

    await this.page.locator(selectors.divisions.submitButton).click();
    await this.waitForNetworkIdle();
  }

  async divisionExists(divisionName: string): Promise<boolean> {
    await this.waitForNetworkIdle();
    const cards = this.page.locator(selectors.divisions.divisionCard);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).textContent();
      if (text && text.includes(divisionName)) {
        return true;
      }
    }
    return false;
  }

  async deleteDivision(divisionName: string): Promise<void> {
    const cards = this.page.locator(selectors.divisions.divisionCard);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const text = await card.textContent();
      if (text && text.includes(divisionName)) {
        this.page.on('dialog', dialog => dialog.accept());
        await card.locator(selectors.divisions.deleteButton).click();
        await this.waitForNetworkIdle();
        break;
      }
    }
  }

  async getDivisionCount(): Promise<number> {
    await this.waitForNetworkIdle();
    return await this.page.locator(selectors.divisions.divisionCard).count();
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(selectors.divisions.successMessage);
  }
}
