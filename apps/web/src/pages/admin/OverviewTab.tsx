import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { AdminCaseRow, OverviewReport } from '../../api/types';
import { useLocalized } from '../../i18n';
import { Card, EmptyState, ErrorBox, PageSkeleton, SectionTitle, StatCard, Table } from '../../components/ui';

export function OverviewTab() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: () => api.get<OverviewReport>('/api/admin/reports/overview') });
  const cases = useQuery({ queryKey: ['admin-cases'], queryFn: () => api.get<{ cases: AdminCaseRow[] }>('/api/admin/cases') });
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const rows = Object.entries(d.byCase).sort(([a], [b]) => a.localeCompare(b));
  const title = (id: string) => L(cases.data?.cases.find((c) => c.id === id)?.title);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('admin.overview.users')} value={d.users} />
        <StatCard label={t('admin.overview.sessions')} value={d.sessions} />
        <StatCard label={t('admin.overview.reports')} value={d.recentReports} hint={t('admin.overview.recentHint')} />
        <StatCard label={t('admin.overview.reviewed')} value={d.reviewed} hint={d.recentReports ? `${Math.round((d.reviewed / d.recentReports) * 100)}%` : undefined} />
      </div>
      <Card>
        <SectionTitle>{t('admin.overview.byCase')}</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState icon="📊" title={t('teacher.noResults')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('teacher.case')}</th>
                <th>{t('admin.overview.reports')}</th>
                <th>{t('admin.overview.solved')}</th>
                <th>{t('admin.overview.average')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([id, v]) => (
                <tr key={id}>
                  <td>
                    <span className="font-mono font-semibold">{id}</span> {title(id)}
                  </td>
                  <td className="tabular-nums">{v.reports}</td>
                  <td className="tabular-nums">
                    {v.solved} ({v.reports ? Math.round((v.solved / v.reports) * 100) : 0}%)
                  </td>
                  <td className="tabular-nums">{Math.round(v.avgPercent)}%</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
