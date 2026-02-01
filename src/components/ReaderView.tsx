import { Moon, Pause, Play, Settings, Settings2, SkipBack, Sparkles, Sun, Sunset } from 'lucide-react';
import type { WordData } from '../utils/text-processing';
import { splitWord } from '../utils/orp';

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
  isAskAiOpen
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

  // Theme-derived classes
  const mainBg = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const mainText = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
  
  const rsvpFocusColor = theme === 'bedtime' ? 'text-amber-600' : (theme === 'dark' ? 'text-red-500' : 'text-red-600');
  const rsvpContextClass = theme === 'bedtime' ? 'text-stone-600' : 'opacity-90';
  const guidelinesClass = theme === 'bedtime' ? 'bg-amber-900/30' : 'bg-red-600 dark:bg-red-500 opacity-30';

  // Progress Calculations
  const getProgressStats = () => {
    if (isPlaying || words.length === 0) return null;

    const percentage = Math.round(((currentIndex + 1) / words.length) * 100);
    
    // Find current chapter
    let currentChapterIdx = -1;
    for (let i = 0; i < sections.length; i++) {
        if (sections[i].startIndex <= currentIndex) {
            currentChapterIdx = i;
        } else {
            break;
        }
    }
    
    const nextChapterStartIndex = sections[currentChapterIdx + 1]?.startIndex || words.length;
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
    <div className={`flex flex-col items-center justify-center h-screen font-sans transition-colors duration-300 relative ${mainBg} ${mainText}`}>
      {isPlaying && (
        <div 
          className="fixed inset-0 z-40 bg-transparent cursor-pointer"
          onClick={() => setIsPlaying(false)}
          title="Click to pause"
        />
      )}
      
      <div className="absolute top-8 text-center w-full px-4">
        <h3 className="m-0 font-normal opacity-60 text-lg truncate max-w-2xl mx-auto">{bookTitle}</h3>
        <p className="my-2 text-sm opacity-40">
          {currentIndex + 1} / {effectiveTotalWords} words
          {realEndIndex && currentIndex >= realEndIndex && " (Back Matter)"}
        </p>
        {!isPlaying && getProgressStats()}
      </div>

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

      {/* RSVP Display or Text Preview */}
      <div className={`relative flex items-center justify-center w-full max-w-2xl border-t border-b my-8 ${theme === 'bedtime' ? 'border-zinc-900' : 'border-zinc-200 dark:border-zinc-800'}`} style={{ height: '120px' }}>
        {isPlaying ? (
          <>
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 ${guidelinesClass}`}></div>
            <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-6 ${guidelinesClass}`}></div>

            <div className="flex w-full items-baseline justify-center text-5xl font-medium">
              <div className={`text-right whitespace-pre ${rsvpContextClass} flex-1`}>{prefix}</div>
              <div className={`${rsvpFocusColor} font-bold text-center px-0.5`}>{focus}</div>
              <div className={`text-left whitespace-pre ${rsvpContextClass} flex-1`}>{suffix}</div>
            </div>
          </>
        ) : (
          <div className={`text-xl leading-relaxed text-center px-8 ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            {words.slice(currentIndex, currentIndex + 15).map(w => w.text).join(' ')}...
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-6 items-center w-full max-w-md px-4 relative z-50">
        <div 
          className={`w-full h-1 rounded-sm cursor-pointer relative group ${theme === 'bedtime' ? 'bg-zinc-900' : 'bg-zinc-200 dark:bg-zinc-800'}`}
          onClick={(e) => {
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
        </div>

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
              </div>
            )}
          </div>

          <button 
            className={`border-none p-2 px-4 rounded-md cursor-pointer flex items-center gap-2 transition-all ${theme === 'bedtime' ? 'bg-stone-800 text-stone-200 hover:bg-stone-700' : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200'}`} 
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
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
                  sections.map((section, idx) => (
                    <button
                      key={idx}
                      className={`text-left px-3 py-2.5 text-sm rounded-md transition-colors leading-normal ${theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}
                      onClick={() => {
                        setCurrentIndex(section.startIndex);
                        toggleToc();
                      }}
                    >
                      {section.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`flex items-center gap-4 w-full ${theme === 'bedtime' ? 'text-stone-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
          <span className="min-w-[5rem] text-right">{wpm} WPM</span>
          <input 
            type="range" 
            min="100" 
            max="1200" 
            step="50" 
            value={wpm} 
            onChange={(e) => onWpmChange(parseInt(e.target.value))} 
            className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer ${theme === 'bedtime' ? 'accent-amber-700 bg-zinc-900' : 'accent-zinc-900 dark:accent-zinc-100 bg-zinc-200 dark:bg-zinc-700'}`}
          />
        </div>
      </div>
      
      <button 
        className="absolute bottom-8 opacity-30 hover:opacity-60 transition-opacity background-none border-none cursor-pointer text-inherit"
        onClick={onCloseBook}
      >
        Close Book
      </button>
    </div>
  );
}
