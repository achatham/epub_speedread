import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';
import type { WordData } from './text-processing';
import { getParagraphStyles } from './word-style';

/** Use pretext to compute the end index of words that fit in the reading area. */
export function computePageEndIndex(
  words: WordData[],
  startIndex: number,
  areaWidth: number,
  areaHeight: number,
  fontSize: number,
  fontFamilyStr: string,
  limitIndex?: number
): number {
  const effectiveLimit = limitIndex !== undefined ? Math.min(limitIndex, words.length) : words.length;

  if (areaWidth <= 0 || areaHeight <= 0 || startIndex >= effectiveLimit) {
    return Math.min(startIndex + 1, words.length);
  }

  // Take a generous chunk — pretext is fast once fonts are cached
  const chunkSize = Math.min(800, effectiveLimit - startIndex);
  const chunk = words.slice(startIndex, startIndex + chunkSize);

  const lineHeight = Math.round(fontSize * 1.5);
  const baseFontStr = `${fontSize}px ${fontFamilyStr}`;

  let accHeight = 0;
  let wordsIncluded = 0;
  // Bottom margin carried from the previous paragraph. Adjacent margins
  // collapse in the DOM, so the gap is the larger of the two, not their sum.
  let pendingGap = 0;

  // Group chunk into paragraphs to accurately simulate DOM rendering
  const paragraphs: WordData[][] = [];
  let currentPara: WordData[] = [];
  for (const w of chunk) {
    if (w.isParagraphStart && currentPara.length > 0) {
      paragraphs.push(currentPara);
      currentPara = [];
    }
    currentPara.push(w);
  }
  if (currentPara.length > 0) {
    paragraphs.push(currentPara);
  }

  // Layout paragraph by paragraph
  const paragraphStyles = getParagraphStyles(paragraphs);
  for (let p = 0; p < paragraphs.length; p++) {
    const paraWords = paragraphs[p];
    const style = paragraphStyles[p];
    const isPlain = style.fontScale === 1 && !style.isBold && !style.isItalic;
    const activeFontSize = fontSize * style.fontScale;
    const activeLineHeight = style.fontScale === 1 ? lineHeight : Math.round(activeFontSize * 1.5);
    const activeFontStr = isPlain
      ? baseFontStr
      : `${style.isItalic ? 'italic ' : ''}${style.isBold ? 'bold ' : ''}${activeFontSize}px ${fontFamilyStr}`;
    // Blockquotes and list items are drawn inset, so they wrap sooner
    const activeWidth = style.indentEm > 0
      ? Math.max(fontSize * 4, areaWidth - style.indentEm * fontSize)
      : areaWidth;

    accHeight += Math.max(pendingGap, style.marginTopEm * activeFontSize);

    // Glued tokens ("well-" + "known") are one word on the page but several
    // RSVP tokens, so remember how many tokens each measured chunk stands for.
    // The first-line indent isn't modelled here; the DOM pass in
    // PaginatedReaderView sets the page end that actually gets drawn.
    const chunkTokens: number[] = [];
    let text = '';
    for (const w of paraWords) {
      if (chunkTokens.length > 0 && w.glueLeft) {
        text += w.text;
        chunkTokens[chunkTokens.length - 1]++;
      } else {
        if (chunkTokens.length > 0) text += ' ';
        text += w.text;
        chunkTokens.push(1);
      }
    }

    const prepared = prepareWithSegments(text, activeFontStr);
    const { lines } = layoutWithLines(prepared, activeWidth, activeLineHeight);

    const paraHeight = lines.length * activeLineHeight;

    // Check if the text of this paragraph fits in the remaining visible area
    if (accHeight + paraHeight <= areaHeight) {
      // Entire paragraph fits
      wordsIncluded += paraWords.length;
      accHeight += paraHeight;
      // Matches the margin-bottom the renderer draws, in the paragraph's own em
      pendingGap = style.marginBottomEm * activeFontSize;
    } else {
      // Paragraph doesn't fully fit, figure out how many lines do fit
      const remainingHeight = areaHeight - accHeight;
      const linesThatFit = Math.floor(remainingHeight / activeLineHeight);

      let chunkCursor = 0;
      for (let l = 0; l < linesThatFit; l++) {
        const lineText = lines[l].text.trim();
        if (lineText.length === 0) continue;
        const chunksOnLine = lineText.split(/\s+/).length;
        for (let c = 0; c < chunksOnLine && chunkCursor < chunkTokens.length; c++) {
          wordsIncluded += chunkTokens[chunkCursor++];
        }
      }
      break; // Run out of space, stop processing paragraphs
    }
  }

  // Ensure we advance at least 1 word so we never get stuck
  const pageWords = Math.max(1, wordsIncluded);
  return Math.min(startIndex + pageWords, effectiveLimit);
}
