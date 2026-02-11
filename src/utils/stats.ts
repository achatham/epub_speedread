import type { ReadingSession } from './storage';

export function getIncrementalAggregationPlan(
  existingAggregated: ReadingSession[],
  newRawSessions: ReadingSession[]
): { deleteIds: string[], createSessions: ReadingSession[] } {
  const groups = new Map<string, ReadingSession[]>();

  const getKey = (s: ReadingSession) => {
    const date = new Date(s.startTime).toLocaleDateString();
    const type = s.type || 'reading';
    return `${s.bookId}-${date}-${type}`;
  };

  // 1. Group existing aggregated sessions
  for (const s of existingAggregated) {
    groups.set(getKey(s), [s]);
  }

  // 2. Track which groups are modified and add new raw sessions
  const modifiedKeys = new Set<string>();
  for (const s of newRawSessions) {
    const key = getKey(s);
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

    // Find the original aggregated session from the existing set if it exists
    const existing = existingAggregated.find(ea => getKey(ea) === key);
    if (existing) {
      deleteIds.push(existing.id);
    }

    const sorted = [...group].sort((a, b) => a.startTime - b.startTime);
    const first = sorted[0];

    const aggregated: ReadingSession = {
      id: existing?.id || crypto.randomUUID(),
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

  // Filter out deleteIds that are being overwritten with the same ID
  const actualDeleteIds = deleteIds.filter(id => !createSessions.some(cs => cs.id === id));

  return { deleteIds: actualDeleteIds, createSessions };
}
