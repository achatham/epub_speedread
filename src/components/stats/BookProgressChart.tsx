import type { ReadingSession, BookRecord } from '../../utils/storage';
import { getBookProgressTrendData } from '../../utils/stats';

interface BookProgressChartProps {
    bookToView: BookRecord | null;
    bookSessions: ReadingSession[];
    theme: 'light' | 'dark' | 'bedtime';
}

export function BookProgressChart({ bookToView, bookSessions, theme }: BookProgressChartProps) {
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
}
