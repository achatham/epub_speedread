import { describe, it, expect } from 'vitest';
import { calculateRsvpMultiplier, extractWordsFromText } from './text-processing';
import { DEFAULT_RSVP_SETTINGS } from '../constants';

describe('Abbreviations handling', () => {
  const settings = DEFAULT_RSVP_SETTINGS;

  it('should not apply period multiplier to "Mr."', () => {
    // Current behavior: it DOES apply it. We want it NOT to.
    expect(calculateRsvpMultiplier('Mr.', settings)).toBe(1);
  });

  it('should not mark the next word as sentence start after "Mr."', () => {
    const text = 'Mr. Smith went to town.';
    const words = extractWordsFromText(text);
    // words[0] = "Mr."
    // words[1] = "Smith"
    expect(words[1].text).toBe('Smith');
    expect(words[1].isSentenceStart).toBe(false);
  });

  it('should handle abbreviations followed by closing punctuation', () => {
    // Case like: ("Mr.")
    expect(calculateRsvpMultiplier('Mr.")', settings)).toBe(1);

    const text = 'He said ("Mr.") to me.';
    const words = extractWordsFromText(text);
    // words[0] = "He"
    // words[1] = "said"
    // words[2] = "("Mr.")"
    // words[3] = "to"
    expect(words[2].text).toBe('("Mr.")');
    expect(words[3].text).toBe('to');
    expect(words[3].isSentenceStart).toBe(false);
  });

  it('should be case-insensitive for abbreviations', () => {
    expect(calculateRsvpMultiplier('mr.', settings)).toBe(1);
    expect(calculateRsvpMultiplier('DR.', settings)).toBe(1);
  });
});
