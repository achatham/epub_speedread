import { test, expect } from '@playwright/test';

// Regression test for the hold-to-pause gesture: while the screen is held,
// RSVP must stop advancing words, and it must resume on release. Previously a
// spurious pointercancel (no touch-action:none on the overlay) could un-pause
// mid-hold, and the WPM ramp was reset on every hold.
test('Holding the screen pauses RSVP, releasing resumes it', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  const mockWords = Array.from({ length: 200 }, (_, i) => ({
    text: `Word${i}`,
    isParagraphStart: i % 10 === 0,
    isSentenceStart: i % 5 === 0,
  }));
  await page.evaluate((words) => (window as any).__loadMockWords(words, []), mockWords);

  // Fast speed so words advance quickly while playing (makes a stuck/advancing
  // word obvious within the wait windows below).
  await page.evaluate(() => (window as any).__setWpm?.(800));

  const area = page.locator('[data-testid="paginated-reading-area"]');

  // Start playback by tapping the reading area.
  await area.click();
  await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();
  await page.waitForTimeout(400); // let it advance a few words

  // Press and hold in the centre of the screen.
  const box = await area.boundingBox();
  if (!box) throw new Error('reading area has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100); // let the hold-pause settle

  // The word must stay frozen across a window that would otherwise advance many
  // words at 800 wpm.
  const wordAtHoldStart = await area.innerText();
  await page.waitForTimeout(800);
  const wordDuringHold = await area.innerText();
  expect(wordDuringHold).toBe(wordAtHoldStart);

  // Release after >300ms so it resumes (a sub-300ms press is a tap-to-pause).
  await page.mouse.up();

  // Playback resumes and advances again.
  await page.waitForTimeout(500);
  const wordAfterRelease = await area.innerText();
  expect(wordAfterRelease).not.toBe(wordDuringHold);
});
