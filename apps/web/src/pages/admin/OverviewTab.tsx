import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { ContentRow, OverviewReport } from '../../api/types';
import { Card, EmptyState, ErrorBox, PageSkeleton, SectionTitle, StatCard, Table } from '../../components/ui';

export function OverviewTab() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: () => api.get<OverviewReport>('/api/admin/reports/overview') });
  const quests = useQuery({ queryKey: ['content', 'quest'], queryFn: () => api.get<{ items: ContentRow[] }>('/api/admin/content/quest') });
  const exams = useQuery({ queryKey: ['content', 'exam'], queryFn: () => api.get<{ items: ContentRow[] }>('/api/admin/content/exam') });
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const rows = Object.entries(d.byRef).sort(([a], [b]) => a.localeCompare(b));
  const title = (id: string) => [...(quests.data?.items ?? []), ...(exams.data?.items ?? [])].find((c) => c.id === id)?.title ?? '';
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t('admin.overview.users')} value={d.users} />
        <StatCard label={t('admin.overview.attempts')} value={d.attempts} />
        <StatCard label={t('admin.overview.results')} value={d.recentResults} hint={t('admin.overview.recentHint')} />
        <StatCard label={t('admin.overview.pendingReview')} value={d.pendingReview} />
        <StatCard label={t('admin.overview.reviewed')} value={d.reviewed} hint={d.recentResults ? `${Math.round((d.reviewed / d.recentResults) * 100)}%` : undefined} />
      </div>
      <Card>
        <SectionTitle>{t('admin.overview.byRef')}</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState icon="📊" title={t('teacher.noResults')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('history.activity')}</th>
                <th>{t('history.mode')}</th>
                <th>{t('admin.overview.results')}</th>
                <th>{t('admin.overview.passed')}</th>
                <th>{t('admin.overview.average')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([id, v]) => (
                <tr key={id}>
                  <td>
                    <span className="font-mono font-semibold">{id}</span> <span lang="en">{title(id)}</span>
                  </td>
                  <td>{t(`modes.${v.mode as 'quest'}`)}</td>
                  <td className="tabular-nums">{v.results}</td>
                  <td className="tabular-nums">
                    {v.passed} ({v.results ? Math.round((v.passed / v.results) * 100) : 0}%)
                  </td>
                  <td className="tabular-nums">{v.avgScore ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
