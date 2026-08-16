import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  DEFAULT_GAP_MINUTES,
  Granularity,
  HistoryEntry,
  Modality,
  NormalizedSession,
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
} from "./history";

admin.initializeApp();

/** Hard ceiling on session documents read per request; oldest are dropped. */
const MAX_RAW_DOCS = 20000;
const DEFAULT_ENTRY_LIMIT = 2000;

interface BookInfo {
  id: string;
  title: string;
  totalWords: number | null;
  furthestWordIndex: number;
  completionPercentage: number;
  finishedAt: number | null;
  lastReadAt: number | null;
  cumulativeDurationSeconds: number | null;
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function serializeEntry(entry: HistoryEntry, book: BookInfo | undefined, tz: string) {
  const totalWords = book?.totalWords ?? null;
  const byModality: Record<string, unknown> = {};
  for (const [type, totals] of Object.entries(entry.byModality)) {
    if (!totals) continue;
    byModality[type] = {
      durationSeconds: totals.durationSeconds,
      wordsRead: totals.wordsRead,
      estimatedPagesRead: estimatedPages(totals.wordsRead),
    };
  }

  return {
    bookId: entry.bookId,
    bookTitle: entry.bookTitle || book?.title || "Unknown Title",
    type: entry.type,
    date: dayKey(entry.startTime, tz),
    startTime: entry.startTime,
    endTime: entry.endTime,
    startTimeIso: formatIso(entry.startTime, tz),
    endTimeIso: formatIso(entry.endTime, tz),
    // durationSeconds counts only time the app considered active; elapsed is
    // the wall-clock span, so elapsed - duration is the idle time inside a
    // sitting.
    durationSeconds: entry.durationSeconds,
    elapsedSeconds: entry.elapsedSeconds,
    wordsRead: entry.wordsRead,
    estimatedPagesRead: estimatedPages(entry.wordsRead),
    effectiveWpm: effectiveWpm(entry.wordsRead, entry.durationSeconds),
    startWordIndex: entry.startWordIndex,
    endWordIndex: entry.endWordIndex,
    percentCompleteStart: percentOf(entry.startWordIndex, totalWords),
    percentCompleteEnd: percentOf(entry.endWordIndex, totalWords),
    bookTotalWords: totalWords,
    segments: entry.segments,
    byModality,
  };
}

function buildDays(entries: HistoryEntry[], books: Map<string, BookInfo>, tz: string) {
  const days = new Map<string, {
    date: string;
    durationSeconds: number;
    wordsRead: number;
    sessionCount: number;
    firstStartTime: number;
    lastEndTime: number;
    byModality: Record<string, number>;
    books: Map<string, { bookId: string; title: string; durationSeconds: number; wordsRead: number; endWordIndex: number }>;
  }>();

  for (const entry of entries) {
    const date = dayKey(entry.startTime, tz);
    let day = days.get(date);
    if (!day) {
      day = {
        date,
        durationSeconds: 0,
        wordsRead: 0,
        sessionCount: 0,
        firstStartTime: entry.startTime,
        lastEndTime: entry.endTime,
        byModality: {},
        books: new Map(),
      };
      days.set(date, day);
    }

    day.durationSeconds += entry.durationSeconds;
    day.wordsRead += entry.wordsRead;
    day.sessionCount += 1;
    day.firstStartTime = Math.min(day.firstStartTime, entry.startTime);
    day.lastEndTime = Math.max(day.lastEndTime, entry.endTime);
    for (const [type, totals] of Object.entries(entry.byModality)) {
      if (totals) day.byModality[type] = (day.byModality[type] || 0) + totals.durationSeconds;
    }

    const bookTotals = day.books.get(entry.bookId) || {
      bookId: entry.bookId,
      title: entry.bookTitle || books.get(entry.bookId)?.title || "Unknown Title",
      durationSeconds: 0,
      wordsRead: 0,
      endWordIndex: 0,
    };
    bookTotals.durationSeconds += entry.durationSeconds;
    bookTotals.wordsRead += entry.wordsRead;
    bookTotals.endWordIndex = Math.max(bookTotals.endWordIndex, entry.endWordIndex);
    day.books.set(entry.bookId, bookTotals);
  }

  return Array.from(days.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(day => ({
      date: day.date,
      durationSeconds: day.durationSeconds,
      wordsRead: day.wordsRead,
      estimatedPagesRead: estimatedPages(day.wordsRead),
      sessionCount: day.sessionCount,
      firstStartTimeIso: formatIso(day.firstStartTime, tz),
      lastEndTimeIso: formatIso(day.lastEndTime, tz),
      durationSecondsByModality: day.byModality,
      books: Array.from(day.books.values())
        .sort((a, b) => b.durationSeconds - a.durationSeconds)
        .map(b => ({
          bookId: b.bookId,
          title: b.title,
          durationSeconds: b.durationSeconds,
          wordsRead: b.wordsRead,
          estimatedPagesRead: estimatedPages(b.wordsRead),
          percentComplete: percentOf(b.endWordIndex, books.get(b.bookId)?.totalWords ?? null),
        })),
    }));
}

export const exportHistory = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  // CORS configuration
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const token = firstQueryValue(req.query.token);
  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }

