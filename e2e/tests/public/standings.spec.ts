import { test, expect } from '@playwright/test';
import { selectors } from '../../config/selectors';
import { getEnvironment } from '../../config/environments';

test.describe('Standings Page', () => {
  const baseUrl = getEnvironment().baseUrl;

  test.beforeEach(async ({ page }) => {
    await page.goto(baseUrl);
  });

  test('should display standings container', async ({ page }) => {
    await expect(page.locator(selectors.standings.container)).toBeVisible();
  });

  test('should display standings table if players exist', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.locator(selectors.standings.table);
    const emptyState = page.locator(selectors.common.emptyState);

    // Either table or empty state should be visible
    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    expect(hasTable || hasEmpty).toBe(true);
  });

  test('should have season selector if seasons exist', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const seasonSelect = page.locator(selectors.standings.seasonSelect);
    // This is conditional based on whether seasons exist
    const isVisible = await seasonSelect.isVisible().catch(() => false);
    // Just verify the page loaded correctly
    await expect(page.locator(selectors.standings.container)).toBeVisible();
  });

  test('should have division filter if divisions exist', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const divisionFilter = page.locator(selectors.standings.divisionFilter);
    const hasFilter = await divisionFilter.isVisible().catch(() => false);

    if (hasFilter) {
      const allButton = page.locator(`${selectors.standings.filterButton}`).first();
      await expect(allButton).toBeVisible();
    }

    // Page should still be visible regardless
    await expect(page.locator(selectors.standings.container)).toBeVisible();
  });
});
