/**
 * Seeds a school (tenant), its first admin and the built-in case bank into the English Detective database.
 * Accounts are shared with English City Simulator (same Firebase Auth project): use the SAME school id as in Game 1
 * and existing accounts keep their passwords.
 *
 * Local emulators (demo data, cases pre-approved):
 *   npm run seed:local
 * Real project (Cloud Shell, after `gcloud auth application-default login`):
 *   npx tsx scripts/seed.mts --project k26game1 --tenant demo-university --name "..." --admin-email admin@school.edu.vn [--demo] [--approve]
 *
 * --demo     demo course ENG101 with 1 teacher and 3 students (same e-mails as the Game 1 demo)
 * --approve  publish the 6 built-in cases immediately (otherwise teachers approve them in Admin → Cases)
 */
import { parseArgs } from 'node:util';
import { DEFAULT_AI_CONFIG, DEFAULT_QUOTAS, type TenantDoc } from '@vq/shared';

const { values } = parseArgs({
  options: {
    local: { type: 'boolean', default: false },
    project: { type: 'string' },
    database: { type: 'string', default: 'detective' },
    tenant: { type: 'string', default: 'demo-university' },
    name: { type: 'string', default: 'Demo University' },
    'admin-email': { type: 'string', default: 'admin@demo.edu.vn' },
    domain: { type: 'string', multiple: true, default: [] },
    demo: { type: 'boolean', default: false },
    approve: { type: 'boolean', default: false },
    'platform-admin': { type: 'string' },
  },
});

if (values.local) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8085';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.GCP_PROJECT_ID = 'demo-ed';
  values.demo = true;
  values.approve = true;
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
const { seedBuiltinCases } = await import('../apps/api/src/services/cases.js');
const { provisionUser } = await import('../apps/api/src/services/users.js');

const deps = createDeps(loadConfig({ env: 'development', aiProvider: 'fake' }));
const p = paths(deps.db);
const DEMO_PASSWORD = 'Demo-12345';
const tenantId = values.tenant!;

if (!(await p.tenant(tenantId).get()).exists) {
  const t: TenantDoc = { id: tenantId, name: values.name!, allowedEmailDomains: values.domain as string[], quotas: DEFAULT_QUOTAS, aiConfig: DEFAULT_AI_CONFIG, active: true, createdAt: new Date().toISOString() };
  await p.tenant(tenantId).set(t);
  console.log(`Created school ${t.id} – ${t.name} (database "${values.database}")`);
} else console.log(`School ${tenantId} already exists`);

const seeded = await seedBuiltinCases(deps, tenantId, values.approve ? { approvedBy: 'seed-script' } : {});
console.log(`Cases seeded: ${seeded.created} (${values.approve ? 'approved' : 'draft – approve them in Admin → Cases'})`);

const pw = values.local ? { password: DEMO_PASSWORD } : {};
const creds: { role: string; email: string; password: string }[] = [];
const add = async (email: string, displayName: string, role: 'student' | 'teacher' | 'school_admin', studentCode?: string) => {
  const r = await provisionUser(deps, { id: tenantId }, { email: email.toLowerCase(), displayName, role, level: 'B1', courseIds: [], ...(studentCode ? { studentCode } : {}), ...pw });
  creds.push({ role, email, password: r.password ?? (values.local ? DEMO_PASSWORD : '(existing account – unchanged, same as English City Simulator)') });
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
console.log('\nAccounts (shared with English City Simulator):');
console.table(creds);
process.exit(0);