  // Token format: <uid>-<secret>
  const parts = token.split("-");
  if (parts.length < 2) {
    res.status(400).json({ error: "Invalid token format" });
    return;
  }

  const uid = parts[0];

  // --- Query parameters ---------------------------------------------------
  const tz = firstQueryValue(req.query.tz) || "UTC";
  if (!isValidTimeZone(tz)) {
    res.status(400).json({ error: `Unknown timezone: ${tz}` });
    return;
  }

  const granularityParam = firstQueryValue(req.query.granularity) || "sitting";
  if (!["raw", "sitting", "daily"].includes(granularityParam)) {
    res.status(400).json({ error: `Unknown granularity: ${granularityParam} (expected raw, sitting or daily)` });
    return;
  }
  const granularity = granularityParam as Granularity;

  const now = Date.now();
  const untilParam = firstQueryValue(req.query.until);
  const sinceParam = firstQueryValue(req.query.since);

  const until = untilParam ? parseTimestamp(untilParam) : now;
  if (until === null) {
    res.status(400).json({ error: `Could not parse until: ${untilParam}` });
    return;
  }

  const days = parseNumber(firstQueryValue(req.query.days), 30, 0, 3650);
  const since = sinceParam ? parseTimestamp(sinceParam) : until - days * 24 * 60 * 60 * 1000;
  if (since === null) {
    res.status(400).json({ error: `Could not parse since: ${sinceParam}` });
    return;
  }
  if (since > until) {
    res.status(400).json({ error: "since must be before until" });
    return;
  }

  const gapMinutes = parseNumber(firstQueryValue(req.query.gapMinutes), DEFAULT_GAP_MINUTES, 0, 24 * 60);
  const gapMs = gapMinutes * 60 * 1000;
  const minSeconds = parseNumber(firstQueryValue(req.query.minSeconds), 0, 0, 24 * 60 * 60);
  const entryLimit = parseNumber(firstQueryValue(req.query.limit), DEFAULT_ENTRY_LIMIT, 1, 10000);
  const bookIdFilter = firstQueryValue(req.query.bookId);

