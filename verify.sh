#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting verification...${NC}"

echo "1. Running Lint..."
npm run lint -- --max-warnings 0

echo "2. Running Build (includes Type-checking)..."
npm run build

echo "3. Running Unit Tests (Vitest)..."
npm run test

echo "4. Running E2E Tests (Playwright in Docker)..."
# E2E tests run in a container (see Dockerfile / docker-compose.yml) so the
# environment — and especially screenshot baselines — is reproducible. Running
# `npx playwright test` directly on the host renders fonts differently and will
# fail the screenshot comparisons.
docker compose build e2e
docker compose run --rm e2e

echo -e "${GREEN}Verification successful! All checks passed.${NC}"
