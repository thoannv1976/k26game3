/**
 * Seeds a school (tenant), its first admin and the built-in content (question bank, 8 quests, mock exam MX1) into the
 * VSTEP Quest database. Accounts are shared with Games 1 and 2 (same Firebase Auth project): use the SAME school id
 * as in Game 1 and existing accounts keep their passwords.
 *
 * Local emulators (demo data, everything pre-approved):
 *   npm run seed:local
 * Real project (Cloud Shell, after `gcloud auth application-default login`):
 *   npx tsx scripts/seed.mts --project k26game1 --tenant demo-university --name "..." --admin-email admin@school.edu.vn [--demo] [--approve] [--approve-exams]
 *
 * --demo           demo course ENG101 with 1 teacher and 3 students (same e-mails as the Game 1 demo)
 * --approve        publish the built-in items and quests (renders listening audio with Text-to-Speech)
 * --approve-exams  also publish mock exam MX1 (otherwise a school admin approves it in Admin → Content)
 */
import { parseArgs } from 'node:util';
import { DEFAULT_AI_CONFIG, DEFAULT_QUOTAS, type TenantDoc } from '@vq/shared';

const { values } = parseArgs({
  options: {
    local: { type: 'boolean', default: false },
    project: { type: 'string' },
    database: { type: 'string', default: 'vstep' },
    tenant: { type: 'string', default: 'demo-university' },
    name: { type: 'string', default: 'Demo University' },
    'admin-email': { type: 'string', default: 'admin@demo.edu.vn' },
    domain: { type: 'string', multiple: true, default: [] },
    demo: { type: 'boolean', default: false },
    approve: { type: 'boolean', default: false },
    'approve-exams': { type: 'boolean', default: false },
    'platform-admin': { type: 'string' },
  },
});

if (values.local) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8085';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.GCP_PROJECT_ID = 'demo-vq';
  values.demo = true;
  values.approve = true;
  values['approve-exams'] = true;
} else if (values.project) {
  process.env.GCP_PROJECT_ID = values.project;
} else {
  console.error('Use --local (emulators) or --project <id>.');
  process.exit(1);
}
process.env.FIRESTORE_DATABASE = values.database;

const { loadConfig } = await import('../apps/api/src/config.js');
const { createDeps } = await import('../apps/api/src/deps.js');
const { paths } = await import('../apps/api/src/paths.js');
const { seedBuiltinContent } = await import('../apps/api/src/services/content.js');
const { provisionUser } = await import('../apps/api/src/services/users.js');

// Real projects render listening audio with Google Text-to-Speech into the audio bucket.
const deps = createDeps(
  loadConfig(values.local ? { env: 'development', aiProvider: 'fake', ttsProvider: 'fake', blobStore: 'local', localDataDir: 'apps/api/.data' } : { env: 'development', aiProvider: 'fake', ttsProvider: 'google', blobStore: 'gcs' }),
);
const p = paths(deps.db);
const DEMO_PASSWORD = 'Demo-12345';
const tenantId = values.tenant!;

if (!(await p.tenant(tenantId).get()).exists) {
  const t: TenantDoc = { id: tenantId, name: values.name!, allowedEmailDomains: values.domain as string[], quotas: DEFAULT_QUOTAS, aiConfig: DEFAULT_AI_CONFIG, active: true, createdAt: new Date().toISOString() };
  await p.tenant(tenantId).set(t);
  console.log(`Created school ${t.id} – ${t.name} (database "${values.database}")`);
} else console.log(`School ${tenantId} already exists`);

const seeded = await seedBuiltinContent(deps, tenantId, values.approve ? { approvedBy: 'seed-script', approveExams: values['approve-exams'] } : {});
console.log(`Content seeded: ${seeded.created} (${values.approve ? `approved${values['approve-exams'] ? ' incl. mock exam' : '; mock exam is a draft – approve it in Admin → Content'}` : 'draft – approve it in Admin → Content'})`);

const pw = values.local ? { password: DEMO_PASSWORD } : {};
const creds: { role: string; email: string; password: string }[] = [];
const add = async (email: string, displayName: string, role: 'student' | 'teacher' | 'school_admin', studentCode?: string) => {
  const r = await provisionUser(deps, { id: tenantId }, { email: email.toLowerCase(), displayName, role, level: 'B1', courseIds: [], ...(studentCode ? { studentCode } : {}), ...pw });
  creds.push({ role, email, password: r.password ?? (values.local ? DEMO_PASSWORD : '(existing account – unchanged, same as Games 1 and 2)') });
  return r.uid;
};

await add(values['admin-email']!, 'School Admin', 'school_admin');
if (values.demo) {
  const teacher = await add('teacher@demo.edu.vn', 'Cô Nguyễn Thu Hà', 'teacher');
  const students = [];
  for (const [i, name] of ['Trần Minh Anh', 'Lê Hoàng Nam', 'Phạm Thu Trang'].entries()) students.push(await add(`student${i + 1}@demo.edu.vn`, name, 'student', `SV00${i + 1}`));
  await p.course(tenantId, 'eng-comm-1').set({ id: 'eng-comm-1', tenantId, code: 'ENG101', name: 'English Communication 1', teacherIds: [teacher], studentIds: students, monthlyBudgetUsd: null, createdAt: new Date().toISOString() });
  for (const uid of [teacher, ...students]) await p.user(tenantId, uid).update({ courseIds: ['eng-comm-1'] });
  console.log('Demo course ENG101 created');
}
if (values['platform-admin']) {
  const email = values['platform-admin'];
  let uid: string;
  try {
    uid = (await deps.auth.getUserByEmail(email)).uid;
  } catch {
    uid = (await deps.auth.createUser({ email, password: values.local ? DEMO_PASSWORD : undefined })).uid;
  }
  await deps.auth.setCustomUserClaims(uid, { role: 'platform_admin' });
  creds.push({ role: 'platform_admin', email, password: values.local ? DEMO_PASSWORD : '(unchanged)' });
}
console.log('\nAccounts (shared with English City Simulator and English Detective):');
console.table(creds);
process.exit(0);
