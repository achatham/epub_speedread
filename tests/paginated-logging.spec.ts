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

  // Switch to paginated mode
  await page.locator('button[title="Open Menu"]').click();
  await page.locator('button:has-text("Page")').click();
  await expect(page.locator('[data-testid="paginated-reader"]')).toBeVisible();

  // "Turn" some pages
  await page.locator('button[aria-label="Next page"]').click();
  await page.waitForTimeout(500);
  await page.locator('button[aria-label="Next page"]').click();
  await page.waitForTimeout(500);

  // Wait to exceed 5s session threshold
  await page.waitForTimeout(5500);

  // Switch modes to trigger session save (Close Book seems to destroy context too fast for polling)
  console.log('NODE: Switching to RSVP mode to trigger save...');
  await page.locator('button[title="Open Menu"]').click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("RSVP")').click();

  // Verify session was logged in Node context
  await expect.poll(() => loggedSession, {
    message: 'Session should be logged after mode switch',
    timeout: 10000
  }).toBeTruthy();

  expect(loggedSession.type).toBe('paginated');
  expect(loggedSession.wordsRead).toBeGreaterThan(0);
});
