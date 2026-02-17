import { useRef } from 'react';
import { ReaderMenu } from './ReaderMenu';
import type { WordData } from '../utils/text-processing';
import { splitWord } from '../utils/orp';
import type { FontFamily } from './SettingsModal';
import type { RsvpSettings } from '../utils/storage';

type Theme = 'light' | 'dark' | 'bedtime';

interface ReaderViewProps {
  words: WordData[];
  currentIndex: number;
  effectiveTotalWords: number;
  realEndIndex: number | null;
  furthestIndex: number | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setIsHoldPaused: (paused: boolean) => void;
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
  onReadChapter: () => void;
  isReadingAloud: boolean;
  isSynthesizing: boolean;
  isChapterBreak: boolean;
  upcomingChapterTitle: string;
  onStatsClick?: () => void;
  vanityWpmRatio: number;
  rsvpSettings: RsvpSettings;
}

export function ReaderView({
  words,
  currentIndex,
  effectiveTotalWords,
  realEndIndex,
  furthestIndex,
  isPlaying,
  setIsPlaying,
  setIsHoldPaused,
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
  onReadChapter,
  isReadingAloud,
  isSynthesizing,
  isChapterBreak,
  upcomingChapterTitle,
  onStatsClick,
  vanityWpmRatio,
  rsvpSettings
}: ReaderViewProps) {
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

  const pressStartTimeRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pressStartTimeRef.current = Date.now();
    setIsHoldPaused(true);
  };

  const handlePointerUp = () => {
    if (pressStartTimeRef.current === null) return;

    const duration = Date.now() - pressStartTimeRef.current;
    pressStartTimeRef.current = null;

    if (duration < 300) {
      // Short tap: full pause
      setIsPlaying(false);
      setIsHoldPaused(false);
    } else {
      // Long press: resume
      setIsHoldPaused(false);
    }
  };

  const handlePointerCancel = () => {
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
        <div className={`mt-4 text-xs space-y-1 landscape:mt-1 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            <div className="flex gap-4 justify-center landscape:justify-start">
                <span>{percentage}% Complete</span>
                <span>•</span>
                <span>Page {Math.floor(currentIndex / 300) + 1} of {Math.ceil(effectiveTotalWords / 300)}</span>
                <span className="hidden landscape:inline opacity-40">•</span>
                <span className="hidden landscape:inline font-mono opacity-80">{formatDuration(wordsLeftInBook)} left</span>
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
      className={`flex flex-col items-center justify-center h-dvh transition-colors duration-300 relative ${mainBg} ${mainText} ${!isPlaying ? 'cursor-pointer' : ''}`}
      style={{ fontFamily: fontStyles[fontFamily] }}
      onClick={() => { if (!isPlaying) setIsPlaying(true); }}
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
      
      {!isPlaying && (
        <div className="absolute top-8 text-center w-full px-4 landscape:top-4 landscape:left-8 landscape:text-left landscape:w-auto landscape:px-0 z-20" onClick={(e) => e.stopPropagation()}>
          <h3 className="m-0 font-normal opacity-60 text-lg truncate max-w-2xl mx-auto landscape:mx-0 landscape:max-w-md">{bookTitle}</h3>
          {getProgressStats()}
        </div>
      )}


      {/* RSVP Display or Text Preview */}
      <div className={`relative flex items-center justify-center w-full overflow-hidden ${isPlaying ? '' : 'max-w-2xl landscape:max-w-none landscape:my-2 flex-1 landscape:mx-8'} border-t border-b my-8 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-200 dark:border-zinc-800'}`} style={{ minHeight: isPlaying ? Math.max(120, currentFontSize * 1.5) : '120px' }}>
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
          <div className={`text-xl leading-relaxed text-center px-8 landscape:text-base landscape:leading-snug ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'} max-h-full overflow-hidden flex items-center justify-center`}>
            <div>
              {(() => {
                const half = Math.floor(rsvpSettings.previewWordCount / 2);
                const start = Math.max(chapterStart, currentIndex - half);
                const end = Math.min(words.length, currentIndex + half);

                const before = words.slice(start, currentIndex);
                const current = words[currentIndex];
                const after = words.slice(currentIndex + 1, end);

                return (
                  <>
                    {start > chapterStart && <span className="opacity-30">... </span>}
                    {before.map((w, i) => (
                      <span key={`before-${i}`}>{w.text} </span>
                    ))}
                    <span className={`font-bold ${theme === 'bedtime' ? 'text-amber-600' : 'text-zinc-900 dark:text-zinc-100 underline decoration-red-500/50'}`}>
                      {current?.text}
                    </span>
                    {after.map((w, i) => (
                      <span key={`after-${i}`}> {w.text}</span>
                    ))}
                    {end < words.length && <span className="opacity-30"> ...</span>}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className={`flex flex-col gap-6 items-center relative z-50
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
            wpm={wpm}
            onWpmChange={onWpmChange}
            onSettingsClick={onSettingsClick}
            onBookSettingsClick={onBookSettingsClick}
            onStatsClick={onStatsClick || (() => {})}
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
