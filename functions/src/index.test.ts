import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercises the exportHistory handler against a fake Firestore so the query
 * parameters, filtering and payload shape are covered — the pure grouping
 * logic is tested separately in history.test.ts.
 */

type Handler = (req: any, res: any) => Promise<void> | void;

let handler: Handler;

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_opts: unknown, fn: Handler) => fn,
}));

const store: {
  user: Record<string, unknown> | null;
  sessions: Record<string, unknown>[];
  books: Record<string, Record<string, unknown>>;
} = { user: null, sessions: [], books: {} };

vi.mock('firebase-admin', () => {
  const collection = (path: string[]) => {
    const filters: { field: string; op: string; value: number }[] = [];
    let direction: 'asc' | 'desc' = 'asc';
    let max = Infinity;

    const api: any = {
      doc: (id: string) => ({
        get: async () => {
          if (path.join('/').endsWith('books')) {
            const data = store.books[id];
            return { exists: !!data, id, data: () => data };
          }
          return { exists: !!store.user, id, data: () => store.user };
        },
        collection: (name: string) => collection([...path, id, name]),
      }),
      where: (field: string, op: string, value: number) => {
        filters.push({ field, op, value });
        return api;
      },
      orderBy: (_field: string, dir: 'asc' | 'desc' = 'asc') => {
        direction = dir;
        return api;
      },
      limit: (n: number) => {
        max = n;
        return api;
      },
      get: async () => {
        let rows = store.sessions.filter(row =>
          filters.every(f => {
            const value = row[f.field] as number;
            return f.op === '>=' ? value >= f.value : value <= f.value;
          })
        );
        rows.sort((a, b) =>
          direction === 'desc'
            ? (b.startTime as number) - (a.startTime as number)
            : (a.startTime as number) - (b.startTime as number)
        );
        rows = rows.slice(0, max);
        const docs = rows.map((row, i) => ({ id: `doc-${i}`, data: () => row }));
        return { size: docs.length, docs };
      },
    };
    return api;
  };

  return {
    initializeApp: vi.fn(),
    firestore: () => ({ collection: (name: string) => collection([name]) }),
  };
});

const UID = 'user-1';
const TOKEN = `${UID}-secret`;

// 2026-07-27, Pacific.
const DAY1_EVENING = Date.parse('2026-07-28T02:09:00Z'); // 19:09 PDT
const DAY2_EVENING = Date.parse('2026-07-29T02:30:00Z'); // 19:30 PDT on the 28th

