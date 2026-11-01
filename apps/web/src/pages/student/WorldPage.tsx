import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorldQuest, Zone } from '../../api/types';
import { isTenantUser } from '../../api/types';
import { useWorld } from '../../api/queries';
import { useAuth } from '../../auth/AuthProvider';
import { Avatar } from '../../components/Avatar';
import { AvatarPicker } from '../../components/AvatarPicker';
import { BadgeShelf, Disclaimer, SkillChip, StreakFlame, XpBar, ZoneArt } from '../../components/game';
import { Button, ButtonLink, Card, EmptyState, ErrorBox, PageSkeleton, SectionTitle, cx } from '../../components/ui';
import { useLocalized } from '../../i18n';
import { formatDate } from '../../lib/format';
import { SKILL_META } from '../../lib/game';

function QuestNode({ q, index }: { q: WorldQuest; index: number }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const icon = q.state === 'completed' ? '✅' : q.state === 'locked' ? '🔒' : q.activeAttemptId ? '⏯️' : '▶️';
  const label = `${q.id} ${L(q.title)} – ${t(`world.state.${q.state}`)}`;
  return (
    <li className={cx('relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center', index % 2 === 1 && 'sm:mt-6')}>
      <Link
        to={`/quests/${q.id}`}
        data-testid={`quest-node-${q.id}`}
        data-state={q.state}
        aria-label={label}
        className={cx(
          'quest-node relative grid h-16 w-16 place-items-center rounded-full border-4 text-2xl shadow-md',
          q.state === 'completed' && 'border-success bg-success-soft',
          q.state === 'open' && 'border-primary bg-surface',
          q.state === 'locked' && 'border-line bg-surface-2 grayscale',
        )}
      >
        <span aria-hidden="true">{icon}</span>
        {q.assigned && (
          <span className="absolute -top-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-xp text-xs text-white shadow" title={t('world.assigned')} aria-hidden="true">
            ★
          </span>
        )}
      </Link>
      <div className="font-mono text-xs font-bold text-muted">
        {q.id} · {q.level}
      </div>
      <div className="line-clamp-2 text-sm leading-tight font-semibold">{L(q.title)}</div>
      <div className="text-xs text-muted">
        {q.bestScore !== null ? t('world.best', { score: q.bestScore }) : t('world.xpReward', { xp: q.xpReward })}
      </div>
      {q.state === 'locked' && q.missing.length > 0 && <div className="text-[11px] text-muted">{t('world.needs', { ids: q.missing.join(', ') })}</div>}
    </li>
  );
}

function ZoneCard({ zone }: { zone: Zone }) {
  const { t } = useTranslation();
  const m = SKILL_META[zone.skill];
  const pct = zone.progress.total ? Math.round((zone.progress.completed / zone.progress.total) * 100) : 0;
  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm" data-testid={`zone-${zone.skill}`} aria-labelledby={`zone-title-${zone.skill}`}>
      <div className={cx('relative h-28 bg-gradient-to-br sm:h-32', m.gradient)}>
        <ZoneArt skill={zone.skill} className="opacity-95" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/55 to-transparent px-4 pt-6 pb-2 text-white">
          <div>
            <h3 id={`zone-title-${zone.skill}`} className="font-display text-xl font-extrabold drop-shadow">
              <span aria-hidden="true">{m.emoji}</span> {zone.zone}
            </h3>
            <p className="text-xs opacity-90">{t(`zones.${zone.skill}`)}</p>
          </div>
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-slate-900 tabular-nums">
            {zone.progress.completed}/{zone.progress.total}
          </span>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('world.zoneProgress', { zone: zone.zone })}>
          <div className={cx('h-full rounded-full bg-gradient-to-r', m.gradient)} style={{ width: `${pct}%` }} />
        </div>
        {zone.quests.length === 0 ? (
          <p className="text-sm text-muted">{t('world.noQuests')}</p>
        ) : (
          <div className="relative">
            <svg className="pointer-events-none absolute top-8 left-0 hidden h-8 w-full sm:block" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
              <path d="M10 2 Q 30 12 50 6 T 90 6" fill="none" stroke="var(--vq-line)" strokeWidth="1.2" className="quest-path" vectorEffect="non-scaling-stroke" />
            </svg>
            <ol className="relative flex gap-3">
              {zone.quests.map((q, i) => (
                <QuestNode key={q.id} q={q} index={i} />
              ))}
            </ol>
          </div>
        )}
      </div>
    </article>
  );
}

