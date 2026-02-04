import { test, expect } from '@playwright/test';
import { selectors } from '../../config/selectors';
import { getEnvironment } from '../../config/environments';

test.describe('Tournaments Page', () => {
  const baseUrl = getEnvironment().baseUrl;

  test.beforeEach(async ({ page }) => {
    await page.goto(`${baseUrl}/tournaments`);
  });

  test('should display tournaments container', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page.locator(selectors.publicTournaments.container)).toBeVisible();
  });

  test('should show tournament cards if tournaments exist', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const cards = page.locator(selectors.publicTournaments.tournamentCard);
    const emptyState = page.locator(selectors.common.emptyState);

    const hasCards = await cards.first().isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    // Either cards or empty state should be visible
    expect(hasCards || hasEmpty).toBe(true);
  });

  test('page should not have errors', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const error = page.locator(selectors.common.error);
    const hasError = await error.isVisible().catch(() => false);
    expect(hasError).toBe(false);
  });
});
