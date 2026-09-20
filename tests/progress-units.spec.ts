import { test, expect } from '@playwright/test';

// 3000 words is 10 pages at 300 words/page, and 10 minutes at the default
// 300 wpm — so the same book reads as "10" in either unit and the assertions
// below are about the wording, not the arithmetic.
const WORD_COUNT = 3000;

test.describe('progress units', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
    await page.evaluate((count) => {
      const words = Array.from({ length: count }, (_, i) => ({
        text: `word${i}`,
        isParagraphStart: i === 0,
        isSentenceStart: i === 0
      }));
      (window as any).__loadMockWords(words, [{ label: 'Chapter 1', startIndex: 0 }]);
    }, WORD_COUNT);
  });

  test('reports progress in pages by default, and follows the stats toggle', async ({ page }) => {
    await page.click('button[title="Open Menu"]');
    await expect(page.getByText('10 pages remaining in book')).toBeVisible();

    await page.click('button:has-text("Stats")');
    await expect(page.getByRole('heading', { name: 'Reading Stats' })).toBeVisible();
    await expect(page.getByText('Read Pages')).toBeVisible();

    // Switching the unit re-labels the stats cards...
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    await expect(page.getByText('Read Mins')).toBeVisible();
    await expect(page.getByText('Read Pages')).toHaveCount(0);

    // ...and carries over to the reader menu's remaining readout.
    await page.getByRole('button', { name: 'Close stats' }).click();
    await page.click('button[title="Open Menu"]');
    await expect(page.getByText('10 min remaining in book')).toBeVisible();

    // And back again.
    await page.click('button:has-text("Stats")');
    await page.getByRole('button', { name: 'Pages', exact: true }).click();
    await page.getByRole('button', { name: 'Close stats' }).click();
    await page.click('button[title="Open Menu"]');
    await expect(page.getByText('10 pages remaining in book')).toBeVisible();
  });

  test('the unit choice survives a reload', async ({ page }) => {
    await page.click('button[title="Open Menu"]');
    await page.click('button:has-text("Stats")');
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    await page.getByRole('button', { name: 'Close stats' }).click();

    await page.reload();
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
    await page.evaluate((count) => {
      const words = Array.from({ length: count }, (_, i) => ({
        text: `word${i}`,
        isParagraphStart: i === 0,
        isSentenceStart: i === 0
      }));
      (window as any).__loadMockWords(words, [{ label: 'Chapter 1', startIndex: 0 }]);
    }, WORD_COUNT);

    await page.click('button[title="Open Menu"]');
    await expect(page.getByText('10 min remaining in book')).toBeVisible();
  });
});
