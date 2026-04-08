import { test, expect } from '@playwright/test';

test.describe('E-Ink High Contrast Modes', () => {
  // Use a userAgent that triggers the E-ink logic
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 10; BOOX Poke3) AppleWebKit/537.36 EInkBro/1.0' });

  // Helper to init user_settings correctly for Zustand
  const setSettings = async (page: any, settings: any) => {
    await page.addInitScript((s) => {
      localStorage.setItem('user_settings', JSON.stringify({ state: s, version: 0 }));
    }, settings);
  };

  test('should render inverted B&W in Dark Mode', async ({ page }) => {
    await setSettings(page, { theme: 'dark' });
    await page.goto('/');
    
    // Wait for setting library so we display typical library UI
    await page.waitForFunction(() => typeof (window as any).__setLibrary === 'function');
    const mockBooks = [
      {
        id: '1',
        meta: { title: 'Moby Dick', addedAt: Date.now() },
        progress: { wordIndex: 50, lastReadAt: Date.now() },
        settings: { wpm: 300 },
        analysis: { realEndIndex: 100 },
        storage: { localFile: new Blob() }
      }
    ];
    await page.evaluate((books) => {
      (window as any).__setLibrary(books);
    }, mockBooks);

    await expect(page.getByText('Moby Dick')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/eink-dark-mode-library.png' });
    
    const htmlClasses = await page.evaluate(() => document.documentElement.className);
    expect(htmlClasses).toContain('eink');
    expect(htmlClasses).toContain('dark');
  });

  test('should render pure B&W in Light Mode', async ({ page }) => {
    await setSettings(page, { theme: 'light' });
    await page.goto('/');
    
    await page.waitForFunction(() => typeof (window as any).__setLibrary === 'function');
    const mockBooks = [
      {
        id: '1',
        meta: { title: 'Moby Dick', addedAt: Date.now() },
        progress: { wordIndex: 50, lastReadAt: Date.now() },
        settings: { wpm: 300 },
        analysis: { realEndIndex: 100 },
        storage: { localFile: new Blob() }
      }
    ];
    await page.evaluate((books) => {
      (window as any).__setLibrary(books);
    }, mockBooks);

    await expect(page.getByText('Moby Dick')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/eink-light-mode-library.png' });

    const htmlClasses = await page.evaluate(() => document.documentElement.className);
    expect(htmlClasses).toContain('eink');
    expect(htmlClasses).not.toContain('dark');
  });

  test('should render High Contrast Paginated Mode', async ({ page }) => {
    await setSettings(page, { theme: 'light', readingMode: 'paginated' });
    await page.goto('/');

    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
    const mockWords = [
      { text: "Call", isParagraphStart: true, isSentenceStart: true },
      { text: "me", isParagraphStart: false, isSentenceStart: false },
      { text: "Ishmael.", isParagraphStart: false, isSentenceStart: false }
    ];
    await page.evaluate(({ words }) => {
      (window as any).__loadMockWords(words);
    }, { words: mockWords });

    await expect(page.getByText('Call me Ishmael.')).toBeVisible();
    
    // Switch to dark mode while in reader just to check contrast toggling
    await page.screenshot({ path: 'tests/screenshots/eink-paginated-light.png' });
    
    // Toggle theme
    await page.getByRole('button', { name: 'Open Menu' }).click();
    await page.getByText('Theme', { exact: true }).click();
    // Close the menu before screenshot
    await page.mouse.click(10, 10);
    await page.waitForTimeout(500); // Wait for transition and menu close animation
    await page.screenshot({ path: 'tests/screenshots/eink-paginated-dark.png' });
  });

  test('should render High Contrast RSVP Mode (Light)', async ({ page }) => {
    await setSettings(page, { theme: 'light', readingMode: 'rsvp' });
    await page.goto('/');

    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
    const mockWords = [
      { text: "Call", isParagraphStart: true, isSentenceStart: true },
      { text: "me", isParagraphStart: false, isSentenceStart: false },
      { text: "Ishmael.", isParagraphStart: false, isSentenceStart: false }
    ];
    await page.evaluate(({ words }) => {
      (window as any).__setWpm?.(60);
      (window as any).__loadMockWords(words);
    }, { words: mockWords });

    // Click to start RSVP playback
    const menuFab = page.locator('button[title="Open Menu"]');
    await expect(menuFab).toBeVisible();
    await page.click('body', { position: { x: 100, y: 100 } });

    // Wait for the single word to be visible during playback
    const rsvpContainer = page.locator('.flex.w-full.items-baseline');
    await expect(rsvpContainer).toHaveText(/Call/);

    await page.screenshot({ path: 'tests/screenshots/eink-rsvp-light.png' });
  });

  test('should render High Contrast RSVP Mode (Dark)', async ({ page }) => {
    await setSettings(page, { theme: 'dark', readingMode: 'rsvp' });
    await page.goto('/');

    await page.waitForFunction(() => typeof (window as any).__loadMockWords === 'function');
    const mockWords = [
      { text: "Call", isParagraphStart: true, isSentenceStart: true },
      { text: "me", isParagraphStart: false, isSentenceStart: false },
      { text: "Ishmael.", isParagraphStart: false, isSentenceStart: false }
    ];
    await page.evaluate(({ words }) => {
      (window as any).__setWpm?.(60);
      (window as any).__loadMockWords(words);
    }, { words: mockWords });

    // Click to start RSVP playback
    const menuFab = page.locator('button[title="Open Menu"]');
    await expect(menuFab).toBeVisible();
    await page.click('body', { position: { x: 100, y: 100 } });

    // Wait for the single word to be visible during playback
    const rsvpContainer = page.locator('.flex.w-full.items-baseline');
    await expect(rsvpContainer).toHaveText(/Call/);

    await page.screenshot({ path: 'tests/screenshots/eink-rsvp-dark.png' });
  });
});
