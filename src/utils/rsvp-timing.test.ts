import { describe, it, expect } from 'vitest';
import { calculateRsvpInterval } from './text-processing';
import { DEFAULT_RSVP_SETTINGS } from '../constants';

describe('calculateRsvpInterval', () => {
  const wpm = 300;
  const baseInterval = 60000 / wpm; // 200ms

  it('should return base interval for normal words', () => {
    const interval = calculateRsvpInterval('hello', wpm, DEFAULT_RSVP_SETTINGS);
    expect(interval).toBe(baseInterval);
  });

  it('should apply period multiplier', () => {
    const interval = calculateRsvpInterval('world.', wpm, DEFAULT_RSVP_SETTINGS);
    expect(interval).toBe(baseInterval * DEFAULT_RSVP_SETTINGS.periodMultiplier);
  });

  it('should apply comma multiplier', () => {
    const interval = calculateRsvpInterval('pause,', wpm, DEFAULT_RSVP_SETTINGS);
    expect(interval).toBe(baseInterval * DEFAULT_RSVP_SETTINGS.commaMultiplier);
  });

  it('should apply long word multiplier', () => {
    // "unconventional" is > 8 characters
    const interval = calculateRsvpInterval('unconventional', wpm, DEFAULT_RSVP_SETTINGS);
    expect(interval).toBe(baseInterval * DEFAULT_RSVP_SETTINGS.longWordMultiplier);
  });

  it('should apply too wide multiplier for very long words', () => {
    // "unconventionalities" is long and dense enough to trigger tooWide
    const interval = calculateRsvpInterval('unconventionalities', wpm, DEFAULT_RSVP_SETTINGS);
    expect(interval).toBe(baseInterval * DEFAULT_RSVP_SETTINGS.tooWideMultiplier);
  });

  it('should combine multipliers correctly (prioritizing punctuation)', () => {
    // Word ends with period AND is long. 
    // Currently the logic does `multiplier = settings.periodMultiplier` 
    // and then later `multiplier *= settings.longWordMultiplier` if applicable.
    const interval = calculateRsvpInterval('unconventional.', wpm, DEFAULT_RSVP_SETTINGS);
    expect(interval).toBe(baseInterval * DEFAULT_RSVP_SETTINGS.periodMultiplier * DEFAULT_RSVP_SETTINGS.longWordMultiplier);
  });

  it('should handle different WPM values', () => {
    const fastWpm = 600;
    const fastInterval = 60000 / fastWpm; // 100ms
    const interval = calculateRsvpInterval('hello', fastWpm, DEFAULT_RSVP_SETTINGS);
    expect(interval).toBe(fastInterval);
  });
});
