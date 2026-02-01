# RSVP EPUB Reader

A minimalist, high-speed EPUB reader built for the web. This application uses **Rapid Serial Visual Presentation (RSVP)** to display one word at a time, allowing you to read faster by eliminating the need for eye movement across a page. All state is stored in the browser, with
no backend.

[**Open the App**](https://epub-speed-reader-82342.web.app)

## Features

- 📚 **Multi-book Library:** Upload and manage your collection of EPUB files locally.
- ⏱️ **Adjustable Speed:** Read anywhere from 100 to 1200+ Words Per Minute (WPM).
- 🌙 **Smart Themes:** Includes Light, Dark, and a special **Bedtime Mode** (Amber/Orange focus letter on black) to protect your sleep hygiene.
- 📍 **Progress Tracking:** Automatically saves your reading position and speed settings for every book.
- 🎯 **Advanced Navigation:** Skip by sentence, paragraph, or chapter to find exactly where you left off.


## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS
- **Ebook Engine:** [epub.js](https://github.com/futurepress/epub.js)
- **Database:** IndexedDB (via `idb`) for local storage of books and progress.
- **Hosting:** Firebase Hosting

---
Created with ❤️ for fast readers.