
/**
 * Calculates the Optimal Recognition Point (ORP) index for a word.
 * Rules:
 * - 0-1 letters: 0
 * - 2-5 letters: 1
 * - 6-9 letters: 2
 * - 10-13 letters: 3
 * - 14+ letters: 4
 */
export function getORPIndex(word: string): number {
  const length = word.length;
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  if (length <= 13) return 3;
  return 4;
}

export interface SplitWord {
  prefix: string;
  focus: string;
  suffix: string;
}

export function splitWord(word: string): SplitWord {
  // Find actual word content. Include dots and @ for URLs/emails.
  // We initially grab everything that looks like a word char, dot, hyphen, apostrophe, or @.
  const match = word.match(/^([\w'\-\.@]+)(.*)$/);
  let baseWord = match ? match[1] : word;
  let trailing = match ? match[2] : '';

  // If the baseWord ends with a dot (and isn't just a dot), it's likely a sentence end.
  // Move trailing punctuation back to 'trailing'
  const trailingPunctMatch = baseWord.match(/([^\w]+)$/);
  if (trailingPunctMatch && baseWord.length > 1) {
      const punct = trailingPunctMatch[1];
      baseWord = baseWord.slice(0, -punct.length);
      trailing = punct + trailing;
  }

  const index = getORPIndex(baseWord);
  
  return {
    prefix: baseWord.substring(0, index),
    focus: baseWord.charAt(index),
    suffix: baseWord.substring(index + 1) + trailing,
  };
}
