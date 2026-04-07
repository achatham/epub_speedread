import { test, expect } from '@playwright/test';

const MOCK_WORDS = Array.from({ length: 1000 }, (_, i) => ({
  text: `word${i}`,
  isParagraphStart: i % 20 === 0,
  isSentenceStart: i % 5 === 0,
}));

const MOCK_SECTIONS = [
  { label: 'Chapter One', startIndex: 0 },
];

test('paginated mode logs a session when turning pages', async ({ page }) => {
  page.on('console', msg => {
    console.log('BROWSER:', msg.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');

  let loggedSession: any = null;

  await page.exposeFunction('onLogReadingSession', (session: any) => {
    console.log('NODE: onLogReadingSession called with', session.type);
    if (session.type === 'paginated') {
      loggedSession = session;
    }
  });

  await page.evaluate(({ words, sections }: any) => {
    (window as any).__loadMockWords(words, sections);

    const storage = (window as any).MOCK_STORAGE;
    storage.logReadingSession = async (session: any) => {
      console.log('BROWSER: logReadingSession called with type:', session.type, 'words:', session.wordsRead);
      await (window as any).onLogReadingSession(session);
    };
  }, { words: MOCK_WORDS, sections: MOCK_SECTIONS });


  await expect(page.locator('[data-testid="paginated-reader"]')).toBeVisible();

  // "Turn" a page - this MUST trigger a session save immediately per new specifications
  await page.locator('button[aria-label="Next page"]').click();
  await page.waitForTimeout(500);
  
  await page.locator('button[aria-label="Next page"]').click();
  await page.waitForTimeout(500);

  // After 2 clicks, Next button should STILL be enabled
  await expect(page.locator('button[aria-label="Next page"]')).toBeEnabled();

  // Clicking prev should also work!
  await page.locator('button[aria-label="Previous page"]').click();
  await page.waitForTimeout(500);
  await expect(page.locator('button[aria-label="Next page"]')).toBeEnabled();

  // Verify session was logged in Node context JUST FROM TURNING THE PAGE
  await expect.poll(() => loggedSession, {
    message: 'Session should be logged instantaneously on page turn without needing mode switches',
    timeout: 5000
  }).toBeTruthy();

  expect(loggedSession.type).toBe('paginated');
  expect(loggedSession.wordsRead).toBeGreaterThan(0);
});
