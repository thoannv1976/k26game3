import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { AdminUser, Course } from '../../api/types';
import { errorMessage } from '../../i18n/errors';
import { Alert, Button, Card, ConfirmModal, EmptyState, ErrorBox, Field, Input, Modal, PageSkeleton, Table } from '../../components/ui';
import { useToast } from '../../components/Toast';

function MultiSelect({ label, options, value, onChange }: { label: string; options: AdminUser[]; value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((o) => !s || o.displayName.toLowerCase().includes(s) || o.email.includes(s) || o.studentCode.toLowerCase().includes(s));
  }, [options, q]);
  const allSelected = filtered.length > 0 && filtered.every((o) => value.includes(o.uid));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        {label} <span className="text-muted">({value.length})</span>
      </legend>
      <div className="flex gap-2">
        <Input type="search" aria-label={`${t('common.search')} – ${label}`} placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange(allSelected ? value.filter((v) => !filtered.some((f) => f.uid === v)) : [...new Set([...value, ...filtered.map((f) => f.uid)])])}
        >
          {allSelected ? t('common.none') : t('common.all')}
        </Button>
      </div>
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-line">
        {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('common.noMatches')}</li>}
        {filtered.map((o) => (
          <li key={o.uid} className="border-b border-line last:border-0">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-surface-2">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--ed-primary)]"
                checked={value.includes(o.uid)}
                onChange={(e) => onChange(e.target.checked ? [...value, o.uid] : value.filter((v) => v !== o.uid))}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {o.displayName} {o.studentCode && <span className="font-mono text-xs text-muted">· {o.studentCode}</span>}
                </span>
                <span className="block truncate text-xs text-muted">{o.email}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function CourseModal({ course, users, onClose }: { course: Course | null; users: AdminUser[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    code: course?.code ?? '',
    name: course?.name ?? '',
    teacherIds: course?.teacherIds ?? [],
    studentIds: course?.studentIds ?? [],
    budget: course?.monthlyBudgetUsd === null || course?.monthlyBudgetUsd === undefined ? '' : String(course.monthlyBudgetUsd),
  });
  const teachers = users.filter((u) => u.role === 'teacher' || u.role === 'school_admin');
  const students = users.filter((u) => u.role === 'student');
  const m = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        teacherIds: form.teacherIds,
        studentIds: form.studentIds,
        monthlyBudgetUsd: form.budget === '' ? null : Number(form.budget),
      };
      return course ? api.patch(`/api/admin/courses/${course.id}`, body) : api.post('/api/admin/courses', body);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['admin-courses'] });
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['teacher-classes'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={course ? `${t('common.edit')}: ${course.code}` : t('admin.courses.add')}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="course-form" loading={m.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="course-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        {m.isError && (
          <Alert tone="danger" className="md:col-span-2">
            {errorMessage(t, m.error)}
          </Alert>
        )}
        <Field label={t('admin.courses.code')}>{(id) => <Input id={id} required maxLength={40} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />}</Field>
        <Field label={t('common.name')}>{(id) => <Input id={id} required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label={t('admin.courses.budget')} hint={t('admin.courses.budgetHint')}>
          {(id) => <Input id={id} type="number" min={0} step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />}
        </Field>
        <div />
        <MultiSelect label={t('admin.courses.teachers')} options={teachers} value={form.teacherIds} onChange={(v) => setForm({ ...form, teacherIds: v })} />
        <MultiSelect label={t('admin.courses.students')} options={students} value={form.studentIds} onChange={(v) => setForm({ ...form, studentIds: v })} />
      </form>
    </Modal>
  );
}

export function CoursesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const coursesQ = useQuery({ queryKey: ['admin-courses'], queryFn: () => api.get<{ courses: Course[] }>('/api/admin/courses') });
  const usersQ = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<{ users: AdminUser[] }>('/api/admin/users') });
  const [editing, setEditing] = useState<Course | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/courses/${id}`),
    onSuccess: () => {
      setDeleting(null);
      toast.success(t('common.deleted'));
      void qc.invalidateQueries({ queryKey: ['admin-courses'] });
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  if (coursesQ.isPending) return <PageSkeleton />;
  if (coursesQ.isError) return <ErrorBox error={coursesQ.error} onRetry={() => void coursesQ.refetch()} />;
  const users = usersQ.data?.users ?? [];
  const nameOf = (uid: string) => users.find((u) => u.uid === uid)?.displayName ?? uid;

  return (
    <Card>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing('new')} disabled={!usersQ.data}>
          + {t('admin.courses.add')}
        </Button>
      </div>
      {coursesQ.data.courses.length === 0 ? (
        <EmptyState icon="📚" title={t('admin.courses.empty')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('admin.courses.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('admin.courses.teachers')}</th>
              <th>{t('admin.courses.students')}</th>
              <th>{t('admin.courses.budget')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {coursesQ.data.courses.map((c) => (
              <tr key={c.id}>
                <td className="font-mono font-semibold">{c.code}</td>
                <td>{c.name}</td>
                <td className="text-xs">{c.teacherIds.map(nameOf).join(', ') || '—'}</td>
                <td className="tabular-nums">{c.studentIds.length}</td>
                <td className="tabular-nums">{c.monthlyBudgetUsd === null ? '—' : `$${c.monthlyBudgetUsd}`}</td>
                <td className="text-right whitespace-nowrap">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(c)} disabled={!usersQ.data}>
                    {t('common.edit')}
                  </Button>{' '}
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleting(c)}>
                    {t('common.delete')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <CourseModal course={editing === 'new' ? null : editing} users={users} onClose={() => setEditing(null)} />}
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        title={t('admin.courses.delete')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={del.isPending}
        confirmText={deleting?.code}
      >
        <p>{t('admin.courses.deleteBody', { code: deleting?.code ?? '' })}</p>
      </ConfirmModal>
    </Card>
  );
}
