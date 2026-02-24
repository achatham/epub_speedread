import { useState, useMemo, useEffect } from 'react';
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
  onUpdateBookFinishedDate?: (updates: { id: string, date: number }[]) => void;
}

export function StatsView({
  isOpen,
  onClose,
  sessions: rawSessions,
  books,
  activeBookId,
  theme,
  onUpdateBookFinishedDate
}: StatsViewProps) {
  const [activeTab, setActiveTab] = useState<'book' | 'history' | 'books'>('book');
  const [timeRange, setTimeRange] = useState<string>('week');

  useEffect(() => {
    if (activeTab === 'books') {
      if (!['ytd', 'pastYear', 'fiveYears'].includes(timeRange)) {
        setTimeRange('ytd');
      }
    } else if (activeTab === 'history') {
      if (!['week', 'month', 'year'].includes(timeRange)) {
        setTimeRange('week');
      }
    }
  }, [activeTab, timeRange]);

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

  // 2. Lazy identification of finished books
  const finishedBooks = useMemo(() => {
    const results: { id: string; date: number; title: string }[] = [];
    const booksToUpdate: { id: string; date: number }[] = [];

    for (const book of books) {
      let date = book.meta.dateFinished;
      if (!date) {
        const realEnd = book.analysis.realEndIndex || (book.meta.totalWords ? book.meta.totalWords - 1 : 0);
        if (realEnd > 0) {
          const bookSessions = sessions.filter(s => s.bookId === book.id).sort((a, b) => a.startTime - b.startTime);
          const finishingSession = bookSessions.find(s => s.endWordIndex >= realEnd);
          if (finishingSession) {
            date = finishingSession.endTime;
            booksToUpdate.push({ id: book.id, date });
          }
        }
      }
      if (date) {
        results.push({ id: book.id, date, title: book.meta.title });
      }
    }
    return { results, booksToUpdate };
  }, [books, sessions]);

  useEffect(() => {
    if (finishedBooks.booksToUpdate.length > 0 && onUpdateBookFinishedDate) {
      onUpdateBookFinishedDate(finishedBooks.booksToUpdate);
    }
  }, [finishedBooks.booksToUpdate, onUpdateBookFinishedDate]);

  // Capture the current time once per render loop inside an effect
  // to avoid impure render warnings
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (isOpen) {
      setNow(Date.now());
    }
  }, [isOpen, activeTab, timeRange]);

  // 3. Filter sessions for "Overall History" tab
  const historySessions = useMemo(() => {
    let threshold = 0;
    if (timeRange === 'week') threshold = now - 7 * 24 * 60 * 60 * 1000;
    else if (timeRange === 'month') threshold = now - 30 * 24 * 60 * 60 * 1000;
    else if (timeRange === 'year') threshold = now - 365 * 24 * 60 * 60 * 1000;
    return sessions.filter(s => s.startTime >= threshold);
  }, [sessions, timeRange, now]);

  // Finished books for the new tab
  const displayFinishedBooks = useMemo(() => {
    let threshold = 0;
    let endThreshold = Infinity;

    // Convert 'now' back to a Date object for the localized math
    const nowDateObj = new Date(now);

    if (timeRange === 'ytd') {
      threshold = new Date(nowDateObj.getFullYear(), 0, 1).getTime();
    } else if (timeRange === 'pastYear') {
      threshold = nowDateObj.getTime() - 365 * 24 * 60 * 60 * 1000;
      endThreshold = nowDateObj.getTime();
    } else if (timeRange === 'fiveYears') {
      threshold = nowDateObj.getTime() - 5 * 365 * 24 * 60 * 60 * 1000;
    } else {
      // Fallback for history ranges if somehow active
      if (timeRange === 'week') threshold = nowDateObj.getTime() - 7 * 24 * 60 * 60 * 1000;
      else if (timeRange === 'month') threshold = nowDateObj.getTime() - 30 * 24 * 60 * 60 * 1000;
      else if (timeRange === 'year') threshold = nowDateObj.getTime() - 365 * 24 * 60 * 60 * 1000;
    }

    return finishedBooks.results
      .filter(b => b.date >= threshold && b.date <= endThreshold)
      .sort((a, b) => b.date - a.date);
  }, [finishedBooks.results, timeRange, now]);

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

  const renderBooksChart = () => {
    const nowDateObj = new Date(now);
    let threshold = 0;
    let endThreshold = nowDateObj.getTime();
    let numSteps = 0;
    let stepType: 'day' | 'month' = 'day';

    if (timeRange === 'ytd') {
      const startOfYear = new Date(nowDateObj.getFullYear(), 0, 1);
      threshold = startOfYear.getTime();
      numSteps = Math.ceil((nowDateObj.getTime() - threshold) / (24 * 60 * 60 * 1000)) + 1;
      stepType = 'day';
    } else if (timeRange === 'pastYear') {
      threshold = nowDateObj.getTime() - 365 * 24 * 60 * 60 * 1000;
      endThreshold = nowDateObj.getTime();
      numSteps = 12;
      stepType = 'month';
    } else if (timeRange === 'fiveYears') {
      const fiveYearsAgo = new Date(nowDateObj);
      fiveYearsAgo.setFullYear(nowDateObj.getFullYear() - 5);
      fiveYearsAgo.setMonth(nowDateObj.getMonth() + 1); // Start from next month 5 years ago to end on this month
      fiveYearsAgo.setDate(1);
      threshold = fiveYearsAgo.getTime();
      numSteps = 60;
      stepType = 'month';
    } else {
      // Fallback for history ranges
      threshold = nowDateObj.getTime() - 7 * 24 * 60 * 60 * 1000;
      numSteps = 7;
      stepType = 'day';
    }

    const allFinished = [...finishedBooks.results].sort((a, b) => a.date - b.date);
    if (allFinished.length === 0) return (
      <div className="h-32 flex items-center justify-center opacity-40 italic text-sm text-center">
        No books identified as finished yet.<br />Finish a book to see your cumulative progress.
      </div>
    );

    const countBefore = allFinished.filter(b => b.date < threshold).length;
    const data: { key: string; count: number; timestamp: number; hasActivity: boolean }[] = [];
    let runningCount = countBefore;

    if (stepType === 'day') {
      const startOfRange = new Date(threshold);
      startOfRange.setHours(0, 0, 0, 0);
      for (let i = 0; i < numSteps; i++) {
        const d = new Date(startOfRange);
        d.setDate(d.getDate() + i);
        if (d.getTime() > endThreshold && timeRange !== 'pastYear') break;

        const dayFinishCount = allFinished.filter(b => {
          const bd = new Date(b.date);
          return bd.getFullYear() === d.getFullYear() && bd.getMonth() === d.getMonth() && bd.getDate() === d.getDate();
        }).length;

        runningCount += dayFinishCount;
        data.push({
          key: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          count: runningCount,
          timestamp: d.getTime(),
          hasActivity: dayFinishCount > 0
        });
      }
    } else {
      const startOfRange = new Date(threshold);
      if (timeRange === 'pastYear') {
        // For past year, we want 12 increments ending today.
        // Let's start from 11 months ago, 1st of that month.
        startOfRange.setMonth(nowDateObj.getMonth() - 11);
        startOfRange.setDate(1);
        numSteps = 12;
      } else {
        startOfRange.setDate(1);
      }
      startOfRange.setHours(0, 0, 0, 0);
      for (let i = 0; i < numSteps; i++) {
        const d = new Date(startOfRange);
        d.setMonth(d.getMonth() + i);
        if (d.getTime() > endThreshold && timeRange !== 'pastYear') break;

        const nextMonth = new Date(d);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const monthFinishCount = allFinished.filter(b => b.date >= d.getTime() && b.date < nextMonth.getTime()).length;
        runningCount += monthFinishCount;
        data.push({
          key: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
          count: runningCount,
          timestamp: d.getTime(),
          hasActivity: monthFinishCount > 0
        });
      }
    }

    const width = 400;
    const height = 180;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const maxCount = Math.max(5, runningCount);

    const points = data.map((p, i) => {
      const x = paddingLeft + (i / (data.length - 1)) * (width - paddingLeft - paddingRight);
      const y = height - paddingBottom - (p.count / maxCount) * (height - paddingTop - paddingBottom);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="relative w-full group/chart">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          {/* Axis */}
          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="currentColor" strokeWidth="1" opacity="0.2" />
          <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="currentColor" strokeWidth="1" opacity="0.2" />

          {/* Y-Axis Labels */}
          {[0, 0.5, 1].map(tick => {
            const y = height - paddingBottom - tick * (height - paddingTop - paddingBottom);
            const val = Math.round(tick * maxCount);
            return (
              <g key={tick}>
                <line x1={paddingLeft - 5} y1={y} x2={paddingLeft} y2={y} stroke="currentColor" strokeWidth="1" opacity="0.2" />
                <text x={paddingLeft - 10} y={y} textAnchor="end" alignmentBaseline="middle" className="text-[10px] fill-current opacity-40 font-mono">
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area under line */}
          <polyline
            fill={theme === 'bedtime' ? '#d977061a' : '#ef44441a'}
            points={`${paddingLeft},${height - paddingBottom} ${points} ${width - paddingRight},${height - paddingBottom}`}
          />

          {/* Line */}
          <polyline
            fill="none"
            stroke={theme === 'bedtime' ? '#d97706' : '#ef4444'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Dots with Tooltips - only show for days with activity or ends */}
          {data.map((p, i) => {
            const isEdge = i === 0 || i === data.length - 1;
            if (!p.hasActivity && !isEdge) return null;

            const x = paddingLeft + (i / (data.length - 1)) * (width - paddingLeft - paddingRight);
            const y = height - paddingBottom - (p.count / maxCount) * (height - paddingTop - paddingBottom);

            return (
              <g key={i} className="group/point">
                <circle
                  cx={x} cy={y} r={p.hasActivity ? "4" : "2"}
                  fill={theme === 'bedtime' ? '#d97706' : '#ef4444'}
                  className="transition-all group-hover/point:r-6"
                />
                <circle cx={x} cy={y} r="12" fill="transparent" className="cursor-pointer" />
                <g className="opacity-0 group-hover/point:opacity-100 pointer-events-none transition-opacity">
                  <rect x={x - 40} y={y - 35} width="80" height="25" rx="4" className="fill-zinc-800 dark:fill-zinc-100" />
                  <text x={x} y={y - 18} textAnchor="middle" className="text-[9px] font-bold fill-white dark:fill-zinc-900">
                    {p.key}: {p.count} books
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between text-[10px] opacity-50 mt-2" style={{ paddingLeft: `${paddingLeft}px`, paddingRight: `${paddingRight}px` }}>
          <span>{data[0]?.key}</span>
          <span>Cumulative Books Read</span>
          <span>{data[data.length - 1]?.key}</span>
        </div>
      </div>
    );
  };

  const renderHistoryChart = () => {
    const sortedData = getHistoryRangeData(timeRange as 'week' | 'month' | 'year', historySessions);

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
            const x = paddingLeft + i * (barWidth + gap) + gap / 2;
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
                  <rect x={x + barWidth / 2 - 35} y={height - paddingBottom - readH - listenH - 30} width="70" height="22" rx="4" className="fill-zinc-800 dark:fill-zinc-100" />
                  <text x={x + barWidth / 2} y={height - paddingBottom - readH - listenH - 16} textAnchor="middle" className="text-[9px] font-bold fill-white dark:fill-zinc-900">
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
          <button
            onClick={() => setActiveTab('books')}
            className={`py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${activeTab === 'books' ? 'border-red-500 text-red-500' : 'border-transparent opacity-50 hover:opacity-100'}`}
          >
            <BookOpen size={18} />
            Books Read
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">

          {/* History/Books Time Range Selector */}
          {(activeTab === 'history' || activeTab === 'books') && (
            <div className="flex justify-center -mb-2">
              <div className="bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl flex gap-1">
                {activeTab === 'history' ? (
                  (['week', 'month', 'year'] as const).map(range => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`px-6 py-2 text-xs font-semibold rounded-lg transition-all ${timeRange === range ? 'bg-white dark:bg-zinc-700 shadow-sm text-red-500' : 'opacity-50 hover:opacity-100'}`}
                    >
                      {range.charAt(0).toUpperCase() + range.slice(1)}
                    </button>
                  ))
                ) : (
                  ([
                    { id: 'ytd', label: 'YTD' },
                    { id: 'pastYear', label: 'Past Year' },
                    { id: 'fiveYears', label: '5 Years' }
                  ]).map(range => (
                    <button
                      key={range.id}
                      onClick={() => setTimeRange(range.id)}
                      className={`px-6 py-2 text-xs font-semibold rounded-lg transition-all ${timeRange === range.id ? 'bg-white dark:bg-zinc-700 shadow-sm text-red-500' : 'opacity-50 hover:opacity-100'}`}
                    >
                      {range.label}
                    </button>
                  ))
                )}
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

          {/* Progress Chart / History Chart / Books Chart */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium opacity-70 flex items-center gap-2">
              <TrendingUp size={16} />
              {activeTab === 'book'
                ? (activeBookId ? 'Book Progress Trend' : (bookToView ? `Recent Progress: ${bookToView.meta.title}` : 'No Book Data'))
                : activeTab === 'history'
                  ? `Reading Activity: Past ${timeRange === 'week' ? 'Week' : timeRange === 'month' ? 'Month' : 'Year'}`
                  : `Books Finished: ${timeRange === 'ytd' ? 'Year to Date' : timeRange === 'pastYear' ? 'Past Year' : 'Past 5 Years'}`
              }
            </h3>
            <div className={`p-6 rounded-xl ${cardBgClass}`}>
              {activeTab === 'book'
                ? renderProgressChart()
                : activeTab === 'history'
                  ? renderHistoryChart()
                  : renderBooksChart()
              }
            </div>
          </div>

          {/* Recent Sessions / Finished Books Table */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium opacity-70">
              {activeTab === 'book' ? 'Recent Book Activity' : activeTab === 'history' ? 'History Activity' : 'Finished Books'}
            </h3>
            <div className="overflow-x-auto">
              {activeTab === 'books' ? (
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="opacity-40 border-b border-zinc-200 dark:border-zinc-800">
                      <th className="pb-2 font-medium">Book Title</th>
                      <th className="pb-2 font-medium text-right">Date Finished</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {displayFinishedBooks.map((book) => (
                      <tr key={book.id} className="group hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="py-3 pr-4 font-medium truncate">
                          <div className="flex items-center gap-2">
                            <BookOpen size={14} className="text-blue-500 shrink-0" />
                            <span className="truncate">{book.title}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right opacity-60">
                          {new Date(book.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                    {displayFinishedBooks.length === 0 && (
                      <tr>
                        <td colSpan={2} className="py-8 text-center opacity-40 italic">No books finished in this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
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
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
