import React, { useState, useEffect, useMemo, useRef } from 'react';
import { type WordData, splitWord, getCenteredContext } from '../utils/text-processing';
import { ReaderMenu } from './ReaderMenu';

type Theme = 'light' | 'dark' | 'bedtime';

interface ReaderViewProps {
  words: WordData[];
  currentIndex: number;
  setCurrentIndex: (idx: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  wpm: number;
  onWpmChange: (wpm: number) => void;
  onCloseBook: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  onStatsClick: () => void;
  onSettingsClick: () => void;
  onBookSettingsClick: () => void;
  onAskAiClick: () => void;
  isAskAiOpen: boolean;
  sections: { label: string; startIndex: number }[];
  isChapterBreak: boolean;
  upcomingChapterTitle?: string;
  furthestIndex: number | null;
  effectiveTotalWords: number;
  isReadingAloud: boolean;
  isSynthesizing: boolean;
  onReadChapter: () => void;
  navigate: (type: any) => void;
  realEndIndex: number | null;
  vanityWpmRatio: number;
  fontFamily: string;
  bookTitle: string;
  isNavOpen: boolean;
  toggleNav: () => void;
  isTocOpen: boolean;
  toggleToc: () => void;
}

const BENCHMARK_WORD = "transportation";
const { prefix: benchPrefix, suffix: benchSuffix } = splitWord(BENCHMARK_WORD);
const BENCH_LEFT_DENSITY = (benchPrefix.length + 0.5) / 0.4;
const BENCH_RIGHT_DENSITY = (benchSuffix.length + 0.5) / 0.6;
const BENCH_MAX_DENSITY = Math.max(BENCH_LEFT_DENSITY, BENCH_RIGHT_DENSITY);

const fontStyles: Record<string, string> = {
  system: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
  inter: 'font-["Inter"]',
  merriweather: 'font-["Merriweather"]',
  roboto: 'font-["Roboto"]',
  openDyslexic: 'font-["OpenDyslexic"]'
};

const ReaderView: React.FC<ReaderViewProps> = ({
  words,
  currentIndex,
  setCurrentIndex,
  isPlaying,
  setIsPlaying,
  wpm,
  onWpmChange,
  onCloseBook,
  theme,
  onToggleTheme,
  onStatsClick,
  onSettingsClick,
  onBookSettingsClick,
  onAskAiClick,
  sections,
  isChapterBreak,
  upcomingChapterTitle,
  furthestIndex,
  effectiveTotalWords,
  isReadingAloud,
  isSynthesizing,
  onReadChapter,
  navigate,
  _realEndIndex,
  _vanityWpmRatio,
  fontFamily,
  bookTitle,
  _isNavOpen,
  _toggleNav,
  _isTocOpen,
  _toggleToc
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const isLandscape = windowSize.width > windowSize.height;

  const currentWord = words[currentIndex]?.text || "";
  const { prefix, focus, suffix } = splitWord(currentWord);

  const currentFontSize = useMemo(() => {
    const idealFontSize = windowSize.height * 0.30;

    // Calculate density for current word
    const currentLeftDensity = (prefix.length + 0.5) / 0.4;
    const currentRightDensity = (suffix.length + 0.5) / 0.6;
    const currentMaxDensity = Math.max(currentLeftDensity, currentRightDensity);

    // Use the larger of current density or benchmark density to ensure we scale down for long words
    // but keep a stable size for short words (stable relative to the benchmark word).
    const effectiveDensity = Math.max(BENCH_MAX_DENSITY, currentMaxDensity);

    const maxFontSize = (windowSize.width * 0.90) / effectiveDensity;
    return Math.min(idealFontSize, maxFontSize);
  }, [windowSize, prefix.length, suffix.length]);

  const activeChapterIdx = useMemo(() => {
    if (!showMenu && isPlaying) return -1;
    if (sections.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].startIndex <= currentIndex) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [sections, currentIndex, showMenu, isPlaying]);

  const pausedContext = useMemo(() => {
    if (isPlaying || words.length === 0) return { words: [], relativeIndex: 0 };
    return getCenteredContext(words, currentIndex, 1000);
  }, [words, currentIndex, isPlaying]);

  useEffect(() => {
    if (!isPlaying && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const activeWord = container.querySelector('.bg-blue-100, .bg-blue-900');
      if (activeWord) {
        activeWord.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [currentIndex, isPlaying, pausedContext]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.code === 'ArrowLeft') {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      } else if (e.code === 'ArrowRight') {
        setCurrentIndex(Math.min(words.length - 1, currentIndex + 1));
      } else if (e.code === 'Escape') {
        if (showMenu) setShowMenu(false);
        else onCloseBook();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, setIsPlaying, currentIndex, words.length, onCloseBook, showMenu, setCurrentIndex]);

  if (words.length === 0) return null;

  const rsvpContextClass = isLandscape ? 'opacity-40' : 'opacity-20';
  const rsvpFocusColor = theme === 'dark' || theme === 'bedtime' ? 'text-red-400' : 'text-red-600';
  const previewFontSizeClass = isLandscape ? 'text-base' : 'text-xl';

  const handleScreenClick = (e: React.MouseEvent) => {
    if (showMenu) return;
    if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    setIsPlaying(!isPlaying);
  };

  const currentFontClass = fontStyles[fontFamily] || 'font-sans';

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col ${theme === 'dark' || theme === 'bedtime' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'} transition-colors duration-300 select-none ${currentFontClass}`}
      onClick={handleScreenClick}
    >
      <header className="flex items-center justify-between p-4 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onCloseBook(); }}
          className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
          title="Back to Library"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex flex-col items-center flex-1 mx-4">
          <span className="text-xs font-bold uppercase tracking-widest opacity-40 truncate max-w-[200px] mb-0.5">
            {bookTitle}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium opacity-60">
              {currentIndex + 1} / {words.length}
            </span>
            <span className="text-xs opacity-40">
              {Math.round(((currentIndex + 1) / words.length) * 100)}%
            </span>
          </div>
        </div>
        <div className="w-10" />
      </header>

      <main className="flex-1 flex flex-col min-h-0 relative">
        {isChapterBreak && isPlaying ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-sm uppercase tracking-widest opacity-40 mb-2">Upcoming Chapter</div>
            <div className="text-3xl font-serif font-bold italic">{upcomingChapterTitle || 'Next Chapter'}</div>
          </div>
        ) : (
          <>
            {!isPlaying ? (
              <div
                ref={scrollContainerRef}
                className="w-full h-full overflow-y-auto px-4 py-8 flex flex-col items-center justify-center"
              >
                <div className={`max-w-prose w-full text-justify leading-relaxed whitespace-pre-wrap ${previewFontSizeClass}`}>
                  {pausedContext.words.map((word, i) => {
                    const absIdx = currentIndex - pausedContext.relativeIndex + i;
                    const isCurrent = absIdx === currentIndex;
                    return (
                      <span
                        key={`${word.text}-${absIdx}`}
                        className={`${isCurrent ? 'bg-blue-100 dark:bg-blue-900 font-bold' : ''} rounded px-0.5 transition-colors cursor-pointer`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentIndex(absIdx);
                        }}
                      >
                        {word.text}{' '}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center relative">
                <div className="flex w-full items-baseline justify-center font-medium transition-all duration-100" style={{ fontSize: `${currentFontSize}px` }}>
                  <div className={`text-right whitespace-pre ${rsvpContextClass} flex-[0_0_40%] pr-[0.6ch]`}>{prefix}</div>
                  <div className="w-0 flex justify-center items-baseline overflow-visible z-10">
                    <div className={`${rsvpFocusColor} font-bold text-center`}>{focus}</div>
                  </div>
                  <div className={`text-left whitespace-pre ${rsvpContextClass} flex-1 pl-[0.6ch]`}>{suffix}</div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {!isPlaying && (
        <ReaderMenu
          isOpen={showMenu}
          setIsOpen={setShowMenu}
          theme={theme}
          wpm={wpm}
          onWpmChange={onWpmChange}
          onToggleTheme={onToggleTheme}
          onSettingsClick={onSettingsClick}
          onBookSettingsClick={onBookSettingsClick}
          onStatsClick={onStatsClick}
          onAskAiClick={onAskAiClick}
          isReadingAloud={isReadingAloud}
          isSynthesizing={isSynthesizing}
          onReadChapter={onReadChapter}
          navigate={navigate}
          sections={sections}
          currentIndex={currentIndex}
          setCurrentIndex={setCurrentIndex}
          activeChapterIdx={activeChapterIdx}
          effectiveTotalWords={effectiveTotalWords}
          furthestIndex={furthestIndex}
        />
      )}
    </div>
  );
};

export default React.memo(ReaderView);
