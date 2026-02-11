import { test, expect } from '@playwright/test';

test('verify onboarding modal appears for new users', async ({ page }) => {
  await page.goto('http://localhost:5173/');

  // Wait for the mock function to be available
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
  
  // Force onboarding to show by clearing the completed flag
  await page.evaluate(() => {
    (window as any).__setMockSettings({ onboardingCompleted: false });
    (window as any).__loadMockWords(null);
  });

  // Verify the modal title
  await expect(page.locator('text=Supercharge Your Reading')).toBeVisible();
  
  // Verify feature list
  await expect(page.locator('text=Ask Questions')).toBeVisible();
  await expect(page.locator('text=Listen to Books')).toBeVisible();
  await expect(page.locator('text=Smart Completion')).toBeVisible();

  // Take screenshot of step 1
  await page.screenshot({ path: 'tests/screenshots/onboarding-step-1.png' });

  // Click "Get Started" to go to step 2
  await page.getByRole('button', { name: 'Get Started' }).click();

  // Verify step 2 content
  await expect(page.locator('text=Enter API Key')).toBeVisible();
  await expect(page.locator('text=Is it free?')).toBeVisible();
  
  // Take screenshot of step 2
  await page.screenshot({ path: 'tests/screenshots/onboarding-step-2.png' });

  // Verify "Save & Continue" is disabled initially (empty key)
  const saveBtn = page.getByRole('button', { name: 'Save & Continue' });
  await expect(saveBtn).toBeDisabled();

  // Enter a fake key
  await page.fill('input[type="password"]', 'fake-api-key');
  await expect(saveBtn).toBeEnabled();

  // Click "Skip for now" (or "I'll do this later" on step 2) to close
  await page.getByRole('button', { name: "I'll do this later" }).click();
  
  // Verify modal is gone
  await expect(page.locator('text=Supercharge Your Reading')).not.toBeVisible();
});
