/**
 * Creates a school (tenant) in the VSTEP Quest database that is used through the LMS (UniGame Hub / LTI): no admin
 * account is created, teachers and students are provisioned on their first launch from Moodle.
 * Use the SAME tenant id as in the other K26 games (accounts and claims {tenantId, role} are shared).
 *
 *   npx tsx scripts/create-tenant.mts --project k26game1 --tenant aiedu2026 --name "AIEdu2026" [--approve] [--approve-exams]
 *
 * --approve        publishes the built-in items and quests so LMS activities can use them right away
 *                  (renders listening audio with Google Text-to-Speech into the audio bucket)
 * --approve-exams  also publishes mock exam MX1 (otherwise a school admin approves it in Admin → Content)
 * --database       Firestore database (default "vstep")
 * Idempotent: an existing tenant or content is left unchanged.
 * Requires Application Default Credentials with Firestore, Text-to-Speech and Storage access to --project.
 */
import { parseArgs } from 'node:util';
import { DEFAULT_AI_CONFIG, DEFAULT_QUOTAS, type TenantDoc } from '@vq/shared';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    database: { type: 'string', default: 'vstep' },
    tenant: { type: 'string' },
    name: { type: 'string' },
    approve: { type: 'boolean', default: false },
    'approve-exams': { type: 'boolean', default: false },
  },
});
if (!values.project || !values.tenant || !values.name || !/^[a-z0-9-]{3,40}$/.test(values.tenant)) {
  console.error('Usage: --project <id> --tenant <a-z0-9-> --name "<School name>" [--approve] [--approve-exams] [--database vstep]');
  process.exit(1);
}
process.env.GCP_PROJECT_ID = values.project;
process.env.FIRESTORE_DATABASE = values.database;

const { loadConfig } = await import('../apps/api/src/config.js');
const { createDeps } = await import('../apps/api/src/deps.js');
const { paths } = await import('../apps/api/src/paths.js');
const { seedBuiltinContent } = await import('../apps/api/src/services/content.js');

const deps = createDeps(loadConfig({ env: 'development', aiProvider: 'fake', speechProvider: 'fake', ttsProvider: 'google', blobStore: 'gcs' }));
const ref = paths(deps.db).tenant(values.tenant);
if (!(await ref.get()).exists) {
  const t: TenantDoc = {
    id: values.tenant,
    name: values.name,
    allowedEmailDomains: [],
    quotas: DEFAULT_QUOTAS,
    aiConfig: DEFAULT_AI_CONFIG,
    active: true,
    createdAt: new Date().toISOString(),
  };
  await ref.set(t);
  console.log(`Created school ${t.id} – ${t.name} (database "${values.database}")`);
} else {
  console.log(`School ${values.tenant} already exists (unchanged)`);
}
const seeded = await seedBuiltinContent(deps, values.tenant, values.approve ? { approvedBy: 'lti-setup', approveExams: values['approve-exams'] } : {});
console.log(
  `Content seeded: ${seeded.created} (${values.approve ? (values['approve-exams'] ? 'approved incl. mock exam' : 'approved; mock exam is a draft – approve it in Admin → Content') : 'draft – approve it in Admin → Content'})`,
);
process.exit(0);
