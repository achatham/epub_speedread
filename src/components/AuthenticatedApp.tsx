import React from 'react';
import type { Theme, FontFamily } from '../hooks/useSettings';
import type { RsvpSettings, BookRecord } from '../utils/storage';
import type { WordData } from '../utils/text-processing';
import type { NavigationType } from '../utils/navigation';
import { LibraryView } from './LibraryView';
import { ReaderView } from './ReaderView';
import { AudioBookPlayer } from '../utils/AudioBookPlayer';

interface AuthenticatedAppProps {
    currentBookId: string | null;
    library: BookRecord[];
    isLoading: boolean;
    theme: Theme;
    setIsSettingsOpen: (open: boolean) => void;
    toggleTheme: () => void;
    handleSelectBook: (id: string) => void;
    handleDeleteBook: (e: React.MouseEvent, id: string) => void;
    handleToggleArchive: (id: string, archived: boolean) => void;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onFileInputClick: (e: React.MouseEvent<HTMLInputElement>) => void;
    handleOpenStats: () => void;
    handleLoadDemoBook: () => void;
    setShowAbout: (show: boolean) => void;
    words: WordData[];
    currentIndex: number;
    realEndIndex: number | null;
    furthestIndex: number | null;
    isPlaying: boolean;
    handleSetIsPlaying: (play: boolean) => void;
    setIsHoldPaused: (paused: boolean) => void;
    wpm: number;
    setWpm: (wpm: number) => void;
    storageProvider: any;
    rsvpSettings: RsvpSettings;
    fontFamily: FontFamily;
    bookTitle: string;
    handleCloseBook: () => void;
    setIsBookSettingsOpen: (open: boolean) => void;
    setAiResponse: (res: string) => void;
    setIsAskAiOpen: (open: boolean) => void;
    sections: { label: string; startIndex: number }[];
    setCurrentIndex: (idx: number) => void;
    navigate: (type: NavigationType) => void;
    audioPlayerRef: React.MutableRefObject<AudioBookPlayer | null>;
    ttsSpeed: number;
    setIsSynthesizing: (synth: boolean) => void;
    setIsReadingAloud: (reading: boolean) => void;
    setSessions: (sessions: any) => void;
    isReadingAloud: boolean;
    isSynthesizing: boolean;
    isChapterBreak: boolean;
}

export function AuthenticatedApp({
    currentBookId, library, isLoading, theme, setIsSettingsOpen, toggleTheme, handleSelectBook,
    handleDeleteBook, handleToggleArchive, handleFileUpload, fileInputRef, onFileInputClick,
    handleOpenStats, handleLoadDemoBook, setShowAbout, words, currentIndex, realEndIndex,
    furthestIndex, isPlaying, handleSetIsPlaying, setIsHoldPaused, wpm, setWpm, storageProvider,
    rsvpSettings, fontFamily, bookTitle, handleCloseBook, setIsBookSettingsOpen, setAiResponse,
    setIsAskAiOpen, sections, setCurrentIndex, navigate, audioPlayerRef, ttsSpeed, setIsSynthesizing,
    setIsReadingAloud, setSessions, isReadingAloud, isSynthesizing, isChapterBreak
}: AuthenticatedAppProps) {
    if (!currentBookId) {
        return (
            <LibraryView
                library={library} isLoading={isLoading} theme={theme}
                onSettingsClick={() => setIsSettingsOpen(true)}
                onToggleTheme={toggleTheme}
                onSelectBook={handleSelectBook}
                onDeleteBook={handleDeleteBook}
                onToggleArchive={handleToggleArchive}
                onFileUpload={handleFileUpload}
                fileInputRef={fileInputRef}
                onFileInputClick={onFileInputClick}
                onStatsClick={handleOpenStats}
                onLoadDemoBook={handleLoadDemoBook}
                onAboutClick={() => setShowAbout(true)}
            />
        );
    }

    return (
        <ReaderView
            words={words} currentIndex={currentIndex} effectiveTotalWords={realEndIndex || words.length}
            realEndIndex={realEndIndex}
            furthestIndex={furthestIndex}
            isPlaying={isPlaying}
            setIsPlaying={handleSetIsPlaying}
            setIsHoldPaused={setIsHoldPaused}
            wpm={wpm}
            onWpmChange={(targetWpm) => {
                setWpm(targetWpm);
                storageProvider.updateBookWpm(currentBookId, targetWpm);
            }}
            vanityWpmRatio={rsvpSettings.vanityWpmRatio}
            theme={theme} fontFamily={fontFamily} bookTitle={bookTitle}
            onCloseBook={handleCloseBook} onSettingsClick={() => setIsSettingsOpen(true)}
            onBookSettingsClick={() => setIsBookSettingsOpen(true)}
            onToggleTheme={toggleTheme} onAskAiClick={() => { setAiResponse(''); setIsAskAiOpen(true); }}
            sections={sections} setCurrentIndex={setCurrentIndex}
            navigate={navigate}
            onReadChapter={async () => {
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

                handleSetIsPlaying(false);

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
                                    await storageProvider.aggregateSessions();
                                    setSessions(await storageProvider.getAggregatedSessions());
                                });
                            }
                        },
                        onError: (msg) => alert(msg)
                    }
                );
            }}
            isReadingAloud={isReadingAloud} isSynthesizing={isSynthesizing} isChapterBreak={isChapterBreak}
            upcomingChapterTitle={isChapterBreak
                ? (sections.slice().reverse().find(s => s.startIndex <= currentIndex)?.label || '')
                : (sections.find(s => s.startIndex === currentIndex + 1)?.label || '')}
            onStatsClick={handleOpenStats}
            rsvpSettings={rsvpSettings}
        />
    );
}
