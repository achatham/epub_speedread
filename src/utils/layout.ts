import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';
import type { WordData } from './text-processing';
import { getParagraphStyle } from './word-style';

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
  const paragraphGap = fontSize; // matches mb-[1em]
  const baseFontStr = `${fontSize}px ${fontFamilyStr}`;

  let accHeight = 0;
  let wordsIncluded = 0;

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
  for (const paraWords of paragraphs) {
    const style = getParagraphStyle(paraWords);
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

    accHeight += style.marginTopEm * activeFontSize;

    const text = paraWords.map((w) => w.text).join(' ');

    const prepared = prepareWithSegments(text, activeFontStr);
    const { lines } = layoutWithLines(prepared, activeWidth, activeLineHeight);

    const paraHeight = lines.length * activeLineHeight;

    // Check if the text of this paragraph fits in the remaining visible area
    if (accHeight + paraHeight <= areaHeight) {
      // Entire paragraph fits
      wordsIncluded += paraWords.length;
      // The rendered margin-bottom is 1em of the paragraph's own font size
      accHeight += paraHeight + paragraphGap * style.fontScale;
    } else {
      // Paragraph doesn't fully fit, figure out how many lines do fit
      const remainingHeight = areaHeight - accHeight;
      const linesThatFit = Math.floor(remainingHeight / activeLineHeight);

      for (let l = 0; l < linesThatFit; l++) {
        const lineText = lines[l].text.trim();
        if (lineText.length > 0) {
          wordsIncluded += lineText.split(/\s+/).length;
        }
      }
      break; // Run out of space, stop processing paragraphs
    }
  }

  // Ensure we advance at least 1 word so we never get stuck
  const pageWords = Math.max(1, wordsIncluded);
  return Math.min(startIndex + pageWords, effectiveLimit);
}
