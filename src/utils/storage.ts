import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { db as firestore, storage as firebaseStorage } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, getDoc, updateDoc, runTransaction, writeBatch, query, where, orderBy, getDocFromCache, getDocsFromCache } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { buildAggregatedSessions, getAggregationPlan, isImplausiblySlowSession, getSessionWordsRead } from './stats';

export interface RsvpSettings {
  periodMultiplier: number;
  commaMultiplier: number;
  longWordMultiplier: number;
  tooWideMultiplier: number;
  chapterBreakDelay: number;
  orientationDelay: number;
  vanityWpmRatio: number;
  wpmRampDuration: number;
  previewWordCount: number;
}

export type ReadingMode = 'rsvp' | 'paginated';

export interface UserSettings {
  geminiApiKey?: string;
  syncApiKey?: boolean;
  theme?: string;
  fontFamily?: string;
  ttsSpeed?: number;
  autoLandscape?: boolean;
  rsvp?: RsvpSettings;
  onboardingCompleted?: boolean;
  readingMode?: ReadingMode;
  paginatedFontSize?: number;
  lastBookId?: string | null;
  lastUpdated: number;
  /** @deprecated Aggregation is now a pure rebuild from the raw session log,
   *  so no watermark is needed. Left on the type to describe existing docs. */
  lastAggregationTime?: number;
  apiSyncToken?: string;
}

export interface BookRecord {
  id: string;
  archived?: boolean;
  meta: {
    title: string;
    addedAt: number;
    totalWords?: number;
    extension?: string;
    dateFinished?: number;
  };
  progress: {
    wordIndex: number;
    lastReadAt: number;
    furthestWordIndex?: number;
    cumulativeWordsRead?: number;
    cumulativeExpectedWords?: number;
    cumulativeDurationSeconds?: number;
  };
  settings: {
    wpm: number;
    vanityWpmRatio?: number;
  };
  analysis: {
    realEndQuote?: string;
    realEndIndex?: number;
  };
  storage: {
    cloudUrl?: string;
    localFile?: File | Blob; // Not stored in Firestore, attached at runtime
  };
}

export interface IllustrationRecord {
  id: string;
  prompt: string;
  url: string;
  createdAt: number;
  wordIndex: number;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  bookTitle: string;
  startTime: number;
  endTime: number;
  startWordIndex: number;
  endWordIndex: number;
  wordsRead: number;
  durationSeconds: number;
  type: 'reading' | 'listening' | 'rsvp' | 'paginated';
}

export interface AudioChunk {
  audio: ArrayBuffer;
  startIndex: number;
  wordCount: number;
}

// Keep local cache for heavy assets (EPUBs + Audio)
interface FileCacheDB extends DBSchema {
  files: {
    key: string;
    value: Blob; // Keyed by bookId
  };
  chapterAudio: {
    key: string;
    value: { id: string; chunks: AudioChunk[] };
  };
}

const DB_NAME = 'epub-rsvp-files';
const FILE_STORE = 'files';
const AUDIO_STORE = 'chapterAudio';

// Helper for local file caching
class LocalFileCache {
  private dbPromise: Promise<IDBPDatabase<FileCacheDB>>;

  constructor() {
    this.dbPromise = openDB<FileCacheDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(FILE_STORE);
        db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
      },
    });
  }

  async getFile(bookId: string): Promise<Blob | undefined> {
    return (await this.dbPromise).get(FILE_STORE, bookId);
  }

  async saveFile(bookId: string, file: Blob): Promise<void> {
    await (await this.dbPromise).put(FILE_STORE, file, bookId);
  }

  async deleteFile(bookId: string): Promise<void> {
    await (await this.dbPromise).delete(FILE_STORE, bookId);
  }

  async getAudio(id: string): Promise<AudioChunk[] | undefined> {
    const record = await (await this.dbPromise).get(AUDIO_STORE, id);
    return record?.chunks;
  }

  async saveAudio(id: string, chunks: AudioChunk[]): Promise<void> {
    await (await this.dbPromise).put(AUDIO_STORE, { id, chunks });
  }
}

// Main Storage Provider (Firestore + Local File Cache)
export class FirestoreStorage {
  private fileCache = new LocalFileCache();
  private userId: string;
  private aggregationInFlight: Promise<ReadingSession[]> | null = null;
  private pendingSessions: ReadingSession[] = [];

