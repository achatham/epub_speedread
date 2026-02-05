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
