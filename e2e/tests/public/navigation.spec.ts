import { test, expect } from '@playwright/test';
import { selectors } from '../../config/selectors';
import { getEnvironment } from '../../config/environments';

test.describe('Navigation', () => {
  const baseUrl = getEnvironment().baseUrl;

  test.beforeEach(async ({ page }) => {
    await page.goto(baseUrl);
  });

  test('should navigate to championships page', async ({ page }) => {
    await page.locator(selectors.nav.championships).click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/championships');
    await expect(page.locator(selectors.publicChampionships.container)).toBeVisible();
  });

  test('should navigate to matches page', async ({ page }) => {
    await page.locator(selectors.nav.matches).click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/matches');
    await expect(page.locator(selectors.matches.container)).toBeVisible();
  });

  test('should navigate to tournaments page', async ({ page }) => {
    await page.locator(selectors.nav.tournaments).click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/tournaments');
    await expect(page.locator(selectors.publicTournaments.container)).toBeVisible();
  });

  test('should navigate to admin page', async ({ page }) => {
    await page.locator(selectors.nav.admin).click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/admin');
  });

  test('should navigate back to standings', async ({ page }) => {
    // Go to another page first
    await page.locator(selectors.nav.championships).click();
    await page.waitForLoadState('networkidle');

    // Navigate back to standings
    await page.locator(selectors.nav.standings).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(selectors.standings.container)).toBeVisible();
  });
});
