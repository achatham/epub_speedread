import type { WordData } from './text-processing';

/**
 * Shared description of how a paragraph of extracted words should look.
 * Both the renderer (PaginatedReaderView) and the page-fitting measurement
 * (utils/layout) read it so that what we measure matches what we draw.
 */
export interface ParagraphStyle {
  /** 0 when the paragraph is not a heading */
  headingLevel: number;
  isHeading: boolean;
  /** Font size relative to the reader's base size */
  fontScale: number;
  /** Whole paragraph is bold / italic */
  isBold: boolean;
  isItalic: boolean;
  quoteLevel: number;
  listLevel: number;
  listMarker?: string;
  /** Left indent, in multiples of the reader's base font size */
  indentEm: number;
  /** Extra space above the paragraph, in multiples of its own font size */
  marginTopEm: number;
  /** Space below the paragraph, in multiples of its own font size */
  marginBottomEm: number;
  /** First-line indent, in multiples of its own font size */
  textIndentEm: number;
}

/** <h1> down to <h6>, relative to the body text. */
export const HEADING_FONT_SCALE: Record<number, number> = {
  1: 1.7,
  2: 1.45,
  3: 1.25,
  4: 1.15,
  5: 1.05,
  6: 1,
};

/** Used for headings that carry no level (e.g. words from the test hooks). */
export const DEFAULT_HEADING_FONT_SCALE = 1.5;

/** Breathing room above a top-level heading, in multiples of its own font size. */
export const HEADING_MARGIN_TOP_EM = 0.5;

/**
 * Space below a paragraph when the book doesn't say. Novels typically set
 * paragraphs with a first-line indent and no gap; we only follow that when the
 * book's own stylesheet asks for it, so books without CSS keep reading as
 * separated blocks.
 */
export const DEFAULT_PARAGRAPH_GAP_EM = 1;

export const QUOTE_INDENT_EM = 1.5;
export const LIST_INDENT_EM = 1.5;
/** Hanging indent for the bullet/number of a list item. */
export const LIST_MARKER_WIDTH_EM = 1.2;

function getParagraphStyle(words: WordData[]): ParagraphStyle {
  const headingLevel = words.find(w => w.headingLevel)?.headingLevel ?? 0;
  const isHeading = headingLevel > 0 || words.some(w => w.isHeading);
  const fontScale = headingLevel > 0
    ? (HEADING_FONT_SCALE[headingLevel] ?? DEFAULT_HEADING_FONT_SCALE)
    : (isHeading ? DEFAULT_HEADING_FONT_SCALE : 1);

  let quoteLevel = 0;
  let listLevel = 0;
  for (const w of words) {
    if (w.quoteLevel && w.quoteLevel > quoteLevel) quoteLevel = w.quoteLevel;
    if (w.listLevel && w.listLevel > listLevel) listLevel = w.listLevel;
  }

  // Paragraph metrics the book's own stylesheet gave us, if any. Headings keep
  // our scale rather than the book's so their sizing stays predictable.
  const first = words[0];
  const cssIndent = isHeading ? undefined : first?.paraIndentEm;
  const cssSpaceBelow = isHeading ? undefined : first?.paraSpaceBelowEm;
  const cssSpaceAbove = isHeading ? undefined : first?.paraSpaceAboveEm;

  return {
    headingLevel,
    isHeading,
    fontScale,
    isBold: isHeading || (words.length > 0 && words.every(w => w.isBold)),
    isItalic: words.length > 0 && words.every(w => w.isItalic),
    quoteLevel,
    listLevel,
    listMarker: words[0]?.listMarker,
    indentEm: quoteLevel * QUOTE_INDENT_EM + listLevel * LIST_INDENT_EM,
    marginTopEm: headingLevel > 0 && headingLevel <= 2
      ? HEADING_MARGIN_TOP_EM
      : cssSpaceAbove ?? 0,
    marginBottomEm: cssSpaceBelow ?? DEFAULT_PARAGRAPH_GAP_EM,
    textIndentEm: listLevel > 0 ? 0 : cssIndent ?? 0,
  };
}

/**
 * Styles a run of consecutive paragraphs, making sure neighbours stay
 * distinguishable. A book separates paragraphs with a gap below, an indent on
 * the next one, or both — but Kobo-processed EPUBs zero every margin with
 * `div#book-inner * { margin: 0 !important }` on the assumption the device
 * supplies its own spacing, which would otherwise run a chapter together.
 */
export function getParagraphStyles(paragraphs: WordData[][]): ParagraphStyle[] {
  const styles = paragraphs.map(getParagraphStyle);

  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    const next = styles[i + 1];
    const nextStartsPlainly =
      next && !next.isHeading && next.textIndentEm === 0 && next.indentEm === style.indentEm;
    if (style.marginBottomEm === 0 && nextStartsPlainly) {
      style.marginBottomEm = DEFAULT_PARAGRAPH_GAP_EM;
    }
  }

  return styles;
}
