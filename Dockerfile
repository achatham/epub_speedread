# E2E test runner: runs the Playwright suite in a reproducible container.
#
# The base image pins the Playwright version to match @playwright/test in
# package.json (1.58.1) so the preinstalled browsers under /ms-playwright are
# exactly what the test runner expects.
#
# The tests run entirely in "mock mode" (see MOCK_STORAGE in src/hooks/useAuth.ts
# and the window.__loadMockWords / __setLibrary hooks the specs drive), so no
# Firebase emulator or network access is needed at runtime.
FROM mcr.microsoft.com/playwright:v1.58.1-noble

WORKDIR /app
RUN chown -R ubuntu:ubuntu /app

# Run as a non-root user: Chromium's sandbox refuses to run as root. The noble
# image's `ubuntu` user is uid 1000, which matches the typical host uid so the
# bind-mounted output dirs (test-results/, playwright-report/) stay writable.
# (The image's pwuser is uid 1001 and would hit EACCES on those mounts.)
USER ubuntu
ENV CI=true

# Install JS deps first for layer caching. Browsers are already in the image,
# so Playwright's postinstall just validates them against /ms-playwright.
COPY --chown=ubuntu:ubuntu package.json package-lock.json ./
RUN npm ci

COPY --chown=ubuntu:ubuntu . .

# Playwright's webServer config starts `npm run dev` automatically. Extra args
# are forwarded, e.g. `docker compose run --rm e2e tests/onboarding.spec.ts`.
ENTRYPOINT ["npx", "playwright", "test"]
