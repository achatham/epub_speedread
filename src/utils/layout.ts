import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext';
import type { WordData } from './text-processing';

export interface PageContent {
    words: WordData[];
    startIndex: number;
    endIndex: number;
}

const DEFAULT_FONT = '20px ui-sans-serif, system-ui, sans-serif';

/**
 * Estimates and finds the range of words that fit in a given container.
 */
export function getFitRange(
    words: WordData[],
    startIndex: number,
    maxWidth: number,
    maxHeight: number,
    font: string = DEFAULT_FONT,
    lineHeight: number = 32
): { startIndex: number; endIndex: number } {
    if (words.length === 0) return { startIndex: 0, endIndex: 0 };

    const safeStart = Math.max(0, Math.min(startIndex, words.length - 1));

    // We only need to layout from the start index until we fill the height
    // To optimize, we take a slice of words. 2000 words is usually more than enough for any screen.
    const sliceEnd = Math.min(safeStart + 2000, words.length);
    const slice = words.slice(safeStart, sliceEnd);
    const text = slice.map(w => w.text).join(' ');

    const prepared = prepareWithSegments(text, font);

    let currentHeight = 0;
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };

    while (currentHeight + lineHeight <= maxHeight) {
        const line = layoutNextLine(prepared, cursor, maxWidth);
        if (!line) break;

        currentHeight += lineHeight;
        cursor = line.end;
    }

    // Convert back to word indices.
    // In pretext, segments usually correspond to words + spaces if prepared correctly.
    // However, prepareWithSegments might group things.
    // A more robust way might be to count spaces or use a different approach if pretext segments don't match 1-1.
    // For now, let's assume segments are roughly words/spaces.

    // Actually, let's just use the text length to estimate word count if segments are tricky.
    // But pretext segments are what it uses for layout.

    const endCharIndex = getCharIndexFromCursor(prepared, cursor);
    const sliceText = text.substring(0, endCharIndex);
    const wordsInSlice = sliceText.trim().split(/\s+/).length;

    const endIndex = Math.min(safeStart + wordsInSlice, words.length);

    return { startIndex: safeStart, endIndex };
}

function getCharIndexFromCursor(prepared: PreparedTextWithSegments, cursor: LayoutCursor): number {
    let charCount = 0;
    for (let i = 0; i < cursor.segmentIndex; i++) {
        charCount += prepared.segments[i].length;
    }
    charCount += cursor.graphemeIndex;
    return charCount;
}

/**
 * Returns a "page" centered or starting at currentIndex that fits the container.
 */
export function getPageAroundIndex(
    words: WordData[],
    currentIndex: number,
    maxWidth: number,
    maxHeight: number,
    font: string = DEFAULT_FONT,
    lineHeight: number = 32,
    mode: 'start' | 'center' = 'start'
): PageContent {
    if (mode === 'start') {
        const { endIndex } = getFitRange(words, currentIndex, maxWidth, maxHeight, font, lineHeight);
        return {
            words: words.slice(currentIndex, endIndex),
            startIndex: currentIndex,
            endIndex: endIndex
        };
    } else {
        // Paused RSVP view usually wants to show context around the word
        // Let's try to fit roughly 1/3 of the height before the current word
        const targetBeforeHeight = maxHeight / 3;

        // Reverse search for start index
        let bestStart = currentIndex;
        const step = 50;
        let currentBeforeHeight = 0;

        // This is a bit expensive but since it's only on pause, it's fine.
        while (bestStart > 0 && currentBeforeHeight < targetBeforeHeight) {
            const testStart = Math.max(0, bestStart - step);
            const text = words.slice(testStart, currentIndex).map(w => w.text).join(' ');
            const prepared = prepareWithSegments(text, font);
            let h = 0;
            let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
            while (true) {
                const line = layoutNextLine(prepared, cursor, maxWidth);
                if (!line) break;
                h += lineHeight;
                cursor = line.end;
            }
            currentBeforeHeight = h;
            if (h < targetBeforeHeight) {
                bestStart = testStart;
            } else {
                // Too much, binary search or just stop here for simplicity
                break;
            }
            if (bestStart === 0) break;
        }

        const { endIndex } = getFitRange(words, bestStart, maxWidth, maxHeight, font, lineHeight);
        return {
            words: words.slice(bestStart, endIndex),
            startIndex: bestStart,
            endIndex: endIndex
        };
    }
}
