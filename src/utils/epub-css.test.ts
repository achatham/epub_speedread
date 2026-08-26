import { describe, it, expect } from 'vitest';
import { parseCss, resolveDocumentStyles, genericFamily, parseLengthEm } from './epub-css';

const parseDoc = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html');

describe('genericFamily', () => {
  it('buckets font stacks, preferring sans over the "serif" inside it', () => {
    expect(genericFamily('sans-serif')).toBe('sans');
    expect(genericFamily('Arial, Helvetica, sans-serif')).toBe('sans');
    expect(genericFamily('Georgia, "Times New Roman", serif')).toBe('serif');
    expect(genericFamily('monospaced')).toBe('mono');
    expect(genericFamily('"Publisher Display"')).toBeUndefined();
  });
});

describe('parseLengthEm', () => {
  it('normalises absolute units against a 12pt/16px body', () => {
    expect(parseLengthEm('1.5em')).toBe(1.5);
    expect(parseLengthEm('20pt')).toBeCloseTo(1.667, 2);
    expect(parseLengthEm('16px')).toBe(1);
    expect(parseLengthEm('0em')).toBe(0);
    expect(parseLengthEm('0')).toBe(0);
  });

  it('rejects lengths it can\'t place', () => {
    expect(parseLengthEm('20')).toBeUndefined();
    expect(parseLengthEm('auto')).toBeUndefined();
    expect(parseLengthEm('')).toBeUndefined();
  });
});

describe('parseCss', () => {
  it('keeps only declarations extraction can act on', () => {
    const rules = parseCss([`
      p { color: red; line-height: 1.2em; }
      em { font-style: italic; }
    `]);
    expect(rules.map(r => r.selector)).toEqual(['em']);
    expect(rules[0].style).toEqual({ italic: true });
  });

  it('splits selector lists and strips comments', () => {
    const rules = parseCss(['/* note */ h1, .title { font-weight: bold; }']);
    expect(rules.map(r => r.selector)).toEqual(['h1', '.title']);
  });

  it('unwraps @media but drops @font-face and @import', () => {
    const rules = parseCss([`
      @import url("other.css");
      @font-face { font-family: "X"; font-weight: bold; src: url(x.otf); }
      @media screen { .quiet { font-style: italic; } }
    `]);
    expect(rules.map(r => r.selector)).toEqual(['.quiet']);
  });

  it('reads the bottom margin out of the shorthand', () => {
    expect(parseCss(['p { margin: 0 0 1.5em 0; }'])[0].style).toEqual({
      marginTopEm: 0,
      marginBottomEm: 1.5,
    });
    expect(parseCss(['p { margin: 2em 0; }'])[0].style).toEqual({
      marginTopEm: 2,
      marginBottomEm: 2,
    });
  });
});

describe('resolveDocumentStyles', () => {
  it('cascades by specificity, not source order', () => {
    const doc = parseDoc('<p class="noindent">First</p><p>Second</p>');
    const rules = parseCss(['p.noindent { text-indent: 0; } p { text-indent: 20pt; }']);
    const { byElement } = resolveDocumentStyles(doc, rules);

    const paragraphs = doc.querySelectorAll('p');
    expect(byElement.get(paragraphs[0])!.textIndentEm).toBe(0);
    expect(byElement.get(paragraphs[1])!.textIndentEm).toBeCloseTo(1.667, 2);
  });

  it('honours descendant selectors rather than matching the tag alone', () => {
    const doc = parseDoc('<div class="dateline"><p>Dated</p></div><p>Plain</p>');
    const rules = parseCss(['div.dateline p { font-family: monospaced; }']);
    const { byElement } = resolveDocumentStyles(doc, rules);

    const paragraphs = doc.querySelectorAll('p');
    expect(byElement.get(paragraphs[0])!.family).toBe('mono');
    expect(byElement.get(paragraphs[1])).toBeUndefined();
  });

  it('takes the base family from the body, defaulting to serif', () => {
    const doc = parseDoc('<p>Text</p>');
    expect(resolveDocumentStyles(doc, parseCss(['p { font-style: italic; }'])).baseFamily)
      .toBe('serif');
    expect(resolveDocumentStyles(doc, parseCss(['body { font-family: Arial; }'])).baseFamily)
      .toBe('sans');
  });

  it('ignores selectors the DOM refuses to parse', () => {
    const doc = parseDoc('<p>Text</p>');
    const rules = parseCss(['p:: { font-style: italic; } p { font-weight: bold; }']);
    const { byElement } = resolveDocumentStyles(doc, rules);
    expect(byElement.get(doc.querySelector('p')!)).toEqual({ bold: true });
  });
});
