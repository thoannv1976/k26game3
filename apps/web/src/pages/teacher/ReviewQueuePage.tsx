import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, qs } from '../../api/client';
import type { ReviewQueueItem, TeacherClass } from '../../api/types';
import { useLocalized } from '../../i18n';
import { formatDate } from '../../lib/format';
import { SkillChip } from '../../components/game';
import { Badge, Card, EmptyState, ErrorBox, Field, PageHeader, PageSkeleton, Select, Table } from '../../components/ui';

export default function ReviewQueuePage() {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const [sp, setSp] = useSearchParams();
  const courseId = sp.get('courseId') ?? '';
  const classes = useQuery({ queryKey: ['teacher-classes'], queryFn: () => api.get<{ classes: TeacherClass[] }>('/api/teacher/classes') });
  const q = useQuery({ queryKey: ['review-queue', courseId], queryFn: () => api.get<{ items: ReviewQueueItem[] }>(`/api/teacher/review-queue${qs({ courseId })}`) });
  return (
    <div className="space-y-5">
      <PageHeader title={<>📝 {t('reviewQueue.title')}</>} subtitle={t('reviewQueue.subtitle')} />
      <Card>
        <Field label={t('reviewQueue.class')} className="mb-4 max-w-xs">
          {(id) => (
            <Select id={id} value={courseId} onChange={(e) => setSp(e.target.value ? { courseId: e.target.value } : {})}>
              <option value="">{t('common.all')}</option>
              {classes.data?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {q.isPending ? (
          <PageSkeleton />
        ) : q.isError ? (
          <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon="✅" title={t('reviewQueue.empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('teacher.student')}</th>
                <th>{t('history.activity')}</th>
                <th>{t('teacher.skillsCol')}</th>
                <th>{t('reviewQueue.ai')}</th>
                <th>{t('teacher.date')}</th>
              </tr>
            </thead>
            <tbody data-testid="review-queue">
              {q.data.items.map((r) => (
                <tr key={r.attemptId}>
                  <td className="font-semibold">{r.studentName}</td>
                  <td>
                    <Link to={`/teacher/attempts/${r.attemptId}`} className="font-semibold text-primary hover:underline" data-testid="review-open">
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {t(`modes.${r.mode}`)} {r.championshipId && '🏆'}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {r.skills.map((s) => (
                        <span key={s.skill} className="inline-flex items-center gap-1">
                          <SkillChip skill={s.skill} />
                          <span className="text-xs">{s.score ?? '—'}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <Badge tone={r.aiStatus === 'ok' ? 'success' : r.aiStatus === 'failed' ? 'danger' : 'neutral'}>{t(`reviewQueue.aiStatus.${r.aiStatus}`)}</Badge>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(r.createdAt, lang, true)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