function rawSession(overrides: Record<string, unknown> = {}) {
  const startTime = (overrides.startTime as number) ?? DAY1_EVENING;
  const durationSeconds = (overrides.durationSeconds as number) ?? 60;
  return {
    bookId: 'book-1',
    bookTitle: 'The Westing Game',
    type: 'rsvp',
    startTime,
    endTime: startTime + durationSeconds * 1000,
    durationSeconds,
    wordsRead: 500,
    startWordIndex: 0,
    endWordIndex: 500,
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined as any,
    set: vi.fn(),
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    send(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function callExport(query: Record<string, string>) {
  const res = makeRes();
  await handler({ method: 'GET', query }, res);
  return res;
}

beforeEach(async () => {
  vi.resetModules();
  store.user = { apiSyncToken: TOKEN };
  store.sessions = [];
  store.books = {
    'book-1': {
      meta: { title: 'The Westing Game', totalWords: 100_000 },
      progress: { wordIndex: 40_000, furthestWordIndex: 50_000, lastReadAt: DAY2_EVENING, cumulativeDurationSeconds: 9_000 },
    },
  };
  handler = (await import('./index')).exportHistory as unknown as Handler;
});

describe('auth and validation', () => {
  it('rejects a missing or malformed token', async () => {
    expect((await callExport({})).statusCode).toBe(400);
    expect((await callExport({ token: 'nodashes' })).statusCode).toBe(400);
  });

  it('rejects a token that does not match the stored one', async () => {
    const res = await callExport({ token: `${UID}-wrong` });
    expect(res.statusCode).toBe(401);
  });

  it('404s for an unknown user', async () => {
    store.user = null;
    expect((await callExport({ token: TOKEN })).statusCode).toBe(404);
  });

  it('rejects unknown timezones and granularities', async () => {
    expect((await callExport({ token: TOKEN, tz: 'Mars/Olympus' })).statusCode).toBe(400);
    expect((await callExport({ token: TOKEN, granularity: 'hourly' })).statusCode).toBe(400);
  });

  it('rejects an inverted time range', async () => {
    const res = await callExport({ token: TOKEN, since: '2026-07-28', until: '2026-07-27' });
    expect(res.statusCode).toBe(400);
  });
});

describe('session granularity', () => {
  beforeEach(() => {
    // One 3-minute evening sitting made of three chunks, plus a second sitting
    // the next evening after a long gap.
    store.sessions = [
      rawSession({ startTime: DAY1_EVENING, startWordIndex: 0, endWordIndex: 500 }),
      rawSession({ startTime: DAY1_EVENING + 60_000, startWordIndex: 500, endWordIndex: 1000 }),
      rawSession({ startTime: DAY1_EVENING + 120_000, startWordIndex: 1000, endWordIndex: 1500 }),
      rawSession({ startTime: DAY2_EVENING, durationSeconds: 300, wordsRead: 2000, startWordIndex: 1500, endWordIndex: 3500 }),
    ];
  });

  it('returns sittings with local clock times by default', async () => {
    const res = await callExport({ token: TOKEN, tz: 'America/Los_Angeles', until: String(DAY2_EVENING + 3_600_000) });
    expect(res.statusCode).toBe(200);
    expect(res.body.query.granularity).toBe('sitting');
    expect(res.body.sessions).toHaveLength(2);

    // Newest first.
    const [latest, earliest] = res.body.sessions;
    expect(earliest.startTimeIso).toBe('2026-07-27T19:09:00-07:00');
    expect(earliest.date).toBe('2026-07-27');
    expect(earliest.segments).toBe(3);
    expect(earliest.durationSeconds).toBe(180);
    expect(earliest.wordsRead).toBe(1500);
    expect(earliest.effectiveWpm).toBe(500);
    expect(earliest.percentCompleteEnd).toBe(1.5);
    expect(latest.date).toBe('2026-07-28');
  });

  it('returns every chunk at raw granularity', async () => {
    const res = await callExport({
      token: TOKEN,
      granularity: 'raw',
      tz: 'America/Los_Angeles',
      until: String(DAY2_EVENING + 3_600_000),
    });
    expect(res.body.sessions).toHaveLength(4);
    expect(res.body.sessions.every((s: any) => s.segments === 1)).toBe(true);
  });

  it('collapses to one entry per book-day at daily granularity', async () => {
    const res = await callExport({
      token: TOKEN,
      granularity: 'daily',
      tz: 'America/Los_Angeles',
      until: String(DAY2_EVENING + 3_600_000),
    });
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions.map((s: any) => s.date)).toEqual(['2026-07-28', '2026-07-27']);
  });

  it('splits a sitting when gapMinutes is tightened below the pause length', async () => {
    // Two chunks with a five-minute pause between them: one sitting by
    // default, two once the gap threshold drops under five minutes.
    store.sessions = [
      rawSession({ startTime: DAY1_EVENING }),
      rawSession({ startTime: DAY1_EVENING + 6 * 60_000, startWordIndex: 500, endWordIndex: 1000 }),
    ];
    const until = String(DAY1_EVENING + 3_600_000);

    const merged = await callExport({ token: TOKEN, tz: 'America/Los_Angeles', until });
    expect(merged.body.sessions).toHaveLength(1);
    expect(merged.body.sessions[0].elapsedSeconds).toBe(420);

    const split = await callExport({ token: TOKEN, gapMinutes: '2', tz: 'America/Los_Angeles', until });
    expect(split.body.sessions).toHaveLength(2);
  });

  it('rolls days up with per-book totals', async () => {
    const res = await callExport({ token: TOKEN, tz: 'America/Los_Angeles', until: String(DAY2_EVENING + 3_600_000) });
    expect(res.body.days).toHaveLength(2);
    const [day2, day1] = res.body.days;
    expect(day2.date).toBe('2026-07-28');
    expect(day1.date).toBe('2026-07-27');
    expect(day1.durationSeconds).toBe(180);
    expect(day1.books[0]).toMatchObject({ bookId: 'book-1', wordsRead: 1500, percentComplete: 1.5 });
  });

  it('summarises the window', async () => {
    const res = await callExport({ token: TOKEN, tz: 'America/Los_Angeles', until: String(DAY2_EVENING + 3_600_000) });
    expect(res.body.summary).toMatchObject({
      booksReadCount: 1,
      sessionCount: 2,
      activeDays: 2,
      totalTimeReadSeconds: 480,
      totalWordsRead: 3500,
      longestSessionSeconds: 300,
    });
    expect(res.body.summary.durationSecondsByModality).toEqual({ rsvp: 480 });
    expect(res.body.books[0]).toMatchObject({
      id: 'book-1',
      title: 'The Westing Game',
      sessionCount: 2,
      percentCompleteStart: 0,
      percentCompleteEnd: 3.5,
      allTimeDurationSeconds: 9_000,
    });
  });
});

describe('filters', () => {
  it('drops short demo sittings but reports how many', async () => {
    store.sessions = [
      rawSession({ startTime: DAY1_EVENING, durationSeconds: 18, wordsRead: 100 }),
      rawSession({ startTime: DAY2_EVENING, durationSeconds: 600, wordsRead: 3000 }),
    ];

    const res = await callExport({
      token: TOKEN,
      minSeconds: '120',
      tz: 'America/Los_Angeles',
      until: String(DAY2_EVENING + 3_600_000),
    });
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.summary.omitted.shortSessions).toBe(1);
    expect(res.body.summary.omitted.shortSessionSeconds).toBe(18);
  });

  it('drops implausibly slow sessions left by old timing bugs', async () => {
    store.sessions = [
      rawSession({ startTime: DAY1_EVENING, durationSeconds: 8 * 60 * 60, wordsRead: 250 }),
      rawSession({ startTime: DAY2_EVENING, durationSeconds: 300, wordsRead: 1500 }),
    ];

    const res = await callExport({ token: TOKEN, until: String(DAY2_EVENING + 3_600_000) });
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.summary.omitted.implausibleSessions).toBe(1);
  });

  it('counts malformed documents instead of failing', async () => {
    store.sessions = [
      { startTime: DAY1_EVENING, durationSeconds: 60 }, // no bookId
      rawSession({ startTime: DAY2_EVENING }),
    ];

    const res = await callExport({ token: TOKEN, until: String(DAY2_EVENING + 3_600_000) });
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.summary.omitted.malformedSessions).toBe(1);
  });

  it('restricts to one book when bookId is given', async () => {
    store.sessions = [
      rawSession({ startTime: DAY1_EVENING }),
      rawSession({ startTime: DAY1_EVENING, bookId: 'book-2', bookTitle: 'Prince Caspian' }),
    ];

    const res = await callExport({ token: TOKEN, bookId: 'book-2', until: String(DAY1_EVENING + 3_600_000) });
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].bookTitle).toBe('Prince Caspian');
  });

  it('honours an explicit since/until window', async () => {
    store.sessions = [
      rawSession({ startTime: DAY1_EVENING }),
      rawSession({ startTime: DAY2_EVENING }),
    ];

    const res = await callExport({
      token: TOKEN,
      since: String(DAY2_EVENING - 60_000),
      until: String(DAY2_EVENING + 60_000),
      tz: 'America/Los_Angeles',
    });
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].date).toBe('2026-07-28');
    expect(res.body.timeframe.timezone).toBe('America/Los_Angeles');
  });
});

describe('modality mixing', () => {
  it('keeps a paginated-to-rsvp switch in one sitting with the split recorded', async () => {
    store.sessions = [
      rawSession({ startTime: DAY1_EVENING, type: 'paginated', durationSeconds: 600, wordsRead: 1000 }),
      rawSession({
        startTime: DAY1_EVENING + 11 * 60_000,
        type: 'rsvp',
        durationSeconds: 300,
        wordsRead: 1500,
        startWordIndex: 1000,
        endWordIndex: 2500,
      }),
    ];

    const res = await callExport({ token: TOKEN, until: String(DAY1_EVENING + 3_600_000) });
    expect(res.body.sessions).toHaveLength(1);
    const sitting = res.body.sessions[0];
    expect(sitting.type).toBe('paginated');
    expect(sitting.byModality.paginated.durationSeconds).toBe(600);
    expect(sitting.byModality.rsvp.wordsRead).toBe(1500);
    expect(res.body.summary.modalities.sort()).toEqual(['paginated', 'rsvp']);
  });
});
