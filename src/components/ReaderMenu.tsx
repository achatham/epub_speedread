import React, { useState } from 'react';
import {
  Settings,
  Settings2,
  BarChart2,
  Type,
  Volume2,
  MessageSquare,
  ChevronDown,
  Menu,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  FastForward,
  Rewind
} from 'lucide-react';

type Theme = 'light' | 'dark' | 'bedtime';

interface ReaderMenuProps {
  theme: Theme;
  onToggleTheme: () => void;
  onSettingsClick: () => void;
  onBookSettingsClick: () => void;
  onStatsClick: () => void;
  onReadChapter: () => void;
  onAskAiClick: () => void;
  isReadingAloud: boolean;
  isSynthesizing: boolean;
  isAskAiOpen: boolean;
  wpm: number;
  onWpmChange: (wpm: number) => void;
  onTocClick: () => void;
  isTocOpen: boolean;
  bookTitle: string;
  chapterLabel?: string;
  navigate: (type: 'book' | 'chapter' | 'prev-paragraph' | 'prev-sentence' | 'next-paragraph' | 'next-sentence') => void;
  // Progress props
  currentIndex: number;
  effectiveTotalWords: number;
  realEndIndex: number | null;
  furthestIndex: number | null;
  totalWords: number;
  setCurrentIndex: (index: number) => void;
  chapterPercentage: number;
}

