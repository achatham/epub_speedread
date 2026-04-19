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
admin.initializeApp();
const WORDS_PER_PAGE = 250;
exports.exportHistory = (0, https_1.onRequest)({ cors: true, maxInstances: 10 }, async (req, res) => {
    // CORS configuration
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    const token = req.query.token;
    if (!token || typeof token !== "string") {
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
        // 30 days ago
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        // Fetch aggregated sessions for the last 30 days
        const sessionsSnapshot = await db.collection("users").doc(uid).collection("aggregatedSessions")
            .where("startTime", ">", thirtyDaysAgo)
            .orderBy("startTime", "desc")
            .get();
        const wordsReadByModality = {};
        const durationSecondsByModality = {};
        const estimatedPagesReadByModality = {};
        let totalTimeReadSeconds = 0;
        const activeBookIds = new Set();
        const sessions = sessionsSnapshot.docs.map(doc => {
            const data = doc.data();
            const type = data.type || "unknown";
            const wordsRead = data.wordsRead || 0;
            activeBookIds.add(data.bookId);
            wordsReadByModality[type] = (wordsReadByModality[type] || 0) + wordsRead;
            estimatedPagesReadByModality[type] = Math.round((wordsReadByModality[type] / WORDS_PER_PAGE) * 10) / 10;
            const durationSeconds = data.durationSeconds || 0;
            totalTimeReadSeconds += durationSeconds;
            durationSecondsByModality[type] = (durationSecondsByModality[type] || 0) + durationSeconds;
            return {
                bookTitle: data.bookTitle,
                type: type,
                wordsRead: wordsRead,
                durationSeconds: durationSeconds,
                startTime: data.startTime,
                endTime: data.endTime,
            };
        });
        // Fetch exactly the books that were read in the last 30 days
        const books = [];
        if (activeBookIds.size > 0) {
            const booksPromises = Array.from(activeBookIds).map(bookId => db.collection("users").doc(uid).collection("books").doc(bookId).get());
            const bookDocs = await Promise.all(booksPromises);
            bookDocs.forEach(bookDoc => {
                if (bookDoc.exists) {
                    const data = bookDoc.data() || {};
                    const meta = data.meta || {};
                    const progress = data.progress || {};
                    let completionPercentage = 0;
                    if (meta.totalWords && progress.furthestWordIndex) {
                        completionPercentage = Math.min(100, Math.round((progress.furthestWordIndex / meta.totalWords) * 100));
                    }
                    books.push({
                        id: bookDoc.id,
                        title: meta.title || "Unknown Title",
                        // Author is omitted because it's not currently tracked in the BookRecord schema
                        totalWords: meta.totalWords || null,
                        furthestWordIndex: progress.furthestWordIndex || progress.wordIndex || 0,
                        completionPercentage,
                        finishedAt: meta.dateFinished || null,
                    });
                }
            });
        }
        const payload = {
            ownerUid: uid,
            updatedAt: Date.now(),
            timeframeDays: 30,
            summary: {
                booksReadCount: books.length,
                totalTimeReadSeconds,
                durationSecondsByModality,
                estimatedPagesReadByModality,
                wordsReadByModality
            },
            books,
            sessions
        };
        res.status(200).json(payload);
    }
    catch (error) {
        console.error("Error exporting history:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=index.js.map