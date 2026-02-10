import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FirestoreStorage, type BookRecord, type ReadingSession } from './storage';
import { getIncrementalAggregationPlan } from './stats';

// Mock Firebase
vi.mock('./firebase', () => ({
  db: {},
  storage: {}
}));

// Mock idb
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  })
}));

// Mock Firestore functions
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, _coll, id) => ({ id })),
  setDoc: vi.fn(),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
}));

import { getDoc, updateDoc } from 'firebase/firestore';

describe('Sync to Furthest Progress', () => {
  let storage: FirestoreStorage;
  const userId = 'test-user';
  const bookId = 'test-book';

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new FirestoreStorage(userId);
  });

  it('should initialize furthestWordIndex with current index if missing', async () => {
    const mockBook: Partial<BookRecord> = {
      id: bookId,
      progress: { wordIndex: 10, lastReadAt: 123 }
    };

    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => mockBook
    } as any);

    await storage.updateBookProgress(bookId, 20);

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      'progress.wordIndex': 20,
      'progress.furthestWordIndex': 20
    }));
  });

  it('should update furthestWordIndex when reading forward', async () => {
    const mockBook: Partial<BookRecord> = {
      id: bookId,
      progress: { wordIndex: 20, lastReadAt: 123, furthestWordIndex: 50 }
    };

    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => mockBook
    } as any);

    await storage.updateBookProgress(bookId, 60);

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      'progress.wordIndex': 60,
      'progress.furthestWordIndex': 60
    }));
  });

  it('should NOT update furthestWordIndex when navigating backward', async () => {
    const mockBook: Partial<BookRecord> = {
      id: bookId,
      progress: { wordIndex: 50, lastReadAt: 123, furthestWordIndex: 50 }
    };

    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => mockBook
    } as any);

    await storage.updateBookProgress(bookId, 30);

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      'progress.wordIndex': 30,
      'progress.furthestWordIndex': 50
    }));
  });

  it('should correctly aggregate sessions while preserving furthest progress in session group', () => {
    const sessions: ReadingSession[] = [
      {
        id: '1',
        bookId: 'book1',
        bookTitle: 'Title',
        startTime: 1000,
        endTime: 2000,
        startWordIndex: 0,
        endWordIndex: 100,
        wordsRead: 100,
        durationSeconds: 60,
        type: 'reading'
      },
      {
        id: '2',
        bookId: 'book1',
        bookTitle: 'Title',
        startTime: 3000, // Same day
        endTime: 4000,
        startWordIndex: 100,
        endWordIndex: 200,
        wordsRead: 100,
        durationSeconds: 60,
        type: 'reading'
      },
      {
        id: '3',
        bookId: 'book1',
        bookTitle: 'Title',
        startTime: 5000,
        endTime: 6000,
        startWordIndex: 50, // Backtracked
        endWordIndex: 150,
        wordsRead: 100,
        durationSeconds: 60,
        type: 'reading'
      }
    ];

    const { createSessions } = getIncrementalAggregationPlan([], sessions);
    expect(createSessions).toHaveLength(1);
    const agg = createSessions[0];
    
    // Total words read should be sum
    expect(agg.wordsRead).toBe(300);
    // startWordIndex should be the minimum encountered
    expect(agg.startWordIndex).toBe(0);
    // endWordIndex should be the position of the LAST session in time
    expect(agg.endWordIndex).toBe(150);
  });
});
