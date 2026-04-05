import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ReaderMenu } from './ReaderMenu';
import type { WordData } from '../utils/text-processing';
import { type Theme, type FontFamily } from '../hooks/useSettings';
import type { RsvpSettings } from '../utils/storage';
import type { NavigationType } from '../utils/navigation';

interface PaginatedReaderViewProps {
  words: WordData[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  effectiveTotalWords: number;
  realEndIndex: number | null;
  furthestIndex: number | null;
  wpm: number;
  onWpmChange: (wpm: number) => void;
  theme: Theme;
  fontFamily: FontFamily;
  bookTitle: string;
  onCloseBook: () => void;
  onSettingsClick: () => void;
  onToggleTheme: () => void;
  onAskAiClick: () => void;
  onBookSettingsClick: () => void;
  sections: { label: string; startIndex: number }[];
  navigate: (type: NavigationType) => void;
  onReadChapter: () => void;
  isReadingAloud: boolean;
  isSynthesizing: boolean;
  onStatsClick?: () => void;
  rsvpSettings: RsvpSettings;
  readerMode: 'rsvp' | 'paginated';
  setReaderMode: (mode: 'rsvp' | 'paginated') => void;
}

export function PaginatedReaderView({
  words,
  currentIndex,
  setCurrentIndex,
  effectiveTotalWords,
  furthestIndex,
  wpm,
  onWpmChange,
  theme,
  fontFamily,
  bookTitle,
  onCloseBook,
  onSettingsClick,
  onToggleTheme,
  onAskAiClick,
  onBookSettingsClick,
  sections,
  navigate,
  onReadChapter,
  isReadingAloud,
  isSynthesizing,
  onStatsClick,
  readerMode,
  setReaderMode
}: PaginatedReaderViewProps) {
  const WORDS_PER_PAGE = 300;
  const containerRef = useRef<HTMLDivElement>(null);
  const currentWordRef = useRef<HTMLSpanElement>(null);

  const pageStart = Math.floor(currentIndex / WORDS_PER_PAGE) * WORDS_PER_PAGE;
  const pageEnd = Math.min(words.length, pageStart + WORDS_PER_PAGE);
  const pageWords = useMemo(() => words.slice(pageStart, pageEnd), [words, pageStart, pageEnd]);

  // Find current chapter
  let activeChapterIdx = -1;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].startIndex <= currentIndex) {
      activeChapterIdx = i;
    } else {
      break;
    }
  }

  const handlePrevPage = useCallback(() => {
    setCurrentIndex(Math.max(0, pageStart - WORDS_PER_PAGE));
  }, [pageStart, setCurrentIndex]);

  const handleNextPage = useCallback(() => {
    setCurrentIndex(Math.min(words.length - 1, pageStart + WORDS_PER_PAGE));
  }, [pageStart, words.length, setCurrentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        handlePrevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        handleNextPage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextPage, handlePrevPage]);

  useEffect(() => {
    if (currentWordRef.current && containerRef.current) {
        currentWordRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  const mainBg = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const mainText = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';

  const fontClasses: Record<FontFamily, string> = {
    system: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'font-serif',
    mono: 'font-mono',
    opendyslexic: 'font-opendyslexic',
    atkinson: 'font-hyperlegible'
  };

  const highlightColor = theme === 'bedtime' ? 'bg-amber-900/40 text-amber-200' : 'bg-yellow-200 dark:bg-yellow-900/40 text-zinc-900 dark:text-zinc-100';

  return (
    <div
      className={`flex flex-col h-dvh transition-colors duration-300 relative ${mainBg} ${mainText}`}
      style={{ fontFamily: fontClasses[fontFamily] }}
    >
      {/* Header */}
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between z-20 bg-inherit">
        <div className="flex items-center gap-4">
          <button
            onClick={onCloseBook}
            className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Back to Library"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="truncate max-w-[200px] sm:max-w-md">
            <h1 className="font-semibold truncate">{bookTitle}</h1>
            <p className="text-[10px] uppercase tracking-widest opacity-50 truncate">
              {sections[activeChapterIdx]?.label || 'No Chapter'}
            </p>
          </div>
        </div>
        <div className="text-xs opacity-50 tabular-nums">
           Page {Math.floor(currentIndex / WORDS_PER_PAGE) + 1} of {Math.ceil(effectiveTotalWords / WORDS_PER_PAGE)}
        </div>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-6 sm:p-12 leading-relaxed text-lg sm:text-xl max-w-3xl mx-auto w-full"
      >
        <div className="flex flex-wrap gap-x-1.5 gap-y-1">
          {pageWords.map((word, i) => {
            const absoluteIdx = pageStart + i;
            const isCurrent = absoluteIdx === currentIndex;

            return (
              <React.Fragment key={absoluteIdx}>
                {word.isParagraphStart && i > 0 && <div className="w-full h-4" />}
                <span
                  ref={isCurrent ? currentWordRef : null}
                  onClick={() => setCurrentIndex(absoluteIdx)}
                  className={`cursor-pointer rounded px-0.5 transition-colors ${isCurrent ? highlightColor : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                >
                  {word.text}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between z-20 bg-inherit">
        <button
          onClick={handlePrevPage}
          disabled={pageStart === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={20} />
          <span>Previous</span>
        </button>

        <div className="flex-1 px-8">
           <div
             className={`h-1 w-full rounded-full ${theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800'} overflow-hidden cursor-pointer`}
             onClick={(e) => {
               const rect = e.currentTarget.getBoundingClientRect();
               const x = e.clientX - rect.left;
               const percentage = x / rect.width;
               setCurrentIndex(Math.floor(percentage * words.length));
             }}
           >
              <div
                className={`h-full ${theme === 'bedtime' ? 'bg-amber-700' : 'bg-zinc-900 dark:bg-zinc-100'} transition-all`}
                style={{ width: `${(currentIndex / words.length) * 100}%` }}
              />
           </div>
        </div>

        <button
          onClick={handleNextPage}
          disabled={pageEnd >= words.length}
          className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
        >
          <span>Next</span>
          <ChevronRight size={20} />
        </button>
      </div>

      <ReaderMenu
        wpm={wpm}
        onWpmChange={onWpmChange}
        onSettingsClick={onSettingsClick}
        onBookSettingsClick={onBookSettingsClick}
        onStatsClick={onStatsClick || (() => { })}
        onToggleTheme={onToggleTheme}
        theme={theme}
        bookTitle={bookTitle}
        sections={sections}
        activeChapterIdx={activeChapterIdx}
        setCurrentIndex={setCurrentIndex}
        onCloseBook={onCloseBook}
        onAskAiClick={onAskAiClick}
        onReadChapter={onReadChapter}
        isReadingAloud={isReadingAloud}
        isSynthesizing={isSynthesizing}
        navigate={navigate}
        furthestIndex={furthestIndex}
        effectiveTotalWords={effectiveTotalWords}
        currentIndex={currentIndex}
        readerMode={readerMode}
        setReaderMode={setReaderMode}
      />
    </div>
  );
}
