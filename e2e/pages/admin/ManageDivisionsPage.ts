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
    await this.page.waitForSelector(selectors.divisions.heading, { timeout: 10000 }).catch(() => {});
  }

  async createDivision(data: DivisionData): Promise<void> {
    const createBtn = this.page.locator('button:has-text("Create Division")');
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
      await this.page.waitForTimeout(500);
    }

    const nameInput = this.page.locator('input[placeholder*="Raw"], input[placeholder*="SmackDown"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill(data.name);
    } else {
      const textInputs = this.page.locator('input[type="text"]');
      await textInputs.first().fill(data.name);
    }

    if (data.description) {
      const descInput = this.page.locator('input[placeholder*="description" i], input[placeholder*="Brief" i]');
      if (await descInput.isVisible()) {
        await descInput.first().fill(data.description);
      }
    }

    await this.page.locator('button:has-text("Create Division")').click();
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(1000);
  }

  async divisionExists(divisionName: string): Promise<boolean> {
    await this.waitForNetworkIdle();
    await this.page.waitForTimeout(500);
    const pageContent = await this.page.content();
    return pageContent.includes(divisionName);
  }

  async deleteDivision(divisionName: string): Promise<void> {
    // Use xpath to find the h4 with exact text, then navigate to parent and find delete button
    const deleteButton = this.page.locator(`//h4[text()="${divisionName}"]/parent::div//button[contains(text(),"Delete")]`).first();

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

  async getDivisionCount(): Promise<number> {
    await this.waitForNetworkIdle();
    const heading = await this.page.locator('h3:has-text("All Divisions")').textContent().catch(() => '(0)');
    const match = heading?.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 0;
  }

  async isSuccessMessageVisible(): Promise<boolean> {
    const pageContent = await this.page.content();
    return /success|created/i.test(pageContent);
  }
}
