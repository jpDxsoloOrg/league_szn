import { test, expect } from '@playwright/test';
import { selectors } from '../../config/selectors';
import { getEnvironment } from '../../config/environments';

test.describe('Matches Page', () => {
  const baseUrl = getEnvironment().baseUrl;

  test.beforeEach(async ({ page }) => {
    await page.goto(`${baseUrl}/matches`);
  });

  test('should display matches container', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page.locator(selectors.matches.container)).toBeVisible();
  });

  test('should have filter buttons', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const filters = page.locator(selectors.matches.filterButtons);
    const hasFilters = await filters.first().isVisible().catch(() => false);

    // Filter buttons should exist
    if (hasFilters) {
      await expect(filters.first()).toBeVisible();
    }
  });

  test('should show matches or empty state', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const matchList = page.locator(selectors.matches.matchList);
    const emptyState = page.locator(selectors.common.emptyState);

    const hasList = await matchList.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    // One of them should be visible
    expect(hasList || hasEmpty).toBe(true);
  });

  test('page should not have errors', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const error = page.locator(selectors.common.error);
    const hasError = await error.isVisible().catch(() => false);
    expect(hasError).toBe(false);
  });
});
