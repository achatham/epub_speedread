import { create } from 'zustand';
import type { IllustrationRecord } from '../utils/storage';

export interface AiExchange {
  question: string;
  answer: string;
}

interface UIState {
  isSettingsOpen: boolean;
  isAskAiOpen: boolean;
  isStatsOpen: boolean;
  isTtsDebugOpen: boolean;
  isOnboardingOpen: boolean;
  isBookSettingsOpen: boolean;
  isLogsOpen: boolean;
  
  aiTab: 'ask' | 'illustrate';
  aiQuestion: string;
  aiContextMode: 'recent' | 'full';
  illustrationQuery: string;
  aiExchanges: AiExchange[];
  pendingAiQuestion: string;
  isAiLoading: boolean;
  
  illustrationPrompt: string;
  illustrationImage: string | null;
  isIllustrationLoading: boolean;
  illustrationSuggestions: string[];
  selectedSuggestions: string[];
  isSuggesting: boolean;
  illustrations: IllustrationRecord[];

  setIsSettingsOpen: (open: boolean) => void;
  setIsAskAiOpen: (open: boolean) => void;
  setIsStatsOpen: (open: boolean) => void;
  setIsTtsDebugOpen: (open: boolean) => void;
  setIsOnboardingOpen: (open: boolean) => void;
  setIsBookSettingsOpen: (open: boolean) => void;
  setIsLogsOpen: (open: boolean) => void;

  setAiTab: (tab: 'ask' | 'illustrate') => void;
  setAiQuestion: (q: string) => void;
  setAiContextMode: (mode: 'recent' | 'full') => void;
  setIllustrationQuery: (q: string) => void;
  addAiExchange: (exchange: AiExchange) => void;
  clearAiExchanges: () => void;
  setPendingAiQuestion: (q: string) => void;
  setIsAiLoading: (loading: boolean) => void;

  setIllustrationPrompt: (prompt: string) => void;
  setIllustrationImage: (img: string | null) => void;
  setIsIllustrationLoading: (loading: boolean) => void;
  setIllustrationSuggestions: (suggestions: string[]) => void;
  setSelectedSuggestions: (suggestions: string[]) => void;
  setIsSuggesting: (suggesting: boolean) => void;
  setIllustrations: (illustrations: IllustrationRecord[] | ((prev: IllustrationRecord[]) => IllustrationRecord[])) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSettingsOpen: false,
  isAskAiOpen: false,
  isStatsOpen: false,
  isTtsDebugOpen: false,
  isOnboardingOpen: false,
  isBookSettingsOpen: false,
  isLogsOpen: false,

  aiTab: 'ask',
  aiQuestion: '',
  aiContextMode: 'recent',
  illustrationQuery: '',
  aiExchanges: [],
  pendingAiQuestion: '',
  isAiLoading: false,

  illustrationPrompt: '',
  illustrationImage: null,
  isIllustrationLoading: false,
  illustrationSuggestions: [],
  selectedSuggestions: [],
  isSuggesting: false,
  illustrations: [],

  setIsSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setIsAskAiOpen: (open) => set({ isAskAiOpen: open }),
  setIsStatsOpen: (open) => set({ isStatsOpen: open }),
  setIsTtsDebugOpen: (open) => set({ isTtsDebugOpen: open }),
  setIsOnboardingOpen: (open) => set({ isOnboardingOpen: open }),
  setIsBookSettingsOpen: (open) => set({ isBookSettingsOpen: open }),
  setIsLogsOpen: (open) => set({ isLogsOpen: open }),

  setAiTab: (tab) => set({ aiTab: tab }),
  setAiQuestion: (q) => set({ aiQuestion: q }),
  setAiContextMode: (mode) => set({ aiContextMode: mode }),
  setIllustrationQuery: (q) => set({ illustrationQuery: q }),
  addAiExchange: (exchange) => set((state) => ({ aiExchanges: [...state.aiExchanges, exchange] })),
  clearAiExchanges: () => set({ aiExchanges: [] }),
  setPendingAiQuestion: (q) => set({ pendingAiQuestion: q }),
  setIsAiLoading: (loading) => set({ isAiLoading: loading }),

  setIllustrationPrompt: (prompt) => set({ illustrationPrompt: prompt }),
  setIllustrationImage: (img) => set({ illustrationImage: img }),
  setIsIllustrationLoading: (loading) => set({ isIllustrationLoading: loading }),
  setIllustrationSuggestions: (suggestions) => set({ illustrationSuggestions: suggestions }),
  setSelectedSuggestions: (suggestions) => set({ selectedSuggestions: suggestions }),
  setIsSuggesting: (suggesting) => set({ isSuggesting: suggesting }),
  setIllustrations: (illustrations) => set((state) => ({
    illustrations: typeof illustrations === 'function' ? illustrations(state.illustrations) : illustrations
  })),
}));
