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
// mock storage provider used by playwright tests
const MOCK_STORAGE = {
    getSettings: async () => ({ onboardingCompleted: localStorage.getItem('mock_onboarding_completed') !== 'false' }),
    getAllBooks: async () => [],
    getSessions: async () => [],
    getAggregatedSessions: async () => [],
    updateBookProgress: async () => { },
    updateBookWpm: async () => { },
    updateSettings: async () => { },
    logReadingSession: async () => { },
    updateBookRealEndIndex: async () => { },
    updateBookRealEndQuote: async () => { },
    updateBookTotalWords: async () => { },
    updateBookArchived: async () => { },
    aggregateSessions: async () => { },
    getChapterAudio: async () => null,
    saveChapterAudio: async () => { },
    deleteBook: async () => { },
    getBook: async () => null,
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
