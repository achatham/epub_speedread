import { useEffect } from 'react';
import type { FirestoreStorage } from '../utils/storage';
import { useSettingsStore } from '../stores/useSettingsStore';

export function useSettingsSync(storageProvider: FirestoreStorage | null, onboardingCompleted: boolean) {
    const {
        ttsSpeed, autoLandscape, theme, fontFamily,
        syncApiKey, geminiApiKey, rsvpSettings,
        readingMode, paginatedFontSize, lastBookId
    } = useSettingsStore();

    // Apply theme class to document
    useEffect(() => {
        const dark = theme === 'dark' || theme === 'bedtime';
        document.documentElement.classList.toggle('dark', dark);
        // Keep the PWA status bar (Android colors it from theme-color) in
        // sync with the active theme; e-ink devices use pure black/white.
        const eink = document.documentElement.classList.contains('eink');
        const color = !dark ? '#ffffff'
            : (theme === 'bedtime' || eink) ? '#000000'
            : '#18181b';
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
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
                rsvp: rsvpSettings,
                onboardingCompleted,
                readingMode,
                paginatedFontSize,
                lastBookId
            });
        }, 1000);
        return () => clearTimeout(timer);
    }, [ttsSpeed, autoLandscape, theme, fontFamily, syncApiKey, geminiApiKey, rsvpSettings, storageProvider, onboardingCompleted, readingMode, paginatedFontSize, lastBookId]);
}
