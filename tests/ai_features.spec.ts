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

    // Ensure the menu button is visible
    await expect(page.locator('button[title="Open Menu"]')).toBeVisible();
  });

  test('AI Modal respects dark mode', async ({ page }) => {
    // Open Menu first
    await page.click('button[title="Open Menu"]');
    await expect(page.getByText('Reading Speed')).toBeVisible();

    // Switch to dark theme
    const themeButton = page.getByRole('button', { name: 'Theme' });
    await expect(themeButton).toBeVisible();
    await themeButton.click(); // to next theme

    // Verify html has dark class
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Open AI Modal
    const aiButton = page.getByRole('button', { name: 'Ask AI' });
    await expect(aiButton).toBeVisible();
    await aiButton.click();

    // Check modal background color
    const modalContent = page.locator('.fixed.inset-0 .bg-white, .fixed.inset-0 .dark\\:bg-zinc-900').first();
    await expect(modalContent).toBeVisible();

    const bgColor = await modalContent.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('AI Modal respects bedtime mode (extra dark)', async ({ page }) => {
    // Open Menu
    await page.click('button[title="Open Menu"]');
    await expect(page.getByText('Reading Speed')).toBeVisible();

    // Switch to bedtime theme
    const themeButton = page.getByRole('button', { name: 'Theme' });
    await expect(themeButton).toBeVisible();
    await themeButton.click();
    await themeButton.click();

    // Verify html still has dark class
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Open AI Modal
    const aiButton = page.getByRole('button', { name: 'Ask AI' });
    await expect(aiButton).toBeVisible();
    await aiButton.click();

    const modalContent = page.locator('.fixed.inset-0 .bg-white, .fixed.inset-0 .dark\\:bg-zinc-900').first();
    await expect(modalContent).toBeVisible();
    const bgColor = await modalContent.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('Summary buttons are available in AI Modal', async ({ page }) => {
    // Open Menu
    await page.click('button[title="Open Menu"]');
    await expect(page.getByText('Reading Speed')).toBeVisible();

    // Open AI Modal
    const aiButton = page.getByRole('button', { name: 'Ask AI' });
    await expect(aiButton).toBeVisible();
    await aiButton.click();

    await expect(page.getByText('What just happened?')).toBeVisible();
    await expect(page.getByText('Remind me what happened recently')).toBeVisible();
    await expect(page.getByText('Remind me what happened in this chapter so far')).toBeVisible();
  });
});
