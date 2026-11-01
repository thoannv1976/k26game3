import type { ItemView } from '../api/types';
import { ListeningChallenge, ReadingChallenge } from './Objective';
import { SpeakingTask } from './SpeakingTask';
import { WritingTask } from './WritingTask';

/** The challenge screen adapts to the skill of the item. */
export function ChallengeView({ item }: { item: ItemView }) {
  switch (item.skill) {
    case 'listening':
      return <ListeningChallenge item={item} />;
    case 'reading':
      return <ReadingChallenge item={item} />;
    case 'writing':
      return <WritingTask item={item} />;
    case 'speaking':
      return <SpeakingTask item={item} />;
  }
}

/** Whether a challenge has everything needed for submission (mirrors the server's quest blockers). */
export function itemComplete(item: ItemView): boolean {
  switch (item.skill) {
    case 'listening':
    case 'reading':
      return item.questions.every((q) => q.answer !== null);
    case 'writing':
      return (item.draft?.wordCount ?? item.saved?.wordCount ?? 0) >= Math.ceil(item.task.minWords * 0.5);
    case 'speaking':
      return item.parts.every((p) => p.take?.status === 'transcribed');
  }
}

/** Progress inside one challenge: answered/total. */
export function itemProgress(item: ItemView): { done: number; total: number } {
  switch (item.skill) {
    case 'listening':
    case 'reading':
      return { done: item.questions.filter((q) => q.answer !== null).length, total: item.questions.length };
    case 'writing':
      return { done: itemComplete(item) ? 1 : 0, total: 1 };
    case 'speaking':
      return { done: item.parts.filter((p) => p.take?.status === 'transcribed').length, total: item.parts.length };
  }
}
