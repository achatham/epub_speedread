import { test, expect } from '@playwright/test';

test('pausing during chapter interlude should advance to next chapter and not back up on resume', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  await page.evaluate(() => {
    (window as any).__loadMockWords([
      { text: "This", isParagraphStart: true, isSentenceStart: true },
      { text: "is", isParagraphStart: false, isSentenceStart: false },
      { text: "the", isParagraphStart: false, isSentenceStart: false },
      { text: "end.", isParagraphStart: false, isSentenceStart: false },
      { text: "Beginning", isParagraphStart: true, isSentenceStart: true },
      { text: "of", isParagraphStart: false, isSentenceStart: false },
      { text: "new", isParagraphStart: false, isSentenceStart: false },
      { text: "section.", isParagraphStart: false, isSentenceStart: false }
    ], [
      { label: "Chapter 1", startIndex: 0 },
      { label: "Chapter 2", startIndex: 4 }
    ]);
  });

  const menuFab = page.locator('button[title="Open Menu"]');
  await expect(menuFab).toBeVisible();
  await page.click('body');

  // Wait for the "Next Chapter" interlude to appear
  // It appears when currentIndex is 3 and isChapterBreak becomes true
  const interludeLabel = page.locator('div').filter({ hasText: /^Next Chapter$/ });
  await expect(interludeLabel).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=Chapter 2')).toBeVisible();

  // Now we are in the interlude. currentIndex is 3.
  // Click to pause.
  await page.locator('.fixed.inset-0.z-40').click();

  // Verify we are paused (Menu FAB should be visible again)
  await expect(menuFab).toBeVisible();

  // Optional: check that interlude is gone
  await expect(interludeLabel).not.toBeVisible();

  // Now click to Play again.
  await page.click('body');

  // Focus word should be "Beginning" (index 4)
  // The RSVP container should show the word (prefix+focus+suffix concatenated)
  const rsvpContainer = page.locator('.flex.w-full.items-baseline');
  await expect(rsvpContainer).toHaveText(/Beginning/);
});

test('pausing normally should back up to start of sentence on resume', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  await page.evaluate(() => {
    (window as any).__loadMockWords([
      { text: "This", isParagraphStart: true, isSentenceStart: true },
      { text: "is", isParagraphStart: false, isSentenceStart: false },
      { text: "the", isParagraphStart: false, isSentenceStart: false },
      { text: "end.", isParagraphStart: false, isSentenceStart: false }
    ], [
      { label: "Chapter 1", startIndex: 0 }
    ]);
    // Set a very slow WPM for the test
    (window as any).__setWpm?.(60); 
  });

  const menuFab = page.locator('button[title="Open Menu"]');
  await page.click('body');

  // Wait for "end."
  const rsvpContainer = page.locator('.flex.w-full.items-baseline');
  await expect(rsvpContainer).toHaveText(/end\./, { timeout: 20000 });

  // Pause
  await page.locator('.fixed.inset-0.z-40').click();
  await expect(menuFab).toBeVisible();

  // Play again
  await page.click('body');

  // Should have backed up to "This"
  await expect(rsvpContainer).toHaveText(/This/);
});
