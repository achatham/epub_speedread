import { test, expect } from '@playwright/test';

test('verify demo book cta styling', async ({ page }) => {
  await page.goto('http://localhost:5173/');

  // Wait for the mock function to be available
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  
  // Trigger the special "null" mode to load the empty Library View
  await page.evaluate(() => {
    (window as any).__loadMockWords(null);
  });

    // Verify the CTA is visible

    const ctaButton = page.getByRole('button', { name: 'Try "Frankenstein" Demo' });

    await expect(ctaButton).toBeVisible();

  

    // Verify the Info button is visible

    const infoButton = page.getByTitle('About Speed Reader');

    await expect(infoButton).toBeVisible();

  

    // Click Info button and verify About page content

    await infoButton.click();

    await expect(page.locator('text=Read faster, smarter.')).toBeVisible();

    

    // Go back

    await page.getByRole('button', { name: 'Back' }).click();

    await expect(ctaButton).toBeVisible();

  

    // Verify styling (rough check of class application indirectly via screenshot)

    await page.screenshot({ path: 'tests/screenshots/demo-book-cta.png' });

  });

  