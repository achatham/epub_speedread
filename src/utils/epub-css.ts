/**
 * A very small CSS reader for EPUB stylesheets.
 *
 * Books carry their own typography, and a lot of it is meaningful rather than
 * decorative: Children of Strife sets one character's speech in `span.special`
 * (sans-serif) so you can tell who is talking, and — like most novels — runs
 * paragraphs with a first-line indent and no vertical gap. None of that is
 * expressible as a tag, so extracting text without reading the stylesheet
 * flattens it away.
 *
 * We only parse the handful of declarations we can actually act on, and we let
 * the DOM do selector matching so descendant/compound selectors behave.
 */

export type GenericFamily = 'serif' | 'sans' | 'mono';

/** The subset of a CSS declaration block that survives extraction. */
export interface ElementStyle {
  italic?: boolean;
  bold?: boolean;
  family?: GenericFamily;
  /** First-line indent, in em. 0 means the book explicitly asked for none. */
  textIndentEm?: number;
  marginTopEm?: number;
  marginBottomEm?: number;
}

export interface CssRule {
  selector: string;
  specificity: number;
  order: number;
  style: ElementStyle;
  /** Tag/class/id the rightmost compound requires, for cheap pre-filtering */
  needs: SelectorKeys;
}

interface SelectorKeys {
  tag?: string;
  classes: string[];
  ids: string[];
}

/**
 * The names the rightmost compound selector demands. A document that has no
 * element with those names can't match the rule, which lets us skip most of a
 * publisher stylesheet without asking the DOM.
 */
function selectorKeys(selector: string): SelectorKeys {
  const compounds = selector.split(/[\s>+~]+/).filter(Boolean);
  const last = compounds[compounds.length - 1] ?? selector;
  const tag = /^[a-zA-Z][\w-]*/.exec(last)?.[0].toLowerCase();
  return {
    tag: tag === '*' ? undefined : tag,
    classes: (last.match(/\.[\w-]+/g) || []).map(c => c.slice(1)),
    ids: (last.match(/#[\w-]+/g) || []).map(c => c.slice(1)),
  };
}

const ITALIC_VALUE = /^(italic|oblique)/i;
const BOLD_VALUE = /^(bold|bolder|[6-9]00)$/i;
const NORMAL_WEIGHT = /^(normal|lighter|[1-5]00)$/i;

/**
 * Buckets a font-family list into a generic family. Checked most-specific
 * first because "sans-serif" contains "serif".
 */
export function genericFamily(value: string): GenericFamily | undefined {
  const v = value.toLowerCase();
  if (/monospac|courier|consolas|menlo/.test(v)) return 'mono';
  if (/sans-serif|\barial\b|helvetica|verdana|tahoma|calibri|futura/.test(v)) return 'sans';
  if (/\bserif\b|georgia|times|garamond|palatino|cambria|baskerville|caslon|minion/.test(v)) {
    return 'serif';
  }
  return undefined;
}

/**
 * Converts a CSS length to em. Absolute units are scaled against a nominal
 * 12pt/16px body so that a 20pt indent lands near the 1.7em a book intends,
 * rather than a fixed pixel size that ignores the reader's font setting.
 */
export function parseLengthEm(value: string): number | undefined {
  const match = /^(-?\d*\.?\d+)(em|rem|ex|pt|px|%)?$/.exec(value.trim().toLowerCase());
  if (!match) return undefined;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n)) return undefined;
  switch (match[2]) {
    case 'em':
    case 'rem':
      return n;
    case 'ex':
      return n * 0.5;
    case 'pt':
      return n / 12;
    case 'px':
      return n / 16;
    case '%':
      return n / 100;
    default:
      // A unitless length is only valid at zero.
      return n === 0 ? 0 : undefined;
  }
}

