import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { AuditLog } from '../../api/types';
import { useLocalized } from '../../i18n';
import { formatDate } from '../../lib/format';
import { Card, EmptyState, ErrorBox, Field, Input, PageSkeleton, Table } from '../../components/ui';

export function AuditTab() {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const [filter, setFilter] = useState('');
  const q = useQuery({ queryKey: ['admin-audit'], queryFn: () => api.get<{ logs: AuditLog[] }>('/api/admin/audit-logs') });
  const logs = useMemo(() => {
    const s = filter.trim().toLowerCase();
    return (q.data?.logs ?? []).filter((l) => !s || l.action.includes(s) || l.actorEmail?.toLowerCase().includes(s) || l.target?.toLowerCase().includes(s));
  }, [q.data, filter]);
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <Card>
      <Field label={t('common.search')} className="mb-4 max-w-sm">
        {(id) => <Input id={id} type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="user.create, export…" />}
      </Field>
      {logs.length === 0 ? (
        <EmptyState icon="📜" title={t('admin.audit.empty')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('admin.audit.time')}</th>
              <th>{t('admin.audit.actor')}</th>
              <th>{t('admin.audit.action')}</th>
              <th>{t('admin.audit.target')}</th>
              <th>{t('admin.audit.details')}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="text-xs whitespace-nowrap">{formatDate(l.at, lang, true)}</td>
                <td className="text-xs">
                  {l.actorEmail}
                  <div className="text-muted">{l.actorRole ? t(`roles.${l.actorRole}` as 'roles.student') : ''}</div>
                </td>
                <td className="font-mono text-xs">{l.action}</td>
                <td className="font-mono text-xs break-all">{l.target}</td>
                <td>
                  <code className="block max-w-xs truncate text-xs text-muted" title={JSON.stringify(l.details)}>
                    {JSON.stringify(l.details)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
