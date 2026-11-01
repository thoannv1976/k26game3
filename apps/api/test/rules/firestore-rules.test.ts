import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vq-rules',
    firestore: { rules: readFileSync(new URL('../../../../firebase/firestore.rules', import.meta.url), 'utf8'), host: host!, port: Number(port) },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'tenants/A'), { id: 'A' });
    await setDoc(doc(db, 'tenants/A/users/s1'), { uid: 's1' });
    await setDoc(doc(db, 'tenants/A/question_bank/L01_gate'), { status: 'approved' });
    await setDoc(doc(db, 'tenants/A/question_bank/L01_gate/versions/1'), { content: { questions: [{ correctIndex: 1 }] } });
    await setDoc(doc(db, 'tenants/A/mock_exams/mx1/versions/1'), { content: { secret: true } });
    await setDoc(doc(db, 'tenants/A/game_sessions/g1'), { uid: 's1', state: { answers: {} } });
    await setDoc(doc(db, 'tenants/A/game_sessions/g1/writing_submissions/W01_email'), { text: 'draft' });
    await setDoc(doc(db, 'tenants/A/assessments/g1'), { uid: 's1', score: 80 });
    await setDoc(doc(db, 'tenants/A/championships/c1/entries/s1'), { points: 10 });
    await setDoc(doc(db, 'tenants/B/assessments/gb'), { uid: 'sb' });
  });
});

afterAll(async () => env?.cleanup());

const as = (uid: string, tenantId: string | null, role: string) => env.authenticatedContext(uid, tenantId ? { tenantId, role } : { role }).firestore();

describe('Firestore security rules (database "vstep")', () => {
  it('nobody reads the question bank, quests or mock exams (answer keys, scripts) from a client', async () => {
    for (const db of [as('s1', 'A', 'student'), as('t1', 'A', 'teacher'), as('a1', 'A', 'school_admin')]) {
      await assertFails(getDoc(doc(db, 'tenants/A/question_bank/L01_gate/versions/1')));
      await assertFails(getDoc(doc(db, 'tenants/A/mock_exams/mx1/versions/1')));
      await assertFails(getDoc(doc(db, 'tenants/A/game_sessions/g1')));
    }
  });
  it('students read only their own profile and assessment', async () => {
    await assertSucceeds(getDoc(doc(as('s1', 'A', 'student'), 'tenants/A/users/s1')));
    await assertSucceeds(getDoc(doc(as('s1', 'A', 'student'), 'tenants/A/assessments/g1')));
    await assertFails(getDoc(doc(as('s2', 'A', 'student'), 'tenants/A/assessments/g1')));
    await assertFails(getDoc(doc(as('s2', 'A', 'student'), 'tenants/A/users/s1')));
    await assertFails(getDoc(doc(as('s1', 'A', 'student'), 'tenants/A/game_sessions/g1/writing_submissions/W01_email')));
  });
  it('no client writes: scores, drafts, roles, leaderboards', async () => {
    const own = as('s1', 'A', 'student');
    await assertFails(updateDoc(doc(own, 'tenants/A/assessments/g1'), { score: 100 }));
    await assertFails(setDoc(doc(own, 'tenants/A/game_sessions/g1/writing_submissions/W01_email'), { text: 'x' }));
    await assertFails(setDoc(doc(own, 'tenants/A/users/s1'), { role: 'school_admin' }));
    await assertFails(setDoc(doc(own, 'tenants/A/championships/c1/entries/s1'), { points: 999 }));
    await assertFails(setDoc(doc(as('a1', 'A', 'school_admin'), 'tenants/A/assessments/g1'), { score: 1 }));
  });
  it('school and platform isolation', async () => {
    await assertFails(getDoc(doc(as('a1', 'A', 'school_admin'), 'tenants/B/assessments/gb')));
    await assertSucceeds(getDoc(doc(as('a1', 'A', 'school_admin'), 'tenants/A/assessments/g1')));
    await assertFails(getDoc(doc(as('p1', null, 'platform_admin'), 'tenants/A/assessments/g1')));
  });
});
