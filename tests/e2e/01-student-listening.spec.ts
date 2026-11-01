import { expect, test } from '@playwright/test';
import { SHOTS, answer, contentItems, login } from './helpers';

test('student completes listening quest L01 and sees results with XP', async ({ page }) => {
  await login(page, 'student1@demo.edu.vn');
  await expect(page).toHaveURL(/\/world/);
  await expect(page.getByTestId('zone-listening')).toBeVisible();
  await expect(page.getByTestId('quest-node-L01')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('quest-node-L02')).toHaveAttribute('data-state', 'locked');
  await page.screenshot({ path: `${SHOTS}/world-desktop.png`, fullPage: true });

  await page.getByTestId('quest-node-L01').click();
  await page.getByTestId('quest-start').click();
  await expect(page).toHaveURL(/\/play\//);

  const items = contentItems('L01');
  for (const [i, item] of items.entries()) {
    const player = page.getByTestId('listening-player');
    await expect(player).toBeVisible();
    // Each press uses one play (offline audio = browser speech; the UI never hangs on it).
    await page.getByTestId('play-audio').click();
    await expect(player).toContainText(/2/);
    for (const q of item.questions!) await answer(page, item.id, q);
    if (i === 0) {
      await page.getByTestId(`question-${item.id}-${item.questions![0]!.id}`).getByTestId('explain-ai').click();
      await expect(page.getByTestId('explanation')).toBeVisible();
      await expect(page.getByTestId('transcript')).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 1100 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${SHOTS}/listening-challenge-desktop.png` });
    }
    if (i < items.length - 1) await page.getByTestId('next-challenge').click();
  }
  await page.getByTestId('submit-quest').click();
  await expect(page).toHaveURL(/\/results\//);
  await expect(page.getByTestId('xp-awarded')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('disclaimer')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/results-listening-desktop.png`, fullPage: true });

  await page.getByTestId('back-to-world').click();
  await expect(page.getByTestId('quest-node-L01')).toHaveAttribute('data-state', 'completed');
  await expect(page.getByTestId('quest-node-L02')).toHaveAttribute('data-state', 'open');
});
