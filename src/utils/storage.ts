import { openDB, type DBSchema } from 'idb';

interface RSVPDB extends DBSchema {
  books: {
    key: string;
    value: {
      id: string;
      file: File;
      title: string;
      lastPosition: number; // For future feature: save progress
      timestamp: number;
    };
  };
}

const DB_NAME = 'epub-rsvp-db';
const STORE_NAME = 'books';
const BOOK_KEY = 'current_book'; // We only support one book for now

export async function initDB() {
  return openDB<RSVPDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    },
  });
}

export async function saveCurrentBook(file: File, title: string) {
  const db = await initDB();
  await db.put(STORE_NAME, {
    id: BOOK_KEY,
    file,
    title,
    lastPosition: 0,
    timestamp: Date.now(),
  });
}

export async function loadCurrentBook() {
  const db = await initDB();
  return db.get(STORE_NAME, BOOK_KEY);
}

export async function clearCurrentBook() {
  const db = await initDB();
  await db.delete(STORE_NAME, BOOK_KEY);
}

export async function updateProgress(index: number) {
    const db = await initDB();
    const book = await db.get(STORE_NAME, BOOK_KEY);
    if (book) {
        book.lastPosition = index;
        await db.put(STORE_NAME, book);
    }
}
