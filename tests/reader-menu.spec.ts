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

  // 2. Play/Pause via screen click
  // Click on the reading area
  await page.click('[data-testid="paginated-reading-area"]');
  // Now it should be playing. FAB should be hidden.
  await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();

  // Pause again
  await page.click('[data-testid="paginated-reading-area"]');
  await expect(page.locator('button[title="Open Menu"]')).toBeVisible();

  // 3. Open Menu
  await page.click('button[title="Open Menu"]');
  await expect(page.getByText('Reading Speed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stats' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Table of Contents' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Navigation Jumps' })).toBeVisible();

  // 4. Test Table of Contents
  await page.click('button:has-text("Table of Contents")');
  // Use getByRole to avoid ambiguity with the background chapter info
  await expect(page.getByRole('button', { name: 'Chapter 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chapter 2' })).toBeVisible();

  // Go back to main
  await page.locator('button[aria-label="Back to main menu"]').click();
  await expect(page.getByText('Reading Speed')).toBeVisible();

  // 5. Test Navigation Jumps
  await page.click('button:has-text("Navigation Jumps")');
  await expect(page.getByText('Previous Paragraph')).toBeVisible();
  await expect(page.getByText('Next Sentence')).toBeVisible();

  // Go back to main
  await page.locator('button[aria-label="Back to main menu"]').click();
  await expect(page.getByText('Reading Speed')).toBeVisible();

  // 6. Test WPM Change
  const initialWpm = await page.locator('span.text-2xl.font-bold').innerText();
  await page.click('button[title="Increase Speed"]');
  const newWpm = await page.locator('span.text-2xl.font-bold').innerText();
  expect(parseInt(newWpm)).toBeGreaterThan(parseInt(initialWpm));

  // 7. Test float WPM rounding and snapping
  await page.evaluate(() => {
    (window as any).__setWpm?.(603.0499099378934);
  });

  // Display should be rounded to nearest integer
  let displayedWpm = await page.locator('span.text-2xl.font-bold').innerText();
  expect(displayedWpm).toBe('603');

  // Decreasing from 603 should snap to nearest 25 below it: Math.round(603/25)*25 - 25 = 600 - 25 = 575
  await page.click('button[title="Decrease Speed"]');
  displayedWpm = await page.locator('span.text-2xl.font-bold').innerText();
  expect(displayedWpm).toBe('575');

  // Increasing from 575 should go to 600
  await page.click('button[title="Increase Speed"]');
  displayedWpm = await page.locator('span.text-2xl.font-bold').innerText();
  expect(displayedWpm).toBe('600');
});
