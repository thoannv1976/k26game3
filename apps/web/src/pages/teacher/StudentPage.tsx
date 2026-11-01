import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS } from '@engine/scoring';
import { api } from '../../api/client';
import type { TeacherStudentDetail } from '../../api/types';
import { useLocalized } from '../../i18n';
import { formatDate } from '../../lib/format';
import { Badge, ButtonLink, Card, EmptyState, ErrorBox, LevelBadge, PageHeader, PageSkeleton, SectionTitle, StatCard, Table } from '../../components/ui';

export default function StudentPage() {
  const { uid = '' } = useParams();
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const q = useQuery({ queryKey: ['teacher-student', uid], queryFn: () => api.get<TeacherStudentDetail>(`/api/teacher/students/${uid}`) });
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const { student: s, sessions } = q.data;
  const scored = sessions.filter((x) => x.percent !== null);
  return (
    <div className="space-y-6">
      <ButtonLink to="/teacher" variant="ghost" size="sm" className="-ml-3">
        ← {t('teacher.title')}
      </ButtonLink>
      <PageHeader title={s.displayName} subtitle={`${s.studentCode ? `${s.studentCode} · ` : ''}${s.email}`} />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t('teacher.level')} value={<LevelBadge level={s.level} />} />
        <StatCard label="XP" value={s.xp} />
        <StatCard label={t('academy.dp')} value={s.detectivePoints} />
        <StatCard label={t('teacher.average')} value={scored.length ? `${Math.round(scored.reduce((n, x) => n + (x.percent ?? 0), 0) / scored.length)}%` : '—'} />
      </div>
      {s.achievements.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {s.achievements.map((a) => (
            <Badge key={a} tone="warn">
              🏅 {ACHIEVEMENTS[a]?.[lang] ?? a}
            </Badge>
          ))}
        </div>
      )}
      <Card>
        <SectionTitle>{t('teacher.sessions')}</SectionTitle>
        {sessions.length === 0 ? (
          <EmptyState icon="🔎" title={t('teacher.noResults')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('teacher.date')}</th>
                <th>{t('teacher.case')}</th>
                <th>{t('teacher.status')}</th>
                <th>{t('teacher.docsOpened')}</th>
                <th>{t('teacher.evidence')}</th>
                <th>{t('teacher.interviews')}</th>
                <th>{t('teacher.hints')}</th>
                <th>{t('teacher.final')}</th>
                <th>{t('teacher.review')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((x) => (
                <tr key={x.sessionId}>
                  <td className="text-xs whitespace-nowrap">{formatDate(x.startedAt, lang, true)}</td>
                  <td className="font-mono text-xs">{x.caseId}</td>
                  <td>{t(`sessionStatus.${x.status}`)}</td>
                  <td className="tabular-nums">{x.documentsOpened}</td>
                  <td className="tabular-nums">{x.evidenceCollected}</td>
                  <td className="tabular-nums">{x.interviews}</td>
                  <td className="tabular-nums">{x.hintsUsed}</td>
                  <td className="font-semibold tabular-nums">{x.percent === null ? '—' : `${x.percent}%`}</td>
                  <td>
                    {x.status !== 'abandoned' ? (
                      <Link to={`/teacher/sessions/${x.sessionId}`} className="font-semibold text-primary hover:underline">
                        {x.status === 'active' ? t('teacher.open') : x.reviewed ? `✓ ${t('teacher.reviewed')}` : t('teacher.toReview')}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
