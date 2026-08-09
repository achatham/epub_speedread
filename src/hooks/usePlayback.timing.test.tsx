import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRef } from 'react';
import { usePlayback } from './usePlayback';
import { useReaderStore } from '../stores/useReaderStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { DEFAULT_RSVP_SETTINGS } from '../constants';
import type { WordData } from '../utils/text-processing';

const mkWords = (texts: string[]): WordData[] =>
  texts.map(t => ({ text: t, isParagraphStart: false, isSentenceStart: true }));

function useHarness() {
  const ref = useRef(null);
  return usePlayback(ref as any);
}

/**
 * Records the wall-clock time each word is displayed for, from pressing play
 * through the chapter boundary at index 3.
 */
async function runPlayback() {
  const stamps: { index: number; chapterBreak: boolean; t: number }[] = [];
  const unsub = useReaderStore.subscribe((s) =>
    stamps.push({ index: s.currentIndex, chapterBreak: s.isChapterBreak, t: Date.now() })
  );

  const { result } = renderHook(() => useHarness());
  act(() => { result.current.handleSetIsPlaying(true); });

  // 20 simulated seconds, stepped finely so each timer fires in order.
  for (let i = 0; i < 400; i++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  }
  unsub();
  return stamps;
}

describe('chapter interlude timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (document.documentElement as any).requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'fullscreenElement', { value: {}, configurable: true });
    useReaderStore.setState({
      words: mkWords(['a', 'b', 'c', 'd', 'e', 'f']),
      sections: [{ label: 'One', startIndex: 0 }, { label: 'Two', startIndex: 3 }],
      currentIndex: 0,
      isPlaying: false,
      isHoldPaused: false,
      isChapterBreak: false,
      isReadingAloud: false,
    } as any);
    useSettingsStore.setState({
      wpm: 300,
      rsvpSettings: { ...DEFAULT_RSVP_SETTINGS },
      autoLandscape: false,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds the interlude for exactly chapterBreakDelay and then resumes at full pace', async () => {
    const stamps = await runPlayback();

    const breakStart = stamps.find(s => s.chapterBreak);
    const breakEnd = stamps.find(s => !s.chapterBreak && breakStart !== undefined && s.t > breakStart.t);
    expect(breakStart).toBeDefined();
    expect(breakEnd).toBeDefined();

    // The gap between the last word of chapter 1 and the first word of
    // chapter 2 is the interlude and nothing else — no stacked delays.
    expect(breakEnd!.t - breakStart!.t).toBe(DEFAULT_RSVP_SETTINGS.chapterBreakDelay);

    // The first word of the new chapter is displayed for a normal interval;
    // the WPM ramp is not restarted by the chapter break.
    const firstWordOfChapter2 = stamps.find(s => s.index === 4);
    expect(firstWordOfChapter2!.t - breakEnd!.t).toBeLessThan(250);
  });

  it('keeps the interlude short enough not to stall the reader', async () => {
    // Guards the value itself: a 3s hold at 300 wpm is ~15 words of dead time,
    // which is what this default was lowered to fix.
    expect(DEFAULT_RSVP_SETTINGS.chapterBreakDelay).toBeLessThanOrEqual(1500);
  });

  it('respects a reader-configured interlude length', async () => {
    useSettingsStore.setState({
      rsvpSettings: { ...DEFAULT_RSVP_SETTINGS, chapterBreakDelay: 2500 },
    } as any);

    const stamps = await runPlayback();
    const breakStart = stamps.find(s => s.chapterBreak)!;
    const breakEnd = stamps.find(s => !s.chapterBreak && s.t > breakStart.t)!;
    expect(breakEnd.t - breakStart.t).toBe(2500);
  });
});
