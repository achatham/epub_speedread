import { describe, it, expect, vi } from 'vitest';
import { getAggregationPlan } from './stats';
import type { ReadingSession } from './storage';

// Mock crypto.randomUUID
if (!global.crypto) {
    (global as any).crypto = {};
}
global.crypto.randomUUID = () => 'mock-uuid-' + Math.random();

describe('stats aggregation', () => {
    const book1 = 'book-1';
    const book2 = 'book-2';

    // Use fixed dates for testing
    const today = new Date('2023-10-27T10:00:00Z').getTime();
    const todayLater = new Date('2023-10-27T14:00:00Z').getTime();
    const yesterday = new Date('2023-10-26T10:00:00Z').getTime();

    it('should aggregate multiple sessions on the same day for the same book', () => {
        const sessions: ReadingSession[] = [
            {
                id: 's1',
                bookId: book1,
                bookTitle: 'Book 1',
                startTime: today,
                endTime: today + 1000,
                startWordIndex: 0,
                endWordIndex: 100,
                wordsRead: 100,
                durationSeconds: 60
            },
            {
                id: 's2',
                bookId: book1,
                bookTitle: 'Book 1',
                startTime: todayLater,
                endTime: todayLater + 1000,
                startWordIndex: 100,
                endWordIndex: 250,
                wordsRead: 150,
                durationSeconds: 90
            }
        ];

        const plan = getAggregationPlan(sessions);
        expect(plan.deleteIds).toContain('s1');
        expect(plan.deleteIds).toContain('s2');
        expect(plan.createSessions).toHaveLength(1);

        const agg = plan.createSessions[0];
        expect(agg.bookId).toBe(book1);
        expect(agg.startTime).toBe(today);
        expect(agg.endTime).toBe(todayLater + 1000);
        expect(agg.startWordIndex).toBe(0);
        expect(agg.endWordIndex).toBe(250);
        expect(agg.wordsRead).toBe(250);
        expect(agg.durationSeconds).toBe(150);
    });

    it('should not aggregate sessions from different books', () => {
        const sessions: ReadingSession[] = [
            {
                id: 's1',
                bookId: book1,
                bookTitle: 'Book 1',
                startTime: today,
                endTime: today + 1000,
                startWordIndex: 0,
                endWordIndex: 100,
                wordsRead: 100,
                durationSeconds: 60
            },
            {
                id: 's2',
                bookId: book2,
                bookTitle: 'Book 2',
                startTime: today,
                endTime: today + 1000,
                startWordIndex: 0,
                endWordIndex: 100,
                wordsRead: 100,
                durationSeconds: 60
            }
        ];

        const plan = getAggregationPlan(sessions);
        expect(plan.deleteIds).toHaveLength(0);
        expect(plan.createSessions).toHaveLength(0);
    });

    it('should not aggregate sessions from different days', () => {
        const sessions: ReadingSession[] = [
            {
                id: 's1',
                bookId: book1,
                bookTitle: 'Book 1',
                startTime: today,
                endTime: today + 1000,
                startWordIndex: 100,
                endWordIndex: 200,
                wordsRead: 100,
                durationSeconds: 60
            },
            {
                id: 's2',
                bookId: book1,
                bookTitle: 'Book 1',
                startTime: yesterday,
                endTime: yesterday + 1000,
                startWordIndex: 0,
                endWordIndex: 100,
                wordsRead: 100,
                durationSeconds: 60
            }
        ];

        const plan = getAggregationPlan(sessions);
        expect(plan.deleteIds).toHaveLength(0);
        expect(plan.createSessions).toHaveLength(0);
    });

    it('should handle missing wordsRead by falling back to index difference', () => {
        const sessions: any[] = [
            {
                id: 's1',
                bookId: book1,
                bookTitle: 'Book 1',
                startTime: today,
                endTime: today + 1000,
                startWordIndex: 0,
                endWordIndex: 100,
                // wordsRead missing
                durationSeconds: 60
            },
            {
                id: 's2',
                bookId: book1,
                bookTitle: 'Book 1',
                startTime: todayLater,
                endTime: todayLater + 1000,
                startWordIndex: 100,
                endWordIndex: 250,
                wordsRead: 150,
                durationSeconds: 90
            }
        ];

        const plan = getAggregationPlan(sessions as ReadingSession[]);
        expect(plan.createSessions[0].wordsRead).toBe(100 + 150);
    });
});
