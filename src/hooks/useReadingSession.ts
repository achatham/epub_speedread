import { useEffect, useRef } from 'react';
import type { FirestoreStorage } from '../utils/storage';
import { calculateRsvpMultiplier } from '../utils/text-processing';
import { useReaderStore } from '../stores/useReaderStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useSettingsStore } from '../stores/useSettingsStore';

export function useReadingSession(storageProvider: FirestoreStorage | null) {
    const { isPlaying, isHoldPaused, isChapterBreak, currentIndex, words, bookTitle, isReadingAloud } = useReaderStore();
    const { library, setLibrary, setSessions, currentBookId } = useLibraryStore();
    const { rsvpSettings, wpm } = useSettingsStore();

    // RSVP Session Refs
    const sessionStartTimeRef = useRef<number | null>(null);
    const lastRsvpIndexRef = useRef<number>(currentIndex);
    const sessionBookIdRef = useRef<string | null>(null);
    const sessionBookTitleRef = useRef<string>('');
    const wordsReadInSessionRef = useRef<number>(0);
    const multipliersSumInSessionRef = useRef<number>(0);
    const sessionStartIndexRef = useRef<number | null>(null);
    const lastSessionSaveTimeRef = useRef<number>(0);

    const fullSessionStartTimeRef = useRef<number | null>(null);
    const totalWordsInFullSessionRef = useRef<number>(0);

    // Paginated Session Refs
    const paginatedSessionStartTimeRef = useRef<number | null>(null);
    const paginatedWordsReadRef = useRef<number>(0);
    const paginatedSessionStartIndexRef = useRef<number | null>(null);
    const lastPaginatedIndexRef = useRef<number>(currentIndex);
    const lastPaginatedSaveTimeRef = useRef<number>(0);
    const paginatedBookIdRef = useRef<string | null>(null);
    const paginatedBookTitleRef = useRef<string>('');

    // Keep title refs synced after async book processing
    useEffect(() => {
        if (bookTitle) {
            sessionBookTitleRef.current = bookTitle;
            paginatedBookTitleRef.current = bookTitle;
        }
    }, [bookTitle]);

    // Track RSVP Session Start / Stop
    useEffect(() => {
        if (isPlaying && sessionStartTimeRef.current === null && currentBookId) {
            sessionStartTimeRef.current = Date.now();
            fullSessionStartTimeRef.current = Date.now();
            sessionStartIndexRef.current = currentIndex;
            wordsReadInSessionRef.current = 0;
            totalWordsInFullSessionRef.current = 0;
            multipliersSumInSessionRef.current = 0;
            lastSessionSaveTimeRef.current = Date.now();
            sessionBookIdRef.current = currentBookId;
            sessionBookTitleRef.current = bookTitle;
        } else if (!isPlaying && sessionStartTimeRef.current !== null && storageProvider && sessionBookIdRef.current) {
            // Save Session
            const durationMs = Date.now() - sessionStartTimeRef.current;
            const fullDurationMs = Date.now() - (fullSessionStartTimeRef.current || sessionStartTimeRef.current);
            const totalWordsRead = totalWordsInFullSessionRef.current;

            if (totalWordsRead > 0 && fullDurationMs > 0) {
                const durationSeconds = Math.round(fullDurationMs / 1000);
                const effectiveWpm = Math.round((totalWordsRead / (fullDurationMs / 1000)) * 60);
                console.log(`[RSVP Session] Finished:
- Duration: ${durationSeconds}s
- Words: ${totalWordsRead}
- Desired WPM: ${wpm}
- Effective WPM: ${effectiveWpm}`);
            }

            // Only save if duration > 5 seconds
            if (durationMs > 5000 && wordsReadInSessionRef.current > 0) {
                storageProvider.logReadingSession({
                    bookId: sessionBookIdRef.current,
                    bookTitle: sessionBookTitleRef.current,
                    startTime: sessionStartTimeRef.current,
                    endTime: Date.now(),
                    durationSeconds: Math.round(durationMs / 1000),
                    startWordIndex: sessionStartIndexRef.current || 0,
                    endWordIndex: lastRsvpIndexRef.current,
                    wordsRead: wordsReadInSessionRef.current,
                    type: 'rsvp'
                })
                    .then(async () => {
                        await storageProvider.aggregateSessions();
                        setSessions(await storageProvider.getAggregatedSessions());

                        const idToUpdate = sessionBookIdRef.current;
                        const bookRecord = idToUpdate ? library.find(b => b.id === idToUpdate) : undefined;
                        if (bookRecord && idToUpdate) {
                            const expectedWordsThisSession = multipliersSumInSessionRef.current;
                            const cumulativeWords = (bookRecord.progress.cumulativeWordsRead || 0) + wordsReadInSessionRef.current;
                            const cumulativeExpected = (bookRecord.progress.cumulativeExpectedWords || 0) + expectedWordsThisSession;
                            const cumulativeDuration = (bookRecord.progress.cumulativeDurationSeconds || 0) + Math.round(durationMs / 1000);

                            await storageProvider.updateBookStats(idToUpdate, {
                                cumulativeWordsRead: cumulativeWords,
                                cumulativeExpectedWords: cumulativeExpected,
                                cumulativeDurationSeconds: cumulativeDuration
                            });

                            setLibrary(prev => prev.map(b => b.id === idToUpdate ? {
                                ...b,
                                progress: {
                                    ...b.progress,
                                    wordIndex: currentIndex,
                                    cumulativeWordsRead: cumulativeWords,
                                    cumulativeExpectedWords: cumulativeExpected,
                                    cumulativeDurationSeconds: cumulativeDuration
                                }
                            } : b));
                        }
                    })
                    .catch(err => console.error("Failed to save session", err));
            }

            sessionStartTimeRef.current = null;
            wordsReadInSessionRef.current = 0;
            fullSessionStartTimeRef.current = null;
            totalWordsInFullSessionRef.current = 0;
            sessionBookIdRef.current = null;
        }
    }, [isPlaying, currentBookId, storageProvider, currentIndex, bookTitle, library, setLibrary, setSessions, wpm]);

    // Track words read and multipliers
    useEffect(() => {
        if (isPlaying && !isHoldPaused && !isChapterBreak) {
            lastRsvpIndexRef.current = currentIndex;
            wordsReadInSessionRef.current += 1;
            totalWordsInFullSessionRef.current += 1;
            const currentWord = words[currentIndex]?.text || '';
            const multiplier = calculateRsvpMultiplier(currentWord, rsvpSettings);
            multipliersSumInSessionRef.current += multiplier;

            // Periodic session save every 60 seconds of active reading
            const now = Date.now();
            if (sessionStartTimeRef.current && now - lastSessionSaveTimeRef.current > 60000 && storageProvider && sessionBookIdRef.current) {
                const durationMs = now - sessionStartTimeRef.current;
                if (wordsReadInSessionRef.current > 0) {
                    storageProvider.logReadingSession({
                        bookId: sessionBookIdRef.current,
                        bookTitle: sessionBookTitleRef.current,
                        startTime: sessionStartTimeRef.current,
                        endTime: Date.now(),
                        durationSeconds: Math.round(durationMs / 1000),
                        startWordIndex: sessionStartIndexRef.current || 0,
                        endWordIndex: lastRsvpIndexRef.current,
                        wordsRead: wordsReadInSessionRef.current,
                    type: 'rsvp'
                }).catch(err => console.error("Failed to save periodic RSVP session", err));

                    // Reset stats for the next chunk
                    sessionStartTimeRef.current = now;
                    lastSessionSaveTimeRef.current = now;
                    sessionStartIndexRef.current = currentIndex;
                    wordsReadInSessionRef.current = 0;
                    multipliersSumInSessionRef.current = 0;
                }
            }
        }
    }, [currentIndex, isPlaying, isHoldPaused, isChapterBreak, words, rsvpSettings, storageProvider, currentBookId, bookTitle, library, setLibrary, setSessions]);

    // Track Paginated Session Lifecycle
    useEffect(() => {
        const isPaginatedActive = !isPlaying && !isReadingAloud && !!currentBookId;

        if (isPaginatedActive && paginatedSessionStartTimeRef.current === null) {
            paginatedSessionStartTimeRef.current = Date.now();
            paginatedWordsReadRef.current = 0;
            paginatedSessionStartIndexRef.current = currentIndex;
            lastPaginatedIndexRef.current = currentIndex;
            lastPaginatedSaveTimeRef.current = Date.now();
            paginatedBookIdRef.current = currentBookId;
            paginatedBookTitleRef.current = bookTitle;
        } else if (!isPaginatedActive && paginatedSessionStartTimeRef.current !== null && storageProvider && paginatedBookIdRef.current) {
            const durationMs = Date.now() - paginatedSessionStartTimeRef.current;
            const wordsRead = paginatedWordsReadRef.current;

            if (durationMs > 0 && wordsRead > 0) {
                const durationSeconds = Math.round(durationMs / 1000);
                console.log(`[Paginated Session] Finished:
- Duration: ${durationSeconds}s
- Words: ${wordsRead}`);

                const savedBookId = paginatedBookIdRef.current;
                storageProvider.logReadingSession({
                    bookId: savedBookId,
                    bookTitle: paginatedBookTitleRef.current,
                    startTime: paginatedSessionStartTimeRef.current,
                    endTime: Date.now(),
                    durationSeconds,
                    startWordIndex: paginatedSessionStartIndexRef.current || 0,
                    endWordIndex: lastPaginatedIndexRef.current,
                    wordsRead: wordsRead,
                    type: 'paginated'
                }).then(async () => {
                    await storageProvider.aggregateSessions();
                    setSessions(await storageProvider.getAggregatedSessions());
                    
                    const bookRecord = library.find(b => b.id === savedBookId);
                    if (bookRecord) {
                        const cumulativeWords = (bookRecord.progress.cumulativeWordsRead || 0) + wordsRead;
                        const cumulativeExpected = (bookRecord.progress.cumulativeExpectedWords || 0) + wordsRead;
                        const cumulativeDuration = (bookRecord.progress.cumulativeDurationSeconds || 0) + Math.round(durationMs / 1000);

                        await storageProvider.updateBookStats(savedBookId, {
                            cumulativeWordsRead: cumulativeWords,
                            cumulativeExpectedWords: cumulativeExpected,
                            cumulativeDurationSeconds: cumulativeDuration
                        });

                        setLibrary(prev => prev.map(b => b.id === savedBookId ? {
                            ...b,
                            progress: {
                                ...b.progress,
                                cumulativeWordsRead: cumulativeWords,
                                cumulativeExpectedWords: cumulativeExpected,
                                cumulativeDurationSeconds: cumulativeDuration
                            }
                        } : b));
                    }
                }).catch(err => console.error("Failed to save paginated session", err));
            }
            paginatedSessionStartTimeRef.current = null;
            paginatedWordsReadRef.current = 0;
            paginatedBookIdRef.current = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, isReadingAloud, currentBookId, storageProvider, bookTitle, setSessions]);

    // Track Paginated Words Read
    useEffect(() => {
        const isPaginatedActive = !isPlaying && !isReadingAloud && !!currentBookId;
        if (!isPaginatedActive) return;

        let didTurnPage = false;
        if (currentIndex > lastPaginatedIndexRef.current) {
            const delta = currentIndex - lastPaginatedIndexRef.current;
            // Sanity check: if they jump more than 2000 words (approx 6-7 pages), it's probably a seek, not a page turn
            if (delta < 2000) {
                paginatedWordsReadRef.current += delta;
                didTurnPage = true;
            }
        }
        lastPaginatedIndexRef.current = currentIndex;

        // Periodic save for paginated mode OR on page turn
        const now = Date.now();
        const timeSinceLastSave = now - lastPaginatedSaveTimeRef.current;
        if (paginatedSessionStartTimeRef.current && (didTurnPage || timeSinceLastSave > 60000) && storageProvider && paginatedBookIdRef.current) {
            const durationMs = now - paginatedSessionStartTimeRef.current;
            const wordsRead = paginatedWordsReadRef.current;
            if (wordsRead > 0) {
                const durationSeconds = Math.round(durationMs / 1000);
                console.log(`[Paginated Session] Periodic Form Finished:
- Duration: ${durationSeconds}s
- Words: ${wordsRead}`);
                
                const savedBookId = paginatedBookIdRef.current;
                storageProvider.logReadingSession({
                    bookId: savedBookId,
                    bookTitle: paginatedBookTitleRef.current,
                    startTime: paginatedSessionStartTimeRef.current,
                    endTime: Date.now(),
                    durationSeconds,
                    startWordIndex: paginatedSessionStartIndexRef.current || 0,
                    endWordIndex: lastPaginatedIndexRef.current,
                    wordsRead: wordsRead,
                    type: 'paginated'
                }).then(async () => {
                    await storageProvider.aggregateSessions();
                    setSessions(await storageProvider.getAggregatedSessions());

                    const bookRecord = library.find(b => b.id === savedBookId);
                    if (bookRecord) {
                        const cumulativeWords = (bookRecord.progress.cumulativeWordsRead || 0) + wordsRead;
                        const cumulativeExpected = (bookRecord.progress.cumulativeExpectedWords || 0) + wordsRead;
                        const cumulativeDuration = (bookRecord.progress.cumulativeDurationSeconds || 0) + Math.round(durationMs / 1000);

                        await storageProvider.updateBookStats(savedBookId, {
                            cumulativeWordsRead: cumulativeWords,
                            cumulativeExpectedWords: cumulativeExpected,
                            cumulativeDurationSeconds: cumulativeDuration
                        });

                        setLibrary(prev => prev.map(b => b.id === savedBookId ? {
                            ...b,
                            progress: {
                                ...b.progress,
                                cumulativeWordsRead: cumulativeWords,
                                cumulativeExpectedWords: cumulativeExpected,
                                cumulativeDurationSeconds: cumulativeDuration
                            }
                        } : b));
                    }
                }).catch(err => console.error("Failed to save periodic paginated session", err));

                paginatedSessionStartTimeRef.current = now;
                lastPaginatedSaveTimeRef.current = now;
                paginatedSessionStartIndexRef.current = currentIndex;
                paginatedWordsReadRef.current = 0;
            }
        }
    }, [currentIndex, isPlaying, isReadingAloud, currentBookId, storageProvider, bookTitle, library, setLibrary, setSessions]);

    return {};
}
