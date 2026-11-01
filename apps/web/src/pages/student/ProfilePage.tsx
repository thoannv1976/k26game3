import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { ProfileResponse, ProfileSummary } from '../../api/types';
import { BadgeShelf, StreakFlame, XpBar } from '../../components/game';
import { Alert, Button, Card, ErrorBox, PageHeader, PageSkeleton, SectionTitle } from '../../components/ui';
import { useLocalized } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { formatDate } from '../../lib/format';
import { ProfileView } from '../../results/ProfileView';

export function SummaryCard({ summary, generatedAt }: { summary: ProfileSummary; generatedAt: string | null }) {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  return (
    <div className="space-y-3" data-testid="ai-summary">
      <p className="whitespace-pre-line">{summary.summary}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {(
          [
            ['strengths', 'bg-success-soft', 'text-success', '💪', summary.strengths],
            ['focusAreas', 'bg-warn-soft', 'text-warn', '🎯', summary.focusAreas],
            ['plan', 'bg-primary-soft/70', 'text-primary', '🗓️', summary.plan],
          ] as const
        )
          .filter(([, , , , list]) => list.length > 0)
          .map(([key, bg, fg, icon, list]) => (
            <div key={key} className={`rounded-xl p-3 ${bg}`}>
              <h3 className={`text-sm font-semibold ${fg}`}>
                {icon} {t(`profile.${key}`)}
              </h3>
              <ul className={`mt-1 pl-5 text-sm ${key === 'plan' ? 'list-decimal' : 'list-disc'}`}>
                {list.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      {generatedAt && <p className="text-xs text-muted">{t('profile.generatedAt', { date: formatDate(generatedAt, lang, true) })}</p>}
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile'], queryFn: () => api.get<ProfileResponse>('/api/profile') });
  const gen = useMutation({
    mutationFn: () => api.post<{ summary: ProfileSummary; generatedAt: string }>('/api/profile/summary'),
    onSuccess: (r) => qc.setQueryData<ProfileResponse>(['profile'], (old) => (old ? { ...old, summary: { summary: r.summary, generatedAt: r.generatedAt } } : old)),
  });
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-5">
      <PageHeader title={<>📊 {t('profile.title')}</>} subtitle={t('profile.subtitle')} />
      {d.user && (
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <Card>
            <XpBar xp={d.user.xp} />
            <div className="mt-4">
              <BadgeShelf earned={d.user.badges} />
            </div>
          </Card>
          <div className="flex md:flex-col">
            <StreakFlame days={d.user.streak?.days ?? 0} />
          </div>
        </div>
      )}
      <Card>
        <SectionTitle
          actions={
            <Button size="sm" onClick={() => gen.mutate()} loading={gen.isPending} data-testid="ai-summary-btn">
              🤖 {d.summary.summary ? t('profile.refreshSummary') : t('profile.aiSummary')}
            </Button>
          }
        >
          🤖 {t('profile.aiSummaryTitle')}
        </SectionTitle>
        {gen.isError && <Alert tone="danger" className="mb-3">{errorMessage(t, gen.error)}</Alert>}
        {d.summary.summary ? <SummaryCard summary={d.summary.summary} generatedAt={d.summary.generatedAt} /> : <p className="text-sm text-muted">{t('profile.aiSummaryHint')}</p>}
      </Card>
      <ProfileView data={d} resultLink={(id) => `/results/${id}`} />
    </div>
  );
}
