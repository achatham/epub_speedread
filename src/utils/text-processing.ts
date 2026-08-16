import { splitWord } from './orp';
import { type RsvpSettings } from './storage';

export interface WordData {
  text: string;
  isParagraphStart: boolean;
  isSentenceStart: boolean;
  isHeading?: boolean;
  isDivider?: boolean;
  /** 1-6 for words inside an <h1>-<h6> */
  headingLevel?: number;
  isItalic?: boolean;
  isBold?: boolean;
  /** Nesting depth of the enclosing <blockquote> (1 = outermost) */
  quoteLevel?: number;
  /** Nesting depth of the enclosing list (1 = outermost) */
  listLevel?: number;
  /** Bullet or number shown before the first word of a list item */
  listMarker?: string;
}

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD',
  'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
  'TR', 'TD', 'TH' // Tables also break text
]);

const ITALIC_TAGS = new Set(['EM', 'I', 'CITE', 'DFN', 'VAR']);
const BOLD_TAGS = new Set(['STRONG', 'B']);
const ITALIC_STYLE_REGEX = /font-style\s*:\s*(italic|oblique)/i;
const BOLD_STYLE_REGEX = /font-weight\s*:\s*(bold|bolder|[6-9]00)/i;
// Only match class names that spell the style out — Calibre-style opaque
// names ("calibre4") would produce false positives.
const ITALIC_CLASS_REGEX = /(^|[\s_-])(italic|italics)([\s_-]|$)/i;
const BOLD_CLASS_REGEX = /(^|[\s_-])(bold|boldface)([\s_-]|$)/i;

function isItalicElement(element: Element, tagName: string): boolean {
  if (ITALIC_TAGS.has(tagName)) return true;
  const style = element.getAttribute('style');
  if (style && ITALIC_STYLE_REGEX.test(style)) return true;
  const cls = element.getAttribute('class');
  return !!cls && ITALIC_CLASS_REGEX.test(cls);
}

function isBoldElement(element: Element, tagName: string): boolean {
  if (BOLD_TAGS.has(tagName)) return true;
  const style = element.getAttribute('style');
  if (style && BOLD_STYLE_REGEX.test(style)) return true;
  const cls = element.getAttribute('class');
  return !!cls && BOLD_CLASS_REGEX.test(cls);
}

/** Bullet for <ul>, running number for <ol> (honouring the list's `start`). */
function getListMarker(li: Element): string {
  const parent = li.parentElement;
  if (!parent || parent.tagName.toUpperCase() !== 'OL') return '•';

  let index = parseInt(parent.getAttribute('start') || '1', 10);
  if (!Number.isFinite(index)) index = 1;
  let sibling = li.previousElementSibling;
  while (sibling) {
    if (sibling.tagName.toUpperCase() === 'LI') index++;
    sibling = sibling.previousElementSibling;
  }
  return `${index}.`;
}

const CLOSING_CHARS = '\'\\"\’”»›\\)\\]\\}';
const OPENING_CHARS = '\'\\"\‘“«‹\\(\\[\\{';
const PERIOD_REGEX = new RegExp(`[.!?][${CLOSING_CHARS}]*$`);
const COMMA_REGEX = new RegExp(`[,;:][${CLOSING_CHARS}]*$`);
const TRAILING_PAUSE_CHARS_REGEX = new RegExp(`["”’\'»›\\)\\]\\}]$`);

const ABBREVIATIONS = [
  'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sr', 'Jr', 'St', 'Rd', 'Ave', 'Blvd',
  'Capt', 'Col', 'Gen', 'Lt', 'Sgt', 'Rev', 'Hon', 'Gov', 'Mt', 'Inc', 'Ltd', 'Co'
];
const ABBREVIATION_REGEX = new RegExp(`^[${OPENING_CHARS}]*(${ABBREVIATIONS.join('|')})\\.[${CLOSING_CHARS}]*$`, 'i');

export function isAbbreviation(word: string): boolean {
  return ABBREVIATION_REGEX.test(word);
}

