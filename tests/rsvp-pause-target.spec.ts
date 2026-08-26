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
// freezes the word in place — it does not end playback, which would drop back
// to the page view and rewind to the start of the sentence on resume.
test('the pause target freezes RSVP in place and resumes from the same word', async ({ page }) => {
  const area = await startPlaying(page);
  const pauseTarget = page.locator('[data-testid="rsvp-pause"]');
  const rsvpWord = page.locator('.flex.w-full.items-baseline');

  await page.waitForTimeout(300); // let a few words go by
  await pauseTarget.click();

  // Still in RSVP — not back on the page — and the word is frozen.
  await expect(rsvpWord).toBeVisible();
  await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();
  await expect(pauseTarget).toHaveAttribute('data-paused', 'true');

  const pausedWord = await area.innerText();
  await page.waitForTimeout(800); // would be many words at 800 wpm
  expect(await area.innerText()).toBe(pausedWord);

  // Resuming carries on from the word we stopped on, with no rewind.
  await pauseTarget.click();
  await expect(pauseTarget).toHaveAttribute('data-paused', 'false');
  await expect.poll(() => area.innerText()).not.toBe(pausedWord);
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
