import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReadingSession } from './useReadingSession';
import { useReaderStore } from '../stores/useReaderStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useSettingsStore } from '../stores/useSettingsStore';

// Mock storage provider
const mockStorageProvider = {
    logReadingSession: vi.fn().mockResolvedValue(undefined),
    aggregateSessions: vi.fn().mockResolvedValue(undefined),
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
