import { test, expect } from '@playwright/test';

// Hold-to-pause is fiddly, so RSVP also carries a visible pause target. It must
// stop playback on the press itself and must not bounce straight back into
// playing when the finger lifts.
test('the RSVP pause target stops playback', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  const mockWords = Array.from({ length: 200 }, (_, i) => ({
    text: `Word${i}`,
    isParagraphStart: i % 10 === 0,
    isSentenceStart: i % 5 === 0,
  }));
  await page.evaluate((words) => (window as any).__loadMockWords(words, []), mockWords);
  await page.evaluate(() => (window as any).__setWpm?.(800));

  const area = page.locator('[data-testid="paginated-reading-area"]');
  await area.click();

  const pauseTarget = page.locator('[data-testid="rsvp-pause"]');
  await expect(pauseTarget).toBeVisible();
  await page.waitForTimeout(300); // let a few words go by

  await pauseTarget.click();

  // Paused: the RSVP word is gone, the paginated page (and its menu) is back.
  await expect(page.locator('button[title="Open Menu"]')).toBeVisible();
  await expect(pauseTarget).toHaveCount(0);

  // And it stays paused — the click that lifted off the target must not be
  // read as a tap-to-play on the page underneath.
  await page.waitForTimeout(600);
  await expect(page.locator('button[title="Open Menu"]')).toBeVisible();
});

test('space pauses RSVP from the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  const mockWords = Array.from({ length: 200 }, (_, i) => ({
    text: `Word${i}`,
    isParagraphStart: i % 10 === 0,
    isSentenceStart: i % 5 === 0,
  }));
  await page.evaluate((words) => (window as any).__loadMockWords(words, []), mockWords);

  const area = page.locator('[data-testid="paginated-reading-area"]');
  await area.click();
  await expect(page.locator('[data-testid="rsvp-pause"]')).toBeVisible();

  await page.keyboard.press(' ');
  await expect(page.locator('button[title="Open Menu"]')).toBeVisible();
});
