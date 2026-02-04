import { test, expect } from '@playwright/test';
import { getEnvironment } from '../../config/environments';

test.describe('Championships Page', () => {
  const baseUrl = getEnvironment().baseUrl;

  test.beforeEach(async ({ page }) => {
    await page.goto(`${baseUrl}/championships`);
    await page.waitForLoadState('networkidle');
  });

  test('should display championships page', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible();
    // Check for championships heading
    const hasHeading = await page.locator('h2').isVisible().catch(() => false);
    expect(hasHeading).toBe(true);
  });

  test('page should load without errors', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible();
    const pageContent = await page.content();
    expect(pageContent.toLowerCase()).not.toContain('500 error');
    expect(pageContent.toLowerCase()).not.toContain('server error');
  });
});
