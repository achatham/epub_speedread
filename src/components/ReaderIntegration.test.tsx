import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processEpub } from '../utils/ebook';
import { PaginatedReaderView } from './PaginatedReaderView';
import { useReaderStore } from '../stores/useReaderStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { BookRecord } from '../utils/storage';

// Mock ResizeObserver and URL
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback([{
      contentRect: { width: 800, height: 600 },
      target
    }] as any, this);
  }
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as any;

if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = vi.fn(() => 'mock-url');
}
if (typeof window.URL.revokeObjectURL === 'undefined') {
  window.URL.revokeObjectURL = vi.fn();
}

const createMockFile = (filePath: string): File => {
  const buffer = fs.readFileSync(filePath);
  const file = new File([buffer], path.basename(filePath), { type: 'application/epub+zip' });
  if (!file.arrayBuffer) {
    file.arrayBuffer = async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
  return file;
};

describe('EPUB Integration Test - PaginatedReaderView', () => {
  beforeEach(() => {
    useReaderStore.getState().resetReader();
    useSettingsStore.setState({ 
      paginatedFontSize: 16,
      fontFamily: 'system',
      theme: 'light'
    });
  });

  it.skip('loads the anonymized Prize, jumps to Chapter 5 and renders effectively', async () => {
    const epubPath = path.resolve(__dirname, '../../example/anon_The_Prize.epub');
    if (!fs.existsSync(epubPath)) {
      console.warn(`File not found: ${epubPath}`);
      return;
    }
    const file = createMockFile(epubPath);

    const mockBookRecord: BookRecord = {
      id: 'integration-book-id',
      meta: {
        title: 'The Prize Anonymized',
        addedAt: Date.now(),
        extension: 'epub',
        totalWords: 0,
      },
      progress: { wordIndex: 0, lastReadAt: Date.now() },
      analysis: {},
      settings: { wpm: 300 },
      storage: { localFile: file }
    };

    const mockStorageProvider: any = {
      getBook: async () => mockBookRecord,
      updateBookTotalWords: async () => {},
      updateBookRealEndIndex: async () => {},
    };

    // Parse the EPUB (this hits epub.js and text-processing exactly like the real app)
    const processed = await processEpub(mockBookRecord, mockStorageProvider);

    expect(processed.words.length).toBeGreaterThan(0);
    // There should be plenty of chapters. We will jump to section 4 (Chapter 5)
    expect(processed.sections.length).toBeGreaterThan(4);

    const chapter5StartIndex = processed.sections[4].startIndex;
    console.log("EPUB PARSED: words=", processed.words.length, "sections=", processed.sections.length, "chapter5Start=", chapter5StartIndex);
    
    // Initializing store with the book's data and current index matching Chapter 5
    useReaderStore.setState({
      words: processed.words,
      sections: processed.sections,
      currentIndex: chapter5StartIndex,
      isPlaying: false,
    });

    const { container } = render(
      <PaginatedReaderView 
        navigate={vi.fn()}
        handleSetIsPlaying={vi.fn()}
        onCloseBook={vi.fn()}
        onReadChapter={vi.fn()}
      />
    );

    // Wait for everything to settle and verify that it rendered some text from the chapter
    console.log("HTML:", container.innerHTML.substring(0, 500));
    await waitFor(() => {
      const spans = container.querySelectorAll('span[data-word-idx]');
      if (spans.length === 0) console.log("NO SPANS rendered!");
      expect(spans.length).toBeGreaterThan(0);
      
      const firstSpanIndex = parseInt(spans[0].getAttribute('data-word-idx') || '-1', 10);
      
      // Depending on pretext rules, the first visible span should be close to or exactly chapter5StartIndex
      // We'll give it a small padding to account for paragraph start logic
      expect(firstSpanIndex).toBeLessThanOrEqual(chapter5StartIndex);
      expect(firstSpanIndex).toBeGreaterThan(chapter5StartIndex - 50);

      // Verify that words are actually rendered by reading their text content
      const firstSpanText = spans[0].textContent;
      expect(firstSpanText?.length).toBeGreaterThan(0);
      console.log(`Rendered first word at chapter 5 index ${firstSpanIndex}: ${firstSpanText}`);
    }, { timeout: 10000 });
  }, 20000); // give ample timeout for parsing
});
