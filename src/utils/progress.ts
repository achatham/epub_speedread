/**
 * Reading position bookkeeping.
 *
 * The cloud copy of a book's position used to be a blind overwrite, so whoever
 * wrote last won — including a tab that had been asleep for hours and still
 * held a morning position in memory. Two ideas fix that:
 *
 *  1. A position carries *when the reader was actually there* (`reachedAt`),
 *     not when the record happened to be written. The most recent reading wins
 *     a conflict, whichever device's write arrives first.
 *  2. Every device keeps its own copy in localStorage. It is written while
 *     reading (not only when playback stops), so a tab that is killed mid-run
 *     still knows where it got to, and reading done offline survives until the
 *     server can be asked what it thinks.
 *
 * `furthestWordIndex` is only ever raised, never lowered, on either side.
 */

export interface ProgressPoint {
  wordIndex: number;
  /** When the reader was at this word, not when this record was written. */
  reachedAt: number;
  furthestWordIndex: number;
}

export interface LocalProgress extends ProgressPoint {
  /** True until the server has acknowledged this position. */
  pendingSync: boolean;
}

/** What the server holds, plus whether we actually managed to ask it. */
export interface RemoteProgress extends ProgressPoint {
  /** True when the read was served from the offline cache. */
  fromCache?: boolean;
}

const STORAGE_KEY = 'reading-progress-v1';
/** Enough for any real library; keeps the entry from growing without bound. */
const MAX_TRACKED_BOOKS = 50;

type ProgressMap = Record<string, LocalProgress>;

function readMap(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as ProgressMap : {};
  } catch {
    return {};
  }
}

function writeMap(map: ProgressMap): void {
  try {
    const ids = Object.keys(map);
    if (ids.length > MAX_TRACKED_BOOKS) {
      const keep = ids
        .sort((a, b) => (map[b].reachedAt || 0) - (map[a].reachedAt || 0))
        .slice(0, MAX_TRACKED_BOOKS);
      map = Object.fromEntries(keep.map(id => [id, map[id]]));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    // A full or unavailable localStorage must not break reading.
    console.warn('[Progress] Could not save local position', e);
  }
}

export function readLocalProgress(bookId: string): LocalProgress | null {
  const entry = readMap()[bookId];
  if (!entry || typeof entry.wordIndex !== 'number') return null;
  return {
    wordIndex: entry.wordIndex,
    reachedAt: entry.reachedAt || 0,
    furthestWordIndex: Math.max(entry.furthestWordIndex || 0, entry.wordIndex),
    pendingSync: entry.pendingSync !== false,
  };
}

export function writeLocalProgress(bookId: string, progress: LocalProgress): void {
  const map = readMap();
  const previous = map[bookId];
  map[bookId] = {
    ...progress,
    furthestWordIndex: Math.max(
      progress.furthestWordIndex,
      progress.wordIndex,
      previous?.furthestWordIndex || 0,
    ),
  };
  writeMap(map);
}

/** Clears the pending flag, but only if the position is still the one that synced. */
export function markLocalProgressSynced(bookId: string, wordIndex: number): void {
  const map = readMap();
  const entry = map[bookId];
  if (!entry || entry.wordIndex !== wordIndex) return;
  map[bookId] = { ...entry, pendingSync: false };
  writeMap(map);
}

export function forgetLocalProgress(bookId: string): void {
  const map = readMap();
  if (!(bookId in map)) return;
  delete map[bookId];
  writeMap(map);
}

/**
 * Picks the position to trust. The side that was read most recently wins; the
 * furthest mark is the high-water mark of both.
 */
export function mergeProgress(
  local: ProgressPoint | null | undefined,
  remote: ProgressPoint | null | undefined,
): { position: ProgressPoint; source: 'local' | 'remote' } {
  const furthestWordIndex = Math.max(
    local?.furthestWordIndex || 0,
    local?.wordIndex || 0,
    remote?.furthestWordIndex || 0,
    remote?.wordIndex || 0,
  );

  if (!remote) {
    const position = local || { wordIndex: 0, reachedAt: 0, furthestWordIndex: 0 };
    return { position: { ...position, furthestWordIndex }, source: 'local' };
  }
  if (!local) return { position: { ...remote, furthestWordIndex }, source: 'remote' };

  // Ties go to the server so two idle devices don't trade writes forever.
  const winner = local.reachedAt > remote.reachedAt ? local : remote;
  return {
    position: { ...winner, furthestWordIndex },
    source: winner === local ? 'local' : 'remote',
  };
}

interface ProgressReader {
  getBookProgress(bookId: string): Promise<RemoteProgress | null>;
}

/**
 * Where a freshly opened book should start.
 *
 * The book record handed in comes from the library list, which is loaded once
 * at startup and can be hours stale in a long-lived tab, so the server is asked
 * again. Whatever wins is written back to the local record, marked pending only
 * if the server has not seen it.
 */
export async function resolveStartPosition(
  storage: ProgressReader | null,
  bookId: string,
  recorded: ProgressPoint,
): Promise<ProgressPoint> {
  let remote: RemoteProgress | null = null;
  try {
    remote = storage ? await storage.getBookProgress(bookId) : null;
  } catch (e) {
    console.warn('[Progress] Could not re-read saved position', e);
  }
  // Offline, or a provider that does not track progress: the record we were
  // handed is the best the cloud can offer.
  if (!remote || remote.fromCache) {
    remote = { ...recorded, fromCache: remote?.fromCache };
  }

  const local = readLocalProgress(bookId);
  const { position, source } = mergeProgress(local, remote);
  writeLocalProgress(bookId, {
    ...position,
    pendingSync: source === 'local' && (local?.pendingSync ?? false),
  });
  return position;
}
