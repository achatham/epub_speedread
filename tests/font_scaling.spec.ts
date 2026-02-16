import { test, expect } from '@playwright/test';

test('font size should remain stable for "accessibility;" within tolerance', async ({ page }) => {
  // 1. Load the app
  await page.goto('/');

  // 2. Inject mock words
  // Wait for the function to be defined by React's useEffect
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  
  await page.evaluate(() => {
    (window as any).__loadMockWords([
      { text: "The", paragraphIndex: 0, sentenceIndex: 0 },
      { text: "accessibility;", paragraphIndex: 0, sentenceIndex: 0 },
      { text: "test.", paragraphIndex: 0, sentenceIndex: 0 }
    ]);
  });

  // 3. Wait for the reader to load and the ReaderMenu FAB to be visible
  const menuFab = page.locator('button[title="Open Menu"]');
  await expect(menuFab).toBeVisible();

  // 4. Measure "The" (first word)
  // Click anywhere on the body to start playing
  await page.click('body');
  
  const rsvpContainer = page.locator('.flex.w-full.items-baseline');
  await expect(rsvpContainer).toBeVisible();

  const fontSizeNormal = await rsvpContainer.evaluate((el) => {
    return window.getComputedStyle(el).fontSize;
  });

  // 5. Wait for "accessibility;" to appear
  const suffixLocator = page.locator('text=ssibility;');
  await expect(suffixLocator).toBeVisible({ timeout: 5000 });

  // Measure font size of "accessibility;"
  const fontSizeLongWord = await rsvpContainer.evaluate((el) => {
    return window.getComputedStyle(el).fontSize;
  });

  // 6. Assert they are the same
  expect(fontSizeLongWord).toBe(fontSizeNormal);

  // 7. Take a screenshot for visual verification of layout
  await page.screenshot({ path: 'tests/layout-verification.png' });
});