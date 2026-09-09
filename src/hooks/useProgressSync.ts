import { useCallback, useEffect, useRef } from 'react';
import type { FirestoreStorage, ProgressWriteResult } from '../utils/storage';
import { useReaderStore } from '../stores/useReaderStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import {
  markLocalProgressSynced,
  mergeProgress,
  readLocalProgress,
  writeLocalProgress,
  type ProgressPoint,
} from '../utils/progress';

/** How often the local record is refreshed while RSVP is running. */
const LOCAL_WRITE_INTERVAL_MS = 1000;
/** Page turns arrive in bursts; let one settle before spending a round trip. */
const CLOUD_DEBOUNCE_MS = 1500;
/** Cloud checkpoint cadence during uninterrupted playback. */
const CLOUD_CHECKPOINT_MS = 60000;

/**
 * Keeps the reading position saved, and keeps it honest across devices.
 *
 * The position is written locally as it is read — including mid-playback, which
 * the old save-on-pause effect never did — and pushed to the cloud stamped with
 * when the reader was actually there. On waking, the server is asked again: if
 * another device read more recently, this one catches up instead of overwriting
 * it, which is what made a tab left open all day rewind the book.
 */
export function useProgressSync(
  storageProvider: FirestoreStorage | null,
  loadedBookIdRef: React.RefObject<string | null>,
) {
  const currentBookId = useReaderStore(state => state.currentBookId);
  const currentIndex = useReaderStore(state => state.currentIndex);
  const isPlaying = useReaderStore(state => state.isPlaying);
  const furthestIndex = useReaderStore(state => state.furthestIndex);
  const setFurthestIndex = useReaderStore(state => state.setFurthestIndex);
  const setLibrary = useLibraryStore(state => state.setLibrary);

  const lastLocalWriteRef = useRef(0);
  const lastCloudWriteRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recordLocally = useCallback((bookId: string, index: number, reachedAt: number) => {
    const saved = readLocalProgress(bookId);
    writeLocalProgress(bookId, {
      wordIndex: index,
      reachedAt,
      furthestWordIndex: Math.max(index, saved?.furthestWordIndex || 0),
      pendingSync: true,
    });
  }, []);

  /** Moves this device to a position saved elsewhere, if it is safe to jump. */
  const catchUpTo = useCallback((bookId: string, position: ProgressPoint) => {
    const state = useReaderStore.getState();
    if (state.currentBookId !== bookId || state.isPlaying) return;
    if (state.currentIndex === position.wordIndex) return;
    console.log(`[Progress] Catching up to word ${position.wordIndex}, read more recently elsewhere.`);
    // Recorded as already synced first, so the position change below is not
    // mistaken for fresh reading and written straight back.
    writeLocalProgress(bookId, { ...position, pendingSync: false });
    state.setCurrentIndex(position.wordIndex);
  }, []);

  const applyServerState = useCallback((bookId: string, result: ProgressWriteResult) => {
    if (useReaderStore.getState().currentBookId === bookId) {
      const known = useReaderStore.getState().furthestIndex;
      if (known === null || result.furthestWordIndex > known) setFurthestIndex(result.furthestWordIndex);
      if (!result.accepted) catchUpTo(bookId, result);
    }
    setLibrary(prev => prev.map(b => b.id === bookId ? {
      ...b,
      progress: {
        ...b.progress,
        wordIndex: result.wordIndex,
        lastReadAt: result.reachedAt,
        furthestWordIndex: result.furthestWordIndex,
      }
    } : b));
  }, [catchUpTo, setFurthestIndex, setLibrary]);

  const pushToCloud = useCallback(async (bookId: string, index: number, reachedAt: number) => {
    if (!storageProvider) return;
    lastCloudWriteRef.current = Date.now();
    try {
      const result = await storageProvider.updateBookProgress(bookId, index, reachedAt);
      // Mock providers in the e2e suite return nothing.
      if (!result) return;
      // Offline: the position stays pending locally and goes out on reconnect.
      if (result.offline) return;
      markLocalProgressSynced(bookId, index);
      applyServerState(bookId, result);
    } catch (e) {
      console.error('[Progress] Failed to save position', e);
    }
  }, [storageProvider, applyServerState]);

  // Save as the position moves.
  useEffect(() => {
    if (furthestIndex !== null && currentIndex > furthestIndex) setFurthestIndex(currentIndex);

    // Before the book's saved position has been restored, currentIndex is still
    // the default 0 and writing it would clobber real progress.
    if (!currentBookId || !storageProvider || currentBookId !== loadedBookIdRef.current) return;

    const saved = readLocalProgress(currentBookId);
    const isNewPosition = !saved || saved.wordIndex !== currentIndex;
    // A position we only restored or caught up to is not reading, and must not
    // be re-stamped with the current time.
    if (!isNewPosition && !saved.pendingSync) return;

    const now = Date.now();
    if (isNewPosition && (!isPlaying || now - lastLocalWriteRef.current >= LOCAL_WRITE_INTERVAL_MS)) {
      lastLocalWriteRef.current = now;
      recordLocally(currentBookId, currentIndex, now);
    }

    if (isPlaying) {
      // Checkpoint occasionally so a long run is visible on other devices
      // before it ends.
      if (now - lastCloudWriteRef.current >= CLOUD_CHECKPOINT_MS) {
        void pushToCloud(currentBookId, currentIndex, now);
      }
      return;
    }

    const bookId = currentBookId;
    const index = currentIndex;
    // Reading waiting to go out keeps the time it happened, which is what
    // settles a conflict with another device.
    const reachedAt = isNewPosition ? now : (saved.reachedAt || now);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void pushToCloud(bookId, index, reachedAt);
    }, CLOUD_DEBOUNCE_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isPlaying, currentBookId, storageProvider, furthestIndex]);

  /** Writes out whatever is pending, without waiting for the debounce. */
  const flushProgress = useCallback(async (bookId: string, index: number) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const saved = readLocalProgress(bookId);
    const reachedAt = saved && saved.wordIndex === index ? saved.reachedAt : Date.now();
    recordLocally(bookId, index, reachedAt);
    await pushToCloud(bookId, index, reachedAt);
  }, [pushToCloud, recordLocally]);

  // Reconcile with the server on waking, and flush on the way out.
  useEffect(() => {
    if (!storageProvider) return;

    const openBookId = () => {
      const bookId = useReaderStore.getState().currentBookId;
      return bookId && bookId === loadedBookIdRef.current ? bookId : null;
    };

    const resync = async () => {
      const bookId = openBookId();
      if (!bookId || useReaderStore.getState().isPlaying) return;
      const remote = await storageProvider.getBookProgress(bookId);
      // Offline the cached copy says nothing new; the local record already
      // holds this device's reading and stays pending until we can ask again.
      if (!remote || remote.fromCache) return;

      const local = readLocalProgress(bookId);
      const { position, source } = mergeProgress(local, remote);
      if (source === 'remote') {
        applyServerState(bookId, { ...position, accepted: false, offline: false });
      } else if (local?.pendingSync) {
        await pushToCloud(bookId, local.wordIndex, local.reachedAt);
      }
    };

    const flushPending = () => {
      const bookId = openBookId();
      if (!bookId) return;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const index = useReaderStore.getState().currentIndex;
      const saved = readLocalProgress(bookId);
      if (!saved || saved.wordIndex !== index) recordLocally(bookId, index, Date.now());
      else if (!saved.pendingSync) return;
      void pushToCloud(bookId, index, readLocalProgress(bookId)?.reachedAt || Date.now());
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void resync();
      else flushPending();
    };
    const onOnline = () => void resync();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', flushPending);
    void resync();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', flushPending);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageProvider, currentBookId, applyServerState, pushToCloud, recordLocally]);

  return { flushProgress };
}
