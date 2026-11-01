import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SKILLS, type Skill } from '@vq/shared';
import type { HistoryEntry, ProfileResponse, ProfileSkill } from '../api/types';
import { Disclaimer, SkillChip } from '../components/game';
import { Badge, Card, EmptyState, SectionTitle, cx } from '../components/ui';
import { useLocalized } from '../i18n';
import { formatDate } from '../lib/format';
import { SKILL_META } from '../lib/game';

/** Four-axis radar of the skill scores; skills without enough data are drawn dashed at their value (or 0). */
export function SkillRadar({ skills }: { skills: ProfileSkill[] }) {
  const { t } = useTranslation();
  const cx0 = 110;
  const cy0 = 110;
  const R = 80;
  // Listening top, Reading right, Writing bottom, Speaking left.
  const angle = (i: number) => -Math.PI / 2 + (i * Math.PI) / 2;
  const pt = (i: number, v: number) => [cx0 + Math.cos(angle(i)) * R * (v / 100), cy0 + Math.sin(angle(i)) * R * (v / 100)] as const;
  const ordered = SKILLS.map((s) => skills.find((x) => x.skill === s) ?? { skill: s, score: null, sufficient: false, entries: 0, trend: null });
  const poly = ordered.map((s, i) => pt(i, s.score ?? 0).join(',')).join(' ');
  const labelPos = [
    [cx0, 16, 'middle'],
    [208, cy0 + 4, 'end'],
    [cx0, 214, 'middle'],
    [12, cy0 + 4, 'start'],
  ] as const;
  return (
    <svg viewBox="0 0 220 224" className="mx-auto w-full max-w-xs" role="img" aria-label={t('profile.radarLabel', { values: ordered.map((s) => `${t(`skills.${s.skill}`)} ${s.score ?? '—'}`).join(', ') })}>
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={SKILLS.map((_, i) => pt(i, v).join(',')).join(' ')} fill="none" stroke="var(--vq-line)" strokeWidth="1" />
      ))}
      {SKILLS.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={cx0} y1={cy0} x2={x} y2={y} stroke="var(--vq-line)" />;
      })}
      <polygon points={poly} fill="var(--vq-primary)" fillOpacity="0.18" stroke="var(--vq-primary)" strokeWidth="2.5" strokeLinejoin="round" />
      {ordered.map((s, i) => {
        const [x, y] = pt(i, s.score ?? 0);
        return <circle key={s.skill} cx={x} cy={y} r="5" fill={s.sufficient ? SKILL_META[s.skill].color : 'var(--vq-surface)'} stroke={SKILL_META[s.skill].color} strokeWidth="2.5" strokeDasharray={s.sufficient ? undefined : '2 2'} />;
      })}
      {ordered.map((s, i) => {
        const [x, y, anchor] = labelPos[i]!;
        return (
          <text key={s.skill} x={x} y={y} textAnchor={anchor} fontSize="11" fontWeight="700" fill="var(--vq-fg)">
            {SKILL_META[s.skill].emoji} {s.score ?? '—'}
          </text>
        );
      })}
    </svg>
  );
}

