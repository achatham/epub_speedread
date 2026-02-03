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
    const processedBuffer = currentTextBuffer
        .replace(/—/g, ' — ')
        .replace(/–/g, ' – ');

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

export function chunkWordsByParagraph(words: WordData[], minWords: number = 300): string[] {
  const chunks: string[] = [];
  let currentChunkWords: string[] = [];
  let count = 0;

  for (const word of words) {
    if (word.isParagraphStart && count >= minWords) {
      if (currentChunkWords.length > 0) {
        chunks.push(currentChunkWords.join(' '));
        currentChunkWords = [];
        count = 0;
      }
    }
    currentChunkWords.push(word.text);
    count++;
  }

  if (currentChunkWords.length > 0) {
    chunks.push(currentChunkWords.join(' '));
  }

  return chunks;
}

export function chunkTextByParagraph(text: string, minWords: number = 300): string[] {
  // Split by paragraph markers (common in markdown or plain text)
  const paragraphs = text.split(/\n+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    const wordsInPara = trimmedPara.split(/\s+/).filter(w => w.length > 0);

    if (currentWordCount >= minWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
      currentChunk = [];
      currentWordCount = 0;
    }

    currentChunk.push(trimmedPara);
    currentWordCount += wordsInPara.length;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }

  return chunks;
}