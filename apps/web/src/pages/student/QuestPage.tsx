import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { qk, useSetAttemptView, useWorld } from '../../api/queries';
import type { QuestSummary, StartResponse, StudentChampionship } from '../../api/types';
import { SkillChip, ZoneArt } from '../../components/game';
import { Alert, Badge, Button, Card, ConfirmModal, ErrorBox, LevelBadge, PageSkeleton, cx } from '../../components/ui';
import { useLocalized } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { SKILL_META } from '../../lib/game';

export default function QuestPage() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const assignmentId = sp.get('assignment') ?? undefined;
  const championshipId = sp.get('championship') ?? undefined;
  const { t } = useTranslation();
  const { L } = useLocalized();
  const nav = useNavigate();
  const qc = useQueryClient();
  const setView = useSetAttemptView();
  const [confirmRestart, setConfirmRestart] = useState(false);
  const q = useQuery({ queryKey: ['quest', id], queryFn: () => api.get<{ quest: QuestSummary }>(`/api/quests/${id}`) });
  const world = useWorld();
  const champs = useQuery({
    queryKey: ['championships'],
    queryFn: () => api.get<{ championships: StudentChampionship[] }>('/api/championships'),
    enabled: Boolean(championshipId),
  });

  const start = useMutation({
    mutationFn: (restart: boolean) => api.post<StartResponse>('/api/attempts', { questId: id, ...(assignmentId ? { assignmentId } : {}), ...(championshipId ? { championshipId } : {}), ...(restart ? { restart } : {}) }),
    onSuccess: (r) => {
      setView(r);
      void qc.invalidateQueries({ queryKey: qk.world });
      nav(r.attempt.status === 'active' ? `/play/${r.attempt.id}` : `/results/${r.attempt.id}`);
    },
  });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const quest = q.data.quest;
  const wq = world.data?.zones.flatMap((z) => z.quests).find((x) => x.id === id);
  const champ = champs.data?.championships.find((c) => c.id === championshipId);
  const locked = !championshipId && wq?.state === 'locked';
  const active = !championshipId ? wq?.activeAttemptId : null;
  const m = SKILL_META[quest.skill];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to={championshipId ? '/championships' : '/world'} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
        ← {championshipId ? t('nav.championships') : t('nav.world')}
      </Link>
      <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        <div className={cx('relative h-36 bg-gradient-to-br sm:h-44', m.gradient)}>
          <ZoneArt skill={quest.skill} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-5 pt-8 pb-3 text-white">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-full bg-white/90 px-2 py-0.5 font-mono text-slate-900">{quest.id}</span>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-900">{quest.level}</span>
              {wq?.state === 'completed' && <span className="rounded-full bg-emerald-500 px-2 py-0.5">✓ {t('world.state.completed')}</span>}
            </div>
            <h1 className="mt-1 font-display text-2xl font-extrabold drop-shadow sm:text-3xl">{L(quest.title)}</h1>
          </div>
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_16rem]">
          <div className="space-y-4">
            {champ && (
              <Alert tone="primary">
                🏆 {t('quest.inChampionship', { name: champ.name })} {champ.allowHelp ? t('quest.helpOn') : t('quest.helpOff')}
              </Alert>
            )}
            <p className="text-lg font-medium">{L(quest.summary)}</p>
            <p className="text-muted">{L(quest.story)}</p>
            <div>
              <h2 className="mb-2 font-semibold">{t('quest.objectives')}</h2>
              <ul className="space-y-1.5">
                {quest.objectives.map((o, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true">🎯</span>
                    {L(o)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="mb-2 font-semibold">{t('quest.challenges')}</h2>
              <ol className="space-y-2">
                {quest.challenges.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2">
                    <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full font-bold', m.soft, m.text)}>{i + 1}</span>
                    <span lang="en">{c.title}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <aside className="space-y-3">
            <Card className="space-y-2 p-4">
              <div className="flex flex-wrap gap-1.5">
                <SkillChip skill={quest.skill} />
                <LevelBadge level={quest.level} />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted">{t('quest.time')}</dt>
                <dd className="text-right font-semibold">{t('common.minutes', { count: quest.estimatedMinutes })}</dd>
                <dt className="text-muted">{t('quest.reward')}</dt>
                <dd className="text-right font-semibold text-xp">+{quest.xpReward} XP</dd>
                <dt className="text-muted">{t('quest.pass')}</dt>
                <dd className="text-right font-semibold">{quest.passPercent}%</dd>
                {wq?.bestScore !== null && wq?.bestScore !== undefined && (
                  <>
                    <dt className="text-muted">{t('quest.best')}</dt>
                    <dd className="text-right font-semibold">{wq.bestScore}</dd>
                  </>
                )}
              </dl>
              {quest.requires.length > 0 && (
                <p className="text-xs text-muted">
                  {t('quest.requires')}{' '}
                  {quest.requires.map((r) => (
                    <Badge key={r} tone={wq?.missing.includes(r) ? 'warn' : 'success'} className="mr-1 font-mono">
                      {r}
                    </Badge>
                  ))}
                </p>
              )}
            </Card>
            {locked ? (
              <Alert tone="warn">🔒 {t('quest.locked', { ids: wq?.missing.join(', ') ?? '' })}</Alert>
            ) : (
              <div className="flex flex-col gap-2">
                <Button size="lg" data-testid="quest-start" loading={start.isPending && !start.variables} onClick={() => start.mutate(false)}>
                  {active ? t('quest.continue') : wq?.state === 'completed' ? t('quest.playAgain') : t('quest.start')}
                </Button>
                {active && (
                  <Button variant="secondary" onClick={() => setConfirmRestart(true)} data-testid="quest-restart">
                    {t('quest.restart')}
                  </Button>
                )}
              </div>
            )}
            {start.isError && <Alert tone="danger">{errorMessage(t, start.error)}</Alert>}
          </aside>
        </div>
      </article>
      <ConfirmModal
        open={confirmRestart}
        onClose={() => setConfirmRestart(false)}
        onConfirm={() => {
          setConfirmRestart(false);
          start.mutate(true);
        }}
        title={t('quest.restartTitle')}
        confirmLabel={t('quest.restart')}
        tone="danger"
      >
        <p>{t('quest.restartBody')}</p>
      </ConfirmModal>
    </div>
  );
}
