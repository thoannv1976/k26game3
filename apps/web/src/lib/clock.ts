/**
 * Exam timer helpers. The server owns the clock: every attempt view carries `serverNow` and per-section `deadline`s.
 * The browser measures the offset between the server clock and its own clock when a view arrives and counts down
 * against the corrected time, so a wrong device clock never gives extra (or less) time.
 */

/** Milliseconds to add to the client clock to get the server clock (positive = server ahead). */
export function clockOffset(serverNowIso: string, clientNowMs: number): number {
  const server = Date.parse(serverNowIso);
  if (Number.isNaN(server)) return 0;
  return server - clientNowMs;
}

/** Whole seconds left until `deadlineIso` on the server clock (never negative; null without a deadline). */
export function secondsLeftAt(deadlineIso: string | null | undefined, offsetMs: number, clientNowMs: number): number | null {
  if (!deadlineIso) return null;
  const deadline = Date.parse(deadlineIso);
  if (Number.isNaN(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - (clientNowMs + offsetMs)) / 1000));
}

export type TimerTone = 'normal' | 'warn' | 'danger';

/** Visual urgency of the remaining time: warn under 5 minutes, danger under 1 minute. */
export function timerTone(seconds: number | null): TimerTone {
  if (seconds === null) return 'normal';
  if (seconds <= 60) return 'danger';
  if (seconds <= 300) return 'warn';
  return 'normal';
}

/** Spoken/announced milestones (screen readers): crossing 5 min, 1 min and time up. */
export function crossedMilestone(prev: number | null, next: number | null): 300 | 60 | 0 | null {
  if (prev === null || next === null || next >= prev) return null;
  for (const m of [300, 60, 0] as const) if (prev > m && next <= m) return m;
  return null;
}

/** mm:ss (or h:mm:ss). */
export function formatClock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
