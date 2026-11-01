import { expect, test } from '@playwright/test';
import { contentItems, login, words } from './helpers';

test('writing quest W01: autosave, submit and AI feedback', async ({ page }) => {
  await login(page, 'student3@demo.edu.vn');
  await page.getByTestId('quest-node-W01').click();
  await page.getByTestId('quest-start').click();
  const items = contentItems('W01');
  for (const [i, item] of items.entries()) {
    const box = page.getByTestId(`writing-${item.id}`);
    await box.fill(`Dear friend, ${words(item.task!.minWords + 15)}`);
    await expect(page.getByTestId('word-count')).toContainText(String(item.task!.minWords + 17));
    await box.blur();
    await expect(page.getByTestId('draft-status')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
    if (i < items.length - 1) await page.getByTestId('next-challenge').click();
  }
  // The draft survives a reload (server version).
  await page.reload();
  await expect(page.getByTestId(`writing-${items[1]!.id}`)).toHaveValue(/Dear friend/);
  await page.getByTestId('submit-quest').click();
  await expect(page).toHaveURL(/\/results\//);
  await expect(page.getByTestId('ai-feedback').first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId(`criteria-${items[0]!.id}`)).toContainText('/25');
  await expect(page.getByTestId('writing-text').first()).toContainText('Dear friend');
});
