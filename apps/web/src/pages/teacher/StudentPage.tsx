import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { TeacherStudentDetail } from '../../api/types';
import { useLocalized } from '../../i18n';
import { formatDate } from '../../lib/format';
import { BadgeShelf } from '../../components/game';
import { ButtonLink, Card, EmptyState, ErrorBox, LevelBadge, PageHeader, PageSkeleton, SectionTitle, StatCard, Table } from '../../components/ui';
import { ProfileView } from '../../results/ProfileView';
import { AttemptStatusBadge } from '../student/HistoryPage';

export default function StudentPage() {
  const { uid = '' } = useParams();
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const q = useQuery({ queryKey: ['teacher-student', uid], queryFn: () => api.get<TeacherStudentDetail>(`/api/teacher/students/${uid}`) });
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const { student: s, profile, attempts } = q.data;
  return (
    <div className="space-y-6">
      <ButtonLink to="/teacher" variant="ghost" size="sm" className="-ml-3">
        ← {t('teacher.title')}
      </ButtonLink>
      <PageHeader title={s.displayName} subtitle={`${s.studentCode ? `${s.studentCode} · ` : ''}${s.email}`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('teacher.level')} value={<LevelBadge level={s.level} />} />
        <StatCard label="XP" value={s.xp} />
        <StatCard label={t('game.streak')} value={`🔥 ${s.streak?.days ?? 0}`} />
      </div>
      <Card>
        <SectionTitle>🏅 {t('game.badges')}</SectionTitle>
        <BadgeShelf earned={s.badges} />
      </Card>
      <ProfileView data={profile} resultLink={(id) => `/teacher/attempts/${id}`} />
      <Card>
        <SectionTitle>🕘 {t('history.title')}</SectionTitle>
        {attempts.length === 0 ? (
          <EmptyState icon="🕘" title={t('history.empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('history.activity')}</th>
                <th>{t('history.mode')}</th>
                <th>{t('history.status')}</th>
                <th>{t('history.started')}</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.status === 'graded' || a.status === 'submitted' || a.status === 'grading' ? (
                      <Link to={`/teacher/attempts/${a.id}`} className="font-semibold text-primary hover:underline">
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
                  <td>{formatDate(a.startedAt, lang, true)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
