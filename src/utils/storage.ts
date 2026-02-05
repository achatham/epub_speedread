import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { db as firestore, storage as firebaseStorage } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export interface UserSettings {
  geminiApiKey?: string;
  theme?: string;
  fontFamily?: string;
  ttsSpeed?: number;
  lastUpdated: number;
}

export interface BookRecord {
  id: string;
  meta: {
    title: string;
    addedAt: number;
  };
  progress: {
    wordIndex: number;
    lastReadAt: number;
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
    localFile?: File | Blob;
  };
}

export interface ReadingSession {
  id: string;
  bookId: string;
  startTime: number;
  endTime: number;
  startWordIndex: number;
  endWordIndex: number;
  durationSeconds: number;
}

export interface ChapterAudioRecord {
  id: string;
  audioChunks: ArrayBuffer[];
}

interface RSVPDB extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
  };
  sessions: {
    key: string;
    value: ReadingSession;
    indexes: { 'by-book': string };
  };
  chapterAudio: {
    key: string;
    value: ChapterAudioRecord;
  };
}

const DB_NAME = 'epub-rsvp-db-v2';
const STORE_NAME = 'books';
const SESSIONS_STORE_NAME = 'sessions';
const AUDIO_STORE_NAME = 'chapterAudio';

export interface StorageProvider {
  // User Settings
  getSettings(): Promise<UserSettings | null>;
  updateSettings(settings: Partial<UserSettings>): Promise<void>;

  // Books
  addBook(file: File, title: string): Promise<string>;
  getAllBooks(): Promise<BookRecord[]>;
  getBook(id: string): Promise<BookRecord | undefined>;
  deleteBook(id: string): Promise<void>;
  updateBookProgress(id: string, index: number): Promise<void>;
  updateBookWpm(id: string, wpm: number): Promise<void>;
  updateBookRealEndQuote(id: string, quote: string): Promise<void>;
  updateBookRealEndIndex(id: string, index: number): Promise<void>;
  
  // Sessions
  logReadingSession(session: Omit<ReadingSession, 'id'>): Promise<void>;

  // Audio
  saveChapterAudio(bookId: string, chapterIndex: number, speed: number, audioChunks: ArrayBuffer[]): Promise<void>;
  getChapterAudio(bookId: string, chapterIndex: number, speed: number): Promise<ArrayBuffer[] | undefined>;
}

export class LocalStorage implements StorageProvider {
  private dbPromise: Promise<IDBPDatabase<RSVPDB>>;

