import { describe, expect, it } from 'vitest';
import { PRONUNCIATION_PENDING, type ItemResult } from '@vq/game-engine';
import { applyReview } from '../../src/services/grading.js';
import { externalEntries } from '../../src/services/profile.js';
import type { TeacherReview } from '../../src/types.js';

const speaking: ItemResult = {
  itemId: 'S01_social_talk',
  skill: 'speaking',
  criteria: {
    taskFulfillment: { score: 20, max: 25, source: 'ai', status: 'assessed', comment: '' },
    fluency: { score: 16, max: 20, source: 'speech_metrics', status: 'assessed', comment: '' },
    vocabulary: { score: 14, max: 20, source: 'ai', status: 'assessed', comment: '' },
    grammar: { score: 14, max: 20, source: 'ai', status: 'assessed', comment: '' },
    pronunciation: PRONUNCIATION_PENDING,
  },
  score: 75,
  status: 'pending_review',
};

const review = (scores: TeacherReview['scores']): TeacherReview => ({ reviewerUid: 't', reviewerName: 'T', scores, comment: '', status: 'adjusted', reviewedAt: '2026-01-01T00:00:00Z' });

describe('teacher review', () => {
  it('fills pronunciation and turns the item into assessed', () => {
    const [r] = applyReview([speaking], review({ S01_social_talk: { pronunciation: 12 } }));
    expect(r).toMatchObject({ status: 'assessed', score: 76 });
    expect((r as Extract<ItemResult, { skill: 'speaking' }>).criteria.pronunciation.source).toBe('teacher');
  });
  it('clamps scores to the criterion maximum and leaves other items alone', () => {
    const lr: ItemResult = { itemId: 'L01_gate', skill: 'listening', earned: 2, total: 3, score: 67 };
    const out = applyReview([speaking, lr], review({ S01_social_talk: { grammar: 99 } }));
    expect((out[0] as Extract<ItemResult, { skill: 'speaking' }>).criteria.grammar.score).toBe(20);
    expect(out[1]).toBe(lr);
  });
});

describe('external evidence (Game 1 and Game 2)', () => {
  it('maps the four skills and ignores critical thinking', () => {
    const e = externalEntries([
      {
        source: 'english-detective',
        ok: true,
        error: null,
        items: [
          {
            schema: 'k26-evidence-1.0', evidenceId: 'ed:t:1', source: 'english-detective', tenantId: 't', learner: { uid: 'u', email: null, studentCode: null, name: null }, courseId: null,
            activity: { type: 'investigation_case', id: 'CASE01', version: 1, title: 'Case', level: 'B1' }, skills: ['reading', 'writing', 'critical_thinking'],
            result: { completed: true, aiPercent: 70, finalPercent: 72.4, scoreType: 'teacher_validated', criteria: {} }, feedback: null,
            timestamps: { startedAt: null, completedAt: '2026-01-01T00:00:00Z', reviewedAt: null }, versions: {}, disclaimer: '',
          },
        ],
      },
    ]);
    expect(e.map((x) => x.skill)).toEqual(['reading', 'writing']);
    expect(e[0]).toMatchObject({ score: 72, source: 'external', validated: true });
  });
});
