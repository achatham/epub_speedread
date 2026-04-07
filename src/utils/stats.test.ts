import { describe, it, expect } from 'vitest';
import { getIncrementalAggregationPlan, getHistoryRangeData, getBookProgressTrendData, calculateFinishedBooks } from './stats';
import type { ReadingSession, BookRecord } from './storage';

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

describe('getHistoryRangeData', () => {
    it('should return 7 days for week range, even with no data', () => {
        const data = getHistoryRangeData('week', []);
        expect(data).toHaveLength(7);
        expect(data.every(d => d.rsvp === 0 && d.paginated === 0 && d.listen === 0)).toBe(true);
    });

    it('should aggregate sessions into correct day buckets', () => {
        const now = Date.now();
        const sessions: ReadingSession[] = [{
            id: 's1',
            bookId: 'b1',
            bookTitle: 'B1',
            startTime: now,
            endTime: now + 60000,
            startWordIndex: 0,
            endWordIndex: 100,
            wordsRead: 100,
            durationSeconds: 60,
            type: 'reading'
        }, {
            id: 's2',
            bookId: 'b1',
            bookTitle: 'B1',
            startTime: now,
            endTime: now + 60000,
            startWordIndex: 100,
            endWordIndex: 200,
            wordsRead: 100,
            durationSeconds: 60,
            type: 'paginated'
        }];
        const data = getHistoryRangeData('week', sessions);
        expect(data).toHaveLength(7);
        const todayKey = new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const todayData = data.find(d => d.key === todayKey);
        expect(todayData?.rsvp).toBe(1);
        expect(todayData?.paginated).toBe(1);
    });

    it('should return 12 months for year range', () => {
        const data = getHistoryRangeData('year', []);
        expect(data).toHaveLength(12);
    });
});

describe('getBookProgressTrendData', () => {
    it('should handle single day session with start/end points', () => {
        const now = Date.now();
        const sessions: ReadingSession[] = [{
            id: 's1',
            bookId: 'b1',
            bookTitle: 'B1',
            startTime: now,
            endTime: now + 60000,
            startWordIndex: 10,
            endWordIndex: 100,
            wordsRead: 90,
            durationSeconds: 60,
            type: 'reading'
        }];
        const data = getBookProgressTrendData(sessions);
        expect(data).toHaveLength(2);
        expect(data[0].index).toBe(10);
        expect(data[1].index).toBe(100);
    });

    it('should fill gaps between sessions and extend to today', () => {
        const now = new Date();
        now.setHours(12, 0, 0, 0);
        const threeDaysAgo = now.getTime() - 3 * 24 * 60 * 60 * 1000;

        const sessions: ReadingSession[] = [{
            id: 's1',
            bookId: 'b1',
            bookTitle: 'B1',
            startTime: threeDaysAgo,
            endTime: threeDaysAgo + 60000,
            startWordIndex: 0,
            endWordIndex: 100,
            wordsRead: 100,
            durationSeconds: 60,
            type: 'reading'
        }];

        const data = getBookProgressTrendData(sessions);
        // Points for: 3 days ago (active), 2 days ago (gap), 1 day ago (gap), Today (gap)
        expect(data.length).toBe(4);
        expect(data[0].hasActivity).toBe(true);
        expect(data[0].index).toBe(100);
        expect(data[1].hasActivity).toBe(false);
        expect(data[1].index).toBe(100);
        expect(data[3].hasActivity).toBe(false);
        expect(data[3].index).toBe(100);
    });
});

describe('calculateFinishedBooks', () => {
    const bookId = 'book-1';

    // Helper to create a minimal book record
    const createBook = (totalWords: number, dateFinished?: number): BookRecord => ({
        id: bookId,
        archived: false,
        meta: { title: 'Test Book', totalWords, dateFinished } as any,
        analysis: { realEndIndex: totalWords } as any,
        storage: { path: '' } as any,
        progress: { wordIndex: 0, lastReadAt: Date.now() }
    } as BookRecord);

    const createSession = (endWordIndex: number, startTime: number): ReadingSession => ({
        id: 's1',
        bookId,
        bookTitle: 'Test Book',
        startTime,
        endTime: startTime + 60000,
        startWordIndex: 0,
        endWordIndex,
        wordsRead: endWordIndex,
        durationSeconds: 60,
        type: 'reading'
    });

    it('should return already finished books without updating', () => {
        const book = createBook(1000, 1600000000000);
        const { results, booksToUpdate } = calculateFinishedBooks([book], []);

        expect(results).toHaveLength(1);
        expect(results[0].date).toBe(1600000000000);
        expect(booksToUpdate).toHaveLength(0);
    });

    it('should mark book as finished when exact 100% is reached', () => {
        const book = createBook(1000);
        const session = createSession(1000, Date.now());
        const { results, booksToUpdate } = calculateFinishedBooks([book], [session]);

        expect(results).toHaveLength(1);
        expect(booksToUpdate).toHaveLength(1);
        expect(booksToUpdate[0].id).toBe(bookId);
    });

    it('should mark book as finished when >= 99.5% is reached', () => {
        const book = createBook(1000);
        const session = createSession(996, Date.now()); // 99.6% > 99.5%
        const { results, booksToUpdate } = calculateFinishedBooks([book], [session]);

        expect(results).toHaveLength(1);
        expect(booksToUpdate).toHaveLength(1);
        expect(booksToUpdate[0].id).toBe(bookId);
    });

    it('should NOT mark book as finished when < 99.5% is reached', () => {
        const book = createBook(1000);
        const session = createSession(994, Date.now()); // 99.4% < 99.5%
        const { results, booksToUpdate } = calculateFinishedBooks([book], [session]);

        expect(results).toHaveLength(0);
        expect(booksToUpdate).toHaveLength(0);
    });

    it('should return nothing when there are no sessions and book is not finished', () => {
        const book = createBook(1000);
        const { results, booksToUpdate } = calculateFinishedBooks([book], []);

        expect(results).toHaveLength(0);
        expect(booksToUpdate).toHaveLength(0);
    });
});
