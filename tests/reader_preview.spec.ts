import { test, expect, devices } from '@playwright/test';

test.describe('Reader Preview and Controls', () => {
  const iPhone13 = devices['iPhone 13'];

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  });

  test('Paused Reader shows centered context and collapsed menu - Portrait', async ({ page }) => {
    await page.setViewportSize(iPhone13.viewport);

    await page.evaluate(() => {
      localStorage.setItem('user_settings', JSON.stringify({ autoLandscape: false }));
      const words = Array.from({ length: 100 }, (_, i) => ({
        text: `Word${i}`,
        isParagraphStart: i % 10 === 0,
        isSentenceStart: i % 5 === 0
      }));
      (window as any).__loadMockWords(words, [{ label: "Chapter 1", startIndex: 0 }]);
    });

    // Wait for something to be visible
    await page.screenshot({ path: 'tests/screenshots/debug-portrait.png' });

    // Check for any text from the mock data
    await expect(page.locator('body')).toContainText('1 / 100 words');

    // Check for ReaderMenu trigger
    const menuTrigger = page.locator('button:has(svg.lucide-menu)');
    await expect(menuTrigger).toBeVisible();

    // Verify play button is NOT visible
    await expect(page.getByLabel('Play')).not.toBeVisible();

    // Screenshot paused state
    await page.screenshot({ path: 'tests/screenshots/reader-preview-portrait.png' });

    // Open menu
    await menuTrigger.click();
    await expect(page.getByText('WPM', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/reader-menu-portrait.png' });
  });

  test('Paused Reader shows centered context and collapsed menu - Landscape', async ({ page }) => {
    await page.setViewportSize({ width: iPhone13.viewport.height, height: iPhone13.viewport.width });

    await page.evaluate(() => {
      const words = Array.from({ length: 100 }, (_, i) => ({
        text: `Word${i}`,
        isParagraphStart: i % 10 === 0,
        isSentenceStart: i % 5 === 0
      }));
      (window as any).__loadMockWords(words, [{ label: "Chapter 1", startIndex: 0 }]);
    });

    await page.screenshot({ path: 'tests/screenshots/debug-landscape.png' });
    await expect(page.locator('body')).toContainText('1 / 100 words');

    const menuTrigger = page.locator('button:has(svg.lucide-menu)');
    await expect(menuTrigger).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/reader-preview-landscape.png' });

    await menuTrigger.click();
    await expect(page.getByText('WPM', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/reader-menu-landscape.png' });
  });

  test('Clicking screen toggles playback', async ({ page }) => {
    await page.setViewportSize(iPhone13.viewport);
    await page.evaluate(() => {
      localStorage.setItem('user_settings', JSON.stringify({ autoLandscape: false }));
      (window as any).__loadMockWords([
        { text: "Word1", isParagraphStart: true, isSentenceStart: true },
        { text: "Word2", isParagraphStart: false, isSentenceStart: false }
      ], [{ label: "Chapter 1", startIndex: 0 }]);
    });

    // Wait for menu
    const menuTrigger = page.locator('button:has(svg.lucide-menu)');
    await expect(menuTrigger).toBeVisible();

    // Click middle of screen to play
    await page.mouse.click(iPhone13.viewport.width / 2, iPhone13.viewport.height / 2);

    // Menu should disappear when playing
    await expect(menuTrigger).not.toBeVisible();

    // Click again to pause
    await page.mouse.click(iPhone13.viewport.width / 2, iPhone13.viewport.height / 2);
    await expect(menuTrigger).toBeVisible();
  });
});
