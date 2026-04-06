import { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';
import { ReaderMenu } from './ReaderMenu';
import type { WordData } from '../utils/text-processing';
import { type Theme, type FontFamily, type ReadingMode } from '../hooks/useSettings';
import type { NavigationType } from '../utils/navigation';

interface PaginatedReaderViewProps {
  words: WordData[];
  currentIndex: number;
  effectiveTotalWords: number;
  realEndIndex: number | null;
  furthestIndex: number | null;
  setCurrentIndex: (index: number) => void;
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
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
}

const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  system: 'ui-sans-serif, system-ui, sans-serif',
  serif: '"Georgia", "Times New Roman", serif',
  mono: 'ui-monospace, "Courier New", monospace',
  opendyslexic: 'OpenDyslexic, sans-serif',
  atkinson: 'AtkinsonHyperlegible, sans-serif',
};

/** Use pretext to compute the end index of words that fit in the reading area. */
function computePageEndIndex(
  words: WordData[],
  startIndex: number,
  areaWidth: number,
  areaHeight: number,
  fontSize: number,
  fontFamilyStr: string,
): number {
  if (areaWidth <= 0 || areaHeight <= 0 || startIndex >= words.length) {
    return Math.min(startIndex + 1, words.length);
  }

  // Take a generous chunk — pretext is fast once fonts are cached
  const chunkSize = Math.min(800, words.length - startIndex);
  const chunk = words.slice(startIndex, startIndex + chunkSize);

  // Build text, inserting double newlines at paragraph starts
  let text = '';
  for (let i = 0; i < chunk.length; i++) {
    if (i > 0 && chunk[i].isParagraphStart) {
      text += '\n\n';
    } else if (i > 0) {
      text += ' ';
    }
    text += chunk[i].text;
  }

  const lineHeight = Math.round(fontSize * 1.5);
  const fontStr = `${fontSize}px ${fontFamilyStr}`;

  const prepared = prepareWithSegments(text, fontStr);
  const { lines } = layoutWithLines(prepared, areaWidth, lineHeight);

  let accHeight = 0;
  let accWords = 0;

  for (const line of lines) {
    const nextHeight = accHeight + lineHeight;
    if (nextHeight > areaHeight) break;
    accHeight = nextHeight;
    const lineText = line.text.trim();
    if (lineText.length > 0) {
      // Count words in this line
      accWords += lineText.split(/\s+/).length;
    }
  }

  // Ensure we advance at least 1 word so we never get stuck
  const pageWords = Math.max(1, accWords);
  return Math.min(startIndex + pageWords, words.length);
}

