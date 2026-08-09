import { describe, it, expect } from 'vitest';
import { normalizeRsvpSettings } from './rsvp-settings';
import { DEFAULT_RSVP_SETTINGS, LEGACY_CHAPTER_BREAK_DELAY } from '../constants';

describe('normalizeRsvpSettings', () => {
  it('rewrites the legacy chapter break delay to the current default', () => {
    const result = normalizeRsvpSettings({
      ...DEFAULT_RSVP_SETTINGS,
      chapterBreakDelay: LEGACY_CHAPTER_BREAK_DELAY,
    });
    expect(result.chapterBreakDelay).toBe(DEFAULT_RSVP_SETTINGS.chapterBreakDelay);
  });

  it('leaves a deliberately chosen delay alone', () => {
    for (const delay of [0, 500, 1200, 2000, 5000]) {
      const result = normalizeRsvpSettings({ ...DEFAULT_RSVP_SETTINGS, chapterBreakDelay: delay });
      expect(result.chapterBreakDelay).toBe(delay);
    }
  });

  it('preserves every other setting', () => {
    const settings = {
      ...DEFAULT_RSVP_SETTINGS,
      chapterBreakDelay: LEGACY_CHAPTER_BREAK_DELAY,
      periodMultiplier: 3.5,
      wpmRampDuration: 0,
    };
    const result = normalizeRsvpSettings(settings);
    expect(result.periodMultiplier).toBe(3.5);
    expect(result.wpmRampDuration).toBe(0);
  });

  it('tolerates a partial settings object', () => {
    expect(normalizeRsvpSettings({} as any)).toEqual({});
  });
});
