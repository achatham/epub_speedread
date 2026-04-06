import { test, expect } from '@playwright/test';

const MOCK_WORDS = Array.from({ length: 10000 }, (_, i) => ({
  text: `word${i}`,
  isParagraphStart: i % 20 === 0,
  isSentenceStart: i % 5 === 0,
}));

const MOCK_SECTIONS = [
  { label: 'Chapter 1', startIndex: 0 },
  { label: 'Chapter 2', startIndex: 2000 },
  { label: 'Chapter 3', startIndex: 4000 },
  { label: 'Chapter 4', startIndex: 6000 },
  { label: 'Chapter 5', startIndex: 8000 },
];

test('pagination stability: no words are skipped when paging forward and back', async ({ page }) => {
  // Set a fixed viewport to ensure consistent layout
  await page.setViewportSize({ width: 1000, height: 800 });

  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  
  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });

  // Switch to paginated mode
  await page.locator('button[title="Open Menu"]').click();
  await page.locator('button:has-text("Page")').click();
  await page.locator('[data-testid="paginated-reader"]').waitFor({ state: 'visible' });

  // Jump to Chapter 3
  await page.locator('button[title="Open Menu"]').click();
  await page.locator('button:has-text("Table of Contents")').click();
  await page.locator('button:has-text("Chapter 3")').click();

  // Helper to get current word range
  const getRange = async () => {
    const readingArea = page.locator('[data-testid="paginated-reading-area"]');
    const spans = readingArea.locator('span[data-word-idx]');
    const count = await spans.count();
    if (count === 0) return { start: -1, end: -1 };
    
    const start = await spans.first().getAttribute('data-word-idx');
    const end = await spans.last().getAttribute('data-word-idx');
    return { 
      start: parseInt(start || '-1', 10), 
      end: parseInt(end || '-1', 10) 
    };
  };

  // Wait for layout to settle
  await page.waitForTimeout(1000);
  
  let currentRange = await getRange();
  console.log(`Initial range: ${currentRange.start}-${currentRange.end}`);
  expect(currentRange.start).toBe(4000);

  // FEATURE TEST: Verify we can navigate backwards IMMEDIATELY from a chapter 
  // start boundary when we don't have any navigation history
  let lastStartBeforeJump = currentRange.start;
  await page.locator('button[aria-label="Previous page"]').click();
  await expect(async () => {
    const newRange = await getRange();
    if (newRange.start < lastStartBeforeJump) return true;
    throw new Error(`Expected start to be strictly less than ${lastStartBeforeJump}, but got ${newRange.start}`);
  }).toPass({ timeout: 5000 });
  
  currentRange = await getRange();
  console.log(`Cross-chapter backward range: ${currentRange.start}-${currentRange.end}`);
  expect(currentRange.start).toBeLessThan(lastStartBeforeJump);

  // Jump back to Chapter 3 for the rest of the stability test
  await page.locator('button[title="Open Menu"]').click();
  await page.locator('button:has-text("Table of Contents")').click();
  await page.locator('button:has-text("Chapter 3")').click();
  await page.waitForTimeout(1000);
  currentRange = await getRange();

  // Page forward 5 times
  for (let i = 0; i < 5; i++) {
    const lastEnd = currentRange.end;
    
    // Click next and wait for changes
    await page.locator('button[aria-label="Next page"]').click();
    
    // We need to wait for the page to actually change and layout to settle
    await expect(async () => {
      const newRange = await getRange();
      if (newRange.start === lastEnd + 1) return true;
      throw new Error(`Expected start ${lastEnd + 1}, but got ${newRange.start}`);
    }).toPass({ timeout: 5000 });

    currentRange = await getRange();
    console.log(`Page ${i + 1} forward: ${currentRange.start}-${currentRange.end}`);
    
    // Verify continuity: Next page start index must be exactly previous page end index + 1
    expect(currentRange.start).toBe(lastEnd + 1);
  }

  // Page backward 5 times
  for (let i = 0; i < 5; i++) {
    const lastStart = currentRange.start;
    
    // Wait for previous button to be enabled (no force click)
    await page.locator('button[aria-label="Previous page"]').click();
    
    await expect(async () => {
      const newRange = await getRange();
      if (newRange.end === lastStart - 1) return true;
      throw new Error(`Expected end ${lastStart - 1}, but got ${newRange.end}`);
    }).toPass({ timeout: 5000 });

    currentRange = await getRange();
    console.log(`Page ${i + 1} backward: ${currentRange.start}-${currentRange.end}`);
    
    // Verify continuity: Previous page end index must be exactly current page start index - 1
    expect(currentRange.end).toBe(lastStart - 1);
  }

  // Final check: we should be back at Chapter 3 start (4000)
  expect(currentRange.start).toBe(4000);
});
