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

  await page.screenshot({ path: 'tests/screenshots/before-play.png' });

  // Start playback
  const playButton = page.getByRole('button', { name: 'Play' });
  await playButton.click();

  // Wait for progress labels to be visible
  const chapterLabel = page.locator('text=Chapter Progress');
  const bookLabel = page.locator('text=Book Progress');
  await expect(chapterLabel).toBeVisible();
  await expect(bookLabel).toBeVisible();

  // Find the progress bars (h-1 elements)
  const progressBars = page.locator('.h-1');
  await expect(progressBars).toHaveCount(2);
  const chapterBar = progressBars.first();
  const bookBar = progressBars.nth(1);

  const chapterLabelBox = await chapterLabel.boundingBox();
  const chapterBarBox = await chapterBar.boundingBox();
  const bookLabelBox = await bookLabel.boundingBox();
  const bookBarBox = await bookBar.boundingBox();

  if (chapterLabelBox && chapterBarBox && bookLabelBox && bookBarBox) {
    // Chapter Progress should be ABOVE Chapter Bar
    expect(chapterLabelBox.y).toBeLessThan(chapterBarBox.y);
    // Book Progress should be BELOW Book Bar
    expect(bookLabelBox.y).toBeGreaterThan(bookBarBox.y);
    
    console.log('Layout verified: Labels are correctly stacked.');
  } else {
    throw new Error('Could not get bounding boxes for layout verification');
  }

  // Take a screenshot of the controls area
  await page.screenshot({ path: 'tests/screenshots/progress-labels-verification.png' });
});
