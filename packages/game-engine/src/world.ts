/** Quest World: four zones and quest availability (completed / open / locked). */
import { SKILLS, ZONES, type Quest, type Skill } from '@vq/shared';

export type QuestState = 'completed' | 'open' | 'locked';

export function questStates(quests: Quest[], completed: string[], assignedQuestIds: string[] = []) {
  const done = new Set(completed);
  const assigned = new Set(assignedQuestIds);
  return quests.map((q) => {
    const missing = q.requires.filter((r) => !done.has(r));
    const state: QuestState = done.has(q.id) ? 'completed' : missing.length === 0 || assigned.has(q.id) ? 'open' : 'locked';
    return { id: q.id, state, missing, assigned: assigned.has(q.id) };
  });
}

export function worldView(quests: Quest[], completed: string[], assigned: string[] = []) {
  const states = new Map(questStates(quests, completed, assigned).map((s) => [s.id, s]));
  return SKILLS.map((skill: Skill) => {
    const qs = quests.filter((q) => q.skill === skill).sort((a, b) => a.id.localeCompare(b.id));
    return {
      skill,
      zone: ZONES[skill],
      progress: { completed: qs.filter((q) => states.get(q.id)?.state === 'completed').length, total: qs.length },
      quests: qs.map((q) => ({ ...states.get(q.id)!, level: q.level, title: q.title, xpReward: q.xpReward, estimatedMinutes: q.estimatedMinutes })),
    };
  });
}