/** Score per result over time, one line per skill (only results that have a score). */
export function ProgressChart({ history }: { history: HistoryEntry[] }) {
  const { t } = useTranslation();
  const W = 520;
  const H = 180;
  const pad = 28;
  const n = history.length;
  if (n < 2) return <p className="text-sm text-muted">{t('profile.needMoreResults')}</p>;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (n - 1);
  const y = (v: number) => H - pad - (v / 100) * (H - pad * 2);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full sm:h-56" role="img" aria-label={t('profile.progressLabel')}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={pad} x2={W - pad} y1={y(v)} y2={y(v)} stroke="var(--vq-line)" strokeDasharray={v === 50 ? '4 4' : undefined} />
            <text x={4} y={y(v) + 4} fontSize="10" fill="var(--vq-muted)">
              {v}
            </text>
          </g>
        ))}
        {SKILLS.map((s) => {
          const pts = history.map((h, i) => ({ i, v: h.skills.find((k) => k.skill === s)?.score ?? null })).filter((p): p is { i: number; v: number } => p.v !== null);
          if (!pts.length) return null;
          return (
            <g key={s}>
              <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke={SKILL_META[s].color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => (
                <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="3.5" fill={SKILL_META[s].color} />
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-3 text-xs">
        {SKILLS.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SKILL_META[s].color }} aria-hidden="true" />
            {t(`skills.${s}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProfileView({ data, resultLink }: { data: ProfileResponse; resultLink: (id: string) => string }) {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const p = data.profile;
  const mistakes = Object.entries(data.mistakes).sort((a, b) => b[1].wrong / Math.max(1, b[1].total) - a[1].wrong / Math.max(1, a[1].total));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <SectionTitle>🧭 {t('profile.fourSkills')}</SectionTitle>
          <SkillRadar skills={p.skills} />
          <div className="mt-3 text-center">
            {p.overall !== null ? (
              <p className="font-display text-lg font-extrabold" data-testid="profile-overall">
                {t('profile.overall', { score: p.overall })}
              </p>
            ) : (
              <p className="text-sm text-muted">{t('profile.overallNeedsAll')}</p>
            )}
          </div>
        </Card>
        <Card>
          <SectionTitle>📊 {t('profile.bySkill')}</SectionTitle>
          <ul className="space-y-3">
            {SKILLS.map((s: Skill) => {
              const k = p.skills.find((x) => x.skill === s);
              return (
                <li key={s} data-testid={`profile-skill-${s}`}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <SkillChip skill={s} />
                    <span className="flex items-center gap-2">
                      {k?.trend !== null && k?.trend !== undefined && k.trend !== 0 && <span className={cx('text-xs font-semibold', k.trend > 0 ? 'text-success' : 'text-danger')}>{k.trend > 0 ? `▲ ${k.trend}` : `▼ ${-k.trend}`}</span>}
                      {k?.score !== null && k?.score !== undefined ? <span className="font-bold tabular-nums">{k.score}</span> : <span className="text-muted">—</span>}
                      {!k?.sufficient && <Badge tone="warn">{t('profile.notEnough')}</Badge>}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={cx('h-full rounded-full bg-gradient-to-r', SKILL_META[s].gradient, !k?.sufficient && 'opacity-50')} style={{ width: `${k?.score ?? 0}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{t('profile.entries', { count: k?.entries ?? 0 })}</p>
                </li>
              );
            })}
          </ul>
          {p.weakest && (
            <p className="mt-4 rounded-xl bg-primary-soft/60 px-3 py-2 text-sm">
              💡 {t('profile.weakest', { skill: t(`skills.${p.weakest}`) })}
            </p>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>📈 {t('profile.progress')}</SectionTitle>
        <ProgressChart history={data.history} />
        {data.history.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">{t('profile.historyTable')}</summary>
            <ul className="mt-2 divide-y divide-line text-sm">
              {[...data.history].reverse().map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link to={resultLink(h.id)} className="font-semibold text-primary hover:underline">
                    {h.title}
                  </Link>
                  <span className="flex items-center gap-2 text-muted">
                    {h.score !== null ? <span className="font-bold text-fg tabular-nums">{h.score}</span> : <Badge tone="warn">{t('results.pendingTeacher')}</Badge>}
                    {formatDate(h.at, lang)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>🧩 {t('profile.mistakes')}</SectionTitle>
          {mistakes.length === 0 ? (
            <p className="text-sm text-muted">{t('profile.noMistakeData')}</p>
          ) : (
            <ul className="space-y-2">
              {mistakes.map(([k, v]) => {
                const [skill, type] = k.split(':') as [Skill, string];
                const pct = v.total ? Math.round((v.wrong / v.total) * 100) : 0;
                return (
                  <li key={k}>
                    <div className="mb-0.5 flex justify-between text-sm">
                      <span>
                        {SKILL_META[skill]?.emoji} {t(`skills.${skill}`)} · {t(`question.types.${type}`, { defaultValue: type })}
                      </span>
                      <span className="text-muted tabular-nums">{t('profile.wrongOf', { wrong: v.wrong, total: v.total })}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className={cx('h-full rounded-full', pct >= 50 ? 'bg-danger' : pct >= 25 ? 'bg-warn' : 'bg-success')} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {data.recentMistakes.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">{t('profile.recentMistakes')}</summary>
              <ul className="mt-2 space-y-1 text-sm" lang="en">
                {data.recentMistakes.map((m, i) => (
                  <li key={i} className="rounded-lg bg-surface-2 px-2 py-1">
                    <span className="text-xs text-muted">{m.topic}</span> – {m.prompt}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
        <Card>
          <SectionTitle>🔗 {t('profile.external')}</SectionTitle>
          {data.external.sources.length === 0 && data.external.items.length === 0 ? (
            <EmptyState icon="🔗" title={t('profile.noExternal')}>
              {t('profile.noExternalBody')}
            </EmptyState>
          ) : (
            <div className="space-y-3">
              <ul className="flex flex-wrap gap-2 text-xs">
                {data.external.sources.map((s) => (
                  <li key={s.source}>
                    <Badge tone={s.ok ? 'success' : 'danger'}>
                      {s.source}: {s.ok ? t('profile.items', { count: s.count }) : t('profile.sourceError')}
                    </Badge>
                  </li>
                ))}
              </ul>
              <ul className="divide-y divide-line text-sm">
                {data.external.items.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-semibold">{e.title}</span> <span className="text-xs text-muted">({e.source})</span>
                      <span className="ml-1 text-xs text-muted">{e.skills.join(', ')}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold tabular-nums">{Math.round(e.finalPercent)}%</span>
                      {e.scoreType === 'teacher_validated' && <Badge tone="success">{t('profile.validated')}</Badge>}
                      <span className="text-xs text-muted">{formatDate(e.at, lang)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
      <Disclaimer>{t('profile.disclaimer')}</Disclaimer>
    </div>
  );
}
