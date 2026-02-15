import { describe, it, expect } from 'vitest';
import { calculateNavigationTarget, findSentenceStart } from './navigation';
import { findRewindTarget } from './playback';
import type { WordData } from './text-processing';

describe('navigation', () => {
    const mockWords: WordData[] = [
        { text: 'Start.', isParagraphStart: true, isSentenceStart: true }, // 0
        { text: 'Second', isParagraphStart: false, isSentenceStart: true }, // 1
        { text: 'word.', isParagraphStart: false, isSentenceStart: false }, // 2
        { text: 'Third', isParagraphStart: true, isSentenceStart: true }, // 3
        { text: 'sentence.', isParagraphStart: false, isSentenceStart: false }, // 4
        { text: 'Fourth.', isParagraphStart: false, isSentenceStart: true }, // 5
    ];
    
    const mockSections = [
        { label: 'Chapter 1', startIndex: 0 },
        { label: 'Chapter 2', startIndex: 3 }
    ];

    describe('calculateNavigationTarget', () => {
        it('should go to start of book', () => {
            expect(calculateNavigationTarget(4, mockWords, mockSections, 'book')).toBe(0);
        });

        it('should go to start of chapter', () => {
             expect(calculateNavigationTarget(4, mockWords, mockSections, 'chapter')).toBe(3);
             expect(calculateNavigationTarget(2, mockWords, mockSections, 'chapter')).toBe(0);
        });

        it('should go to prev paragraph', () => {
            expect(calculateNavigationTarget(4, mockWords, mockSections, 'prev-paragraph')).toBe(3);
            expect(calculateNavigationTarget(3, mockWords, mockSections, 'prev-paragraph')).toBe(0);
        });

        it('should go to next paragraph', () => {
            expect(calculateNavigationTarget(0, mockWords, mockSections, 'next-paragraph')).toBe(3);
        });
        
        it('should go to prev sentence', () => {
            expect(calculateNavigationTarget(2, mockWords, mockSections, 'prev-sentence')).toBe(1);
            expect(calculateNavigationTarget(1, mockWords, mockSections, 'prev-sentence')).toBe(0);
        });

        it('should go to next sentence', () => {
            expect(calculateNavigationTarget(0, mockWords, mockSections, 'next-sentence')).toBe(1);
        });
    });

    describe('findSentenceStart', () => {
        it('should return current index if it is start', () => {
            expect(findSentenceStart(1, mockWords)).toBe(1);
        });

        it('should return start of sentence if in middle', () => {
            expect(findSentenceStart(2, mockWords)).toBe(1);
            expect(findSentenceStart(4, mockWords)).toBe(3);
        });
    });

    describe('findRewindTarget', () => {
        const longWords: WordData[] = Array.from({ length: 50 }, (_, i) => ({
            text: `word${i}${i % 5 === 0 ? '.' : ''}`,
            isParagraphStart: i === 0 || i === 25,
            isSentenceStart: i === 0 || (i > 0 && (i-1) % 5 === 0)
        }));
        // Sentence starts: 0, 1, 6, 11, 16, 21, 26, 31, 36, 41, 46

        const sections = [
            { label: 'Ch1', startIndex: 0 },
            { label: 'Ch2', startIndex: 30 }
        ];

        it('should back up at least 10 words and find sentence start', () => {
            // Index 20. -10 = 10. Sentence start before 10 is 6.
            expect(findRewindTarget(20, longWords, sections)).toBe(6);
        });

        it('should not cross chapter boundary', () => {
            // Index 35. -10 = 25. Chapter start is 30.
            // Math.max(30, 25) = 30.
            expect(findRewindTarget(35, longWords, sections)).toBe(30);
        });

        it('should stay at chapter start if already there', () => {
            expect(findRewindTarget(30, longWords, sections)).toBe(30);
        });

        it('should handle small indices near start', () => {
            expect(findRewindTarget(5, longWords, sections)).toBe(0);
        });
    });
});
