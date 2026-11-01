import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Demo-12345';
export const SHOTS = join(__dirname, '../../docs/screenshots');

export interface RawQuestion {
  id: string;
  type: 'mcq' | 'tfng' | 'short';
  correctIndex?: number;
  answer?: string;
  acceptable?: string[];
}
export interface RawItem {
  id: string;
  skill: string;
  questions?: RawQuestion[];
  parts?: { id: string; prepSeconds: number }[];
  task?: { minWords: number };
}

/** Built-in content (the test knows the answers; the browser never receives them before answering). */
export function contentItems(file: string): RawItem[] {
  const p = file.startsWith('MX') ? join(__dirname, `../../content/exams/${file}.json`) : join(__dirname, `../../content/quests/${file}.json`);
  return (JSON.parse(readFileSync(p, 'utf8')) as { items: RawItem[] }).items;
}

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/(world|teacher|platform)/, { timeout: 30_000 });
}

/** Answers one objective question with the correct value. Quest mode presses "Check answer". */
export async function answer(page: Page, itemId: string, q: RawQuestion, mode: 'quest' | 'exam' = 'quest') {
  const box = page.getByTestId(`question-${itemId}-${q.id}`);
  await box.scrollIntoViewIfNeeded();
  if (q.type === 'mcq') await box.getByTestId(`option-${q.correctIndex}`).click();
  else if (q.type === 'tfng') await box.getByTestId(`tfng-${q.answer}`).click();
  else {
    await box.getByTestId('short-input').fill(q.acceptable![0]!);
    if (mode === 'exam') await box.getByTestId('short-input').blur();
  }
  if (mode === 'quest') {
    await box.getByTestId('check-answer').click();
    await expect(box).toHaveAttribute('data-answered', 'true');
    await expect(box.getByTestId('answer-result')).toBeVisible();
  } else {
    await expect(box).toHaveAttribute('data-answered', 'true');
  }
}

export function words(n: number): string {
  const base = 'I think that students should plan their time carefully because good habits help them learn more every week'.split(' ');
  return Array.from({ length: n }, (_, i) => base[i % base.length]).join(' ') + '.';
}
