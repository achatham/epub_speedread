import React from 'react';
import { LibraryView } from './LibraryView';
import { PaginatedReaderView } from './PaginatedReaderView';
import { AudioBookPlayer } from '../utils/AudioBookPlayer';
import { useReaderStore } from '../stores/useReaderStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLibraryStore } from '../stores/useLibraryStore';

interface AuthenticatedAppProps {
    handleSelectBook: (id: string) => void;
    handleDeleteBook: (e: React.MouseEvent, id: string) => void;
    handleToggleArchive: (id: string, archived: boolean) => void;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onFileInputClick: (e: React.MouseEvent<HTMLInputElement>) => void;
    handleLoadDemoBook: () => void;
    setShowAbout: (show: boolean) => void;
    storageProvider: any;
    handleCloseBook: () => void;
    navigate: (type: any) => void;
    audioPlayerRef: React.MutableRefObject<AudioBookPlayer | null>;
    handleSetIsPlaying: (playing: boolean) => void;
}

export function AuthenticatedApp({
    handleSelectBook, handleDeleteBook, handleToggleArchive, handleFileUpload, fileInputRef,
    onFileInputClick, handleLoadDemoBook, setShowAbout, storageProvider, handleCloseBook, navigate, audioPlayerRef, handleSetIsPlaying
}: AuthenticatedAppProps) {
    const isChapterBreak = useReaderStore(state => state.isChapterBreak);
    const words = useReaderStore(state => state.words);
    const sections = useReaderStore(state => state.sections);
    const currentIndex = useReaderStore(state => state.currentIndex);
    const bookTitle = useReaderStore(state => state.bookTitle);
    const setIsSynthesizing = useReaderStore(state => state.setIsSynthesizing);
    const setIsReadingAloud = useReaderStore(state => state.setIsReadingAloud);
    const setIsPlaying = useReaderStore(state => state.setIsPlaying);
    const setCurrentIndex = useReaderStore(state => state.setCurrentIndex);

    const currentBookId = useReaderStore(state => state.currentBookId);
    const setSessions = useLibraryStore(state => state.setSessions);

    const wpm = useSettingsStore(state => state.wpm);
    const ttsSpeed = useSettingsStore(state => state.ttsSpeed);

    if (!currentBookId) {
        return (
            <LibraryView
                onSelectBook={handleSelectBook}
                onDeleteBook={handleDeleteBook}
                onToggleArchive={handleToggleArchive}
                onFileUpload={handleFileUpload}
                fileInputRef={fileInputRef}
                onFileInputClick={onFileInputClick}
                onLoadDemoBook={handleLoadDemoBook}
                onAboutClick={() => setShowAbout(true)}
            />
        );
    }

    const sharedReadChapter = async () => {
        if (audioPlayerRef.current?.isActive) {
            audioPlayerRef.current.stop();
            return;
        }

        let cIdx = -1;
        for (let i = 0; i < sections.length; i++) {
            if (sections[i].startIndex <= currentIndex) cIdx = i; else break;
        }

        const cStart = sections[cIdx]?.startIndex || 0;
        const cEnd = sections[cIdx + 1]?.startIndex || words.length;
        const cWords = words.slice(cStart, cEnd);

        if (cWords.length === 0) return;

        setIsPlaying(false);

        audioPlayerRef.current?.playChapter(
            currentBookId,
            cIdx,
            cWords,
            cStart,
            currentIndex,
            ttsSpeed,
            {
                onProgress: (idx) => setCurrentIndex(idx),
                onStateChange: (state) => {
                    setIsSynthesizing(state.isSynthesizing);
                    setIsReadingAloud(state.isPlaying);
                },
                onSessionFinished: (stats) => {
                    if (storageProvider && currentBookId) {
                        const wordsRead = Math.max(0, stats.endWordIndex - stats.startWordIndex);
                        const effectiveWpm = stats.durationSeconds > 0 ? Math.round((wordsRead / stats.durationSeconds) * 60) : 0;

                        console.log(`[Listening Session] Finished:
- Duration: ${stats.durationSeconds}s
- Words: ${wordsRead}
- Desired WPM: ${wpm}
- Effective WPM: ${effectiveWpm}`);

                        storageProvider.logReadingSession({
                            bookId: currentBookId,
                            bookTitle: bookTitle,
                            startTime: stats.startTime,
                            endTime: stats.endTime,
                            startWordIndex: stats.startWordIndex,
                            endWordIndex: stats.endWordIndex,
                            wordsRead: wordsRead,
                            durationSeconds: stats.durationSeconds,
                            type: 'listening'
                        }).then(async () => {
                            setSessions(await storageProvider.aggregateSessions());
                        });
                    }
                },
                onError: (msg) => alert(msg)
            }
        );
    };

    const sharedUpcomingChapterTitle = isChapterBreak
        ? (sections.slice().reverse().find(s => s.startIndex <= currentIndex)?.label || '')
        : (sections.find(s => s.startIndex === currentIndex + 1)?.label || '');

    return (
        <PaginatedReaderView
            onCloseBook={handleCloseBook}
            navigate={navigate}
            onReadChapter={sharedReadChapter}
            upcomingChapterTitle={sharedUpcomingChapterTitle}
            handleSetIsPlaying={handleSetIsPlaying}
        />
    );
}
