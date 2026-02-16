import React, { useState } from 'react';
import {
  Settings, Settings2, BarChart2, Sun, Moon, Sunset,
  Sparkles, Volume2, Square, Loader2, X, Menu,
  Minus, Plus
} from 'lucide-react';

type Theme = 'light' | 'dark' | 'bedtime';

interface ReaderMenuProps {
  wpm: number;
  onWpmChange: (wpm: number) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onSettingsClick: () => void;
  onBookSettingsClick: () => void;
  onStatsClick: () => void;
  onAskAiClick?: () => void;
  onReadChapter: () => void;
  isReadingAloud: boolean;
  isSynthesizing: boolean;
  sections: { label: string; startIndex: number }[];
  activeChapterIdx: number;
  setCurrentIndex: (index: number) => void;
  navigate: (type: 'book' | 'chapter' | 'prev-paragraph' | 'prev-sentence' | 'next-paragraph' | 'next-sentence') => void;
  furthestIndex: number | null;
  effectiveTotalWords: number;
  currentIndex: number;
}

export function ReaderMenu({
  wpm,
  onWpmChange,
  theme,
  onToggleTheme,
  onSettingsClick,
  onBookSettingsClick,
  onStatsClick,
  onAskAiClick,
  onReadChapter,
  isReadingAloud,
  isSynthesizing,
  sections,
  activeChapterIdx,
  setCurrentIndex,
  navigate,
  furthestIndex,
  effectiveTotalWords,
  currentIndex
}: ReaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'toc' | 'nav'>('main');

  const mainBg = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const mainText = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
  const borderColor = theme === 'bedtime' ? 'border-zinc-800' : 'border-zinc-200 dark:border-zinc-800';
  const hoverBg = theme === 'bedtime' ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800';

  if (!isOpen) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className={`fixed bottom-6 right-6 p-4 rounded-full shadow-lg z-[60] transition-transform hover:scale-110 active:scale-95 ${mainBg} ${mainText} border ${borderColor}`}
        title="Open Menu"
      >
        <Menu size={24} />
      </button>
    );
  }

  return (
    <div className={`fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center`}>
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm"
        onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
      />

      <div className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border ${borderColor} ${mainBg} ${mainText} animate-in slide-in-from-bottom-4 duration-200`}>
        {/* Header Tabs */}
        <div className={`flex items-center justify-between p-2 border-b ${borderColor}`}>
          <div className="flex gap-1">
             <button
                onClick={() => setActiveTab('main')}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${activeTab === 'main' ? (theme === 'bedtime' ? 'bg-zinc-900 text-amber-600' : 'bg-zinc-100 dark:bg-zinc-800') : 'opacity-40'}`}
             >
                Controls
             </button>
             <button
                onClick={() => setActiveTab('toc')}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${activeTab === 'toc' ? (theme === 'bedtime' ? 'bg-zinc-900 text-amber-600' : 'bg-zinc-100 dark:bg-zinc-800') : 'opacity-40'}`}
             >
                Chapters
             </button>
             <button
                onClick={() => setActiveTab('nav')}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${activeTab === 'nav' ? (theme === 'bedtime' ? 'bg-zinc-900 text-amber-600' : 'bg-zinc-100 dark:bg-zinc-800') : 'opacity-40'}`}
             >
                Navigate
             </button>
          </div>
          <button onClick={() => setIsOpen(false)} className={`p-2 rounded-full ${hoverBg}`}>
            <X size={20} />
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {activeTab === 'main' && (
            <div className="space-y-8 py-2">
              {/* WPM Controls */}
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-bold opacity-40 uppercase tracking-widest">Speed</span>
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => onWpmChange(Math.max(100, wpm - 25))}
                    className={`p-2.5 rounded-xl border ${borderColor} ${hoverBg} transition-all active:scale-90`}
                  >
                    <Minus size={20} />
                  </button>
                  <div className="flex flex-col items-center min-w-[4rem]">
                    <span className="text-3xl font-black tabular-nums">{wpm}</span>
                    <span className="text-[10px] opacity-40 font-bold uppercase tracking-tighter">Words / Min</span>
                  </div>
                  <button
                    onClick={() => onWpmChange(Math.min(1200, wpm + 25))}
                    className={`p-2.5 rounded-xl border ${borderColor} ${hoverBg} transition-all active:scale-90`}
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              {/* Action Grid */}
              <div className="grid grid-cols-3 gap-4">
                <MenuButton
                  icon={<Settings size={22} />}
                  label="General"
                  onClick={() => { onSettingsClick(); setIsOpen(false); }}
                  theme={theme}
                />
                <MenuButton
                  icon={<Settings2 size={22} />}
                  label="Book"
                  onClick={() => { onBookSettingsClick(); setIsOpen(false); }}
                  theme={theme}
                />
                <MenuButton
                  icon={<BarChart2 size={22} />}
                  label="Stats"
                  onClick={() => { onStatsClick(); setIsOpen(false); }}
                  theme={theme}
                />
                <MenuButton
                  icon={theme === 'light' ? <Sun size={22} /> : theme === 'dark' ? <Moon size={22} /> : <Sunset size={22} className="text-amber-600" />}
                  label="Theme"
                  onClick={onToggleTheme}
                  theme={theme}
                />
                {onAskAiClick && (
                  <MenuButton
                    icon={<Sparkles size={22} />}
                    label="Ask AI"
                    onClick={() => { onAskAiClick(); setIsOpen(false); }}
                    theme={theme}
                  />
                )}
                <MenuButton
                  icon={isSynthesizing ? <Loader2 size={22} className="animate-spin" /> : isReadingAloud ? <Square size={22} fill="currentColor" /> : <Volume2 size={22} />}
                  label={isReadingAloud ? "Stop" : "Listen"}
                  onClick={onReadChapter}
                  theme={theme}
                  disabled={isSynthesizing && !isReadingAloud}
                />
              </div>
            </div>
          )}

          {activeTab === 'toc' && (
            <div className="flex flex-col gap-1.5">
              {sections.length === 0 ? (
                <div className="py-12 text-center opacity-30 italic text-sm">No chapters found in this book</div>
              ) : (
                sections.map((section, idx) => {
                  const isCurrent = idx === activeChapterIdx;
                  return (
                    <button
                      key={idx}
                      className={`text-left px-4 py-3.5 rounded-xl transition-all ${isCurrent ? (theme === 'bedtime' ? 'bg-zinc-900 text-amber-600 font-bold' : 'bg-zinc-100 dark:bg-zinc-800 font-bold') : hoverBg} active:scale-[0.98]`}
                      onClick={() => {
                        setCurrentIndex(section.startIndex);
                        setIsOpen(false);
                      }}
                    >
                      <span className={`text-sm leading-snug ${isCurrent ? 'opacity-100' : 'opacity-70'}`}>{section.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'nav' && (
            <div className="flex flex-col gap-2 py-1">
               <NavButton label="Previous Paragraph" sublabel="Para" onClick={() => navigate('prev-paragraph')} theme={theme} />
               <NavButton label="Previous Sentence" sublabel="Sent" onClick={() => navigate('prev-sentence')} theme={theme} />
               <NavButton label="Next Sentence" sublabel="Sent" onClick={() => navigate('next-sentence')} theme={theme} />
               <NavButton label="Next Paragraph" sublabel="Para" onClick={() => navigate('next-paragraph')} theme={theme} />
               <div className={`my-2 h-px ${borderColor}`} />
               <NavButton
                  label="Jump to Furthest"
                  sublabel={furthestIndex !== null ? `${Math.round((furthestIndex / effectiveTotalWords) * 100)}%` : '0%'}
                  onClick={() => {
                    if (furthestIndex !== null) {
                      setCurrentIndex(furthestIndex);
                      setIsOpen(false);
                    }
                  }}
                  theme={theme}
                  disabled={furthestIndex === null || furthestIndex <= currentIndex + 10}
               />
               <NavButton label="Restart Chapter" onClick={() => navigate('chapter')} theme={theme} />
               <NavButton label="Restart Book" onClick={() => navigate('book')} theme={theme} danger />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuButton({ icon, label, onClick, theme, disabled }: { icon: React.ReactNode, label: string, onClick: () => void, theme: Theme, disabled?: boolean }) {
  const hoverBg = theme === 'bedtime' ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800';
  const borderColor = theme === 'bedtime' ? 'border-zinc-800' : 'border-zinc-200 dark:border-zinc-800';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border ${borderColor} transition-all active:scale-90 disabled:opacity-20 ${hoverBg}`}
    >
      <div className="opacity-70">{icon}</div>
      <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{label}</span>
    </button>
  );
}

function NavButton({ label, sublabel, onClick, theme, danger, disabled }: { label: string, sublabel?: string, onClick: () => void, theme: Theme, danger?: boolean, disabled?: boolean }) {
  const hoverBg = theme === 'bedtime' ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800';
  const borderColor = theme === 'bedtime' ? 'border-zinc-800' : 'border-zinc-200 dark:border-zinc-800';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-between px-4 py-4 rounded-xl border ${borderColor} transition-all active:scale-[0.98] ${hoverBg} ${danger ? 'text-red-500 border-red-500/20 bg-red-500/5' : ''} disabled:opacity-20`}
    >
      <span className="text-sm font-bold">{label}</span>
      {sublabel && <span className="text-[10px] opacity-40 uppercase font-black tracking-widest">{sublabel}</span>}
    </button>
  );
}
