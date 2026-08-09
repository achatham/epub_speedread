import { DEFAULT_RSVP_SETTINGS, LEGACY_CHAPTER_BREAK_DELAY } from '../constants';
import type { RsvpSettings } from './storage';

/**
 * Brings persisted RSVP settings forward to current defaults.
 *
 * Settings live in two places that both outlive a code change: the zustand
 * `user_settings` localStorage blob and the per-user Firestore document. A
 * reader who used the app before the chapter interlude was shortened carries
 * the old 3000ms value in both, so lowering the default alone would change
 * nothing for them. We rewrite that one value, and only when it matches the
 * old default exactly — a delay the reader deliberately dialled in is left
 * alone (with the unavoidable exception of someone who deliberately chose
 * exactly the old default).
 */
export function normalizeRsvpSettings<T extends Partial<RsvpSettings>>(settings: T): T {
  if (settings?.chapterBreakDelay !== LEGACY_CHAPTER_BREAK_DELAY) return settings;
  return { ...settings, chapterBreakDelay: DEFAULT_RSVP_SETTINGS.chapterBreakDelay };
}
