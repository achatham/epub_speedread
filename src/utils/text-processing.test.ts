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

  it('should split ellipses into standalone tokens', () => {
    const html = '<p>Word...word word... word word . . . word word…word</p>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const words = extractWordsFromDoc(doc);

    const texts = words.map(w => w.text);
    // Standardizing all to "..." as per plan
    expect(texts).toEqual([
      'Word', '...', 'word', 'word', '...', 'word', 'word', '...', 'word', 'word', '...', 'word'
    ]);
  });
});

describe('extractWordsFromDoc formatting', () => {
  const parse = (html: string) =>
    extractWordsFromDoc(new DOMParser().parseFromString(html, 'text/html'));

  it('marks italic and bold words', () => {
    const words = parse('<p>Plain <em>emphasised words</em> and <strong>strong</strong> ones.</p>');

    expect(words.map(w => w.text)).toEqual([
      'Plain', 'emphasised', 'words', 'and', 'strong', 'ones.'
    ]);
    expect(words.filter(w => w.isItalic).map(w => w.text)).toEqual(['emphasised', 'words']);
    expect(words.filter(w => w.isBold).map(w => w.text)).toEqual(['strong']);
  });

  it('detects styling from inline styles and spelled-out class names', () => {
    const words = parse(
      '<p><span style="font-style: italic">slanted</span> ' +
      '<span style="font-weight:700">heavy</span> ' +
      '<span class="text italic">classy</span> ' +
      '<span class="calibre4">plain</span></p>'
    );

    expect(words.filter(w => w.isItalic).map(w => w.text)).toEqual(['slanted', 'classy']);
    expect(words.filter(w => w.isBold).map(w => w.text)).toEqual(['heavy']);
  });

  it('keeps words whole when formatting starts or ends mid-word', () => {
    const words = parse('<p>He said <em>no</em>. That was <em>un</em>believable.</p>');

    expect(words.map(w => w.text)).toEqual(['He', 'said', 'no.', 'That', 'was', 'unbelievable.']);
    expect(words.find(w => w.text === 'no.')?.isItalic).toBe(true);
    expect(words.find(w => w.text === 'unbelievable.')?.isItalic).toBe(true);
  });

  it('records heading levels', () => {
    const words = parse('<h1>Part One</h1><h3>A section</h3><p>Body text.</p>');

    expect(words[0]).toMatchObject({ text: 'Part', isHeading: true, headingLevel: 1 });
    expect(words[2]).toMatchObject({ text: 'A', isHeading: true, headingLevel: 3 });
    expect(words[4].isHeading).toBeUndefined();
    expect(words[4].headingLevel).toBeUndefined();
  });

  it('records blockquote nesting', () => {
    const words = parse('<p>Before.</p><blockquote><p>Quoted line.</p></blockquote><p>After.</p>');

    expect(words.filter(w => w.quoteLevel === 1).map(w => w.text)).toEqual(['Quoted', 'line.']);
    expect(words.find(w => w.text === 'After.')?.quoteLevel).toBeUndefined();
  });

  it('records nested blockquotes', () => {
    const words = parse('<blockquote><p>Outer.</p><blockquote><p>Inner.</p></blockquote></blockquote>');

    expect(words.find(w => w.text === 'Outer.')?.quoteLevel).toBe(1);
    expect(words.find(w => w.text === 'Inner.')?.quoteLevel).toBe(2);
  });

  it('marks list items with bullets and numbers', () => {
    const words = parse('<ul><li>First item</li><li>Second</li></ul><ol start="3"><li>Third</li><li>Fourth</li></ol>');

    expect(words.filter(w => w.listMarker).map(w => `${w.listMarker} ${w.text}`)).toEqual([
      '• First', '• Second', '3. Third', '4. Fourth'
    ]);
    expect(words.every(w => w.listLevel === 1)).toBe(true);
    expect(words.find(w => w.text === 'item')?.listMarker).toBeUndefined();
  });

  it('starts a new paragraph for each list item', () => {
    const words = parse('<ul><li>First item</li><li>Second item</li></ul>');

    expect(words.filter(w => w.isParagraphStart).map(w => w.text)).toEqual(['First', 'Second']);
  });

  it('does not leak formatting past its element', () => {
    const words = parse('<blockquote><p><em>Quoted.</em></p></blockquote><p>Plain again.</p>');

    const after = words.find(w => w.text === 'Plain');
    expect(after?.quoteLevel).toBeUndefined();
    expect(after?.isItalic).toBeUndefined();
  });
});
