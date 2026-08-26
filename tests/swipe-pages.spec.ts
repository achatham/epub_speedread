import { test, expect } from '@playwright/test';

// Swipes are driven as real touch gestures (CDP touch emulation) rather than
// mouse drags: the bug this guards against is phone-only — the browser claims a
// horizontal drag as a pan and cancels the pointer stream, which a mouse drag
// never reproduces.
test.use({ hasTouch: true });

const MOCK_WORDS = Array.from({ length: 2000 }, (_, i) => ({
  text: `word${i}`,
  isParagraphStart: i % 20 === 0,
  isSentenceStart: i % 5 === 0,
}));

async function swipe(page: any, from: { x: number; y: number }, dx: number) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let step = 1; step <= 5; step++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (dx * step) / 5, y: from.y }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

test('swiping the middle of the page turns pages', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate((words: any[]) => {
    (window as any).__loadMockWords(words, [{ label: 'Chapter One', startIndex: 0 }]);
  }, MOCK_WORDS);

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');
  const firstPageText = await readingArea.innerText();

  const box = (await readingArea.boundingBox())!;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // Swipe left (drag towards the left edge) — forward a page.
  await swipe(page, middle, -200);
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');
  await expect.poll(() => readingArea.innerText()).not.toBe(firstPageText);

  // Swipe right — back again.
  await swipe(page, middle, 200);
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');
  await expect.poll(() => readingArea.innerText()).toBe(firstPageText);
});

test('a swipe does not also start RSVP playback', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate((words: any[]) => {
    (window as any).__loadMockWords(words, [{ label: 'Chapter One', startIndex: 0 }]);
  }, MOCK_WORDS);

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');

  const box = (await readingArea.boundingBox())!;
  await swipe(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, -200);

  // Still paged, not playing: the menu FAB is only rendered when paused.
  await expect(page.locator('button[title="Open Menu"]')).toBeVisible();
  await expect(page.locator('[data-testid="rsvp-pause"]')).toHaveCount(0);
});

test('swiping works from the edge tap zones too', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate((words: any[]) => {
    (window as any).__loadMockWords(words, [{ label: 'Chapter One', startIndex: 0 }]);
  }, MOCK_WORDS);

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');
  const firstPageText = await readingArea.innerText();

  const box = (await readingArea.boundingBox())!;
  // Start the drag inside the right-hand tap strip: the strip must not swallow
  // the gesture and turn it into a tap.
  await swipe(page, { x: box.x + box.width - 30, y: box.y + box.height / 2 }, -200);

  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');
  await expect.poll(() => readingArea.innerText()).not.toBe(firstPageText);
});
