import { describe, it, expect } from 'vitest';
import { findQuoteIndex } from './ebook';
import type { WordData } from './text-processing';

const createWords = (text: string): WordData[] => {
  return text.split(/\s+/).map(t => ({
    text: t,
    isParagraphStart: false,
    isSentenceStart: false
  }));
};

describe('findQuoteIndex', () => {
  it('should find the exact quote at the end of the list', () => {
    const words = createWords("This is a test of the emergency broadcast system");
    const quote = "broadcast system";
    const index = findQuoteIndex(quote, words);
    expect(index).toBe(words.length);
  });

  it('should be case insensitive and ignore punctuation', () => {
    const words = createWords("This is a test of the emergency! broadcast... system.");
    const quote = "EMERGENCY broadcast system";
    const index = findQuoteIndex(quote, words);
    expect(index).toBe(words.length);
  });

  it('should find a quote in the middle of the text', () => {
    const words = createWords("The quick brown fox jumps over the lazy dog");
    const quote = "brown fox jumps";
    const index = findQuoteIndex(quote, words);
    // Index returned is index AFTER the matched words
    expect(index).toBe(5); // The (0) quick (1) brown (2) fox (3) jumps (4) -> returns 5
  });

  it('should return null if no match is found', () => {
    const words = createWords("Hello world");
    const quote = "Goodbye world";
    const index = findQuoteIndex(quote, words);
    expect(index).toBeNull();
  });

  it('should handle multi-line or whitespace-heavy quotes', () => {
    const words = createWords("First line. Second line. Third line.");
    const quote = "  Second    line.  ";
    const index = findQuoteIndex(quote, words);
    expect(index).toBe(4); // First (0) line (1) Second (2) line (3) -> 4
  });

  it('should handle numeric and special characters', () => {
    const words = createWords("The price is $19.99 today");
    const quote = "is 1999 today";
    const index = findQuoteIndex(quote, words);
    expect(index).toBe(5);
  });
});
