import { test, expect } from '@playwright/test';

/**
 * Paginated (non-RSVP) mode should honour the formatting we pull out of the
 * EPUB: heading levels, italics, bold, block quotes and lists.
 */

const word = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  isParagraphStart: false,
  isSentenceStart: false,
  ...extra,
});

const paragraph = (text: string, extra: Record<string, unknown> = {}) =>
  text.split(' ').map((t, i) =>
    word(t, i === 0 ? { isParagraphStart: true, isSentenceStart: true, ...extra } : extra)
  );

const MOCK_WORDS = [
  ...paragraph('Chapter One', { isHeading: true, headingLevel: 1 }),
  ...paragraph('A quieter subheading', { isHeading: true, headingLevel: 3 }),
  ...paragraph('Ordinary body text runs at the base size, but a phrase may be'),
  word('emphasised', { isItalic: true }),
  word('or'),
  word('insistent', { isBold: true }),
  ...'without leaving the paragraph.'.split(' ').map(t => word(t)),
  ...paragraph('Quoted material sits inside its own rule:', {}),
  ...paragraph('The first line of the quotation, which is long enough to wrap onto a second line so the indent is visible.', { quoteLevel: 1 }),
  ...paragraph('A second quoted paragraph shares the same rule.', { quoteLevel: 1 }),
  ...paragraph('And the narration resumes here.'),
  ...paragraph('First bullet in a list', { listLevel: 1, listMarker: '•' }),
  ...paragraph('Second bullet, long enough that it wraps and the hanging indent shows.', { listLevel: 1, listMarker: '•' }),
  ...paragraph('Numbered item', { listLevel: 1, listMarker: '2.' }),
];

const MOCK_SECTIONS = [{ label: 'Chapter One', startIndex: 0 }];

test('paginated mode renders headings, emphasis, quotes and lists', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });

  const readingArea = page.locator('[data-testid="paginated-reading-area"]');
  await expect(readingArea).toBeVisible();
  await expect(readingArea).toHaveAttribute('data-is-measuring', 'false');

  // Headings scale by level
  const h1 = page.locator('p:has-text("Chapter One")').first();
  const h3 = page.locator('p:has-text("A quieter subheading")').first();
  const body = page.locator('p:has-text("Ordinary body text")').first();

  const sizeOf = async (locator: typeof h1) =>
    parseFloat(await locator.evaluate((el) => getComputedStyle(el).fontSize));

  const h1Size = await sizeOf(h1);
  const h3Size = await sizeOf(h3);
  const bodySize = await sizeOf(body);
  expect(h1Size).toBeGreaterThan(h3Size);
  expect(h3Size).toBeGreaterThan(bodySize);
  expect(await h1.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700');

  // Inline emphasis — only the emphasised word, not its whole paragraph
  const area = '[data-testid="paginated-reading-area"]';
  const italicWords = page.locator(`${area} span[data-word-idx]`).filter({ hasText: 'emphasised' });
  await expect(italicWords).toHaveCount(1);
  expect(await italicWords.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');

  const boldWords = page.locator(`${area} span[data-word-idx]`).filter({ hasText: 'insistent' });
  await expect(boldWords).toHaveCount(1);
  expect(await boldWords.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700');

  // Neighbouring words keep the plain style
  const plainWord = page.locator(`${area} span[data-word-idx]`).filter({ hasText: 'without' });
  expect(await plainWord.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('normal');

  // Quotes are inset relative to the narration around them
  const quoted = page.locator('p:has-text("The first line of the quotation")').first();
  const narration = page.locator('p:has-text("And the narration resumes here")').first();
  const quotedBox = await quoted.boundingBox();
  const narrationBox = await narration.boundingBox();
  expect(quotedBox!.x).toBeGreaterThan(narrationBox!.x);

  // List markers are rendered outside the word spans
  const bullet = page.locator('p:has-text("First bullet in a list")').first();
  expect(await bullet.textContent()).toContain('•');

  await expect(page).toHaveScreenshot(['screenshots', 'rich-text-rendering.png']);
});
