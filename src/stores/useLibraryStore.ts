import { create } from 'zustand';
import type { BookRecord, ReadingSession } from '../utils/storage';

interface LibraryState {
  library: BookRecord[];
  sessions: ReadingSession[];
  isLoadingLibrary: boolean;
  currentBookId: string | null;

  setCurrentBookId: (id: string | null) => void;
  setLibrary: (library: BookRecord[] | ((prev: BookRecord[]) => BookRecord[])) => void;
  setSessions: (sessions: ReadingSession[] | ((prev: ReadingSession[]) => ReadingSession[])) => void;
  setIsLoadingLibrary: (loading: boolean) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  library: [],
  sessions: [],
  isLoadingLibrary: true,
  currentBookId: null,

  setCurrentBookId: (id) => set({ currentBookId: id }),
  setLibrary: (library) => set((state) => ({
    library: typeof library === 'function' ? library(state.library) : library
  })),
  setSessions: (sessions) => set((state) => ({
    sessions: typeof sessions === 'function' ? sessions(state.sessions) : sessions
  })),
  setIsLoadingLibrary: (loading) => set({ isLoadingLibrary: loading }),
}));
