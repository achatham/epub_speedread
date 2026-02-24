import { useEffect, useRef } from 'react';
import type { FirestoreStorage, RsvpSettings, BookRecord, ReadingSession } from '../utils/storage';
import { calculateRsvpMultiplier } from '../utils/text-processing';
import type { WordData } from '../utils/text-processing';


export function useReadingSession(
    storageProvider: FirestoreStorage | null,
    isPlaying: boolean,
    isHoldPaused: boolean,
    isChapterBreak: boolean,
    currentBookId: string | null,
    currentIndex: number,
    words: WordData[],
    bookTitle: string,
    rsvpSettings: RsvpSettings,
    library: BookRecord[],
    setLibrary: React.Dispatch<React.SetStateAction<BookRecord[]>>,
    setSessions: React.Dispatch<React.SetStateAction<ReadingSession[]>>
) {
    const sessionStartTimeRef = useRef<number | null>(null);
    const wordsReadInSessionRef = useRef<number>(0);
    const multipliersSumInSessionRef = useRef<number>(0);
    const sessionStartIndexRef = useRef<number | null>(null);
    const lastSessionSaveTimeRef = useRef<number>(0);

    // Track Session Start / Stop
    useEffect(() => {
        if (isPlaying && sessionStartTimeRef.current === null && currentBookId) {
            sessionStartTimeRef.current = Date.now();
            sessionStartIndexRef.current = currentIndex;
            wordsReadInSessionRef.current = 0;
            multipliersSumInSessionRef.current = 0;
            lastSessionSaveTimeRef.current = Date.now();
        } else if (!isPlaying && sessionStartTimeRef.current !== null && storageProvider && currentBookId) {
            // Save Session
            const durationMs = Date.now() - sessionStartTimeRef.current;

            // Only save if duration > 5 seconds
            if (durationMs > 5000 && wordsReadInSessionRef.current > 0) {


                storageProvider.logReadingSession({
                    bookId: currentBookId,
                    bookTitle,
                    startTime: sessionStartTimeRef.current,
                    endTime: Date.now(),
                    durationSeconds: Math.round(durationMs / 1000),
                    startWordIndex: sessionStartIndexRef.current || 0,
                    endWordIndex: currentIndex,
                    wordsRead: wordsReadInSessionRef.current,
                    type: 'reading'
                })
                    .then(async () => {
                        await storageProvider.aggregateSessions();
                        setSessions(await storageProvider.getAggregatedSessions());

                        const bookRecord = library.find(b => b.id === currentBookId);
                        if (bookRecord) {
                            const expectedWordsThisSession = multipliersSumInSessionRef.current;
                            const cumulativeWords = (bookRecord.progress.cumulativeWordsRead || 0) + wordsReadInSessionRef.current;
                            const cumulativeExpected = (bookRecord.progress.cumulativeExpectedWords || 0) + expectedWordsThisSession;
                            const cumulativeDuration = (bookRecord.progress.cumulativeDurationSeconds || 0) + Math.round(durationMs / 1000);

                            await storageProvider.updateBookStats(currentBookId, {
                                cumulativeWordsRead: cumulativeWords,
                                cumulativeExpectedWords: cumulativeExpected,
                                cumulativeDurationSeconds: cumulativeDuration
                            });

                            setLibrary(prev => prev.map(b => b.id === currentBookId ? {
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
        }
    }, [isPlaying, currentBookId, storageProvider, currentIndex, bookTitle, library, setLibrary, setSessions]);

    // Track words read and multipliers
    useEffect(() => {
        if (isPlaying && !isHoldPaused && !isChapterBreak) {
            wordsReadInSessionRef.current += 1;
            const currentWord = words[currentIndex]?.text || '';
            const multiplier = calculateRsvpMultiplier(currentWord, rsvpSettings);
            multipliersSumInSessionRef.current += multiplier;

            // Periodic session save every 60 seconds of active reading
            const now = Date.now();
            if (sessionStartTimeRef.current && now - lastSessionSaveTimeRef.current > 60000 && storageProvider && currentBookId) {
                const durationMs = now - sessionStartTimeRef.current;
                if (wordsReadInSessionRef.current > 0) {


                    storageProvider.logReadingSession({
                        bookId: currentBookId,
                        bookTitle,
                        startTime: sessionStartTimeRef.current,
                        endTime: Date.now(),
                        durationSeconds: Math.round(durationMs / 1000),
                        startWordIndex: sessionStartIndexRef.current || 0,
                        endWordIndex: currentIndex,
                        wordsRead: wordsReadInSessionRef.current,
                        type: 'reading'
                    }).catch(err => console.error("Failed to save periodic session", err));

                    // Reset stats for the next chunk
                    sessionStartTimeRef.current = now;
                    sessionStartIndexRef.current = currentIndex;
                    wordsReadInSessionRef.current = 0;
                    multipliersSumInSessionRef.current = 0;
                }
            }
        }
    }, [currentIndex, isPlaying, isHoldPaused, isChapterBreak, words, rsvpSettings, storageProvider, currentBookId, bookTitle, library, setLibrary, setSessions]);

    return {};
}
