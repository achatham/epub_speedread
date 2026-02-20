import { useState, useMemo } from 'react';
import { X, Clock, BookOpen, BarChart2, TrendingUp, Volume2, Library } from 'lucide-react';
import type { ReadingSession, BookRecord } from '../utils/storage';
import { getSessionKey, getHistoryRangeData, getBookProgressTrendData } from '../utils/stats';

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
  sessions: rawSessions,
  books,
  activeBookId,
  theme
}: StatsViewProps) {
  const [activeTab, setActiveTab] = useState<'book' | 'history'>('book');
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');

  // Perform a final in-memory aggregation to ensure UI never shows individual/duplicate records
  const sessions = useMemo(() => {
    const aggregatedMap = new Map<string, ReadingSession>();
    for (const s of rawSessions) {
      const key = getSessionKey(s);
      const existing = aggregatedMap.get(key);
      if (!existing) {
        aggregatedMap.set(key, { ...s });
      } else {
        existing.endTime = Math.max(existing.endTime, s.endTime);
        existing.startWordIndex = Math.min(existing.startWordIndex, s.startWordIndex);
        existing.endWordIndex = Math.max(existing.endWordIndex, s.endWordIndex);
        existing.wordsRead = (existing.wordsRead || 0) + (s.wordsRead || Math.max(0, s.endWordIndex - s.startWordIndex));
        existing.durationSeconds += s.durationSeconds;
      }
    }
    return Array.from(aggregatedMap.values()).sort((a, b) => b.startTime - a.startTime);
  }, [rawSessions]);

  const bgClass = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const textClass = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';
  const cardBgClass = theme === 'bedtime' ? 'bg-zinc-900/50' : 'bg-zinc-50 dark:bg-zinc-800/50';

  const WORDS_PER_PAGE = 300;

  // 1. Determine which book to show for "Current Book" tab
  const bookToViewId = activeBookId || (sessions.length > 0 ? sessions[0].bookId : null);
  const bookToView = bookToViewId ? books.find(b => b.id === bookToViewId) : null;
  const bookSessions = bookToViewId ? sessions.filter(s => s.bookId === bookToViewId) : [];

  // 2. Filter sessions for "Overall History" tab
  const historySessions = useMemo(() => {
    const now = Date.now();
    let threshold = 0;
    if (timeRange === 'week') threshold = now - 7 * 24 * 60 * 60 * 1000;
    else if (timeRange === 'month') threshold = now - 30 * 24 * 60 * 60 * 1000;
    else if (timeRange === 'year') threshold = now - 365 * 24 * 60 * 60 * 1000;
    return sessions.filter(s => s.startTime >= threshold);
  }, [sessions, timeRange]);

  if (!isOpen) return null;

  // Use either book sessions or history sessions based on tab
  const displaySessions = activeTab === 'book' ? bookSessions : historySessions;

  // Split totals by type
  const readSessions = displaySessions.filter(s => (s.type || 'reading') === 'reading');
  const listenSessions = displaySessions.filter(s => s.type === 'listening');

  const totalReadSeconds = readSessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  const totalListenSeconds = listenSessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  
  const totalReadMinutes = Math.round(totalReadSeconds / 60);
  const totalListenMinutes = Math.round(totalListenSeconds / 60);
  
  const totalWordsRead = readSessions.reduce((acc, s) => acc + (s.wordsRead || Math.max(0, s.endWordIndex - s.startWordIndex)), 0);
  const totalWordsHeard = listenSessions.reduce((acc, s) => acc + (s.wordsRead || Math.max(0, s.endWordIndex - s.startWordIndex)), 0);
  
  const totalPagesRead = Math.round(totalWordsRead / WORDS_PER_PAGE);
  const totalPagesHeard = Math.round(totalWordsHeard / WORDS_PER_PAGE);

  // Chart Logic (Simple SVG Sparkline)
  // X = Time, Y = Completion %
  const renderProgressChart = () => {
    if (!bookToView || bookSessions.length === 0) return (
        <div className="h-32 flex items-center justify-center opacity-40 italic text-sm">
            No progress data available for this book.
        </div>
    );

    // Use the actual/estimated end index for the 100% baseline
    // If we have a realEndIndex from AI, use that. Otherwise use current wordIndex or max seen.
    const bookTotalWords = bookToView.analysis.realEndIndex || bookToView.progress.wordIndex || 1;
    const maxIndex = Math.max(bookTotalWords, ...bookSessions.map(s => s.endWordIndex));
    
    const pointsData = getBookProgressTrendData(bookSessions);
    if (pointsData.length === 0) return null;
    
    const width = 400;
    const height = 180;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const points = pointsData.map((p, i) => {
        const x = paddingLeft + (i / (pointsData.length - 1)) * (width - paddingLeft - paddingRight);
        const y = height - paddingBottom - (p.index / maxIndex) * (height - paddingTop - paddingBottom);
        return `${x},${y}`;
    }).join(' ');

    const startDateStr = new Date(pointsData[0].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endDateStr = new Date(pointsData[pointsData.length - 1].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

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
          
          {/* Dots with Tooltips - only show for days with activity */}
          {pointsData.map((p, i) => {
             if (!p.hasActivity) return null;

             const x = paddingLeft + (i / (pointsData.length - 1)) * (width - paddingLeft - paddingRight);
             const y = height - paddingBottom - (p.index / maxIndex) * (height - paddingTop - paddingBottom);
             const percent = Math.round((p.index / maxIndex) * 100);
             const dateStr = new Date(p.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
             
             const isListen = p.type === 'listening';
             
             return (
                <g key={i} className="group/point">
                    <circle 
                        cx={x} cy={y} r="4" 
                        fill={isListen ? '#a855f7' : (theme === 'bedtime' ? '#d97706' : '#ef4444')} 
                        className="transition-all group-hover/point:r-6" 
                    />
                    {/* Tooltip trigger area */}
                    <circle cx={x} cy={y} r="12" fill="transparent" className="cursor-pointer" />
                    {/* Simple SVG Tooltip */}
                    <g className="opacity-0 group-hover/point:opacity-100 pointer-events-none transition-opacity">
                        <rect x={x - 45} y={y - 35} width="90" height="25" rx="4" className="fill-zinc-800 dark:fill-zinc-100" />
                        <text x={x} y={y - 18} textAnchor="middle" className="text-[9px] font-bold fill-white dark:fill-zinc-900">
                            {dateStr} ({isListen ? '👂' : '📖'}): {percent}%
                        </text>
                    </g>
                </g>
             );
          })}
        </svg>
        <div className="flex justify-between text-[10px] opacity-50 mt-2" style={{ paddingLeft: `${paddingLeft}px`, paddingRight: `${paddingRight}px` }}>
            <span>{startDateStr}</span>
            <span className="hidden sm:inline">Progress: {bookToView.meta.title}</span>
            <span>{endDateStr}</span>
        </div>
      </div>
    );
  };

  const renderHistoryChart = () => {
    const sortedData = getHistoryRangeData(timeRange, historySessions);

    if (sortedData.length === 0) return (
        <div className="h-32 flex items-center justify-center opacity-40 italic text-sm">
            No activity data for this period.
        </div>
    );

    const width = 400;
    const height = 180;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const maxMins = Math.max(15, ...sortedData.map(d => d.read + d.listen));
    const totalBars = sortedData.length;
    const chartWidth = width - paddingLeft - paddingRight;
    const barWidth = (chartWidth / totalBars) * 0.7;
    const gap = (chartWidth / totalBars) * 0.3;

    return (
      <div className="relative w-full group/chart">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          {/* Axis */}
          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="currentColor" strokeWidth="1" opacity="0.2" />

          {/* Y-Axis Labels */}
          {[0, 0.5, 1].map(tick => {
              const y = height - paddingBottom - tick * (height - paddingTop - paddingBottom);
              return (
                  <g key={tick}>
                    <line x1={paddingLeft - 5} y1={y} x2={paddingLeft} y2={y} stroke="currentColor" strokeWidth="1" opacity="0.1" />
                    <text x={paddingLeft - 10} y={y} textAnchor="end" alignmentBaseline="middle" className="text-[10px] fill-current opacity-40 font-mono">
                        {Math.round(tick * maxMins)}m
                    </text>
                  </g>
              );
          })}

          {/* Bars */}
          {sortedData.map((d, i) => {
              const x = paddingLeft + i * (barWidth + gap) + gap/2;
              const readH = (d.read / maxMins) * (height - paddingTop - paddingBottom);
              const listenH = (d.listen / maxMins) * (height - paddingTop - paddingBottom);

              return (
                  <g key={d.key} className="group/bar">
                      <rect
                        x={x} y={height - paddingBottom - readH - listenH}
                        width={barWidth} height={listenH}
                        fill="#a855f7" rx="1"
                        className="opacity-80 group-hover/bar:opacity-100 transition-opacity"
                      />
                      <rect
                        x={x} y={height - paddingBottom - readH}
                        width={barWidth} height={readH}
                        fill={theme === 'bedtime' ? '#d97706' : '#ef4444'} rx="1"
                        className="opacity-80 group-hover/bar:opacity-100 transition-opacity"
                      />

                      {/* Tooltip */}
                      <g className="opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-opacity">
                        <rect x={x + barWidth/2 - 35} y={height - paddingBottom - readH - listenH - 30} width="70" height="22" rx="4" className="fill-zinc-800 dark:fill-zinc-100" />
                        <text x={x + barWidth/2} y={height - paddingBottom - readH - listenH - 16} textAnchor="middle" className="text-[9px] font-bold fill-white dark:fill-zinc-900">
                            {d.key}: {Math.round(d.read + d.listen)}m
                        </text>
                      </g>
                  </g>
              );
          })}
        </svg>
        <div className="flex justify-between text-[10px] opacity-50 mt-2" style={{ paddingLeft: `${paddingLeft}px`, paddingRight: `${paddingRight}px` }}>
            <span>{sortedData[0]?.key}</span>
            <span>Total Time: {totalReadMinutes + totalListenMinutes} mins</span>
            <span>{sortedData[sortedData.length - 1]?.key}</span>
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

        {/* Tabs */}
        <div className="px-6 border-b border-zinc-200 dark:border-zinc-800 flex gap-6 shrink-0">
          <button
            onClick={() => setActiveTab('book')}
            className={`py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${activeTab === 'book' ? 'border-red-500 text-red-500' : 'border-transparent opacity-50 hover:opacity-100'}`}
          >
            <BookOpen size={18} />
            Current Book
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${activeTab === 'history' ? 'border-red-500 text-red-500' : 'border-transparent opacity-50 hover:opacity-100'}`}
          >
            <Library size={18} />
            Overall History
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* History Time Range Selector */}
          {activeTab === 'history' && (
            <div className="flex justify-center -mb-2">
                <div className="bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl flex gap-1">
                    {(['week', 'month', 'year'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-6 py-2 text-xs font-semibold rounded-lg transition-all ${timeRange === range ? 'bg-white dark:bg-zinc-700 shadow-sm text-red-500' : 'opacity-50 hover:opacity-100'}`}
                        >
                            {range.charAt(0).toUpperCase() + range.slice(1)}
                        </button>
                    ))}
                </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className={`p-4 rounded-xl ${cardBgClass} flex flex-col items-center justify-center text-center`}>
                <BookOpen size={20} className="mb-2 opacity-50 text-blue-500" />
                <span className="text-xl font-bold">{totalReadMinutes}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-50">Read Mins</span>
            </div>
            <div className={`p-4 rounded-xl ${cardBgClass} flex flex-col items-center justify-center text-center`}>
                <Volume2 size={20} className="mb-2 opacity-50 text-purple-500" />
                <span className="text-xl font-bold">{totalListenMinutes}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-50">Listen Mins</span>
            </div>
            <div className={`p-4 rounded-xl ${cardBgClass} flex flex-col items-center justify-center text-center`}>
                <Clock size={20} className="mb-2 opacity-50" />
                <span className="text-xl font-bold">{totalReadMinutes + totalListenMinutes}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-50">Total Mins</span>
            </div>
            <div className={`p-4 rounded-xl ${cardBgClass} flex flex-col items-center justify-center text-center`}>
                <TrendingUp size={20} className="mb-2 opacity-50" />
                <span className="text-xl font-bold">{totalPagesRead + totalPagesHeard}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-50">Total Pages</span>
            </div>
          </div>

          {/* Progress Chart / History Chart */}
          <div className="space-y-4">
              <h3 className="text-sm font-medium opacity-70 flex items-center gap-2">
                  <TrendingUp size={16} />
                  {activeTab === 'book'
                    ? (activeBookId ? 'Book Progress Trend' : (bookToView ? `Recent Progress: ${bookToView.meta.title}` : 'No Book Data'))
                    : `Reading Activity: Past ${timeRange.charAt(0).toUpperCase() + timeRange.slice(1)}`
                  }
              </h3>
              <div className={`p-6 rounded-xl ${cardBgClass}`}>
                  {activeTab === 'book' ? renderProgressChart() : renderHistoryChart()}
              </div>
          </div>

          {/* Recent Sessions Table */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium opacity-70">
                {activeTab === 'book' ? 'Recent Book Activity' : 'History Activity'}
            </h3>
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
                  {displaySessions.slice(0, 10).map((session) => (
                    <tr key={session.id} className="group hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="py-3 pr-4 font-medium truncate max-w-[150px]">
                        <div className="flex items-center gap-2">
                          {(session.type || 'reading') === 'listening' ? <Volume2 size={14} className="text-purple-500 shrink-0" /> : <BookOpen size={14} className="text-blue-500 shrink-0" />}
                          <span className="truncate">{session.bookTitle}</span>
                        </div>
                      </td>
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
                  {displaySessions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center opacity-40 italic">No activity recorded for this {activeTab === 'book' ? 'book' : 'period'}.</td>
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
