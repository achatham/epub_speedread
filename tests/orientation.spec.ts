import { test, expect, devices } from '@playwright/test';

test.describe('Mobile Orientation Layout', () => {
  const iPhone13 = devices['iPhone 13'];

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  });

  test('Library View - Portrait', async ({ page }) => {
    await page.setViewportSize(iPhone13.viewport);
    
    await page.evaluate(() => {
      (window as any).__loadMockWords([
        { text: "Mock", isParagraphStart: true, isSentenceStart: true },
        { text: "Word", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
    });

    await page.getByRole('button', { name: 'Library' }).click();
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

    await page.getByRole('button', { name: 'Library' }).click();
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/library-landscape.png' });
  });

  test('Reader View - Portrait', async ({ page }) => {
    await page.setViewportSize(iPhone13.viewport);
    
    await page.evaluate(() => {
      localStorage.setItem('user_settings', JSON.stringify({ autoLandscape: false }));

      (window as any).__loadMockWords([
        { text: "The", isParagraphStart: true, isSentenceStart: true },
        { text: "quick", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
    });

    await expect(page.locator('button[title="Open Menu"]')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/reader-portrait.png' });
  });

  test('Reader View - Landscape', async ({ page }) => {
    await page.setViewportSize({ width: iPhone13.viewport.height, height: iPhone13.viewport.width });
    
    await page.evaluate(() => {
      (window as any).__loadMockWords([
        { text: "The", isParagraphStart: true, isSentenceStart: true },
        { text: "quick", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
    });

    // In landscape, we have the fixed chapter title at top-right
    await expect(page.getByText('Chapter 1').last()).toBeVisible();
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

    // Start playing by clicking the word
    await page.getByText('Active').click();
    
    // Check for the RSVP focus word
    await expect(page.getByText('Active')).toBeVisible();
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

    await page.getByText('Active').click();

    await expect(page.getByText('Active')).toBeVisible();
    await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/active-reading-landscape.png' });
  });
});
