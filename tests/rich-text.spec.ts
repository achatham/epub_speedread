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

/**
 * Page 208 of Children of Strife: one speaker's dialogue is set in a second
 * font family and broken across several short paragraphs, so losing either the
 * family or the book's paragraph style makes it read as narration.
 */
const DIALOGUE_WORDS = [
  ...paragraph('Presumably Kern is transmitting back, even as Cato carves a path with his twin machetes. The', {
    paraIndentEm: 0, paraSpaceBelowEm: 0,
  }),
  word('robot'),
  word('—', { glueLeft: true }),
  word('the', { glueLeft: true }),
  ...'one moving under its own power'.split(' ').map(t => word(t)),
  word('—', { glueLeft: true }),
  word('keeps', { glueLeft: true }),
  ...'stopping and starting.'.split(' ').map(t => word(t)),
  ...paragraph('“Progress!', { face: 'sans', paraIndentEm: 1.67, paraSpaceBelowEm: 0 }),
  ...paragraph('Motion!', { face: 'sans', paraIndentEm: 1.67, paraSpaceBelowEm: 0 }),
  ...paragraph('Or be left', { face: 'sans', paraIndentEm: 1.67, paraSpaceBelowEm: 0 }),
  ...paragraph('And I’ll make excuses to your mother,” Cato sends through forceful body-', {
    face: 'sans', paraIndentEm: 1.67, paraSpaceBelowEm: 0,
  }),
  word('language', { glueLeft: true, face: 'sans' }),
  word('and'), word('angry'), word('coloration.'),
  ...paragraph('I don’t understand. I’m not getting any kind of link at all,', {
    isItalic: true, paraIndentEm: 1.67, paraSpaceBelowEm: 0,
  }),
  ...'Kern complains.'.split(' ').map(t => word(t)),
];

test('paginated mode keeps the book\'s own dialogue formatting', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);
  }, { words: DIALOGUE_WORDS, sections: [{ label: 'Chapter 7.4', startIndex: 0 }] });

  const area = '[data-testid="paginated-reading-area"]';
  await expect(page.locator(area)).toHaveAttribute('data-is-measuring', 'false');

  const familyOf = (text: string) =>
    page.locator(`${area} span[data-word-idx]`).filter({ hasText: text }).first()
      .evaluate((el) => getComputedStyle(el).fontFamily);

  // The speech runs in a different family from the narration around it
  const spoken = await familyOf('Progress!');
  const narration = await familyOf('Presumably');
  expect(spoken).not.toBe(narration);

  // Words RSVP split apart are one word again on the page
  const narrationPara = page.locator('p:has-text("Presumably Kern")').first();
  expect(await narrationPara.textContent()).toContain('robot—the one moving');
  const hyphenated = page.locator('p:has-text("And I’ll make excuses")').first();
  expect(await hyphenated.textContent()).toContain('body-language');

  // The book sets paragraphs with a first-line indent and no gap between them
  const speech = page.locator('p:has-text("Motion!")').first();
  const indent = await speech.evaluate((el) => getComputedStyle(el).textIndent);
  expect(parseFloat(indent)).toBeGreaterThan(0);
  expect(await speech.evaluate((el) => getComputedStyle(el).marginBottom)).toBe('0px');

  await expect(page).toHaveScreenshot(['screenshots', 'dialogue-formatting.png']);
});
