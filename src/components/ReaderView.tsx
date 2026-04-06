import { useRef, useEffect } from 'react';
import { ReaderMenu } from './ReaderMenu';
import type { WordData } from '../utils/text-processing';
import { splitWord } from '../utils/orp';
import { useSettingsStore, type FontFamily } from '../stores/useSettingsStore';
import { useReaderStore } from '../stores/useReaderStore';

interface ReaderViewProps {
  onCloseBook: () => void;
  navigate: (type: 'book' | 'chapter' | 'prev-paragraph' | 'prev-sentence' | 'next-paragraph' | 'next-sentence') => void;
  onReadChapter: () => void;
  upcomingChapterTitle: string;
  storageProvider?: any;
  handleSetIsPlaying: (playing: boolean) => void;
}

export function ReaderView({
  onCloseBook,
  navigate,
  onReadChapter,
  upcomingChapterTitle,
  handleSetIsPlaying,
}: ReaderViewProps) {
  const pressStartTimeRef = useRef<number | null>(null);
  const lastPauseTimeRef = useRef<number>(0);

  const pausedAreaRef = useRef<HTMLDivElement>(null);
  const pausedScrollRef = useRef<HTMLDivElement>(null);

  const { theme, fontFamily, readingMode, wpm, rsvpSettings } = useSettingsStore();
  const { 
    words, currentIndex, realEndIndex, furthestIndex, 
    isPlaying, setIsHoldPaused, 
    bookTitle, sections, setCurrentIndex, isChapterBreak 
  } = useReaderStore();

  const effectiveTotalWords = words.length;

  // Auto-scroll to the current word inside RSVP paused view
  useEffect(() => {
    if (!isPlaying && readingMode === 'rsvp' && pausedScrollRef.current) {
      const activeEl = pausedScrollRef.current.querySelector('[data-current-word="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'center' });
      }
    }
  }, [isPlaying, readingMode, currentIndex]);

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

  const fontClasses: Record<FontFamily, string> = {
    system: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'font-serif',
    mono: 'font-mono',
    opendyslexic: 'font-opendyslexic',
    atkinson: 'font-hyperlegible'
  };

  const rsvpFocusColor = theme === 'bedtime' ? 'text-amber-600' : (theme === 'dark' ? 'text-red-500' : 'text-red-600');
  const rsvpContextClass = theme === 'bedtime' ? 'text-stone-600' : 'opacity-90';
  const guidelinesClass = theme === 'bedtime' ? 'bg-amber-900/30' : 'bg-red-600 dark:bg-red-500 opacity-30';

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pressStartTimeRef.current = Date.now();
    setIsHoldPaused(true);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (pressStartTimeRef.current === null) return;

    const duration = Date.now() - pressStartTimeRef.current;
    pressStartTimeRef.current = null;

    if (duration < 300) {
      // Short tap
      if (isPlaying) {
        // Full pause
        handleSetIsPlaying(false);
        lastPauseTimeRef.current = Date.now();
      }
      setIsHoldPaused(false);
    } else {
      // Long press: resume
      setIsHoldPaused(false);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (pressStartTimeRef.current !== null) {
      pressStartTimeRef.current = null;
      setIsHoldPaused(false);
    }
  };

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
    const effectiveWpm = wpm / rsvpSettings.vanityWpmRatio;

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
      <div className={`mt-4 text-xs space-y-1 landscape:mt-1 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
        <div className="flex gap-4 justify-center landscape:justify-start">
          <span>{percentage}% Complete</span>
          <span>•</span>
          <span>Page {Math.floor(currentIndex / 300) + 1} of {Math.ceil(effectiveTotalWords / 300)}</span>
          <span className="hidden landscape:inline opacity-40">•</span>
          <span className="hidden landscape:inline font-mono opacity-80">{formatDuration(wordsLeftInChapter)} chapter</span>
          <span className="hidden landscape:inline opacity-40">•</span>
          <span className="hidden landscape:inline font-mono opacity-80">{formatDuration(wordsLeftInBook)} book</span>
        </div>
        <div className="flex gap-4 justify-center landscape:justify-start landscape:hidden font-mono opacity-80">
          <span>Chapter: {formatDuration(wordsLeftInChapter)} left</span>
          <span>Book: {formatDuration(wordsLeftInBook)} left</span>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`flex flex-col h-dvh transition-colors duration-300 ${mainBg} ${mainText} ${!isPlaying ? 'cursor-pointer' : ''}`}
      style={{ fontFamily: fontClasses[fontFamily] }}
      onClick={() => {
        if (Date.now() - lastPauseTimeRef.current < 400) return;
        if (!isPlaying) handleSetIsPlaying(true);
      }}
    >
      {isPlaying && (
        <div
          className="fixed inset-0 z-40 bg-transparent cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          title="Hold to pause, tap for menu"
        />
      )}

      {/* Paused: book title + stats header */}
      {!isPlaying && (
        <div className="shrink-0 text-center w-full px-4 pt-6 pb-2 landscape:pt-3 landscape:text-left landscape:px-8 z-20" onClick={(e) => e.stopPropagation()}>
          <h3 className="m-0 font-normal opacity-60 text-lg truncate max-w-2xl mx-auto landscape:mx-0 landscape:max-w-md">{bookTitle}</h3>
          {getProgressStats()}
        </div>
      )}

      {/* RSVP Display or Text Preview */}
      <div
        ref={!isPlaying ? pausedAreaRef : undefined}
        className={`relative flex min-h-0 w-full overflow-hidden border-t border-b
          ${readingMode === 'rsvp' ? 'items-center justify-center' : 'items-stretch'}
          ${isPlaying ? 'flex-1' : 'flex-1 max-w-2xl mx-auto landscape:max-w-none landscape:mx-8 w-full'}
          ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-200 dark:border-zinc-800'}`}
        style={{ minHeight: isPlaying ? Math.max(120, currentFontSize * 1.5) : undefined }}
      >
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
          <div className={`w-full h-full text-left px-4 py-4 md:px-12 landscape:text-base landscape:leading-snug ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'} overflow-y-auto hidden-scrollbar`} ref={pausedScrollRef}>
            <div className="my-auto pointer-events-none select-none max-w-4xl mx-auto pb-[40vh] pt-[40vh]">
              {(() => {
                const start = Math.max(chapterStart, currentIndex - 200);
                const end = Math.min(words.length, currentIndex + 200);
                const pageWords = words.slice(start, end);

                const paragraphs: { word: WordData; globalIdx: number }[][] = [];
                let current: { word: WordData; globalIdx: number }[] = [];
                
                for (let i = 0; i < pageWords.length; i++) {
                  const globalIdx = start + i;
                  const word = pageWords[i];
                  if (word.isParagraphStart && current.length > 0) {
                    paragraphs.push(current);
                    current = [];
                  }
                  current.push({ word, globalIdx });
                }
                if (current.length > 0) paragraphs.push(current);

                return paragraphs.map((para, pIdx) => (
                  <p key={pIdx} className="mb-[1em] leading-relaxed text-justify">
                    {para.map(({ word, globalIdx }, wIdx) => {
                      const isCurrent = globalIdx === currentIndex;
                      return (
                        <span 
                          key={globalIdx} 
                          {...(isCurrent ? { 'data-current-word': 'true' } : {})}
                          className={isCurrent 
                            ? `font-bold inline-block scale-110 px-[1px] transition-transform ${theme === 'bedtime' ? 'text-amber-600' : 'text-zinc-900 dark:text-zinc-100 underline decoration-red-500/50'}`
                            : "opacity-60"
                          }
                        >
                          {wIdx > 0 ? ' ' : ''}{word.text}
                        </span>
                      );
                    })}
                  </p>
                ));
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className={`shrink-0 flex flex-col gap-4 items-center relative z-50 py-4
          ${isPlaying ? 'w-full max-w-md px-4' : 'portrait:w-full portrait:max-w-md portrait:px-4 landscape:pointer-events-none'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-full space-y-4 landscape:pointer-events-auto ${!isPlaying ? 'landscape:fixed landscape:bottom-4 landscape:left-8 landscape:right-64 landscape:w-auto landscape:space-y-4' : ''}`}>
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

        {!isPlaying && (
          <ReaderMenu
            activeChapterIdx={activeChapterIdx}
            onCloseBook={onCloseBook}
            onReadChapter={onReadChapter}
            navigate={navigate}
          />
        )}
      </div>

      {!isPlaying && (
        <div className="hidden landscape:flex fixed top-4 right-6 z-50 flex-col items-end pointer-events-none" onClick={(e) => e.stopPropagation()}>
          <div className={`px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow-sm max-w-[200px] ${theme === 'bedtime' ? 'border-zinc-900 bg-black/80' : ''}`}>
            <p className="text-[10px] uppercase tracking-widest opacity-40 font-bold mb-0.5">Chapter</p>
            <p className="text-xs font-medium truncate">{sections[activeChapterIdx]?.label || 'No Chapter'}</p>
          </div>
        </div>
      )}

    </div>
  );
}