export function calculateRsvpMultiplier(
  word: string,
  settings: RsvpSettings
): number {
  if (word === '* * *') {
    return settings.periodMultiplier * 3; // Long pause for section dividers
  }

  let multiplier = 1;

  if (isAbbreviation(word)) {
    // Abbreviations don't get punctuation pauses
    multiplier = 1;
  } else if (PERIOD_REGEX.test(word) || word === '—' || word === '–') {
    multiplier = settings.periodMultiplier;
  } else if (COMMA_REGEX.test(word)) {
    multiplier = settings.commaMultiplier;
  } else if (TRAILING_PAUSE_CHARS_REGEX.test(word)) {
    multiplier = settings.commaMultiplier;
  }

  const { prefix, suffix } = splitWord(word);
  const currentLeftDensity = (prefix.length + 0.5) / 0.4;
  const currentRightDensity = (suffix.length + 0.5) / 0.6;
  const currentMaxDensity = Math.max(currentLeftDensity, currentRightDensity);

  // Benchmark "transportation" for stable sizing (matches ReaderView)
  const benchMaxDensity = 15.83;

  const isLongWord = word.length > 8 || (word.match(/\d/g) || []).length > 2;

  if (currentMaxDensity > benchMaxDensity * 1.15) {
    multiplier *= settings.tooWideMultiplier;
  } else if (isLongWord) {
    multiplier *= settings.longWordMultiplier;
  }

  return multiplier;
}

export function calculateRsvpInterval(
  word: string,
  wpm: number,
  settings: RsvpSettings
): number {
  const multiplier = calculateRsvpMultiplier(word, settings);
  return (60000 / wpm) * multiplier;
}

/** A run of text sharing the same inline formatting, as buffered during traversal. */
interface StyledSegment {
  text: string;
  isItalic: boolean;
  isBold: boolean;
}

export function extractWordsFromDoc(doc: Document): WordData[] {
  const words: WordData[] = [];

  // Text buffered since the last block boundary, split into runs so that
  // inline formatting (<em>, <strong>, ...) survives down to the word level.
  let segments: StyledSegment[] = [];
  // The state of whether the NEXT flushed word should be a paragraph start.
  // Initially true.
  let markNextAsParagraphStart = true;
  let markNextAsDivider = false;
  let headingLevel = 0;
  let quoteLevel = 0;
  let listLevel = 0;
  let italicDepth = 0;
  let boldDepth = 0;
  let pendingListMarker: string | null = null;

  // Replace em-dashes and en-dashes with padded versions to ensure they split into separate words
  // "word—word" -> "word — word"
  // Also split hyphenated words, keeping the hyphen on the preceding word
  // Standardize ellipses (...) and single-char ellipses (…) as distinct padded tokens
  function normalize(text: string): string {
    return text
      .replace(/—/g, ' — ')
      .replace(/–/g, ' – ')
      .replace(/(\w)-(\w)/g, '$1- $2')
      .replace(/…/g, ' ... ')
      .replace(/(?:\. ?){3,}/g, ' ... ');
  }

  function flush() {
    const pending = segments;
    segments = [];
    if (!pending.some(s => s.text.trim())) return;

    // Split into words. A word may straddle segments ("un<em>believable</em>",
    // or "<em>no</em>."), in which case the pieces are joined back together and
    // the formatting of the parts is merged.
    const flushed: StyledSegment[] = [];
    let wordIsOpen = false;

    for (const segment of pending) {
      const text = normalize(segment.text);
      if (!text) continue;

      const tokens = text.split(/\s+/).filter(t => t.length > 0);
      if (tokens.length === 0) {
        wordIsOpen = false; // pure whitespace ends any open word
        continue;
      }

      const continuesPrevious = wordIsOpen && flushed.length > 0 && !/^\s/.test(text);
      tokens.forEach((token, index) => {
        if (index === 0 && continuesPrevious) {
          const prev = flushed[flushed.length - 1];
          prev.text += token;
          prev.isItalic = prev.isItalic || segment.isItalic;
          prev.isBold = prev.isBold || segment.isBold;
        } else {
          flushed.push({ text: token, isItalic: segment.isItalic, isBold: segment.isBold });
        }
      });

      wordIsOpen = !/\s$/.test(text);
    }

    if (flushed.length === 0) return;

    if (markNextAsDivider) {
      words.push({
        text: '* * *',
        isParagraphStart: true,
        isSentenceStart: true,
        isDivider: true
      });
      markNextAsParagraphStart = true;
      markNextAsDivider = false;
    }

    flushed.forEach((w, index) => {
      words.push({
        text: w.text,
        isParagraphStart: markNextAsParagraphStart && index === 0,
        isSentenceStart: false, // Post-process
        isHeading: headingLevel > 0 ? true : undefined,
        headingLevel: headingLevel > 0 ? headingLevel : undefined,
        isItalic: w.isItalic ? true : undefined,
        isBold: w.isBold ? true : undefined,
        quoteLevel: quoteLevel > 0 ? quoteLevel : undefined,
        listLevel: listLevel > 0 ? listLevel : undefined,
        listMarker: index === 0 && pendingListMarker ? pendingListMarker : undefined
      });
    });

    markNextAsParagraphStart = false;
    pendingListMarker = null;
  }

  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text) segments.push({ text, isItalic: italicDepth > 0, isBold: boldDepth > 0 });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    const tagName = element.tagName.toUpperCase();
    const isBlock = BLOCK_TAGS.has(tagName);
    const isBr = tagName === 'BR';
    const isHeadingTag = /^H[1-6]$/.test(tagName);

    if (isBlock || isBr) {
      // Before entering a block or hitting BR, flush whatever inline text preceded it
      // E.g. "Some text <div>...</div>" -> flush "Some text"
      flush();
      // Since we are hitting a block boundary, the next thing IS a paragraph start
      markNextAsParagraphStart = true;
    }

    // Block context — restored after the closing flush below
    const prevHeadingLevel = headingLevel;
    if (isHeadingTag) headingLevel = parseInt(tagName[1], 10);
    if (tagName === 'BLOCKQUOTE') quoteLevel++;
    if (tagName === 'UL' || tagName === 'OL') listLevel++;
    if (tagName === 'LI') pendingListMarker = getListMarker(element);

    const isHr = tagName === 'HR';
    const className = typeof (element as any).className === 'string' ? (element as any).className : '';
    if (isHr || /(extract|space|blank|divider|break|separator|asterisk)/i.test(className)) {
      markNextAsDivider = true;
    }

    const italic = isItalicElement(element, tagName);
    const bold = isBoldElement(element, tagName);
    if (italic) italicDepth++;
    if (bold) boldDepth++;

    node.childNodes.forEach(child => traverse(child));

    if (italic) italicDepth--;
    if (bold) boldDepth--;

    if (isBlock) {
      // Closing a block also flushes content inside it
      flush();
      // And content AFTER a block is also a new paragraph usually
      markNextAsParagraphStart = true;
    }

    headingLevel = prevHeadingLevel;
    if (tagName === 'BLOCKQUOTE') quoteLevel--;
    if (tagName === 'UL' || tagName === 'OL') listLevel--;
    if (tagName === 'LI') pendingListMarker = null;
  }

  if (doc.body) {
    traverse(doc.body);
    flush(); // Final flush
  }

  // Post-process for Sentence Starts
  for (let i = 0; i < words.length; i++) {
    if (i === 0) {
      words[i].isSentenceStart = true;
      continue;
    }

    // Check previous word for punctuation
    const prevWord = words[i - 1].text;
    // Simple regex for sentence ending punctuation. 
    // Ends with . ! ? followed by optional quotes/parens
    // e.g. "end." "end!)"
    if (/[.!?]['")\]]*$/.test(prevWord) && !isAbbreviation(prevWord)) {
      words[i].isSentenceStart = true;
    } else if (words[i].isParagraphStart) {
      // Paragraph start is implicitly a sentence start
      words[i].isSentenceStart = true;
    }
  }

  return words;
}

