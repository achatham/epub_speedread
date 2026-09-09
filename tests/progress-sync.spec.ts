import { test, expect } from '@playwright/test';

// A tab left open all day used to keep the position it fell asleep on and
// write it back over reading done elsewhere. Waking now asks the server first,
// and only the more recent reading wins.

const MOCK_WORDS = Array.from({ length: 2000 }, (_, i) => ({
  text: `word${i}`,
  isParagraphStart: i % 20 === 0,
  isSentenceStart: i % 5 === 0,
}));

const BOOK_ID = 'mock-book-id';
const AN_HOUR = 3600_000;

async function openBook(page: any) {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate((words: any[]) => {
    (window as any).__loadMockWords(words, [{ label: 'Chapter One', startIndex: 0 }]);
  }, MOCK_WORDS);

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');
  return readingArea;
}

/** Plays the part of the OS handing the tab back to the user. */
async function wakeTab(page: any) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

test('waking catches up to a position read more recently elsewhere', async ({ page }) => {
  const readingArea = await openBook(page);
  const firstPageText = await readingArea.innerText();
  expect(firstPageText).toContain('word0');

  // Another device read to word 1200 while this tab was asleep.
  await page.evaluate(({ bookId, reachedAt }) => {
    (window as any).MOCK_STORAGE._setProgress(bookId, { wordIndex: 1200, reachedAt });
  }, { bookId: BOOK_ID, reachedAt: Date.now() });

  await wakeTab(page);

  await expect.poll(() => readingArea.innerText()).toContain('word1200');
});

test('waking does not rewind to an older position from another device', async ({ page }) => {
  const readingArea = await openBook(page);

  // Read a couple of pages here, which records a position for this device.
  await page.locator('button', { hasText: 'Next' }).click();
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');
  const currentPageText = await readingArea.innerText();
  expect(currentPageText).not.toContain('word0 ');

  // A device that stopped reading an hour ago reports where it left off.
  await page.evaluate(({ bookId, reachedAt }) => {
    (window as any).MOCK_STORAGE._setProgress(bookId, { wordIndex: 5, reachedAt });
  }, { bookId: BOOK_ID, reachedAt: Date.now() - AN_HOUR });

  await wakeTab(page);
  await page.waitForTimeout(500);

  expect(await readingArea.innerText()).toBe(currentPageText);
});

test('the position is recorded as it is read, not only when the book closes', async ({ page }) => {
  const readingArea = await openBook(page);
  await page.locator('button', { hasText: 'Next' }).click();
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');

  const saved = await page.evaluate(bookId => {
    const raw = localStorage.getItem('reading-progress-v1');
    return raw ? JSON.parse(raw)[bookId] : null;
  }, BOOK_ID);

  expect(saved).not.toBeNull();
  expect(saved.wordIndex).toBeGreaterThan(0);
  expect(saved.reachedAt).toBeGreaterThan(0);
});
