import React, { useState, useRef, useEffect } from 'react';
import {
  Menu, X, Minus, Plus, Settings, Settings2, BarChart2,
  Sun, Moon, Sunset, Volume2, Sparkles, SkipBack,
  ChevronLeft, Loader2, Square, LogOut
} from 'lucide-react';
import type { NavigationType } from '../utils/navigation';

type Theme = 'light' | 'dark' | 'bedtime';

interface ReaderMenuProps {
  wpm: number;
  onWpmChange: (wpm: number) => void;
  onSettingsClick: () => void;
  onBookSettingsClick: () => void;
  onStatsClick: () => void;
  onToggleTheme: () => void;
  theme: Theme;
  bookTitle: string;
  sections: { label: string; startIndex: number }[];
  activeChapterIdx: number;
  setCurrentIndex: (index: number) => void;
  onCloseBook: () => void;
  onAskAiClick: () => void;
  onReadChapter: () => void;
  isReadingAloud: boolean;
  isSynthesizing: boolean;
  navigate: (type: NavigationType) => void;
  furthestIndex: number | null;
  effectiveTotalWords: number;
  currentIndex: number;
}

export function ReaderMenu({
  wpm,
  onWpmChange,
  onSettingsClick,
  onBookSettingsClick,
  onStatsClick,
  onToggleTheme,
  theme,
  bookTitle,
  sections,
  activeChapterIdx,
  setCurrentIndex,
  onCloseBook,
  onAskAiClick,
  onReadChapter,
  isReadingAloud,
  isSynthesizing,
  navigate,
  furthestIndex,
  effectiveTotalWords,
  currentIndex
}: ReaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'toc' | 'nav'>('main');
  const activeChapterRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeTab === 'toc' && activeChapterRef.current) {
      activeChapterRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeTab]);

  const menuBg = theme === 'bedtime' ? 'bg-black border-zinc-900' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800';
  const itemHover = theme === 'bedtime' ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800';
  const textColor = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';

  if (!isOpen) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-lg border transition-all pointer-events-auto ${theme === 'bedtime' ? 'bg-zinc-900 border-zinc-800 text-stone-400' : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'} hover:scale-110 active:scale-95`}
        title="Open Menu"
      >
        <Menu size={24} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:justify-end p-4 pointer-events-none">
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto"
        onClick={() => setIsOpen(false)}
      />

      <div
        className={`relative w-full max-w-sm sm:w-80 max-h-[80vh] overflow-hidden rounded-2xl border shadow-2xl flex flex-col pointer-events-auto ${menuBg} ${textColor} animate-in slide-in-from-bottom-4 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            {activeTab !== 'main' && (
              <button
                onClick={() => setActiveTab('main')}
                className={`p-1 rounded-md ${itemHover}`}
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <h2 className="font-semibold truncate max-w-[180px]">
              {activeTab === 'main' ? bookTitle : activeTab === 'toc' ? 'Table of Contents' : 'Navigate'}
            </h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className={`p-1 rounded-md ${itemHover}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2">
          {activeTab === 'main' && (
            <div className="space-y-4 p-2">
              {/* WPM Controls */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">Reading Speed</span>
                <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <button
                    onClick={() => onWpmChange(Math.max(100, wpm - 25))}
                    className={`p-2 rounded-lg border transition-colors ${theme === 'bedtime' ? 'border-zinc-800 hover:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Decrease Speed"
                  >
                    <Minus size={20} />
                  </button>
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-bold">{wpm}</span>
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

              {/* Grid Actions */}
              <div className="grid grid-cols-3 gap-2">
                <MenuButton
                  icon={<BarChart2 size={20} />}
                  label="Stats"
                  onClick={() => { onStatsClick(); setIsOpen(false); }}
                  hoverClass={itemHover}
                />
                <MenuButton
                  icon={<Settings size={20} />}
                  label="Settings"
                  onClick={() => { onSettingsClick(); setIsOpen(false); }}
                  hoverClass={itemHover}
                />
                <MenuButton
                  icon={<Settings2 size={20} />}
                  label="Book"
                  onClick={() => { onBookSettingsClick(); setIsOpen(false); }}
                  hoverClass={itemHover}
                />
                <MenuButton
                  icon={theme === 'light' ? <Sun size={20} /> : theme === 'dark' ? <Moon size={20} /> : <Sunset size={20} className="text-amber-600" />}
                  label="Theme"
                  onClick={onToggleTheme}
                  hoverClass={itemHover}
                />
                <MenuButton
                  icon={isSynthesizing ? <Loader2 size={20} className="animate-spin" /> : isReadingAloud ? <Square size={20} fill="currentColor" /> : <Volume2 size={20} />}
                  label={isReadingAloud ? "Stop" : "Listen"}
                  onClick={() => { onReadChapter(); setIsOpen(false); }}
                  disabled={isSynthesizing && !isReadingAloud}
                  hoverClass={itemHover}
                  active={isReadingAloud}
                />
                <MenuButton
                  icon={<Sparkles size={20} />}
                  label="Ask AI"
                  onClick={() => { onAskAiClick(); setIsOpen(false); }}
                  hoverClass={itemHover}
                />
              </div>

              {/* Sub-menu Triggers */}
              <div className="space-y-1 pt-2">
                <button
                  onClick={() => setActiveTab('toc')}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${itemHover}`}
                >
                  <div className="flex items-center gap-3">
                    <Settings2 size={20} className="opacity-60" />
                    <span className="text-sm font-medium">Table of Contents</span>
                  </div>
                  <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-full opacity-60">
                    {sections.length} Chapters
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('nav')}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${itemHover}`}
                >
                  <div className="flex items-center gap-3">
                    <SkipBack size={20} className="opacity-60" />
                    <span className="text-sm font-medium">Navigation Jumps</span>
                  </div>
                </button>
              </div>

              {/* Close Book */}
              <div className="pt-2">
                <button
                  onClick={onCloseBook}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-red-500 hover:bg-red-500/10`}
                >
                  <LogOut size={20} />
                  <span className="text-sm font-medium">Close Book</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'toc' && (
            <div className="p-1 space-y-1">
              {sections.length === 0 ? (
                <div className="p-8 text-center opacity-40 text-sm italic">No chapters found</div>
              ) : (
                sections.map((section, idx) => {
                  const isCurrent = idx === activeChapterIdx;
                  return (
                    <button
                      key={idx}
                      ref={isCurrent ? activeChapterRef : null}
                      className={`w-full text-left px-3 py-3 text-sm rounded-lg transition-colors flex justify-between items-center ${isCurrent
                          ? (theme === 'bedtime' ? 'bg-zinc-900 text-amber-600 font-bold' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold')
                          : (theme === 'bedtime' ? 'text-stone-400 hover:bg-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300')
                        }`}
                      onClick={() => {
                        setCurrentIndex(section.startIndex);
                        setIsOpen(false);
                      }}
                    >
                      <span className="truncate flex-1">{section.label}</span>
                      {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-current ml-2 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'nav' && (
            <div className="p-1 space-y-1">
              <NavButton
                label="Previous Paragraph"
                sub="Paragraph"
                onClick={() => { navigate('prev-paragraph'); setIsOpen(false); }}
                hoverClass={itemHover}
              />
              <NavButton
                label="Previous Sentence"
                sub="Sentence"
                onClick={() => { navigate('prev-sentence'); setIsOpen(false); }}
                hoverClass={itemHover}
              />
              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1 mx-2" />
              <NavButton
                label="Next Sentence"
                onClick={() => { navigate('next-sentence'); setIsOpen(false); }}
                hoverClass={itemHover}
              />
              <NavButton
                label="Next Paragraph"
                onClick={() => { navigate('next-paragraph'); setIsOpen(false); }}
                hoverClass={itemHover}
              />
              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1 mx-2" />
              <button
                onClick={() => {
                  if (furthestIndex !== null && furthestIndex > currentIndex + 10) {
                    setCurrentIndex(furthestIndex);
                    setIsOpen(false);
                  }
                }}
                disabled={!(furthestIndex !== null && furthestIndex > currentIndex + 10)}
                className={`w-full text-left px-3 py-3 text-sm rounded-lg flex justify-between items-center transition-all ${
                  theme === 'bedtime'
                    ? 'text-stone-400 hover:enabled:bg-zinc-900 disabled:opacity-20'
                    : 'hover:enabled:bg-zinc-100 dark:hover:enabled:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-30'
                }`}
              >
                <span>Jump to Furthest</span>
                <span className="opacity-50 text-xs">
                  {furthestIndex !== null ? `${(furthestIndex / effectiveTotalWords * 100).toFixed(0)}%` : '0%'}
                </span>
              </button>
              <NavButton
                label="Restart Chapter"
                onClick={() => { navigate('chapter'); setIsOpen(false); }}
                hoverClass={itemHover}
              />
              <button
                onClick={() => { navigate('book'); setIsOpen(false); }}
                className={`w-full text-left px-3 py-3 text-sm rounded-lg font-semibold text-red-600 dark:text-red-400 ${itemHover}`}
              >
                Restart Book
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuButton({ icon, label, onClick, disabled, hoverClass, active }: { icon: React.ReactNode, label: string, onClick: () => void, disabled?: boolean, hoverClass: string, active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-all ${hoverClass} ${active ? 'bg-zinc-100 dark:bg-zinc-800' : ''} ${disabled ? 'opacity-30' : ''}`}
    >
      <div className="opacity-80">{icon}</div>
      <span className="text-[10px] font-bold uppercase tracking-tighter opacity-60">{label}</span>
    </button>
  );
}

function NavButton({ label, sub, onClick, hoverClass }: { label: string, sub?: string, onClick: () => void, hoverClass: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 text-sm rounded-lg flex justify-between items-center group transition-colors ${hoverClass}`}
    >
      <span>{label}</span>
      {sub && <span className="opacity-40 text-[10px] uppercase font-bold group-hover:opacity-100 transition-opacity">{sub}</span>}
    </button>
  );
}
