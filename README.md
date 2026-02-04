# EPUB Speed Reader

[**Hosted Epub Speed Reader**](https://epub-speed-reader-82342.web.app)

This is a minimalist, high-speed EPUB reader built for the web. This application uses **Rapid Serial Visual Presentation (RSVP)** to display one word at a time, allowing you to read faster by eliminating the need for eye movement across a page. It has no backends, though I may change that in the future. It will only work with DRM-free epub files.

![Speed reading demo](docs/Speed%20Reading.webp)

## Ask an LLM About Your Book, Without Spoilers

You can ask an LLM (only Gemini for now) about the book you're reading, and it will only
see the content you've read so far, with instructions not to spoil anything later in the book.

- "I zoned out. What just happened?"
- "Who is this character?"
- "I just picked this book after a long break. Summarize the book so far."

![LLM Answering a question about a book](docs/LLM%20Answer.webp)

## Other Features

- Uses an LLM to determine the "real" end of the book, used showing progress percentage and time remaining. This excludes extra content like notes, appendices, and indices.
- Giant font! Alas, I now need reading glasses to read at night, but not with this thing! I'm also able to read on an elliptical machine.
- Text-to-speech, so you can switch between speed reading and listening to an audiobook.

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, [epub.js](https://github.com/futurepress/epub.js)
- **Ebook Engine:** [epub.js](https://github.com/futurepress/epub.js)
- **Database:** IndexedDB (via `idb`) for local storage of books and progress.
- **Hosting:** Firebase Hosting