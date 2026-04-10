import { create } from 'zustand';
import type { WordData } from '../utils/text-processing';

interface ReaderState {
  currentBookId: string | null;
  bookTitle: string;
  words: WordData[];
  sections: { label: string; startIndex: number }[];
  currentIndex: number;
  visibleEndIndex: number | null;
  realEndIndex: number | null;
  furthestIndex: number | null;
  
  isPlaying: boolean;
  isHoldPaused: boolean;
  isChapterBreak: boolean;
  isReadingAloud: boolean;
  isSynthesizing: boolean;

  setCurrentBookId: (id: string | null) => void;
  setBookTitle: (title: string) => void;
  setWords: (words: WordData[]) => void;
  setSections: (sections: { label: string; startIndex: number }[]) => void;
  setCurrentIndex: (index: number | ((prev: number) => number)) => void;
  setVisibleEndIndex: (index: number | null) => void;
  setRealEndIndex: (index: number | null) => void;
  setFurthestIndex: (index: number | null) => void;

  setIsPlaying: (playing: boolean) => void;
  setIsHoldPaused: (paused: boolean) => void;
  setIsChapterBreak: (isBreak: boolean) => void;
  setIsReadingAloud: (reading: boolean) => void;
  setIsSynthesizing: (synth: boolean) => void;

  resetReader: () => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  currentBookId: null,
  bookTitle: '',
  words: [],
  sections: [],
  currentIndex: 0,
  visibleEndIndex: null,
  realEndIndex: null,
  furthestIndex: null,

  isPlaying: false,
  isHoldPaused: false,
  isChapterBreak: false,
  isReadingAloud: false,
  isSynthesizing: false,

  setCurrentBookId: (id) => set({ currentBookId: id }),
  setBookTitle: (title) => set({ bookTitle: title }),
  setWords: (words) => set({ words }),
  setSections: (sections) => set({ sections }),
  setCurrentIndex: (index) => set((state) => ({ 
    currentIndex: typeof index === 'function' ? index(state.currentIndex) : index 
  })),
  setVisibleEndIndex: (index) => set({ visibleEndIndex: index }),
  setRealEndIndex: (index) => set({ realEndIndex: index }),
  setFurthestIndex: (index) => set({ furthestIndex: index }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsHoldPaused: (paused) => set({ isHoldPaused: paused }),
  setIsChapterBreak: (isBreak) => set({ isChapterBreak: isBreak }),
  setIsReadingAloud: (reading) => set({ isReadingAloud: reading }),
  setIsSynthesizing: (synth) => set({ isSynthesizing: synth }),

  resetReader: () => set({
    currentBookId: null,
    bookTitle: '',
    words: [],
    sections: [],
    currentIndex: 0,
    visibleEndIndex: null,
    realEndIndex: null,
    furthestIndex: null,
    isPlaying: false,
    isHoldPaused: false,
    isChapterBreak: false,
    isReadingAloud: false,
    isSynthesizing: false,
  }),
}));
