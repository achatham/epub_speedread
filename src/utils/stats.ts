import type { ReadingSession } from './storage';

export function getAggregationPlan(sessions: ReadingSession[]): { deleteIds: string[], createSessions: ReadingSession[] } {
  const groups = new Map<string, ReadingSession[]>();

  for (const s of sessions) {
    // Group by bookId, local date, and type
    const date = new Date(s.startTime).toLocaleDateString();
    const type = s.type || 'reading';
    const key = `${s.bookId}-${date}-${type}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(s);
  }

  const deleteIds: string[] = [];
  const createSessions: ReadingSession[] = [];

  for (const group of groups.values()) {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => a.startTime - b.startTime);
      const first = sorted[0];

      const aggregated: ReadingSession = {
        id: crypto.randomUUID(),
        bookId: first.bookId,
        bookTitle: first.bookTitle,
        startTime: first.startTime,
        endTime: Math.max(...group.map(s => s.endTime)),
        startWordIndex: Math.min(...group.map(s => s.startWordIndex)),
        endWordIndex: sorted[sorted.length - 1].endWordIndex, // Keep the actual end position of the last session
        wordsRead: group.reduce((acc, s) => acc + (s.wordsRead || Math.max(0, s.endWordIndex - s.startWordIndex)), 0),
        durationSeconds: group.reduce((acc, s) => acc + s.durationSeconds, 0),
        type: first.type || 'reading'
      };

      deleteIds.push(...group.map(s => s.id));
      createSessions.push(aggregated);
    }
  }

  return { deleteIds, createSessions };
}
