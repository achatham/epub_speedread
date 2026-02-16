import { useState } from 'react';
import {
  Settings,
  Settings2,
  BarChart2,
  Sun,
  Moon,
  Sunset,
  Minus,
  Plus,
  Volume2,
  Loader2,
  Square,
  Sparkles,
  Menu,
  X,
  BookOpen,
  ChevronRight
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
  bookTitle,
  chapterLabel,
  navigate
}: ReaderMenuProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const mainBg = theme === 'bedtime' ? 'bg-zinc-900/90' : 'bg-white/90 dark:bg-zinc-800/90';
  const borderColor = theme === 'bedtime' ? 'border-zinc-800' : 'border-zinc-200 dark:border-zinc-700';
  const textColor = theme === 'bedtime' ? 'text-stone-300' : 'text-zinc-900 dark:text-zinc-100';
  const iconColor = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-500 dark:text-zinc-400';

  const [showNav, setShowNav] = useState(false);

  const Button = ({ onClick, icon: Icon, label, active = false, disabled = false, className = "" }: any) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${
        active
          ? (theme === 'bedtime' ? 'bg-amber-900/40 text-amber-500' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100')
          : `hover:bg-zinc-100 dark:hover:bg-zinc-700/50 ${textColor}`
      } ${disabled ? 'opacity-30 cursor-not-allowed' : ''} ${className}`}
    >
      <Icon size={20} className={active ? '' : iconColor} />
      <span className="text-[10px] mt-1 font-medium uppercase tracking-tighter opacity-70">{label}</span>
    </button>
  );

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3" onClick={(e) => e.stopPropagation()}>
      {isExpanded && (
        <div
          className={`mb-2 p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-200 ${mainBg} ${borderColor} w-72`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-2 mb-1 border-zinc-100 dark:border-zinc-700/50">
            <div className="flex flex-col truncate pr-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-50 truncate">{bookTitle}</h3>
              {chapterLabel && <p className="text-xs font-medium truncate italic opacity-80">{chapterLabel}</p>}
            </div>
            <button onClick={() => setIsExpanded(false)} className="opacity-50 hover:opacity-100">
              <X size={16} />
            </button>
          </div>

          {/* WPM Controls */}
          <div className="flex flex-col gap-2">
             <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">Reading Speed</span>
                <span className="text-sm font-mono font-bold">{wpm} <span className="text-[10px] opacity-50">WPM</span></span>
             </div>
             <div className="flex items-center gap-2">
                <button
                  onClick={() => onWpmChange(Math.max(100, wpm - 25))}
                  className={`flex-1 flex items-center justify-center p-2 rounded-lg border ${borderColor} hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors`}
                >
                  <Minus size={16} />
                </button>
                <button
                  onClick={() => onWpmChange(Math.min(1200, wpm + 25))}
                  className={`flex-1 flex items-center justify-center p-2 rounded-lg border ${borderColor} hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors`}
                >
                  <Plus size={16} />
                </button>
             </div>
          </div>

          {/* Grid Actions */}
          <div className="grid grid-cols-4 gap-2">
            <Button
              icon={isTocOpen ? ChevronRight : BookOpen}
              label="TOC"
              onClick={onTocClick}
              active={isTocOpen}
            />
            <Button
              icon={ChevronRight}
              label="Nav"
              onClick={() => setShowNav(!showNav)}
              active={showNav}
            />
            <Button
              icon={BarChart2}
              label="Stats"
              onClick={onStatsClick}
            />
            <Button
              icon={Settings2}
              label="Book"
              onClick={onBookSettingsClick}
            />
            <Button
              icon={Settings}
              label="App"
              onClick={onSettingsClick}
            />
            <Button
              icon={theme === 'light' ? Sun : theme === 'dark' ? Moon : Sunset}
              label="Theme"
              onClick={onToggleTheme}
            />
            <Button
              icon={isSynthesizing ? Loader2 : isReadingAloud ? Square : Volume2}
              label={isSynthesizing ? "..." : "Listen"}
              onClick={onReadChapter}
              active={isReadingAloud || isSynthesizing}
              className={isSynthesizing ? "animate-pulse" : ""}
            />
            <Button
              icon={Sparkles}
              label="AI"
              onClick={onAskAiClick}
              active={isAskAiOpen}
            />
          </div>

          {showNav && (
            <div className="grid grid-cols-2 gap-2 animate-in fade-in zoom-in duration-200 pt-2 border-t border-zinc-100 dark:border-zinc-700/50">
               <button onClick={() => navigate('prev-paragraph')} className="text-[10px] p-2 bg-zinc-100 dark:bg-zinc-700 rounded-lg text-center uppercase font-bold opacity-70 hover:opacity-100">Prev Para</button>
               <button onClick={() => navigate('next-paragraph')} className="text-[10px] p-2 bg-zinc-100 dark:bg-zinc-700 rounded-lg text-center uppercase font-bold opacity-70 hover:opacity-100">Next Para</button>
               <button onClick={() => navigate('prev-sentence')} className="text-[10px] p-2 bg-zinc-100 dark:bg-zinc-700 rounded-lg text-center uppercase font-bold opacity-70 hover:opacity-100">Prev Sent</button>
               <button onClick={() => navigate('next-sentence')} className="text-[10px] p-2 bg-zinc-100 dark:bg-zinc-700 rounded-lg text-center uppercase font-bold opacity-70 hover:opacity-100">Next Sent</button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all transform active:scale-90 ${
          isExpanded
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rotate-90'
            : `${mainBg} ${textColor} border ${borderColor} hover:scale-105`
        }`}
      >
        {isExpanded ? <X size={28} /> : <Menu size={28} />}
      </button>
    </div>
  );
}
