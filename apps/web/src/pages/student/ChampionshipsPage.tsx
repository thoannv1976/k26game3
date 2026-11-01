import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { useWorld } from '../../api/queries';
import type { ChampionshipStatus, GroupRow, LeaderboardResponse, LeaderRow, StudentChampionship } from '../../api/types';
import { Alert, Badge, ButtonLink, Card, EmptyState, ErrorBox, PageHeader, PageSkeleton, Table, cx } from '../../components/ui';
import { useLocalized } from '../../i18n';
import { formatDate } from '../../lib/format';

export function StatusBadge({ status }: { status: ChampionshipStatus }) {
  const { t } = useTranslation();
  return <Badge tone={status === 'open' ? 'success' : status === 'scheduled' ? 'primary' : 'neutral'}>{t(`champ.status.${status}`)}</Badge>;
}

export default function ChampionshipsPage() {
  const { t } = useTranslation();
  const { L, lang } = useLocalized();
  const q = useQuery({ queryKey: ['championships'], queryFn: () => api.get<{ championships: StudentChampionship[] }>('/api/championships') });
  const world = useWorld();
  const title = (id: string) => L(world.data?.zones.flatMap((z) => z.quests).find((x) => x.id === id)?.title) || id;
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const list = q.data.championships;
  return (
    <div className="space-y-5">
      <PageHeader title={<>🏆 {t('champ.title')}</>} subtitle={t('champ.subtitle')} />
      {list.length === 0 ? (
        <EmptyState icon="🏆" title={t('champ.none')}>
          {t('champ.noneBody')}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col gap-3" data-testid={`champ-${c.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={c.status} />
                  <Badge>{t(`champ.types.${c.type}`)}</Badge>
                  {c.team && <Badge tone="primary">👥 {c.team}</Badge>}
                  <Badge tone={c.allowHelp ? 'success' : 'neutral'}>{c.allowHelp ? t('champ.helpOn') : t('champ.helpOff')}</Badge>
                </div>
                <div>
                  <h2 className="font-display text-xl font-extrabold">{c.name}</h2>
                  {c.description && <p className="text-sm text-muted">{c.description}</p>}
                </div>
                <p className="text-sm text-muted">
                  {formatDate(c.opensAt, lang, true)} → {formatDate(c.closesAt, lang, true)}
                </p>
                <ul className="space-y-1.5">
                  {c.questIds.map((qid) => (
                    <li key={qid} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                      <span>
                        <span className="font-mono font-bold">{qid}</span> {title(qid)}
                      </span>
                      {c.status === 'open' && (
                        <Link to={`/quests/${qid}?championship=${c.id}`} className="font-semibold text-primary hover:underline" data-testid={`champ-play-${qid}`}>
                          {t('champ.play')} →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  <ButtonLink to={`/championships/${c.id}`} variant="secondary" size="sm">
                    📊 {t('champ.leaderboard')}
                  </ButtonLink>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IndividualTable({ rows, meUid }: { rows: LeaderRow[]; meUid?: string }) {
  const { t } = useTranslation();
  if (!rows.length) return <EmptyState icon="📊" title={t('champ.noEntries')} />;
  return (
    <Table>
      <thead>
        <tr>
          <th>#</th>
          <th>{t('common.name')}</th>
          <th>{t('champ.official')}</th>
          <th>{t('champ.provisional')}</th>
          <th>{t('champ.questsDone')}</th>
          <th>{t('champ.pending')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.uid} className={cx(r.uid === meUid && 'bg-primary-soft/60 font-semibold')}>
            <td className="tabular-nums">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
            <td>
              {r.name}
              {r.uid === meUid && <Badge tone="primary" className="ml-2">{t('champ.you')}</Badge>}
            </td>
            <td className="font-bold tabular-nums">{r.points}</td>
            <td className="text-muted tabular-nums">{r.provisionalPoints}</td>
            <td className="tabular-nums">{r.questsDone}</td>
            <td className="tabular-nums">{r.pendingReview > 0 ? <Badge tone="warn">{r.pendingReview}</Badge> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function GroupTable({ rows }: { rows: GroupRow[] }) {
  const { t } = useTranslation();
  if (!rows.length) return <EmptyState icon="📊" title={t('champ.noEntries')} />;
  return (
    <Table>
      <thead>
        <tr>
          <th>#</th>
          <th>{t('common.name')}</th>
          <th>{t('champ.members')}</th>
          <th>{t('champ.officialAvg')}</th>
          <th>{t('champ.provisionalAvg')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
            <td className="font-semibold">{r.name}</td>
            <td className="tabular-nums">{r.members}</td>
            <td className="font-bold tabular-nums">{r.points}</td>
            <td className="text-muted tabular-nums">{r.provisionalPoints}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Leaderboard: official ranking (confirmed scores) and provisional points shown separately. */
export function LeaderboardView({ data }: { data: LeaderboardResponse }) {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const c = data.championship;
  const tabs = (['individuals', ...(c.type === 'team' ? ['teams'] : []), ...(c.type === 'class' ? ['classes'] : [])] as const) as readonly ('individuals' | 'teams' | 'classes')[];
  const [tab, setTab] = useState<(typeof tabs)[number]>(c.type === 'team' ? 'teams' : c.type === 'class' ? 'classes' : 'individuals');
  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={c.status} />
          <Badge>{t(`champ.types.${c.type}`)}</Badge>
          <span className="text-sm text-muted">
            {formatDate(c.opensAt, lang, true)} → {formatDate(c.closesAt, lang, true)}
          </span>
        </div>
        <h1 className="font-display text-2xl font-extrabold">{c.name}</h1>
        {c.description && <p className="text-muted">{c.description}</p>}
        {data.me && (
          <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm" data-testid="my-rank">
            {t('champ.myRank', { rank: data.me.rank, points: data.me.points, provisional: data.me.provisionalPoints })}
          </p>
        )}
      </Card>
      <Alert tone="neutral" className="text-sm">
        <strong>{t('champ.howTitle')}</strong> {t('champ.how')}
      </Alert>
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-line" role="tablist">
          {tabs.map((x) => (
            <button key={x} role="tab" type="button" aria-selected={tab === x} onClick={() => setTab(x)} className={cx('-mb-px min-h-11 border-b-2 px-3 text-sm font-semibold', tab === x ? 'border-primary text-primary' : 'border-transparent text-muted')}>
              {t(`champ.tabs.${x}`)}
            </button>
          ))}
        </div>
      )}
      <Card>{tab === 'individuals' ? <IndividualTable rows={data.individuals} meUid={data.me?.uid} /> : <GroupTable rows={tab === 'teams' ? data.teams : data.classes} />}</Card>
    </div>
  );
}

export function LeaderboardPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['leaderboard', id], queryFn: () => api.get<LeaderboardResponse>(`/api/championships/${id}/leaderboard`), refetchInterval: 30_000 });
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/championships" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
        ← {t('nav.championships')}
      </Link>
      {q.isPending ? <PageSkeleton /> : q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : <LeaderboardView data={q.data} />}
    </div>
  );
}
