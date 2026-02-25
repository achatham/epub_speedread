import { useState, useEffect } from 'react';
import { type RsvpSettings, type FirestoreStorage } from '../utils/storage';
import { DEFAULT_RSVP_SETTINGS } from '../constants';
import { getGeminiApiKey, setGeminiApiKey as saveGeminiApiKey } from '../utils/gemini';
import { getDeepgramApiKey, setDeepgramApiKey as saveDeepgramApiKey } from '../utils/deepgram';

export type Theme = 'light' | 'dark' | 'bedtime';
export type FontFamily = 'system' | 'serif' | 'mono' | 'opendyslexic' | 'atkinson';

export function useSettings(storageProvider: FirestoreStorage | null, onboardingCompleted: boolean) {
    const [ttsSpeed, setTtsSpeed] = useState(() => {
        try {
            const saved = localStorage.getItem('user_settings');
            if (saved) return JSON.parse(saved).ttsSpeed || 1.0;
        } catch { }
        return 1.0;
    });

    const [geminiApiKey, setGeminiApiKey] = useState(() => {
        return getGeminiApiKey() || '';
    });

    const [deepgramApiKey, setDeepgramApiKey] = useState(() => {
        return getDeepgramApiKey() || '';
    });

    const [syncApiKey, setSyncApiKey] = useState(true);
    const [autoLandscape, setAutoLandscape] = useState(() => {
        try {
            const saved = localStorage.getItem('user_settings');
            if (saved) return JSON.parse(saved).autoLandscape ?? true;
        } catch { }
        return true;
    });

    const [theme, setTheme] = useState<Theme>(() => {
        try {
            const saved = localStorage.getItem('user_settings');
            if (saved) {
                const theme = JSON.parse(saved).theme;
                if (theme) return theme as Theme;
            }
        } catch { }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    });

    const [fontFamily, setFontFamily] = useState<FontFamily>('system');

    const [rsvpSettings, setRsvpSettings] = useState<RsvpSettings>(() => {
        try {
            const saved = localStorage.getItem('user_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.rsvp) return { ...DEFAULT_RSVP_SETTINGS, ...parsed.rsvp };
            }
        } catch { }
        return { ...DEFAULT_RSVP_SETTINGS };
    });

    // --- Auto-save Settings to Local Storage ---
    useEffect(() => {
        const settings = {
            ttsSpeed,
            autoLandscape,
            theme,
            fontFamily,
            syncApiKey,
            geminiApiKey: syncApiKey ? geminiApiKey : undefined,
            deepgramApiKey: syncApiKey ? deepgramApiKey : undefined,
            rsvp: rsvpSettings,
            onboardingCompleted
        };
        localStorage.setItem('user_settings', JSON.stringify(settings));
    }, [ttsSpeed, autoLandscape, theme, fontFamily, syncApiKey, geminiApiKey, deepgramApiKey, rsvpSettings, onboardingCompleted]);

    // --- Auto-save Settings to Firestore ---
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
                onboardingCompleted
            });
        }, 1000);
        return () => clearTimeout(timer);
    }, [ttsSpeed, autoLandscape, theme, fontFamily, syncApiKey, geminiApiKey, deepgramApiKey, rsvpSettings, storageProvider, onboardingCompleted]);


    // Apply theme class to document
    useEffect(() => {
        if (theme === 'dark' || theme === 'bedtime') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const toggleTheme = () => {
        const nextTheme: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'bedtime' : 'light';
        setTheme(nextTheme);
        storageProvider?.updateSettings({ theme: nextTheme });
    };

    return {
        ttsSpeed, setTtsSpeed,
        geminiApiKey, setGeminiApiKey: (k: string) => { setGeminiApiKey(k); saveGeminiApiKey(k); },
        deepgramApiKey, setDeepgramApiKey: (k: string) => { setDeepgramApiKey(k); saveDeepgramApiKey(k); },
        syncApiKey, setSyncApiKey,
        autoLandscape, setAutoLandscape,
        theme, setTheme, toggleTheme,
        fontFamily, setFontFamily,
        rsvpSettings, setRsvpSettings
    };
}
