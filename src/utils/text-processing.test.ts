import { describe, it, expect } from 'vitest';
import { extractWordsFromDoc } from './text-processing';

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

import { getCenteredContext } from './text-processing';

describe('getCenteredContext', () => {
  const mockWords = [
    { text: 'One', isParagraphStart: true, isSentenceStart: true },
    { text: 'Two', isParagraphStart: false, isSentenceStart: false },
    { text: 'Three', isParagraphStart: false, isSentenceStart: false },
    { text: 'Four', isParagraphStart: false, isSentenceStart: false },
    { text: 'Five', isParagraphStart: false, isSentenceStart: false },
  ];

  it('should return empty context for empty words array', () => {
    expect(getCenteredContext([], 0)).toEqual({ before: [], current: null, after: [] });
  });

  it('should center the word correctly in the middle', () => {
    const result = getCenteredContext(mockWords, 2, 3);
    expect(result.current?.text).toBe('Three');
    expect(result.before.map(w => w.text)).toEqual(['Two']);
    expect(result.after.map(w => w.text)).toEqual(['Four']);
  });

  it('should handle start boundary', () => {
    const result = getCenteredContext(mockWords, 0, 3);
    expect(result.current?.text).toBe('One');
    expect(result.before).toHaveLength(0);
    expect(result.after.map(w => w.text)).toEqual(['Two', 'Three']);
  });

  it('should handle end boundary', () => {
    const result = getCenteredContext(mockWords, 4, 3);
    expect(result.current?.text).toBe('Five');
    expect(result.before.map(w => w.text)).toEqual(['Three', 'Four']);
    expect(result.after).toHaveLength(0);
  });

  it('should handle maxWords larger than total words', () => {
    const result = getCenteredContext(mockWords, 2, 10);
    expect(result.before.map(w => w.text)).toEqual(['One', 'Two']);
    expect(result.after.map(w => w.text)).toEqual(['Four', 'Five']);
  });
});
