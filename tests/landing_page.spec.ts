import { test, expect } from '@playwright/test';

test('verify landing page shows about content below login', async ({ page }) => {
  await page.goto('http://localhost:5173/');

  // 1. Verify "Speed Reader" title
  await expect(page.locator('h1', { hasText: 'Speed Reader' }).first()).toBeVisible();

  // 2. Verify "Sign In with Google" button
  await expect(page.getByRole('button', { name: 'Sign In with Google' }).first()).toBeVisible();

  // 3. Verify About Content is visible (e.g., RSVP section)
  await expect(page.locator('text=Speed Reading with RSVP')).toBeVisible();
  
  // 4. Verify AI section
  await expect(page.locator('text=AI Assistant, No Spoilers')).toBeVisible();

  // 5. Take screenshot
  await page.screenshot({ path: 'tests/screenshots/landing-page.png', fullPage: true });
});
