import { openDB, type DBSchema } from 'idb';

export interface BookRecord {
  id: string;
  file: File;
  title: string;
  lastPosition: number;
  timestamp: number;
  wpm?: number;
  realEndQuote?: string;
  realEndIndex?: number;
}

interface RSVPDB extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
  };
}

const DB_NAME = 'epub-rsvp-db';
const STORE_NAME = 'books';

export async function initDB() {
  return openDB<RSVPDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    },
  });
}

export async function addBook(file: File, title: string): Promise<string> {
  const db = await initDB();
  const id = crypto.randomUUID();
  await db.put(STORE_NAME, {
    id,
    file,
    title,
    lastPosition: 0,
    timestamp: Date.now(),
    wpm: 300,
  });
  return id;
}

export async function getAllBooks(): Promise<BookRecord[]> {
  const db = await initDB();
  const books = await db.getAll(STORE_NAME);
  return books.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const db = await initDB();
  return db.get(STORE_NAME, id);
}

export async function deleteBook(id: string) {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
}

export async function updateBookProgress(id: string, index: number) {
    const db = await initDB();
    const book = await db.get(STORE_NAME, id);
    if (book) {
        book.lastPosition = index;
        book.timestamp = Date.now();
        await db.put(STORE_NAME, book);
    }
}

export async function updateBookWpm(id: string, wpm: number) {
    const db = await initDB();
    const book = await db.get(STORE_NAME, id);
    if (book) {
        book.wpm = wpm;
        await db.put(STORE_NAME, book);
    }
}

export async function updateBookRealEndQuote(id: string, quote: string) {
    const db = await initDB();
    const book = await db.get(STORE_NAME, id);
    if (book) {
        book.realEndQuote = quote;
        await db.put(STORE_NAME, book);
    }
}

export async function updateBookRealEndIndex(id: string, index: number) {
    const db = await initDB();
    const book = await db.get(STORE_NAME, id);
    if (book) {
        book.realEndIndex = index;
        await db.put(STORE_NAME, book);
    }
}
