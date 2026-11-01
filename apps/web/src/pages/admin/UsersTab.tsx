import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LEVELS, type Level } from '@vq/shared';
import { api } from '../../api/client';
import type { AdminUser, Course, ImportResult } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage, validationIssues } from '../../i18n/errors';
import { downloadBlob, formatDate } from '../../lib/format';
import { useLocalized } from '../../i18n';
import { Alert, Badge, Button, Card, Checkbox, ConfirmModal, EmptyState, ErrorBox, Field, Input, LevelBadge, Modal, PageSkeleton, SecretBox, Select, Table, Textarea } from '../../components/ui';
import { useToast } from '../../components/Toast';

type SchoolRole = AdminUser['role'];
const SCHOOL_ROLES: SchoolRole[] = ['student', 'teacher', 'school_admin'];

export const CSV_TEMPLATE =
  '﻿email,displayName,role,studentCode,courseCode,password\r\n' +
  'sv001@example.edu.vn,Nguyen Van A,student,SV001,ENG101,\r\n' +
  'gv001@example.edu.vn,Tran Thi B,teacher,,ENG101,\r\n';

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function UsersTab() {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const usersQ = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<{ users: AdminUser[] }>('/api/admin/users') });
  const coursesQ = useQuery({ queryKey: ['admin-courses'], queryFn: () => api.get<{ courses: Course[] }>('/api/admin/courses') });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | SchoolRole>('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const users = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (usersQ.data?.users ?? []).filter(
      (u) => (!roleFilter || u.role === roleFilter) && (!s || u.displayName.toLowerCase().includes(s) || u.email.includes(s) || u.studentCode.toLowerCase().includes(s)),
    );
  }, [usersQ.data, search, roleFilter]);

  if (usersQ.isPending) return <PageSkeleton />;
  if (usersQ.isError) return <ErrorBox error={usersQ.error} onRetry={() => void usersQ.refetch()} />;
  const courses = coursesQ.data?.courses ?? [];
  const courseCode = (id: string) => courses.find((c) => c.id === id)?.code ?? id;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('common.search')} className="min-w-48 flex-1">
          {(id) => <Input id={id} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.users.searchPlaceholder')} />}
        </Field>
        <Field label={t('admin.users.role')} className="w-44">
          {(id) => (
            <Select id={id} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as SchoolRole | '')}>
              <option value="">{t('common.all')}</option>
              {SCHOOL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex gap-2">
          <Button onClick={() => setCreating(true)}>+ {t('admin.users.add')}</Button>
          <Button variant="secondary" onClick={() => setImporting(true)}>
            ⬆ {t('admin.users.import')}
          </Button>
        </div>
      </div>
      <p className="mb-2 text-sm text-muted">{t('admin.users.count', { count: users.length })}</p>
      {users.length === 0 ? (
        <EmptyState icon="👥" title={t('admin.users.empty')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('admin.users.role')}</th>
              <th>{t('teacher.code')}</th>
              <th>{t('teacher.level')}</th>
              <th>{t('admin.users.courses')}</th>
              <th>{t('admin.users.created')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid} className={u.disabled ? 'opacity-60' : ''}>
                <td>
                  <div className="font-medium">{u.displayName}</div>
                  <div className="text-xs text-muted">{u.email}</div>
                </td>
                <td>
                  <Badge tone={u.role === 'school_admin' ? 'danger' : u.role === 'teacher' ? 'primary' : 'neutral'}>{t(`roles.${u.role}`)}</Badge>
                  {u.disabled && (
                    <Badge tone="warn" className="ml-1">
                      {t('admin.users.disabled')}
                    </Badge>
                  )}
                </td>
                <td className="font-mono text-xs">{u.studentCode || '—'}</td>
                <td>
                  <LevelBadge level={u.level} />
                </td>
                <td className="text-xs">{u.courseIds.map(courseCode).join(', ') || '—'}</td>
                <td className="text-xs">{formatDate(u.createdAt, lang)}</td>
                <td className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>
                    {t('common.edit')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {creating && <CreateUserModal courses={courses} onClose={() => setCreating(false)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function CreateUserModal({ courses, onClose }: { courses: Course[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: '', displayName: '', role: 'student' as SchoolRole, studentCode: '', level: 'B1' as Level, password: '', courseIds: [] as string[] });
  const [result, setResult] = useState<{ temporaryPassword: string | null; created: boolean } | null>(null);
  const m = useMutation({
    mutationFn: () =>
      api.post<{ uid: string; created: boolean; temporaryPassword: string | null }>('/api/admin/users', {
        email: form.email.trim(),
        displayName: form.displayName.trim(),
        role: form.role,
        level: form.level,
        courseIds: form.courseIds,
        ...(form.studentCode.trim() ? { studentCode: form.studentCode.trim() } : {}),
        ...(form.password ? { password: form.password } : {}),
      }),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-courses'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  if (result) {
    return (
      <Modal open onClose={onClose} title={t('admin.users.created')} footer={<Button onClick={onClose}>{t('common.done')}</Button>}>
        {result.temporaryPassword ? (
          <div className="space-y-3 text-sm">
            <p>{t('admin.users.tempPasswordOnce')}</p>
            <SecretBox value={result.temporaryPassword} />
          </div>
        ) : (
          <p className="text-sm">{result.created ? t('admin.users.createdWithPassword') : t('admin.users.existingAttached')}</p>
        )}
      </Modal>
    );
  }
  const issues = validationIssues(m.error);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.users.add')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="create-user" loading={m.isPending}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form id="create-user" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {m.isError && (
          <Alert tone="danger" className="sm:col-span-2">
            {errorMessage(t, m.error)}
            {issues.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {issues.map((i, n) => (
                  <li key={n}>
                    {i.path}: {i.message}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <Field label={t('login.email')}>{(id) => <Input id={id} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label={t('common.name')}>{(id) => <Input id={id} required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}</Field>
        <Field label={t('admin.users.role')}>
          {(id) => (
            <Select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as SchoolRole })}>
              {SCHOOL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('teacher.level')}>
          {(id) => (
            <Select id={id} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Level })}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('teacher.code')}>{(id) => <Input id={id} value={form.studentCode} maxLength={40} onChange={(e) => setForm({ ...form, studentCode: e.target.value })} />}</Field>
        <Field label={t('admin.users.passwordOptional')} hint={t('admin.users.passwordHint')}>
          {(id) => <Input id={id} type="text" autoComplete="new-password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        {courses.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">{t('admin.users.courses')}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {courses.map((c) => (
                <Checkbox
                  key={c.id}
                  label={`${c.code} · ${c.name}`}
                  checked={form.courseIds.includes(c.id)}
                  onChange={(e) => setForm({ ...form, courseIds: e.target.checked ? [...form.courseIds, c.id] : form.courseIds.filter((x) => x !== c.id) })}
                />
              ))}
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const m = useMutation({
    mutationFn: () => api.post<ImportResult>('/api/admin/users/import', { csv }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-courses'] });
    },
  });
  const onFile = (f: File | undefined) => {
    if (!f) return;
    void f.text().then(setCsv);
  };
  const r = m.data;
  const downloadResults = () => {
    if (!r) return;
    const lines = ['email,uid,created,temporaryPassword,error', ...r.results.map((x) => [x.email, x.uid, x.created, x.temporaryPassword, x.error].map(csvEscape).join(','))];
    downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'import-results.csv');
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.users.import')}
      size="xl"
      footer={
        r ? (
          <>
            <Button variant="secondary" onClick={downloadResults}>
              ⬇ {t('admin.users.downloadResults')}
            </Button>
            <Button onClick={onClose}>{t('common.done')}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => m.mutate()} loading={m.isPending} disabled={!csv.trim()}>
              {t('admin.users.runImport')}
            </Button>
          </>
        )
      }
    >
      {r ? (
        <div className="space-y-4 text-sm">
          <Alert tone="success">{t('admin.users.importDone', { count: r.imported })}</Alert>
          {r.errors.length > 0 && (
            <Alert tone="danger">
              <ul className="list-disc pl-5">
                {r.errors.map((e, i) => (
                  <li key={i}>
                    {t('admin.users.line', { line: e.line })}: {e.error}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          <p className="text-warn">{t('admin.users.tempPasswordOnce')}</p>
          <Table>
            <thead>
              <tr>
                <th>{t('login.email')}</th>
                <th>{t('admin.users.status')}</th>
                <th>{t('admin.users.tempPassword')}</th>
              </tr>
            </thead>
            <tbody>
              {r.results.map((x, i) => (
                <tr key={i}>
                  <td>{x.email}</td>
                  <td>{x.error ? <span className="text-danger">{x.error}</span> : x.created ? t('admin.users.statusCreated') : t('admin.users.statusUpdated')}</td>
                  <td className="font-mono">{x.temporaryPassword ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p>{t('admin.users.importHelp')}</p>
          <code className="block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">email,displayName,role,studentCode,courseCode,password</code>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => downloadBlob(new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }), 'users-template.csv')}>
              ⬇ {t('admin.users.template')}
            </Button>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-surface-2 sm:min-h-9">
              📄 {t('admin.users.chooseFile')}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
          <Field label={t('admin.users.csvContent')}>{(id) => <Textarea id={id} rows={10} className="font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />}</Field>
          {m.isError && <Alert tone="danger">{errorMessage(t, m.error)}</Alert>}
        </div>
      )}
    </Modal>
  );
}

function EditUserModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const self = me?.user?.uid === user.uid;
  const [form, setForm] = useState({ displayName: user.displayName, role: user.role, level: user.level, studentCode: user.studentCode, disabled: user.disabled });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin-users'] });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (form.displayName.trim() !== user.displayName) body.displayName = form.displayName.trim();
      if (form.role !== user.role) body.role = form.role;
      if (form.level !== user.level) body.level = form.level;
      if (form.studentCode !== user.studentCode) body.studentCode = form.studentCode;
      if (form.disabled !== user.disabled) body.disabled = form.disabled;
      return api.patch<{ ok: true; temporaryPassword: string | null }>(`/api/admin/users/${user.uid}`, body);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const reset = useMutation({
    mutationFn: () => api.patch<{ ok: true; temporaryPassword: string | null }>(`/api/admin/users/${user.uid}`, { resetPassword: true }),
    onSuccess: (r) => {
      setConfirmReset(false);
      setTempPassword(r.temporaryPassword);
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const del = useMutation({
    mutationFn: () => api.delete<{ ok: true; sessions: number }>(`/api/admin/users/${user.uid}`),
    onSuccess: (r) => {
      toast.success(t('admin.users.deleted', { count: r.sessions }));
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  return (
    <>
      <Modal
        open={!confirmDelete && !confirmReset}
        onClose={onClose}
        title={`${t('common.edit')}: ${user.email}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.name')}>{(id) => <Input id={id} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}</Field>
          <Field label={t('admin.users.role')} hint={self ? t('admin.users.selfNote') : undefined}>
            {(id) => (
              <Select id={id} value={form.role} disabled={self} onChange={(e) => setForm({ ...form, role: e.target.value as SchoolRole })}>
                {SCHOOL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('teacher.level')}>
            {(id) => (
              <Select id={id} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Level })}>
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('teacher.code')}>{(id) => <Input id={id} value={form.studentCode} maxLength={40} onChange={(e) => setForm({ ...form, studentCode: e.target.value })} />}</Field>
          <div className="sm:col-span-2">
            <Checkbox label={t('admin.users.disableAccount')} checked={form.disabled} disabled={self} onChange={(e) => setForm({ ...form, disabled: e.target.checked })} />
          </div>
        </div>
        {tempPassword && (
          <div className="mt-4 space-y-2 text-sm">
            <p>{t('admin.users.tempPasswordOnce')}</p>
            <SecretBox value={tempPassword} />
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            🔑 {t('admin.users.resetPassword')}
          </Button>
          {!self && (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              🗑 {t('admin.users.deleteData')}
            </Button>
          )}
        </div>
      </Modal>
      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
        title={t('admin.users.resetPassword')}
        confirmLabel={t('admin.users.resetPassword')}
        loading={reset.isPending}
      >
        <p>{t('admin.users.resetBody', { email: user.email })}</p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate()}
        title={t('admin.users.deleteData')}
        confirmLabel={t('admin.users.deleteForever')}
        tone="danger"
        loading={del.isPending}
        confirmText={user.email}
      >
        <p className="font-semibold text-danger">{t('admin.users.deleteWarning')}</p>
        <p>{t('admin.users.deleteBody', { email: user.email })}</p>
      </ConfirmModal>
    </>
  );
}
