import { expect, test } from '@playwright/test';
import { SHOTS, login } from './helpers';

test('student profile (4 skills + AI summary), coach and history', async ({ page }) => {
  await login(page, 'student1@demo.edu.vn');
  await page.goto('/profile');
  await expect(page.getByTestId('profile-skill-listening')).toBeVisible();
  await expect(page.getByTestId('disclaimer')).toBeVisible();
  await page.getByTestId('ai-summary-btn').click();
  await expect(page.getByTestId('ai-summary')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/profile-desktop.png`, fullPage: true });

  await page.goto('/coach');
  await page.getByRole('textbox').fill('How can I improve my listening?');
  await page.getByTestId('coach-send').click();
  await expect(page.getByTestId('coach-answer').last()).toBeVisible({ timeout: 30_000 });

  await page.goto('/history');
  await expect(page.getByRole('link', { name: 'Airport Announcements' })).toBeVisible();
});

test('teacher creates a championship and the student sees it with a leaderboard', async ({ page, browser }) => {
  const name = `Reading Sprint ${Date.now().toString(36)}`;
  await login(page, 'teacher@demo.edu.vn');
  await page.goto('/teacher/championships');
  await page.getByTestId('champ-new').click();
  await page.getByTestId('champ-name').fill(name);
  await page.getByRole('checkbox', { name: /ENG101/ }).check();
  await page.getByTestId('champ-quest-R01').check();
  // Open from one hour ago so it is open now.
  const past = new Date(Date.now() - 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  await page.getByLabel(/Mở lúc|Opens at/).fill(`${past.getFullYear()}-${p(past.getMonth() + 1)}-${p(past.getDate())}T${p(past.getHours())}:${p(past.getMinutes())}`);
  await page.getByTestId('champ-save').click();
  await expect(page.getByText(name)).toBeVisible();

  const ctx = await browser.newContext();
  const s = await ctx.newPage();
  await login(s, 'student3@demo.edu.vn');
  await s.goto('/championships');
  await expect(s.getByText(name)).toBeVisible();
  const card = s.locator('[data-testid^="champ-"]').filter({ hasText: name });
  await expect(card.getByTestId('champ-play-R01')).toBeVisible();
  await card.getByRole('link', { name: /Bảng xếp hạng|Leaderboard/ }).click();
  await expect(s.getByText(/Cách xếp hạng|How ranking works/)).toBeVisible();
  await ctx.close();
});
