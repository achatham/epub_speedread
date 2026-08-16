"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportHistory = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const history_1 = require("./history");
admin.initializeApp();
/** Hard ceiling on session documents read per request; oldest are dropped. */
const MAX_RAW_DOCS = 20000;
const DEFAULT_ENTRY_LIMIT = 2000;
function firstQueryValue(value) {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value) && typeof value[0] === "string")
        return value[0];
    return undefined;
}
function serializeEntry(entry, book, tz) {
    var _a;
    const totalWords = (_a = book === null || book === void 0 ? void 0 : book.totalWords) !== null && _a !== void 0 ? _a : null;
    const byModality = {};
    for (const [type, totals] of Object.entries(entry.byModality)) {
        if (!totals)
            continue;
        byModality[type] = {
            durationSeconds: totals.durationSeconds,
            wordsRead: totals.wordsRead,
            estimatedPagesRead: (0, history_1.estimatedPages)(totals.wordsRead),
        };
    }
    return {
        bookId: entry.bookId,
        bookTitle: entry.bookTitle || (book === null || book === void 0 ? void 0 : book.title) || "Unknown Title",
        type: entry.type,
        date: (0, history_1.dayKey)(entry.startTime, tz),
        startTime: entry.startTime,
        endTime: entry.endTime,
        startTimeIso: (0, history_1.formatIso)(entry.startTime, tz),
        endTimeIso: (0, history_1.formatIso)(entry.endTime, tz),
        // durationSeconds counts only time the app considered active; elapsed is
        // the wall-clock span, so elapsed - duration is the idle time inside a
        // sitting.
        durationSeconds: entry.durationSeconds,
        elapsedSeconds: entry.elapsedSeconds,
        wordsRead: entry.wordsRead,
        estimatedPagesRead: (0, history_1.estimatedPages)(entry.wordsRead),
        effectiveWpm: (0, history_1.effectiveWpm)(entry.wordsRead, entry.durationSeconds),
        startWordIndex: entry.startWordIndex,
        endWordIndex: entry.endWordIndex,
        percentCompleteStart: (0, history_1.percentOf)(entry.startWordIndex, totalWords),
        percentCompleteEnd: (0, history_1.percentOf)(entry.endWordIndex, totalWords),
        bookTotalWords: totalWords,
        segments: entry.segments,
        byModality,
    };
}
function buildDays(entries, books, tz) {
    var _a;
    const days = new Map();
    for (const entry of entries) {
        const date = (0, history_1.dayKey)(entry.startTime, tz);
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
            if (totals)
                day.byModality[type] = (day.byModality[type] || 0) + totals.durationSeconds;
        }
        const bookTotals = day.books.get(entry.bookId) || {
            bookId: entry.bookId,
            title: entry.bookTitle || ((_a = books.get(entry.bookId)) === null || _a === void 0 ? void 0 : _a.title) || "Unknown Title",
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
        estimatedPagesRead: (0, history_1.estimatedPages)(day.wordsRead),
        sessionCount: day.sessionCount,
        firstStartTimeIso: (0, history_1.formatIso)(day.firstStartTime, tz),
        lastEndTimeIso: (0, history_1.formatIso)(day.lastEndTime, tz),
        durationSecondsByModality: day.byModality,
        books: Array.from(day.books.values())
            .sort((a, b) => b.durationSeconds - a.durationSeconds)
            .map(b => {
            var _a, _b;
            return ({
                bookId: b.bookId,
                title: b.title,
                durationSeconds: b.durationSeconds,
                wordsRead: b.wordsRead,
                estimatedPagesRead: (0, history_1.estimatedPages)(b.wordsRead),
                percentComplete: (0, history_1.percentOf)(b.endWordIndex, (_b = (_a = books.get(b.bookId)) === null || _a === void 0 ? void 0 : _a.totalWords) !== null && _b !== void 0 ? _b : null),
            });
        }),
    }));
}
exports.exportHistory = (0, https_1.onRequest)({ cors: true, maxInstances: 10 }, async (req, res) => {
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
    if (!(0, history_1.isValidTimeZone)(tz)) {
        res.status(400).json({ error: `Unknown timezone: ${tz}` });
        return;
    }
    const granularityParam = firstQueryValue(req.query.granularity) || "sitting";
    if (!["raw", "sitting", "daily"].includes(granularityParam)) {
        res.status(400).json({ error: `Unknown granularity: ${granularityParam} (expected raw, sitting or daily)` });
        return;
    }
    const granularity = granularityParam;
    const now = Date.now();
    const untilParam = firstQueryValue(req.query.until);
    const sinceParam = firstQueryValue(req.query.since);
    const until = untilParam ? (0, history_1.parseTimestamp)(untilParam) : now;
    if (until === null) {
        res.status(400).json({ error: `Could not parse until: ${untilParam}` });
        return;
    }
    const days = (0, history_1.parseNumber)(firstQueryValue(req.query.days), 30, 0, 3650);
    const since = sinceParam ? (0, history_1.parseTimestamp)(sinceParam) : until - days * 24 * 60 * 60 * 1000;
    if (since === null) {
        res.status(400).json({ error: `Could not parse since: ${sinceParam}` });
        return;
    }
    if (since > until) {
        res.status(400).json({ error: "since must be before until" });
        return;
    }
    const gapMinutes = (0, history_1.parseNumber)(firstQueryValue(req.query.gapMinutes), history_1.DEFAULT_GAP_MINUTES, 0, 24 * 60);
    const gapMs = gapMinutes * 60 * 1000;
    const minSeconds = (0, history_1.parseNumber)(firstQueryValue(req.query.minSeconds), 0, 0, 24 * 60 * 60);
    const entryLimit = (0, history_1.parseNumber)(firstQueryValue(req.query.limit), DEFAULT_ENTRY_LIMIT, 1, 10000);
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
        const sessions = [];
        for (const doc of docs) {
            const session = (0, history_1.normalizeSession)(doc.data(), doc.id);
            if (!session) {
                malformedSessions += 1;
                continue;
            }
            if (bookIdFilter && session.bookId !== bookIdFilter)
                continue;
            // Old timing bugs left sessions claiming hours for a single page; they
            // would distort every total, so they are dropped and counted.
            if ((0, history_1.isImplausiblySlowSession)(session)) {
                implausibleSessions += 1;
                continue;
            }
            sessions.push(session);
        }
        let entries;
        if (granularity === "sitting") {
            entries = (0, history_1.sessionize)(sessions, gapMs).filter(e => e.endTime >= since && e.startTime <= until);
        }
        else {
            // raw and daily bucket strictly inside the window; only sittings use the
            // lookback, since only they can span the boundary.
            const inWindow = sessions.filter(s => s.startTime >= since && s.startTime <= until);
            entries = granularity === "raw" ? (0, history_1.asRawEntries)(inWindow) : (0, history_1.rollupDaily)(inWindow, tz);
        }
        // Short entries are usually the app being demoed, not reading. They are
        // filtered on request, but the count is always reported so an omission is
        // never mistaken for a quiet day.
        let omittedShortSessions = 0;
        let omittedShortSeconds = 0;
        if (minSeconds > 0) {
            const kept = [];
            for (const entry of entries) {
                if (entry.durationSeconds < minSeconds) {
                    omittedShortSessions += 1;
                    omittedShortSeconds += entry.durationSeconds;
                }
                else {
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
        const books = new Map();
        if (activeBookIds.size > 0) {
            const bookDocs = await Promise.all(Array.from(activeBookIds).map(bookId => db.collection("users").doc(uid).collection("books").doc(bookId).get()));
            bookDocs.forEach(bookDoc => {
                var _a;
                if (!bookDoc.exists)
                    return;
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
                    cumulativeDurationSeconds: (_a = progress.cumulativeDurationSeconds) !== null && _a !== void 0 ? _a : null,
                });
            });
        }
        // --- Roll everything up over the entries actually being returned -------
        const wordsReadByModality = {};
        const durationSecondsByModality = {};
        const perBook = new Map();
        let totalTimeReadSeconds = 0;
        let totalWordsRead = 0;
        let longestSessionSeconds = 0;
        for (const entry of entries) {
            totalTimeReadSeconds += entry.durationSeconds;
            totalWordsRead += entry.wordsRead;
            longestSessionSeconds = Math.max(longestSessionSeconds, entry.durationSeconds);
            for (const [type, totals] of Object.entries(entry.byModality)) {
                if (!totals)
                    continue;
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
        const estimatedPagesReadByModality = {};
        for (const [type, words] of Object.entries(wordsReadByModality)) {
            estimatedPagesReadByModality[type] = (0, history_1.estimatedPages)(words);
        }
        const serializedSessions = entries
            .slice()
            .sort((a, b) => b.startTime - a.startTime)
            .map(entry => serializeEntry(entry, books.get(entry.bookId), tz));
        const dayRollups = buildDays(entries, books, tz);
        const serializedBooks = Array.from(perBook.entries())
            .sort((a, b) => b[1].lastEndTime - a[1].lastEndTime)
            .map(([bookId, totals]) => {
            var _a, _b, _c, _d, _e, _f, _g;
            const book = books.get(bookId);
            const totalWords = (_a = book === null || book === void 0 ? void 0 : book.totalWords) !== null && _a !== void 0 ? _a : null;
            return {
                id: bookId,
                title: (book === null || book === void 0 ? void 0 : book.title) || ((_b = entries.find(e => e.bookId === bookId)) === null || _b === void 0 ? void 0 : _b.bookTitle) || "Unknown Title",
                // Author is omitted because it's not currently tracked in the BookRecord schema
                totalWords,
                furthestWordIndex: (_c = book === null || book === void 0 ? void 0 : book.furthestWordIndex) !== null && _c !== void 0 ? _c : totals.maxWordIndex,
                completionPercentage: (_d = book === null || book === void 0 ? void 0 : book.completionPercentage) !== null && _d !== void 0 ? _d : 0,
                finishedAt: (_e = book === null || book === void 0 ? void 0 : book.finishedAt) !== null && _e !== void 0 ? _e : null,
                finishedAtIso: (book === null || book === void 0 ? void 0 : book.finishedAt) ? (0, history_1.formatIso)(book.finishedAt, tz) : null,
                lastReadAt: (_f = book === null || book === void 0 ? void 0 : book.lastReadAt) !== null && _f !== void 0 ? _f : null,
                allTimeDurationSeconds: (_g = book === null || book === void 0 ? void 0 : book.cumulativeDurationSeconds) !== null && _g !== void 0 ? _g : null,
                // Everything below is scoped to the requested window.
                durationSeconds: totals.durationSeconds,
                wordsRead: totals.wordsRead,
                estimatedPagesRead: (0, history_1.estimatedPages)(totals.wordsRead),
                sessionCount: totals.sessionCount,
                firstSessionIso: (0, history_1.formatIso)(totals.firstStartTime, tz),
                lastSessionIso: (0, history_1.formatIso)(totals.lastEndTime, tz),
                percentCompleteStart: (0, history_1.percentOf)(totals.minWordIndex, totalWords),
                percentCompleteEnd: (0, history_1.percentOf)(totals.maxWordIndex, totalWords),
            };
        });
        const modalitiesSeen = Object.keys(durationSecondsByModality);
        const payload = {
            ownerUid: uid,
            updatedAt: now,
            updatedAtIso: (0, history_1.formatIso)(now, tz),
            // Retained for consumers written against the original response.
            timeframeDays: days,
            timeframe: {
                since,
                until,
                sinceIso: (0, history_1.formatIso)(since, tz),
                untilIso: (0, history_1.formatIso)(until, tz),
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
                totalEstimatedPagesRead: (0, history_1.estimatedPages)(totalWordsRead),
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
    }
    catch (error) {
        console.error("Error exporting history:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
function medianOf(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}
//# sourceMappingURL=index.js.map