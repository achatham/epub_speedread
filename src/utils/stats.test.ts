import { describe, it, expect } from 'vitest';
import { getIncrementalAggregationPlan } from './stats';
import type { ReadingSession } from './storage';

// Mock crypto.randomUUID
if (!global.crypto) {
    (global as any).crypto = {};
}
(global.crypto as any).randomUUID = () => '00000000-0000-0000-0000-000000000000';

describe('incremental stats aggregation', () => {
    const book1 = 'book-1';
    const today = new Date('2023-10-27T10:00:00Z').getTime();
    const todayLater = new Date('2023-10-27T14:00:00Z').getTime();

    it('should create new aggregated session when none exists', () => {
        const newSessions: ReadingSession[] = [{
            id: 's1',
            bookId: book1,
            bookTitle: 'Book 1',
            startTime: today,
            endTime: today + 1000,
            startWordIndex: 0,
            endWordIndex: 100,
            wordsRead: 100,
            durationSeconds: 60,
            type: 'reading'
        }];

        const plan = getIncrementalAggregationPlan([], newSessions);
        expect(plan.deleteIds).toHaveLength(0);
        expect(plan.createSessions).toHaveLength(1);
        expect(plan.createSessions[0].wordsRead).toBe(100);
    });

    it('should merge new session into existing aggregated session', () => {
        const existing: ReadingSession = {
            id: 'agg-1',
            bookId: book1,
            bookTitle: 'Book 1',
            startTime: today,
            endTime: today + 1000,
            startWordIndex: 0,
            endWordIndex: 100,
            wordsRead: 100,
            durationSeconds: 60,
            type: 'reading'
        };

        const newSessions: ReadingSession[] = [{
            id: 's2',
            bookId: book1,
            bookTitle: 'Book 1',
            startTime: todayLater,
            endTime: todayLater + 1000,
            startWordIndex: 100,
            endWordIndex: 250,
            wordsRead: 150,
            durationSeconds: 90,
            type: 'reading'
        }];

        const plan = getIncrementalAggregationPlan([existing], newSessions);

        // Since we reuse the ID, deleteIds should be empty
        expect(plan.deleteIds).toHaveLength(0);
        expect(plan.createSessions).toHaveLength(1);

        const agg = plan.createSessions[0];
        expect(agg.id).toBe('agg-1');
        expect(agg.wordsRead).toBe(250);
        expect(agg.durationSeconds).toBe(150);
        expect(agg.endTime).toBe(todayLater + 1000);
    });

    it('should handle multiple books and days', () => {
        const book2 = 'book-2';
        const tomorrow = today + 24 * 60 * 60 * 1000;

        const existing: ReadingSession[] = [{
            id: 'agg-b1-today',
            bookId: book1,
            bookTitle: 'Book 1',
            startTime: today,
            endTime: today + 1000,
            startWordIndex: 0,
            endWordIndex: 100,
            wordsRead: 100,
            durationSeconds: 60,
            type: 'reading'
        }];

        const newSessions: ReadingSession[] = [
            {
                id: 's-b1-today-extra',
                bookId: book1,
                bookTitle: 'Book 1',
                startTime: todayLater,
                endTime: todayLater + 1000,
                startWordIndex: 100,
                endWordIndex: 150,
                wordsRead: 50,
                durationSeconds: 30,
                type: 'reading'
            },
            {
                id: 's-b2-tomorrow',
                bookId: book2,
                bookTitle: 'Book 2',
                startTime: tomorrow,
                endTime: tomorrow + 1000,
                startWordIndex: 0,
                endWordIndex: 100,
                wordsRead: 100,
                durationSeconds: 60,
                type: 'reading'
            }
        ];

        const plan = getIncrementalAggregationPlan(existing, newSessions);

        expect(plan.createSessions).toHaveLength(2);

        const aggB1 = plan.createSessions.find(s => s.bookId === book1)!;
        expect(aggB1.id).toBe('agg-b1-today');
        expect(aggB1.wordsRead).toBe(150);

        const aggB2 = plan.createSessions.find(s => s.bookId === book2)!;
        expect(aggB2.bookId).toBe(book2);
        expect(aggB2.wordsRead).toBe(100);
    });

    it('should use maximum endWordIndex even if later session has lower index', () => {
        const existing: ReadingSession = {
            id: 'agg-1',
            bookId: book1,
            bookTitle: 'Book 1',
            startTime: today,
            endTime: today + 1000,
            startWordIndex: 0,
            endWordIndex: 2000,
            wordsRead: 2000,
            durationSeconds: 600,
            type: 'reading'
        };

        const newSessions: ReadingSession[] = [{
            id: 's-later-but-behind',
            bookId: book1,
            bookTitle: 'Book 1',
            startTime: todayLater,
            endTime: todayLater + 1000,
            startWordIndex: 1000,
            endWordIndex: 1500,
            wordsRead: 500,
            durationSeconds: 300,
            type: 'reading'
        }];

        const plan = getIncrementalAggregationPlan([existing], newSessions);
        expect(plan.createSessions[0].endWordIndex).toBe(2000);
        expect(plan.createSessions[0].wordsRead).toBe(2500);
    });
});
