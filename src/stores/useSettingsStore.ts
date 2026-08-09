import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_RSVP_SETTINGS, DEFAULT_PAGINATED_FONT_SIZE } from '../constants';
import type { RsvpSettings, ReadingMode } from '../utils/storage';
import { getGeminiApiKey, setGeminiApiKey as saveGeminiApiKey } from '../utils/gemini';
import { normalizeRsvpSettings } from '../utils/rsvp-settings';

export type Theme = 'light' | 'dark' | 'bedtime';
export type FontFamily = 'system' | 'serif' | 'mono' | 'opendyslexic' | 'atkinson';

interface SettingsState {
  ttsSpeed: number;
  geminiApiKey: string;
  syncApiKey: boolean;
  autoLandscape: boolean;
  theme: Theme;
  fontFamily: FontFamily;
  rsvpSettings: RsvpSettings;
  paginatedFontSize: number;
  readingMode: ReadingMode;
  lastBookId: string | null | undefined;
  onboardingCompleted: boolean;
  wpm: number;
  apiSyncToken?: string;

  setTtsSpeed: (speed: number) => void;
  setGeminiApiKey: (key: string) => void;
  setSyncApiKey: (sync: boolean) => void;
  setAutoLandscape: (auto: boolean) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setFontFamily: (family: FontFamily) => void;
  setRsvpSettings: (settings: Partial<RsvpSettings>) => void;
  setPaginatedFontSize: (size: number) => void;
  setReadingMode: (mode: ReadingMode) => void;
  setLastBookId: (id: string | null) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setWpm: (wpm: number) => void;
  setApiSyncToken: (token: string) => void;
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
      syncApiKey: true,
      autoLandscape: true,
      theme: getInitialTheme(),
      fontFamily: 'system',
      rsvpSettings: DEFAULT_RSVP_SETTINGS,
      paginatedFontSize: DEFAULT_PAGINATED_FONT_SIZE,
      readingMode: 'rsvp',
      lastBookId: undefined,
      onboardingCompleted: false,
      wpm: 300,
      apiSyncToken: undefined,

      setTtsSpeed: (speed) => set({ ttsSpeed: speed }),
      setGeminiApiKey: (key) => { set({ geminiApiKey: key }); saveGeminiApiKey(key); },
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
      setPaginatedFontSize: (size) => set({ paginatedFontSize: size }),
      setReadingMode: (mode) => set({ readingMode: mode }),
      setLastBookId: (id) => set({ lastBookId: id }),
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
      setWpm: (wpm) => set({ wpm }),
      setApiSyncToken: (token) => set({ apiSyncToken: token }),
    }),
    {
      name: 'user_settings',
      version: 1,
      // v0 -> v1: shorten the 3000ms chapter interlude that shipped as the
      // original default. Firestore-loaded settings get the same treatment in
      // App.tsx, otherwise a sync would put the old value straight back.
      migrate: (persisted, version) => {
        const state = persisted as Partial<SettingsState> | undefined;
        if (version >= 1 || !state?.rsvpSettings) return state;
        return { ...state, rsvpSettings: normalizeRsvpSettings(state.rsvpSettings) };
      },
    }
  )
);
