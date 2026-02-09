import { useEffect, useRef } from 'react';
import { Minus, Moon, Pause, Play, Plus, Settings, Settings2, SkipBack, Sparkles, Sun, Sunset, Volume2, Loader2, Square, BarChart2 } from 'lucide-react';
import type { WordData } from '../utils/text-processing';
import { splitWord } from '../utils/orp';
import type { FontFamily } from './SettingsModal';

type Theme = 'light' | 'dark' | 'bedtime';

interface ReaderViewProps {
  words: WordData[];
  currentIndex: number;
  effectiveTotalWords: number;
  realEndIndex: number | null;
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
  sections,
  setCurrentIndex,
  navigate,
  isNavOpen,
  toggleNav,
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

  useEffect(() => {
    if (isTocOpen && activeChapterRef.current) {
      activeChapterRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isTocOpen]);

  if (words.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-screen ${theme === 'bedtime' ? 'bg-black text-stone-400' : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'}`}>
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
    const effectiveWpm = wpm / (vanityWpmRatio / 1.04);
    
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
        <div className={`mt-4 text-xs space-y-1 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            <div className="flex gap-4 justify-center">
                <span>{percentage}% Complete</span>
                <span>•</span>
                <span>Page {Math.floor(currentIndex / 300) + 1} of {Math.ceil(effectiveTotalWords / 300)}</span>
            </div>
            <div className="flex gap-4 justify-center font-mono opacity-80">
                <span>Chapter: {formatDuration(wordsLeftInChapter)} left</span>
                <span>Book: {formatDuration(wordsLeftInBook)} left</span>
            </div>
        </div>
    );
  };
  
  return (
    <div 
      className={`flex flex-col items-center justify-center h-screen transition-colors duration-300 relative ${mainBg} ${mainText} ${!isPlaying ? 'cursor-pointer landscape:flex-row landscape:items-stretch landscape:justify-start' : ''}`}
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
          <div className="landscape:hidden">
            {getProgressStats()}
          </div>
        </div>
      )}

      {!isPlaying && (
        <div className="absolute top-4 right-4 flex gap-2 z-20 landscape:top-2 landscape:right-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onStatsClick}
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Reading Stats"
          >
            <BarChart2 size={24} />
          </button>
          <button
            onClick={onSettingsClick}
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Settings"
          >
            <Settings size={24} />
          </button>
          <button
              onClick={onToggleTheme}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={`Theme: ${theme}`}
          >
              {theme === 'light' ? <Sun size={24} /> : theme === 'dark' ? <Moon size={24} /> : <Sunset size={24} className="text-amber-600" />}
          </button>
        </div>
      )}

      {/* RSVP Display or Text Preview */}
      <div className={`relative flex items-center justify-center w-full ${isPlaying ? '' : 'max-w-2xl landscape:max-w-none landscape:my-2 landscape:flex-1 landscape:mx-12'} border-t border-b my-8 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-200 dark:border-zinc-800'}`} style={{ minHeight: isPlaying ? Math.max(120, currentFontSize * 1.5) : '120px' }}>
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
          <div className={`text-xl leading-relaxed text-center px-8 landscape:text-base landscape:leading-snug ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            {words.slice(currentIndex, currentIndex + 30).map(w => w.text).join(' ')}...
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className={`flex flex-col gap-6 items-center relative z-50
          ${isPlaying ? 'w-full max-w-md px-4' : 'landscape:fixed landscape:left-0 landscape:top-0 landscape:bottom-0 landscape:w-24 landscape:max-w-[96px] landscape:bg-white landscape:dark:bg-zinc-900 landscape:border-r landscape:border-zinc-200 landscape:dark:border-zinc-800 landscape:justify-center landscape:gap-4 landscape:px-2 portrait:w-full portrait:max-w-md portrait:px-4 landscape:pointer-events-none'}
          ${!isPlaying && theme === 'bedtime' ? 'landscape:bg-black landscape:border-zinc-900' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-full space-y-3 landscape:pointer-events-auto ${!isPlaying ? 'landscape:fixed landscape:bottom-4 landscape:left-28 landscape:right-64 landscape:w-auto landscape:space-y-1' : ''}`}>
          {/* Chapter Progress */}
          <div
            className={`w-full h-1 rounded-sm relative ${theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-200 dark:bg-zinc-800'}`}
          >
            <div
              className={`h-full rounded-sm transition-all duration-300 ${theme === 'bedtime' ? 'bg-amber-700' : 'bg-zinc-400 dark:bg-zinc-600'}`}
              style={{ width: `${Math.min(100, chapterPercentage)}%` }}
            />
            {isPlaying && (
              <div className="absolute -top-5 left-0 text-[10px] uppercase tracking-tighter opacity-30 font-bold">Chapter Progress</div>
            )}
          </div>

          {/* Book Progress */}
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
            {realEndIndex && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500/30"
                style={{ left: `${(realEndIndex / words.length) * 100}%` }}
                title="Real End of Book"
              />
            )}
            <div className="absolute inset-y-0 -left-2 -right-2 bg-transparent opacity-0 group-hover:opacity-100 cursor-pointer" />
            {isPlaying && (
              <div className="absolute -top-5 right-0 text-[10px] uppercase tracking-tighter opacity-30 font-bold">Book Progress</div>
            )}
          </div>
        </div>

        {!isPlaying && (
          <div className="flex gap-4 items-center landscape:flex-col landscape:gap-4 landscape:pointer-events-auto">
            {/* Navigation Menu */}
            <div className="relative">
              <button
                className={`bg-transparent border p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'border-zinc-800 text-stone-400 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'} ${isNavOpen ? (theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800') : ''}`}
                onClick={toggleNav}
              >
                <SkipBack size={20} />
              </button>
              {isNavOpen && (
                <div className={`absolute bottom-full mb-2 left-0 w-64 border rounded-lg shadow-xl z-50 flex flex-col p-1 overflow-y-auto max-h-[70vh] landscape:bottom-auto landscape:left-full landscape:ml-2 landscape:top-0 ${theme === 'bedtime' ? 'bg-black border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`}>
                  <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b mb-1 ${theme === 'bedtime' ? 'text-stone-600 border-zinc-900' : 'text-zinc-500 dark:text-zinc-400 border-zinc-100 dark:border-zinc-800'}`}>
                    Navigate
                  </div>
                  <button onClick={() => navigate('prev-paragraph')} className={`text-left px-3 py-2 text-sm rounded flex justify-between items-center group ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                    <span>Previous Paragraph</span>
                    <span className="opacity-50 text-xs group-hover:opacity-100">Paragraph</span>
                  </button>
                  <button onClick={() => navigate('prev-sentence')} className={`text-left px-3 py-2 text-sm rounded flex justify-between items-center group ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                    <span>Previous Sentence</span>
                    <span className="opacity-50 text-xs group-hover:opacity-100">Sentence</span>
                  </button>
                  <div className={`border-t my-1 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-100 dark:border-zinc-800'}`}></div>
                  <button onClick={() => navigate('next-sentence')} className={`text-left px-3 py-2 text-sm rounded flex justify-between items-center ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                    <span>Next Sentence</span>
                  </button>
                  <button onClick={() => navigate('next-paragraph')} className={`text-left px-3 py-2 text-sm rounded flex justify-between items-center ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                    <span>Next Paragraph</span>
                  </button>
                  <div className={`border-t my-1 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-100 dark:border-zinc-800'}`}></div>
                  <button onClick={() => navigate('chapter')} className={`text-left px-3 py-2 text-sm rounded ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                    Restart Chapter
                  </button>
                  <button onClick={() => navigate('book')} className={`text-left px-3 py-2 text-sm rounded font-semibold ${theme === 'bedtime' ? 'text-amber-700 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-red-600 dark:text-red-400'}`}>
                    Restart Book
                  </button>
                </div>
              )}
            </div>

            <button
              className={`border-none p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'bg-stone-800 text-stone-200 hover:bg-stone-700' : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200'}`}
              onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            <button
              className={`bg-transparent border p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'border-zinc-800 text-stone-400 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'} ${(isReadingAloud || isSynthesizing) ? (theme === 'bedtime' ? 'bg-zinc-900 text-amber-600' : 'bg-zinc-100 dark:bg-zinc-800 text-red-600 dark:text-red-400') : ''}`}
              onClick={onReadChapter}
              title={isReadingAloud ? "Stop reading chapter" : isSynthesizing ? "Synthesizing..." : "Read chapter aloud"}
              disabled={isSynthesizing && !isReadingAloud}
            >
              {isSynthesizing ? <Loader2 size={20} className="animate-spin" /> : isReadingAloud ? <Square size={20} fill="currentColor" /> : <Volume2 size={20} />}
            </button>

            <button
              className={`bg-transparent border p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'border-zinc-800 text-stone-400 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'} ${isAskAiOpen ? (theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800') : ''} ${!onAskAiClick ? 'hidden' : ''}`}
              onClick={onAskAiClick}
              title="Ask AI about book"
            >
              <Sparkles size={20} />
            </button>

            <div className="relative">
              <button
                className={`bg-transparent border p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'border-zinc-800 text-stone-400 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'} ${isTocOpen ? (theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800') : ''}`}
                onClick={toggleToc}
              >
                <Settings2 size={20} />
              </button>

              {isTocOpen && (
                <div className={`absolute bottom-full mb-2 right-0 w-80 max-h-[70vh] overflow-y-auto border rounded-lg shadow-xl z-50 flex flex-col p-2 gap-1 landscape:bottom-auto landscape:left-full landscape:ml-2 landscape:top-0 ${theme === 'bedtime' ? 'bg-black border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`}>
                  <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b mb-1 sticky top-0 z-10 ${theme === 'bedtime' ? 'text-stone-600 border-zinc-900 bg-black' : 'text-zinc-500 dark:text-zinc-400 border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900'}`}>
                    Table of Contents
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
                          className={`text-left px-3 py-2.5 text-sm rounded-md transition-colors leading-normal ${isCurrent
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
              )}
            </div>
          </div>
        )}

        {!isPlaying && (
          <div className={`flex items-center justify-between w-full landscape:flex-col landscape:gap-4 landscape:pointer-events-auto ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
            <span className="text-sm font-medium opacity-70 uppercase tracking-wider landscape:hidden">Speed</span>
            <div className="flex items-center gap-3 landscape:flex-col-reverse landscape:gap-2">
              <button
                onClick={() => onWpmChange(Math.max(100, wpm - 25))}
                className={`p-2 rounded-lg border transition-colors ${theme === 'bedtime' ? 'border-zinc-800 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                title="Decrease Speed"
              >
                <Minus size={20} />
              </button>
              <div className="flex flex-col items-center min-w-[3rem]">
                <span className="text-xl font-bold landscape:text-lg">{wpm}</span>
                <span className="text-[10px] opacity-40 font-semibold uppercase">WPM</span>
              </div>
              <button
                onClick={() => onWpmChange(Math.min(1200, wpm + 25))}
                className={`p-2 rounded-lg border transition-colors ${theme === 'bedtime' ? 'border-zinc-800 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                title="Increase Speed"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {!isPlaying && (
        <div className="hidden landscape:flex fixed bottom-6 right-6 z-50 flex-col items-end pointer-events-none" onClick={(e) => e.stopPropagation()}>
          <div className={`px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow-sm max-w-[200px] ${theme === 'bedtime' ? 'border-zinc-900 bg-black/80' : ''}`}>
            <p className="text-[10px] uppercase tracking-widest opacity-40 font-bold mb-0.5">Chapter</p>
            <p className="text-xs font-medium truncate">{sections[activeChapterIdx]?.label || 'No Chapter'}</p>
          </div>
        </div>
      )}

      {!isPlaying && (
        <button
          className="absolute bottom-8 landscape:bottom-auto landscape:top-4 landscape:right-48 opacity-30 hover:opacity-60 transition-opacity background-none border-none cursor-pointer text-inherit text-sm"
          onClick={(e) => { e.stopPropagation(); onCloseBook(); }}
        >
          Close Book
        </button>
      )}
    </div>
  );
}
