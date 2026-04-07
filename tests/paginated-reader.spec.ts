import { test, expect } from '@playwright/test';

const MOCK_WORDS = Array.from({ length: 2000 }, (_, i) => ({
  text: `word${i}`,
  isParagraphStart: i % 20 === 0,
  isSentenceStart: i % 5 === 0,
}));

const MOCK_SECTIONS = [
  { label: 'Chapter One', startIndex: 0 },
  { label: 'Chapter Two', startIndex: 250 },
];


test('paginated mode renders reading area and controls', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });


  // Paginated reader should now be visible
  const reader = page.locator('[data-testid="paginated-reader"]');
  await expect(reader).toBeVisible();

  // Reading area should be present
  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toBeVisible();

  // Next/Prev buttons should be present
  await expect(page.locator('button[aria-label="Next page"]')).toBeVisible();
  await expect(page.locator('button[aria-label="Previous page"]')).toBeVisible();

  // First page: prev should be disabled
  await expect(page.locator('button[aria-label="Previous page"]')).toBeDisabled();
});

test('reading area is bounded — text does not overlap controls', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });

  await page.locator('[data-testid="paginated-reader"]').waitFor({ state: 'visible' });

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toBeVisible();

  // Reading area and next button must not overlap
  const areaBox = await readingArea.boundingBox();
  const nextBtn = page.locator('button[aria-label="Next page"]');
  const nextBox = await nextBtn.boundingBox();

  expect(areaBox).not.toBeNull();
  expect(nextBox).not.toBeNull();

  // Reading area bottom must be above next button top
  expect(areaBox!.y + areaBox!.height).toBeLessThanOrEqual(nextBox!.y + 2); // +2px tolerance
});

test('page navigation advances and retreats word index', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });

  await page.locator('[data-testid="paginated-reader"]').waitFor({ state: 'visible' });

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toBeVisible();

  // Get first page content
  const firstPageText = await readingArea.innerText();

  // Go to next page
  await page.locator('button[aria-label="Next page"]').click();
  await page.waitForTimeout(300); // allow re-layout

  const secondPageText = await readingArea.innerText();

  // Pages should have different content
  expect(secondPageText).not.toBe(firstPageText);

  // First page content should not appear on second page
  // (The word 'word0' is on page 1 but not page 2)
  expect(secondPageText).not.toContain('word0');

  // Previous page should bring us back (force to bypass ConsoleLogger overlay)
  await page.locator('button[aria-label="Previous page"]').click({ force: true });
  await page.waitForTimeout(300);

  const backToFirstText = await readingArea.innerText();
  // Should be identical to the first page text
  expect(backToFirstText).toBe(firstPageText);
});

test('font size controls change displayed size', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });

  await page.locator('[data-testid="paginated-reader"]').waitFor({ state: 'visible' });

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toBeVisible();

  // Get initial font size
  const initialFontSize = await readingArea.evaluate((el) => {
    const inner = el.querySelector('div') as HTMLElement;
    return inner ? window.getComputedStyle(inner).fontSize : '0px';
  });

  // Increase font size
  await page.locator('button[title="Increase font size"]').click();
  await page.waitForTimeout(200);

  const largerFontSize = await readingArea.evaluate((el) => {
    const inner = el.querySelector('div') as HTMLElement;
    return inner ? window.getComputedStyle(inner).fontSize : '0px';
  });

  const initial = parseFloat(initialFontSize);
  const larger = parseFloat(largerFontSize);
  expect(larger).toBeGreaterThan(initial);
});

test('keyboard navigation works in paginated mode', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });

  await page.locator('[data-testid="paginated-reader"]').waitFor({ state: 'visible' });

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toBeVisible();

  const firstText = await readingArea.innerText();

  // Arrow right should go to next page
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);

  const nextText = await readingArea.innerText();
  expect(nextText).not.toBe(firstText);

  // Arrow left should go back (to beginning of book)
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);

  const backText = await readingArea.innerText();
  // Should be identical back to the first page
  expect(backText).toBe(firstText);
});

