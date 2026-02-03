import { describe, it, expect } from 'vitest';
import { chunkWordsByParagraph, chunkTextByParagraph, type WordData } from './text-processing';

describe('chunkWordsByParagraph', () => {
  it('should group words into chunks of at least minWords', () => {
    const words: WordData[] = [
      { text: 'Para1W1', isParagraphStart: true, isSentenceStart: true },
      { text: 'Para1W2', isParagraphStart: false, isSentenceStart: false },
      { text: 'Para2W1', isParagraphStart: true, isSentenceStart: true },
      { text: 'Para2W2', isParagraphStart: false, isSentenceStart: false },
      { text: 'Para3W1', isParagraphStart: true, isSentenceStart: true },
      { text: 'Para3W2', isParagraphStart: false, isSentenceStart: false },
    ];

    // minWords = 3.
    // Para 1 has 2 words. (count=2)
    // Para 2 starts. count < 3, so keep going. Para 2 has 2 words. (count=4)
    // Para 3 starts. count >= 3, so split!
    // Chunk 1: Para1W1 Para1W2 Para2W1 Para2W2
    // Chunk 2: Para3W1 Para3W2
    const chunks = chunkWordsByParagraph(words, 3);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe('Para1W1 Para1W2 Para2W1 Para2W2');
    expect(chunks[1]).toBe('Para3W1 Para3W2');
  });

  it('should keep a single long paragraph as one chunk', () => {
    const words: WordData[] = [
      { text: 'W1', isParagraphStart: true, isSentenceStart: true },
      { text: 'W2', isParagraphStart: false, isSentenceStart: false },
      { text: 'W3', isParagraphStart: false, isSentenceStart: false },
      { text: 'W4', isParagraphStart: false, isSentenceStart: false },
    ];
    const chunks = chunkWordsByParagraph(words, 2);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('W1 W2 W3 W4');
  });

  it('should handle empty input', () => {
    expect(chunkWordsByParagraph([], 3)).toEqual([]);
  });
});

describe('chunkTextByParagraph', () => {
  it('should group text paragraphs into chunks of at least minWords', () => {
    const text = `Para 1 has five words.

Para 2 has five words.

Para 3 has five words.`;

    // minWords = 6.
    // Para 1 (5 words) -> count = 5.
    // Para 2 (5 words) starts. count < 6. Add to current chunk. count = 10.
    // Para 3 (5 words) starts. count >= 6. Split!
    // Chunk 1: Para 1...\n\nPara 2...
    // Chunk 2: Para 3...
    const chunks = chunkTextByParagraph(text, 6);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('Para 1');
    expect(chunks[0]).toContain('Para 2');
    expect(chunks[1]).toBe('Para 3 has five words.');
  });

  it('should handle multiple newlines as paragraph separators', () => {
      const text = "P1\n\n\n\nP2\n\nP3";
      const chunks = chunkTextByParagraph(text, 1);
      expect(chunks).toHaveLength(3);
      expect(chunks).toEqual(['P1', 'P2', 'P3']);
  });
});
