import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { TenantRow } from '../../api/types';
import { useLocalized } from '../../i18n';
import { errorMessage, validationIssues } from '../../i18n/errors';
import { formatDate } from '../../lib/format';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, PageSkeleton, SecretBox, SectionTitle, Table } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { parseDomains } from '../admin/SchoolTab';

export default function PlatformPage() {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['platform-tenants'], queryFn: () => api.get<{ tenants: TenantRow[] }>('/api/platform/tenants') });
  const [form, setForm] = useState({ id: '', name: '', domains: '', adminEmail: '', adminName: '', seedCases: true });
  const [created, setCreated] = useState<{ id: string; email: string; password: string | null } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ tenant: { id: string }; admin: { uid: string; temporaryPassword: string | null } }>('/api/platform/tenants', {
        id: form.id.trim(),
        name: form.name.trim(),
        allowedEmailDomains: parseDomains(form.domains),
        adminEmail: form.adminEmail.trim(),
        adminName: form.adminName.trim(),
        seedCases: form.seedCases,
      }),
    onSuccess: (r) => {
      setCreated({ id: r.tenant.id, email: form.adminEmail.trim(), password: r.admin.temporaryPassword });
      setForm({ id: '', name: '', domains: '', adminEmail: '', adminName: '', seedCases: true });
      void qc.invalidateQueries({ queryKey: ['platform-tenants'] });
    },
  });
  const toggle = useMutation({
    mutationFn: (x: TenantRow) => api.patch(`/api/platform/tenants/${x.id}`, { active: !x.active }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['platform-tenants'] });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const issues = validationIssues(create.error);

  return (
    <div className="space-y-6">
      <PageHeader title={t('platform.title')} subtitle={t('platform.subtitle')} />
      <Card>
        <SectionTitle>{t('platform.schools')}</SectionTitle>
        {q.isPending ? (
          <PageSkeleton />
        ) : q.isError ? (
          <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.tenants.length === 0 ? (
          <EmptyState icon="🏫" title={t('platform.empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('common.name')}</th>
                <th>{t('admin.school.domains')}</th>
                <th>{t('admin.overview.users')}</th>
                <th>{t('admin.quotas.budget')}</th>
                <th>{t('admin.users.created')}</th>
                <th>{t('teacher.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.tenants.map((x) => (
                <tr key={x.id}>
                  <td className="font-mono text-xs">{x.id}</td>
                  <td className="font-medium">{x.name}</td>
                  <td className="text-xs">{x.allowedEmailDomains.join(', ') || '—'}</td>
                  <td className="tabular-nums">{x.users}</td>
                  <td className="tabular-nums">{x.monthlyBudgetUsd === null ? '—' : `$${x.monthlyBudgetUsd}`}</td>
                  <td className="text-xs">{formatDate(x.createdAt, lang)}</td>
                  <td>{x.active ? <Badge tone="success">{t('platform.active')}</Badge> : <Badge tone="neutral">{t('platform.inactive')}</Badge>}</td>
                  <td className="text-right">
                    <Button size="sm" variant={x.active ? 'ghost' : 'secondary'} className={x.active ? 'text-danger' : ''} onClick={() => toggle.mutate(x)} loading={toggle.isPending && toggle.variables?.id === x.id}>
                      {x.active ? t('platform.deactivate') : t('platform.activate')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="max-w-3xl">
        <SectionTitle>{t('platform.create')}</SectionTitle>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {create.isError && (
            <Alert tone="danger" className="sm:col-span-2">
              {errorMessage(t, create.error)}
              {issues.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {issues.map((i, n) => (
                    <li key={n}>
                      {i.path}: {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          <Field label={t('platform.tenantId')} hint={t('platform.tenantIdHint')}>
            {(id) => <Input id={id} required pattern="[a-z0-9-]{3,40}" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })} />}
          </Field>
          <Field label={t('admin.school.name')}>{(id) => <Input id={id} required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label={t('admin.school.domains')} hint={t('admin.school.domainsHint')} className="sm:col-span-2">
            {(id) => <Input id={id} value={form.domains} placeholder="example.edu.vn" onChange={(e) => setForm({ ...form, domains: e.target.value })} />}
          </Field>
          <Field label={t('platform.adminEmail')}>{(id) => <Input id={id} type="email" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />}</Field>
          <Field label={t('platform.adminName')}>{(id) => <Input id={id} required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />}</Field>
          <div className="sm:col-span-2">
            <Checkbox label={t('platform.seedCases')} checked={form.seedCases} onChange={(e) => setForm({ ...form, seedCases: e.target.checked })} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={create.isPending}>
              {t('platform.createButton')}
            </Button>
          </div>
        </form>
      </Card>

      <Modal open={created !== null} onClose={() => setCreated(null)} title={t('platform.createdTitle')} footer={<Button onClick={() => setCreated(null)}>{t('common.done')}</Button>}>
        {created && (
          <div className="space-y-3 text-sm">
            <p>{t('platform.createdBody', { id: created.id, email: created.email })}</p>
            {created.password ? (
              <>
                <p className="text-warn">{t('admin.users.tempPasswordOnce')}</p>
                <SecretBox value={created.password} />
              </>
            ) : (
              <p>{t('admin.users.existingAttached')}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
