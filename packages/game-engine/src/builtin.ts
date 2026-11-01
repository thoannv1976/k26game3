import { ExamBlueprintSchema, ItemSchema, MockExamSchema, QuestSchema, type ExamBlueprint, type Item, type MockExam, type Quest } from '@vq/shared';
import L01 from '../../../content/quests/L01.json';
import L02 from '../../../content/quests/L02.json';
import R01 from '../../../content/quests/R01.json';
import R02 from '../../../content/quests/R02.json';
import W01 from '../../../content/quests/W01.json';
import W02 from '../../../content/quests/W02.json';
import S01 from '../../../content/quests/S01.json';
import S02 from '../../../content/quests/S02.json';
import MX1 from '../../../content/exams/MX1.json';

/**
 * Built-in content (v1.0): 8 quests with their items and one 4-skill mock exam.
 * Seed content only – at runtime the API serves approved versions from Firestore.
 */
interface QuestBundle {
  quest: unknown;
  items: unknown[];
}
interface ExamBundle {
  blueprint: unknown;
  exam: unknown;
  items: unknown[];
}

const questBundles = [L01, L02, R01, R02, W01, W02, S01, S02] as unknown as QuestBundle[];
const examBundle = MX1 as unknown as ExamBundle;

export const BUILTIN_QUESTS: Quest[] = questBundles.map((b) => QuestSchema.parse(b.quest));
export const BUILTIN_ITEMS: Item[] = [...questBundles.flatMap((b) => b.items), ...examBundle.items].map((i) => ItemSchema.parse(i));
export const BUILTIN_BLUEPRINT: ExamBlueprint = ExamBlueprintSchema.parse(examBundle.blueprint);
export const BUILTIN_EXAMS: MockExam[] = [MockExamSchema.parse(examBundle.exam)];

export const builtinItem = (id: string) => BUILTIN_ITEMS.find((i) => i.id === id);
export const builtinQuest = (id: string) => BUILTIN_QUESTS.find((q) => q.id === id);
