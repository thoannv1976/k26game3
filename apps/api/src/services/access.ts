import type { CourseDoc } from '@vq/shared';
import type { Member } from '../auth.js';
import type { Deps } from '../deps.js';
import { paths } from '../paths.js';

/** Courses a teacher teaches (school admins: all courses of the school). */
export async function coursesFor(deps: Deps, m: Member): Promise<CourseDoc[]> {
  const col = paths(deps.db).courses(m.tenantId);
  const snap = m.role === 'school_admin' ? await col.get() : await col.where('teacherIds', 'array-contains', m.uid).get();
  return snap.docs.map((d) => d.data() as CourseDoc).sort((a, b) => a.code.localeCompare(b.code));
}

/** Students see themselves; teachers see students in their courses; school admins see everyone in the school. */
export async function canViewStudent(deps: Deps, m: Member, studentUid: string): Promise<boolean> {
  if (m.uid === studentUid) return true;
  if (m.role === 'school_admin') return true;
  if (m.role !== 'teacher') return false;
  const snap = await paths(deps.db)
    .courses(m.tenantId)
    .where('teacherIds', 'array-contains', m.uid)
    .get();
  return snap.docs.some((d) => (d.data() as CourseDoc).studentIds.includes(studentUid));
}
