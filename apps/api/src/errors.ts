import type { ApiErrorCode } from '@vq/shared';

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_PROVISIONED: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  REQUEST_IN_PROGRESS: 409,
  SESSION_NOT_ACTIVE: 409,
  LOCKED: 409,
  TIME_UP: 409,
  PLAY_LIMIT: 429,
  NOT_READY_TO_SUBMIT: 409,
  DRAFT_CONFLICT: 409,
  HELP_DISABLED: 403,
  EXPLANATION_LIMIT: 429,
  COACH_LIMIT: 429,
  GRADING_LIMIT: 429,
  QUOTA_EXCEEDED: 429,
  BUDGET_EXCEEDED: 429,
  ATTEMPT_LIMIT: 429,
  CONSENT_REQUIRED: 403,
  AUDIO_UNCLEAR: 422,
  AUDIO_TOO_LONG: 413,
  CHAMPIONSHIP_CLOSED: 409,
  CONTENT_BLOCKED: 422,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const notFound = (what: string) => new ApiError('NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'Not allowed') => new ApiError('FORBIDDEN', msg);
