import { useState, useEffect, useRef } from 'react';
import { auth } from '../utils/firebase';
import {
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    getRedirectResult,
    signOut,
    type User
} from 'firebase/auth';
import { FirestoreStorage } from '../utils/storage';

const MOCK_USER = { uid: 'mock-user' };

let mockBooksList: any[] = [];
let mockFiles: Record<string, File> = {};
// Stands in for the saved position other devices write to. Specs seed it via
// _setProgress to play the part of "someone else read further".
let mockProgress: Record<string, { wordIndex: number; reachedAt: number; furthestWordIndex: number }> = {};

// mock storage provider used by playwright tests
const MOCK_STORAGE = {
    getSettings: async () => ({ onboardingCompleted: localStorage.getItem('mock_onboarding_completed') !== 'false' }),
    getAllBooks: async () => mockBooksList,
    getSessions: async () => [],
    getAggregatedSessions: async () => [],
    updateBookProgress: async (id: string, index: number, reachedAt: number = Date.now()) => {
        const furthestWordIndex = Math.max(index, mockProgress[id]?.furthestWordIndex || 0);
        mockProgress[id] = { wordIndex: index, reachedAt, furthestWordIndex };
        return { wordIndex: index, reachedAt, furthestWordIndex, accepted: true, offline: false };
    },
    getBookProgress: async (id: string) => mockProgress[id] || null,
    _setProgress: (id: string, progress: { wordIndex: number; reachedAt: number; furthestWordIndex?: number }) => {
        mockProgress[id] = { furthestWordIndex: progress.wordIndex, ...progress };
    },
    updateBookWpm: async () => { },
    updateBookStats: async () => { },
    updateSettings: async () => { },
    logReadingSession: async () => { },
    updateBookRealEndIndex: async () => { },
    updateBookRealEndQuote: async () => { },
    updateBookTotalWords: async () => { },
    updateBookArchived: async () => { },
    aggregateSessions: async () => [],
    pruneImplausibleSessions: async () => 0,
    getChapterAudio: async () => null,
    saveChapterAudio: async () => { },
    getIllustrations: async () => [],
    deleteBook: async (id: string) => {
        mockBooksList = mockBooksList.filter(b => b.id !== id);
        delete mockFiles[id];
    },
    getBook: async (id: string) => {
        const file = mockFiles[id];
        const record = mockBooksList.find(b => b.id === id);
        if (!file || !record) return null;
        return { ...record, storage: { localFile: file } };
    },
    addBook: async (file: File, title: string) => {
        const id = 'mock-book-' + Date.now();
        mockBooksList.push({
            id,
            meta: { title, addedAt: Date.now(), extension: 'epub' },
            progress: { wordIndex: 0, wpm: 300, totalWords: 100 },
            settings: { wpm: 300 },
            analysis: { sections: [], realEndIndex: null, realEndQuote: null },
            storage: {}
        });
        mockFiles[id] = file;
        return id;
    },
    _resetMocks: () => { mockBooksList = []; mockFiles = {}; mockProgress = {}; },
    _setMockBooks: (books: any[]) => { mockBooksList = books; }
};

export function useAuth() {
    const [user, setUser] = useState<User | null | undefined>(undefined);
    const [storageProvider, setStorageProvider] = useState<FirestoreStorage | null>(null);
    const isMockModeRef = useRef(false);

    useEffect(() => {
        if (!auth) {
            // Not initialized
            return;
        }

        // Handle redirect result
        getRedirectResult(auth)
            .then((result) => {
                if (result) {
                    console.log("Redirect sign-in successful for:", result.user.email);
                } else {
                    console.log("Redirect sign-in result: null (No redirect detected or state lost)");
                }
            })
            .catch((error) => {
                console.error("Redirect sign-in error:", error);
            });

        const unsubscribe = onAuthStateChanged(auth, (u) => {
            if (isMockModeRef.current) return;
            setUser(u);
            if (u) {
                const provider = new FirestoreStorage(u.uid);
                setStorageProvider(provider);
            } else {
                setStorageProvider(null);
            }
        });
        return unsubscribe;
    }, []);

    const handleSignIn = async () => {
        if (!auth) {
            console.error("Firebase Auth not initialized");
            return alert("Firebase not configured");
        }
        console.log("Attempting popup sign-in from origin:", window.location.origin);
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
            console.log("Popup sign-in completed. Waiting for auth state change...");
        } catch (e: any) {
            console.error("Popup sign-in failed:", e);
            if (e.code === 'auth/popup-blocked') {
                alert("Popup was blocked. Please allow popups for this site.");
            } else if (e.code === 'auth/popup-closed-by-user') {
                console.log("User closed the popup");
            } else if (e.code === 'auth/unauthorized-domain') {
                alert(`Domain Unauthorized: ${window.location.hostname} is not in Firebase Console > Auth > Settings > Authorized Domains.`);
            } else {
                alert(`Sign in error: ${e.code} - ${e.message}`);
            }
        }
    };

    const handleSignOut = async () => {
        if (auth) await signOut(auth);
    };

    return {
        user,
        setUser,
        storageProvider,
        setStorageProvider,
        handleSignIn,
        handleSignOut,
        isMockModeRef,
        MOCK_USER,
        MOCK_STORAGE,
    };
}
