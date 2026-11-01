import { describe, expect, it } from 'vitest';
import { guardCoach, verifyExplanation, verifySpeaking, verifyWriting } from '../src/guards.js';
import { coachSystem, explainUser, sanitize, writingSystem } from '../src/prompts.js';
import { thinking } from '../src/vertex.js';
import type { SpeakingGrade, WritingGrade } from '../src/types.js';

const fb = { examples: [], corrections: [], strengths: [], improvements: [], nextPractice: [] };

describe('writing/speaking verification', () => {
  it('drops quotes that are not in the text and clamps scores', () => {
    const text = 'Dear Lan, I am very happy for hear from you. My university is big.';
    const g: WritingGrade = {
      taskFulfillment: { score: 30, comment: '' }, organization: { score: 20, comment: '' }, vocabulary: { score: 12.3, comment: '' }, grammar: { score: -2, comment: '' },
      ...fb,
      examples: [{ quote: 'My university is big.', comment: 'ok' }, { quote: 'invented sentence', comment: 'x' }],
      corrections: [{ original: 'happy for hear', corrected: 'happy to hear', explanation: 'giới từ' }, { original: 'they was', corrected: 'they were', explanation: 'x' }],
    };
    const v = verifyWriting(text, g);
    expect(v.removed).toBe(2);
    expect(v.grade.corrections).toHaveLength(1);
    expect([v.grade.taskFulfillment.score, v.grade.vocabulary.score, v.grade.grammar.score]).toEqual([25, 12.5, 0]);
    const s: SpeakingGrade = { taskFulfillment: { score: 40, comment: '' }, vocabulary: { score: 18, comment: '' }, grammar: { score: 21, comment: '' }, ...fb, examples: [{ quote: 'I think', comment: '' }] };
    const vs = verifySpeaking('I think online classes help', s);
    expect([vs.grade.taskFulfillment.score, vs.grade.grammar.score, vs.removed]).toEqual([25, 20, 0]);
  });
  it('explanation quote falls back to the approved evidence', () => {
    const e = verifyExplanation('Boarding will start at ten forty-five.', 'Boarding will start at ten forty-five', { explanation: 'x', whyStudentAnswer: '', quote: 'made up', vocabulary: [], tip: '' });
    expect(e.quote).toBe('Boarding will start at ten forty-five');
  });
});

describe('coach guard', () => {
  it('blocks replies containing protected answers', () => {
    expect(guardCoach('The gate is B17, go there.', ['B17'])).toBeNull(); // too short to protect (<4 chars normalized)
    expect(guardCoach('The answer is a technical check on the plane.', ['A technical check on the plane'])).toBe('answer_leak');
    expect(guardCoach('Underline key words first.', ['A technical check on the plane'])).toBeNull();
  });
});

describe('prompts', () => {
  it('treat student text as data and forbid answering open questions', () => {
    expect(sanitize('x<<<y>>>z')).toBe('x y z');
    expect(coachSystem({ level: 'B1', profile: [], recentMistakes: [], history: [], question: '', model: '', maxOutputTokens: 1 })).toMatch(/must NOT give answers/);
    expect(thinking('gemini-3-flash-preview', 0)).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
  });
  it('writing prompt requires verbatim quotes', () => {
    const item = { id: 'W01_x', skill: 'writing', level: 'B1', task: { type: 'email', input: '', prompt: 'Write an email', minWords: 100, maxWords: 150, timeMinutes: 20 }, keyPoints: ['a', 'b'] } as never;
    expect(writingSystem({ item, text: '', wordCount: 0, model: '', maxOutputTokens: 1 })).toMatch(/copied exactly/);
    void explainUser;
  });
});