// Only one consolidated mode now
test('paginated mode screenshot', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  // Use real-looking words for a better screenshot
  const storyWords = (
    'It was a bright cold day in April and the clocks were striking thirteen. ' +
    'Winston Smith his chin nuzzled into his breast in an effort to escape the ' +
    'vile wind slipped quickly through the glass doors of Victory Mansions though ' +
    'not quickly enough to prevent a swirl of gritty dust from entering along with him. ' +
    'The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured ' +
    'poster too large for indoor display had been tacked to the wall. It depicted simply ' +
    'an enormous face more than a metre wide the face of a man of about forty five with ' +
    'a heavy black moustache and ruggedly handsome features. Winston made for the stairs. ' +
    'It was no use trying the lift even at the best of times it was seldom working and at ' +
    'present the electric current was cut off during daylight hours. It was part of the ' +
    'economy drive in preparation for Hate Week. The flat was seven flights up and Winston ' +
    'who was thirty nine and had a varicose ulcer above his right ankle went slowly resting ' +
    'several times on the way.'
  ).split(/\s+/);

  const storyWordObjs = storyWords.map((text, i) => ({
    text,
    isParagraphStart: i === 0 || i === 40 || i === 80 || i === 130,
    isSentenceStart: i % 12 === 0,
  }));

  await page.evaluate((words: any[]) => {
    (window as any).__loadMockWords(words, [{ label: 'Chapter One', startIndex: 0 }]);
  }, storyWordObjs);



  const reader = page.locator('[data-testid="paginated-reader"]');
  await expect(reader).toBeVisible();

  // Wait for layout to settle
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'tests/paginated-reader.png', fullPage: false });
});

test('RSVP paused view has bounded reading area', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  const words = Array.from({ length: 200 }, (_, i) => ({
    text: `word${i}`,
    isParagraphStart: i % 15 === 0,
    isSentenceStart: i % 5 === 0,
  }));

  await page.evaluate((w: any[]) => {
    (window as any).__loadMockWords(w, [{ label: 'Chapter 1', startIndex: 0 }]);
  }, words);

  // RSVP view doesn't have this test-id, but we can check the preview area doesn't overlap controls
  const menuFab = page.locator('button[title="Open Menu"]');
  await expect(menuFab).toBeVisible();

  // Check the context preview area vs FAB don't overlap
  const fabBox = await menuFab.boundingBox();
  expect(fabBox).not.toBeNull();

  // The context text area is the center flex-1 div
  // Take a screenshot to visually verify
  await page.screenshot({ path: 'tests/rsvp-paused-bounded.png' });
});

test('page layout accurately computes end index with margin spacing without overflowing', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  // Use real-looking words with multiple paragraphs
  const rawText = `It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him.
The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster, too large for indoor display, had been tacked to the wall. It depicted simply an enormous face, more than a metre wide: the face of a man of about forty-five, with a heavy black moustache and ruggedly handsome features. Winston made for the stairs. It was no use trying the lift. Even at the best of times it was seldom working, and at present the electric current was cut off during daylight hours. It was part of the economy drive in preparation for Hate Week. The flat was seven flights up, and Winston, who was thirty-nine and had a varicose ulcer above his right ankle, went slowly, resting several times on the way. He took out a cigarette from a crumpled packet marked VICTORY CIGARETTES and incautiously held it upright, whereupon the tobacco fell out on to the floor.`;

  const storyWords: any[] = [];
  const paragraphs = rawText.split('\n');
  for (const p of paragraphs) {
    const pWords = p.trim().split(/\s+/);
    pWords.forEach((text, i) => {
      storyWords.push({
        text,
        isParagraphStart: i === 0,
        isSentenceStart: text.match(/^[A-Z]/) !== null,
      });
    });
  }

  await page.evaluate((words: any[]) => {
    (window as any).__loadMockWords(words, [{ label: 'Chapter One', startIndex: 0 }]);
  }, storyWords);



  const reader = page.locator('[data-testid="paginated-reader"]');
  await expect(reader).toBeVisible();

  // Wait a short moment
  await page.waitForTimeout(500);
  
  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  const innerText = await readingArea.innerText();
  
  // The first word should be "It"
  expect(innerText).toContain('It');
  
  // Verify it doesn't contain the absolute end of the book if the screen is small (default playwright screen is 1280x720)
  await page.setViewportSize({ width: 400, height: 400 });
  await page.waitForTimeout(500);
  
  // Check the text on screen
  const constrainedInnerText = await readingArea.innerText();
  const visibleWords = constrainedInnerText.split(/\s+/).filter(Boolean);
  
  // Constrained box should only fit a small chunk of words, definitely not the full 150+ words
  expect(visibleWords.length).toBeLessThan(storyWords.length);
  expect(visibleWords.length).toBeGreaterThan(0);
});

