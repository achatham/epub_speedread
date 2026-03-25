import { describe, it, expect } from 'vitest';
import { calculateRsvpMultiplier } from './text-processing';
import { DEFAULT_RSVP_SETTINGS } from '../constants';

describe('calculateRsvpMultiplier - Quotation Pauses', () => {
  const settings = DEFAULT_RSVP_SETTINGS;

  it('should pause for comma inside closing quote', () => {
    // "hey there,"
    const word = 'there,"';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.commaMultiplier);
  });

  it('should pause for period inside closing quote', () => {
    // "End."
    const word = 'End."';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.periodMultiplier);
  });

  it('should pause for exclamation inside closing quote', () => {
    // "Wow!"
    const word = 'Wow!"';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.periodMultiplier);
  });

  it('should pause for question mark inside closing quote', () => {
    // "What?"
    const word = 'What?"';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.periodMultiplier);
  });

  it('should pause for comma outside closing quote', () => {
    // "hey there",
    const word = 'there",';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.commaMultiplier);
  });

  it('should pause for period outside closing quote', () => {
    // "End".
    const word = 'End".';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.periodMultiplier);
  });

  it('should handle curly quotes (double)', () => {
    // “hey there,”
    const word = 'there,”';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.commaMultiplier);

    // “End.”
    expect(calculateRsvpMultiplier('End.”', settings)).toBe(settings.periodMultiplier);
  });

  it('should handle curly quotes (single)', () => {
    // ‘hey there,’
    const word = 'there,’';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.commaMultiplier);

    // ‘End.’
    expect(calculateRsvpMultiplier('End.’', settings)).toBe(settings.periodMultiplier);
  });

  it('should handle straight single quotes', () => {
    // 'hey there,'
    const word = "there,'";
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.commaMultiplier);

    // 'End.'
    expect(calculateRsvpMultiplier("End.'", settings)).toBe(settings.periodMultiplier);
  });

  it('should handle guillemets', () => {
    // « hey there, »
    const word = 'there,»';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.commaMultiplier);
  });

  it('should pause for closing quotes even without punctuation', () => {
    // "Hello" she said
    // This is a common case where a pause is natural even if the comma is missing or outside the quote
    expect(calculateRsvpMultiplier('Hello"', settings)).toBe(settings.commaMultiplier);
    expect(calculateRsvpMultiplier('Hello”', settings)).toBe(settings.commaMultiplier);
    expect(calculateRsvpMultiplier('Hello»', settings)).toBe(settings.commaMultiplier);
  });

  it('should handle multiple closing characters', () => {
    // (Wait!)"
    const word = 'Wait!)"';
    expect(calculateRsvpMultiplier(word, settings)).toBe(settings.periodMultiplier);

    // (Wait,)"
    expect(calculateRsvpMultiplier('Wait,)"', settings)).toBe(settings.commaMultiplier);
  });

  it('should handle brackets and parentheses without punctuation', () => {
    expect(calculateRsvpMultiplier('Hello)', settings)).toBe(settings.commaMultiplier);
    expect(calculateRsvpMultiplier('Hello]', settings)).toBe(settings.commaMultiplier);
    expect(calculateRsvpMultiplier('Hello}', settings)).toBe(settings.commaMultiplier);
  });
});
