import { test, expect } from '@playwright/test';

const SUGGESTIONS = [
  'The lighthouse\n\nA weathered tower above a black sea.',
  'Captain Ash\n\nA tall figure in a salt-stained coat.',
  'The harbour at dawn\n\nFishing boats under a pink sky.'
];

test.describe('Illustration suggestion picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

    await page.evaluate(() => {
      (window as any).__loadMockWords([
        { text: "Chapter", isParagraphStart: true, isSentenceStart: true },
        { text: "One", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
      localStorage.setItem('gemini_api_key', 'mock-api-key');
    });

    await page.locator('button[title="Open Menu"]').click();
    await page.locator('button', { hasText: 'Ask AI' }).click();
    await page.locator('button', { hasText: 'Illustrate' }).click();

    await page.evaluate(s => (window as any).__setIllustrationSuggestions(s), SUGGESTIONS);
  });

  test('suggestions start unselected and toggle on tap', async ({ page }) => {
    const lighthouse = page.getByRole('button', { name: /The lighthouse/ });
    const captain = page.getByRole('button', { name: /Captain Ash/ });

    await expect(page.getByText('0 of 3 selected')).toBeVisible();
    await expect(lighthouse).toHaveAttribute('aria-pressed', 'false');

    // Nothing is picked, so there is nothing to generate yet.
    const generate = page.getByRole('button', { name: /Tap the ones you want/ });
    await expect(generate).toBeDisabled();

    await lighthouse.click();
    await captain.click();
    await expect(lighthouse).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('2 of 3 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate 2 Illustrations/ })).toBeEnabled();

    await captain.click();
    await expect(captain).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: /Generate 1 Illustration$/ })).toBeEnabled();
  });

  test('select all and clear act on the whole list', async ({ page }) => {
    await page.getByRole('button', { name: 'Select all' }).click();
    await expect(page.getByText('3 of 3 selected')).toBeVisible();

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('0 of 3 selected')).toBeVisible();
  });

  test('unpicked suggestions survive a generation batch', async ({ page }) => {
    // Stall the model call so the batch stays in flight while we assert.
    await page.route('**://generativelanguage.googleapis.com/**', () => {});

    await page.getByRole('button', { name: /The lighthouse/ }).click();
    await page.getByRole('button', { name: /Generate 1 Illustration/ }).click();

    await expect(page.getByText('0 of 2 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: /Captain Ash/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /The harbour at dawn/ })).toBeVisible();
  });
});
