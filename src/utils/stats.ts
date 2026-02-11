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
