import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ed-rules',
    firestore: { rules: readFileSync(new URL('../../../../firebase/firestore.rules', import.meta.url), 'utf8'), host: host!, port: Number(port) },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'tenants/A'), { id: 'A' });
    await setDoc(doc(db, 'tenants/A/users/s1'), { uid: 's1' });
    await setDoc(doc(db, 'tenants/A/cases/CASE01'), { status: 'approved' });
    await setDoc(doc(db, 'tenants/A/cases/CASE01/versions/1'), { dossier: { secret: true } });
    await setDoc(doc(db, 'tenants/A/investigation_sessions/g1'), { uid: 's1' });
    await setDoc(doc(db, 'tenants/A/investigation_sessions/g1/interview_messages/m1'), { reply: 'hi' });
    await setDoc(doc(db, 'tenants/A/investigation_sessions/g1/drafts/current'), { text: 'draft' });
    await setDoc(doc(db, 'tenants/A/final_reports/g1'), { uid: 's1', text: 'report' });
    await setDoc(doc(db, 'tenants/A/assessments/g1'), { uid: 's1', percent: 80 });
    await setDoc(doc(db, 'tenants/B/investigation_sessions/gb'), { uid: 'sb' });
  });
});

afterAll(async () => env?.cleanup());

const as = (uid: string, tenantId: string | null, role: string) => env.authenticatedContext(uid, tenantId ? { tenantId, role } : { role }).firestore();

describe('Firestore security rules (database "detective")', () => {
  it('nobody can read case dossiers (answers and character facts) from a client', async () => {
    for (const db of [as('s1', 'A', 'student'), as('t1', 'A', 'teacher'), as('a1', 'A', 'school_admin')]) {
      await assertFails(getDoc(doc(db, 'tenants/A/cases/CASE01/versions/1')));
    }
    await assertFails(getDoc(doc(as('s1', 'A', 'student'), 'tenants/A/cases/CASE01')));
    await assertSucceeds(getDoc(doc(as('t1', 'A', 'teacher'), 'tenants/A/cases/CASE01')));
  });
  it('students read only their own investigation, messages, report and assessment', async () => {
    const own = as('s1', 'A', 'student');
    for (const p of ['tenants/A/investigation_sessions/g1', 'tenants/A/investigation_sessions/g1/interview_messages/m1', 'tenants/A/investigation_sessions/g1/drafts/current', 'tenants/A/final_reports/g1', 'tenants/A/assessments/g1']) {
      await assertSucceeds(getDoc(doc(own, p)));
      await assertFails(getDoc(doc(as('s2', 'A', 'student'), p)));
    }
  });
  it('no client writes, including scores and drafts', async () => {
    const own = as('s1', 'A', 'student');
    await assertFails(updateDoc(doc(own, 'tenants/A/assessments/g1'), { percent: 100 }));
    await assertFails(setDoc(doc(own, 'tenants/A/investigation_sessions/g1/drafts/current'), { text: 'x' }));
    await assertFails(setDoc(doc(own, 'tenants/A/users/s1'), { role: 'school_admin' }));
  });
  it('school and platform isolation', async () => {
    await assertFails(getDoc(doc(as('a1', 'A', 'school_admin'), 'tenants/B/investigation_sessions/gb')));
    await assertSucceeds(getDoc(doc(as('a1', 'A', 'school_admin'), 'tenants/A/investigation_sessions/g1')));
    await assertFails(getDoc(doc(as('p1', null, 'platform_admin'), 'tenants/A/assessments/g1')));
  });
});
