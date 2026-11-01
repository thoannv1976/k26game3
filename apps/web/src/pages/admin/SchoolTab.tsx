import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { AdminSettings } from '../../api/types';
import { errorMessage } from '../../i18n/errors';
import { Alert, Button, Card, ErrorBox, Field, Input, PageSkeleton, Textarea } from '../../components/ui';
import { useToast } from '../../components/Toast';

export function parseDomains(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
}

export function SchoolTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<AdminSettings>('/api/admin/settings') });
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  useEffect(() => {
    if (q.data) {
      setName(q.data.tenant.name);
      setDomains(q.data.tenant.allowedEmailDomains.join('\n'));
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put('/api/admin/school', { name: name.trim(), allowedEmailDomains: parseDomains(domains) }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['admin-settings'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Card className="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('admin.school.id')}>{(id) => <Input id={id} value={q.data.tenant.id} readOnly disabled />}</Field>
        <Field label={t('admin.school.name')}>{(id) => <Input id={id} value={name} minLength={2} maxLength={200} required onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('admin.school.domains')} hint={t('admin.school.domainsHint')}>
          {(id) => <Textarea id={id} rows={4} value={domains} placeholder="example.edu.vn" onChange={(e) => setDomains(e.target.value)} />}
        </Field>
        {save.isError && <Alert tone="danger">{errorMessage(t, save.error)}</Alert>}
        <Button type="submit" loading={save.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Card>
  );
}
