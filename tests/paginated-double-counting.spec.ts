import { test, expect } from '@playwright/test';

const MOCK_WORDS = Array.from({ length: 1000 }, (_, i) => ({
  text: `word${i}`,
  isParagraphStart: i % 20 === 0,
  isSentenceStart: i % 5 === 0,
}));

const MOCK_SECTIONS = [
  { label: 'Chapter One', startIndex: 0 },
];

test('paginated mode does not double-count words when flipping back and forth', async ({ page }) => {
  page.on('console', msg => {
    console.log('BROWSER:', msg.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  let totalWordsRead = 0;

  await page.exposeFunction('onLogReadingSession', (session: any) => {
    if (session.type === 'paginated') {
      console.log('NODE: onLogReadingSession called with', session.wordsRead, 'words');
      totalWordsRead += session.wordsRead;
    }
  });

  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);

    const storage = (window as any).MOCK_STORAGE;
    storage.logReadingSession = async (session: any) => {
      await (window as any).onLogReadingSession(session);
    };
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });

  await expect(page.locator('[data-testid="paginated-reader"]')).toBeVisible();

  // Wait for initial measuring to complete
  await expect(page.locator('[data-testid="paginated-reading-area"]')).toHaveAttribute('data-is-measuring', 'false');

  // 1. Move forward one page
  console.log('Step 1: Next page');
  await page.locator('button[aria-label="Next page"]').click();
  await page.waitForTimeout(500);
  const firstPassTotal = totalWordsRead;
  expect(firstPassTotal).toBeGreaterThan(0);
  console.log('Total words read after Step 1:', firstPassTotal);

  // 2. Move backward to start
  console.log('Step 2: Previous page');
  await page.locator('button[aria-label="Previous page"]').click();
  await page.waitForTimeout(500);
  console.log('Total words read after Step 2:', totalWordsRead);

  // 3. Move forward again to the same page
  console.log('Step 3: Next page again');
  await page.locator('button[aria-label="Next page"]').click();
  await page.waitForTimeout(500);
  console.log('Total words read after Step 3:', totalWordsRead);

  // Total words read should be the same as after the first Step 1
  expect(totalWordsRead).toBe(firstPassTotal);

  // 4. Move forward to a NEW page
  console.log('Step 4: Next page (new)');
  await page.locator('button[aria-label="Next page"]').click();
  await page.waitForTimeout(500);
  console.log('Total words read after Step 4:', totalWordsRead);

  expect(totalWordsRead).toBeGreaterThan(firstPassTotal);
});
