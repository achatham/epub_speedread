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

echo "4. Running E2E Tests (Playwright)..."
# Playwright config starts the webServer automatically
npx playwright test

echo -e "${GREEN}Verification successful! All checks passed.${NC}"
