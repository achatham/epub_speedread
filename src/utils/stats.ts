import type { ReadingSession } from './storage';

export function getDayKey(startTime: number): string {
  const d = new Date(startTime);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getSessionKey(s: ReadingSession): string {
  const date = getDayKey(s.startTime);
  const type = s.type || 'reading';
  return `${s.bookId}-${date}-${type}`;
}

export interface HistoryDataPoint {
  key: string;
  read: number;
  listen: number;
  timestamp: number;
}

export function getHistoryRangeData(
  timeRange: 'week' | 'month' | 'year',
  sessions: ReadingSession[]
): HistoryDataPoint[] {
  const isYear = timeRange === 'year';
  const data = new Map<string, HistoryDataPoint>();

  // 1. Pre-fill with zeros based on timeRange
  const now = new Date();
  if (timeRange === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      data.set(key, { key, read: 0, listen: 0, timestamp: d.getTime() });
    }
  } else if (timeRange === 'month') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      data.set(key, { key, read: 0, listen: 0, timestamp: d.getTime() });
    }
  } else if (timeRange === 'year') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      // Set to 1st of month to ensure consistent grouping and avoid issues with months of different lengths
      d.setDate(1);
      d.setMonth(now.getMonth() - i);
      const key = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      data.set(key, { key, read: 0, listen: 0, timestamp: d.getTime() });
    }
  }

  // 2. Aggregate sessions into the pre-filled buckets
  for (const s of sessions) {
    const d = new Date(s.startTime);
    const key = isYear
      ? d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const existing = data.get(key);
    if (existing) {
      if (s.type === 'listening') existing.listen += s.durationSeconds / 60;
      else existing.read += s.durationSeconds / 60;
    }
  }

  return Array.from(data.values())
    .sort((a, b) => a.timestamp - b.timestamp);
}

export interface ProgressTrendPoint {
  index: number;
  time: number;
  hasActivity: boolean;
  type?: 'reading' | 'listening';
}

export function getBookProgressTrendData(
  sessions: ReadingSession[]
): ProgressTrendPoint[] {
  if (sessions.length === 0) return [];

  const chrono = [...sessions].sort((a, b) => a.startTime - b.startTime);

  // Find max position per day
  const dailyMax = new Map<string, ReadingSession>();
  for (const s of chrono) {
    const date = getDayKey(s.startTime);
    const existing = dailyMax.get(date);
    if (!existing || s.endWordIndex >= existing.endWordIndex) {
      dailyMax.set(date, s);
    }
  }

  const firstTime = chrono[0].startTime;
  const lastTime = Date.now();

  const firstDay = new Date(firstTime);
  firstDay.setHours(0, 0, 0, 0);
  const lastDay = new Date(lastTime);
  lastDay.setHours(0, 0, 0, 0);

  // Special case: If only one day of activity total, show the progress within that day
  const uniqueDays = new Set(Array.from(dailyMax.keys())).size;
  if (uniqueDays === 1 && firstDay.getTime() === lastDay.getTime()) {
      const s = chrono[0];
      const lastS = chrono[chrono.length - 1];
      // If the session is very short, ensure we have two points for the line
      return [
          { index: s.startWordIndex, time: s.startTime, hasActivity: true, type: s.type },
          { index: lastS.endWordIndex, time: lastS.endTime, hasActivity: true, type: lastS.type }
      ];
  }

  const result: ProgressTrendPoint[] = [];
  let currentMaxIndex = 0;

  // Fill every day from first session to today
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const key = getDayKey(d.getTime());
    const session = dailyMax.get(key);
    if (session) {
      currentMaxIndex = Math.max(currentMaxIndex, session.endWordIndex);
      result.push({
          index: currentMaxIndex,
          time: session.endTime,
          hasActivity: true,
          type: session.type
      });
    } else {
      const endOfDay = new Date(d);
      endOfDay.setHours(23, 59, 59, 999);
      result.push({
          index: currentMaxIndex,
          time: endOfDay.getTime(),
          hasActivity: false
      });
    }
  }

  return result;
}

export function getIncrementalAggregationPlan(
  existingAggregated: ReadingSession[],
  newRawSessions: ReadingSession[]
): { deleteIds: string[], createSessions: ReadingSession[] } {
  const groups = new Map<string, ReadingSession[]>();

  // 1. Group existing aggregated sessions
  // We use a list in case multiple existing records have the same key (bug recovery)
  for (const s of existingAggregated) {
    const key = getSessionKey(s);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(s);
  }

  // 2. Track which groups are modified and add new raw sessions
  const modifiedKeys = new Set<string>();
  for (const s of newRawSessions) {
    const key = getSessionKey(s);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(s);
    modifiedKeys.add(key);
  }

  const deleteIds: string[] = [];
  const createSessions: ReadingSession[] = [];

  // 3. Process only modified groups
  for (const key of modifiedKeys) {
    const group = groups.get(key)!;

    // Find all existing records for this key to ensure they are all replaced/deleted
    const existing = existingAggregated.filter(ea => getSessionKey(ea) === key);
    const idToUse = existing.length > 0 ? existing[0].id : crypto.randomUUID();

    if (existing.length > 0) {
      deleteIds.push(...existing.map(e => e.id));
    }

    const sorted = [...group].sort((a, b) => a.startTime - b.startTime);
    const first = sorted[0];

    const aggregated: ReadingSession = {
      id: idToUse,
      bookId: first.bookId,
      bookTitle: first.bookTitle,
      startTime: first.startTime,
      endTime: Math.max(...group.map(s => s.endTime)),
      startWordIndex: Math.min(...group.map(s => s.startWordIndex)),
      endWordIndex: Math.max(...group.map(s => s.endWordIndex)),
      wordsRead: group.reduce((acc, s) => acc + (s.wordsRead || Math.max(0, s.endWordIndex - s.startWordIndex)), 0),
      durationSeconds: group.reduce((acc, s) => acc + s.durationSeconds, 0),
      type: (first.type || 'reading') as 'reading' | 'listening'
    };

    createSessions.push(aggregated);
  }

  // Filter out the ID we are currently updating from deleteIds
  const actualDeleteIds = deleteIds.filter(id => !createSessions.some(cs => cs.id === id));

  return { deleteIds: actualDeleteIds, createSessions };
}
