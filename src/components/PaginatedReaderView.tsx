import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { ReaderMenu } from './ReaderMenu';
import { splitWord } from '../utils/orp';
import type { WordData } from '../utils/text-processing';
import { useReaderLayout } from '../hooks/useReaderLayout';
import { type Theme, type FontFamily } from '../stores/useSettingsStore';
import type { NavigationType } from '../utils/navigation';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useReaderStore } from '../stores/useReaderStore';

interface PaginatedReaderViewProps {
  onCloseBook: () => void;
  navigate: (type: NavigationType) => void;
  onReadChapter: () => void;
  handleSetIsPlaying: (playing: boolean) => void;
  upcomingChapterTitle?: string;
}

const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  system: 'ui-sans-serif, system-ui, sans-serif',
  serif: '"Georgia", "Times New Roman", serif',
  mono: 'ui-monospace, "Courier New", monospace',
  opendyslexic: 'OpenDyslexic, sans-serif',
  atkinson: 'AtkinsonHyperlegible, sans-serif',
};

export function PaginatedReaderView({
  onCloseBook,
  navigate,
  onReadChapter,
  handleSetIsPlaying,
  upcomingChapterTitle,
}: PaginatedReaderViewProps) {
  const { 
    words, currentIndex, realEndIndex, furthestIndex, 
    setCurrentIndex, sections, bookTitle, 
    isPlaying, setIsHoldPaused, isChapterBreak 
  } = useReaderStore();
  const { 
    theme, fontFamily, paginatedFontSize: fontSize, 
    setPaginatedFontSize: onFontSizeChange
  } = useSettingsStore();

  const pressStartTimeRef = useRef<number | null>(null);
  const lastPauseTimeRef = useRef<number>(0);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const isSwipingRef = useRef<boolean>(false);

  const effectiveTotalWords = words.length;

  const readingAreaRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  
  const [areaDims, setAreaDims] = useState<{ w: number; h: number } | null>(null);

  // Track reading area dimensions
  useEffect(() => {
    if (!readingAreaRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Aggressive sub-pixel rounding to prevent bounce loops
        const w = Math.round(entry.contentRect.width / 10) * 10;
        const h = Math.round(entry.contentRect.height / 10) * 10;
        setAreaDims(prev => {
          if (prev && prev.w === w && prev.h === h) return prev;
          return { w, h };
        });
      }
    });
    observer.observe(readingAreaRef.current);
    return () => observer.disconnect();
  }, []);

  const fontFamilyStr = FONT_FAMILY_CSS[fontFamily];
  const lineHeight = Math.round(fontSize * 1.5);

  const {
    layoutState,
    setLayoutState,
    isPageValid,
    navigateNextPage,
    navigatePrevPage,
  } = useReaderLayout({
    currentIndex,
    isPlaying,
    words,
    sections,
    areaDims,
    fontSize,
    fontFamilyStr,
    lineHeight,
    setCurrentIndex,
  });

  // Find chapter info early so effects can use it
  let activeChapterIdx = -1;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].startIndex <= currentIndex) activeChapterIdx = i;
    else break;
  }
  const chapterLabel = sections[activeChapterIdx]?.label || '';
  const chapterStart = sections[activeChapterIdx]?.startIndex || 0;
  const nextChapterStart = sections[activeChapterIdx + 1]?.startIndex || words.length;

  useLayoutEffect(() => {
    if (isPlaying) return;

    if (layoutState.end !== null) return;
    if (!areaDims || areaDims.w === 0 || areaDims.h === 0) return;
    if (!innerRef.current) return;

    const rect = innerRef.current.getBoundingClientRect();
    const limit = rect.bottom - 64; 

    const spans = innerRef.current.querySelectorAll('span[data-word-idx]');
    if (spans.length === 0) return;

    let firstOverflow = spans.length; 

    for (let i = 0; i < spans.length; i++) {
      const spanRect = spans[i].getBoundingClientRect();
      if (spanRect.height > 0 && spanRect.bottom > limit) {
         firstOverflow = i;
         break;
      }
    }

    if (firstOverflow === 0) {
       firstOverflow = 1;
    }

    // Ensure we do not overflow into the next chapter visually
    const unboundEndIdx = layoutState.start + firstOverflow;
    const endIdx = Math.min(unboundEndIdx, nextChapterStart);
    
    setLayoutState(prev => ({ start: prev.start, end: endIdx }));
  }, [layoutState, currentIndex, areaDims, words, isPlaying, isPageValid, setLayoutState, nextChapterStart]);

  // Progress
  const bookProgress = effectiveTotalWords > 0
    ? Math.min(100, (currentIndex / effectiveTotalWords) * 100)
    : 0;

  const chapterLength = nextChapterStart - chapterStart;
  const chapterProgress = chapterLength > 0
    ? Math.min(100, ((currentIndex - chapterStart) / chapterLength) * 100)
    : 0;

  // pageEndIndex matches layoutState.end exactly because we measure from layoutState.start
  const pageEndIndex = layoutState.end;
  const isMeasuring = pageEndIndex === null;

  // For rendering, we always want to show something; 800 is a safe upper bound for layout.
  const renderEndIndex = pageEndIndex ?? Math.min(words.length, layoutState.start + 800);
  const pageWords = words.slice(layoutState.start, renderEndIndex);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        navigateNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        navigatePrevPage();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateNextPage, navigatePrevPage]);
  // Theme-derived classes
  const mainBg = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const mainText = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
  const borderColor = theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-200 dark:border-zinc-800';
  const mutedText = theme === 'bedtime' ? 'text-stone-600' : 'text-zinc-400 dark:text-zinc-500';
  const itemHover = theme === 'bedtime' ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800';

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
      if (isPlaying) {
        handleSetIsPlaying(false);
        lastPauseTimeRef.current = Date.now();
      }
      setIsHoldPaused(false);
    } else {
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

  const handlePaginatedPointerDown = (e: React.PointerEvent) => {
    if (isPlaying) return;
    swipeStartXRef.current = e.clientX;
    swipeStartYRef.current = e.clientY;
    isSwipingRef.current = false;
  };

  const handlePaginatedPointerUp = (e: React.PointerEvent) => {
    if (isPlaying || swipeStartXRef.current === null || swipeStartYRef.current === null) return;

    const deltaX = e.clientX - swipeStartXRef.current;
    const deltaY = e.clientY - swipeStartYRef.current;

    swipeStartXRef.current = null;
    swipeStartYRef.current = null;

    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      isSwipingRef.current = true;
      if (deltaX > 0) {
        navigatePrevPage();
      } else {
        navigateNextPage();
      }
    }
  };

  const handlePaginatedPointerCancel = () => {
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
  };

  // RSVP Dynamic Font Size
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const idealFontSize = vh * 0.30;
  const { prefix: benchPrefix, suffix: benchSuffix } = splitWord("transportation");
  const benchLeftDensity = (benchPrefix.length + 0.5) / 0.4;
  const benchRightDensity = (benchSuffix.length + 0.5) / 0.6;
  const benchMaxDensity = Math.max(benchLeftDensity, benchRightDensity);
  const baseFittingFontSize = (vw * 0.9) / (0.6 * benchMaxDensity);
  
  const { prefix, focus, suffix } = splitWord(words[currentIndex]?.text || '');
  const currentLeftDensity = (prefix.length + 0.5) / 0.4;
  const currentRightDensity = (suffix.length + 0.5) / 0.6;
  const currentMaxDensity = Math.max(currentLeftDensity, currentRightDensity);
  
  let targetFontSize = Math.min(idealFontSize, baseFittingFontSize);
  if (currentMaxDensity > benchMaxDensity * 1.15) {
    const currentFittingFontSize = (vw * 0.9) / (0.6 * currentMaxDensity);
    targetFontSize = Math.min(targetFontSize, currentFittingFontSize);
  }
  const currentFontSize = isPlaying ? targetFontSize : 48;

  const rsvpFocusColor = theme === 'bedtime' ? 'text-amber-600' : (theme === 'dark' ? 'text-red-500' : 'text-red-600');
  const rsvpContextClass = theme === 'bedtime' ? 'text-stone-600' : 'opacity-90';
  const guidelinesClass = theme === 'bedtime' ? 'bg-amber-900/30' : 'bg-red-600 dark:bg-red-500 opacity-30';


  if (words.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-dvh ${mainBg} ${mainText}`}>
        <div className="animate-pulse flex flex-col items-center">
          <div className={`h-4 w-48 rounded mb-4 ${theme === 'bedtime' ? 'bg-zinc-800' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
          <div className={`h-4 w-32 rounded ${theme === 'bedtime' ? 'bg-zinc-800' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
        </div>
        <button onClick={onCloseBook} className="mt-8 text-sm opacity-50 hover:opacity-100 underline">Cancel</button>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-dvh transition-colors duration-300 ${mainBg} ${mainText} ${!isPlaying ? 'cursor-pointer' : ''}`}
      style={{ fontFamily: fontFamilyStr }}
      data-testid="paginated-reader"
    >
      {/* ── Header bar ─────────────────────────────────────────── */}
      {!isPlaying && (
        <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 ${borderColor}`}>
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log("[PaginatedReaderView] Library button clicked");
                onCloseBook();
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${itemHover} ${mutedText}`}
              title="Return to Library"
            >
              <ChevronLeft size={18} />
              <span className="text-sm font-medium">Library</span>
            </button>

            <span className={`text-xs uppercase tracking-widest font-semibold opacity-40 truncate max-w-[180px]`}>
              {bookTitle}
            </span>
            {chapterLabel && (
              <>
                <span className="opacity-20 text-xs">·</span>
                <span className={`text-xs truncate max-w-[140px] ${mutedText}`}>{chapterLabel}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
              className={`px-2 py-1 text-xs rounded border ${borderColor} ${mutedText} hover:opacity-80 transition-opacity`}
              title="Decrease font size"
            >
              A−
            </button>
            <span className={`text-xs font-mono ${mutedText} w-8 text-center`}>{fontSize}</span>
            <button
              onClick={() => onFontSizeChange(Math.min(64, fontSize + 2))}
              className={`px-2 py-1 text-xs rounded border ${borderColor} ${mutedText} hover:opacity-80 transition-opacity`}
              title="Increase font size"
            >
              A+
            </button>
          </div>
        </div>
      )}

      {/* ── Reading area ───────────────────────────────────────── */}
      <div
        ref={readingAreaRef}
        className={`flex-1 min-h-0 overflow-hidden border-b ${borderColor} relative
          ${isPlaying ? 'flex items-center justify-center' : ''}`}
        data-testid="paginated-reading-area"
        data-is-measuring={isMeasuring}
        onPointerDown={handlePaginatedPointerDown}
        onPointerUp={handlePaginatedPointerUp}
        onPointerCancel={handlePaginatedPointerCancel}
        onClick={() => {
          if (isSwipingRef.current) {
            isSwipingRef.current = false;
            return;
          }
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

        {isPlaying ? (
          <div className="w-full relative" style={{ minHeight: Math.max(120, currentFontSize * 1.5) }}>
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
          </div>
        ) : (
          <div
            ref={innerRef}
            className="h-full w-full px-8 pt-8 pb-16 overflow-hidden"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px`, opacity: 1 }}
          >
            {renderPageWords(pageWords, theme, layoutState.start, currentIndex)}
          </div>
        )}
      </div>

      {/* ── Footer / controls ──────────────────────────────────── */}
      <div className={`shrink-0 px-4 pt-3 pb-8 flex flex-col gap-2`}>
        <div className="flex flex-col gap-1.5">
          {/* Chapter Progress bar */}
          <div
            className={`w-full h-1 rounded-sm relative ${theme === 'bedtime' ? 'bg-zinc-900/50' : 'bg-zinc-200/50 dark:bg-zinc-800/50'}`}
          >
            <div
              className={`h-full rounded-sm transition-all duration-300 ${theme === 'bedtime' ? 'bg-amber-600/60' : 'bg-red-500/50'}`}
              style={{ width: `${chapterProgress}%` }}
            />
          </div>

          {/* Book Progress bar */}
          <div
            className={`w-full h-1 rounded-sm relative ${theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-200 dark:bg-zinc-800'}`}
          >
            <div
              className={`h-full rounded-sm transition-all duration-300 ${theme === 'bedtime' ? 'bg-stone-500' : 'bg-zinc-900 dark:bg-zinc-100'}`}
              style={{ width: `${bookProgress}%` }}
            />
            {furthestIndex !== null && furthestIndex > currentIndex && (
              <div
                className={`absolute top-0 bottom-0 w-0.5 opacity-40 ${theme === 'bedtime' ? 'bg-stone-400' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                style={{ left: `${Math.min(100, (furthestIndex / effectiveTotalWords) * 100)}%` }}
                title="Furthest read"
              />
            )}
            {realEndIndex && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500/30"
                style={{ left: `${(realEndIndex / words.length) * 100}%` }}
                title="Real end of book"
              />
            )}
          </div>
        </div>

        {/* Navigation row */}
        {!isPlaying && (
          <div className="flex items-center justify-between">
            <button
              onClick={navigatePrevPage}
              disabled={currentIndex === 0}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all
                ${currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-80 active:scale-95'}
                ${borderColor}`}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
              Prev
            </button>

            <div className={`flex flex-col items-center text-xs ${mutedText}`}>
              <span>{Math.round(bookProgress)}%</span>
              <span className="opacity-60">p.{Math.floor(currentIndex / 300) + 1}</span>
            </div>

            <div className="flex items-center gap-2">
              <ReaderMenu
                activeChapterIdx={activeChapterIdx}
                onCloseBook={onCloseBook}
                onReadChapter={onReadChapter}
                navigate={navigate}
                fabClassName={`p-2 rounded-lg border transition-all ${theme === 'bedtime' ? 'bg-zinc-900 border-zinc-800 text-stone-400 hover:bg-zinc-800' : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
              />

              <button
                onClick={navigateNextPage}
                disabled={isMeasuring || (pageEndIndex !== null && pageEndIndex >= words.length)}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all
                  ${(isMeasuring || (pageEndIndex !== null && pageEndIndex >= words.length)) ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-80 active:scale-95'}
                  ${borderColor}`}
                aria-label="Next page"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderPageWords(
  pageWords: WordData[],
  theme: Theme,
  pageStartIndex: number,
  highlightIndex?: number
) {
  if (pageWords.length === 0) return null;

  // Group words into paragraphs
  const paragraphs: { word: WordData; globalIdx: number }[][] = [];
  let current: { word: WordData; globalIdx: number }[] = [];
  let currentGlobalIdx = pageStartIndex;

  for (const word of pageWords) {
    if (word.isParagraphStart && current.length > 0) {
      paragraphs.push(current);
      current = [];
    }
    current.push({ word, globalIdx: currentGlobalIdx++ });
  }
  if (current.length > 0) paragraphs.push(current);

  const paraTextColor = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-800 dark:text-zinc-200';

  return (
    <>
      {paragraphs.map((para, pIdx) => {
        const isHeading = para.some(({ word }) => word.isHeading);
        const isDivider = para.length === 1 && para[0].word.isDivider;

        if (isDivider) {
          const { globalIdx } = para[0];
          const isHighlighted = globalIdx === highlightIndex;
          return (
            <div key={pIdx} className="w-full flex justify-center my-8 opacity-40">
              <span 
                data-word-idx={globalIdx}
                className={`tracking-[0.5em] ${isHighlighted ? 'underline decoration-red-500/50 dark:decoration-red-400/50 decoration-2 underline-offset-4' : ''}`}
              >
                * * *
              </span>
            </div>
          );
        }

        return (
          <p
            key={pIdx}
            className={`mb-[1em] leading-[inherit] ${paraTextColor} ${isHeading ? 'text-[1.5em] font-bold' : ''}`}
            style={{ margin: 0, marginBottom: '1em' }}
          >
            {para.map(({ word, globalIdx }, wIdx) => {
              const isHighlighted = globalIdx === highlightIndex;
            return (
              <span 
                key={globalIdx} 
                data-word-idx={globalIdx}
                className={isHighlighted ? 'underline decoration-red-500/50 dark:decoration-red-400/50 decoration-2 underline-offset-4' : ''}
              >
                {wIdx > 0 ? ' ' : ''}{word.text}
              </span>
            );
          })}
        </p>
        );
      })}
    </>
  );
}
