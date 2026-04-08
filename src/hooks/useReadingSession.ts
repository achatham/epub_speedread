import { useEffect, useRef, useState } from 'react';
import type { FirestoreStorage } from '../utils/storage';
import { calculateRsvpMultiplier } from '../utils/text-processing';
import { useReaderStore } from '../stores/useReaderStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useSettingsStore } from '../stores/useSettingsStore';

export function useReadingSession(storageProvider: FirestoreStorage | null) {
    const isPlaying = useReaderStore(state => state.isPlaying);
    const isHoldPaused = useReaderStore(state => state.isHoldPaused);
    const isChapterBreak = useReaderStore(state => state.isChapterBreak);
    const currentIndex = useReaderStore(state => state.currentIndex);
    const words = useReaderStore(state => state.words);
    const bookTitle = useReaderStore(state => state.bookTitle);
    const isReadingAloud = useReaderStore(state => state.isReadingAloud);

    const library = useLibraryStore(state => state.library);
    const setLibrary = useLibraryStore(state => state.setLibrary);
    const setSessions = useLibraryStore(state => state.setSessions);
    const currentBookId = useLibraryStore(state => state.currentBookId);

    const rsvpSettings = useSettingsStore(state => state.rsvpSettings);
    const wpm = useSettingsStore(state => state.wpm);

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

    const [isDocumentVisible, setIsDocumentVisible] = useState(document.visibilityState === 'visible');
    const lastInteractionTimeRef = useRef<number>(Date.now());
    const paginatedAccumulatedDurationMsRef = useRef<number>(0);

    const IDLE_BUFFER_MS = 300000; // 5 minutes

    const getEffectivePaginatedDurationMs = () => {
        if (paginatedSessionStartTimeRef.current === null) return paginatedAccumulatedDurationMsRef.current;
        const now = Date.now();
        const cappedEndTime = Math.min(now, lastInteractionTimeRef.current + IDLE_BUFFER_MS);
        const segmentDuration = Math.max(0, cappedEndTime - paginatedSessionStartTimeRef.current);
        return paginatedAccumulatedDurationMsRef.current + segmentDuration;
    };

    // Track Document Visibility
    useEffect(() => {
        const handler = () => setIsDocumentVisible(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);

    // Track Global Interactions
    useEffect(() => {
        const handler = () => {
            lastInteractionTimeRef.current = Date.now();
        };
        window.addEventListener('pointerdown', handler, true);
        window.addEventListener('keydown', handler, true);
        return () => {
            window.removeEventListener('pointerdown', handler, true);
            window.removeEventListener('keydown', handler, true);
        };
    }, []);

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
        const isPaginatedMode = !isPlaying && !isReadingAloud && !!currentBookId;
        const isPaginatedTrulyActive = isPaginatedMode && isDocumentVisible;

        if (isPaginatedTrulyActive && paginatedSessionStartTimeRef.current === null) {
            // Starting or Resuming active segment
            paginatedSessionStartTimeRef.current = Date.now();
            lastInteractionTimeRef.current = Date.now();

            // If this is a fresh start (not just a visibility resume), reset stats
            if (paginatedBookIdRef.current !== currentBookId) {
                paginatedWordsReadRef.current = 0;
                paginatedSessionStartIndexRef.current = currentIndex;
                lastPaginatedIndexRef.current = currentIndex;
                lastPaginatedSaveTimeRef.current = Date.now();
                paginatedBookIdRef.current = currentBookId;
                paginatedBookTitleRef.current = bookTitle;
                paginatedAccumulatedDurationMsRef.current = 0;
            }
        } else if ((!isPaginatedTrulyActive || (paginatedBookIdRef.current !== currentBookId)) && paginatedSessionStartTimeRef.current !== null) {
            // Pausing or Stopping active segment
            const segmentDurationMs = Math.max(0, Math.min(Date.now(), lastInteractionTimeRef.current + IDLE_BUFFER_MS) - paginatedSessionStartTimeRef.current);
            paginatedAccumulatedDurationMsRef.current += segmentDurationMs;

            // If mode/book changed, log what we have and reset
            const isFinishingSession = !isPaginatedMode || (paginatedBookIdRef.current !== currentBookId);
            if (isFinishingSession && storageProvider && paginatedBookIdRef.current && paginatedWordsReadRef.current > 0) {
                const wordsRead = paginatedWordsReadRef.current;
                const totalDurationMs = paginatedAccumulatedDurationMsRef.current;
                const durationSeconds = Math.round(totalDurationMs / 1000);
                console.log(`[Paginated Session] Finished:
- Duration: ${durationSeconds}s
- Words: ${wordsRead}`);

                const savedBookId = paginatedBookIdRef.current;
                storageProvider.logReadingSession({
                    bookId: savedBookId,
                    bookTitle: paginatedBookTitleRef.current,
                    startTime: Date.now() - totalDurationMs, // Approximate
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
                        const cumulativeDuration = (bookRecord.progress.cumulativeDurationSeconds || 0) + Math.round(totalDurationMs / 1000);

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

                // Reset stats as the session is officially finished
                paginatedWordsReadRef.current = 0;
                paginatedBookIdRef.current = null;
                paginatedAccumulatedDurationMsRef.current = 0;
            } else if (isFinishingSession) {
                // Mode/Book changed but not enough words to log, still reset
                paginatedWordsReadRef.current = 0;
                paginatedBookIdRef.current = null;
                paginatedAccumulatedDurationMsRef.current = 0;
            }

            paginatedSessionStartTimeRef.current = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, isReadingAloud, currentBookId, storageProvider, bookTitle, setSessions, isDocumentVisible]);

    // Track Paginated Words Read
    useEffect(() => {
        const isPaginatedActive = !isPlaying && !isReadingAloud && !!currentBookId && isDocumentVisible;
        if (!isPaginatedActive) return;

        let didTurnPage = false;
        if (currentIndex !== lastPaginatedIndexRef.current) {
            lastInteractionTimeRef.current = Date.now();

            if (currentIndex > lastPaginatedIndexRef.current) {
                const delta = currentIndex - lastPaginatedIndexRef.current;
                // Sanity check: if they jump more than 2000 words (approx 6-7 pages), it's probably a seek, not a page turn
                if (delta < 2000) {
                    paginatedWordsReadRef.current += delta;
                    didTurnPage = true;
                }
            }
        }
        lastPaginatedIndexRef.current = currentIndex;

        // Periodic save for paginated mode OR on page turn
        const now = Date.now();
        const timeSinceLastSave = now - lastPaginatedSaveTimeRef.current;
        if (paginatedSessionStartTimeRef.current && (didTurnPage || timeSinceLastSave > 60000) && storageProvider && paginatedBookIdRef.current) {
            const durationMs = getEffectivePaginatedDurationMs();
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
                    startTime: Date.now() - durationMs,
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
                paginatedAccumulatedDurationMsRef.current = 0;
            }
        }
    }, [currentIndex, isPlaying, isReadingAloud, currentBookId, storageProvider, bookTitle, library, setLibrary, setSessions, isDocumentVisible]);

    return {};
}
