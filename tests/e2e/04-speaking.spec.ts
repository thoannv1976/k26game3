import { expect, test } from '@playwright/test';
import { contentItems, login } from './helpers';

// Chromium runs with a fake microphone (see playwright.config.ts launch args).
test('speaking quest S01 with consent, preparation timer and recording', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await login(page, 'student2@demo.edu.vn');
  await page.getByTestId('quest-node-S01').click();
  await page.getByTestId('quest-start').click();
  const item = contentItems('S01')[0]!;
  for (const [i, part] of item.parts!.entries()) {
    const box = page.getByTestId(`speaking-part-${part.id}`);
    await box.getByTestId('start-speaking').click();
    if (i === 0) await page.getByTestId('consent-agree').click();
    if (part.prepSeconds > 0) {
      await expect(box.getByTestId('prep-timer')).toBeVisible();
      await box.getByTestId('skip-prep').click();
    }
    await expect(box.getByTestId('speak-timer')).toBeVisible();
    await page.waitForTimeout(2500);
    await box.getByTestId('stop-recording').click();
    await expect(box.getByTestId('transcript-take')).toBeVisible({ timeout: 20_000 });
  }
  await page.getByTestId('submit-quest').click();
  await expect(page).toHaveURL(/\/results\//);
  await expect(page.getByTestId(`criteria-${item.id}`)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId(`criteria-${item.id}`)).toContainText(/Giảng viên sẽ chấm|Teacher will score this/);
});
