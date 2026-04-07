import { useEffect } from 'react';
import type { FirestoreStorage } from '../utils/storage';
import { useSettingsStore } from '../stores/useSettingsStore';

export function useSettingsSync(storageProvider: FirestoreStorage | null, onboardingCompleted: boolean) {
    const {
        ttsSpeed, autoLandscape, theme, fontFamily,
        syncApiKey, geminiApiKey, deepgramApiKey, rsvpSettings,
        readingMode, paginatedFontSize, lastBookId
    } = useSettingsStore();

    // Apply theme class to document
    useEffect(() => {
        if (theme === 'dark' || theme === 'bedtime') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    // Auto-save Settings to Firestore
    useEffect(() => {
        if (!storageProvider) return;
        const timer = setTimeout(() => {
            storageProvider.updateSettings({
                ttsSpeed,
                autoLandscape,
                theme,
                fontFamily,
                syncApiKey,
                geminiApiKey: syncApiKey ? geminiApiKey : undefined,
                deepgramApiKey: syncApiKey ? deepgramApiKey : undefined,
                rsvp: rsvpSettings,
                onboardingCompleted,
                readingMode,
                paginatedFontSize,
                lastBookId
            });
        }, 1000);
        return () => clearTimeout(timer);
    }, [ttsSpeed, autoLandscape, theme, fontFamily, syncApiKey, geminiApiKey, deepgramApiKey, rsvpSettings, storageProvider, onboardingCompleted, readingMode, paginatedFontSize, lastBookId]);
}
