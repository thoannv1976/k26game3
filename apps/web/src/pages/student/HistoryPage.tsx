import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { AttemptStatus, MyAttempt } from '../../api/types';
import { Badge, EmptyState, ErrorBox, PageHeader, PageSkeleton, Table } from '../../components/ui';
import { useLocalized } from '../../i18n';
import { formatDate } from '../../lib/format';

export function AttemptStatusBadge({ status }: { status: AttemptStatus }) {
  const { t } = useTranslation();
  const tone = status === 'graded' ? 'success' : status === 'active' ? 'primary' : status === 'abandoned' ? 'neutral' : 'warn';
  return <Badge tone={tone}>{t(`attemptStatus.${status}`)}</Badge>;
}

export function attemptLink(a: Pick<MyAttempt, 'id' | 'mode' | 'status'>): string | null {
  if (a.status === 'abandoned') return null;
  if (a.status === 'active') return a.mode === 'exam' ? `/exam/${a.id}` : `/play/${a.id}`;
  return `/results/${a.id}`;
}

export default function HistoryPage() {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const q = useQuery({ queryKey: ['my-attempts'], queryFn: () => api.get<{ attempts: MyAttempt[] }>('/api/me/attempts') });
  return (
    <div className="space-y-5">
      <PageHeader title={<>🕘 {t('history.title')}</>} subtitle={t('history.subtitle')} />
      {q.isPending ? (
        <PageSkeleton />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.attempts.length === 0 ? (
        <EmptyState icon="🕘" title={t('history.empty')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('history.activity')}</th>
              <th>{t('history.mode')}</th>
              <th>{t('history.status')}</th>
              <th>{t('history.started')}</th>
              <th>{t('history.submitted')}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.attempts.map((a) => {
              const href = attemptLink(a);
              return (
                <tr key={a.id}>
                  <td>
                    <span className="font-mono text-xs text-muted">{a.refId}</span>{' '}
                    {href ? (
                      <Link to={href} className="font-semibold text-primary hover:underline">
                        {a.title}
                      </Link>
                    ) : (
                      a.title
                    )}
                  </td>
                  <td>{t(`modes.${a.mode}`)}</td>
                  <td>
                    <AttemptStatusBadge status={a.status} />
                  </td>
                  <td className="whitespace-nowrap">{formatDate(a.startedAt, lang, true)}</td>
                  <td className="whitespace-nowrap">{formatDate(a.submittedAt, lang, true)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
