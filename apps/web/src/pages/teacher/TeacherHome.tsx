import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { TeacherClass } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { EmptyState, ErrorBox, PageHeader, Skeleton } from '../../components/ui';

export default function TeacherHome() {
  const { t } = useTranslation();
  const { me, role } = useAuth();
  const q = useQuery({ queryKey: ['teacher-classes'], queryFn: () => api.get<{ classes: TeacherClass[] }>('/api/teacher/classes') });
  return (
    <div>
      <PageHeader title={t('teacher.title')} subtitle={me?.tenant?.name} />
      {q.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.classes.length === 0 ? (
        <EmptyState icon="🏫" title={t('teacher.noClasses')}>
          {role === 'school_admin' ? t('teacher.noClassesAdmin') : t('teacher.noClassesBody')}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.classes.map((c) => (
            <li key={c.id}>
              <Link
                to={`/teacher/classes/${c.id}`}
                data-testid={`teacher-class-${c.id}`}
                className="block h-full rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
              >
                <div className="text-xs font-semibold tracking-wide text-muted uppercase">{c.code}</div>
                <div className="mt-1 text-lg font-bold">{c.name}</div>
                <div className="mt-3 flex gap-4 text-sm text-muted">
                  <span>👩‍🎓 {t('teacher.studentCount', { count: c.studentCount })}</span>
                  <span>👩‍🏫 {t('teacher.teacherCount', { count: c.teacherCount })}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