  constructor(userId: string) {
    this.userId = userId;
    if (!firestore) throw new Error("Firestore not initialized");
  }

  private get userDocRef() {
    return doc(firestore!, 'users', this.userId);
  }

  private get booksCollection() {
    return collection(this.userDocRef, 'books');
  }

  private get sessionsCollection() {
    return collection(this.userDocRef, 'sessions');
  }

  private get aggregatedSessionsCollection() {
    return collection(this.userDocRef, 'aggregatedSessions');
  }

  async getSettings(): Promise<UserSettings | null> {
    try {
      console.log("[Storage] Fetching settings...");
      const snap = await getDoc(this.userDocRef);
      console.log(`[Storage] Settings found: ${snap.exists()}. From cache: ${snap.metadata.fromCache}`);
      if (snap.exists()) {
        return snap.data() as UserSettings;
      }
    } catch (e) {
      console.warn("[Storage] Fetch settings failed, trying cache...", e);
      try {
        const snap = await getDocFromCache(this.userDocRef);
        if (snap.exists()) {
          return snap.data() as UserSettings;
        }
      } catch (cacheErr) {
        console.error("[Storage] Cache settings fetch also failed", cacheErr);
      }
    }
    return null;
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<void> {
    try {
      await setDoc(this.userDocRef, { ...settings, lastUpdated: Date.now() }, { merge: true });
    } catch (e) {
      console.error("Firestore settings sync failed", e);
    }
  }

  async addBook(file: File, title: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'epub';

    // 1. Upload to Firebase Storage
    if (firebaseStorage) {
        const storageRef = ref(firebaseStorage, `users/${this.userId}/books/${id}.${extension}`);
        await uploadBytes(storageRef, file);
        const cloudUrl = await getDownloadURL(storageRef);

        // 2. Create Firestore Metadata
        const bookMeta: BookRecord = {
            id,
            meta: { title, addedAt: now, extension },
            progress: { wordIndex: 0, lastReadAt: now },
            settings: {
              wpm: 300
            },
            analysis: {},
            storage: { cloudUrl }
        };
        // Remove localFile before sending to Firestore
        delete (bookMeta.storage as any).localFile;
        await setDoc(doc(this.booksCollection, id), bookMeta);
    }

    // 3. Cache file locally for immediate use
    await this.fileCache.saveFile(id, file);
    return id;
  }

  async getAllBooks(): Promise<BookRecord[]> {
    let snapshot;
    try {
      console.log("[Storage] Fetching books...");
      snapshot = await getDocs(this.booksCollection);
      console.log(`[Storage] Found ${snapshot.docs.length} books. From cache: ${snapshot.metadata.fromCache}`);
    } catch (e) {
      console.warn("[Storage] Fetch books failed, trying cache...", e);
      try {
        snapshot = await getDocsFromCache(this.booksCollection);
        console.log(`[Storage] Found ${snapshot.docs.length} books in cache.`);
      } catch (cacheErr) {
        console.error("[Storage] Cache books fetch also failed", cacheErr);
        return [];
      }
    }

    const books = snapshot.docs.map(d => d.data() as BookRecord);
    
    // Attach local files if cached
    for (const book of books) {
        const cached = await this.fileCache.getFile(book.id);
        if (cached) {
            book.storage.localFile = cached;
        }
    }
    // Order books by most recent activity (reading or upload)
    return books.sort((a, b) => (b.progress?.lastReadAt || 0) - (a.progress?.lastReadAt || 0));
  }

  /**
   * Rebuilds the per-day aggregates from the raw session log and returns them.
   *
   * Returning the freshly computed sessions (rather than making callers re-read
   * the collection) keeps the stats screen correct offline: the raw sessions
   * are served from the local Firestore cache and the aggregates are derived in
   * memory, so nothing on this path needs a round trip to succeed.
   */
  async aggregateSessions(): Promise<ReadingSession[]> {
    // Aggregation is triggered from several places that can fire in the same
    // burst on load. Without this guard each run read the collection before any
    // of the others had written, and they all wrote separate documents.
    if (!this.aggregationInFlight) {
      this.aggregationInFlight = this.runAggregation()
        .finally(() => { this.aggregationInFlight = null; });
    }
    return this.aggregationInFlight;
  }

  private async runAggregation(): Promise<ReadingSession[]> {
    if (!firestore) return [];
    try {
      const [fetched, existingAggregated] = await Promise.all([
        this.readCollectionCached(this.sessionsCollection),
        this.getAggregatedSessions(),
      ]);

      // A failed read must never be mistaken for "the user has no history" —
      // acting on it would delete every aggregate.
      if (fetched === null) return existingAggregated;

      const fetchedIds = new Set(fetched.map(s => s.id));
      this.pendingSessions = this.pendingSessions.filter(s => !fetchedIds.has(s.id));
      const rawSessions = [...fetched, ...this.pendingSessions];
      if (rawSessions.length === 0) return [];

      const { deleteIds, upsertSessions, sessions } = getAggregationPlan(existingAggregated, rawSessions);

      if (deleteIds.length > 0 || upsertSessions.length > 0) {
        console.log(`[Storage] Aggregation: ${rawSessions.length} raw sessions -> ${sessions.length} daily aggregates (${upsertSessions.length} written, ${deleteIds.length} stale removed).`);
        this.writeAggregates(deleteIds, upsertSessions);
      }

      return sessions;
    } catch (e) {
      console.error("Aggregation failed", e);
      return this.getAggregatedSessions();
    }
  }

  /**
   * Persists the aggregation plan. Uses batched writes rather than a
   * transaction: a transaction needs a server round trip and so fails while
   * offline, whereas a batch is applied to the local cache immediately and
   * flushed on reconnect. The commit is intentionally not awaited for the same
   * reason — offline it only settles once the network returns.
   */
  private writeAggregates(deleteIds: string[], upsertSessions: ReadingSession[]): void {
    if (!firestore) return;
    const MAX_BATCH_OPS = 450; // Firestore's hard limit is 500.
    const ops: (() => void)[] = [];
    let batch = writeBatch(firestore);

    const flush = () => {
      const pending = batch;
      batch = writeBatch(firestore!);
      pending.commit().catch(e => console.error("Aggregation write failed", e));
    };

    for (const id of deleteIds) {
      ops.push(() => batch.delete(doc(this.aggregatedSessionsCollection, id)));
    }
    for (const s of upsertSessions) {
      ops.push(() => batch.set(doc(this.aggregatedSessionsCollection, s.id), s));
    }

    ops.forEach((op, i) => {
      op();
      if ((i + 1) % MAX_BATCH_OPS === 0) flush();
    });
    if (ops.length % MAX_BATCH_OPS !== 0) flush();
  }

  async getBook(id: string): Promise<BookRecord | undefined> {
    try {
      // 1. Get Metadata
      const snap = await getDoc(doc(this.booksCollection, id));
      if (!snap.exists()) return undefined;
      const book = snap.data() as BookRecord;

      // 2. Get File (Cache -> Cloud)
      let file = await this.fileCache.getFile(id);
      if (!file && book.storage.cloudUrl) {
          console.log(`[Storage] Downloading ${book.meta.title} from cloud...`);
          const response = await fetch(book.storage.cloudUrl);
          const blob = await response.blob();
          const extension = book.meta.extension || 'epub';
          const mimeType = extension === 'pdf' ? 'application/pdf' : 'application/epub+zip';
          file = new File([blob], `${book.meta.title}.${extension}`, { type: mimeType });
          await this.fileCache.saveFile(id, file);
      }
      book.storage.localFile = file;
      return book;
    } catch (e) {
      console.error("Firestore getBook failed", e);
      return undefined;
    }
  }

  async deleteBook(id: string): Promise<void> {
    try {
      const snap = await getDoc(doc(this.booksCollection, id));
      const extension = snap.exists() ? (snap.data() as BookRecord).meta.extension || 'epub' : 'epub';

      await deleteDoc(doc(this.booksCollection, id));
      await this.fileCache.deleteFile(id);
      if (firebaseStorage) {
          await deleteObject(ref(firebaseStorage, `users/${this.userId}/books/${id}.${extension}`));
      }
    } catch (e) {
      console.error("Delete failed", e);
    }
  }

  async updateBookProgress(id: string, index: number): Promise<void> {
    try {
      // Fetch current book to check existing furthest progress
      const currentBookRef = doc(this.booksCollection, id);
      const snap = await getDoc(currentBookRef);
      
      let furthest = index;
      if (snap.exists()) {
        const data = snap.data() as BookRecord;
        const previousFurthest = data.progress.furthestWordIndex || data.progress.wordIndex;
        furthest = Math.max(index, previousFurthest);
      }

      await updateDoc(currentBookRef, {
        'progress.wordIndex': index,
        'progress.lastReadAt': Date.now(),
        'progress.furthestWordIndex': furthest
      });
    } catch (e) {
      console.error("Failed to update progress", e);
    }
  }

  async updateBookWpm(id: string, wpm: number): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { 'settings.wpm': wpm });
  }

  async updateBookStats(id: string, stats: Partial<BookRecord['progress'] & { vanityWpmRatio?: number; wpm?: number }>): Promise<void> {
    const updates: any = {};
    if (stats.cumulativeWordsRead !== undefined) updates['progress.cumulativeWordsRead'] = stats.cumulativeWordsRead;
    if (stats.cumulativeExpectedWords !== undefined) updates['progress.cumulativeExpectedWords'] = stats.cumulativeExpectedWords;
    if (stats.cumulativeDurationSeconds !== undefined) updates['progress.cumulativeDurationSeconds'] = stats.cumulativeDurationSeconds;
    if (stats.vanityWpmRatio !== undefined) updates['settings.vanityWpmRatio'] = stats.vanityWpmRatio;
    if (stats.wpm !== undefined) updates['settings.wpm'] = stats.wpm;

    if (Object.keys(updates).length > 0) {
      await updateDoc(doc(this.booksCollection, id), updates);
    }
  }

  async updateBookRealEndQuote(id: string, quote: string): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { 'analysis.realEndQuote': quote });
  }

  async updateBookRealEndIndex(id: string, index: number): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { 'analysis.realEndIndex': index });
  }

  async updateBookTotalWords(id: string, totalWords: number): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { 'meta.totalWords': totalWords });
  }

  async updateBookFinishedDate(id: string, date: number): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { 'meta.dateFinished': date });
  }

  async updateBookArchived(id: string, archived: boolean): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { archived });
  }

  async updateBookTitle(id: string, title: string): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { 'meta.title': title });
  }

  async addIllustration(bookId: string, prompt: string, base64: string, wordIndex: number): Promise<IllustrationRecord> {
    const id = crypto.randomUUID();
    const now = Date.now();

    let url = "";
    if (firebaseStorage) {
        const storageRef = ref(firebaseStorage, `users/${this.userId}/books/${bookId}/illustrations/${id}.png`);
        const response = await fetch(`data:image/png;base64,${base64}`);
        const blob = await response.blob();
        await uploadBytes(storageRef, blob);
        url = await getDownloadURL(storageRef);
    }

    const illustration: IllustrationRecord = {
        id,
        prompt,
        url,
        createdAt: now,
        wordIndex
    };

    const illustrationsColl = collection(this.booksCollection, bookId, 'illustrations');
    await setDoc(doc(illustrationsColl, id), illustration);

    return illustration;
  }

  async getIllustrations(bookId: string): Promise<IllustrationRecord[]> {
    const illustrationsColl = collection(this.booksCollection, bookId, 'illustrations');
    const q = query(illustrationsColl, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as IllustrationRecord);
  }

  async logReadingSession(sessionData: Omit<ReadingSession, 'id'>): Promise<void> {
    const sessionRef = doc(this.sessionsCollection);
    const session: ReadingSession = { ...sessionData, id: sessionRef.id };

    // Held so the next aggregation reflects this session even though the write
    // below has not been acknowledged yet. Offline that acknowledgement only
    // arrives on reconnect, and awaiting it used to stall the stats refresh
    // that callers chain onto this promise.
    this.pendingSessions.push(session);

    setDoc(sessionRef, session).catch(e => console.error("Failed to persist reading session", e));
  }

  /**
   * Reads a collection, falling back to the offline cache.
   *
   * getDocs() normally resolves from the local cache on its own when the device
   * is offline, but on a connection that is reachable-yet-dead (captive portal,
   * dropped tunnel) it can sit waiting for a server that never answers. The
   * timeout means the stats screen renders from cache instead of hanging.
   */
  private async readCollectionCached(coll: ReturnType<typeof collection>): Promise<ReadingSession[] | null> {
    const SERVER_READ_TIMEOUT_MS = 4000;
    const toSessions = (snap: Awaited<ReturnType<typeof getDocs>>) =>
      snap.docs.map(d => d.data() as ReadingSession);

    const server = getDocs(coll);
    // Swallow the rejection here so the losing side of the race below can never
    // surface as an unhandled rejection.
    const serverResult = server.then(toSessions, () => null);

    const timedOut = Symbol('timeout');
    let timerId: ReturnType<typeof setTimeout>;
    const timer = new Promise<typeof timedOut>(resolve => {
      timerId = setTimeout(() => resolve(timedOut), SERVER_READ_TIMEOUT_MS);
    });

    const first = await Promise.race([serverResult, timer]).finally(() => clearTimeout(timerId));
    if (first !== timedOut && first !== null) return first;

    try {
      return toSessions(await getDocsFromCache(coll));
    } catch (cacheErr) {
      if (first === timedOut) {
        // Nothing cached yet, so the slow server read is the only hope.
        const eventual = await serverResult;
        if (eventual) return eventual;
      }
      console.error("[Storage] Collection read failed online and from cache", cacheErr);
      return null;
    }
  }

  /**
   * The full raw session log. This is the source of truth for all reading
   * stats; the aggregated collection is only a derived cache of it.
   */
  async getRawSessions(): Promise<ReadingSession[]> {
    return (await this.readCollectionCached(this.sessionsCollection)) ?? [];
  }

  async getAggregatedSessions(bookId?: string): Promise<ReadingSession[]> {
    let sessions = (await this.readCollectionCached(this.aggregatedSessionsCollection)) ?? [];
    if (bookId) {
      sessions = sessions.filter(s => s.bookId === bookId);
    }
    return sessions.sort((a, b) => b.startTime - a.startTime);
  }

  async getSessions(bookId?: string): Promise<ReadingSession[]> {
    return this.getAggregatedSessions(bookId);
  }

  async clearFutureSessions(bookId: string, currentIndex: number): Promise<void> {
    if (!firestore) return;

    // 1. Find ALL raw sessions for this book
    const allSessionsQ = query(
      this.sessionsCollection,
      where('bookId', '==', bookId)
    );
    const allSessionsSnap = await getDocs(allSessionsQ);
    const allRawSessions = allSessionsSnap.docs.map(d => d.data() as ReadingSession);

    const remainingRawSessions = allRawSessions.filter(s => s.endWordIndex <= currentIndex);
    const sessionsToDeleteRefs = allSessionsSnap.docs
      .filter(d => (d.data() as ReadingSession).endWordIndex > currentIndex)
      .map(d => d.ref);

    // 2. Find ALL aggregated sessions for this book
    const aggQ = query(
      this.aggregatedSessionsCollection,
      where('bookId', '==', bookId)
    );
    const aggSnap = await getDocs(aggQ);

    // 3. Calculate new cumulative stats from remaining raw sessions
    let newCumulativeWords = 0;
    let newCumulativeDuration = 0;
    for (const s of remainingRawSessions) {
      newCumulativeWords += (s.wordsRead || Math.max(0, s.endWordIndex - s.startWordIndex));
      newCumulativeDuration += s.durationSeconds;
    }
    // Reset calibration by setting expected equal to actual words
    const newCumulativeExpected = newCumulativeWords;

    // 4. Aggregate remaining sessions locally
    const createSessions = buildAggregatedSessions(remainingRawSessions);
    const survivingAggIds = new Set(createSessions.map(s => s.id));

    // 5. Run transaction to apply all changes atomically
    await runTransaction(firestore, async (transaction) => {
      // Delete raw sessions
      for (const ref of sessionsToDeleteRefs) {
        transaction.delete(ref);
      }
      // Delete aggregates that the surviving sessions no longer produce. Ids
      // are derived from the session key, so anything still in the new set is
      // overwritten below rather than deleted and re-created.
      for (const d of aggSnap.docs.filter(d => !survivingAggIds.has(d.id))) {
        transaction.delete(d.ref);
      }
      // Set NEW aggregated sessions
      for (const s of createSessions) {
        transaction.set(doc(this.aggregatedSessionsCollection, s.id), s);
      }

      // Update book's furthestWordIndex and reset cumulative stats
      const bookRef = doc(this.booksCollection, bookId);
      transaction.update(bookRef, {
        'progress.furthestWordIndex': currentIndex,
        'progress.cumulativeWordsRead': newCumulativeWords,
        'progress.cumulativeExpectedWords': newCumulativeExpected,
        'progress.cumulativeDurationSeconds': newCumulativeDuration
      });

      // Note: We do NOT reset the global lastAggregationTime here.
      // The targeted re-aggregation above handles the consistency for this book.
    });
  }

  async deleteRecentSessions(bookId: string, hours: number = 1): Promise<void> {
    if (!firestore) return;

    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    
    // 1. Find recent raw sessions for this book
    const rawSessionsQ = query(
      this.sessionsCollection,
      where('bookId', '==', bookId)
    );
    const rawSessionsSnap = await getDocs(rawSessionsQ);

    // 2. Find recent aggregated sessions for this book
    const aggQ = query(
      this.aggregatedSessionsCollection,
      where('bookId', '==', bookId)
    );
    const aggSnap = await getDocs(aggQ);

    const rawToDelete = rawSessionsSnap.docs.filter(d => (d.data() as ReadingSession).startTime >= cutoffTime);
    const aggToDelete = aggSnap.docs.filter(d => (d.data() as ReadingSession).startTime >= cutoffTime);

    // 3. Delete them atomically
    await runTransaction(firestore, async (transaction) => {
      for (const d of rawToDelete) {
        transaction.delete(d.ref);
      }
      for (const d of aggToDelete) {
        transaction.delete(d.ref);
      }
    });
    
    // Note: We avoid eagerly recalculating cumulative progress attributes here 
    // to strictly preserve the visual progress index during debug purges.
  }

  /**
   * Deletes raw reading sessions whose effective speed is physically
   * implausible (e.g. an old entry showing a single page "read" over many
   * hours, caused by historical timing bugs) and recomputes the affected books'
   * cumulative stats from what survives.
   *
   * The aggregated collection is not touched here: it is rebuilt from the raw
   * log by aggregateSessions(), which runs straight after this on load, so any
   * implausible aggregate disappears on its own.
   *
   * Returns the number of session documents removed.
   */
  async pruneImplausibleSessions(): Promise<number> {
    if (!firestore) return 0;

    try {
      const rawSessions = await this.getRawSessions();
      const implausible = rawSessions.filter(isImplausiblySlowSession);
      if (implausible.length === 0) return 0;

      const implausibleIds = new Set(implausible.map(s => s.id));
      const affectedBookIds = new Set(implausible.map(s => s.bookId));
      let deletedCount = 0;

      // Rebuild each affected book independently to keep the batches small.
      for (const bookId of affectedBookIds) {
        const bookSessions = rawSessions.filter(s => s.bookId === bookId);
        const toDelete = bookSessions.filter(s => implausibleIds.has(s.id));
        const remaining = bookSessions.filter(s => !implausibleIds.has(s.id));

        // Recompute cumulative stats from the surviving raw sessions.
        let cumulativeWords = 0;
        let cumulativeDuration = 0;
        for (const s of remaining) {
          cumulativeWords += getSessionWordsRead(s);
          cumulativeDuration += s.durationSeconds;
        }

        // A batch rather than a transaction so this stays usable offline; the
        // book document is read up front instead of inside a transaction.
        const bookRef = doc(this.booksCollection, bookId);
        const bookSnap = await getDoc(bookRef);
        const batch = writeBatch(firestore);
        for (const s of toDelete) batch.delete(doc(this.sessionsCollection, s.id));
        if (bookSnap.exists()) {
          batch.update(bookRef, {
            'progress.cumulativeWordsRead': cumulativeWords,
            'progress.cumulativeExpectedWords': cumulativeWords,
            'progress.cumulativeDurationSeconds': cumulativeDuration,
          });
        }
        // Not awaited: offline a commit only settles once the network returns,
        // and this runs on the app's load path.
        batch.commit().catch(e => console.error("Prune write failed", e));

        deletedCount += toDelete.length;
      }

      console.log(`[Storage] Pruned implausibly slow sessions across ${affectedBookIds.size} book(s); removed ${deletedCount} session doc(s).`);
      return deletedCount;
    } catch (e) {
      console.error("Failed to prune implausible sessions", e);
      return 0;
    }
  }

  async saveChapterAudio(bookId: string, chapterIndex: number, speed: number, chunks: AudioChunk[]): Promise<void> {
    const id = `${bookId}-${chapterIndex}-${speed}`;
    await this.fileCache.saveAudio(id, chunks);
  }

  async getChapterAudio(bookId: string, chapterIndex: number, speed: number): Promise<AudioChunk[] | undefined> {
    const id = `${bookId}-${chapterIndex}-${speed}`;
    return this.fileCache.getAudio(id);
  }
}
