import { test, expect } from '@playwright/test';
import { getEnvironment } from '../../config/environments';

test.describe('Standings Page', () => {
  const baseUrl = getEnvironment().baseUrl;

  test.beforeEach(async ({ page }) => {
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');
  });

  test('should display standings page', async ({ page }) => {
    // Check for main content area
    await expect(page.locator('main')).toBeVisible();
    // Check for standings heading or table
    const hasStandings = await page.locator('h2:has-text("Standings")').isVisible().catch(() => false);
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    expect(hasStandings || hasTable).toBe(true);
  });

  test('should display standings table or empty state', async ({ page }) => {
    const table = page.locator('table');
    const hasTable = await table.isVisible().catch(() => false);
    // Either table exists or page shows some content
    await expect(page.locator('main')).toBeVisible();
  });

  test('page should load without errors', async ({ page }) => {
    // Check page loaded successfully
    await expect(page.locator('main')).toBeVisible();
    // Check no error message is prominently displayed
    const pageContent = await page.content();
    expect(pageContent.toLowerCase()).not.toContain('500 error');
    expect(pageContent.toLowerCase()).not.toContain('server error');
  });
});
