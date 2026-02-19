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

  // Start playing by clicking a visible word
  await page.getByText('This').click();

  // Wait for the "Next Chapter" interlude to appear
  const interludeLabel = page.locator('div').filter({ hasText: /^Next Chapter$/ });
  await expect(interludeLabel).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=Chapter 2')).toBeVisible();

  // Tap to exit to library. Click anywhere on the overlay.
  await page.mouse.click(400, 300);
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

  // Re-enter book
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

  // Tap to start again
  await page.getByText('Beginning').click();

  const rsvpContainer = page.locator('.flex.w-full.items-baseline');
  await expect(rsvpContainer).toHaveText(/Beginning|of|new/, { timeout: 10000 });
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
    (window as any).__setWpm?.(60); 
  });

  // Start playing
  await page.getByText('This').click();

  // Wait for "end."
  const rsvpContainer = page.locator('.flex.w-full.items-baseline');
  await expect(rsvpContainer).toHaveText(/end\./, { timeout: 20000 });

  // Tap to exit
  await page.mouse.click(400, 300);
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

  // Re-enter
  await page.evaluate(() => {
    (window as any).__loadMockWords([
      { text: "This", isParagraphStart: true, isSentenceStart: true },
      { text: "is", isParagraphStart: false, isSentenceStart: false },
      { text: "the", isParagraphStart: false, isSentenceStart: false },
      { text: "end.", isParagraphStart: false, isSentenceStart: false }
    ], [
      { label: "Chapter 1", startIndex: 0 }
    ]);
  });

  // Play again
  await page.getByText('This').click();

  // Should have backed up to "This"
  await expect(rsvpContainer).toHaveText(/This/, { timeout: 10000 });
});
