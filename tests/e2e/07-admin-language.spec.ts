import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('school admin opens the content bank and a listening item with audio review', async ({ page }) => {
  await login(page, 'admin@demo.edu.vn');
  await page.goto('/admin/content');
  await expect(page.getByTestId('content-bank')).toBeVisible();
  await expect(page.getByTestId('content-rows').locator('tr')).not.toHaveCount(0);
  await page.getByRole('link', { name: 'L01_flight' }).click();
  await expect(page.getByTestId('item-preview')).toBeVisible();
  await expect(page.getByTestId('audio-review')).toBeVisible();
  await page.goto('/content?kind=exam');
  await expect(page.getByTestId('content-rows')).toContainText('mx1');
});

test('character creation and language switch vi ↔ en', async ({ page }) => {
  await login(page, 'student3@demo.edu.vn');
  // Character creation: pick an avatar; locked outfits cannot be chosen at level 1.
  await page.getByTestId('open-avatar').click();
  await page.getByRole('radio', { name: 'Học giả' }).click();
  await expect(page.getByRole('radio', { name: /Phi hành gia/ })).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('avatar-save').click();
  await expect(page.getByText('Đã lưu nhân vật')).toBeVisible();
  await expect(page.getByTestId('create-character')).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Chọn khu vực' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.getByRole('group', { name: 'Ngôn ngữ' }).getByRole('button', { name: 'en' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your zone' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose your zone' })).toBeVisible();
  await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'vi' }).click();
  await expect(page.getByRole('heading', { name: 'Chọn khu vực' })).toBeVisible();
});
