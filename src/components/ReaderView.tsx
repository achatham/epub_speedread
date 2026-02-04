import { Minus, Moon, Pause, Play, Plus, Settings, Settings2, SkipBack, Sparkles, Sun, Sunset, Volume2, Loader2, Square } from 'lucide-react';
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
  onDeleteBook: () => void;
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
  onDeleteBook,
  isNavOpen,
  toggleNav,
  isTocOpen,
  toggleToc,
  isAskAiOpen,
  onReadChapter,
  isReadingAloud,
  isSynthesizing,
  isChapterBreak,
  upcomingChapterTitle
}: ReaderViewProps) {
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
  // This prevents the font from constantly resizing for every word
  const { prefix: benchPrefix, suffix: benchSuffix } = splitWord("transportation");
  
  // Calculate density required for each side based on 40/60 split
  // Left side gets 40% width, Right side gets 60% width
  const benchLeftDensity = (benchPrefix.length + 0.5) / 0.4;
  const benchRightDensity = (benchSuffix.length + 0.5) / 0.6;
  const benchMaxDensity = Math.max(benchLeftDensity, benchRightDensity);

  // Divisor 0.6 assumes an average character width of ~0.6em (typical for sans-serif)
  // This allows the text to be larger while still fitting
  const baseFittingFontSize = (vw * 0.9) / (0.6 * benchMaxDensity);

  const currentLeftDensity = (prefix.length + 0.5) / 0.4;
  const currentRightDensity = (suffix.length + 0.5) / 0.6;
  const currentMaxDensity = Math.max(currentLeftDensity, currentRightDensity);
  
  // Start with the stable size (min of ideal and benchmark fit)
  let targetFontSize = Math.min(idealFontSize, baseFittingFontSize);

  // Only shrink further if the current word is wider than the benchmark
  // Add a small buffer (1.15x) to prevent jitter for words just slightly larger
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

    const percentage = Math.round(((currentIndex + 1) / words.length) * 100);
    
    const nextChapterStartIndex = sections[activeChapterIdx + 1]?.startIndex || words.length;
    const wordsLeftInChapter = nextChapterStartIndex - currentIndex;
    const wordsLeftInBook = words.length - currentIndex;
    
    // Heuristic: +20% for punctuation/pauses
    const effectiveWpm = wpm / 1.2; 
    
    const formatDuration = (wordCount: number) => {
        const minutes = wordCount / effectiveWpm;
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        const s = Math.floor((minutes * 60) % 60);
        
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    return (
        <div className={`mt-4 text-xs space-y-1 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            <div className="flex gap-4 justify-center">
                <span>{percentage}% Complete</span>
                <span>•</span>
                <span>Page {Math.floor(currentIndex / 300) + 1} of {Math.ceil(words.length / 300)}</span>
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
      className={`flex flex-col items-center justify-center h-screen transition-colors duration-300 relative ${mainBg} ${mainText}`}
      style={{ fontFamily: fontStyles[fontFamily] }}
    >
      {isPlaying && (
        <div 
          className="fixed inset-0 z-40 bg-transparent cursor-pointer"
          onClick={() => setIsPlaying(false)}
          title="Click to pause"
        />
      )}
      
      {!isPlaying && (
        <div className="absolute top-8 text-center w-full px-4">
          <h3 className="m-0 font-normal opacity-60 text-lg truncate max-w-2xl mx-auto">{bookTitle}</h3>
          <p className="my-2 text-sm opacity-40">
            {currentIndex + 1} / {effectiveTotalWords} words
            {realEndIndex && currentIndex >= realEndIndex && " (Back Matter)"}
          </p>
          {getProgressStats()}
        </div>
      )}

      {!isPlaying && (
        <div className="absolute top-4 right-4 flex gap-2 z-10">
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
      <div className={`relative flex items-center justify-center w-full ${isPlaying ? '' : 'max-w-2xl'} border-t border-b my-8 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-200 dark:border-zinc-800'}`} style={{ minHeight: isPlaying ? Math.max(120, currentFontSize * 1.5) : '120px' }}>
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
          <div className={`text-xl leading-relaxed text-center px-8 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            {words.slice(currentIndex, currentIndex + 15).map(w => w.text).join(' ')}...
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-6 items-center w-full max-w-md px-4 relative z-50">
        <div className="w-full space-y-3">
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
          <div className="flex gap-4 items-center">
            {/* Navigation Menu */}
            <div className="relative">
              <button
                className={`bg-transparent border p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'border-zinc-800 text-stone-400 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100'} ${isNavOpen ? (theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800') : ''}`}
                onClick={toggleNav}
              >
                <SkipBack size={20} />
              </button>
              {isNavOpen && (
                <div className={`absolute bottom-14 left-0 w-64 border rounded-lg shadow-xl z-50 flex flex-col p-1 overflow-hidden ${theme === 'bedtime' ? 'bg-black border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`}>
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
                  <div className={`border-t my-1 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-100 dark:border-zinc-800'}`}></div>
                  <button 
                    onClick={() => {
                        if (confirm('Are you sure you want to delete this book?')) {
                            onDeleteBook();
                        }
                    }} 
                    className={`text-left px-3 py-2 text-sm rounded font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}
                  >
                    Delete Book
                  </button>
                </div>
              )}
            </div>

            <button
              className={`border-none p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'bg-stone-800 text-stone-200 hover:bg-stone-700' : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200'}`}
              onClick={() => setIsPlaying(!isPlaying)}
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
                <div className={`absolute bottom-14 right-0 w-80 max-h-[60vh] overflow-y-auto border rounded-lg shadow-xl z-50 flex flex-col p-2 gap-1 ${theme === 'bedtime' ? 'bg-black border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`}>
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
          <div className={`flex items-center justify-between w-full ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
            <span className="text-sm font-medium opacity-70 uppercase tracking-wider">Speed</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onWpmChange(Math.max(100, wpm - 25))}
                className={`p-2 rounded-lg border transition-colors ${theme === 'bedtime' ? 'border-zinc-800 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                title="Decrease Speed"
              >
                <Minus size={20} />
              </button>
              <div className="flex flex-col items-center min-w-[4rem]">
                <span className="text-xl font-bold">{wpm}</span>
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
        <button
          className="absolute bottom-8 opacity-30 hover:opacity-60 transition-opacity background-none border-none cursor-pointer text-inherit"
          onClick={onCloseBook}
        >
          Close Book
        </button>
      )}
    </div>
  );
}