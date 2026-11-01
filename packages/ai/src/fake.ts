import type { Item } from '@vq/shared';
import type { AiProvider, AnalyticsInput, CoachInput, ExplainInput, ItemRequest, SpeakingGradeInput, WritingGradeInput } from './types.js';

/** Offline provider for development and automated tests ONLY (refused in production). */
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  failNext = 0;
  delayMs = 0;
  private async gate() {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('Simulated AI outage');
    }
  }
  async explain(i: ExplainInput) {
    await this.gate();
    return {
      output: { explanation: `${i.question.explanation} (offline explanation)`, whyStudentAnswer: i.isCorrect ? '' : 'Your answer is not supported by the text.', quote: i.question.evidence, vocabulary: [], tip: 'Read the question first, then listen/scan for key words.' },
      usage: { inputTokens: 1500, outputTokens: 150 },
    };
  }
  async gradeWriting(i: WritingGradeInput) {
    await this.gate();
    const t = i.item.task;
    const ratio = Math.min(1, i.wordCount / t.minWords);
    const first = i.text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
    const s = (max: number, f: number) => ({ score: Math.round(max * f * ratio), comment: 'Offline estimate (no AI).' });
    return {
      output: {
        taskFulfillment: s(25, i.wordCount >= t.minWords && i.wordCount <= t.maxWords ? 0.8 : 0.5), organization: s(25, 0.7), vocabulary: s(25, 0.7), grammar: s(25, 0.65),
        examples: first ? [{ quote: first.slice(0, 200), comment: 'Clear opening.' }] : [],
        corrections: [{ original: 'phrase that is not in the text', corrected: 'x', explanation: 'test: removed by the quote check' }],
        strengths: ['Clear structure.'], improvements: ['Use more linking words.'], nextPractice: ['Try W02.'],
      },
      usage: { inputTokens: 3000, outputTokens: 600 },
    };
  }
  async gradeSpeaking(i: SpeakingGradeInput) {
    await this.gate();
    const words = i.parts.reduce((n, p) => n + p.transcript.split(/\s+/).filter(Boolean).length, 0);
    const f = Math.min(1, words / 80);
    return {
      output: {
        taskFulfillment: { score: Math.round(25 * 0.8 * f), comment: 'Offline estimate (no AI).' }, vocabulary: { score: Math.round(20 * 0.7 * f), comment: 'Offline estimate.' }, grammar: { score: Math.round(20 * 0.7 * f), comment: 'Offline estimate.' },
        examples: [], corrections: [], strengths: ['You answered every part.'], improvements: ['Give reasons and examples.'], nextPractice: ['Try S02.'],
      },
      usage: { inputTokens: 2500, outputTokens: 500 },
    };
  }
  async coach(i: CoachInput) {
    await this.gate();
    const wantsAnswer = /\b(answer|correct option|which option|write (my|the) (essay|email)|do it for me)\b/i.test(i.question);
    return {
      output: wantsAnswer
        ? { answer: "I can't give you the answer, but here is a strategy: underline key words in the question first.", kind: 'refused' as const, suggestedQuestIds: [] }
        : { answer: 'Practise a little every day. Start with a listening quest, then review new words.', kind: 'plan' as const, suggestedQuestIds: ['L01'] },
      usage: { inputTokens: 1200, outputTokens: 120 },
    };
  }
  async analytics(_i: AnalyticsInput) {
    await this.gate();
    return { output: { summary: 'Offline summary based on the statistics.', strengths: [], focusAreas: [], plan: [] }, usage: { inputTokens: 2000, outputTokens: 200 } };
  }
  async generateItem(req: ItemRequest, example: Item) {
    await this.gate();
    const clone = structuredClone(example) as Item;
    return { output: { ...clone, id: req.id, level: req.level, topic: req.topic, objective: req.objective, difficulty: req.difficulty, title: `Draft: ${req.topic}` }, usage: { inputTokens: 5000, outputTokens: 3000 } };
  }
  async ping() {
    return 'ready (offline provider)';
  }
}
