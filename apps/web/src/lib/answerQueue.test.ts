import { describe, expect, it } from 'vitest';
import { dequeue, enqueue, forAttempt, parseQueue, pendingKey, type PendingAnswer } from './answerQueue';

const a = (questionId: string, value: number | string, attemptId = 'A'): PendingAnswer => ({ attemptId, itemId: 'L01_gate', questionId, value, at: '2026-11-01T00:00:00Z' });

describe('offline answer queue', () => {
  it('keeps only the latest value per question', () => {
    let q = enqueue([], a('q1', 0));
    q = enqueue(q, a('q2', 'B17'));
    q = enqueue(q, a('q1', 2));
    expect(q).toHaveLength(2);
    expect(q.find((x) => x.questionId === 'q1')!.value).toBe(2);
  });
  it('removes sent answers and filters by attempt', () => {
    const q = [a('q1', 0), a('q1', 1, 'B')];
    expect(dequeue(q, pendingKey(a('q1', 0)))).toEqual([a('q1', 1, 'B')]);
    expect(forAttempt(q, 'B')).toHaveLength(1);
  });
  it('parses stored data defensively', () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue('{bad json')).toEqual([]);
    expect(parseQueue('{"x":1}')).toEqual([]);
    expect(parseQueue(JSON.stringify([a('q1', 'x'), { attemptId: 1 }, null]))).toEqual([a('q1', 'x')]);
  });
});
