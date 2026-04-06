import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_RSVP_SETTINGS, DEFAULT_PAGINATED_FONT_SIZE } from '../constants';
import type { RsvpSettings, ReadingMode } from '../utils/storage';
import { getGeminiApiKey, setGeminiApiKey as saveGeminiApiKey } from '../utils/gemini';
import { getDeepgramApiKey, setDeepgramApiKey as saveDeepgramApiKey } from '../utils/deepgram';

export type Theme = 'light' | 'dark' | 'bedtime';
export type FontFamily = 'system' | 'serif' | 'mono' | 'opendyslexic' | 'atkinson';

interface SettingsState {
  ttsSpeed: number;
  geminiApiKey: string;
  deepgramApiKey: string;
  syncApiKey: boolean;
  autoLandscape: boolean;
  theme: Theme;
  fontFamily: FontFamily;
  rsvpSettings: RsvpSettings;
  readingMode: ReadingMode;
  paginatedFontSize: number;
  onboardingCompleted: boolean;
  wpm: number;

  setTtsSpeed: (speed: number) => void;
  setGeminiApiKey: (key: string) => void;
  setDeepgramApiKey: (key: string) => void;
  setSyncApiKey: (sync: boolean) => void;
  setAutoLandscape: (auto: boolean) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setFontFamily: (family: FontFamily) => void;
  setRsvpSettings: (settings: Partial<RsvpSettings>) => void;
  setReadingMode: (mode: ReadingMode) => void;
  setPaginatedFontSize: (size: number) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setWpm: (wpm: number) => void;
}

const getInitialTheme = (): Theme => {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ttsSpeed: 1.0,
      geminiApiKey: getGeminiApiKey() || '',
      deepgramApiKey: getDeepgramApiKey() || '',
      syncApiKey: true,
      autoLandscape: true,
      theme: getInitialTheme(),
      fontFamily: 'system',
      rsvpSettings: DEFAULT_RSVP_SETTINGS,
      readingMode: 'rsvp',
      paginatedFontSize: DEFAULT_PAGINATED_FONT_SIZE,
      onboardingCompleted: false,
      wpm: 300,

      setTtsSpeed: (speed) => set({ ttsSpeed: speed }),
      setGeminiApiKey: (key) => { set({ geminiApiKey: key }); saveGeminiApiKey(key); },
      setDeepgramApiKey: (key) => { set({ deepgramApiKey: key }); saveDeepgramApiKey(key); },
      setSyncApiKey: (sync) => set({ syncApiKey: sync }),
      setAutoLandscape: (auto) => set({ autoLandscape: auto }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const current = get().theme;
        const nextTheme: Theme = current === 'light' ? 'dark' : current === 'dark' ? 'bedtime' : 'light';
        set({ theme: nextTheme });
      },
      setFontFamily: (family) => set({ fontFamily: family }),
      setRsvpSettings: (settings) => set((state) => ({ rsvpSettings: { ...state.rsvpSettings, ...settings } })),
      setReadingMode: (mode) => set({ readingMode: mode }),
      setPaginatedFontSize: (size) => set({ paginatedFontSize: size }),
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
      setWpm: (wpm) => set({ wpm }),
    }),
    {
      name: 'user_settings',
    }
  )
);
