import { test, expect } from '@playwright/test';

const MOCK_WORDS = Array.from({ length: 2000 }, (_, i) => ({
  text: `word${i}`,
  isParagraphStart: i % 20 === 0,
  isSentenceStart: i % 5 === 0,
}));

const MOCK_SECTIONS = [{ label: 'Chapter One', startIndex: 0 }];

async function loadBook(page: any) {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toBeVisible();
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');
  return readingArea;
}

test('tapping the page edges turns pages', async ({ page }) => {
  const readingArea = await loadBook(page);
  const firstPageText = await readingArea.innerText();

  // The left zone is absent on the first page — there is nothing to go back to.
  await expect(page.locator('[data-testid="page-tap-prev"]')).toHaveCount(0);

  const box = (await readingArea.boundingBox())!;
  await page.mouse.click(box.x + box.width - 20, box.y + box.height / 2);
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');

  const secondPageText = await readingArea.innerText();
  expect(secondPageText).not.toBe(firstPageText);
  expect(secondPageText).not.toContain('word0 ');

  // Now the left edge is live and takes us back.
  await expect(page.locator('[data-testid="page-tap-prev"]')).toBeVisible();
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');
  await expect.poll(() => readingArea.innerText()).toBe(firstPageText);
});

test('tapping the middle of the page still starts RSVP', async ({ page }) => {
  const readingArea = await loadBook(page);
  const box = (await readingArea.boundingBox())!;

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="rsvp-pause"]')).toBeVisible();
});
