import { describe, expect, it } from 'vitest';
import {
  asRawEntries,
  dayKey,
  effectiveWpm,
  estimatedPages,
  formatIso,
  isImplausiblySlowSession,
  isValidTimeZone,
  normalizeSession,
  parseNumber,
  parseTimestamp,
  percentOf,
  rollupDaily,
  sessionize,
  type NormalizedSession,
} from './history';

const MINUTE = 60 * 1000;

// 2026-07-27 19:09:04 Pacific — the evening-reading case that renders as the
// next morning if timestamps are formatted in UTC.
const EVENING_PACIFIC = Date.parse('2026-07-28T02:09:04Z');

function session(overrides: Partial<NormalizedSession> = {}): NormalizedSession {
  const startTime = overrides.startTime ?? EVENING_PACIFIC;
  const durationSeconds = overrides.durationSeconds ?? 60;
  return {
    id: 'session-1',
    bookId: 'book-1',
    bookTitle: 'The Westing Game',
    type: 'rsvp',
    startTime,
    endTime: startTime + durationSeconds * 1000,
    durationSeconds,
    wordsRead: 300,
    startWordIndex: 0,
    endWordIndex: 300,
    ...overrides,
  };
}

describe('normalizeSession', () => {
  it('rejects documents without a book or start time', () => {
    expect(normalizeSession({ startTime: 1 })).toBeNull();
    expect(normalizeSession({ bookId: 'book-1' })).toBeNull();
    expect(normalizeSession({ bookId: 'book-1', startTime: Number.NaN })).toBeNull();
  });

  it('maps the legacy "reading" type onto rsvp', () => {
    expect(normalizeSession({ bookId: 'b', startTime: 0, type: 'reading' })?.type).toBe('rsvp');
    expect(normalizeSession({ bookId: 'b', startTime: 0, type: 'paginated' })?.type).toBe('paginated');
    expect(normalizeSession({ bookId: 'b', startTime: 0 })?.type).toBe('unknown');
  });

  it('derives a missing endTime from the duration and vice versa', () => {
    const noEnd = normalizeSession({ bookId: 'b', startTime: 1000, durationSeconds: 90 });
    expect(noEnd?.endTime).toBe(1000 + 90_000);

    const noDuration = normalizeSession({ bookId: 'b', startTime: 1000, endTime: 1000 + 45_000 });
    expect(noDuration?.durationSeconds).toBe(45);
  });

  it('falls back to the index delta when wordsRead is absent', () => {
    const s = normalizeSession({ bookId: 'b', startTime: 0, startWordIndex: 100, endWordIndex: 450 });
    expect(s?.wordsRead).toBe(350);
  });

  it('uses the document id when the record has no embedded id', () => {
    expect(normalizeSession({ bookId: 'b', startTime: 0 }, 'doc-42')?.id).toBe('doc-42');
  });
});

describe('isImplausiblySlowSession', () => {
  it('flags a page "read" over hours but keeps ordinary reading', () => {
    // 250 words over 8 hours is 0.5 wpm — below the 1 wpm floor.
    expect(isImplausiblySlowSession(session({ wordsRead: 250, durationSeconds: 8 * 60 * 60 }))).toBe(true);
    expect(isImplausiblySlowSession(session({ wordsRead: 300, durationSeconds: 60 }))).toBe(false);
  });

  it('leaves zero-word or zero-duration sessions alone', () => {
    expect(isImplausiblySlowSession(session({ wordsRead: 0, durationSeconds: 600 }))).toBe(false);
    expect(isImplausiblySlowSession(session({ wordsRead: 100, durationSeconds: 0 }))).toBe(false);
  });
});

describe('sessionize', () => {
  it('merges chunks separated by less than the gap into one sitting', () => {
    // Three minute-long chunks a minute apart: one 5-minute sitting.
    const sessions = [0, 2, 4].map(offset =>
      session({
        id: `s${offset}`,
        startTime: EVENING_PACIFIC + offset * MINUTE,
        durationSeconds: 60,
        wordsRead: 300,
        startWordIndex: offset * 300,
        endWordIndex: (offset + 1) * 300,
      })
    );

    const sittings = sessionize(sessions, 15 * MINUTE);
    expect(sittings).toHaveLength(1);
    expect(sittings[0].segments).toBe(3);
    expect(sittings[0].durationSeconds).toBe(180);
    expect(sittings[0].elapsedSeconds).toBe(300);
    expect(sittings[0].wordsRead).toBe(900);
    expect(sittings[0].startWordIndex).toBe(0);
    expect(sittings[0].endWordIndex).toBe(1500);
  });

  it('splits sittings across a gap longer than the threshold', () => {
    const morning = session({ id: 'a', startTime: EVENING_PACIFIC - 9 * 60 * MINUTE });
    const evening = session({ id: 'b', startTime: EVENING_PACIFIC });

    const sittings = sessionize([morning, evening], 15 * MINUTE);
    expect(sittings).toHaveLength(2);
    expect(sittings[0].startTime).toBeLessThan(sittings[1].startTime);
  });

  it('keeps interleaved books in separate sittings', () => {
    const a1 = session({ id: 'a1', bookId: 'book-a', bookTitle: 'A', startTime: EVENING_PACIFIC });
    const b1 = session({ id: 'b1', bookId: 'book-b', bookTitle: 'B', startTime: EVENING_PACIFIC + MINUTE });
    const a2 = session({ id: 'a2', bookId: 'book-a', bookTitle: 'A', startTime: EVENING_PACIFIC + 2 * MINUTE });

    const sittings = sessionize([a1, b1, a2], 15 * MINUTE);
    expect(sittings).toHaveLength(2);
    const bookA = sittings.find(s => s.bookId === 'book-a');
    expect(bookA?.segments).toBe(2);
  });

  it('keeps a modality switch inside one sitting and reports the split', () => {
    const paginated = session({ id: 'p', type: 'paginated', durationSeconds: 600, wordsRead: 1000 });
    const rsvp = session({
      id: 'r',
      type: 'rsvp',
      startTime: EVENING_PACIFIC + 11 * MINUTE,
      durationSeconds: 300,
      wordsRead: 1500,
    });

    const [sitting] = sessionize([paginated, rsvp], 15 * MINUTE);
    expect(sitting.segments).toBe(2);
    // Dominant modality wins the top-level label; both are still visible.
    expect(sitting.type).toBe('paginated');
    expect(sitting.byModality.paginated).toEqual({ durationSeconds: 600, wordsRead: 1000 });
    expect(sitting.byModality.rsvp).toEqual({ durationSeconds: 300, wordsRead: 1500 });
  });

  it('returns sittings in chronological order regardless of input order', () => {
    const later = session({ id: 'l', startTime: EVENING_PACIFIC + 5 * 60 * MINUTE });
    const earlier = session({ id: 'e', startTime: EVENING_PACIFIC });

    const sittings = sessionize([later, earlier], 15 * MINUTE);
    expect(sittings.map(s => s.startTime)).toEqual([earlier.startTime, later.startTime]);
  });
});

