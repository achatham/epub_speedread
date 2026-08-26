import { describe, it, expect } from 'vitest';
import { buildAggregatedSessions, getAggregationPlan, getSessionKey, getHistoryRangeData, getBookProgressTrendData, calculateFinishedBooks, isImplausiblySlowSession } from './stats';
import type { ReadingSession, BookRecord } from './storage';

// Mock crypto.randomUUID
if (!global.crypto) {
    (global as any).crypto = {};
}
(global.crypto as any).randomUUID = () => '00000000-0000-0000-0000-000000000000';

describe('daily session aggregation', () => {
    const book1 = 'book-1';
    const today = new Date('2023-10-27T10:00:00Z').getTime();
    const todayLater = new Date('2023-10-27T14:00:00Z').getTime();

    const raw = (over: Partial<ReadingSession>): ReadingSession => ({
        id: 's1',
        bookId: book1,
        bookTitle: 'Book 1',
        startTime: today,
        endTime: today + 1000,
        startWordIndex: 0,
        endWordIndex: 100,
        wordsRead: 100,
        durationSeconds: 60,
        type: 'reading',
        ...over
    });

    it('aggregates a single session', () => {
        const sessions = buildAggregatedSessions([raw({})]);
        expect(sessions).toHaveLength(1);
        expect(sessions[0].wordsRead).toBe(100);
    });

    it('sums sessions that fall in the same book, day and type', () => {
        const sessions = buildAggregatedSessions([
            raw({ id: 's1' }),
            raw({ id: 's2', startTime: todayLater, endTime: todayLater + 1000, startWordIndex: 100, endWordIndex: 250, wordsRead: 150, durationSeconds: 90 })
        ]);

        expect(sessions).toHaveLength(1);
        expect(sessions[0].wordsRead).toBe(250);
        expect(sessions[0].durationSeconds).toBe(150);
        expect(sessions[0].endTime).toBe(todayLater + 1000);
    });

    it('derives the document id from the session key so runs converge', () => {
        const input = [raw({})];
        const first = buildAggregatedSessions(input);
        const second = buildAggregatedSessions(input);
        expect(first[0].id).toBe(getSessionKey(input[0]));
        expect(second[0].id).toBe(first[0].id);
    });

    it('separates different books and days', () => {
        const book2 = 'book-2';
        const tomorrow = today + 24 * 60 * 60 * 1000;
        const sessions = buildAggregatedSessions([
            raw({ id: 'a' }),
            raw({ id: 'b', bookId: book2, bookTitle: 'Book 2' }),
            raw({ id: 'c', startTime: tomorrow, endTime: tomorrow + 1000 })
        ]);
        expect(sessions).toHaveLength(3);
        expect(sessions.every(s => s.wordsRead === 100)).toBe(true);
    });

    it('uses the maximum endWordIndex even if a later session backtracks', () => {
        const sessions = buildAggregatedSessions([
            raw({ id: 's1', endWordIndex: 2000, wordsRead: 2000, durationSeconds: 600 }),
            raw({ id: 's2', startTime: todayLater, endTime: todayLater + 1000, startWordIndex: 1000, endWordIndex: 1500, wordsRead: 500, durationSeconds: 300 })
        ]);
        expect(sessions[0].endWordIndex).toBe(2000);
        expect(sessions[0].startWordIndex).toBe(0);
        expect(sessions[0].wordsRead).toBe(2500);
    });

    it('is idempotent: re-running against its own output writes nothing', () => {
        const rawSessions = [raw({ id: 's1' }), raw({ id: 's2', wordsRead: 50 })];
        const first = getAggregationPlan([], rawSessions);
        expect(first.upsertSessions).toHaveLength(1);

        const second = getAggregationPlan(first.sessions, rawSessions);
        expect(second.upsertSessions).toHaveLength(0);
        expect(second.deleteIds).toHaveLength(0);
        expect(second.sessions[0].wordsRead).toBe(150);
    });

    it('replaces legacy duplicate aggregates instead of summing them', () => {
        // Regression: concurrent runs used to mint a random UUID per run, so the
        // same day ended up with several documents that were then folded back
        // together, multiplying the totals.
        const rawSessions = [raw({ id: 's1' })];
        const key = getSessionKey(rawSessions[0]);
        const duplicate = { ...rawSessions[0], id: '', wordsRead: 100 };
        const legacy = [
            { ...duplicate, id: 'e6a0b1f0-0000-4000-8000-000000000001' },
            { ...duplicate, id: 'e6a0b1f0-0000-4000-8000-000000000002' },
            { ...duplicate, id: 'e6a0b1f0-0000-4000-8000-000000000003' }
        ];

        const plan = getAggregationPlan(legacy, rawSessions);

        expect(plan.deleteIds).toEqual(legacy.map(s => s.id));
        expect(plan.sessions).toHaveLength(1);
        expect(plan.sessions[0].id).toBe(key);
        expect(plan.sessions[0].wordsRead).toBe(100);
    });

    it('deletes aggregates whose raw sessions are gone', () => {
        const removed = raw({ id: 'gone', startTime: today - 7 * 24 * 60 * 60 * 1000 });
        const existing = buildAggregatedSessions([removed]);
        const plan = getAggregationPlan(existing, [raw({ id: 's1' })]);
        expect(plan.deleteIds).toEqual([getSessionKey(removed)]);
    });

    it('falls back to the index delta when wordsRead is missing', () => {
        const sessions = buildAggregatedSessions([
            raw({ id: 's1', wordsRead: undefined as unknown as number, startWordIndex: 10, endWordIndex: 90 })
        ]);
        expect(sessions[0].wordsRead).toBe(80);
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

describe('isImplausiblySlowSession', () => {
    const base: ReadingSession = {
        id: 's',
        bookId: 'b',
        bookTitle: 'B',
        startTime: 0,
        endTime: 0,
        startWordIndex: 0,
        endWordIndex: 0,
        wordsRead: 0,
        durationSeconds: 0,
        type: 'paginated',
    };

    it('flags one page read over thousands of minutes', () => {
        // ~300 words over 2737 minutes -> ~0.11 WPM
        const s = { ...base, wordsRead: 300, durationSeconds: 2737 * 60 };
        expect(isImplausiblySlowSession(s)).toBe(true);
    });

    it('does not flag normal reading speeds', () => {
        const s = { ...base, wordsRead: 300, durationSeconds: 60 }; // 300 WPM
        expect(isImplausiblySlowSession(s)).toBe(false);
    });

    it('does not flag a slow-but-human session above the threshold', () => {
        const s = { ...base, wordsRead: 30, durationSeconds: 60 }; // 30 WPM
        expect(isImplausiblySlowSession(s)).toBe(false);
    });

    it('ignores sessions with no words or no duration', () => {
        expect(isImplausiblySlowSession({ ...base, wordsRead: 0, durationSeconds: 5000 })).toBe(false);
        expect(isImplausiblySlowSession({ ...base, wordsRead: 100, durationSeconds: 0 })).toBe(false);
    });

    it('falls back to word index span when wordsRead is missing', () => {
        const s = { ...base, wordsRead: 0, startWordIndex: 0, endWordIndex: 5, durationSeconds: 3600 };
        expect(isImplausiblySlowSession(s)).toBe(true); // 5 words / 60 min
    });
});
