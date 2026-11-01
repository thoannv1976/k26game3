import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ItemSchema, QuestSchema, type Item } from '@vq/shared';
import { AttemptError, applyClock, closeSection, newAttempt, questBlockers, recordAnswer, recordPlay, recordTake, recordWriting, secondsLeft, sectionOpen, startSection } from '../src/attempt.js';
import {
  PRONUNCIATION_PENDING, criteriaScore, earnedBadges, fluencyFromMetrics, learningProfile, nextStreak, overallScore, playerLevel, questXp, skillResult, convert, type CriterionScore,
} from '../src/scoring.js';
import { itemView } from '../src/view.js';
import { questStates } from '../src/world.js';

const bundle = JSON.parse(readFileSync(new URL('../../../content/quests/L01.json', import.meta.url), 'utf8'));
const items: Item[] = bundle.items.map((i: unknown) => ItemSchema.parse(i));
const gate = items.find((i) => i.id === 'L01_gate')!;
const t0 = new Date('2027-03-01T08:00:00Z');
const at = (min: number) => new Date(t0.getTime() + min * 60000);

const writing = ItemSchema.parse({
  id: 'W99_x', skill: 'writing', level: 'B1', topic: 't t t', objective: 'write an email', difficulty: 1, title: 'Email', instructions: { en: 'Write', vi: 'Viết' },
  task: { type: 'email', input: '', prompt: 'Write an email to your friend about your new university.', minWords: 100, maxWords: 150, timeMinutes: 20 },
  keyPoints: ['greeting', 'answer questions'], weight: 1, sampleAnswer: 'x '.repeat(60),
});
const speaking = ItemSchema.parse({
  id: 'S99_x', skill: 'speaking', level: 'B1', topic: 't t t', objective: 'talk about yourself', difficulty: 1, title: 'Talk', instructions: { en: 'Talk', vi: 'Nói' },
  parts: [{ id: 'p1', type: 'social', prompt: 'Tell me about yourself please.', options: [], prepSeconds: 0, speakSeconds: 60, followUps: [], keyPoints: ['name and studies'] }],
  sampleAnswer: 'My name is An and I study economics at university.',
});

describe('quest attempts', () => {
  it('scores answers, allows one attempt per question and limits plays', () => {
    let s = newAttempt();
    const r = recordAnswer(s, gate, 'q1', 'gate b 17', 'quest', t0);
    expect(r.record.correct).toBe(true);
    s = r.state;
    expect(() => recordAnswer(s, gate, 'q1', 'B17', 'quest', t0)).toThrow(/Already answered/);
    expect(() => recordAnswer(s, gate, 'q2', 7, 'quest', t0)).toThrow(/Invalid/);
    for (let i = 0; i < 3; i++) s = recordPlay(s, gate, 'quest', t0).state;
    expect(() => recordPlay(s, gate, 'quest', t0)).toThrow(AttemptError);
  });
  it('reveals the answer only after answering in quest mode; transcript only after all answered', () => {
    let s = newAttempt();
    let v = itemView(gate, s, { mode: 'quest' }) as any;
    expect(v.questions[0].reveal).toBeNull();
    expect(v.transcript).toBeNull();
    s = recordAnswer(s, gate, 'q1', 'B17', 'quest', t0).state;
    v = itemView(gate, s, { mode: 'quest' });
    expect(v.questions[0].reveal.correct).toBe('B17');
    expect(v.questions[1].reveal).toBeNull();
    s = recordAnswer(s, gate, 'q2', 1, 'quest', t0).state;
    s = recordAnswer(s, gate, 'q3', 'true', 'quest', t0).state;
    expect((itemView(gate, s, { mode: 'quest' }) as any).transcript.length).toBe(1);
  });
  it('quest blockers list unanswered questions, short writing and missing recordings', () => {
    const s = newAttempt();
    expect(questBlockers([gate, writing, speaking], s)).toHaveLength(3);
    let s2 = recordWriting(s, writing, 'word '.repeat(60), 1, t0);
    s2 = recordTake(s2, speaking, 'p1', { status: 'transcribed', audioPath: null, transcript: 'hello', confidence: 0.9, durationSeconds: 30, metrics: { words: 40, speechSeconds: 25, longPauses: 0 }, at: t0.toISOString() }, t0);
    expect(questBlockers([writing, speaking], s2)).toEqual([]);
  });
});

describe('exam clock (server time)', () => {
  const sections = [
    { skill: 'listening' as const, timeMinutes: 20 },
    { skill: 'reading' as const, timeMinutes: 25 },
    { skill: 'writing' as const, timeMinutes: 30 },
    { skill: 'speaking' as const, timeMinutes: 10 },
  ];
  it('only the current, started section accepts answers', () => {
    let s = newAttempt(sections);
    expect(sectionOpen(s, 'listening', t0)).toBe(false);
    s = startSection(s, t0);
    expect(secondsLeft(s, at(5))).toBe(15 * 60);
    expect(sectionOpen(s, 'listening', at(19))).toBe(true);
    expect(sectionOpen(s, 'reading', at(1))).toBe(false);
    expect(() => recordAnswer(s, gate, 'q1', 'B17', 'exam', at(21))).toThrow(/closed/);
    // Answers may change until the section closes in exam mode; no correctness is revealed in the view.
    s = recordAnswer(s, gate, 'q1', 'C4', 'exam', at(1)).state;
    s = recordAnswer(s, gate, 'q1', 'B17', 'exam', at(2)).state;
    const v = itemView(gate, s, { mode: 'exam' }) as any;
    expect(v.questions[0].answer).toEqual({ value: 'B17' });
    expect(v.questions[0].reveal).toBeNull();
  });
  it('applies timeouts and finishes the exam', () => {
    let s = startSection(newAttempt(sections), t0);
    let r = applyClock(s, at(21));
    expect(r.changed).toBe(true);
    expect(r.state.currentSection).toBe(1);
    s = startSection(r.state, at(22));
    s = closeSection(s, at(30)); // student moves on early
    s = startSection(s, at(31));
    s = startSection(closeSection(s, at(40)), at(41));
    r = applyClock(s, at(60));
    expect(r.finished).toBe(true);
  });
});

