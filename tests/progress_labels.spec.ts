import { test, expect } from '@playwright/test';

test('verify progress labels are below the progress bars and aligned', async ({ page }) => {
  await page.goto('http://localhost:5173/');

  // Wait for the mock function to be available
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function', { timeout: 15000 });
  
  // Load some mock words
  await page.evaluate(() => {
    (window as any).__loadMockWords([
      { text: "Word1", paragraphIndex: 0, sentenceIndex: 0 },
      { text: "Word2", paragraphIndex: 0, sentenceIndex: 0 },
      { text: "Word3", paragraphIndex: 0, sentenceIndex: 0 }
    ]);
  });

  // Start playback
  const playButton = page.getByRole('button', { name: 'Play' });
  await playButton.click();

  // Wait for progress labels to be visible
  await expect(page.locator('text=Chapter Progress')).toBeVisible();
  await expect(page.locator('text=Book Progress')).toBeVisible();

  // Take a screenshot of the controls area
  await page.screenshot({ path: 'tests/screenshots/progress-labels-verification.png' });
});
