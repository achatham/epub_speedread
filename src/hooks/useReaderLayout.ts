import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import type { WordData } from '../utils/text-processing';
import { computePageEndIndex } from '../utils/layout';

interface UseReaderLayoutProps {
  currentIndex: number;
  isPlaying: boolean;
  readingMode: 'paginated' | 'rsvp';
  words: WordData[];
  sections: { startIndex: number; label: string }[];
  areaDims: { w: number; h: number } | null;
  fontSize: number;
  fontFamilyStr: string;
  lineHeight: number;
  setCurrentIndex: (idx: number) => void;
}

export function useReaderLayout({
  currentIndex,
  isPlaying,
  readingMode,
  words,
  sections,
  areaDims,
  fontSize,
  fontFamilyStr,
  lineHeight,
  setCurrentIndex
}: UseReaderLayoutProps) {
  const [layoutState, setLayoutState] = useState<{ start: number; end: number | null }>({
    start: currentIndex,
    end: null,
  });

  const historyRef = useRef<number[]>([]);
  const expectedIndexRef = useRef<number>(currentIndex);

  const prevIsPlayingRef = useRef(isPlaying);

  useEffect(() => {
    if (currentIndex !== expectedIndexRef.current) {
      historyRef.current = [];
      expectedIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  const isPageValid = layoutState.start <= currentIndex && (layoutState.end === null || currentIndex < layoutState.end);

  useEffect(() => {
    setLayoutState(prev => ({ start: prev.start, end: null }));
  }, [areaDims?.w, areaDims?.h, fontSize, fontFamilyStr, lineHeight]);

  // Synchronous reset for layout coordination
  useLayoutEffect(() => {
    if (!isPlaying) {
      if (readingMode === 'paginated' && layoutState.start !== currentIndex) {
        setLayoutState({ start: currentIndex, end: null });
      } else if (readingMode === 'rsvp') {
        let activeChapterIdxLocal = -1;
        for (let i = 0; i < sections.length; i++) {
          if (sections[i].startIndex <= currentIndex) activeChapterIdxLocal = i;
          else break;
        }
        const chapterStart = activeChapterIdxLocal !== -1 ? sections[activeChapterIdxLocal].startIndex : 0;
        let desiredStart = currentIndex;
        if (currentIndex > chapterStart) {
          if (!areaDims || areaDims.w <= 0 || areaDims.h <= 0) {
            desiredStart = Math.max(chapterStart, currentIndex - 40);
          } else {
            const PADDING = 32;
            const effectiveHeight = Math.max(lineHeight, areaDims.h - PADDING * 2 - lineHeight);
            const targetHalfHeight = effectiveHeight / 2;
            const estimatedStart = Math.max(chapterStart, currentIndex - 400);
            
            let curr = estimatedStart;
            while (curr < currentIndex) {
              const next = computePageEndIndex(words, curr, areaDims.w - PADDING * 2, targetHalfHeight, fontSize, fontFamilyStr);
              if (next >= currentIndex || next === curr) {
                break;
              }
              curr = next;
            }
            desiredStart = curr;
          }
        }
        
        const justPaused = prevIsPlayingRef.current && !isPlaying;
        if (layoutState.start !== desiredStart && (justPaused || expectedIndexRef.current !== currentIndex)) {
           setLayoutState({ start: desiredStart, end: null });
        }
      }
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, readingMode, layoutState.start, currentIndex, sections, areaDims, lineHeight, fontSize, fontFamilyStr, words]);

  const navigateNextPage = useCallback(() => {
    if (layoutState.end !== null && layoutState.end < words.length) {
      historyRef.current.push(layoutState.start);
      expectedIndexRef.current = layoutState.end;
      setCurrentIndex(layoutState.end);
      setLayoutState({ start: layoutState.end, end: null });
    }
  }, [layoutState.start, layoutState.end, words.length, setCurrentIndex]);

  const navigatePrevPage = useCallback(() => {
    if (currentIndex === 0) return;
    
    let activeChapterIdx = -1;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].startIndex <= currentIndex) activeChapterIdx = i;
      else break;
    }
    
    const chapterStart = sections[activeChapterIdx]?.startIndex ?? 0;
    if (!areaDims || areaDims.w <= 0 || areaDims.h <= 0) {
      const prev = Math.max(chapterStart, currentIndex - 1);
      expectedIndexRef.current = prev;
      setCurrentIndex(prev);
      return;
    }

    let targetIndex = 0;
    if (historyRef.current.length > 0) {
      targetIndex = historyRef.current.pop()!;
    } else {
      let anchor = chapterStart;
      if (currentIndex === chapterStart && activeChapterIdx > 0) {
        anchor = sections[activeChapterIdx - 1]?.startIndex ?? 0;
      }

      const estimatedStart = Math.max(anchor, currentIndex - 800);
      let curr = estimatedStart;
      const PADDING = 32;
      const effectiveHeight = Math.max(lineHeight, areaDims.h - PADDING * 2 - lineHeight);

      while (curr < currentIndex) {
        const next = computePageEndIndex(words, curr, areaDims.w - PADDING * 2, effectiveHeight, fontSize, fontFamilyStr);
        if (next >= currentIndex || next === curr) {
          break;
        }
        curr = next;
      }

      if (curr >= currentIndex) {
        curr = Math.max(anchor, currentIndex - 200); 
      }
      targetIndex = curr;

      if (targetIndex >= anchor && targetIndex <= anchor + Math.floor((currentIndex - targetIndex) / 2)) {
        targetIndex = anchor;
        historyRef.current = []; 
      }
    }

    expectedIndexRef.current = targetIndex;
    setCurrentIndex(targetIndex);
    setLayoutState({ start: targetIndex, end: null });
  }, [currentIndex, areaDims, sections, setCurrentIndex, words, fontSize, fontFamilyStr, lineHeight]);

  return {
    layoutState,
    setLayoutState,
    isPageValid,
    navigateNextPage,
    navigatePrevPage,
  };
}
