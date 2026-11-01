import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Skill } from '@vq/shared';
import { BADGES, BADGE_EMOJI, SKILL_META, levelProgress } from '../lib/game';
import { useLocalized } from '../i18n';
import { cx } from './ui';

export function SkillChip({ skill, className }: { skill: Skill; className?: string }) {
  const { t } = useTranslation();
  const m = SKILL_META[skill];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold', m.soft, m.text, className)}>
      <span aria-hidden="true">{m.emoji}</span>
      {t(`skills.${skill}`)}
    </span>
  );
}

/** Player level + XP progress inside the level. */
export function XpBar({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const { t } = useTranslation();
  const p = levelProgress(xp);
  return (
    <div className={cx('w-full', compact ? 'space-y-1' : 'space-y-1.5')} data-testid="xp-bar">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-display font-extrabold">
          {t('game.level', { level: p.level })}
        </span>
        <span className="text-xs text-muted tabular-nums">
          {t('game.xpToNext', { xp, next: p.nextAt })}
        </span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line"
        role="progressbar"
        aria-valuemin={p.start}
        aria-valuemax={p.nextAt}
        aria-valuenow={xp}
        aria-label={t('game.xpLabel', { level: p.level })}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 transition-all" style={{ width: `${Math.round(p.ratio * 100)}%` }} />
      </div>
    </div>
  );
}

export function StreakFlame({ days }: { days: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-xp-soft px-3 py-2" title={t('game.streakHint')}>
      <span className={cx('text-2xl', days > 0 && 'flame')} aria-hidden="true">
        {days > 0 ? '🔥' : '🪵'}
      </span>
      <div className="leading-tight">
        <div className="font-display text-lg font-extrabold tabular-nums">{days}</div>
        <div className="text-xs text-muted">{t('game.streakDays', { count: days })}</div>
      </div>
    </div>
  );
}

export function badgeName(id: string, lang: 'vi' | 'en'): string {
  return BADGES[id]?.[lang] ?? id;
}

/** All game badges: earned ones in colour, the others greyed out (game achievements, not certificates). */
export function BadgeShelf({ earned, highlight = [] }: { earned: string[]; highlight?: string[] }) {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const ids = Object.keys(BADGES);
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label={t('game.badges')}>
      {ids.map((id) => {
        const has = earned.includes(id);
        return (
          <li
            key={id}
            className={cx(
              'flex flex-col items-center gap-1 rounded-2xl border p-2 text-center',
              has ? 'border-xp/50 bg-xp-soft' : 'border-dashed border-line opacity-60',
              highlight.includes(id) && 'pop-in ring-2 ring-xp',
            )}
            title={badgeName(id, lang)}
          >
            <span className={cx('text-2xl', !has && 'grayscale')} aria-hidden="true">
              {has ? BADGE_EMOJI[id] ?? '🏅' : '🔒'}
            </span>
            <span className="line-clamp-2 text-[11px] leading-tight font-semibold">{badgeName(id, lang)}</span>
            <span className="sr-only">{has ? t('game.badgeEarned') : t('game.badgeLocked')}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Circular score (0–100). A null score is shown as a label, never as a number. */
export function ScoreRing({ score, label, size = 120, tone = 'primary', nullLabel }: { score: number | null; label?: string; size?: number; tone?: 'primary' | 'success' | 'warn'; nullLabel: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const color = { primary: 'var(--vq-primary)', success: 'var(--vq-success)', warn: 'var(--vq-warn)' }[tone];
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={score === null ? `${label ?? ''} ${nullLabel}` : `${label ?? ''} ${score}/100`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--vq-surface-2)" strokeWidth="10" />
        {score !== null && (
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
        )}
        {score === null ? (
          <text x="50" y="55" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--vq-muted)">
            —
          </text>
        ) : (
          <text x="50" y="57" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--vq-fg)">
            {score}
          </text>
        )}
      </svg>
      {label && <div className="text-sm font-semibold">{label}</div>}
      {score === null && <div className="text-xs text-muted">{nullLabel}</div>}
    </div>
  );
}

/** Small celebration burst (decorative, hidden from screen readers, disabled with reduced motion). */
export function Confetti({ pieces = 26 }: { pieces?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 7) * 0.12}s`,
        color: ['#f59e0b', '#0ea5e9', '#8b5cf6', '#f43f5e', '#22c55e'][i % 5],
      })),
    [pieces],
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden" aria-hidden="true">
      {items.map((p, i) => (
        <span key={i} className="confetti-piece" style={{ left: p.left, animationDelay: p.delay, background: p.color }} />
      ))}
    </div>
  );
}

/** "Practice result – not an official VSTEP score" notice. */
export function Disclaimer({ className, children }: { className?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <p className={cx('flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-muted', className)} data-testid="disclaimer">
      <span aria-hidden="true">ℹ️</span>
      <span>{children ?? t('game.disclaimer')}</span>
    </p>
  );
}

/** Illustrated zone scenes (inline SVG, no external images). */
export function ZoneArt({ skill, className }: { skill: Skill; className?: string }) {
  const common = { viewBox: '0 0 200 100', className: cx('h-full w-full', className), 'aria-hidden': true as const, preserveAspectRatio: 'xMidYMid slice' };
  switch (skill) {
    case 'listening':
      return (
        <svg {...common}>
          <rect width="200" height="100" fill="#7dd3fc" />
          <circle cx="168" cy="22" r="11" fill="#fef08a" />
          <path d="M0 70q25-8 50 0t50 0 50 0 50 0v30H0z" fill="#0ea5e9" />
          <path d="M0 80q25-7 50 0t50 0 50 0 50 0v20H0z" fill="#0284c7" />
          <ellipse cx="82" cy="72" rx="44" ry="11" fill="#fde68a" />
          <path d="M84 70c2-18 6-30 14-40" stroke="#92400e" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M98 30c-14-4-24 2-28 8 10-4 18-4 28-8zM98 30c4-12 16-14 24-10-10 0-17 4-24 10zM98 30c12-2 22 4 24 12-8-6-15-9-24-12zM98 30c-6-10-18-12-26-6 10 0 18 2 26 6z" fill="#22c55e" />
          <path d="M140 46a14 14 0 0 1 0 20M147 40a22 22 0 0 1 0 32M154 34a30 30 0 0 1 0 44" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />
        </svg>
      );
    case 'reading':
      return (
        <svg {...common}>
          <rect width="200" height="100" fill="#c4b5fd" />
          <circle cx="30" cy="20" r="9" fill="#fff" opacity="0.7" />
          <path d="M0 82q50-14 100-6t100-4v28H0z" fill="#7c3aed" opacity="0.55" />
          <g fill="#ede9fe" stroke="#5b21b6" strokeWidth="2">
            <rect x="62" y="42" width="76" height="44" />
            <rect x="52" y="28" width="22" height="58" />
            <rect x="126" y="28" width="22" height="58" />
            <rect x="88" y="20" width="24" height="66" />
          </g>
          <path d="M52 28h22l-11-12zM126 28h22l-11-12zM88 20h24l-12-14z" fill="#8b5cf6" />
          <path d="M100 6v-6M100 0l10 3-10 3" stroke="#5b21b6" strokeWidth="1.5" fill="#f43f5e" />
          <path d="M92 86V68a8 8 0 0 1 16 0v18z" fill="#5b21b6" />
          <rect x="58" y="44" width="10" height="12" rx="5" fill="#fde68a" />
          <rect x="132" y="44" width="10" height="12" rx="5" fill="#fde68a" />
        </svg>
      );
    case 'writing':
      return (
        <svg {...common}>
          <rect width="200" height="100" fill="#fde68a" />
          <path d="M0 86h200v14H0z" fill="#d97706" opacity="0.5" />
          <path d="M50 40l50-24 50 24z" fill="#b45309" />
          <rect x="54" y="40" width="92" height="8" fill="#fef3c7" stroke="#92400e" strokeWidth="1.5" />
          <g fill="#fffbeb" stroke="#92400e" strokeWidth="1.5">
            <rect x="60" y="48" width="9" height="34" />
            <rect x="80" y="48" width="9" height="34" />
            <rect x="111" y="48" width="9" height="34" />
            <rect x="131" y="48" width="9" height="34" />
          </g>
          <rect x="50" y="82" width="100" height="6" fill="#92400e" />
          <path d="M165 20c-14 10-22 26-24 44l6-4c2-16 10-30 18-40z" fill="#fff" stroke="#92400e" strokeWidth="1.5" />
          <path d="M141 64l-3 8 7-5" fill="#1a1d3a" />
        </svg>
      );
    case 'speaking':
    default:
      return (
        <svg {...common}>
          <rect width="200" height="100" fill="#fda4af" />
          <path d="M30 0l30 70H40zM170 0l-30 70h20z" fill="#fff" opacity="0.35" />
          <path d="M20 90c0-34 36-54 80-54s80 20 80 54z" fill="#e11d48" />
          <g fill="#fecdd3">
            {[40, 62, 84, 106, 128, 150].map((x) => (
              <path key={x} d={`M${x} 88v-18a8 8 0 0 1 16 0v18z`} />
            ))}
          </g>
          <rect x="94" y="14" width="12" height="22" rx="6" fill="#1a1d3a" />
          <path d="M88 28a12 12 0 0 0 24 0M100 40v8" stroke="#1a1d3a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M70 18l-6-4M130 18l6-4M74 30h-8M126 30h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export function StatPill({ icon, label, value }: { icon: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2">
      <span className="text-xl" aria-hidden="true">
        {icon}
      </span>
      <div className="leading-tight">
        <div className="font-display text-lg font-extrabold tabular-nums">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}
