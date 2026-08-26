import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useReadingSession } from './useReadingSession';
import { useReaderStore } from '../stores/useReaderStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useSettingsStore } from '../stores/useSettingsStore';

// Mock storage provider
const mockStorageProvider = {
    logReadingSession: vi.fn().mockResolvedValue(undefined),
    aggregateSessions: vi.fn().mockResolvedValue([]),
    getAggregatedSessions: vi.fn().mockResolvedValue([]),
    updateBookStats: vi.fn().mockResolvedValue(undefined),
};

describe('useReadingSession Paginated Word Counting', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup initial store states
        useReaderStore.setState({
            isPlaying: false,
            isHoldPaused: false,
            isChapterBreak: false,
            currentIndex: 0,
            words: Array(1000).fill({ text: 'word' }),
            bookTitle: 'Test Book',
            isReadingAloud: false,
            currentBookId: 'test-book-id',
        });

        useLibraryStore.setState({
            library: [{ id: 'test-book-id', meta: { title: 'Test Book' }, progress: { cumulativeWordsRead: 0, cumulativeExpectedWords: 0, cumulativeDurationSeconds: 0 } } as any],
        });

        useSettingsStore.setState({
            wpm: 300,
            rsvpSettings: {} as any,
        });
    });

    it('should count words when navigating forward in paginated mode', async () => {
        const { unmount } = renderHook(() => useReadingSession(mockStorageProvider as any));

        // Initial state: index 0
        act(() => {
            useReaderStore.setState({ currentIndex: 100 });
        });

        // Trigger session save via unmount (which triggers the cleanup effects)
        unmount();

        const totalWordsRead = mockStorageProvider.logReadingSession.mock.calls
            .filter(call => call[0].type === 'paginated')
            .reduce((acc, call) => acc + call[0].wordsRead, 0);

        expect(totalWordsRead).toBe(100);
    });

    it('should NOT double-count words when navigating forward, backward, and forward again', async () => {
        const { unmount } = renderHook(() => useReadingSession(mockStorageProvider as any));

        // Navigate forward: 0 -> 100 (+100)
        act(() => {
            useReaderStore.setState({ currentIndex: 100 });
        });

        // Navigate backward: 100 -> 0 (should be +0)
        act(() => {
            useReaderStore.setState({ currentIndex: 0 });
        });

        // Navigate forward again: 0 -> 100 (should be +0 as we already read up to 100)
        act(() => {
            useReaderStore.setState({ currentIndex: 100 });
        });

        unmount();

        const totalWordsRead = mockStorageProvider.logReadingSession.mock.calls
            .filter(call => call[0].type === 'paginated')
            .reduce((acc, call) => acc + call[0].wordsRead, 0);

        expect(totalWordsRead).toBe(100);
    });

    it('should count additional words when navigating past the furthest point reached', async () => {
        const { unmount } = renderHook(() => useReadingSession(mockStorageProvider as any));

        // 0 -> 100 (+100)
        act(() => {
            useReaderStore.setState({ currentIndex: 100 });
        });

        // 100 -> 50 (+0)
        act(() => {
            useReaderStore.setState({ currentIndex: 50 });
        });

        // 50 -> 150 (+50, because 150 - 100 = 50)
        act(() => {
            useReaderStore.setState({ currentIndex: 150 });
        });

        unmount();

        const totalWordsRead = mockStorageProvider.logReadingSession.mock.calls
            .filter(call => call[0].type === 'paginated')
            .reduce((acc, call) => acc + call[0].wordsRead, 0);

        expect(totalWordsRead).toBe(150);
    });
});

describe('useReadingSession Paginated Session Timing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        useReaderStore.setState({
            isPlaying: false,
            isHoldPaused: false,
            isChapterBreak: false,
            currentIndex: 0,
            words: Array(1000).fill({ text: 'word' }),
            bookTitle: 'Test Book',
            isReadingAloud: false,
            currentBookId: 'test-book-id',
        });

        useLibraryStore.setState({
            library: [{ id: 'test-book-id', meta: { title: 'Test Book' }, progress: { cumulativeWordsRead: 0, cumulativeExpectedWords: 0, cumulativeDurationSeconds: 0 } } as any],
        });

        useSettingsStore.setState({ wpm: 300, rsvpSettings: {} as any });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('logs the real start of the reading stretch, not endTime minus duration', () => {
        const start = Date.now();
        const setVisibility = (state: 'visible' | 'hidden') => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
            document.dispatchEvent(new Event('visibilitychange'));
        };
        setVisibility('visible');

        const { unmount } = renderHook(() => useReadingSession(mockStorageProvider as any));

        // A page turn a minute in flushes the first chunk and starts a new one.
        act(() => {
            vi.setSystemTime(start + 60_000);
            useReaderStore.setState({ currentIndex: 100 });
        });

        // The app is backgrounded for ten minutes, which doesn't count as
        // reading, then a page is turned a minute after coming back.
        act(() => {
            vi.setSystemTime(start + 120_000);
            setVisibility('hidden');
        });
        act(() => {
            vi.setSystemTime(start + 720_000);
            setVisibility('visible');
        });
        act(() => {
            vi.setSystemTime(start + 780_000);
            useReaderStore.setState({ currentIndex: 200 });
        });
        unmount();

        const paginated = mockStorageProvider.logReadingSession.mock.calls
            .map(c => c[0])
            .filter(s => s.type === 'paginated');

        expect(paginated[0]).toMatchObject({ startTime: start, endTime: start + 60_000, durationSeconds: 60 });

        // The second chunk spans 1m–13m but only two of those minutes were
        // active. Deriving the start from the duration would have claimed the
        // reading happened at 11m, ten minutes after it began.
        const second = paginated[1];
        expect(second.startTime).toBe(start + 60_000);
        expect(second.endTime).toBe(start + 780_000);
        expect(second.durationSeconds).toBe(120);
    });
});
