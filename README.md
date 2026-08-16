# EPUB Speed Reader

[**Hosted Epub Speed Reader**](https://epub-speed-reader-82342.web.app)

This is a minimalist, high-speed EPUB reader built for the web. This application uses **Rapid Serial Visual Presentation (RSVP)** to display one word at a time, allowing you to read faster by eliminating the need for eye movement across a page. It will only work with DRM-free epub files.

![Speed reading demo](docs/Speed%20Reading_optimized.webp)

The whole thing was vibe-coded with Gemini CLI and Jules, as I still have no idea how to write React.

## Ask an LLM About Your Book, Without Spoilers

You can ask an LLM (only Gemini for now) about the book you're reading, and it will only
see the content you've read so far, with instructions not to spoil anything later in the book.

- "I zoned out. What just happened?"
- "Who is this character?"
- "I just picked this book after a long break. Summarize the book so far."

![LLM Answering a question about a book](docs/LLM%20Answer_optimized.webp)


## Other Features

- Uses an LLM to determine the "real" end of the book, used showing progress percentage and time remaining. This excludes extra content like notes, appendices, and indices.
- Giant font! Alas, I now need reading glasses to read at night, but not with this thing! I'm also able to read on an elliptical machine.
- Text-to-speech, so you can switch between speed reading and listening to an audiobook.

## Reading History API

Settings → Agent API Token generates a token for the `exportHistory` Cloud
Function, which returns your reading history as JSON for external tools
(journals, dashboards, agents).

```bash
curl "https://us-central1-epub-speed-reader-82342.cloudfunctions.net/exportHistory?token=$TOKEN&days=7&tz=America/Los_Angeles&minSeconds=120"
```

The app records a session document whenever reading pauses, and at least once
a minute while it continues, so the underlying data is minute-resolution. The
export reconstructs **sittings** from those chunks — consecutive reading of one
book with no gap longer than `gapMinutes` — which is what makes a timeline like
`19:09–20:14 · pages 202–226` possible.

| Parameter | Default | Meaning |
| --- | --- | --- |
| `token` | — | Required. From Settings → Agent API Token. |
| `days` | `30` | Window size, counted back from `until`. |
| `since` / `until` | — | Explicit window. Epoch seconds, epoch millis or an ISO date; overrides `days`. |
| `tz` | `UTC` | IANA zone used for `*Iso` timestamps and day bucketing. Pass your own zone or an evening read will land on the next day. |
| `granularity` | `sitting` | `sitting`, `raw` (one entry per logged chunk) or `daily` (one entry per book, modality and day). |
| `gapMinutes` | `15` | Pause length that ends a sitting. |
| `minSeconds` | `0` | Drop entries shorter than this — useful for filtering out demoing the app. The count is always reported under `summary.omitted`. |
| `bookId` | — | Restrict to a single book. |
| `limit` | `2000` | Max entries returned, newest kept. |

Response highlights:

- `sessions[]` — newest first, with `startTimeIso`/`endTimeIso` (explicit UTC
  offset), `date`, `durationSeconds` (active) vs `elapsedSeconds` (wall clock),
  `wordsRead`, `estimatedPagesRead`, `effectiveWpm`, start/end word index,
  `percentCompleteStart`/`percentCompleteEnd`, `segments`, and a `byModality`
  split when a sitting mixes RSVP, paginated and listening.
- `days[]` — per-day totals with a per-book breakdown. Days with no reading are
  absent rather than zero-filled.
- `books[]` — window totals plus all-time progress for each book touched.
- `summary` — totals, `activeDays`, modality splits, and `omitted` counts for
  short, implausible, malformed or truncated records, so a filtered result is
  never mistaken for a quiet day.

Nothing is deleted by the export; it reads the raw session log rather than the
day-level aggregates the in-app stats charts use.

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, [epub.js](https://github.com/futurepress/epub.js)
- **Backend:** Firestore.
- **Ebook Engine:** [epub.js](https://github.com/futurepress/epub.js)
- **Hosting:** Firebase Hosting