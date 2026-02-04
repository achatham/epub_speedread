import { test, expect } from '@playwright/test';

test.describe('AI Features & Dark Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

    // Load some mock words
    await page.evaluate(() => {
      (window as any).__loadMockWords([
        { text: "Chapter", isParagraphStart: true, isSentenceStart: true },
        { text: "One", isParagraphStart: false, isSentenceStart: false },
        { text: "content.", isParagraphStart: false, isSentenceStart: false },
        { text: "Chapter", isParagraphStart: true, isSentenceStart: true },
        { text: "Two", isParagraphStart: false, isSentenceStart: false },
        { text: "content.", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 },
        { label: "Chapter 2", startIndex: 3 }
      ]);

      // Set a mock API key
      localStorage.setItem('gemini_api_key', 'mock-api-key');
    });
  });

  test('AI Modal respects dark mode', async ({ page }) => {
    // Switch to dark theme
    const themeButton = page.getByTitle(/Theme: /);
    await themeButton.click(); // to dark

    // Verify html has dark class
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Open AI Modal
    await page.getByTitle('Ask AI about book').click();

    // Check modal background color - should be dark
    // Use a more specific selector to avoid matching the ReaderView background
    const modalContent = page.locator('.fixed.inset-0 .bg-white, .fixed.inset-0 .dark\\:bg-zinc-900').first();
    await expect(modalContent).toBeVisible();

    const bgColor = await modalContent.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // In Tailwind 4 / modern browsers, this might be oklch or rgb
    // We just want to ensure it's not white
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
    expect(bgColor).not.toBe('oklch(1 0 0)');
  });

  test('AI Modal respects bedtime mode (extra dark)', async ({ page }) => {
    // Switch to bedtime theme
    const themeButton = page.getByTitle(/Theme: /);
    await themeButton.click(); // to dark
    await themeButton.click(); // to bedtime

    // Verify html still has dark class (for tailwind dark: variants)
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Open AI Modal
    await page.getByTitle('Ask AI about book').click();

    const modalContent = page.locator('.fixed.inset-0 .bg-white, .fixed.inset-0 .dark\\:bg-zinc-900').first();
    await expect(modalContent).toBeVisible();
    const bgColor = await modalContent.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
    expect(bgColor).not.toBe('oklch(1 0 0)');
  });

  test('Summary buttons are available in AI Modal', async ({ page }) => {
    await page.getByTitle('Ask AI about book').click();

    await expect(page.getByText('What just happened?')).toBeVisible();
    await expect(page.getByText('Remind me what happened recently')).toBeVisible();
    await expect(page.getByText('Remind me what happened in this chapter so far')).toBeVisible();
  });
});
