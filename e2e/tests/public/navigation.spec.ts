import { test, expect } from '@playwright/test';
import { getEnvironment } from '../../config/environments';

test.describe('Navigation', () => {
  const baseUrl = getEnvironment().baseUrl;

  test.beforeEach(async ({ page }) => {
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to championships page', async ({ page }) => {
    await page.locator('a[href="/championships"]').click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/championships');
    await expect(page.locator('main')).toBeVisible();
  });

  test('should navigate to matches page', async ({ page }) => {
    await page.locator('a[href="/matches"]').click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/matches');
    await expect(page.locator('main')).toBeVisible();
  });

  test('should navigate to tournaments page', async ({ page }) => {
    await page.locator('a[href="/tournaments"]').click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/tournaments');
    await expect(page.locator('main')).toBeVisible();
  });

  test('should navigate to admin page', async ({ page }) => {
    await page.locator('a[href="/admin"]').click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/admin');
  });

  test('should navigate back to standings', async ({ page }) => {
    // Go to another page first
    await page.locator('a[href="/championships"]').click();
    await page.waitForLoadState('networkidle');

    // Navigate back to standings
    await page.locator('a[href="/"]').first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible();
  });
});
