import { describe, it, expect } from 'vitest';
import { calculateNavigationTarget, findSentenceStart } from './navigation';
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
});
