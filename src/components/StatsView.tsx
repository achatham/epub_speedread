import { X, Clock, BookOpen, BarChart2, TrendingUp } from 'lucide-react';
import type { ReadingSession, BookRecord } from '../utils/storage';

interface StatsViewProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ReadingSession[];
  books: BookRecord[];
  activeBookId: string | null;
  theme: 'light' | 'dark' | 'bedtime';
}

export function StatsView({
  isOpen,
  onClose,
  sessions,
  books,
  activeBookId,
  theme
}: StatsViewProps) {
  if (!isOpen) return null;

  const bgClass = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const textClass = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
  const cardBgClass = theme === 'bedtime' ? 'bg-zinc-900/50' : 'bg-zinc-50 dark:bg-zinc-800/50';

  // Filter sessions for the active book if provided, otherwise show all
  const filteredSessions = activeBookId 
    ? sessions.filter(s => s.bookId === activeBookId)
    : sessions;

  const totalSeconds = filteredSessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  
  // Progress Calculation (Simplified: 300 words = 1 page)
  const WORDS_PER_PAGE = 300;
  const totalWordsRead = filteredSessions.reduce((acc, s) => acc + (s.wordsRead || Math.max(0, s.endWordIndex - s.startWordIndex)), 0);
  const totalPagesRead = Math.round(totalWordsRead / WORDS_PER_PAGE);

  // Chart Logic (Simple SVG Sparkline)
  // X = Time, Y = Completion %
  const renderProgressChart = () => {
    if (!activeBookId || filteredSessions.length < 2) return (
        <div className="h-32 flex items-center justify-center opacity-40 italic text-sm">
            Need at least 2 sessions to show progress trend.
        </div>
    );

    const activeBook = books.find(b => b.id === activeBookId);
    if (!activeBook) return null;

    // Use the actual/estimated end index for the 100% baseline
    // If we have a realEndIndex from AI, use that. Otherwise use current wordIndex or max seen.
    const bookTotalWords = activeBook.analysis.realEndIndex || activeBook.progress.wordIndex || 1;
    const maxIndex = Math.max(bookTotalWords, ...filteredSessions.map(s => s.endWordIndex));
    
    // Sort sessions chronologically for the chart
    const chrono = [...filteredSessions].sort((a, b) => a.startTime - b.startTime);
    
    const width = 400;
    const height = 180;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const points = chrono.map((s, i) => {
        const x = paddingLeft + (i / (chrono.length - 1)) * (width - paddingLeft - paddingRight);
        const y = height - paddingBottom - (s.endWordIndex / maxIndex) * (height - paddingTop - paddingBottom);
        return `${x},${y}`;
    }).join(' ');

    return (
      <div className="relative w-full group/chart">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          {/* Axis */}
          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="currentColor" strokeWidth="1" opacity="0.2" />
          <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="currentColor" strokeWidth="1" opacity="0.2" />
          
          {/* Y-Axis Labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(tick => {
              const y = height - paddingBottom - tick * (height - paddingTop - paddingBottom);
              return (
                  <g key={tick}>
                    <line x1={paddingLeft - 5} y1={y} x2={paddingLeft} y2={y} stroke="currentColor" strokeWidth="1" opacity="0.2" />
                    <text x={paddingLeft - 10} y={y} textAnchor="end" alignmentBaseline="middle" className="text-[10px] fill-current opacity-40 font-mono">
                        {Math.round(tick * 100)}%
                    </text>
                  </g>
              );
          })}

          {/* Line */}
          <polyline
            fill="none"
            stroke={theme === 'bedtime' ? '#d97706' : '#ef4444'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
          
          {/* Dots with Tooltips */}
          {chrono.map((s, i) => {
             const x = paddingLeft + (i / (chrono.length - 1)) * (width - paddingLeft - paddingRight);
             const y = height - paddingBottom - (s.endWordIndex / maxIndex) * (height - paddingTop - paddingBottom);
             const percent = Math.round((s.endWordIndex / maxIndex) * 100);
             const dateStr = new Date(s.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
             
             return (
                <g key={i} className="group/point">
                    <circle cx={x} cy={y} r="4" fill="currentColor" className="transition-all group-hover/point:r-6" />
                    {/* Tooltip trigger area */}
                    <circle cx={x} cy={y} r="12" fill="transparent" className="cursor-pointer" />
                    {/* Simple SVG Tooltip */}
                    <g className="opacity-0 group-hover/point:opacity-100 pointer-events-none transition-opacity">
                        <rect x={x - 30} y={y - 35} width="60" height="25" rx="4" className="fill-zinc-800 dark:fill-zinc-100" />
                        <text x={x} y={y - 18} textAnchor="middle" className="text-[9px] font-bold fill-white dark:fill-zinc-900">
                            {dateStr}: {percent}%
                        </text>
                    </g>
                </g>
             );
          })}
        </svg>
        <div className="flex justify-between text-[10px] opacity-50 mt-2" style={{ paddingLeft: `${paddingLeft}px` }}>
            <span>Start</span>
            <span>Progress through {activeBook.meta.title}</span>
            <span>Now</span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`${bgClass} ${textClass} w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden`}>
        
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BarChart2 className="text-red-500" size={24} />
            <h2 className="text-xl font-semibold">Reading Stats</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl ${cardBgClass} flex flex-col items-center justify-center text-center`}>
                <Clock size={20} className="mb-2 opacity-50" />
                <span className="text-2xl font-bold">{totalMinutes}</span>
                <span className="text-xs uppercase tracking-wider opacity-50">Minutes Read</span>
            </div>
            <div className={`p-4 rounded-xl ${cardBgClass} flex flex-col items-center justify-center text-center`}>
                <BookOpen size={20} className="mb-2 opacity-50" />
                <span className="text-2xl font-bold">{totalPagesRead}</span>
                <span className="text-xs uppercase tracking-wider opacity-50">Pages Read</span>
            </div>
          </div>

          {/* Progress Chart (Only if book selected) */}
          {activeBookId && (
            <div className="space-y-4">
                <h3 className="text-sm font-medium opacity-70 flex items-center gap-2">
                    <TrendingUp size={16} />
                    Book Progress Trend
                </h3>
                <div className={`p-6 rounded-xl ${cardBgClass}`}>
                    {renderProgressChart()}
                </div>
            </div>
          )}

          {/* Recent Sessions Table */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium opacity-70">Recent Activity</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="opacity-40 border-b border-zinc-200 dark:border-zinc-800">
                    <th className="pb-2 font-medium">Book</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium text-right">Duration</th>
                    <th className="pb-2 font-medium text-right">Pages</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredSessions.slice(0, 10).map((session) => (
                    <tr key={session.id} className="group hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="py-3 pr-4 font-medium truncate max-w-[150px]">{session.bookTitle}</td>
                      <td className="py-3 opacity-60">
                        {new Date(session.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-3 text-right opacity-60">
                        {Math.floor(session.durationSeconds / 60)}m {session.durationSeconds % 60}s
                      </td>
                      <td className="py-3 text-right opacity-60">
                        {Math.round((session.wordsRead || Math.max(0, session.endWordIndex - session.startWordIndex)) / WORDS_PER_PAGE)}
                      </td>
                    </tr>
                  ))}
                  {filteredSessions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center opacity-40 italic">No reading sessions recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
