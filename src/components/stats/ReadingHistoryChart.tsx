import type { ReadingSession } from '../../utils/storage';
import { getHistoryRangeData } from '../../utils/stats';

interface ReadingHistoryChartProps {
    timeRange: string;
    historySessions: ReadingSession[];
    theme: 'light' | 'dark' | 'bedtime';
    totalReadMinutes: number;
    totalListenMinutes: number;
}

export function ReadingHistoryChart({
    timeRange,
    historySessions,
    theme,
    totalReadMinutes,
    totalListenMinutes
}: ReadingHistoryChartProps) {
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

    // Let's refine the barWidth and gap calculation slightly from original if needed,
    // original: barWidth = (chartWidth / totalBars) * 0.7; gap = (chartWidth / totalBars) * 0.3;
    // It's the same mathematically. We'll use the original one for consistency.
    const oBarWidth = (chartWidth / totalBars) * 0.7;
    const oGap = (chartWidth / totalBars) * 0.3;

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
                    const x = paddingLeft + i * (oBarWidth + oGap) + oGap / 2;
                    const readH = (d.read / maxMins) * (height - paddingTop - paddingBottom);
                    const listenH = (d.listen / maxMins) * (height - paddingTop - paddingBottom);

                    return (
                        <g key={d.key} className="group/bar">
                            <rect
                                x={x} y={height - paddingBottom - readH - listenH}
                                width={oBarWidth} height={listenH}
                                fill="#a855f7" rx="1"
                                className="opacity-80 group-hover/bar:opacity-100 transition-opacity"
                            />
                            <rect
                                x={x} y={height - paddingBottom - readH}
                                width={oBarWidth} height={readH}
                                fill={theme === 'bedtime' ? '#d97706' : '#ef4444'} rx="1"
                                className="opacity-80 group-hover/bar:opacity-100 transition-opacity"
                            />

                            {/* Tooltip */}
                            <g className="opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-opacity">
                                <rect x={x + oBarWidth / 2 - 35} y={height - paddingBottom - readH - listenH - 30} width="70" height="22" rx="4" className="fill-zinc-800 dark:fill-zinc-100" />
                                <text x={x + oBarWidth / 2} y={height - paddingBottom - readH - listenH - 16} textAnchor="middle" className="text-[9px] font-bold fill-white dark:fill-zinc-900">
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
}
