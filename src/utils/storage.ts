import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { db as firestore, storage as firebaseStorage } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, getDoc, updateDoc, runTransaction, query, where, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getIncrementalAggregationPlan } from './stats';

export interface RsvpSettings {
  periodMultiplier: number;
  commaMultiplier: number;
  longWordMultiplier: number;
  tooWideMultiplier: number;
  chapterBreakDelay: number;
  orientationDelay: number;
  vanityWpmRatio: number;
}

export interface UserSettings {
  geminiApiKey?: string;
  syncApiKey?: boolean;
  theme?: string;
  fontFamily?: string;
  ttsSpeed?: number;
  autoLandscape?: boolean;
  rsvp?: RsvpSettings;
  onboardingCompleted?: boolean;
  lastUpdated: number;
  lastAggregationTime?: number;
}

export interface BookRecord {
  id: string;
  meta: {
    title: string;
    addedAt: number;
    totalWords?: number;
  };
  progress: {
    wordIndex: number;
    lastReadAt: number;
    furthestWordIndex?: number;
  };
  settings: {
    wpm: number;
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
  type: 'reading' | 'listening';
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
      const snap = await getDoc(this.userDocRef);
      if (snap.exists()) {
        return snap.data() as UserSettings;
      }
    } catch (e) {
      console.error("Firestore settings fetch failed", e);
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

    // 1. Upload to Firebase Storage
    if (firebaseStorage) {
        const storageRef = ref(firebaseStorage, `users/${this.userId}/books/${id}.epub`);
        await uploadBytes(storageRef, file);
        const cloudUrl = await getDownloadURL(storageRef);

        // 2. Create Firestore Metadata
        const bookMeta: BookRecord = {
            id,
            meta: { title, addedAt: now },
            progress: { wordIndex: 0, lastReadAt: now },
            settings: { wpm: 300 },
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
    try {
      const snapshot = await getDocs(this.booksCollection);
      const books = snapshot.docs.map(d => d.data() as BookRecord);
      
      // Attach local files if cached
      for (const book of books) {
          const cached = await this.fileCache.getFile(book.id);
          if (cached) {
              book.storage.localFile = cached;
          }
      }
      // Order books by most recent activity (reading or upload)
      return books.sort((a, b) => b.progress.lastReadAt - a.progress.lastReadAt);
    } catch (e) {
      console.error("Firestore getAllBooks failed", e);
      return [];
    }
  }

  async aggregateSessions(): Promise<void> {
    if (!firestore) return;
    try {
      const settings = await this.getSettings();
      const lastAgg = settings?.lastAggregationTime || 0;

      const newRawSessions = await this.getRawSessions(lastAgg);
      if (newRawSessions.length === 0) return;

      const existingAggregated = await this.getAggregatedSessions();
      const { deleteIds, createSessions } = getIncrementalAggregationPlan(existingAggregated, newRawSessions);

      const maxEndTime = Math.max(...newRawSessions.map(s => s.endTime));

      await runTransaction(firestore, async (transaction) => {
        for (const id of deleteIds) {
          transaction.delete(doc(this.aggregatedSessionsCollection, id));
        }
        for (const s of createSessions) {
          transaction.set(doc(this.aggregatedSessionsCollection, s.id), s);
        }
        transaction.update(this.userDocRef, { lastAggregationTime: maxEndTime });
      });
      console.log(`[Storage] Incremental aggregation: ${newRawSessions.length} new raw sessions processed.`);
    } catch (e) {
      console.error("Aggregation transaction failed", e);
    }
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
          file = new File([blob], `${book.meta.title}.epub`, { type: 'application/epub+zip' });
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
      await deleteDoc(doc(this.booksCollection, id));
      await this.fileCache.deleteFile(id);
      if (firebaseStorage) {
          await deleteObject(ref(firebaseStorage, `users/${this.userId}/books/${id}.epub`));
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

  async updateBookRealEndQuote(id: string, quote: string): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { 'analysis.realEndQuote': quote });
  }

  async updateBookRealEndIndex(id: string, index: number): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { 'analysis.realEndIndex': index });
  }

  async updateBookTotalWords(id: string, totalWords: number): Promise<void> {
    await updateDoc(doc(this.booksCollection, id), { 'meta.totalWords': totalWords });
  }

  async logReadingSession(sessionData: Omit<ReadingSession, 'id'>): Promise<void> {
    const sessionRef = doc(this.sessionsCollection);
    await setDoc(sessionRef, { ...sessionData, id: sessionRef.id });
  }

  async getRawSessions(since: number = 0): Promise<ReadingSession[]> {
    try {
      const q = query(
        this.sessionsCollection,
        where('startTime', '>', since),
        orderBy('startTime', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as ReadingSession);
    } catch (e) {
      console.error("Firestore getRawSessions failed", e);
      return [];
    }
  }

  async getAggregatedSessions(bookId?: string): Promise<ReadingSession[]> {
    try {
      const snapshot = await getDocs(this.aggregatedSessionsCollection);
      let sessions = snapshot.docs.map(d => d.data() as ReadingSession);
      if (bookId) {
        sessions = sessions.filter(s => s.bookId === bookId);
      }
      return sessions.sort((a, b) => b.startTime - a.startTime);
    } catch (e) {
      console.error("Firestore getAggregatedSessions failed", e);
      return [];
    }
  }

  async getSessions(bookId?: string): Promise<ReadingSession[]> {
    return this.getAggregatedSessions(bookId);
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
