import { test, expect } from '@playwright/test';

test.describe('AI State and Context Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

    await page.evaluate(() => {
      (window as any).__loadMockWords([
        { text: "Chapter", isParagraphStart: true, isSentenceStart: true },
        { text: "One", isParagraphStart: false, isSentenceStart: false },
        { text: "content.", isParagraphStart: false, isSentenceStart: false }
      ], [
        { label: "Chapter 1", startIndex: 0 }
      ]);
      localStorage.setItem('gemini_api_key', 'mock-api-key');
    });

    // Open AI Modal
    await page.locator('button[title="Open Menu"]').click();
    await page.locator('button', { hasText: 'Ask AI' }).click();
  });

  test('Ask AI and Illustrate tabs have independent input state', async ({ page }) => {
    // Type in Ask AI tab
    const askInput = page.locator('input[placeholder*="How does the protagonist"]');
    await askInput.fill('Question for AI');

    // Switch to Illustrate tab
    await page.locator('button', { hasText: 'Illustrate' }).click();
    const illustrateInput = page.locator('input[placeholder*="Describe a scene"]');
    await expect(illustrateInput).toHaveValue('');
    await illustrateInput.fill('Scene for AI');

    // Switch back to Ask AI tab
    await page.locator('button', { hasText: 'Ask AI' }).click();
    await expect(askInput).toHaveValue('Question for AI');
  });

  test('Only two canned questions are displayed', async ({ page }) => {
    // The selector above might match other buttons if the layout changes, but based on my edits:
    // CANNED_QUESTIONS.map(...) renders buttons.
    // There's also the context toggle buttons, but they are in a different div now.

    // Let's use a more specific count or text check
    await expect(page.getByText('What just happened?')).toBeVisible();
    await expect(page.getByText('Remind me what happened recently')).toBeVisible();
    await expect(page.getByText('Remind me what happened in this chapter so far')).not.toBeVisible();
    await expect(page.getByText('Give me the dramatis personae so far')).not.toBeVisible();
  });

  test('Follow-up questions feed prior exchanges back to the model', async ({ page }) => {
    const requestBodies: string[] = [];
    let answerCount = 0;
    await page.route('**://generativelanguage.googleapis.com/**', async route => {
      requestBodies.push(route.request().postData() || '');
      answerCount++;
      await route.fulfill({
        json: {
          candidates: [{
            content: { parts: [{ text: `Mock answer ${answerCount}` }], role: 'model' },
            finishReason: 'STOP',
            index: 0
          }]
        }
      });
    });

    const askInput = page.locator('input[placeholder*="How does the protagonist"]');
    await askInput.fill('Who is Bob?');
    await askInput.press('Enter');
    await expect(page.getByText('Mock answer 1')).toBeVisible();

    // The input clears and invites a follow-up
    const followUpInput = page.locator('input[placeholder*="follow-up"]');
    await expect(followUpInput).toHaveValue('');
    await followUpInput.fill('What about Alice?');
    await followUpInput.press('Enter');
    await expect(page.getByText('Mock answer 2')).toBeVisible();

    // Both exchanges stay visible as a thread
    await expect(page.getByText('Who is Bob?')).toBeVisible();
    await expect(page.getByText('Mock answer 1')).toBeVisible();
    await expect(page.getByText('What about Alice?')).toBeVisible();

    // The follow-up request carried the earlier Q&A
    expect(requestBodies.length).toBe(2);
    expect(requestBodies[1]).toContain('Who is Bob?');
    expect(requestBodies[1]).toContain('Mock answer 1');
    expect(requestBodies[0]).not.toContain('Earlier questions');

    // "New question" clears the conversation back to the empty state
    await page.getByRole('button', { name: 'New question' }).click();
    await expect(page.getByText('Mock answer 2')).not.toBeVisible();
    await expect(page.getByText('What just happened?')).toBeVisible();
  });

  test('Context toggle is functional', async ({ page }) => {
    const recentBtn = page.getByRole('button', { name: 'Recent Chapters' });
    const fullBtn = page.getByRole('button', { name: 'Full Book' });

    await expect(recentBtn).toBeVisible();
    await expect(fullBtn).toBeVisible();

    // Default should be recent (has white/bg-white class or similar)
    await expect(recentBtn).toHaveClass(/bg-white|dark:bg-zinc-700/);

    await fullBtn.click();
    await expect(fullBtn).toHaveClass(/bg-white|dark:bg-zinc-700/);
    await expect(recentBtn).not.toHaveClass(/bg-white|dark:bg-zinc-700/);
  });
});