function parseDeclarations(body: string): ElementStyle | undefined {
  const style: ElementStyle = {};
  let found = false;

  for (const decl of body.split(';')) {
    const colon = decl.indexOf(':');
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim().replace(/\s*!important$/i, '');
    if (!value) continue;

    switch (prop) {
      case 'font-style':
        style.italic = ITALIC_VALUE.test(value);
        found = true;
        break;
      case 'font-weight':
        if (BOLD_VALUE.test(value)) style.bold = true;
        else if (NORMAL_WEIGHT.test(value)) style.bold = false;
        else break;
        found = true;
        break;
      case 'font-family': {
        const family = genericFamily(value);
        if (family) {
          style.family = family;
          found = true;
        }
        break;
      }
      case 'text-indent': {
        const em = parseLengthEm(value);
        if (em !== undefined) {
          style.textIndentEm = em;
          found = true;
        }
        break;
      }
      case 'margin-top':
      case 'margin-bottom': {
        const em = parseLengthEm(value);
        if (em !== undefined) {
          if (prop === 'margin-top') style.marginTopEm = em;
          else style.marginBottomEm = em;
          found = true;
        }
        break;
      }
      case 'margin': {
        const parts = value.split(/\s+/);
        const top = parseLengthEm(parts[0]);
        // margin: a | a b | a b c | a b c d — bottom is the 3rd value or the 1st.
        const bottom = parts.length >= 3 ? parseLengthEm(parts[2]) : top;
        if (top !== undefined && bottom !== undefined) {
          style.marginTopEm = top;
          style.marginBottomEm = bottom;
          found = true;
        }
        break;
      }
    }
  }

  return found ? style : undefined;
}

/** Rough CSS specificity — enough to order `p` below `p.noindent`. */
function specificityOf(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/[.:[][\w-]+/g) || []).length;
  const tags = (selector.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return ids * 10000 + classes * 100 + tags;
}

function collectRules(css: string, out: CssRule[], counter: { n: number }): void {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break;

    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(open + 1, depth === 0 ? j - 1 : j);

    let prelude = css.slice(i, open);
    // Drop any statement at-rules (@import, @charset) that preceded this block.
    const lastSemi = prelude.lastIndexOf(';');
    if (lastSemi !== -1) prelude = prelude.slice(lastSemi + 1);
    prelude = prelude.trim();
    i = j;

    if (prelude.startsWith('@')) {
      const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
      // Conditional groups wrap real rules; @font-face/@page/@keyframes don't.
      if (name === 'media' || name === 'supports') collectRules(body, out, counter);
      continue;
    }

    const style = parseDeclarations(body);
    if (!style) continue;

    for (const part of prelude.split(',')) {
      const selector = part.trim();
      if (selector) {
        out.push({
          selector,
          specificity: specificityOf(selector),
          order: counter.n++,
          style,
          needs: selectorKeys(selector),
        });
      }
    }
  }
}

export function parseCss(cssTexts: string[]): CssRule[] {
  const rules: CssRule[] = [];
  const counter = { n: 0 };
  for (const text of cssTexts) {
    collectRules(text.replace(/\/\*[\s\S]*?\*\//g, ' '), rules, counter);
  }
  return rules;
}

export interface DocumentStyles {
  /** Only holds elements some rule actually touched. */
  byElement: Map<Element, ElementStyle>;
  /** The family the book's body text is set in; runs that differ are notable. */
  baseFamily: GenericFamily;
}

/**
 * Applies `rules` to `doc`, cascading in specificity then source order.
 * Elements no rule matches are simply absent from the map.
 */
export function resolveDocumentStyles(doc: Document, rules: CssRule[]): DocumentStyles {
  const byElement = new Map<Element, ElementStyle>();

  // Publisher stylesheets cover the whole book; a single chapter uses a small
  // slice of them. Collect what this document contains so most rules can be
  // dropped without running a selector against the DOM.
  const tags = new Set<string>();
  const classes = new Set<string>();
  const ids = new Set<string>();
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    tags.add(el.tagName.toLowerCase());
    const cls = el.getAttribute('class');
    if (cls) for (const name of cls.split(/\s+/)) if (name) classes.add(name);
    const id = el.getAttribute('id');
    if (id) ids.add(id);
  }
  const applicable = rules.filter(
    ({ needs }) =>
      (!needs.tag || tags.has(needs.tag)) &&
      needs.classes.every(c => classes.has(c)) &&
      needs.ids.every(i => ids.has(i))
  );

  const sorted = applicable.sort(
    (a, b) => a.specificity - b.specificity || a.order - b.order
  );

  for (const rule of sorted) {
    let matched: Element[];
    try {
      matched = Array.from(doc.querySelectorAll(rule.selector));
    } catch {
      continue; // selector we (or the DOM) can't parse — skip it
    }
    for (const el of matched) {
      const prev = byElement.get(el);
      byElement.set(el, prev ? { ...prev, ...rule.style } : { ...rule.style });
    }
  }

  const bodyFamily = doc.body ? byElement.get(doc.body)?.family : undefined;
  return { byElement, baseFamily: bodyFamily ?? 'serif' };
}
