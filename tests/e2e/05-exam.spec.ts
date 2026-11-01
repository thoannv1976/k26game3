import { expect, test } from '@playwright/test';
import { SHOTS, answer, contentItems, login } from './helpers';

test('mock exam: lobby, timed sections, finish and results without answers', async ({ page }) => {
  await login(page, 'student1@demo.edu.vn');
  await page.goto('/exams');
  await expect(page.getByTestId('exam-resume-mx1').or(page.getByTestId('exam-open-mx1'))).toBeVisible();
  // A previous unfinished run (rerun against the same stack) is resumed.
  const resume = page.getByTestId('exam-resume-mx1');
  if (await resume.isVisible()) await resume.click();
  else {
    await page.getByTestId('exam-open-mx1').click();
    await page.getByTestId('exam-begin').click();
  }
  await expect(page).toHaveURL(/\/exam\//);

  const items = contentItems('MX1');
  const listening = items.find((i) => i.skill === 'listening')!;
  // Section 1: listening
  await expect(page.getByTestId('section-lobby')).toBeVisible();
  await page.getByTestId('start-section').click();
  await expect(page.getByTestId('exam-timer')).toBeVisible();
  await expect(page.getByTestId('exam-timer')).toContainText(/1[0-9]:|20:00/);
  await page.getByTestId('play-audio').first().click();
  await answer(page, listening.id, listening.questions![0]!, 'exam');
  await page.screenshot({ path: `${SHOTS}/exam-listening-timer-desktop.png`, fullPage: false });

  for (let s = 0; s < 4; s++) {
    if (s > 0) {
      await expect(page.getByTestId('section-lobby')).toBeVisible();
      await page.getByTestId('start-section').click();
      await expect(page.getByTestId('exam-timer')).toBeVisible();
    }
    await page.getByTestId('finish-section').click();
    await page.getByTestId('confirm-finish').click();
  }
  await expect(page).toHaveURL(/\/results\//, { timeout: 20_000 });
  await expect(page.getByTestId('answers-not-released')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('skill-listening')).toBeVisible();
  await expect(page.getByTestId('disclaimer')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/results-exam-desktop.png`, fullPage: true });
});
