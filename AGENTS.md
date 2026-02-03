# EPUB RSVP Reader

A specialized EPUB reader that uses Rapid Serial Visual Presentation (RSVP) to help users read quickly while focusing on a single point. Built with React, TypeScript, and Tailwind CSS. Books are stored witihn browser storage (no backend), and it has sleep-friendly "Bedtime" modes.

## Deployment

The project is hosted on **Firebase Hosting**.

### Prerequisites
- Firebase CLI installed (`npm install -g firebase-tools`)
- Authenticated via `firebase login`

### Deployment Commands

- **Build & Deploy:**
  ```bash
  npm run deploy
  ```
  *This is the recommended way to push changes. It runs the TypeScript compiler, Vite build, and Firebase deployment in sequence.*

- **Build Only:**
  ```bash
  npm run build
  ```

- **Firebase Deploy Only:**
  ```bash
  firebase deploy
  ```

### Configuration
- `firebase.json`: Configures the Hosting settings, including the `dist` directory and single-page application (SPA) rewrites.
- `.firebaserc`: Associates the local project with the Firebase project ID (`epub-speed-reader-82342`).

## Testing

The project uses **Playwright** for End-to-End (E2E) testing.

### Running Tests

- **Run all tests:**
  ```bash
  npx playwright test
  ```

- **Run tests with UI:**
  ```bash
  npx playwright test --ui
  ```

### Key Tests
- `tests/font_scaling.spec.ts`: Verifies that font sizes remain stable for long words like "accessibility;" based on the "transportation" benchmark.

## Development Mandates

- **Gemini Versioning:** *NEVER* change a Gemini version number in code. `gemini-3-flash-preview` is the latest model and must be preserved.
