import { describe, it, expect, beforeEach } from 'vitest';
import {
  forgetLocalProgress,
  markLocalProgressSynced,
  mergeProgress,
  readLocalProgress,
  resolveStartPosition,
  writeLocalProgress,
} from './progress';

const BOOK = 'book-1';
const MORNING = 1_000_000;
const AFTERNOON = 2_000_000;

describe('mergeProgress', () => {
  it('keeps the position that was read most recently', () => {
    const sleepyTab = { wordIndex: 79969, reachedAt: MORNING, furthestWordIndex: 79969 };
    const otherDevice = { wordIndex: 84400, reachedAt: AFTERNOON, furthestWordIndex: 84400 };

    const { position, source } = mergeProgress(sleepyTab, otherDevice);

    expect(position.wordIndex).toBe(84400);
    expect(source).toBe('remote');
  });

  it('keeps offline reading that the server has not seen yet', () => {
    const readOnAPlane = { wordIndex: 90000, reachedAt: AFTERNOON, furthestWordIndex: 90000 };
    const server = { wordIndex: 84400, reachedAt: MORNING, furthestWordIndex: 84400 };

    const { position, source } = mergeProgress(readOnAPlane, server);

    expect(position.wordIndex).toBe(90000);
    expect(source).toBe('local');
  });

  it('takes the furthest mark from whichever side is higher', () => {
    const local = { wordIndex: 500, reachedAt: AFTERNOON, furthestWordIndex: 500 };
    const remote = { wordIndex: 400, reachedAt: MORNING, furthestWordIndex: 9000 };

    expect(mergeProgress(local, remote).position.furthestWordIndex).toBe(9000);
  });

  it('gives ties to the server so two idle devices do not trade writes', () => {
    const local = { wordIndex: 10, reachedAt: MORNING, furthestWordIndex: 10 };
    const remote = { wordIndex: 20, reachedAt: MORNING, furthestWordIndex: 20 };

    expect(mergeProgress(local, remote).source).toBe('remote');
  });

  it('falls back to whichever side exists', () => {
    const only = { wordIndex: 7, reachedAt: MORNING, furthestWordIndex: 7 };

    expect(mergeProgress(only, null).position.wordIndex).toBe(7);
    expect(mergeProgress(null, only).position.wordIndex).toBe(7);
    expect(mergeProgress(null, null).position.wordIndex).toBe(0);
  });
});

describe('local progress record', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a position and never lowers the furthest mark', () => {
    writeLocalProgress(BOOK, { wordIndex: 900, reachedAt: MORNING, furthestWordIndex: 900, pendingSync: true });
    writeLocalProgress(BOOK, { wordIndex: 100, reachedAt: AFTERNOON, furthestWordIndex: 100, pendingSync: true });

    const saved = readLocalProgress(BOOK);
    expect(saved).toMatchObject({ wordIndex: 100, reachedAt: AFTERNOON, furthestWordIndex: 900 });
  });

  it('only clears the pending flag for the position that synced', () => {
    writeLocalProgress(BOOK, { wordIndex: 100, reachedAt: MORNING, furthestWordIndex: 100, pendingSync: true });

    markLocalProgressSynced(BOOK, 999);
    expect(readLocalProgress(BOOK)?.pendingSync).toBe(true);

    markLocalProgressSynced(BOOK, 100);
    expect(readLocalProgress(BOOK)?.pendingSync).toBe(false);
  });

  it('forgets a book entirely', () => {
    writeLocalProgress(BOOK, { wordIndex: 100, reachedAt: MORNING, furthestWordIndex: 500, pendingSync: false });
    forgetLocalProgress(BOOK);
    expect(readLocalProgress(BOOK)).toBeNull();
  });
});

describe('resolveStartPosition', () => {
  beforeEach(() => localStorage.clear());

  const recorded = { wordIndex: 79969, reachedAt: MORNING, furthestWordIndex: 79969 };

  it('prefers the freshly read server position over a stale library record', async () => {
    const storage = {
      getBookProgress: async () => ({ wordIndex: 84400, reachedAt: AFTERNOON, furthestWordIndex: 84400 }),
    };

    const start = await resolveStartPosition(storage, BOOK, recorded);

    expect(start.wordIndex).toBe(84400);
    expect(readLocalProgress(BOOK)).toMatchObject({ wordIndex: 84400, pendingSync: false });
  });

  it('keeps unsynced offline reading when the server read comes from cache', async () => {
    writeLocalProgress(BOOK, { wordIndex: 90000, reachedAt: AFTERNOON, furthestWordIndex: 90000, pendingSync: true });
    const storage = {
      getBookProgress: async () => ({ wordIndex: 84400, reachedAt: MORNING, furthestWordIndex: 84400, fromCache: true }),
    };

    const start = await resolveStartPosition(storage, BOOK, recorded);

    expect(start.wordIndex).toBe(90000);
    expect(readLocalProgress(BOOK)?.pendingSync).toBe(true);
  });

  it('falls back to the record when there is no progress reader', async () => {
    const start = await resolveStartPosition(null, BOOK, recorded);
    expect(start.wordIndex).toBe(79969);
  });
});
