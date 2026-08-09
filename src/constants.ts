export const AI_QUESTIONS = {
  JUST_HAPPENED: "What just happened?",
  RECENT_SUMMARY: "Remind me what happened recently",
  CHAPTER_SUMMARY: "Remind me what happened in this chapter so far",
  DRAMATIS_PERSONAE: "Give me the dramatis personae so far"
} as const;

// We pad the WPM number the user selects to create the real base WPM number
// we use, so when we apply delays for long words and puctations, the result is
// closer to the WPM number the user indicated.
export const WPM_VANITY_RATIO = 1.25;

export const DEFAULT_PAGINATED_FONT_SIZE = 20;

// The chapter interlude used to hold for 3 seconds, which at any real reading
// speed is a dead stop of 15-40 words' worth of time. Settings saved before the
// shorter default was introduced still carry this value, so we migrate it.
// See normalizeRsvpSettings in utils/rsvp-settings.ts.
export const LEGACY_CHAPTER_BREAK_DELAY = 3000;

export const DEFAULT_RSVP_SETTINGS = {
  periodMultiplier: 2.0,
  commaMultiplier: 1.5,
  longWordMultiplier: 1.2,
  tooWideMultiplier: 1.5,
  chapterBreakDelay: 1200,
  orientationDelay: 500,
  vanityWpmRatio: 1.25,
  wpmRampDuration: 5000,
  previewWordCount: 60
} as const;
