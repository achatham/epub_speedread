import { splitWord } from './orp';
import { type RsvpSettings } from './storage';

export interface WordData {
  text: string;
  isParagraphStart: boolean;
  isSentenceStart: boolean;
}

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
  'BLOCKQUOTE', 'LI', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
  'TR', 'TD', 'TH' // Tables also break text
]);

export function calculateRsvpInterval(
  word: string, 
  wpm: number, 
  settings: RsvpSettings
): number {
  let multiplier = 1;
  
  if (/[.!?]['")\]]*$/.test(word) || word === '—' || word === '–') {
    multiplier = settings.periodMultiplier;
  } else if (/[,;:]['")\]]*$/.test(word)) {
    multiplier = settings.commaMultiplier;
  }

  const { prefix, suffix } = splitWord(word);
  const currentLeftDensity = (prefix.length + 0.5) / 0.4;
  const currentRightDensity = (suffix.length + 0.5) / 0.6;
  const currentMaxDensity = Math.max(currentLeftDensity, currentRightDensity);

  // Benchmark "transportation" for stable sizing (matches ReaderView)
  const benchMaxDensity = 15.83; 

  if (currentMaxDensity > benchMaxDensity * 1.15) {
    multiplier *= settings.tooWideMultiplier;
  } else if (word.length > 8) {
    multiplier *= settings.longWordMultiplier;
  }

  return (60000 / wpm) * multiplier;
}

export function extractWordsFromDoc(doc: Document): WordData[] {
  const words: WordData[] = [];
  
  let currentTextBuffer = '';
  // The state of whether the NEXT flushed word should be a paragraph start.
  // Initially true.
  let markNextAsParagraphStart = true;

  function flush() {
    if (!currentTextBuffer.trim()) {
        currentTextBuffer = '';
        return;
    }
    
    // Replace em-dashes and en-dashes with padded versions to ensure they split into separate words
    // "word—word" -> "word — word"
    // Also split hyphenated words, keeping the hyphen on the preceding word
    // Standardize ellipses (...) and single-char ellipses (…) as distinct padded tokens
    const processedBuffer = currentTextBuffer
        .replace(/—/g, ' — ')
        .replace(/–/g, ' – ')
        .replace(/(\w)-(\w)/g, '$1- $2')
        .replace(/…/g, ' ... ')
        .replace(/(?:\. ?){3,}/g, ' ... ');

    const rawWords = processedBuffer
        .replace(/\s+/g, ' ')
        .split(' ')
        .filter(w => w.length > 0);
    
    rawWords.forEach((w, index) => {
        words.push({
            text: w,
            isParagraphStart: markNextAsParagraphStart && index === 0,
            isSentenceStart: false // Post-process
        });
    });

    if (rawWords.length > 0) {
        markNextAsParagraphStart = false; 
    }
    
    currentTextBuffer = '';
  }

  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      currentTextBuffer += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = (node as Element).tagName.toUpperCase();
      const isBlock = BLOCK_TAGS.has(tagName);
      const isBr = tagName === 'BR';

      if (isBlock || isBr) {
        // Before entering a block or hitting BR, flush whatever inline text preceded it
        // E.g. "Some text <div>...</div>" -> flush "Some text"
        flush();
        // Since we are hitting a block boundary, the next thing IS a paragraph start
        markNextAsParagraphStart = true; 
      }

      node.childNodes.forEach(child => traverse(child));
      
      if (isBlock) {
        // Closing a block also flushes content inside it
        flush();
        // And content AFTER a block is also a new paragraph usually
        markNextAsParagraphStart = true;
      }
    }
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
    if (/[.!?]['")\]]*$/.test(prevWord)) {
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
    if (/[.!?]['")\]]*$/.test(prevWord)) {
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

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
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