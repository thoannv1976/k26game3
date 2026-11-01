import type { TFunction } from 'i18next';
import { ApiErrorCodes } from '@vq/shared';
import { ApiError } from '../api/client';

const KNOWN = new Set<string>([...ApiErrorCodes, 'NETWORK']);
/** Codes whose server message is specific and useful – appended to the localized text. */
const WITH_DETAIL = new Set(['VALIDATION', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN', 'INTERVIEW_LIMIT', 'LOCKED']);

/** Localized, user-friendly message for an API (or any) error. */
export function errorMessage(t: TFunction, e: unknown): string {
  if (e instanceof ApiError) {
    if (KNOWN.has(e.code)) {
      const base = t(`errors.${e.code}` as 'errors.INTERNAL');
      if (WITH_DETAIL.has(e.code) && e.message && e.message !== 'Invalid request') return `${base} (${e.message})`;
      return base;
    }
    return e.message || t('errors.INTERNAL');
  }
  if (e instanceof Error && e.message) return e.message;
  return t('errors.INTERNAL');
}

/** Validation issue list from `details` ([{path, message}]). */
export function validationIssues(e: unknown): { path: string; message: string }[] {
  if (!(e instanceof ApiError) || !Array.isArray(e.details)) return [];
  return (e.details as unknown[])
    .map((d) => {
      const x = d as { path?: unknown; message?: unknown };
      const path = Array.isArray(x.path) ? x.path.join('.') : String(x.path ?? '');
      return { path, message: String(x.message ?? '') };
    })
    .filter((d) => d.message);
}

/** Submission blockers from a NOT_READY_TO_SUBMIT error. */
export function submitBlockers(e: unknown): string[] {
  if (!(e instanceof ApiError) || e.code !== 'NOT_READY_TO_SUBMIT') return [];
  const b = (e.details as { blockers?: unknown } | undefined)?.blockers;
  return Array.isArray(b) ? b.map(String) : [];
}