export default function WorldPage() {
  const { t } = useTranslation();
  const { L, lang } = useLocalized();
  const { me, role } = useAuth();
  const q = useWorld();
  const [picker, setPicker] = useState(false);
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const w = q.data;
  const user = isTenantUser(me?.user) ? me.user : null;
  const name = user?.displayName ?? '';
  const questTitle = (id: string) => L(w.zones.flatMap((z) => z.quests).find((x) => x.id === id)?.title) || id;
  const examTitle = (id: string) => L(w.exams.find((x) => x.id === id)?.title) || id;
  const path = [...w.assignments].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <section className="world-sky relative overflow-hidden rounded-3xl border border-line p-4 shadow-sm sm:p-6" aria-labelledby="world-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button type="button" onClick={() => setPicker(true)} className="group relative self-center rounded-full sm:self-auto" aria-label={t('avatar.change')} data-testid="open-avatar">
            <span className="float block">
              <Avatar avatar={w.player.avatar?.id} outfit={w.player.avatar?.outfit} name={name} size={104} className="ring-4 ring-white/80" />
            </span>
            <span className="absolute -right-1 bottom-1 grid h-8 w-8 place-items-center rounded-full bg-surface text-sm shadow group-hover:bg-primary-soft" aria-hidden="true">
              🎨
            </span>
          </button>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('world.welcome')}</p>
              <h1 id="world-title" className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                {name || t('world.title')}
              </h1>
            </div>
            <div className="rounded-2xl bg-surface/85 p-3 backdrop-blur">
              <XpBar xp={w.player.xp} />
            </div>
          </div>
          <div className="flex gap-2 sm:flex-col">
            <StreakFlame days={w.player.streak?.days ?? 0} />
            <div className="flex items-center gap-2 rounded-2xl bg-surface/85 px-3 py-2">
              <span className="text-2xl" aria-hidden="true">
                🏅
              </span>
              <div className="leading-tight">
                <div className="font-display text-lg font-extrabold tabular-nums">{w.player.badges.length}</div>
                <div className="text-xs text-muted">{t('game.badges')}</div>
              </div>
            </div>
          </div>
        </div>
        {!w.player.avatar && role === 'student' && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface/90 p-3" data-testid="create-character">
            <p className="text-sm">
              <strong>{t('avatar.createPromptTitle')}</strong> {t('avatar.createPrompt')}
            </p>
            <Button size="sm" onClick={() => setPicker(true)}>
              {t('avatar.titleCreate')}
            </Button>
          </div>
        )}
      </section>

      {path.length > 0 && (
        <Card>
          <SectionTitle>
            <span aria-hidden="true">🗺️</span> {t('world.learningPath')}
          </SectionTitle>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {path.map((a, i) => (
              <li key={a.id}>
                <Link
                  to={a.kind === 'quest' ? `/quests/${a.refId}?assignment=${a.id}` : `/exams/${a.refId}?assignment=${a.id}`}
                  className={cx('flex h-full items-start gap-3 rounded-2xl border p-3 transition hover:border-primary', a.done ? 'border-success/40 bg-success-soft/50' : 'border-line')}
                >
                  <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold', a.done ? 'bg-success text-white' : 'bg-primary-soft text-primary')}>{a.done ? '✓' : i + 1}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {a.kind === 'quest' ? questTitle(a.refId) : examTitle(a.refId)} <span className="font-mono text-xs text-muted">{a.refId}</span>
                    </span>
                    {a.dueAt && <span className="block text-xs text-muted">{t('world.due', { date: formatDate(a.dueAt, lang) })}</span>}
                    {a.note && <span className="block text-xs text-muted">{a.note}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <section aria-labelledby="zones-title">
        <h2 id="zones-title" className="mb-3 font-display text-xl font-extrabold">
          {t('world.zonesTitle')}
        </h2>
        {w.zones.every((z) => z.quests.length === 0) ? (
          <EmptyState icon="🗺️" title={t('world.noQuests')} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {w.zones.map((z) => (
              <ZoneCard key={z.skill} zone={z} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>
            <span aria-hidden="true">🏅</span> {t('game.badges')}
          </SectionTitle>
          <BadgeShelf earned={w.player.badges} />
          <p className="mt-3 text-xs text-muted">{t('game.badgesNote')}</p>
        </Card>
        <Card className="flex flex-col">
          <SectionTitle>
            <span aria-hidden="true">🎓</span> {t('nav.exams')}
          </SectionTitle>
          {w.exams.length === 0 ? (
            <p className="text-sm text-muted">{t('exam.none')}</p>
          ) : (
            <ul className="space-y-2">
              {w.exams.map((e) => (
                <li key={e.id} className="rounded-2xl border border-line p-3">
                  <div className="font-semibold">{L(e.title)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {e.sections.map((s) => (
                      <SkillChip key={s.skill} skill={s.skill} />
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-muted">{t('common.minutes', { count: e.totalMinutes })}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto pt-3">
            <ButtonLink to="/exams" variant="secondary" size="sm">
              {t('exam.goToExams')}
            </ButtonLink>
          </div>
        </Card>
      </div>
      <Disclaimer />
      {user && <AvatarPicker open={picker} onClose={() => setPicker(false)} user={user} level={w.player.level} />}
    </div>
  );
}
