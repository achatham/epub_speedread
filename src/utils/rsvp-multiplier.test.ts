import { describe, it, expect } from 'vitest';
import { calculateRsvpMultiplier } from './text-processing';
import { DEFAULT_RSVP_SETTINGS } from '../constants';

describe('calculateRsvpMultiplier', () => {
  it('should return 1 for normal words', () => {
    expect(calculateRsvpMultiplier('hello', DEFAULT_RSVP_SETTINGS)).toBe(1);
  });

  it('should return period multiplier for sentence endings', () => {
    expect(calculateRsvpMultiplier('world.', DEFAULT_RSVP_SETTINGS))
      .toBe(DEFAULT_RSVP_SETTINGS.periodMultiplier);
  });

  it('should return comma multiplier for pauses', () => {
    expect(calculateRsvpMultiplier('pause,', DEFAULT_RSVP_SETTINGS))
      .toBe(DEFAULT_RSVP_SETTINGS.commaMultiplier);
  });

  it('should apply long word multiplier', () => {
    // "something" is 9 chars (> 8) but not dense enough for tooWide
    expect(calculateRsvpMultiplier('something', DEFAULT_RSVP_SETTINGS))
      .toBe(DEFAULT_RSVP_SETTINGS.longWordMultiplier);
  });

  it('should combine punctuation and long word multipliers', () => {
    const expected = DEFAULT_RSVP_SETTINGS.periodMultiplier * DEFAULT_RSVP_SETTINGS.longWordMultiplier;
    expect(calculateRsvpMultiplier('something.', DEFAULT_RSVP_SETTINGS))
      .toBe(expected);
  });

  it('should apply too wide multiplier for very long/dense words', () => {
    // "unconventionalities" triggers tooWideMultiplier
    expect(calculateRsvpMultiplier('unconventionalities', DEFAULT_RSVP_SETTINGS))
      .toBe(DEFAULT_RSVP_SETTINGS.tooWideMultiplier);
  });
});
