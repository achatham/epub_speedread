import { test, expect } from '@playwright/test';

test('Stats View Icons and Layout', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  page.on('pageerror', err => console.log('PAGE_ERROR:', err));
  page.on('console', msg => console.log('CONSOLE:', msg.text()));

  const mockWords = Array.from({ length: 10 }, (_, i) => ({ text: `Word${i}`, isParagraphStart: i === 0, isSentenceStart: i === 0 }));

  
  // Set up three different session types to verify the different icons
  const now = Date.now();
  const mockSessions = [
    { id: '1', bookId: 'mock', bookTitle: 'Mock Book', startTime: now - 10000, endTime: now, type: 'reading', durationSeconds: 60, wordsRead: 200, startWordIndex: 0, endWordIndex: 200 },
    { id: '2', bookId: 'mock', bookTitle: 'Mock Book', startTime: now - 20000, endTime: now - 10000, type: 'paginated', durationSeconds: 60, wordsRead: 200, startWordIndex: 0, endWordIndex: 200 },
    { id: '3', bookId: 'mock', bookTitle: 'Mock Book', startTime: now - 30000, endTime: now - 20000, type: 'listening', durationSeconds: 60, wordsRead: 200, startWordIndex: 0, endWordIndex: 200 },
  ];

  const mockSections = [{ label: 'Chapter 1', startIndex: 0 }];

  await page.evaluate(({ words, sections, sessions }) => {
    (window as any).__loadMockWords(words, sections, sessions);
  }, { words: mockWords, sections: mockSections, sessions: mockSessions });

  try {
    await expect(page.locator('button[title="Open Menu"]')).toBeVisible({ timeout: 5000 });
  } catch (e) {
    await page.screenshot({ path: 'tests/screenshots/debug-menu-missing.png' });
    throw e;
  }
  await page.click('button[title="Open Menu"]');
  await page.click('button:has-text("Stats")');

  // Wait for the Reading Stats modal to be completely visible
  await expect(page.getByRole('heading', { name: 'Reading Stats' })).toBeVisible();
  
  // Give the chart animations a tiny bit of time to render
  await page.waitForTimeout(500);

  // Switch to Overall History tab to ensure we see the history list
  await page.click('button:has-text("Overall History")');
  await page.waitForTimeout(500);

  // Take screenshot of the Stats View modal
  await expect(page).toHaveScreenshot(['screenshots', 'stats-view-history.png']);
});
