import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { LevelSchema, RoleSchema, type CourseDoc, type Role, type TenantDoc, type UserDoc } from '@vq/shared';
import type { Deps } from '../deps.js';
import { ApiError } from '../errors.js';
import { paths } from '../paths.js';

export const NewUserSchema = z.object({
  email: z.email().max(200).transform((s) => s.toLowerCase()),
  displayName: z.string().trim().min(1).max(120),
  role: RoleSchema.exclude(['platform_admin']),
  studentCode: z.string().trim().max(40).optional(),
  level: LevelSchema.default('B1'),
  password: z.string().min(8).max(100).optional(),
  courseIds: z.array(z.string().max(80)).max(50).default([]),
});
export type NewUser = z.infer<typeof NewUserSchema>;

export function generatePassword(): string {
  // 12 chars, unambiguous alphabet, plus a digit to satisfy common policies.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out}7`;
}

export function newUserDoc(uid: string, tenantId: string, u: { email: string; displayName: string; role: Role; studentCode?: string; level?: 'B1' | 'B2'; courseIds?: string[] }, now: Date): UserDoc {
  return {
    uid,
    tenantId,
    role: u.role,
    email: u.email,
    displayName: u.displayName,
    ...(u.studentCode ? { studentCode: u.studentCode } : {}),
    courseIds: u.courseIds ?? [],
    level: u.level ?? 'B1',
    xp: 0,
    detectivePoints: 0,
    completedCaseIds: [],
    bestPercent: {},
    achievements: [],
    locale: 'vi',
    disabled: false,
    createdAt: now.toISOString(),
  };
}

/** Creates (or attaches) a Firebase Auth account, sets claims {tenantId, role} and writes the profile. */
export async function provisionUser(deps: Deps, tenant: Pick<TenantDoc, 'id'>, input: NewUser): Promise<{ uid: string; password: string | null; created: boolean }> {
  const p = paths(deps.db);
  let uid: string;
  let password: string | null = null;
  let created = false;
  try {
    const existing = await deps.auth.getUserByEmail(input.email);
    uid = existing.uid;
    const claims = existing.customClaims ?? {};
    if (claims.tenantId && claims.tenantId !== tenant.id) {
      throw new ApiError('CONFLICT', `${input.email} already belongs to another school`);
    }
    if (input.password) await deps.auth.updateUser(uid, { password: input.password });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    password = input.password ?? generatePassword();
    const rec = await deps.auth.createUser({ email: input.email, password, displayName: input.displayName });
    uid = rec.uid;
    created = true;
  }
  await deps.auth.setCustomUserClaims(uid, { tenantId: tenant.id, role: input.role });

  // Validate course ids and keep course membership in sync.
  const courseIds: string[] = [];
  for (const cid of input.courseIds) {
    const c = await p.course(tenant.id, cid).get();
    if (c.exists) courseIds.push(cid);
  }
  const ref = p.user(tenant.id, uid);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({
      role: input.role,
      displayName: input.displayName,
      ...(input.studentCode ? { studentCode: input.studentCode } : {}),
      courseIds: FieldValue.arrayUnion(...courseIds),
    });
  } else {
    await ref.set(newUserDoc(uid, tenant.id, { ...input, courseIds }, deps.now()));
  }
  for (const cid of courseIds) {
    const field = input.role === 'teacher' ? 'teacherIds' : 'studentIds';
    if (input.role === 'teacher' || input.role === 'student') {
      await p.course(tenant.id, cid).update({ [field]: FieldValue.arrayUnion(uid) });
    }
  }
  return { uid, password, created };
}

/** Parses "email,displayName,role,studentCode,courseCode,password" CSV (header optional). */
export function parseUserCsv(text: string, courses: CourseDoc[]): { rows: NewUser[]; errors: { line: number; error: string }[] } {
  const rows: NewUser[] = [];
  const errors: { line: number; error: string }[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = splitCsvLine(line);
    if (i === 0 && cells[0]?.toLowerCase() === 'email') return;
    const [email, displayName, role, studentCode, courseCode, password] = cells.map((c) => c.trim());
    const course = courseCode ? courses.find((c) => c.code.toLowerCase() === courseCode.toLowerCase() || c.id === courseCode) : undefined;
    if (courseCode && !course) {
      errors.push({ line: i + 1, error: `Unknown course ${courseCode}` });
      return;
    }
    const parsed = NewUserSchema.safeParse({
      email,
      displayName,
      role: (role || 'student').toLowerCase(),
      studentCode: studentCode || undefined,
      password: password || undefined,
      courseIds: course ? [course.id] : [],
    });
    if (!parsed.success) errors.push({ line: i + 1, error: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
    else rows.push(parsed.data);
  });
  return { rows, errors };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Deletes a user's learning data, audio and account (right to erasure, per school policy). */
export async function deleteUserData(deps: Deps, tenantId: string, uid: string): Promise<{ sessions: number }> {
  const p = paths(deps.db);
  const sessions = await p.sessions(tenantId).where('uid', '==', uid).get();
  for (const s of sessions.docs) {
    await deps.db.recursiveDelete(s.ref);
    await p.assessment(tenantId, s.id).delete();
    await paths(deps.db).report(tenantId, s.id).delete();
  }
  const courses = await p.courses(tenantId).get();
  for (const c of courses.docs) {
    const d = c.data() as CourseDoc;
    if (d.studentIds.includes(uid) || d.teacherIds.includes(uid)) {
      await c.ref.update({ studentIds: FieldValue.arrayRemove(uid), teacherIds: FieldValue.arrayRemove(uid) });
    }
  }
  const counters = await p.counters(tenantId).where('uid', '==', uid).get();
  for (const c of counters.docs) await c.ref.delete();
  await p.user(tenantId, uid).delete();
  try {
    await deps.auth.deleteUser(uid);
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
  }
  return { sessions: sessions.size };
}
