import { GoogleGenAI, HarmBlockThreshold, HarmCategory, Type, type Schema } from '@google/genai';
import type { Item } from '@vq/shared';
import * as P from './prompts.js';
import {
  AnalyticsOutputSchema, COACH_KINDS, CoachOutputSchema, ExplainOutputSchema, SpeakingGradeSchema, WritingGradeSchema,
  type AiProvider, type AnalyticsInput, type CoachInput, type ExplainInput, type ItemRequest, type SpeakingGradeInput, type Usage, type WritingGradeInput,
} from './types.js';

const S: Schema = { type: Type.STRING };
const SS: Schema = { type: Type.ARRAY, items: S };
const SCORED: Schema = { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, comment: S }, required: ['score', 'comment'] };
const FEEDBACK = {
  examples: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { quote: S, comment: S }, required: ['quote', 'comment'] } },
  corrections: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { original: S, corrected: S, explanation: S }, required: ['original', 'corrected', 'explanation'] } },
  strengths: SS,
  improvements: SS,
  nextPractice: SS,
} satisfies Record<string, Schema>;
const FEEDBACK_KEYS = ['examples', 'corrections', 'strengths', 'improvements', 'nextPractice'];

const SCHEMAS = {
  explain: { type: Type.OBJECT, properties: { explanation: S, whyStudentAnswer: S, quote: S, vocabulary: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { term: S, meaning: S }, required: ['term', 'meaning'] } }, tip: S }, required: ['explanation', 'whyStudentAnswer', 'quote', 'vocabulary', 'tip'] },
  writing: { type: Type.OBJECT, properties: { taskFulfillment: SCORED, organization: SCORED, vocabulary: SCORED, grammar: SCORED, ...FEEDBACK }, required: ['taskFulfillment', 'organization', 'vocabulary', 'grammar', ...FEEDBACK_KEYS] },
  speaking: { type: Type.OBJECT, properties: { taskFulfillment: SCORED, vocabulary: SCORED, grammar: SCORED, ...FEEDBACK }, required: ['taskFulfillment', 'vocabulary', 'grammar', ...FEEDBACK_KEYS] },
  coach: { type: Type.OBJECT, properties: { kind: { type: Type.STRING, enum: [...COACH_KINDS] }, answer: S, suggestedQuestIds: SS }, required: ['kind', 'answer', 'suggestedQuestIds'] },
  analytics: { type: Type.OBJECT, properties: { summary: S, strengths: SS, focusAreas: SS, plan: SS }, required: ['summary', 'strengths', 'focusAreas', 'plan'] },
} satisfies Record<string, Schema>;

const SAFETY = [HarmCategory.HARM_CATEGORY_HARASSMENT, HarmCategory.HARM_CATEGORY_HATE_SPEECH, HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }));

/** Gemini 2.5 and 3.x Flash models think by default; thinking tokens count against maxOutputTokens, so cap it. */
export function thinking(model: string, budget: number) {
  return model.startsWith('gemini-2.5') || /^gemini-3[\d.]*-flash/.test(model) ? { thinkingConfig: { thinkingBudget: budget } } : {};
}

function trim(raw: Record<string, unknown>, limits: Record<string, number>) {
  for (const [k, n] of Object.entries(limits)) if (Array.isArray(raw[k])) raw[k] = (raw[k] as unknown[]).slice(0, n);
  return raw;
}

export class VertexAiProvider implements AiProvider {
  readonly name = 'vertex';
  private readonly client: GoogleGenAI;
  constructor(project: string, location: string) {
    this.client = new GoogleGenAI({ vertexai: true, project, location });
  }

  private async json(model: string, system: string, user: string, schema: Schema | undefined, temperature: number, maxOutputTokens: number, think: number) {
    const res = await this.client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: user }] }],
      config: { systemInstruction: system, temperature, maxOutputTokens, responseMimeType: 'application/json', ...(schema ? { responseSchema: schema } : {}), safetySettings: SAFETY, ...thinking(model, think) },
    });
    if (!res.text) throw new Error('Empty AI response (blocked or truncated)');
    const m = res.usageMetadata;
    const usage: Usage = { inputTokens: m?.promptTokenCount ?? 0, outputTokens: (m?.candidatesTokenCount ?? 0) + (m?.thoughtsTokenCount ?? 0) };
    return { raw: JSON.parse(res.text) as Record<string, unknown>, usage };
  }

  async explain(i: ExplainInput) {
    const r = await this.json(i.model, P.explainSystem(), P.explainUser(i), SCHEMAS.explain, 0.3, i.maxOutputTokens, 0);
    return { output: ExplainOutputSchema.parse(trim(r.raw, { vocabulary: 6 })), usage: r.usage };
  }
  async gradeWriting(i: WritingGradeInput) {
    const r = await this.json(i.model, P.writingSystem(i), P.writingUser(i), SCHEMAS.writing, 0.2, Math.max(4096, i.maxOutputTokens), 1024);
    return { output: WritingGradeSchema.parse(trim(r.raw, { examples: 8, corrections: 10, strengths: 6, improvements: 6, nextPractice: 5 })), usage: r.usage };
  }
  async gradeSpeaking(i: SpeakingGradeInput) {
    const r = await this.json(i.model, P.speakingSystem(i), P.speakingUser(i), SCHEMAS.speaking, 0.2, Math.max(4096, i.maxOutputTokens), 1024);
    return { output: SpeakingGradeSchema.parse(trim(r.raw, { examples: 8, corrections: 10, strengths: 6, improvements: 6, nextPractice: 5 })), usage: r.usage };
  }
  async coach(i: CoachInput) {
    const r = await this.json(i.model, P.coachSystem(i), P.coachUser(i), SCHEMAS.coach, 0.5, i.maxOutputTokens, 0);
    return { output: CoachOutputSchema.parse(trim(r.raw, { suggestedQuestIds: 3 })), usage: r.usage };
  }
  async analytics(i: AnalyticsInput) {
    const r = await this.json(i.model, P.analyticsSystem(i), P.analyticsUser(i), SCHEMAS.analytics, 0.3, i.maxOutputTokens, 0);
    return { output: AnalyticsOutputSchema.parse(trim(r.raw, { strengths: 5, focusAreas: 5, plan: 7 })), usage: r.usage };
  }
  async generateItem(req: ItemRequest, example: Item, model: string, feedback?: string[]) {
    const r = await this.json(model, P.generatorSystem(), P.generatorUser(req, example, feedback), undefined, 0.8, 16384, 1024);
    return { output: r.raw, usage: r.usage };
  }
  async ping(model: string) {
    const res = await this.client.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }], config: { maxOutputTokens: 256, ...thinking(model, 0) } });
    return (res.text ?? '').trim();
  }
}
