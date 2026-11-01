import { describe, expect, it } from 'vitest';
import { clockOffset, crossedMilestone, formatClock, secondsLeftAt, timerTone } from './clock';

describe('exam clock', () => {
  const server = '2026-11-01T10:00:00.000Z';
  const serverMs = Date.parse(server);

  it('measures the offset between server and client clocks', () => {
    expect(clockOffset(server, serverMs)).toBe(0);
    expect(clockOffset(server, serverMs - 90_000)).toBe(90_000); // client 90 s behind
    expect(clockOffset(server, serverMs + 30_000)).toBe(-30_000); // client 30 s ahead
    expect(clockOffset('not a date', 123)).toBe(0);
  });

  it('counts down against the corrected (server) time', () => {
    const deadline = new Date(serverMs + 20 * 60_000).toISOString();
    // Client clock is 5 minutes fast: without correction it would show 15 minutes.
    const clientNow = serverMs + 5 * 60_000;
    const off = clockOffset(server, clientNow);
    expect(secondsLeftAt(deadline, off, clientNow)).toBe(20 * 60);
    expect(secondsLeftAt(deadline, off, clientNow + 61_500)).toBe(20 * 60 - 61);
  });

  it('never goes below zero and handles missing deadlines', () => {
    const deadline = new Date(serverMs + 1000).toISOString();
    expect(secondsLeftAt(deadline, 0, serverMs + 10_000)).toBe(0);
    expect(secondsLeftAt(null, 0, serverMs)).toBeNull();
    expect(secondsLeftAt('garbage', 0, serverMs)).toBeNull();
  });

  it('rounds partial seconds up so the timer reaches 0 only at the deadline', () => {
    const deadline = new Date(serverMs + 1500).toISOString();
    expect(secondsLeftAt(deadline, 0, serverMs)).toBe(2);
    expect(secondsLeftAt(deadline, 0, serverMs + 1499)).toBe(1);
    expect(secondsLeftAt(deadline, 0, serverMs + 1500)).toBe(0);
  });

  it('tones and milestones', () => {
    expect(timerTone(null)).toBe('normal');
    expect(timerTone(301)).toBe('normal');
    expect(timerTone(300)).toBe('warn');
    expect(timerTone(60)).toBe('danger');
    expect(crossedMilestone(301, 299)).toBe(300);
    expect(crossedMilestone(61, 60)).toBe(60);
    expect(crossedMilestone(2, 0)).toBe(0);
    expect(crossedMilestone(500, 400)).toBeNull();
    expect(crossedMilestone(null, 10)).toBeNull();
    expect(crossedMilestone(10, 20)).toBeNull();
  });

  it('formats', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-4)).toBe('0:00');
  });
});
