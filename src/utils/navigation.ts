import type { WordData } from './text-processing';

export type NavigationType = 'book' | 'chapter' | 'prev-paragraph' | 'prev-sentence' | 'next-paragraph' | 'next-sentence';

export function calculateNavigationTarget(
  currentIndex: number,
  words: WordData[],
  sections: { label: string; startIndex: number }[],
  type: NavigationType
): number {
  if (!words.length) return currentIndex;
  let targetIndex = currentIndex;

  switch (type) {
    case 'book':
      targetIndex = 0;
      break;
    case 'chapter': {
      const currentSection = sections.reduce((prev, curr) => {
        return (curr.startIndex <= currentIndex && curr.startIndex > prev.startIndex) ? curr : prev;
      }, sections[0] || { startIndex: 0 });
      targetIndex = currentSection.startIndex;
      break;
    }
    case 'prev-paragraph':
      if (words[currentIndex].isParagraphStart) {
        for (let i = currentIndex - 1; i >= 0; i--) {
          if (words[i].isParagraphStart) {
            targetIndex = i;
            break;
          }
        }
      } else {
        for (let i = currentIndex; i >= 0; i--) {
          if (words[i].isParagraphStart) {
            targetIndex = i;
            break;
          }
        }
      }
      break;
    case 'prev-sentence':
      if (words[currentIndex].isSentenceStart) {
        for (let i = currentIndex - 1; i >= 0; i--) {
          if (words[i].isSentenceStart) {
            targetIndex = i;
            break;
          }
        }
      } else {
        for (let i = currentIndex; i >= 0; i--) {
          if (words[i].isSentenceStart) {
            targetIndex = i;
            break;
          }
        }
      }
      break;
    case 'next-paragraph':
      for (let i = currentIndex + 1; i < words.length; i++) {
        if (words[i].isParagraphStart) {
          targetIndex = i;
          break;
        }
      }
      break;
    case 'next-sentence':
      for (let i = currentIndex + 1; i < words.length; i++) {
        if (words[i].isSentenceStart) {
          targetIndex = i;
          break;
        }
      }
      break;
  }

  return Math.max(0, Math.min(words.length - 1, targetIndex));
}

export function findSentenceStart(currentIndex: number, words: WordData[]): number {
  if (words.length === 0) return currentIndex;
  
  for (let i = currentIndex; i >= 0; i--) {
    if (words[i].isSentenceStart) {
      return i;
    }
  }
  return currentIndex; // Fallback
}

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
  let target = Math.max(chapterStart, currentIndex - 10);

  // Find sentence start from there, but don't go before chapter start
  for (let i = target; i >= chapterStart; i--) {
    if (words[i].isSentenceStart) {
      return i;
    }
  }

  return chapterStart;
}
