import { test, expect } from '@playwright/test';

const WORD_COUNT = 600;

const pageBody = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="paginated-reading-area"] > div').first();

test.describe('reading margin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
    await page.evaluate((count) => {
      const words = Array.from({ length: count }, (_, i) => ({
        text: `word${i}`,
        isParagraphStart: i % 60 === 0,
        isSentenceStart: i % 12 === 0
      }));
      (window as any).__loadMockWords(words, [{ label: 'Chapter 1', startIndex: 0 }]);
    }, WORD_COUNT);
  });

  test('the margin buttons widen and narrow the page, and the size sticks', async ({ page }) => {
    const body = pageBody(page);
    await expect(body).toBeVisible();
    await expect(page.getByTestId('margin-value')).toHaveText('32');
    await expect(body).toHaveCSS('padding-left', '32px');

    const wordsAt = async () => {
      await page.waitForSelector('[data-testid="paginated-reading-area"][data-is-measuring="false"]');
      return page.locator('span[data-word-idx]').count();
    };

    // Wider margins mean a narrower column, so fewer words reach the page.
    // The buttons stop at the widest margin the setting allows.
    for (let i = 0; i < 20; i++) await page.getByTestId('margin-increase').click();
    await expect(page.getByTestId('margin-value')).toHaveText('160');
    await expect(body).toHaveCSS('padding-left', '160px');
    await expect(body).toHaveCSS('padding-right', '160px');
    const wordsAtWidest = await wordsAt();

    // ...and narrowing them again fits more.
    for (let i = 0; i < 24; i++) await page.getByTestId('margin-decrease').click();
    await expect(page.getByTestId('margin-value')).toHaveText('0');
    await expect(body).toHaveCSS('padding-left', '0px');
    expect(await wordsAt()).toBeGreaterThan(wordsAtWidest);

    // The margin is a setting, not a per-session tweak.
    await page.reload();
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
    await page.evaluate((count) => {
      const words = Array.from({ length: count }, (_, i) => ({
        text: `word${i}`,
        isParagraphStart: i % 60 === 0,
        isSentenceStart: i % 12 === 0
      }));
      (window as any).__loadMockWords(words, [{ label: 'Chapter 1', startIndex: 0 }]);
    }, WORD_COUNT);
    await expect(page.getByTestId('margin-value')).toHaveText('0');
  });
});
