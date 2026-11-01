import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, qs } from '../../api/client';
import type { UsageReport } from '../../api/types';
import { errorMessage } from '../../i18n/errors';
import { downloadBlob, formatUsd, monthKeyNow } from '../../lib/format';
import { Alert, Button, Card, EmptyState, ErrorBox, Field, Input, PageSkeleton, ProgressBar, SectionTitle, StatCard, Table } from '../../components/ui';
import { useToast } from '../../components/Toast';

const KINDS = ['character', 'assistant', 'grade', 'generate', 'ping'];

interface DayPoint {
  day: string;
  label: number;
  calls: number;
  costUsd: number;
}

/** Single-series daily cost bar chart (one hue, rounded tops, hover tooltip, table fallback). */
function DailyBars({ points }: { points: DayPoint[] }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const W = 960;
  const H = 240;
  const pad = { l: 70, r: 8, t: 12, b: 28 };
  const max = Math.max(...points.map((p) => p.costUsd), 0.0001);
  const nice = (() => {
    const exp = Math.pow(10, Math.floor(Math.log10(max)));
    const f = max / exp;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  })();
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / points.length;
  const bw = Math.max(2, slot - 2);
  const y = (v: number) => pad.t + ih - (v / nice) * ih;
  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t('admin.usage.chartLabel')} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--ed-line)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(nice * f) + 4} textAnchor="end" fontSize="11" fill="var(--ed-muted)">
              {formatUsd(nice * f)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = pad.l + i * slot + 1;
          const h = Math.max(0, pad.t + ih - y(p.costUsd));
          const r = Math.min(4, bw / 2, h);
          const top = pad.t + ih - h;
          return (
            <g key={p.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${p.label}: ${formatUsd(p.costUsd)}, ${p.calls}`}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${pad.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${pad.t + ih} Z`}
                  fill="var(--ed-primary)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {(i % 5 === 0 || i === points.length - 1) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ed-muted)">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--ed-muted)" strokeWidth="1" />
      </svg>
      {hp && (
        <div className="pointer-events-none absolute top-0 right-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md" role="status">
          <div className="font-semibold">{t('admin.usage.day', { day: hp.label })}</div>
          <div>{formatUsd(hp.costUsd)}</div>
          <div className="text-muted">{t('admin.usage.calls', { count: hp.calls })}</div>
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">{t('admin.usage.showTable')}</summary>
        <Table className="mt-2">
          <thead>
            <tr>
              <th>{t('teacher.date')}</th>
              <th>{t('admin.usage.callsCol')}</th>
              <th>{t('admin.usage.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((p) => p.calls > 0)
              .map((p) => (
                <tr key={p.day}>
                  <td>{`${p.day.slice(6, 8)}/${p.day.slice(4, 6)}`}</td>
                  <td className="tabular-nums">{p.calls}</td>
                  <td className="tabular-nums">{formatUsd(p.costUsd)}</td>
                </tr>
              ))}
          </tbody>
        </Table>
      </details>
    </div>
  );
}

export function UsageTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const [month, setMonth] = useState(monthKeyNow());
  const [exporting, setExporting] = useState(false);
  const q = useQuery({ queryKey: ['admin-usage', month], queryFn: () => api.get<UsageReport>(`/api/admin/usage${qs({ month })}`) });

  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadBlob(await api.blob(`/api/admin/usage.csv${qs({ month })}`), `usage-${month}.csv`);
    } catch (e) {
      toast.error(errorMessage(t, e));
    } finally {
      setExporting(false);
    }
  };

  const monthInput = `${month.slice(0, 4)}-${month.slice(4, 6)}`;
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(4, 6));
  const daysInMonth = new Date(year, mon, 0).getDate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label={t('admin.usage.month')} className="w-48">
          {(id) => <Input id={id} type="month" value={monthInput} onChange={(e) => e.target.value && setMonth(e.target.value.replace('-', ''))} />}
        </Field>
        <Button variant="secondary" onClick={() => void exportCsv()} loading={exporting}>
          ⬇ {t('admin.usage.export')}
        </Button>
      </div>
      {q.isPending ? (
        <PageSkeleton />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        (() => {
          const d = q.data;
          const ratio = d.budget.usedRatio;
          const tone = ratio >= 1 ? 'danger' : ratio >= d.budget.warnRatio ? 'warn' : 'primary';
          const points: DayPoint[] = Array.from({ length: daysInMonth }, (_, i) => {
            const day = `${month}${String(i + 1).padStart(2, '0')}`;
            const v = d.byDay[day];
            return { day, label: i + 1, calls: v?.calls ?? 0, costUsd: v?.costUsd ?? 0 };
          });
          return (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label={t('admin.usage.cost')} value={formatUsd(d.totals.costUsd)} hint={t('admin.usage.entries', { count: d.entries })} />
                <StatCard label={t('admin.usage.inputTokens')} value={d.totals.inputTokens.toLocaleString()} />
                <StatCard label={t('admin.usage.outputTokens')} value={d.totals.outputTokens.toLocaleString()} />
              </div>
              <Card>
                <SectionTitle>{t('admin.usage.budget')}</SectionTitle>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    <span className="text-lg font-bold">{formatUsd(d.totals.costUsd)}</span> / {d.budget.monthlyBudgetUsd > 0 ? formatUsd(d.budget.monthlyBudgetUsd) : t('admin.usage.noBudget')}
                  </span>
                  <span className="font-semibold">
                    {Math.round(ratio * 100)}% · {t('admin.usage.warnAt', { percent: Math.round(d.budget.warnRatio * 100) })} · {d.budget.policy === 'block' ? t('admin.quotas.block') : t('admin.quotas.warnOnly')}
                  </span>
                </div>
                <ProgressBar value={Math.min(ratio, 1)} max={1} tone={tone} marker={d.budget.warnRatio} label={t('admin.usage.budget')} />
                {ratio >= d.budget.warnRatio && d.budget.monthlyBudgetUsd > 0 && (
                  <Alert tone={ratio >= 1 ? 'danger' : 'warn'} className="mt-3">
                    {ratio >= 1 ? '⛔' : '⚠️'} {ratio >= 1 ? t('admin.usage.overBudget') : t('admin.usage.nearBudget')}
                  </Alert>
                )}
                <p className="mt-3 text-xs text-muted">{d.note}</p>
              </Card>
              <Card>
                <SectionTitle>{t('admin.usage.byDay')}</SectionTitle>
                {d.entries === 0 ? <EmptyState icon="📉" title={t('admin.usage.empty')} /> : <DailyBars points={points} />}
              </Card>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <SectionTitle>{t('admin.usage.byKind')}</SectionTitle>
                  <Table>
                    <thead>
                      <tr>
                        <th>{t('admin.usage.kind')}</th>
                        <th>{t('admin.usage.callsCol')}</th>
                        <th>{t('admin.usage.failures')}</th>
                        <th>{t('admin.usage.cost')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(d.byKind).map(([k, v]) => (
                        <tr key={k}>
                          <td>
                            {KINDS.includes(k) ? t(`admin.usage.kinds.${k as 'character'}`) : k} <span className="font-mono text-xs text-muted">{k}</span>
                          </td>
                          <td className="tabular-nums">{v.calls}</td>
                          <td className="tabular-nums">{v.failures}</td>
                          <td className="tabular-nums">{formatUsd(v.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
                <Card>
                  <SectionTitle>{t('admin.usage.topUsers')}</SectionTitle>
                  <Table>
                    <thead>
                      <tr>
                        <th>{t('common.name')}</th>
                        <th>{t('admin.usage.callsCol')}</th>
                        <th>{t('admin.usage.cost')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.topUsers.map((u) => (
                        <tr key={u.uid}>
                          <td>{u.name}</td>
                          <td className="tabular-nums">{u.calls}</td>
                          <td className="tabular-nums">{formatUsd(u.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}