  constructor() {
    this.dbPromise = openDB<RSVPDB>(DB_NAME, 2, { // Bump version for sessions store
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            db.createObjectStore(AUDIO_STORE_NAME, { keyPath: 'id' });
        }
        if (oldVersion < 2) {
            const sessionStore = db.createObjectStore(SESSIONS_STORE_NAME, { keyPath: 'id' });
            sessionStore.createIndex('by-book', 'bookId');
        }
      },
    });
  }

  async getSettings(): Promise<UserSettings | null> {
    const saved = localStorage.getItem('user_settings');
    return saved ? JSON.parse(saved) : null;
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<void> {
    const current = await this.getSettings() || { lastUpdated: 0 };
    const updated = { ...current, ...settings, lastUpdated: Date.now() };
    localStorage.setItem('user_settings', JSON.stringify(updated));
  }

  async addBook(file: File, title: string): Promise<string> {
    const db = await this.dbPromise;
    const id = crypto.randomUUID();
    const now = Date.now();
    const book: BookRecord = {
      id,
      meta: { title, addedAt: now },
      progress: { wordIndex: 0, lastReadAt: now },
      settings: { wpm: 300 },
      analysis: {},
      storage: { localFile: file }
    };
    await db.put(STORE_NAME, book);
    return id;
  }

  async getAllBooks(): Promise<BookRecord[]> {
    const db = await this.dbPromise;
    const books = await db.getAll(STORE_NAME);
    return books.sort((a, b) => b.meta.addedAt - a.meta.addedAt);
  }

  async getBook(id: string): Promise<BookRecord | undefined> {
    const db = await this.dbPromise;
    return db.get(STORE_NAME, id);
  }

  async deleteBook(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(STORE_NAME, id);
    // Also delete sessions? For now we keep them or can implement cascade delete
  }

  async updateBookProgress(id: string, index: number): Promise<void> {
    const db = await this.dbPromise;
    const book = await db.get(STORE_NAME, id);
    if (book) {
      book.progress.wordIndex = index;
      book.progress.lastReadAt = Date.now();
      await db.put(STORE_NAME, book);
    }
  }

  async updateBookWpm(id: string, wpm: number): Promise<void> {
    const db = await this.dbPromise;
    const book = await db.get(STORE_NAME, id);
    if (book) {
      book.settings.wpm = wpm;
      await db.put(STORE_NAME, book);
    }
  }

  async updateBookRealEndQuote(id: string, quote: string): Promise<void> {
    const db = await this.dbPromise;
    const book = await db.get(STORE_NAME, id);
    if (book) {
      book.analysis.realEndQuote = quote;
      await db.put(STORE_NAME, book);
    }
  }

  async updateBookRealEndIndex(id: string, index: number): Promise<void> {
    const db = await this.dbPromise;
    const book = await db.get(STORE_NAME, id);
    if (book) {
      book.analysis.realEndIndex = index;
      await db.put(STORE_NAME, book);
    }
  }

  async logReadingSession(sessionData: Omit<ReadingSession, 'id'>): Promise<void> {
      const db = await this.dbPromise;
      const id = crypto.randomUUID();
      await db.put(SESSIONS_STORE_NAME, { ...sessionData, id });
  }

  async saveChapterAudio(bookId: string, chapterIndex: number, speed: number, audioChunks: ArrayBuffer[]): Promise<void> {
    const db = await this.dbPromise;
    const id = `${bookId}-${chapterIndex}-${speed}`;
    await db.put(AUDIO_STORE_NAME, { id, audioChunks });
  }

  async getChapterAudio(bookId: string, chapterIndex: number, speed: number): Promise<ArrayBuffer[] | undefined> {
    const db = await this.dbPromise;
    const id = `${bookId}-${chapterIndex}-${speed}`;
    const record = await db.get(AUDIO_STORE_NAME, id);
    return record?.audioChunks;
  }
}

export class CloudStorage implements StorageProvider {
  private local: LocalStorage;
  private userId: string;

  constructor(local: LocalStorage, userId: string) {
    this.local = local;
    this.userId = userId;
  }

  private get userDocRef() {
    if (!firestore) throw new Error("Firestore not initialized");
    return doc(firestore, 'users', this.userId);
  }

  private get booksCollection() {
    return collection(this.userDocRef, 'books');
  }