export function PaginatedReaderView({
  words,
  currentIndex,
  effectiveTotalWords,
  realEndIndex,
  furthestIndex,
  setCurrentIndex,
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
  fontSize,
  onFontSizeChange,
  readingMode,
  onReadingModeChange,
}: PaginatedReaderViewProps) {
  const readingAreaRef = useRef<HTMLDivElement>(null);
  const [pageEndIndex, setPageEndIndex] = useState<number>(currentIndex + 1);
  const [areaDims, setAreaDims] = useState<{ w: number; h: number } | null>(null);

  // Track reading area dimensions
  useEffect(() => {
    const el = readingAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setAreaDims({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fontFamilyStr = FONT_FAMILY_CSS[fontFamily];

  // Recompute page end when relevant inputs change
  useEffect(() => {
    if (!areaDims || areaDims.w <= 0 || areaDims.h <= 0) return;
    const PADDING = 32; // px, matches the px-4 / px-8 padding in reading area
    const end = computePageEndIndex(
      words,
      currentIndex,
      areaDims.w - PADDING * 2,
      areaDims.h - PADDING * 2,
      fontSize,
      fontFamilyStr,
    );
    setPageEndIndex(end);
  }, [words, currentIndex, areaDims, fontSize, fontFamilyStr]);

  // Find chapter info
  let activeChapterIdx = -1;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].startIndex <= currentIndex) activeChapterIdx = i;
    else break;
  }
  const chapterLabel = sections[activeChapterIdx]?.label || '';

  // Progress
  const bookProgress = effectiveTotalWords > 0
    ? Math.min(100, (currentIndex / effectiveTotalWords) * 100)
    : 0;

  const pageWords = words.slice(currentIndex, pageEndIndex);

  const handleNextPage = useCallback(() => {
    if (pageEndIndex < words.length) {
      setCurrentIndex(pageEndIndex);
    }
  }, [pageEndIndex, words.length, setCurrentIndex]);

  const handlePrevPage = useCallback(() => {
    if (currentIndex === 0) return;
    const chapterStart = sections[activeChapterIdx]?.startIndex ?? 0;
    if (!areaDims || areaDims.w <= 0 || areaDims.h <= 0) {
      setCurrentIndex(Math.max(chapterStart, currentIndex - 1));
      return;
    }
    const pageSize = pageEndIndex - currentIndex;
    const prevStart = Math.max(0, currentIndex - pageSize);
    // Snap to chapter start if we'd be within half a page of it
    const target = prevStart <= chapterStart + Math.floor(pageSize / 2)
      ? chapterStart
      : prevStart;
    setCurrentIndex(target);
  }, [currentIndex, pageEndIndex, areaDims, sections, activeChapterIdx, setCurrentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevPage();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNextPage, handlePrevPage]);

  // Theme-derived classes
  const mainBg = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const mainText = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
  const borderColor = theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-200 dark:border-zinc-800';
  const mutedText = theme === 'bedtime' ? 'text-stone-600' : 'text-zinc-400 dark:text-zinc-500';

  const lineHeight = Math.round(fontSize * 1.5);

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
      className={`flex flex-col h-dvh transition-colors duration-300 ${mainBg} ${mainText}`}
      style={{ fontFamily: fontFamilyStr }}
      data-testid="paginated-reader"
    >
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 ${borderColor}`}>
        <div className="flex items-center gap-2 min-w-0">
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
          {/* Font size controls */}
          <button
            onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
            className={`px-2 py-1 text-xs rounded border ${borderColor} ${mutedText} hover:opacity-80 transition-opacity`}
            title="Decrease font size"
            aria-label="Decrease font size"
          >
            A−
          </button>
          <span className={`text-xs font-mono ${mutedText} w-8 text-center`}>{fontSize}</span>
          <button
            onClick={() => onFontSizeChange(Math.min(64, fontSize + 2))}
            className={`px-2 py-1 text-xs rounded border ${borderColor} ${mutedText} hover:opacity-80 transition-opacity`}
            title="Increase font size"
            aria-label="Increase font size"
          >
            A+
          </button>
        </div>
      </div>

      {/* ── Reading area ───────────────────────────────────────── */}
      <div
        ref={readingAreaRef}
        className={`flex-1 overflow-hidden border-b ${borderColor} relative`}
        data-testid="paginated-reading-area"
      >
        <div
          className="h-full w-full px-8 py-8 overflow-hidden"
          style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
        >
          {renderPageWords(pageWords, theme)}
        </div>
      </div>

      {/* ── Debug bar ─────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-1 text-xs font-mono opacity-60 bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100">
        idx {currentIndex}–{pageEndIndex - 1} ({pageEndIndex - currentIndex} words)
        {' | '}area {areaDims ? `${areaDims.w}×${areaDims.h}` : '?'}
        {' | '}start: "{words[currentIndex]?.text ?? '—'}"
        {' | '}end: "{words[pageEndIndex - 1]?.text ?? '—'}"
      </div>

      {/* ── Footer / controls ──────────────────────────────────── */}
      <div className={`shrink-0 px-4 pt-3 pb-8 flex flex-col gap-2`}>
        {/* Progress bar */}
        <div
          className={`w-full h-1 rounded-sm relative cursor-pointer ${theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-200 dark:bg-zinc-800'}`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            setCurrentIndex(Math.floor(pct * words.length));
          }}
          title="Click to jump"
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

        {/* Navigation row */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevPage}
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
              readingMode={readingMode}
              onReadingModeChange={onReadingModeChange}
              fabClassName={`p-2 rounded-lg border transition-all ${theme === 'bedtime' ? 'bg-zinc-900 border-zinc-800 text-stone-400 hover:bg-zinc-800' : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
            />

            <button
              onClick={handleNextPage}
              disabled={pageEndIndex >= words.length}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all
                ${pageEndIndex >= words.length ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-80 active:scale-95'}
                ${borderColor}`}
              aria-label="Next page"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderPageWords(
  pageWords: WordData[],
  theme: Theme,
) {
  if (pageWords.length === 0) return null;

  // Group words into paragraphs
  const paragraphs: WordData[][] = [];
  let current: WordData[] = [];

  for (const word of pageWords) {
    if (word.isParagraphStart && current.length > 0) {
      paragraphs.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length > 0) paragraphs.push(current);

  const paraTextColor = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-800 dark:text-zinc-200';

  return (
    <>
      {paragraphs.map((para, pIdx) => (
        <p
          key={pIdx}
          className={`mb-[1em] leading-[inherit] ${paraTextColor}`}
          style={{ margin: 0, marginBottom: '1em' }}
        >
          {para.map((word, wIdx) => (
            <span key={wIdx}>
              {wIdx > 0 ? ' ' : ''}{word.text}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}