export function extractWordsFromText(text: string): WordData[] {
  const paragraphs = text.split(/\n\s*\n/);
  const allWords: WordData[] = [];

  paragraphs.forEach((para) => {
    const processedPara = para
      .replace(/—/g, ' — ')
      .replace(/–/g, ' – ')
      .replace(/(\w)-(\w)/g, '$1- $2')
      .replace(/…/g, ' ... ')
      .replace(/(?:\. ?){3,}/g, ' ... ');

    const rawWords = processedPara
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(w => w.length > 0);

    rawWords.forEach((w, wordIndex) => {
      allWords.push({
        text: w,
        isParagraphStart: wordIndex === 0,
        isSentenceStart: false // Post-process
      });
    });
  });

  // Post-process for Sentence Starts
  for (let i = 0; i < allWords.length; i++) {
    if (i === 0 || allWords[i].isParagraphStart) {
      allWords[i].isSentenceStart = true;
      continue;
    }

    const prevWord = allWords[i - 1].text;
    if (/[.!?]['")\]]*$/.test(prevWord) && !isAbbreviation(prevWord)) {
      allWords[i].isSentenceStart = true;
    }
  }

  return allWords;
}

export interface TextChunk {
  text: string;
  startIndex: number;
  wordCount: number;
}

/**
 * Chunks words into blocks based on character limit, 
 * attempting to break only at sentence boundaries.
 */
export function chunkWordsByCharLimit(words: WordData[], maxChars: number = 1900): TextChunk[] {
  const chunks: TextChunk[] = [];
  let currentChunkWords: WordData[] = [];
  let currentChars = 0;
  let chunkStartIndex = 0;

  for (const word of words) {
    const wordWithSpace = (currentChunkWords.length > 0 ? " " : "") + word.text;

    if (currentChars + wordWithSpace.length > maxChars) {
      // Need to flush. Find the last sentence end.
      let splitPoint = -1;
      for (let j = currentChunkWords.length - 1; j >= 0; j--) {
        if (/[.!?]['")\]]*$/.test(currentChunkWords[j].text)) {
          splitPoint = j;
          break;
        }
      }

      if (splitPoint !== -1) {
        // We found a sentence end. Flush up to there.
        const flushWords = currentChunkWords.slice(0, splitPoint + 1);
        const remainingWords = currentChunkWords.slice(splitPoint + 1);

        chunks.push({
          text: flushWords.map(w => w.text).join(' '),
          startIndex: chunkStartIndex,
          wordCount: flushWords.length
        });

        currentChunkWords = [...remainingWords, word];
        chunkStartIndex += flushWords.length;
        currentChars = currentChunkWords.map((w, idx) => (idx > 0 ? " " : "") + w.text).join('').length;
      } else {
        // No sentence end in this whole block? Forced break.
        chunks.push({
          text: currentChunkWords.map(w => w.text).join(' '),
          startIndex: chunkStartIndex,
          wordCount: currentChunkWords.length
        });

        chunkStartIndex += currentChunkWords.length;
        currentChunkWords = [word];
        currentChars = word.text.length;
      }
    } else {
      currentChunkWords.push(word);
      currentChars += wordWithSpace.length;
    }
  }

  if (currentChunkWords.length > 0) {
    chunks.push({
      text: currentChunkWords.map(w => w.text).join(' '),
      startIndex: chunkStartIndex,
      wordCount: currentChunkWords.length
    });
  }

  return chunks;
}

export function chunkWordsByParagraph(words: WordData[], minWords: number = 300): TextChunk[] {
  const chunks: TextChunk[] = [];
  let currentChunkWords: string[] = [];
  let count = 0;
  let chunkStartIndex = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.isParagraphStart && count >= minWords) {
      if (currentChunkWords.length > 0) {
        chunks.push({
          text: currentChunkWords.join(' '),
          startIndex: chunkStartIndex,
          wordCount: count
        });
        currentChunkWords = [];
        count = 0;
        chunkStartIndex = i;
      }
    }
    currentChunkWords.push(word.text);
    count++;
  }

  if (currentChunkWords.length > 0) {
    chunks.push({
      text: currentChunkWords.join(' '),
      startIndex: chunkStartIndex,
      wordCount: count
    });
  }

  return chunks;
}

