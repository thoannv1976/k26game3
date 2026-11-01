import { expect, test } from '@playwright/test';
import { SHOTS, login } from './helpers';

test('teacher opens ENG101, reviews speaking and releases exam answers', async ({ page }) => {
  await login(page, 'teacher@demo.edu.vn');
  await expect(page).toHaveURL(/\/teacher/);
  await page.getByRole('link', { name: /ENG101/ }).first().click();
  await expect(page.getByTestId('class-title')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/teacher-class-dashboard-desktop.png`, fullPage: true });
  await page.getByTestId('class-tab-students').click();
  await expect(page.locator('a[href^="/teacher/students/"]').first()).toBeVisible();

  // Release mock exam answers for the class.
  await page.getByTestId('class-tab-results').click();
  await page.getByTestId('release-mx1').click();
  await page.getByTestId('confirm-release').click();
  await expect(page.getByTestId('release-mx1')).toHaveCount(0);

  // Review queue: the speaking quest waits for pronunciation.
  await page.goto('/teacher/review');
  await expect(page.getByTestId('review-queue')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/teacher-review-queue-desktop.png`, fullPage: true });
  await page.getByTestId('review-open').first().click();
  await expect(page.getByTestId('review-form')).toBeVisible();
  const pron = page.locator('[data-testid$="-pronunciation"]').first();
  await pron.fill('12');
  await page.getByTestId('save-review').click();
  await expect(page.getByText(/Đã lưu thẩm định|Review saved/)).toBeVisible();
});

test('student sees released exam answers', async ({ page }) => {
  await login(page, 'student1@demo.edu.vn');
  await page.goto('/history');
  await page.getByRole('link', { name: /Mock Exam/ }).first().click();
  await expect(page.getByTestId('skill-listening')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('answers-not-released')).toHaveCount(0);
});
