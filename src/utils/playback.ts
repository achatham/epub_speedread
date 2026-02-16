import { type WordData } from './text-processing';

export function findRewindTarget(
  currentIndex: number,
  words: WordData[],
  sections: { startIndex: number }[]
): number {
  if (words.length === 0) return currentIndex;

  // Find current chapter start
  let chapterStart = 0;
  for (const section of sections) {
    if (section.startIndex <= currentIndex) {
      chapterStart = Math.max(chapterStart, section.startIndex);
    } else {
      break;
    }
  }

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

export function getResumeIndex(
  currentIndex: number,
  words: WordData[],
  sections: { startIndex: number }[],
  isChapterBreak: boolean
): number {
  if (isChapterBreak) return currentIndex;
  return findRewindTarget(currentIndex, words, sections);
}
