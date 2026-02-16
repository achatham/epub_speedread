import { describe, it, expect } from 'vitest';
import { extractWordsFromDoc, getCenteredContext, type WordData } from './text-processing';

describe('getCenteredContext', () => {
  const mockWords: WordData[] = [
    { text: 'One', isParagraphStart: true, isSentenceStart: true },
    { text: 'two', isParagraphStart: false, isSentenceStart: false },
    { text: 'three', isParagraphStart: false, isSentenceStart: false },
    { text: 'four', isParagraphStart: false, isSentenceStart: false },
    { text: 'five', isParagraphStart: false, isSentenceStart: false },
    { text: 'six', isParagraphStart: false, isSentenceStart: false },
    { text: 'seven', isParagraphStart: false, isSentenceStart: false },
    { text: 'eight', isParagraphStart: false, isSentenceStart: false },
    { text: 'nine', isParagraphStart: false, isSentenceStart: false },
    { text: 'ten', isParagraphStart: false, isSentenceStart: false },
  ];

  it('should center the word when in the middle', () => {
    // targetCharCount: 20.
    // "five" is 4 chars.
    // before: "four" (4), "three" (5) = 9 chars + spaces
    // after: "six" (3), "seven" (5) = 8 chars + spaces
    const { words, relativeIndex } = getCenteredContext(mockWords, 4, 20);
    expect(words.map(w => w.text)).toEqual(['three', 'four', 'five', 'six', 'seven']);
    expect(words[relativeIndex].text).toBe('five');
  });

  it('should handle start of array', () => {
    const { words, relativeIndex } = getCenteredContext(mockWords, 0, 20);
    expect(words[0].text).toBe('One');
    expect(relativeIndex).toBe(0);
    expect(words.length).toBeGreaterThan(1);
  });

  it('should handle end of array', () => {
    const { words, relativeIndex } = getCenteredContext(mockWords, 9, 20);
    expect(words[words.length - 1].text).toBe('ten');
    expect(relativeIndex).toBe(words.length - 1);
  });

  it('should return empty for empty input', () => {
    const { words } = getCenteredContext([], 0, 20);
    expect(words).toEqual([]);
  });
});

describe('extractWordsFromDoc', () => {
  it('should extract words from a simple paragraph', () => {
    const html = '<p>Hello world.</p>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    expect(words).toHaveLength(2);
    expect(words[0]).toEqual({ text: 'Hello', isParagraphStart: true, isSentenceStart: true });
    expect(words[1]).toEqual({ text: 'world.', isParagraphStart: false, isSentenceStart: false });
  });

  it('should handle multiple paragraphs', () => {
    const html = '<p>First para.</p><p>Second para.</p>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    expect(words).toHaveLength(4);
    expect(words[0].text).toBe('First');
    expect(words[0].isParagraphStart).toBe(true);
    
    expect(words[2].text).toBe('Second');
    expect(words[2].isParagraphStart).toBe(true);
  });

  it('should identify sentence starts correctly', () => {
    const html = '<p>Hello. This is a test! Is it working? Yes.</p>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    const sentenceStarts = words.filter(w => w.isSentenceStart).map(w => w.text);
    expect(sentenceStarts).toEqual(['Hello.', 'This', 'Is', 'Yes.']);
  });

  it('should handle block elements like DIV and H1', () => {
    const html = '<h1>Title</h1><div>Content inside div.</div>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    expect(words[0].text).toBe('Title');
    expect(words[0].isParagraphStart).toBe(true);
    
    expect(words[1].text).toBe('Content');
    expect(words[1].isParagraphStart).toBe(true);
  });

  it('should handle inline elements without breaking paragraphs', () => {
    const html = '<p>This is <b>bold</b> text.</p>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    expect(words.map(w => w.text)).toEqual(['This', 'is', 'bold', 'text.']);
    // "bold" should not be a paragraph start
    expect(words[2].isParagraphStart).toBe(false);
  });

  it('should handle em-dashes and en-dashes', () => {
    const html = '<p>Word—connected – separated</p>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    const texts = words.map(w => w.text);
    // "Word—connected" -> "Word", "—", "connected"
    expect(texts).toContain('Word');
    expect(texts).toContain('—');
    expect(texts).toContain('connected');
    expect(texts).toContain('–');
  });

  it('should handle nested block elements', () => {
    const html = '<div>Outer <div>Inner</div> Outer again</div>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    expect(words.map(w => w.text)).toEqual(['Outer', 'Inner', 'Outer', 'again']);
    expect(words[0].isParagraphStart).toBe(true);
    expect(words[1].isParagraphStart).toBe(true); // Inner div start
    expect(words[2].isParagraphStart).toBe(true); // After inner div
  });

  it('should handle punctuation at end of sentence', () => {
    const html = '<p>End with quote." New sentence.</p>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    expect(words[3].text).toBe('New');
    expect(words[3].isSentenceStart).toBe(true);
  });
  
  it('should handle BR tags as paragraph breaks', () => {
      const html = '<p>Line one.<br>Line two.</p>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const words = extractWordsFromDoc(doc);
      
      expect(words[0].text).toBe('Line');
      expect(words[2].text).toBe('Line');
      
      expect(words[2].isParagraphStart).toBe(true);
  });

  it('should split hyphenated words, keeping the hyphen on the preceding word', () => {
    const html = '<p>The well-known multi-hyphenated-word is here.</p>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    const texts = words.map(w => w.text);
    expect(texts).toEqual([
      'The', 'well-', 'known', 'multi-', 'hyphenated-', 'word', 'is', 'here.'
    ]);
  });
});