  async getSettings(): Promise<UserSettings | null> {
    const localSettings = await this.local.getSettings();
    if (!firestore) return localSettings;

    try {
      const snap = await getDoc(this.userDocRef);
      if (snap.exists()) {
        const cloudSettings = snap.data() as UserSettings;
        if (!localSettings || cloudSettings.lastUpdated > localSettings.lastUpdated) {
          await this.local.updateSettings(cloudSettings);
          return cloudSettings;
        }
      }
    } catch (e) {
      console.error("Cloud settings fetch failed", e);
    }
    return localSettings;
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<void> {
    await this.local.updateSettings(settings);
    if (firestore) {
      try {
        const updated = await this.local.getSettings();
        await setDoc(this.userDocRef, updated, { merge: true });
      } catch (e) {
        console.error("Cloud settings sync failed", e);
      }
    }
  }

  async addBook(file: File, title: string): Promise<string> {
    const id = await this.local.addBook(file, title);
    if (firestore && firebaseStorage) {
      try {
        const storageRef = ref(firebaseStorage, `users/${this.userId}/books/${id}.epub`);
        await uploadBytes(storageRef, file);
        const cloudUrl = await getDownloadURL(storageRef);

        const book = await this.local.getBook(id);
        if (book) {
          const cloudBook: any = { ...book, storage: { cloudUrl } };
          if (cloudBook.storage) {
            delete cloudBook.storage.localFile;
          }
          await setDoc(doc(this.booksCollection, id), cloudBook);
        }
      } catch (e) {
        console.error("Cloud sync failed for addBook", e);
      }
    }
    return id;
  }

  async getAllBooks(): Promise<BookRecord[]> {
    const localBooks = await this.local.getAllBooks();
    const localMap = new Map(localBooks.map(b => [b.id, b]));

    if (firestore) {
      try {
        const snapshot = await getDocs(this.booksCollection);
        const cloudBooks = snapshot.docs.map(d => d.data() as BookRecord);

        for (const cloudBook of cloudBooks) {
          const localBook = localMap.get(cloudBook.id);
          if (!localBook || cloudBook.progress.lastReadAt > localBook.progress.lastReadAt) {
            const merged = localBook 
              ? { ...cloudBook, storage: { ...cloudBook.storage, localFile: localBook.storage.localFile } }
              : { ...cloudBook, storage: { ...cloudBook.storage, localFile: undefined } };
            localMap.set(cloudBook.id, merged);
          }
        }
      } catch (e) {
        console.error("Cloud fetch failed", e);
      }
    }
    return Array.from(localMap.values()).sort((a, b) => b.progress.lastReadAt - a.progress.lastReadAt);
  }

  async getBook(id: string): Promise<BookRecord | undefined> {
    let book = await this.local.getBook(id);
    if (!book && firestore) {
      try {
        const snap = await getDoc(doc(this.booksCollection, id));
        if (snap.exists()) {
          const data = snap.data() as BookRecord;
          if (data.storage.cloudUrl) {
            const response = await fetch(data.storage.cloudUrl);
            const blob = await response.blob();
            const file = new File([blob], `${data.meta.title}.epub`, { type: 'application/epub+zip' });
            book = { ...data, storage: { ...data.storage, localFile: file } };
          }
        }
      } catch (e) {
        console.error("Failed to fetch cloud book", e);
      }
    }
    return book;
  }

  async deleteBook(id: string): Promise<void> {
    await this.local.deleteBook(id);
    if (firestore && firebaseStorage) {
      try {
        await deleteDoc(doc(this.booksCollection, id));
        await deleteObject(ref(firebaseStorage, `users/${this.userId}/books/${id}.epub`));
      } catch (e) {
        console.warn("Cloud delete failed", e);
      }
    }
  }

  async updateBookProgress(id: string, index: number): Promise<void> {
    await this.local.updateBookProgress(id, index);
    if (firestore) {
      try {
        await updateDoc(doc(this.booksCollection, id), {
          'progress.wordIndex': index,
          'progress.lastReadAt': Date.now()
        });
      } catch (e) {
        console.error("Cloud progress sync failed", e);
      }
    }
  }

  async updateBookWpm(id: string, wpm: number): Promise<void> {
    await this.local.updateBookWpm(id, wpm);
    if (firestore) {
      try {
        await updateDoc(doc(this.booksCollection, id), { 'settings.wpm': wpm });
      } catch (e) {
        console.error("Cloud wpm sync failed", e);
      }
    }
  }

  async updateBookRealEndQuote(id: string, quote: string): Promise<void> {
    await this.local.updateBookRealEndQuote(id, quote);
    if (firestore) {
      try {
        await updateDoc(doc(this.booksCollection, id), { 'analysis.realEndQuote': quote });
      } catch (e) {
        console.error("Cloud quote sync failed", e);
      }
    }
  }

  async updateBookRealEndIndex(id: string, index: number): Promise<void> {
    await this.local.updateBookRealEndIndex(id, index);
    if (firestore) {
      try {
        await updateDoc(doc(this.booksCollection, id), { 'analysis.realEndIndex': index });
      } catch (e) {
        console.error("Cloud index sync failed", e);
      }
    }
  }

  async logReadingSession(sessionData: Omit<ReadingSession, 'id'>): Promise<void> {
      await this.local.logReadingSession(sessionData);
      if (firestore) {
          try {
              const sessionRef = doc(collection(this.booksCollection, sessionData.bookId, 'sessions'));
              await setDoc(sessionRef, { ...sessionData, id: sessionRef.id });
          } catch (e) {
              console.error("Cloud session log failed", e);
          }
      }
  }

  async saveChapterAudio(bookId: string, chapterIndex: number, speed: number, audioChunks: ArrayBuffer[]): Promise<void> {
    return this.local.saveChapterAudio(bookId, chapterIndex, speed, audioChunks);
  }

  async getChapterAudio(bookId: string, chapterIndex: number, speed: number): Promise<ArrayBuffer[] | undefined> {
    return this.local.getChapterAudio(bookId, chapterIndex, speed);
  }
}
