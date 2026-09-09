import { test, expect } from '@playwright/test';

const MOCK_WORDS = Array.from({ length: 200 }, (_, i) => ({
  text: `Word${i}`,
  isParagraphStart: i % 10 === 0,
  isSentenceStart: i % 5 === 0,
}));

async function startPlaying(page: any) {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate((words: any[]) => (window as any).__loadMockWords(words, []), MOCK_WORDS);
  await page.evaluate(() => (window as any).__setWpm?.(800));

  const area = page.locator('[data-testid="paginated-reading-area"]');
  await area.click();
  await expect(page.locator('[data-testid="rsvp-pause"]')).toBeVisible();
  return area;
}

// Hold-to-pause is fiddly, so RSVP also carries a visible pause target. It
// freezes in place rather than ending playback (which would drop back to the
// page view and rewind), but a request made mid-sentence lands at its end.
test('the pause target finishes the current sentence, then freezes RSVP in place', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  const words = Array.from({ length: 30 }, (_, i) => ({
    text: `Word${i}`,
    isParagraphStart: i === 0,
    isSentenceStart: i === 0 || i === 5,
  }));
  await page.evaluate((mockWords: any[]) => (window as any).__loadMockWords(mockWords, []), words);
  // A full second per word makes the targeted mid-sentence press reliable in
  // Docker too; at 240 WPM polling can legitimately skip Word1.
  await page.evaluate(() => (window as any).__setWpm?.(60));

  const area = page.locator('[data-testid="paginated-reading-area"]');
  await area.click();
  const pauseTarget = page.locator('[data-testid="rsvp-pause"]');
  await expect(pauseTarget).toBeVisible();

  // Request a pause specifically while the first sentence is still in flight.
  const rsvpWord = page.locator('[data-testid="rsvp-word"]');
  await expect(rsvpWord).toHaveAttribute('data-word-index', '1');
  await pauseTarget.click();
  await expect(pauseTarget).toHaveAttribute('data-pause-pending', 'true');
  await expect(pauseTarget).toHaveAttribute('data-paused', 'false');

  // Still in RSVP — not back on the page — but freeze on Word4, just before
  // Word5 (the start of the next sentence), rather than on the requested word.
  await expect(pauseTarget).toHaveAttribute('data-paused', 'true');
  await expect(pauseTarget).toHaveAttribute('data-pause-pending', 'false');
  await expect(rsvpWord).toBeVisible();
  await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();
  await expect(rsvpWord).toHaveAttribute('data-word-index', '4');

  await page.waitForTimeout(800);
  await expect(rsvpWord).toHaveAttribute('data-word-index', '4');

  // Resuming carries on from the sentence end, with no rewind.
  await pauseTarget.click();
  await expect(pauseTarget).toHaveAttribute('data-paused', 'false');
  await expect.poll(async () => Number(
    await rsvpWord.getAttribute('data-word-index'),
  )).toBeGreaterThan(4);
});

test('space pauses in place and escape leaves RSVP', async ({ page }) => {
  const area = await startPlaying(page);
  const pauseTarget = page.locator('[data-testid="rsvp-pause"]');

  await page.keyboard.press(' ');
  await expect(pauseTarget).toHaveAttribute('data-paused', 'true');
  const pausedWord = await area.innerText();
  await page.waitForTimeout(600);
  expect(await area.innerText()).toBe(pausedWord);

  await page.keyboard.press(' ');
  await expect(pauseTarget).toHaveAttribute('data-paused', 'false');
  await expect.poll(() => area.innerText()).not.toBe(pausedWord);

  await page.keyboard.press('Escape');
  await expect(page.locator('button[title="Open Menu"]')).toBeVisible();
  await expect(pauseTarget).toHaveCount(0);
});

// Tapping the screen is still the way out of RSVP, and it must work while the
// pause target is engaged rather than being read as a hold-release.
test('tapping the screen while paused in place returns to the page', async ({ page }) => {
  await startPlaying(page);
  const pauseTarget = page.locator('[data-testid="rsvp-pause"]');

  await pauseTarget.click();
  await expect(pauseTarget).toHaveAttribute('data-paused', 'true');

  await page.locator('.fixed.inset-0.z-40').click();
  await expect(page.locator('button[title="Open Menu"]')).toBeVisible();
  await expect(pauseTarget).toHaveCount(0);
});
