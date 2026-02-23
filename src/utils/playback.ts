import type { WordData } from './text-processing';

/**
 * Finds a suitable point to rewind to when resuming playback.
 * Typically backs up 10 words and finds the start of that sentence,
 * bounded by the current chapter start.
 */
export function findRewindTarget(
  currentIndex: number,
  words: WordData[],
  sections: { startIndex: number }[]
): number {
  if (words.length === 0) return currentIndex;

  // Find current chapter start
  const currentChapter = sections.reduce((prev, curr) => {
    return (curr.startIndex <= currentIndex && curr.startIndex > prev.startIndex) ? curr : prev;
  }, sections[0] || { startIndex: 0 });
  const chapterStart = currentChapter.startIndex;

  // Back up 10 words, but not before chapter start
  const target = Math.max(chapterStart, currentIndex - 10);

  // Find sentence start from there, but don't go before chapter start
  for (let i = target; i >= chapterStart; i--) {
    if (words[i].isSentenceStart) {
      return i;
    }
  }

  return chapterStart;
}

/**
 * Calculates the index where playback should resume.
 * This applies the "rewind on resume" logic unless we are at a chapter break.
 */
export function getResumeIndex(
  currentIndex: number,
  words: WordData[],
  sections: { startIndex: number }[],
  isChapterBreak: boolean
): number {
  if (isChapterBreak) {
    return currentIndex;
  }
  return findRewindTarget(currentIndex, words, sections);
}