export function ReaderMenu({
  theme,
  onToggleTheme,
  onSettingsClick,
  onBookSettingsClick,
  onStatsClick,
  onReadChapter,
  onAskAiClick,
  isReadingAloud,
  isSynthesizing,
  isAskAiOpen,
  wpm,
  onWpmChange,
  onTocClick,
  isTocOpen,
  bookTitle: _bookTitle,
  chapterLabel: _chapterLabel,
  navigate,
  currentIndex,
  effectiveTotalWords,
  realEndIndex,
  furthestIndex,
  totalWords,
  setCurrentIndex,
  chapterPercentage
}: ReaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const menuBg = theme === 'bedtime' ? 'bg-zinc-900 border-zinc-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800';
  const iconClass = theme === 'bedtime' ? 'text-stone-400 hover:text-amber-600' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100';

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3" onClick={(e) => e.stopPropagation()}>
      {/* Expanded Menu */}
      {isOpen && (
        <div className={`mb-2 w-80 rounded-3xl shadow-2xl border flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200 ${menuBg}`}>
          {/* Progress Header */}
          <div className="p-6 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
             {/* Chapter Progress */}
            <div className="mb-4">
              <div className="flex justify-between items-end mb-1">
                <span className="text-[10px] uppercase tracking-widest opacity-40 font-bold">Chapter</span>
                <span className="text-[10px] opacity-40 font-mono">{Math.round(chapterPercentage)}%</span>
              </div>
              <div className={`w-full h-1.5 rounded-full relative ${theme === 'bedtime' ? 'bg-black' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                <div
                  className={`h-full rounded-full transition-all duration-300 ${theme === 'bedtime' ? 'bg-amber-700' : 'bg-zinc-400 dark:bg-zinc-500'}`}
                  style={{ width: `${Math.min(100, chapterPercentage)}%` }}
                />
              </div>
            </div>

            {/* Book Progress */}
            <div className="mb-2">
              <div className="flex justify-between items-end mb-1">
                <span className="text-[10px] uppercase tracking-widest opacity-40 font-bold">Book</span>
                <span className="text-[10px] opacity-40 font-mono">{Math.round((currentIndex / effectiveTotalWords) * 100)}%</span>
              </div>
              <div
                className={`w-full h-1.5 rounded-full cursor-pointer relative group ${theme === 'bedtime' ? 'bg-black' : 'bg-zinc-100 dark:bg-zinc-800'}`}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = x / rect.width;
                  setCurrentIndex(Math.floor(percentage * totalWords));
                }}
              >
                <div
                  className={`h-full rounded-full ${theme === 'bedtime' ? 'bg-stone-500' : 'bg-zinc-900 dark:bg-zinc-100'}`}
                  style={{ width: `${Math.min(100, (currentIndex / effectiveTotalWords) * 100)}%` }}
                />
                {furthestIndex !== null && furthestIndex > currentIndex && (
                  <div
                    className={`absolute top-0 bottom-0 w-0.5 z-10 opacity-50 ${theme === 'bedtime' ? 'bg-stone-400' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                    style={{ left: `${Math.min(100, (furthestIndex / effectiveTotalWords) * 100)}%` }}
                  />
                )}
                {realEndIndex && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500/30"
                    style={{ left: `${(realEndIndex / totalWords) * 100}%` }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="p-4 grid grid-cols-4 gap-2">
            <MenuButton
              icon={<Menu size={20} />}
              label="Chapters"
              onClick={() => { onTocClick(); setIsOpen(false); }}
              isActive={isTocOpen}
              theme={theme}
            />
            <MenuButton
              icon={<BarChart2 size={20} />}
              label="Stats"
              onClick={() => { onStatsClick(); setIsOpen(false); }}
              theme={theme}
            />
            <MenuButton
              icon={<Settings size={20} />}
              label="App"
              onClick={() => { onSettingsClick(); setIsOpen(false); }}
              theme={theme}
            />
             <MenuButton
              icon={<Settings2 size={20} />}
              label="Book"
              onClick={() => { onBookSettingsClick(); setIsOpen(false); }}
              theme={theme}
            />
            <MenuButton
              icon={<Type size={20} />}
              label="Theme"
              onClick={onToggleTheme}
              theme={theme}
            />
            <MenuButton
              icon={<Volume2 size={20} />}
              label={isReadingAloud ? "Stop" : "Listen"}
              onClick={onReadChapter}
              isActive={isReadingAloud}
              isLoading={isSynthesizing}
              theme={theme}
            />
            <MenuButton
              icon={<MessageSquare size={20} />}
              label="AI"
              onClick={() => { onAskAiClick(); setIsOpen(false); }}
              isActive={isAskAiOpen}
              theme={theme}
            />
            <div className="flex flex-col items-center justify-center p-2 rounded-2xl gap-1">
              <span className="text-[10px] font-bold opacity-40 uppercase tracking-tighter">WPM</span>
              <span className="text-sm font-mono font-bold">{wpm}</span>
            </div>
          </div>

          {/* WPM Control */}
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center gap-4">
            <button
              onClick={() => onWpmChange(Math.max(50, wpm - 25))}
              className={`p-2 rounded-xl transition-colors ${theme === 'bedtime' ? 'hover:bg-black text-stone-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500'}`}
            >
              <Minus size={20} />
            </button>
            <input
              type="range"
              min="50"
              max="1000"
              step="25"
              value={wpm}
              onChange={(e) => onWpmChange(parseInt(e.target.value))}
              className="flex-1 accent-red-600 dark:accent-red-500"
            />
            <button
              onClick={() => onWpmChange(Math.min(1000, wpm + 25))}
              className={`p-2 rounded-xl transition-colors ${theme === 'bedtime' ? 'hover:bg-black text-stone-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500'}`}
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Navigation Controls */}
          <div className="px-4 py-4 bg-zinc-50/50 dark:bg-zinc-800/20 border-t border-zinc-100 dark:border-zinc-800/50">
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-widest opacity-40 font-bold px-2">Sentence</span>
                <div className="flex gap-1">
                  <NavButton icon={<Rewind size={16} />} onClick={() => navigate('prev-sentence')} theme={theme} />
                  <NavButton icon={<FastForward size={16} />} onClick={() => navigate('next-sentence')} theme={theme} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-widest opacity-40 font-bold px-2">Paragraph</span>
                <div className="flex gap-1">
                  <NavButton icon={<ChevronLeft size={18} />} onClick={() => navigate('prev-paragraph')} theme={theme} />
                  <NavButton icon={<ChevronRight size={18} />} onClick={() => navigate('next-paragraph')} theme={theme} />
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('chapter')}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-between transition-colors ${theme === 'bedtime' ? 'bg-black text-stone-400 hover:text-amber-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
            >
              <span>Next Chapter</span>
              <FastForward size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Main Toggle Button */}
      <button
        onClick={toggleMenu}
        className={`w-14 h-14 rounded-full shadow-xl border flex items-center justify-center transition-all duration-300 ${isOpen ? 'rotate-90 scale-90' : 'hover:scale-110'} ${menuBg}`}
      >
        {isOpen ? (
          <ChevronDown size={28} className={iconClass} />
        ) : (
          <Menu size={28} className={iconClass} />
        )}
      </button>
    </div>
  );
}

function MenuButton({ icon, label, onClick, isActive, isLoading, theme }: { icon: React.ReactNode, label: string, onClick: () => void, isActive?: boolean, isLoading?: boolean, theme: Theme }) {
  const activeClass = theme === 'bedtime' ? 'bg-black text-amber-600' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500';
  const inactiveClass = theme === 'bedtime' ? 'text-stone-400 hover:bg-black' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800';

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex flex-col items-center justify-center p-2 rounded-2xl gap-1 transition-colors ${isActive ? activeClass : inactiveClass}`}
    >
      <div className={isLoading ? 'animate-pulse' : ''}>
        {icon}
      </div>
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

function NavButton({ icon, onClick, theme }: { icon: React.ReactNode, onClick: () => void, theme: Theme }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex-1 py-2 flex items-center justify-center rounded-lg transition-colors ${theme === 'bedtime' ? 'bg-black text-stone-400 hover:text-amber-600' : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-100 dark:border-zinc-800'}`}
    >
      {icon}
    </button>
  );
}
