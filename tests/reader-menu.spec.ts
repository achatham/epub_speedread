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
  // Click on the main container (avoiding the FAB)
  await page.click('body', { position: { x: 100, y: 100 } });
  // Now it should be playing. FAB should be hidden.
  await expect(page.locator('button[title="Open Menu"]')).not.toBeVisible();

  // Pause again
  await page.click('body', { position: { x: 100, y: 100 } });
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
  await page.locator('button:has(svg.lucide-chevron-left)').click();
  await expect(page.getByText('Reading Speed')).toBeVisible();

  // 5. Test Navigation Jumps
  await page.click('button:has-text("Navigation Jumps")');
  await expect(page.getByText('Previous Paragraph')).toBeVisible();
  await expect(page.getByText('Next Sentence')).toBeVisible();

  // Go back to main
  await page.locator('button:has(svg.lucide-chevron-left)').click();
  await expect(page.getByText('Reading Speed')).toBeVisible();

  // 6. Test WPM Change
  const initialWpm = await page.locator('span.text-2xl.font-bold').innerText();
  await page.click('button[title="Increase Speed"]');
  const newWpm = await page.locator('span.text-2xl.font-bold').innerText();
  expect(parseInt(newWpm)).toBeGreaterThan(parseInt(initialWpm));
});
