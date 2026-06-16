@echo off
echo Starting verification...

echo 1. Running Lint...
call npm run lint -- --max-warnings 0
if %errorlevel% neq 0 exit /b %errorlevel%

echo 2. Running Build (includes Type-checking)...
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%

echo 3. Running Unit Tests (Vitest)...
call npm run test
if %errorlevel% neq 0 exit /b %errorlevel%

echo 4. Running E2E Tests (Playwright in Docker)...
REM E2E tests run in a container (see Dockerfile / docker-compose.yml) so the
REM environment - and especially screenshot baselines - is reproducible.
call docker compose build e2e
if %errorlevel% neq 0 exit /b %errorlevel%
call docker compose run --rm e2e
if %errorlevel% neq 0 exit /b %errorlevel%

echo Verification successful! All checks passed.
