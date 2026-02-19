import { test, expect } from '@playwright/test';

test('Reader Menu Functionality', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  const mockWords = Array.from({ length: 100 }, (_, i) => ({ text: `Word${i}`, isParagraphStart: i % 10 === 0, isSentenceStart: i % 5 === 0 }));
  const mockSections = [
    { label: 'Chapter 1', startIndex: 0 },
    { label: 'Chapter 2', startIndex: 50 }
  ];

  await page.evaluate(({ words, sections }) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: mockWords, sections: mockSections });

  // 1. Initial State: Paused
  await expect(page.locator('button[title="Open Menu"]')).toBeVisible();

  // 2. Play via screen click (click the first word)
  await page.getByText('Word0').click();
  // Now it should be playing. FAB should be hidden.
  await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();

  // 3. Tap to exit to library
  await page.mouse.click(400, 300);
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

  // 4. Re-enter book to test menu
  await page.evaluate(({ words, sections }) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: mockWords, sections: mockSections });

  // 5. Open Menu
  await page.click('button[title="Open Menu"]');
  await expect(page.getByText('Reading Speed')).toBeVisible();

  // 6. Test Table of Contents
  await page.click('button:has-text("Table of Contents")');
  await expect(page.getByRole('button', { name: 'Chapter 1' })).toBeVisible();

  // Go back to main
  await page.locator('button:has(svg.lucide-chevron-left):not(:has-text("Library"))').click();
  await expect(page.getByText('Reading Speed')).toBeVisible();

  // 7. Test Navigation Jumps
  await page.click('button:has-text("Navigation Jumps")');
  await expect(page.getByText('Previous Paragraph')).toBeVisible();

  // Go back to main
  await page.locator('button:has(svg.lucide-chevron-left):not(:has-text("Library"))').click();
  await expect(page.getByText('Reading Speed')).toBeVisible();

  // 8. Test WPM Change
  const initialWpmValue = await page.locator('span.text-2xl.font-bold').innerText();
  await page.click('button[title="Increase Speed"]');
  const newWpmValue = await page.locator('span.text-2xl.font-bold').innerText();
  expect(parseInt(newWpmValue)).toBeGreaterThan(parseInt(initialWpmValue));
});