/**
 * Chunks raw text into blocks based on character limit, 
 * attempting to break only at sentence boundaries.
 */
export function chunkTextByCharLimit(text: string, maxChars: number = 1900): TextChunk[] {
  // Use regex to find sentence boundaries while keeping the delimiter
  const sentences = text.match(/[^.!?]+[.!?]['")\]]*\s*|[^.!?]+$/g) || [text];

  const chunks: TextChunk[] = [];
  let currentText = "";
  let currentWordCount = 0;
  let chunkStartIndex = 0;
  let totalWordIndex = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.trim().split(/\s+/).length;

    if (currentText.length + sentence.length > maxChars && currentText.length > 0) {
      chunks.push({
        text: currentText.trim(),
        startIndex: chunkStartIndex,
        wordCount: currentWordCount
      });
      currentText = sentence;
      chunkStartIndex = totalWordIndex;
      currentWordCount = sentenceWordCount;
    } else {
      currentText += sentence;
      currentWordCount += sentenceWordCount;
    }
    totalWordIndex += sentenceWordCount;
  }

  if (currentText.trim()) {
    chunks.push({
      text: currentText.trim(),
      startIndex: chunkStartIndex,
      wordCount: currentWordCount
    });
  }

  return chunks;
}

export function chunkTextByParagraph(text: string, minWords: number = 300): TextChunk[] {
  // Split by paragraph markers
  const paragraphs = text.split(/\n+/);
  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  let chunkStartIndex = 0;
  let totalWordIndex = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) {
      // Still need to account for the split result in some way? 
      // For simple text split, words are what matter.
      continue;
    }

    const wordsInPara = trimmedPara.split(/\s+/).filter(w => w.length > 0);

    if (currentWordCount >= minWords && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join('\n\n'),
        startIndex: chunkStartIndex,
        wordCount: currentWordCount
      });
      currentChunk = [];
      chunkStartIndex = totalWordIndex;
      currentWordCount = 0;
    }

    currentChunk.push(trimmedPara);
    currentWordCount += wordsInPara.length;
    totalWordIndex += wordsInPara.length;
  }

  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join('\n\n'),
      startIndex: chunkStartIndex,
      wordCount: currentWordCount
    });
  }

  return chunks;
}