describe('rollupDaily', () => {
  it('collapses a day of reading per book and modality', () => {
    const morning = session({ id: 'm', startTime: EVENING_PACIFIC - 9 * 60 * MINUTE, durationSeconds: 120 });
    const evening = session({ id: 'e', startTime: EVENING_PACIFIC, durationSeconds: 300 });
    const listening = session({ id: 'l', type: 'listening', startTime: EVENING_PACIFIC, durationSeconds: 60 });

    const daily = rollupDaily([morning, evening, listening], 'America/Los_Angeles');
    expect(daily).toHaveLength(2);
    const rsvpDay = daily.find(d => d.type === 'rsvp');
    expect(rsvpDay?.durationSeconds).toBe(420);
    expect(rsvpDay?.segments).toBe(2);
  });

  it('buckets by the reader local day, not UTC', () => {
    // 21:00 Pacific on the 27th is 04:00 UTC on the 28th.
    const lateEvening = Date.parse('2026-07-28T04:00:00Z');
    const [pacific] = rollupDaily([session({ startTime: lateEvening })], 'America/Los_Angeles');
    const [utc] = rollupDaily([session({ startTime: lateEvening })], 'UTC');
    expect(dayKey(pacific.startTime, 'America/Los_Angeles')).toBe('2026-07-27');
    expect(dayKey(utc.startTime, 'UTC')).toBe('2026-07-28');
  });
});

describe('asRawEntries', () => {
  it('preserves every chunk', () => {
    const sessions = [0, 1, 2].map(i => session({ id: `s${i}`, startTime: EVENING_PACIFIC + i * MINUTE }));
    const entries = asRawEntries(sessions);
    expect(entries).toHaveLength(3);
    expect(entries.every(e => e.segments === 1)).toBe(true);
  });
});

describe('timezone formatting', () => {
  it('renders an evening read as evening local time with an explicit offset', () => {
    expect(formatIso(EVENING_PACIFIC, 'America/Los_Angeles')).toBe('2026-07-27T19:09:04-07:00');
    expect(dayKey(EVENING_PACIFIC, 'America/Los_Angeles')).toBe('2026-07-27');
  });

  it('renders UTC with a +00:00 offset rather than a bare timestamp', () => {
    expect(formatIso(EVENING_PACIFIC, 'UTC')).toBe('2026-07-28T02:09:04+00:00');
  });

  it('handles half-hour offsets', () => {
    expect(formatIso(EVENING_PACIFIC, 'Asia/Kolkata')).toBe('2026-07-28T07:39:04+05:30');
  });

  it('formats midnight as hour 00', () => {
    const midnight = Date.parse('2026-07-27T07:00:00Z'); // 00:00 Pacific
    expect(formatIso(midnight, 'America/Los_Angeles')).toBe('2026-07-27T00:00:00-07:00');
  });

  it('validates timezone names', () => {
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('derived metrics', () => {
  it('estimates pages at 250 words per page', () => {
    expect(estimatedPages(1000)).toBe(4);
    expect(estimatedPages(300)).toBe(1.2);
  });

  it('computes effective wpm, and null when undefined', () => {
    expect(effectiveWpm(600, 60)).toBe(600);
    expect(effectiveWpm(0, 60)).toBeNull();
    expect(effectiveWpm(600, 0)).toBeNull();
  });

  it('computes completion percentage, and null without a word count', () => {
    expect(percentOf(50_000, 200_000)).toBe(25);
    expect(percentOf(50_000, null)).toBeNull();
    expect(percentOf(300_000, 200_000)).toBe(100);
  });
});

describe('parameter parsing', () => {
  it('accepts epoch seconds, epoch millis and ISO dates', () => {
    expect(parseTimestamp('1786000000')).toBe(1786000000000);
    expect(parseTimestamp('1786000000000')).toBe(1786000000000);
    expect(parseTimestamp('2026-07-27')).toBe(Date.parse('2026-07-27'));
    expect(parseTimestamp('not a date')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });

  it('clamps numbers into range and falls back on junk', () => {
    expect(parseNumber('45', 30, 0, 100)).toBe(45);
    expect(parseNumber('500', 30, 0, 100)).toBe(100);
    expect(parseNumber('-5', 30, 0, 100)).toBe(0);
    expect(parseNumber('abc', 30, 0, 100)).toBe(30);
    expect(parseNumber(undefined, 30, 0, 100)).toBe(30);
  });
});
