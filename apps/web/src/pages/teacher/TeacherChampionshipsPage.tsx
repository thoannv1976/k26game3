import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { useWorld } from '../../api/queries';
import type { ChampionshipInput, ChampionshipType, ClassDetail, LeaderboardResponse, ManagedChampionship, TeacherClass } from '../../api/types';
import { useLocalized } from '../../i18n';
import { errorMessage, validationIssues } from '../../i18n/errors';
import { formatDate } from '../../lib/format';
import { Alert, Badge, Button, ButtonLink, Card, Checkbox, ConfirmModal, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, PageSkeleton, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { LeaderboardView, StatusBadge } from '../student/ChampionshipsPage';

/** ISO → value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const emptyForm = (): ChampionshipInput => {
  const now = Date.now();
  return { name: '', description: '', type: 'individual', courseIds: [], questIds: [], teams: [], opensAt: new Date(now).toISOString(), closesAt: new Date(now + 7 * 86400000).toISOString(), allowHelp: false };
};

function ChampionshipForm({ initial, editId, onClose }: { initial: ChampionshipInput; editId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<ChampionshipInput>(initial);
  const classes = useQuery({ queryKey: ['teacher-classes'], queryFn: () => api.get<{ classes: TeacherClass[] }>('/api/teacher/classes') });
  const world = useWorld();
  const details = useQueries({
    queries: f.type === 'team' ? f.courseIds.map((id) => ({ queryKey: ['teacher-class', id], queryFn: () => api.get<ClassDetail>(`/api/teacher/classes/${id}`) })) : [],
  });
  const students = details.flatMap((d) => d.data?.students ?? []).filter((s, i, arr) => arr.findIndex((x) => x.uid === s.uid) === i);
  const quests = world.data?.zones.flatMap((z) => z.quests) ?? [];
  const save = useMutation({
    mutationFn: () => (editId ? api.put(`/api/teacher/championships/${editId}`, f) : api.post('/api/teacher/championships', f)),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['teacher-championships'] });
      onClose();
    },
  });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const teamOf = (uid: string) => f.teams.find((tm) => tm.memberUids.includes(uid))?.id ?? '';
  const setTeam = (uid: string, teamId: string) =>
    setF({ ...f, teams: f.teams.map((tm) => ({ ...tm, memberUids: tm.id === teamId ? [...tm.memberUids.filter((u) => u !== uid), uid] : tm.memberUids.filter((u) => u !== uid) })) });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={editId ? t('champ.edit') : t('champ.create')}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="champ-form" loading={save.isPending} data-testid="champ-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="champ-form" onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <Field label={t('champ.name')}>{(id) => <Input id={id} required minLength={3} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="champ-name" />}</Field>
        <Field label={t('champ.type')}>
          {(id) => (
            <Select id={id} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as ChampionshipType })}>
              {(['individual', 'team', 'class'] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`champ.types.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('champ.description')} className="md:col-span-2">
          {(id) => <Textarea id={id} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}
        </Field>
        <Field label={t('champ.opensAt')}>{(id) => <Input id={id} type="datetime-local" required value={toLocalInput(f.opensAt)} onChange={(e) => e.target.value && setF({ ...f, opensAt: new Date(e.target.value).toISOString() })} />}</Field>
        <Field label={t('champ.closesAt')}>{(id) => <Input id={id} type="datetime-local" required value={toLocalInput(f.closesAt)} onChange={(e) => e.target.value && setF({ ...f, closesAt: new Date(e.target.value).toISOString() })} />}</Field>
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{t('champ.classes')}</legend>
          {classes.data?.classes.map((c) => (
            <Checkbox key={c.id} label={`${c.code} · ${c.name}`} checked={f.courseIds.includes(c.id)} onChange={() => setF({ ...f, courseIds: toggle(f.courseIds, c.id) })} />
          ))}
        </fieldset>
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{t('champ.quests')}</legend>
          <div className="grid gap-x-3 sm:grid-cols-2">
            {quests.map((q) => (
              <Checkbox key={q.id} label={`${q.id} · ${L(q.title)}`} checked={f.questIds.includes(q.id)} onChange={() => setF({ ...f, questIds: toggle(f.questIds, q.id) })} data-testid={`champ-quest-${q.id}`} />
            ))}
          </div>
        </fieldset>
        <div className="md:col-span-2">
          <Checkbox label={t('champ.allowHelp')} checked={f.allowHelp} onChange={(e) => setF({ ...f, allowHelp: e.target.checked })} />
        </div>
        {f.type === 'team' && (
          <fieldset className="space-y-3 rounded-xl border border-line p-3 md:col-span-2">
            <legend className="px-1 text-sm font-semibold">{t('champ.teams')}</legend>
            <div className="flex flex-wrap gap-2">
              {f.teams.map((tm, i) => (
                <div key={tm.id} className="flex items-center gap-1">
                  <Input aria-label={t('champ.teamName')} value={tm.name} className="w-40" onChange={(e) => setF({ ...f, teams: f.teams.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <Button size="sm" variant="ghost" aria-label={t('common.remove')} onClick={() => setF({ ...f, teams: f.teams.filter((_, j) => j !== i) })}>
                    ×
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="secondary" onClick={() => setF({ ...f, teams: [...f.teams, { id: `team_${Date.now().toString(36)}`, name: t('champ.teamN', { n: f.teams.length + 1 }), memberUids: [] }] })}>
                + {t('champ.addTeam')}
              </Button>
            </div>
            {f.courseIds.length === 0 ? (
              <p className="text-sm text-muted">{t('champ.pickClassFirst')}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {students.map((s) => (
                  <li key={s.uid} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2 py-1 text-sm">
                    <span className="truncate">{s.displayName}</span>
                    <Select aria-label={t('champ.teamFor', { name: s.displayName })} value={teamOf(s.uid)} onChange={(e) => setTeam(s.uid, e.target.value)} className="w-36 min-h-9">
                      <option value="">—</option>
                      {f.teams.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.name}
                        </option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}
        {save.isError && (
          <Alert tone="danger" className="md:col-span-2">
            {errorMessage(t, save.error)}
            {validationIssues(save.error).map((i, n) => (
              <div key={n} className="text-xs">
                {i.path}: {i.message}
              </div>
            ))}
          </Alert>
        )}
      </form>
    </Modal>
  );
}

export default function TeacherChampionshipsPage() {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<{ initial: ChampionshipInput; id: string | null } | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['teacher-championships'], queryFn: () => api.get<{ championships: ManagedChampionship[] }>('/api/teacher/championships') });
  const close = useMutation({
    mutationFn: (id: string) => api.post<{ closed: boolean; podium: string[] }>(`/api/teacher/championships/${id}/close`),
    onSuccess: (r) => {
      setClosing(null);
      toast.success(t('champ.closedToast', { count: r.podium.length }));
      void qc.invalidateQueries({ queryKey: ['teacher-championships'] });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  return (
    <div className="space-y-5">
      <PageHeader
        title={<>🏆 {t('champ.manageTitle')}</>}
        subtitle={t('champ.manageSubtitle')}
        actions={
          <Button onClick={() => setForm({ initial: emptyForm(), id: null })} data-testid="champ-new">
            + {t('champ.create')}
          </Button>
        }
      />
      {q.isPending ? (
        <PageSkeleton />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.championships.length === 0 ? (
        <EmptyState icon="🏆" title={t('champ.none')} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {q.data.championships.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={c.status} />
                  <Badge>{t(`champ.types.${c.type}`)}</Badge>
                  <Badge tone={c.allowHelp ? 'success' : 'neutral'}>{c.allowHelp ? t('champ.helpOn') : t('champ.helpOff')}</Badge>
                </div>
                <h2 className="font-display text-lg font-extrabold">{c.name}</h2>
                <p className="text-sm text-muted">
                  {formatDate(c.opensAt, lang, true)} → {formatDate(c.closesAt, lang, true)}
                </p>
                <p className="text-sm">
                  {t('champ.quests')}: <span className="font-mono">{c.questIds.join(', ')}</span>
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <ButtonLink to={`/teacher/championships/${c.id}`} size="sm" variant="secondary">
                    📊 {t('champ.leaderboard')}
                  </ButtonLink>
                  {!c.closedAt && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setForm({ id: c.id, initial: { name: c.name, description: c.description, type: c.type, courseIds: c.courseIds, questIds: c.questIds, teams: c.teams, opensAt: c.opensAt, closesAt: c.closesAt, allowHelp: c.allowHelp } })}>
                        {t('common.edit')}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setClosing(c.id)}>
                        {t('champ.close')}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {form && <ChampionshipForm initial={form.initial} editId={form.id} onClose={() => setForm(null)} />}
      <ConfirmModal open={closing !== null} onClose={() => setClosing(null)} onConfirm={() => closing && close.mutate(closing)} loading={close.isPending} title={t('champ.closeTitle')} confirmLabel={t('champ.close')} tone="danger">
        <p>{t('champ.closeBody')}</p>
      </ConfirmModal>
    </div>
  );
}

export function TeacherLeaderboardPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['teacher-leaderboard', id], queryFn: () => api.get<LeaderboardResponse>(`/api/teacher/championships/${id}/leaderboard`) });
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/teacher/championships" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
        ← {t('nav.championships')}
      </Link>
      {q.isPending ? <PageSkeleton /> : q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : <LeaderboardView data={q.data} />}
    </div>
  );
}
