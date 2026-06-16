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

### Running E2E tests in Docker (canonical)

E2E tests run in a container so the environment is reproducible — this is the
**canonical** way to run them, and screenshot baselines (`tests/screenshots/`)
are generated in this container. Running `npx playwright test` directly on the
host renders fonts differently and will fail the screenshot comparisons.

The tests don't need the Firebase emulator: they run in "mock mode" (see
`MOCK_STORAGE` in `src/hooks/useAuth.ts` and the `window.__loadMockWords` /
`__setLibrary` hooks the specs drive), so the container only needs Node +
browsers.

```bash
# Build the image (only needed after app/dependency changes — tests/ is mounted)
docker compose build e2e

# Run the whole suite
docker compose run --rm e2e            # or: npm run test:e2e:docker

# Run a single spec
docker compose run --rm e2e tests/onboarding.spec.ts

# Regenerate screenshot baselines (writes back to the host via the tests/ mount)
docker compose run --rm e2e --update-snapshots
```

### Running Tests

When iterating on a specific problem, try to run only the specific tests in 
your inner loop, and have playwright exit on the first error. Only run the
full suite after you're sure the target test case passes.

If you try to capture test output, use a consistent log/text filename so I
don't have to keep approving unique commands.

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

- **Pre-Submit Verification:** Before submitting any changes or finishing a task, you **MUST** run `./verify.sh` on Mac/Linux or `./verify.bat` on Windows. This ensures the project lints cleanly, builds without errors, and passes all unit and E2E tests. Failure to do so is a violation of project safety standards.
- **Gemini Versioning:** *NEVER* change a Gemini version number in code. `gemini-3-flash-preview` is the latest model and must be preserved.

But only run verify.{bat,sh} at the end of your journey. It's expensive and should not be used in your inner development loop, only when you believe you're complete.