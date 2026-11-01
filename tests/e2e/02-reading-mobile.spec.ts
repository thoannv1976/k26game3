import { expect, test } from '@playwright/test';
import { SHOTS, answer, contentItems, login } from './helpers';

test('reading quest R01 on a phone @mobile', async ({ page }) => {
  await login(page, 'student2@demo.edu.vn');
  await expect(page.getByTestId('zone-reading')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/world-mobile.png`, fullPage: true });
  // No horizontal scrolling at phone width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.getByTestId('quest-node-R01').click();
  await page.getByTestId('quest-start').click();
  const items = contentItems('R01');
  for (const [i, item] of items.entries()) {
    await expect(page.getByTestId('passage')).toBeVisible();
    if (i === 0) await page.screenshot({ path: `${SHOTS}/reading-challenge-mobile.png`, fullPage: false });
    for (const q of item.questions!) await answer(page, item.id, q);
    if (i < items.length - 1) await page.getByTestId('next-challenge').click();
  }
  await page.getByTestId('submit-quest').click();
  await expect(page.getByTestId('xp-awarded')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/results-reading-mobile.png`, fullPage: true });
});
