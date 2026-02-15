import { describe, it, expect } from 'vitest';
import { findRewindTarget, getResumeIndex } from './playback';
import { WordData } from './text-processing';

describe('playback utility', () => {
  const mockWords: WordData[] = [
    { text: 'Sentence', isSentenceStart: true, isParagraphStart: true }, // 0
    { text: 'one.', isSentenceStart: false, isParagraphStart: false },    // 1
    { text: 'Sentence', isSentenceStart: true, isParagraphStart: false }, // 2
    { text: 'two.', isSentenceStart: false, isParagraphStart: false },   // 3
    { text: 'Word', isSentenceStart: false, isParagraphStart: false },    // 4
    { text: 'five', isSentenceStart: false, isParagraphStart: false },    // 5
    { text: 'six', isSentenceStart: false, isParagraphStart: false },     // 6
    { text: 'seven', isSentenceStart: false, isParagraphStart: false },   // 7
    { text: 'eight', isSentenceStart: false, isParagraphStart: false },   // 8
    { text: 'nine', isSentenceStart: false, isParagraphStart: false },    // 9
    { text: 'ten', isSentenceStart: false, isParagraphStart: false },     // 10
    { text: 'eleven', isSentenceStart: false, isParagraphStart: false },  // 11
    { text: 'twelve', isSentenceStart: false, isParagraphStart: false },  // 12
    { text: 'Sentence', isSentenceStart: true, isParagraphStart: false }, // 13
    { text: 'three.', isSentenceStart: false, isParagraphStart: false },  // 14
  ];

  const mockSections = [
    { label: 'Chapter 1', startIndex: 0 },
    { label: 'Chapter 2', startIndex: 13 }
  ];

  describe('findRewindTarget', () => {
    it('should rewind 10 words and find sentence start', () => {
      // From index 12, back 10 is 2. Sentence start at 2 is 2.
      expect(findRewindTarget(12, mockWords, mockSections)).toBe(2);
    });

    it('should not rewind before chapter start', () => {
      // From index 5, back 10 is -5, capped at 0.
      expect(findRewindTarget(5, mockWords, mockSections)).toBe(0);
    });

    it('should stay within current chapter', () => {
      // Index 14 is Chapter 2. Back 10 is 4. Chapter 2 start is 13.
      expect(findRewindTarget(14, mockWords, mockSections)).toBe(13);
    });

    it('should find the most recent sentence start after backing up', () => {
        // Index 12. Back 10 is 2. Sentence starts are at 0, 2.
        // If we were at 13. Back 10 is 3. Sentence starts are 0, 2. It should return 2.
        expect(findRewindTarget(13, mockWords, mockSections)).toBe(13); // Wait, 13 IS a chapter start AND a sentence start.

        // Let's try index 11. Back 10 is 1. Sentence starts at 0, 2. It should return 0?
        // No, loop from 1 down to 0. Finds 0.
        expect(findRewindTarget(11, mockWords, mockSections)).toBe(0);

        // Index 12. Back 10 is 2. Loop from 2 down to 0. Finds 2.
        expect(findRewindTarget(12, mockWords, mockSections)).toBe(2);
    });
  });

  describe('getResumeIndex', () => {
    it('should rewind if not a chapter break', () => {
      expect(getResumeIndex(12, mockWords, mockSections, false)).toBe(2);
    });

    it('should not rewind if it is a chapter break', () => {
      expect(getResumeIndex(13, mockWords, mockSections, true)).toBe(13);
    });
  });
});
