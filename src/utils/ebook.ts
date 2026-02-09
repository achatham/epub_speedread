import ePub from 'epubjs';
import { extractWordsFromDoc, type WordData } from './text-processing';
import { getGeminiApiKey, findRealEndOfBook } from './gemini';
import { type BookRecord, type FirestoreStorage } from './storage';

export interface ProcessedBook {
  title: string;
  words: WordData[];
  sections: { label: string; startIndex: number }[];
  wordIndex: number;
  wpm: number;
  realEndIndex: number | null;
  realEndQuote?: string;
}

export const findQuoteIndex = (quote: string, currentWords: WordData[]): number | null => {
  const quoteWords = quote.split(/\s+/).filter(w => w.length > 0).map(w => w.toLowerCase().replace(/[^\w]/g, ''));
  if (quoteWords.length > 0) {
    for (let i = currentWords.length - quoteWords.length; i >= 0; i--) {
      let match = true;
      for (let j = 0; j < quoteWords.length; j++) {
        const wordText = currentWords[i + j].text.toLowerCase().replace(/[^\w]/g, '');
        if (wordText !== quoteWords[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return i + quoteWords.length;
      }
    }
  }
  return null;
};

export async function processEbook(
  bookRecord: BookRecord,
  storageProvider: FirestoreStorage
): Promise<ProcessedBook> {
  let file = bookRecord.storage.localFile;
  if (!file) {
    const fullBook = await storageProvider.getBook(bookRecord.id);
    if (!fullBook?.storage.localFile) throw new Error("File missing");
    file = fullBook.storage.localFile;
  }

  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);
  await book.ready;
  const metadata = await book.loaded.metadata;
  const bookTitle = metadata.title || bookRecord.meta.title;

  await book.loaded.navigation;
  let allWords: WordData[] = [];
  const spine = book.spine as any;
  const hrefToStartIndex: Record<string, number> = {};

  for (let i = 0; i < (spine.length || 0); i++) {
    const item = spine.get(i);
    if (item) {
      const cleanHref = item.href.split('#')[0];
      if (!(cleanHref in hrefToStartIndex)) hrefToStartIndex[cleanHref] = allWords.length;
      const contents = await book.load(item.href);
      let doc: Document | null = null;
      if (typeof contents === 'string') {
        doc = new DOMParser().parseFromString(contents, 'application/xhtml+xml');
      } else if (contents instanceof Document) {
        doc = contents;
      }
      if (doc?.body) {
        const sectionWords = extractWordsFromDoc(doc);
        if (sectionWords.length > 0) allWords = [...allWords, ...sectionWords];
      }
    }
  }

  const loadedSections: { label: string; startIndex: number }[] = [];
  const toc = book.navigation.toc;

  // Helper to match TOC hrefs to our spine start indices
  const getStartIndexForHref = (href: string) => {
    if (!href) return undefined;
    const cleanHref = href.split('#')[0];
    if (hrefToStartIndex[cleanHref] !== undefined) return hrefToStartIndex[cleanHref];
    
    const filename = cleanHref.split('/').pop();
    if (filename) {
      const spineMatch = Object.keys(hrefToStartIndex).find(k => k.split('/').pop() === filename);
      if (spineMatch) return hrefToStartIndex[spineMatch];
    }
    return undefined;
  };

  const flattenToc = (items: any[]) => {
    items.forEach(item => {
      const startIndex = getStartIndexForHref(item.href);
      if (startIndex !== undefined) loadedSections.push({ label: item.label.trim(), startIndex });
      if (item.subitems?.length > 0) flattenToc(item.subitems);
    });
  };

  if (toc?.length > 0) {
    flattenToc(toc);
  }

  // Fallback to spine items
  if (loadedSections.length === 0) {
    for (let i = 0; i < (spine.length || 0); i++) {
      const item = spine.get(i);
      if (item) {
        const cleanHref = item.href.split('#')[0];
        const startIndex = hrefToStartIndex[cleanHref];
        if (startIndex !== undefined) {
          loadedSections.push({ label: `Section ${i + 1}`, startIndex });
        }
      }
    }
  }

  if (loadedSections.length === 0) loadedSections.push({ label: 'Start', startIndex: 0 });

  const result: ProcessedBook = {
    title: bookTitle,
    words: allWords,
    sections: loadedSections,
    wordIndex: bookRecord.progress.wordIndex || 0,
    wpm: bookRecord.settings.wpm || 300,
    realEndIndex: null
  };

  // Handle Total Words
  if (bookRecord.meta.totalWords === undefined) {
    await storageProvider.updateBookTotalWords(bookRecord.id, allWords.length);
  }

  // Handle Real End Index
  if (bookRecord.analysis.realEndIndex !== undefined) {
    result.realEndIndex = bookRecord.analysis.realEndIndex;
  } else if (bookRecord.analysis.realEndQuote) {
    const idx = findQuoteIndex(bookRecord.analysis.realEndQuote, allWords);
    if (idx !== null) {
      result.realEndIndex = idx;
      await storageProvider.updateBookRealEndIndex(bookRecord.id, idx);
    }
  } else {
    const apiKey = getGeminiApiKey();
    if (apiKey && loadedSections.length > 0) {
      const quote = await findRealEndOfBook(loadedSections.map(s => s.label), allWords.map(w => w.text).join(' '));
      if (quote) {
        result.realEndQuote = quote;
        await storageProvider.updateBookRealEndQuote(bookRecord.id, quote);
        const idx = findQuoteIndex(quote, allWords);
        if (idx !== null) {
          result.realEndIndex = idx;
          await storageProvider.updateBookRealEndIndex(bookRecord.id, idx);
        }
      }
    }
  }

  return result;
}
