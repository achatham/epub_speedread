import { test, expect } from '@playwright/test';

test.describe('Reader UI Refactor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Inject mock words to bypass auth and load reader
    await page.evaluate(() => {
      const mockWords = Array.from({ length: 100 }, (_, i) => ({
        text: `Word${i}`,
        isParagraphStart: i % 10 === 0,
        isSentenceStart: i % 5 === 0
      }));
      (window as any).__loadMockWords(mockWords, [{ label: 'Chapter 1', startIndex: 0 }]);
    });
    // Wait for ReaderView to render
    await expect(page.locator('header h3')).toBeVisible();
  });

  test('should show expanded text preview in portrait', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone size
    // Should be paused by default
    await expect(page.locator('text=Word0')).toBeVisible();
    // Use a small delay to ensure transitions finish
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/reader_portrait.png' });
  });

  test('should show expanded text preview in landscape', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('text=Word0')).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/reader_landscape.png' });
  });

  test('should open and close the reader menu', async ({ page }) => {
    const menuButton = page.locator('button[title="Open Menu"]');
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Check for menu content
    await expect(page.locator('text=Speed')).toBeVisible();
    await expect(page.locator('button:has-text("Chapters")')).toBeVisible();

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/reader_menu_open.png' });

    // Close it
    await page.locator('button:has(svg.lucide-x)').click();
    await expect(page.locator('text=Speed')).not.toBeVisible();
  });

  test('should toggle play/pause on screen click', async ({ page }) => {
    // Initially paused (ReaderMenu FAB is visible)
    await expect(page.locator('button[title="Open Menu"]')).toBeVisible();

    // Click screen to start playing
    // Click in the middle of the screen
    await page.mouse.click(200, 400);
    await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();

    // Click screen to pause
    await page.mouse.click(200, 400);
    await expect(page.locator('button[title="Open Menu"]')).toBeVisible();
  });
});