describe('scoring', () => {
  const c = (score: number | null, max: number, status: CriterionScore['status'] = 'assessed'): CriterionScore => ({ score, max, source: 'ai', status, comment: '' });
  it('criteria score over assessed parts with status', () => {
    expect(criteriaScore({ a: c(20, 25), b: c(15, 25), cc: c(20, 25), d: c(25, 25) })).toEqual({ score: 80, status: 'assessed' });
    expect(criteriaScore({ a: c(20, 25), f: c(null, 20, 'not_assessed'), p: PRONUNCIATION_PENDING })).toEqual({ score: 80, status: 'pending_review' });
    expect(criteriaScore({ p: PRONUNCIATION_PENDING })).toEqual({ score: null, status: 'pending_review' });
  });
  it('fluency needs enough speech', () => {
    expect(fluencyFromMetrics({ words: 10, speechSeconds: 8, longPauses: 0 }).status).toBe('not_assessed');
    expect(fluencyFromMetrics({ words: 110, speechSeconds: 60, longPauses: 0 }).score).toBe(20);
  });
  it('skill results and overall only with four valid skills', () => {
    const l = skillResult('listening', [{ itemId: 'a', skill: 'listening', earned: 8, total: 10, score: 80 }, { itemId: 'b', skill: 'listening', earned: 2, total: 5, score: 40 }]);
    expect(l.score).toBe(67);
    const w = skillResult('writing', [
      { itemId: 'w1', skill: 'writing', weight: 1, criteria: {} as never, score: 60, status: 'assessed' },
      { itemId: 'w2', skill: 'writing', weight: 2, criteria: {} as never, score: 90, status: 'assessed' },
    ]);
    expect(w.score).toBe(80);
    const sp = skillResult('speaking', [{ itemId: 's', skill: 'speaking', criteria: {} as never, score: 70, status: 'pending_review' }]);
    expect(sp.status).toBe('pending_review');
    expect(overallScore([l, w, sp, { skill: 'reading', score: null, status: 'not_assessed', detail: '' }])).toBeNull();
    expect(overallScore([l, w, sp, { skill: 'reading', score: 75, status: 'assessed', detail: '' }])).toBe(73);
    expect(convert(73, [{ min: 0, max: 49, label: 'below B1' }, { min: 50, max: 79, label: 'B1 (reference)' }])).toBe('B1 (reference)');
    expect(convert(73, [])).toBeNull();
  });
});

describe('game progression', () => {
  it('streak, XP, level', () => {
    let st = nextStreak({ days: 0, lastDay: null }, t0);
    st = nextStreak(st, new Date(t0.getTime() + 86400000));
    expect(st.days).toBe(2);
    expect(nextStreak(st, new Date(t0.getTime() + 3 * 86400000)).days).toBe(1);
    expect(questXp(100, true, true, 3)).toBe(170);
    expect(questXp(100, false, false, 1)).toBe(30);
    expect(playerLevel(0).level).toBe(1);
    expect(playerLevel(450).level).toBe(3);
  });
  it('badges', () => {
    const qs = [{ id: 'L01', skill: 'listening' as const }, { id: 'R01', skill: 'reading' as const }, { id: 'W01', skill: 'writing' as const }, { id: 'S01', skill: 'speaking' as const }];
    const b = earnedBadges(qs, ['L01', 'R01', 'W01', 'S01'], { R01: 85 }, 5, 1, []);
    expect(b).toEqual(expect.arrayContaining(['listening_explorer', 'reading_master', 'writing_challenger', 'speaking_champion', 'four_skill_explorer', 'daily_learning_hero', 'mock_exam_finisher']));
    expect(earnedBadges(qs, ['L01'], {}, 1, 0, ['listening_explorer'])).toEqual([]);
  });
  it('four-skill profile needs enough evidence per skill', () => {
    const e = (skill: 'listening' | 'reading' | 'writing' | 'speaking', score: number, source: 'quest' | 'exam' = 'quest', at = '2027-03-01') => ({ skill, score, source, validated: false, at, ref: 'x' });
    const p = learningProfile([e('listening', 80), e('listening', 60, 'quest', '2027-03-02'), e('reading', 70, 'exam'), e('writing', 50, 'exam'), e('speaking', 40)]);
    expect(p.skills.find((s) => s.skill === 'listening')!.sufficient).toBe(true);
    expect(p.skills.find((s) => s.skill === 'speaking')!.sufficient).toBe(false);
    expect(p.overall).toBeNull();
    expect(p.weakest).toBe('speaking');
  });
  it('quest unlocking follows requirements or teacher assignment', () => {
    const quest = (id: string, requires: string[]) => QuestSchema.parse({ ...bundle.quest, id, skill: 'listening', requires });
    const qs = [quest('L01', []), quest('L02', ['L01'])];
    expect(questStates(qs, []).map((s) => s.state)).toEqual(['open', 'locked']);
    expect(questStates(qs, ['L01']).map((s) => s.state)).toEqual(['completed', 'open']);
    expect(questStates(qs, [], ['L02'])[1]!.state).toBe('open');
  });
});
