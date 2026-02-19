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
      
      // Add a mock book to the library via the internal state if possible, 
      // but __loadMockWords directly enters the reader. 
      // Let's go back to library if we want to see it.
    });

    // Open Reader Menu and close the book to see the library
    await page.click('button[title="Open Menu"]');
    await page.getByText('Close Book').click();

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

    await page.click('button[title="Open Menu"]');
    await page.getByText('Close Book').click();

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

    // Verify we are in Reader View by checking something else visible in portrait
    await page.click('button[title="Open Menu"]');
    await expect(page.getByText('Speed')).toBeVisible();

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

    await expect(page.locator('text=Chapter 1')).toBeVisible();

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
    await page.getByLabel('Play').click();
    
    // Check for the RSVP focus word
    await expect(page.getByText('Active')).toBeVisible();
    
    // Ensure the interface has cleaned up (Play button should be gone in active mode)
    await expect(page.getByLabel('Play')).not.toBeVisible();

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

    await page.getByLabel('Play').click();

    await expect(page.getByText('Active')).toBeVisible();
    await expect(page.getByLabel('Play')).not.toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/active-reading-landscape.png' });
  });
});
