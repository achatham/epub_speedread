import type { ReadingSession, BookRecord } from './storage';

export interface FinishedBook {
  id: string;
  date: number;
  title: string;
}

export function calculateFinishedBooks(books: BookRecord[], sessions: ReadingSession[]): { results: FinishedBook[]; booksToUpdate: { id: string; date: number }[] } {
  const results: FinishedBook[] = [];
  const booksToUpdate: { id: string; date: number }[] = [];

  for (const book of books) {
    let date = book.meta.dateFinished;
    if (!date) {
      const realEnd = book.analysis?.realEndIndex || (book.meta.totalWords ? book.meta.totalWords - 1 : 0);
      if (realEnd > 0) {
        // A book is considered finished if progress rounds to 100% (>= 99.5%)
        const finishThreshold = realEnd * 0.995;
        const bookSessions = sessions.filter(s => s.bookId === book.id).sort((a, b) => a.startTime - b.startTime);
        const finishingSession = bookSessions.find(s => s.endWordIndex >= finishThreshold);
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
}

// Effective reading speed below this is physically implausible for any human
// (e.g. a stale entry showing one page read over many hours). Such entries are
// the result of old timing bugs and should be pruned rather than displayed.
export const MIN_PLAUSIBLE_WPM = 1;

export function getSessionWordsRead(s: ReadingSession): number {
  return s.wordsRead || Math.max(0, s.endWordIndex - s.startWordIndex);
}

export function isImplausiblySlowSession(s: ReadingSession): boolean {
  const words = getSessionWordsRead(s);
  if (words <= 0 || s.durationSeconds <= 0) return false;
  const effectiveWpm = (words / s.durationSeconds) * 60;
  return effectiveWpm < MIN_PLAUSIBLE_WPM;
}

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
  rsvp: number;
  paginated: number;
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
      data.set(key, { key, rsvp: 0, paginated: 0, listen: 0, timestamp: d.getTime() });
    }
  } else if (timeRange === 'month') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      data.set(key, { key, rsvp: 0, paginated: 0, listen: 0, timestamp: d.getTime() });
    }
  } else if (timeRange === 'year') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      // Set to 1st of month to ensure consistent grouping and avoid issues with months of different lengths
      d.setDate(1);
      d.setMonth(now.getMonth() - i);
      const key = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      data.set(key, { key, rsvp: 0, paginated: 0, listen: 0, timestamp: d.getTime() });
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
      if (s.type === 'listening') {
          existing.listen += s.durationSeconds / 60;
      } else if (s.type === 'paginated') {
          existing.paginated += s.durationSeconds / 60;
      } else {
          // Legacy 'reading' and new 'rsvp' both map to RSVP
          existing.rsvp += s.durationSeconds / 60;
      }
    }
  }

  return Array.from(data.values())
    .sort((a, b) => a.timestamp - b.timestamp);
}

export interface ProgressTrendPoint {
  index: number;
  time: number;
  hasActivity: boolean;
  type?: 'reading' | 'listening' | 'rsvp' | 'paginated';
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

/**
 * Rebuilds the per-day aggregates from scratch out of the raw session log.
 *
 * This is deliberately a pure function of the raw sessions rather than an
 * incremental "existing aggregate + new sessions" merge. The incremental form
 * was not idempotent: two overlapping aggregation runs each minted a fresh
 * `crypto.randomUUID()` document for the same day, so Firestore saw two
 * non-conflicting writes and kept both. The next run then folded *all* of the
 * duplicates back into one group and summed them, multiplying the totals.
 *
 * The document id is the session key (book + local day + type), so concurrent
 * runs converge on the same document and repeated runs produce the same value.
 */
export function buildAggregatedSessions(rawSessions: ReadingSession[]): ReadingSession[] {
  const groups = new Map<string, ReadingSession[]>();
  for (const s of rawSessions) {
    const key = getSessionKey(s);
    const group = groups.get(key);
    if (group) {
      group.push(s);
    } else {
      groups.set(key, [s]);
    }
  }

  const aggregated: ReadingSession[] = [];
  for (const [key, group] of groups) {
    const first = [...group].sort((a, b) => a.startTime - b.startTime)[0];
    aggregated.push({
      id: key,
      bookId: first.bookId,
      bookTitle: first.bookTitle,
      startTime: first.startTime,
      endTime: Math.max(...group.map(s => s.endTime)),
      startWordIndex: Math.min(...group.map(s => s.startWordIndex)),
      endWordIndex: Math.max(...group.map(s => s.endWordIndex)),
      wordsRead: group.reduce((acc, s) => acc + getSessionWordsRead(s), 0),
      durationSeconds: group.reduce((acc, s) => acc + s.durationSeconds, 0),
      type: (first.type || 'reading') as 'reading' | 'listening' | 'rsvp' | 'paginated'
    });
  }

  return aggregated.sort((a, b) => b.startTime - a.startTime);
}

function isSameAggregate(a: ReadingSession | undefined, b: ReadingSession): boolean {
  return !!a
    && a.startTime === b.startTime
    && a.endTime === b.endTime
    && a.startWordIndex === b.startWordIndex
    && a.endWordIndex === b.endWordIndex
    && a.wordsRead === b.wordsRead
    && a.durationSeconds === b.durationSeconds
    && a.bookTitle === b.bookTitle;
}

/**
 * Diffs the stored aggregates against what the raw sessions say they should be.
 *
 * `deleteIds` covers both days whose raw sessions have since been removed and
 * the legacy random-UUID duplicates written before ids were derived from the
 * session key, so running this repairs an inflated collection in place.
 */
export function getAggregationPlan(
  existingAggregated: ReadingSession[],
  rawSessions: ReadingSession[]
): { deleteIds: string[], upsertSessions: ReadingSession[], sessions: ReadingSession[] } {
  const sessions = buildAggregatedSessions(rawSessions);
  const desiredById = new Map(sessions.map(s => [s.id, s]));
  const existingById = new Map(existingAggregated.map(s => [s.id, s]));

  const deleteIds = existingAggregated
    .map(s => s.id)
    .filter(id => !desiredById.has(id));

  const upsertSessions = sessions.filter(s => !isSameAggregate(existingById.get(s.id), s));

  return { deleteIds, upsertSessions, sessions };
}
