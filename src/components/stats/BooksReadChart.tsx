

interface BooksReadChartProps {
    now: number;
    timeRange: string;
    finishedBooks: { results: { id: string; date: number; title: string }[], booksToUpdate: any[] };
    theme: 'light' | 'dark' | 'bedtime';
}

export function BooksReadChart({ now, timeRange, finishedBooks, theme }: BooksReadChartProps) {
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
}
