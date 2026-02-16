import { useEffect, useRef, useMemo } from 'react';
import { SkipBack, X } from 'lucide-react';
import { type WordData, getCenteredContext } from '../utils/text-processing';
import { splitWord } from '../utils/orp';
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
  isTocOpen,
  toggleToc,
  isAskAiOpen,
  onReadChapter,
  isReadingAloud,
  isSynthesizing,
  isChapterBreak,
  upcomingChapterTitle,
  onStatsClick,
  vanityWpmRatio
}: ReaderViewProps) {
  const activeChapterRef = useRef<HTMLButtonElement>(null);
  const currentWordRef = useRef<HTMLSpanElement>(null);

  const centeredContext = useMemo(() => {
    if (isPlaying) return null;
    return getCenteredContext(words, currentIndex, 500);
  }, [words, currentIndex, isPlaying]);

  useEffect(() => {
    if (isTocOpen && activeChapterRef.current) {
      activeChapterRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isTocOpen]);

  useEffect(() => {
    if (!isPlaying && currentWordRef.current) {
      // Use a small timeout to ensure layout has settled
      const timer = setTimeout(() => {
        currentWordRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, isPlaying, centeredContext]);

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

  const currentFontSize = isPlaying ? targetFontSize : 32;

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

  // Find current chapter
  let activeChapterIdx = -1;
  for (let i = 0; i < sections.length; i++) {
      if (sections[i].startIndex <= currentIndex) {
          activeChapterIdx = i;
      } else {
          break;
      }
  }

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
      className={`flex flex-col ${isPlaying ? 'items-center justify-center' : 'items-stretch'} h-dvh transition-colors duration-300 relative ${mainBg} ${mainText} ${!isPlaying ? 'cursor-pointer' : ''}`}
      style={{ fontFamily: fontStyles[fontFamily] }}
      onClick={() => { if (!isPlaying) setIsPlaying(true); }}
    >
      {isPlaying && (
        <div 
          className="fixed inset-0 z-40 bg-transparent cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setIsPlaying(false); }}
          title="Click to pause"
        />
      )}
      
      {!isPlaying && (
        <div className="absolute top-8 text-center w-full px-4 landscape:top-4 landscape:left-28 landscape:text-left landscape:w-auto landscape:px-0 z-20" onClick={(e) => e.stopPropagation()}>
          <h3 className="m-0 font-normal opacity-60 text-lg truncate max-w-2xl mx-auto landscape:mx-0 landscape:max-w-md">{bookTitle}</h3>
          <p className="my-2 text-sm opacity-40 landscape:my-1 landscape:text-xs">
            {currentIndex + 1} / {effectiveTotalWords} words
            {realEndIndex && currentIndex >= realEndIndex && " (Back Matter)"}
          </p>
          {getProgressStats()}
        </div>
      )}

      {/* RSVP Display or Text Preview */}
      <div className={`relative flex ${isPlaying ? 'items-center justify-center' : 'flex-col items-stretch flex-1'} w-full ${isPlaying ? '' : 'max-w-4xl landscape:max-w-none landscape:my-2 landscape:mx-12 overflow-y-auto'} border-t border-b my-8 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-200 dark:border-zinc-800'}`} style={{ minHeight: isPlaying ? Math.max(120, currentFontSize * 1.5) : '120px' }}>
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
          <div
            className={`text-xl leading-relaxed text-center px-8 landscape:text-base landscape:leading-snug ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}
            style={{ fontSize: `${currentFontSize}px`, paddingTop: '50vh', paddingBottom: '50vh' }}
          >
            <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-3 opacity-100">
              {centeredContext?.before.map((w, i) => (
                <span key={`b-${i}`} className="opacity-25">{w.text}</span>
              ))}
              <span
                ref={currentWordRef}
                className={`font-bold underline ${rsvpFocusColor} scale-125 px-1.5 transition-transform duration-300`}
              >
                {centeredContext?.current?.text}
              </span>
              {centeredContext?.after.map((w, i) => (
                <span key={`a-${i}`} className="opacity-25">{w.text}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {!isPlaying && (
        <ReaderMenu
          theme={theme}
          onToggleTheme={onToggleTheme}
          onSettingsClick={onSettingsClick}
          onBookSettingsClick={onBookSettingsClick}
          onStatsClick={onStatsClick || (() => {})}
          onReadChapter={onReadChapter}
          onAskAiClick={onAskAiClick}
          isReadingAloud={isReadingAloud}
          isSynthesizing={isSynthesizing}
          isAskAiOpen={isAskAiOpen}
          wpm={wpm}
          onWpmChange={onWpmChange}
          onTocClick={toggleToc}
          isTocOpen={isTocOpen}
          bookTitle={bookTitle}
          chapterLabel={sections[activeChapterIdx]?.label}
          navigate={navigate}
        />
      )}

      {/* Progress Bars */}
      <div
        className={`flex flex-col gap-6 items-center relative z-50
          ${isPlaying ? 'w-full max-w-md px-4' : 'landscape:fixed landscape:bottom-6 landscape:left-12 landscape:right-32 landscape:w-auto landscape:gap-4 portrait:w-full portrait:max-w-md portrait:px-4'}
          ${!isPlaying && theme === 'bedtime' ? 'landscape:bg-black' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-full space-y-4`}>
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
              className={`w-full h-1 rounded-sm cursor-pointer relative group ${theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-200 dark:bg-zinc-800'}`}
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

      </div>


      {!isPlaying && !isTocOpen && (
        <button
          className="absolute top-4 left-4 landscape:top-4 landscape:left-4 opacity-30 hover:opacity-60 transition-opacity background-none border-none cursor-pointer text-inherit text-sm flex items-center gap-1 z-50"
          onClick={(e) => { e.stopPropagation(); onCloseBook(); }}
        >
          <SkipBack size={16} />
          Library
        </button>
      )}

      {isTocOpen && (
        <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-sm bg-black/20`} onClick={toggleToc}>
            <div className={`w-full max-w-md max-h-[80vh] overflow-y-auto border rounded-2xl shadow-2xl flex flex-col p-4 gap-2 animate-in zoom-in duration-200 ${theme === 'bedtime' ? 'bg-black border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b pb-2 mb-2 border-zinc-100 dark:border-zinc-800">
                    <h3 className="text-sm font-bold uppercase tracking-widest opacity-50">Table of Contents</h3>
                    <button onClick={toggleToc} className="opacity-50 hover:opacity-100"><X size={20} /></button>
                </div>
                {sections.length === 0 ? (
                <div className="px-3 py-4 text-sm text-center text-zinc-400">No chapters found</div>
                ) : (
                sections.map((section, idx) => {
                    const isCurrent = idx === activeChapterIdx;
                    return (
                    <button
                        key={idx}
                        ref={isCurrent ? activeChapterRef : null}
                        className={`text-left px-4 py-3 text-sm rounded-xl transition-colors leading-normal ${isCurrent
                            ? (theme === 'bedtime' ? 'bg-zinc-900 text-amber-600 font-bold' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold')
                            : (theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300')
                        }`}
                        onClick={() => {
                        setCurrentIndex(section.startIndex);
                        toggleToc();
                        }}
                    >
                        {section.label}
                    </button>
                    );
                })
                )}
            </div>
        </div>
      )}
    </div>
  );
}