  try {
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userData = userDoc.data() || {};
    const apiSyncToken = userData.apiSyncToken;

    if (!apiSyncToken || apiSyncToken !== token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Read raw per-chunk sessions rather than the day-level aggregates the app
    // keeps for its charts — the aggregates cannot say *when* reading happened.
    // Sessions are fetched newest-first so a truncated window keeps the recent
    // end, and a gap-sized lookback lets a sitting that straddles `since` be
    // reconstructed whole.
    const sessionsSnapshot = await db.collection("users").doc(uid).collection("sessions")
      .where("startTime", ">=", since - gapMs)
      .where("startTime", "<=", until)
      .orderBy("startTime", "desc")
      .limit(MAX_RAW_DOCS + 1)
      .get();

    const truncatedRawDocs = sessionsSnapshot.size > MAX_RAW_DOCS;
    const docs = truncatedRawDocs ? sessionsSnapshot.docs.slice(0, MAX_RAW_DOCS) : sessionsSnapshot.docs;

    let malformedSessions = 0;
    let implausibleSessions = 0;
    const sessions: NormalizedSession[] = [];
    for (const doc of docs) {
      const session = normalizeSession(doc.data(), doc.id);
      if (!session) {
        malformedSessions += 1;
        continue;
      }
      if (bookIdFilter && session.bookId !== bookIdFilter) continue;
      // Old timing bugs left sessions claiming hours for a single page; they
      // would distort every total, so they are dropped and counted.
      if (isImplausiblySlowSession(session)) {
        implausibleSessions += 1;
        continue;
      }
      sessions.push(session);
    }

    let entries: HistoryEntry[];
    if (granularity === "sitting") {
      entries = sessionize(sessions, gapMs).filter(e => e.endTime >= since && e.startTime <= until);
    } else {
      // raw and daily bucket strictly inside the window; only sittings use the
      // lookback, since only they can span the boundary.
      const inWindow = sessions.filter(s => s.startTime >= since && s.startTime <= until);
      entries = granularity === "raw" ? asRawEntries(inWindow) : rollupDaily(inWindow, tz);
    }

    // Short entries are usually the app being demoed, not reading. They are
    // filtered on request, but the count is always reported so an omission is
    // never mistaken for a quiet day.
    let omittedShortSessions = 0;
    let omittedShortSeconds = 0;
    if (minSeconds > 0) {
      const kept: HistoryEntry[] = [];
      for (const entry of entries) {
        if (entry.durationSeconds < minSeconds) {
          omittedShortSessions += 1;
          omittedShortSeconds += entry.durationSeconds;
        } else {
          kept.push(entry);
        }
      }
      entries = kept;
    }

    const totalEntries = entries.length;
    const truncatedEntries = totalEntries > entryLimit;
    if (truncatedEntries) {
      // Keep the most recent entries when clipping.
      entries = entries.slice(totalEntries - entryLimit);
    }

    // Fetch exactly the books that were read in the window.
    const activeBookIds = new Set(entries.map(e => e.bookId));
    const books = new Map<string, BookInfo>();
    if (activeBookIds.size > 0) {
      const bookDocs = await Promise.all(
        Array.from(activeBookIds).map(bookId =>
          db.collection("users").doc(uid).collection("books").doc(bookId).get()
        )
      );

      bookDocs.forEach(bookDoc => {
        if (!bookDoc.exists) return;
        const data = bookDoc.data() || {};
        const meta = data.meta || {};
        const progress = data.progress || {};
        const furthestWordIndex = progress.furthestWordIndex || progress.wordIndex || 0;

        books.set(bookDoc.id, {
          id: bookDoc.id,
          title: meta.title || "Unknown Title",
          // Author is omitted because it's not currently tracked in the BookRecord schema
          totalWords: meta.totalWords || null,
          furthestWordIndex,
          completionPercentage: meta.totalWords
            ? Math.min(100, Math.round((furthestWordIndex / meta.totalWords) * 100))
            : 0,
          finishedAt: meta.dateFinished || null,
          lastReadAt: progress.lastReadAt || null,
          cumulativeDurationSeconds: progress.cumulativeDurationSeconds ?? null,
        });
      });
    }

    // --- Roll everything up over the entries actually being returned -------
    const wordsReadByModality: Record<string, number> = {};
    const durationSecondsByModality: Record<string, number> = {};
    const perBook = new Map<string, {
      durationSeconds: number;
      wordsRead: number;
      sessionCount: number;
      firstStartTime: number;
      lastEndTime: number;
      minWordIndex: number;
      maxWordIndex: number;
    }>();

    let totalTimeReadSeconds = 0;
    let totalWordsRead = 0;
    let longestSessionSeconds = 0;

    for (const entry of entries) {
      totalTimeReadSeconds += entry.durationSeconds;
      totalWordsRead += entry.wordsRead;
      longestSessionSeconds = Math.max(longestSessionSeconds, entry.durationSeconds);

      for (const [type, totals] of Object.entries(entry.byModality)) {
        if (!totals) continue;
        durationSecondsByModality[type] = (durationSecondsByModality[type] || 0) + totals.durationSeconds;
        wordsReadByModality[type] = (wordsReadByModality[type] || 0) + totals.wordsRead;
      }

      const bookTotals = perBook.get(entry.bookId) || {
        durationSeconds: 0,
        wordsRead: 0,
        sessionCount: 0,
        firstStartTime: entry.startTime,
        lastEndTime: entry.endTime,
        minWordIndex: entry.startWordIndex,
        maxWordIndex: entry.endWordIndex,
      };
      bookTotals.durationSeconds += entry.durationSeconds;
      bookTotals.wordsRead += entry.wordsRead;
      bookTotals.sessionCount += 1;
      bookTotals.firstStartTime = Math.min(bookTotals.firstStartTime, entry.startTime);
      bookTotals.lastEndTime = Math.max(bookTotals.lastEndTime, entry.endTime);
      bookTotals.minWordIndex = Math.min(bookTotals.minWordIndex, entry.startWordIndex);
      bookTotals.maxWordIndex = Math.max(bookTotals.maxWordIndex, entry.endWordIndex);
      perBook.set(entry.bookId, bookTotals);
    }

    const estimatedPagesReadByModality: Record<string, number> = {};
    for (const [type, words] of Object.entries(wordsReadByModality)) {
      estimatedPagesReadByModality[type] = estimatedPages(words);
    }

    const serializedSessions = entries
      .slice()
      .sort((a, b) => b.startTime - a.startTime)
      .map(entry => serializeEntry(entry, books.get(entry.bookId), tz));

    const dayRollups = buildDays(entries, books, tz);

    const serializedBooks = Array.from(perBook.entries())
      .sort((a, b) => b[1].lastEndTime - a[1].lastEndTime)
      .map(([bookId, totals]) => {
        const book = books.get(bookId);
        const totalWords = book?.totalWords ?? null;
        return {
          id: bookId,
          title: book?.title || entries.find(e => e.bookId === bookId)?.bookTitle || "Unknown Title",
          // Author is omitted because it's not currently tracked in the BookRecord schema
          totalWords,
          furthestWordIndex: book?.furthestWordIndex ?? totals.maxWordIndex,
          completionPercentage: book?.completionPercentage ?? 0,
          finishedAt: book?.finishedAt ?? null,
          finishedAtIso: book?.finishedAt ? formatIso(book.finishedAt, tz) : null,
          lastReadAt: book?.lastReadAt ?? null,
          allTimeDurationSeconds: book?.cumulativeDurationSeconds ?? null,
          // Everything below is scoped to the requested window.
          durationSeconds: totals.durationSeconds,
          wordsRead: totals.wordsRead,
          estimatedPagesRead: estimatedPages(totals.wordsRead),
          sessionCount: totals.sessionCount,
          firstSessionIso: formatIso(totals.firstStartTime, tz),
          lastSessionIso: formatIso(totals.lastEndTime, tz),
          percentCompleteStart: percentOf(totals.minWordIndex, totalWords),
          percentCompleteEnd: percentOf(totals.maxWordIndex, totalWords),
        };
      });

    const modalitiesSeen = Object.keys(durationSecondsByModality) as Modality[];

    const payload = {
      ownerUid: uid,
      updatedAt: now,
      updatedAtIso: formatIso(now, tz),
      // Retained for consumers written against the original response.
      timeframeDays: days,
      timeframe: {
        since,
        until,
        sinceIso: formatIso(since, tz),
        untilIso: formatIso(until, tz),
        days,
        timezone: tz,
      },
      query: {
        granularity,
        gapMinutes,
        minSeconds,
        limit: entryLimit,
        bookId: bookIdFilter || null,
      },
      summary: {
        booksReadCount: serializedBooks.length,
        sessionCount: entries.length,
        activeDays: dayRollups.length,
        totalTimeReadSeconds,
        totalWordsRead,
        totalEstimatedPagesRead: estimatedPages(totalWordsRead),
        longestSessionSeconds,
        medianSessionSeconds: medianOf(entries.map(e => e.durationSeconds)),
        modalities: modalitiesSeen,
        durationSecondsByModality,
        estimatedPagesReadByModality,
        wordsReadByModality,
        omitted: {
          shortSessions: omittedShortSessions,
          shortSessionSeconds: omittedShortSeconds,
          implausibleSessions,
          malformedSessions,
          truncatedEntries: truncatedEntries ? totalEntries - entryLimit : 0,
          truncatedRawDocuments: truncatedRawDocs,
        },
      },
      books: serializedBooks,
      days: dayRollups,
      sessions: serializedSessions,
    };

    res.status(200).json(payload);
  } catch (error) {
    console.error("Error exporting history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}
