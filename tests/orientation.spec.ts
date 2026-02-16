import { test, expect, devices } from '@playwright/test';

test.describe('Mobile Orientation Layout', () => {
  const iPhone13 = devices['iPhone 13'];

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  });

  test('Library View - Portrait', async ({ page }) => {
    await page.setViewportSize(iPhone13.viewport);
    
    // Load mock data to ensure we are "logged in" and have content
    await page.evaluate(() => {
      (window as any).__loadMockWords([
        { text: "Mock", isParagraphStart: true, isSentenceStart: true },
        { text: "Word", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
    });

    // Close the book to see the library
    await page.locator('button[title="Back to Library"]').click();

    // Verify we are in Library View
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/library-portrait.png' });
  });

  test('Library View - Landscape', async ({ page }) => {
    await page.setViewportSize({ width: iPhone13.viewport.height, height: iPhone13.viewport.width });
    
    await page.evaluate(() => {
      (window as any).__loadMockWords([
        { text: "Mock", isParagraphStart: true, isSentenceStart: true },
        { text: "Word", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
    });

    await page.locator('button[title="Back to Library"]').click();

    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/library-landscape.png' });
  });

  test('Reader View - Portrait', async ({ page }) => {
    await page.setViewportSize(iPhone13.viewport);
    
    await page.evaluate(() => {
      // Disable auto-landscape to allow testing portrait reader
      localStorage.setItem('user_settings', JSON.stringify({ autoLandscape: false }));

      (window as any).__loadMockWords([
        { text: "The", isParagraphStart: true, isSentenceStart: true },
        { text: "quick", isParagraphStart: false, isSentenceStart: false },
        { text: "brown", isParagraphStart: false, isSentenceStart: false },
        { text: "fox", isParagraphStart: false, isSentenceStart: false },
        { text: "jumps", isParagraphStart: false, isSentenceStart: false },
        { text: "over", isParagraphStart: false, isSentenceStart: false },
        { text: "the", isParagraphStart: false, isSentenceStart: false },
        { text: "lazy", isParagraphStart: false, isSentenceStart: false },
        { text: "dog.", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
    });

    // Verify we are in Reader View by checking the progress
    await expect(page.locator('header span.text-sm.font-medium.opacity-60')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/reader-portrait.png' });
  });

  test('Reader View - Landscape', async ({ page }) => {
    await page.setViewportSize({ width: iPhone13.viewport.height, height: iPhone13.viewport.width });
    
    await page.evaluate(() => {
      (window as any).__loadMockWords([
        { text: "The", isParagraphStart: true, isSentenceStart: true },
        { text: "quick", isParagraphStart: false, isSentenceStart: false },
        { text: "brown", isParagraphStart: false, isSentenceStart: false },
        { text: "fox", isParagraphStart: false, isSentenceStart: false },
        { text: "jumps", isParagraphStart: false, isSentenceStart: false },
        { text: "over", isParagraphStart: false, isSentenceStart: false },
        { text: "the", isParagraphStart: false, isSentenceStart: false },
        { text: "lazy", isParagraphStart: false, isSentenceStart: false },
        { text: "dog.", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
    });

    await expect(page.locator('header span.text-sm.font-medium.opacity-60')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/reader-landscape.png' });
  });

  test('Active Reading - Portrait', async ({ page }) => {
    await page.setViewportSize(iPhone13.viewport);
    
    await page.evaluate(() => {
      localStorage.setItem('user_settings', JSON.stringify({ autoLandscape: false }));
      (window as any).__loadMockWords([
        { text: "Active", isParagraphStart: true, isSentenceStart: true },
        { text: "Reading", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
    });

    // Start playing
    await page.click('body');
    
    // Check for the RSVP focus word
    await expect(page.getByText('Active')).toBeVisible();
    
    // Ensure the interface has cleaned up (Menu FAB should be gone in active mode)
    await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/active-reading-portrait.png' });
  });

  test('Active Reading - Landscape', async ({ page }) => {
    await page.setViewportSize({ width: iPhone13.viewport.height, height: iPhone13.viewport.width });
    
    await page.evaluate(() => {
      (window as any).__loadMockWords([
        { text: "Active", isParagraphStart: true, isSentenceStart: true },
        { text: "Reading", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
    });

    await page.click('body');

    await expect(page.getByText('Active')).toBeVisible();
    await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/active-reading-landscape.png' });
  });
});
