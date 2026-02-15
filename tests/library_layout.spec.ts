import { test, expect } from '@playwright/test';

test('verify library with multiple books', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__setLibrary === 'function');

  const mockBooks = [
    {
      id: '1',
      meta: { title: 'The Great Gatsby', addedAt: Date.now() },
      progress: { wordIndex: 5000, lastReadAt: Date.now() },
      settings: { wpm: 300 },
      analysis: { realEndIndex: 10000 },
      storage: { localFile: new Blob() }
    },
    {
      id: '2',
      meta: { title: 'Moby Dick', addedAt: Date.now() - 86400000 },
      progress: { wordIndex: 1000, lastReadAt: Date.now() - 3600000 },
      settings: { wpm: 300 },
      analysis: { realEndIndex: 20000 },
      storage: { localFile: new Blob() }
    },
    {
      id: '3',
      meta: { title: 'War and Peace', addedAt: Date.now() - 172800000 },
      progress: { wordIndex: 0, lastReadAt: Date.now() - 7200000 },
      settings: { wpm: 300 },
      analysis: { realEndIndex: 50000 },
      storage: { localFile: new Blob() }
    },
    {
      id: '4',
      meta: { title: 'Archived Book', addedAt: Date.now() - 259200000 },
      progress: { wordIndex: 100, lastReadAt: Date.now() - 10800000 },
      settings: { wpm: 300 },
      analysis: { realEndIndex: 1000 },
      storage: { localFile: new Blob() },
      archived: true
    }
  ];

  await page.evaluate((books) => {
    (window as any).__setLibrary(books);
  }, mockBooks);

  // Should be in Library view since no book is selected in __setLibrary
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

  // Verify books are visible
  await expect(page.getByText('The Great Gatsby')).toBeVisible();
  await expect(page.getByText('Moby Dick')).toBeVisible();
  await expect(page.getByText('War and Peace')).toBeVisible();

  // Archived book should NOT be visible in Active tab
  await expect(page.getByText('Archived Book')).not.toBeVisible();

  // Take screenshot of active books
  await page.screenshot({ path: 'tests/screenshots/library-multi-books.png' });

  // Switch to Archived tab
  await page.getByRole('button', { name: 'Archived' }).click();
  await expect(page.getByText('Archived Book')).toBeVisible();
  await expect(page.getByText('The Great Gatsby')).not.toBeVisible();

  // Take screenshot of archived books
  await page.screenshot({ path: 'tests/screenshots/library-archived-books.png' });
});
