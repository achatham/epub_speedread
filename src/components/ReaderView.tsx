import { useEffect, useRef, useMemo } from 'react';
import type { WordData } from '../utils/text-processing';
import { splitWord } from '../utils/orp';
import { getCenteredContext } from '../utils/text-processing';
import type { FontFamily } from './SettingsModal';
import { ReaderMenu } from './ReaderMenu';

type Theme = 'light' | 'dark' | 'bedtime';

interface ReaderViewProps {
  words: WordData[];
  currentIndex: number;
  effectiveTotalWords: number;
  realEndIndex: number | null;
  furthestIndex: number | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
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
  setCurrentIndex: (index: number) => void;
  navigate: (type: 'book' | 'chapter' | 'prev-paragraph' | 'prev-sentence' | 'next-paragraph' | 'next-sentence') => void;
  isNavOpen: boolean;
  toggleNav: () => void;
  isTocOpen: boolean;
  toggleToc: () => void;
  isAskAiOpen: boolean;
  onReadChapter: () => void;
  isReadingAloud: boolean;
  isSynthesizing: boolean;
  isChapterBreak: boolean;
  upcomingChapterTitle: string;
  onStatsClick?: () => void;
  vanityWpmRatio: number;
}

export function ReaderView({
  words,
  currentIndex,
  effectiveTotalWords,
  realEndIndex,
  furthestIndex,
  isPlaying,
  setIsPlaying,
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
  setCurrentIndex,
  navigate,
  isNavOpen: _isNavOpen,
  toggleNav: _toggleNav,
  isTocOpen,
  toggleToc: _toggleToc,
  isAskAiOpen: _isAskAiOpen,
  onReadChapter,
  isReadingAloud,
  isSynthesizing,
  isChapterBreak,
  upcomingChapterTitle,
  onStatsClick,
  vanityWpmRatio
}: ReaderViewProps) {
  const activeChapterRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isTocOpen && activeChapterRef.current) {
      activeChapterRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isTocOpen, sections]);

  // Find current chapter
  const activeChapterIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].startIndex <= currentIndex) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [sections, currentIndex]);

  const pausedContext = useMemo(() => {
    if (isPlaying || words.length === 0) return { words: [], relativeIndex: 0 };
    return getCenteredContext(words, currentIndex, 1000);
  }, [words, currentIndex, isPlaying]);

  if (words.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-dvh ${theme === 'bedtime' ? 'bg-black text-stone-400' : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'}`}>
        <div className="animate-pulse flex flex-col items-center">
          <div className={`h-4 w-48 rounded mb-4 ${theme === 'bedtime' ? 'bg-zinc-800' : 'bg-zinc-200 dark:bg-zinc-800'}`}></div>
          <div className={`h-4 w-32 rounded ${theme === 'bedtime' ? 'bg-zinc-800' : 'bg-zinc-200 dark:bg-zinc-800'}`}></div>
        </div>
        <button onClick={onCloseBook} className="mt-8 text-sm opacity-50 hover:opacity-100 underline">Cancel</button>
      </div>
    );
  }

  const { prefix, focus, suffix } = splitWord(words[currentIndex].text || '');

  // Dynamic font size calculation
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const idealFontSize = vh * 0.30;

  // Use "transportation" as a benchmark for stable sizing
  const { prefix: benchPrefix, suffix: benchSuffix } = splitWord("transportation");
  const benchLeftDensity = (benchPrefix.length + 0.5) / 0.4;
  const benchRightDensity = (benchSuffix.length + 0.5) / 0.6;
  const benchMaxDensity = Math.max(benchLeftDensity, benchRightDensity);
  const baseFittingFontSize = (vw * 0.9) / (0.6 * benchMaxDensity);

  const currentLeftDensity = (prefix.length + 0.5) / 0.4;
  const currentRightDensity = (suffix.length + 0.5) / 0.6;
  const currentMaxDensity = Math.max(currentLeftDensity, currentRightDensity);
  
  let targetFontSize = Math.min(idealFontSize, baseFittingFontSize);
  if (currentMaxDensity > benchMaxDensity * 1.15) {
      const currentFittingFontSize = (vw * 0.9) / (0.6 * currentMaxDensity);
      targetFontSize = Math.min(targetFontSize, currentFittingFontSize);
  }

  const currentFontSize = isPlaying ? targetFontSize : 48;

  // Theme-derived classes
  const mainBg = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const mainText = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
  
  const fontStyles: Record<FontFamily, string> = {
    system: 'ui-sans-serif, system-ui, sans-serif',
    inter: 'Inter, sans-serif',
    roboto: 'Roboto, sans-serif',
    merriweather: 'Merriweather, serif',
    mono: 'monospace'
  };

  const rsvpFocusColor = theme === 'bedtime' ? 'text-amber-600' : (theme === 'dark' ? 'text-red-500' : 'text-red-600');
  const rsvpContextClass = theme === 'bedtime' ? 'text-stone-600' : 'opacity-90';
  const guidelinesClass = theme === 'bedtime' ? 'bg-amber-900/30' : 'bg-red-600 dark:bg-red-500 opacity-30';

  const chapterStart = sections[activeChapterIdx]?.startIndex || 0;
  const chapterEnd = sections[activeChapterIdx + 1]?.startIndex || words.length;
  const wordsInChapter = chapterEnd - chapterStart;
  const progressInChapter = currentIndex - chapterStart;
  const chapterPercentage = wordsInChapter > 0 ? (progressInChapter / wordsInChapter) * 100 : 0;

  // Progress Calculations
  const getProgressStats = () => {
    if (isPlaying || words.length === 0) return null;

    // Use effectiveTotalWords (which respects realEndIndex) for book-wide stats
    const percentage = Math.round((Math.min(currentIndex + 1, effectiveTotalWords) / effectiveTotalWords) * 100);
    const nextChapterStartIndex = sections[activeChapterIdx + 1]?.startIndex || words.length;
    const wordsLeftInChapter = Math.max(0, nextChapterStartIndex - currentIndex);
    const wordsLeftInBook = Math.max(0, effectiveTotalWords - currentIndex);
    const effectiveWpm = wpm / vanityWpmRatio;
    
    const formatDuration = (wordCount: number) => {
        const minutes = wordCount / effectiveWpm;
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        const s = Math.floor((minutes * 60) % 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${Math.round(s)}s`;
    };

    return (
        <div className={`mt-4 text-xs space-y-1 landscape:mt-2 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            <div className="flex gap-4 justify-center landscape:justify-start">
                <span>{percentage}% Complete</span>
                <span>•</span>
                <span>Page {Math.floor(currentIndex / 300) + 1} of {Math.ceil(effectiveTotalWords / 300)}</span>
            </div>
            <div className="flex gap-4 justify-center landscape:justify-start font-mono opacity-80">
                <span>Chapter: {formatDuration(wordsLeftInChapter)} left</span>
                <span>Book: {formatDuration(wordsLeftInBook)} left</span>
            </div>
        </div>
    );
  };
  
  return (
    <div 
      className={`flex flex-col h-dvh transition-colors duration-300 relative ${mainBg} ${mainText} ${!isPlaying ? 'cursor-pointer' : ''}`}
      style={{ fontFamily: fontStyles[fontFamily] }}
      onClick={() => setIsPlaying(!isPlaying)}
    >
      {isPlaying && (
        <div 
          className="fixed inset-0 z-40 bg-transparent cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setIsPlaying(false); }}
          title="Click to pause"
        />
      )}
      
      {!isPlaying && (
        <header className="w-full flex justify-between items-start p-4 md:p-6 z-20" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-1 max-w-[70%]">
            <button
              onClick={onCloseBook}
              className="text-xs font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity text-left w-fit mb-2"
            >
              ← Library
            </button>
            <h3 className="m-0 font-bold text-xl md:text-2xl truncate">{bookTitle}</h3>
            <p className="text-sm opacity-50 font-medium">
              {currentIndex + 1} / {effectiveTotalWords} words
              {realEndIndex && currentIndex >= realEndIndex && " (Back Matter)"}
            </p>
          </div>
          <div className="text-right">
             {getProgressStats()}
          </div>
        </header>
      )}

      {/* RSVP Display or Text Preview */}
      <div className={`relative flex-1 flex items-center justify-center w-full ${isPlaying ? '' : 'px-4 md:px-12 overflow-y-auto max-h-full'} transition-all duration-500`}>
        {isPlaying ? (
          <>
            {!isChapterBreak && (
              <>
                <div className={`absolute top-0 left-[40%] -translate-x-1/2 w-0.5 h-10 ${guidelinesClass}`}></div>
                <div className={`absolute bottom-0 left-[40%] -translate-x-1/2 w-0.5 h-10 ${guidelinesClass}`}></div>
              </>
            )}

            {isChapterBreak ? (
                <div className="flex flex-col items-center justify-center text-center px-4 animate-in fade-in zoom-in duration-500">
                    <div className={`text-xs uppercase tracking-widest mb-3 opacity-50 font-bold ${theme === 'bedtime' ? 'text-amber-600' : 'text-zinc-500'}`}>
                        Next Chapter
                    </div>
                    <div className={`text-3xl font-serif italic ${theme === 'bedtime' ? 'text-stone-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                        {upcomingChapterTitle}
                    </div>
                </div>
            ) : (
                <div className="flex w-full items-baseline justify-center font-medium transition-all duration-100" style={{ fontSize: `${currentFontSize}px` }}>
                  <div className={`text-right whitespace-pre ${rsvpContextClass} flex-[0_0_40%] pr-[0.6ch]`}>{prefix}</div>
                  <div className="w-0 flex justify-center items-baseline overflow-visible z-10">
                    <div className={`${rsvpFocusColor} font-bold text-center`}>{focus}</div>
                  </div>
                  <div className={`text-left whitespace-pre ${rsvpContextClass} flex-1 pl-[0.6ch]`}>{suffix}</div>
                </div>
            )}
          </>
        ) : (
          <div className={`max-w-4xl text-center px-4 transition-all duration-700 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'} portrait:text-xl landscape:text-base leading-relaxed`}>
            {pausedContext.words.map((w, idx) => (
              <span
                key={idx}
                className={`${idx === pausedContext.relativeIndex ? (theme === 'bedtime' ? 'text-amber-600 font-black underline' : 'text-zinc-900 dark:text-zinc-100 font-black underline decoration-red-600 decoration-2 underline-offset-8') : ''}`}
              >
                {w.text}{' '}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className={`flex flex-col gap-6 items-center relative z-50 w-full max-w-2xl px-4 pb-8 transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-100'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full space-y-4">
          {/* Chapter Progress */}
          <div className="space-y-1">
            {isPlaying && (
              <div className="text-[10px] uppercase tracking-tighter opacity-30 font-bold">Chapter Progress</div>
            )}
            <div
              className={`w-full h-1 rounded-sm relative ${theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-200 dark:bg-zinc-800'}`}
            >
              <div
                className={`h-full rounded-sm transition-all duration-300 ${theme === 'bedtime' ? 'bg-amber-700' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                style={{ width: `${Math.min(100, chapterPercentage)}%` }}
              />
            </div>
          </div>

          {/* Book Progress */}
          <div className="space-y-1">
            <div
              className={`w-full h-1.5 rounded-sm cursor-pointer relative group ${theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-200 dark:bg-zinc-800'}`}
              onClick={(e) => {
                if (isPlaying) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percentage = x / rect.width;
                setCurrentIndex(Math.floor(percentage * words.length));
              }}
            >
              <div
                className={`h-full rounded-sm ${theme === 'bedtime' ? 'bg-stone-500' : 'bg-zinc-900 dark:bg-zinc-100'}`}
                style={{ width: `${Math.min(100, (currentIndex / effectiveTotalWords) * 100)}%` }}
              />
              {furthestIndex !== null && furthestIndex > currentIndex && (
                <div
                  className={`absolute top-0 bottom-0 w-0.5 z-10 opacity-50 ${theme === 'bedtime' ? 'bg-stone-400' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                  style={{ left: `${Math.min(100, (furthestIndex / effectiveTotalWords) * 100)}%` }}
                  title="Furthest Read"
                />
              )}
              {realEndIndex && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500/30"
                  style={{ left: `${(realEndIndex / words.length) * 100}%` }}
                  title="Real End of Book"
                />
              )}
              <div className="absolute inset-y-0 -left-2 -right-2 bg-transparent opacity-0 group-hover:opacity-100 cursor-pointer" />
            </div>
            {isPlaying && (
              <div className="text-[10px] uppercase tracking-tighter opacity-30 font-bold text-right">Book Progress</div>
            )}
          </div>
        </div>

        {!isPlaying && (
          <ReaderMenu
            wpm={wpm}
            onWpmChange={onWpmChange}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onSettingsClick={onSettingsClick}
            onBookSettingsClick={onBookSettingsClick}
            onStatsClick={onStatsClick || (() => {})}
            onAskAiClick={onAskAiClick}
            onReadChapter={onReadChapter}
            isReadingAloud={isReadingAloud}
            isSynthesizing={isSynthesizing}
            sections={sections}
            activeChapterIdx={activeChapterIdx}
            setCurrentIndex={setCurrentIndex}
            navigate={navigate}
            furthestIndex={furthestIndex}
            effectiveTotalWords={effectiveTotalWords}
            currentIndex={currentIndex}
          />
        )}
      </div>
    </div>
  );
}
