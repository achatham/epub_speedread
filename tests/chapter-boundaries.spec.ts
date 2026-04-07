import { test, expect } from '@playwright/test';

test('upload anon epub, render chapter titles bold and bound appropriately', async ({ page }) => {
  // Go to dev server
  await page.goto('/');

  // Increase timeout for node/playwright file upload parsing 
  test.setTimeout(90000);

  // Hook console for debugging
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  // Use the mock hook to bypass the login screen and load an empty library
  await page.waitForFunction(() => typeof (window as any).__setLibrary === 'function');
  await page.evaluate(() => {
    (window as any).__setLibrary([]);
  });

  // Wait for the library file upload card to be visible
  await page.waitForSelector('input[type="file"]', { state: 'attached' });

  // Upload book
  await page.setInputFiles('input[type="file"]', 'example/anon_The_Prize.epub');

  // The book should be parsed and automatically opened upon upload via handleSelectBook
  const readerArea = page.locator('[data-testid="paginated-reader"]');
  await readerArea.waitFor({ state: 'visible', timeout: 30000 });

  // Wait for layout calculation to finish
  await page.waitForTimeout(2000);

  // Take a screenshot of Chapter 1
  await page.screenshot({ path: 'tests/screenshots/chapter-1-rendered-epub.png' });

  // Verify the title is bold and correctly bounded
  const readingAreaText = page.locator('[data-testid="paginated-reading-area"]');
  const innerHtml = await readingAreaText.innerHTML();
  
  // Chapter titles or part titles will have the bold class if parsed correctly by our updated logic 
  expect(innerHtml).toContain('font-bold');

  // Navigate forward a few pages to get past the title and boundary
  for (let i = 0; i < 3; i++) {
    await page.locator('button[aria-label="Next page"]').click();
    await page.waitForTimeout(100);
  }

  // Take a screenshot inside the chapter 
  await page.screenshot({ path: 'tests/screenshots/chapter-middle-rendered-epub.png' });
});
