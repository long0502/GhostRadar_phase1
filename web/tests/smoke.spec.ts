import { expect, test } from '@playwright/test';

test('homepage smoke test', async ({ page }) => {
  const consoleErrors: string[] = [];
  const missingResources: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('response', (response) => {
    if (response.status() === 404) {
      const url = response.url();
      missingResources.push(url);
      console.log('404 detected:', url);
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const faviconResponse = await page.request.get('/favicon.ico');
  if (faviconResponse.status() === 404) {
    const faviconUrl = faviconResponse.url();
    if (!missingResources.includes(faviconUrl)) {
      missingResources.push(faviconUrl);
    }
    console.log('404 detected:', faviconUrl);
  }

  await expect(page.getByTestId('map-container')).toBeVisible();
  await expect(page.getByTestId('scan-5km')).toBeVisible();

  if (missingResources.length > 0) {
    console.log('404 resources:', missingResources);
  }

  expect(
    consoleErrors,
    `Console errors detected:\n${consoleErrors.join('\n')}\n404 URLs:\n${missingResources.join('\n')}`
  ).toEqual([]);
});
