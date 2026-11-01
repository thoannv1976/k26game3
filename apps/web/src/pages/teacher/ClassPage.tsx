import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SKILLS } from '@vq/shared';
import { api, qs } from '../../api/client';
import type { AnalyticsSummary, ClassDetail } from '../../api/types';
import { useLocalized } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { downloadBlob, formatDate } from '../../lib/format';
import { SKILL_META, scoreTone } from '../../lib/game';
import { SkillChip } from '../../components/game';
import { Badge, Button, ButtonLink, Card, Checkbox, ConfirmModal, EmptyState, ErrorBox, Field, Input, LevelBadge, PageHeader, PageSkeleton, SectionTitle, Select, StatCard, Table, cx } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { SummaryCard } from '../student/ProfilePage';

const TABS = ['overview', 'students', 'path', 'results'] as const;
type Tab = (typeof TABS)[number];

export function HeatCell({ score }: { score: number | null }) {
  const tone = scoreTone(score);
  return (
    <span
      className={cx(
        'inline-grid h-9 min-w-12 place-items-center rounded-lg px-2 text-sm font-bold tabular-nums',
        tone === 'none' && 'bg-surface-2 text-muted',
        tone === 'low' && 'bg-danger-soft text-danger',
        tone === 'mid' && 'bg-warn-soft text-warn',
        tone === 'high' && 'bg-success-soft text-success',
      )}
    >
      {score ?? '—'}
    </span>
  );
}

function Overview({ d, courseId }: { d: ClassDetail; courseId: string }) {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const toast = useToast();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const gen = useMutation({
    mutationFn: () => api.post<AnalyticsSummary>('/api/teacher/analytics/summary', { courseId }),
    onSuccess: setSummary,
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const s = d.stats;
  const criteria = Object.entries(s.criteria).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('teacher.students')} value={s.students} />
        <StatCard label={t('teacher.activeStudents')} value={s.activeStudents} />
        <StatCard label={t('teacher.resultsCount')} value={d.results.length} />
        <StatCard label={t('teacher.pendingReview')} value={s.pendingReview} hint={s.pendingReview ? <Link to={`/teacher/review?courseId=${courseId}`} className="font-semibold text-primary hover:underline">{t('teacher.openQueue')}</Link> : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>📊 {t('teacher.perSkill')}</SectionTitle>
          <ul className="space-y-3">
            {s.perSkill.map((k) => (
              <li key={k.skill}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <SkillChip skill={k.skill} />
                  <span className="text-muted">
                    {k.average !== null ? <strong className="text-fg tabular-nums">{k.average}</strong> : '—'} · {t('teacher.results', { count: k.results })} · {t('teacher.below50', { count: k.below50 })}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={cx('h-full rounded-full bg-gradient-to-r', SKILL_META[k.skill].gradient)} style={{ width: `${k.average ?? 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <SectionTitle>🧮 {t('teacher.criteria')}</SectionTitle>
          {criteria.length === 0 ? (
            <p className="text-sm text-muted">{t('teacher.noResults')}</p>
          ) : (
            <ul className="space-y-2">
              {criteria.map(([k, v]) => {
                const [skill, crit] = k.split('.') as ['writing' | 'speaking', string];
                return (
                  <li key={k} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {SKILL_META[skill].emoji} {t(`criteria.${crit}`)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted">{t('teacher.results', { count: v.results })}</span>
                      <HeatCell score={v.percent} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <Card>
        <SectionTitle
          actions={
            <Button size="sm" variant="secondary" onClick={() => gen.mutate()} loading={gen.isPending}>
              🤖 {t('teacher.aiSummary')}
            </Button>
          }
        >
          🤖 {t('teacher.aiSummaryTitle')}
        </SectionTitle>
        {summary ? <SummaryCard summary={summary.summary} generatedAt={summary.generatedAt} /> : <p className="text-sm text-muted">{t('teacher.aiSummaryHint')}</p>}
      </Card>
      {d.inProgress.length > 0 && (
        <Card>
          <SectionTitle>⏳ {t('teacher.inProgress')}</SectionTitle>
          <ul className="divide-y divide-line text-sm">
            {d.inProgress.slice(0, 20).map((a) => (
              <li key={a.attemptId} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <strong>{a.studentName}</strong> · {a.title} <span className="text-muted">({t(`modes.${a.mode}`)})</span>
                </span>
                <span className="text-muted">{formatDate(a.lastActivityAt, lang, true)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Students({ d }: { d: ClassDetail }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const list = d.students.filter((s) => `${s.displayName} ${s.email} ${s.studentCode}`.toLowerCase().includes(search.toLowerCase()));
  if (!d.students.length) return <EmptyState icon="👩‍🎓" title={t('teacher.noStudents')} />;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <Field label={t('common.search')} className="w-full sm:w-72">
          {(id) => <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} />}
        </Field>
        <p className="text-xs text-muted">{t('teacher.heatHint')}</p>
      </div>
      <Table>
        <thead>
          <tr>
            <th>{t('common.name')}</th>
            {SKILLS.map((s) => (
              <th key={s} className="text-center">
                {SKILL_META[s].emoji} <span className="sr-only">{t(`skills.${s}`)}</span>
                <span aria-hidden="true" className="hidden xl:inline">
                  {t(`skills.${s}`)}
                </span>
              </th>
            ))}
            <th>{t('teacher.quests')}</th>
            <th>XP</th>
            <th>{t('teacher.pending')}</th>
            <th>{t('teacher.active')}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.uid}>
              <td>
                <Link to={`/teacher/students/${s.uid}`} className="font-semibold text-primary hover:underline">
                  {s.displayName}
                </Link>
                <div className="text-xs text-muted">
                  {s.studentCode || s.email} · <LevelBadge level={s.level} />
                </div>
              </td>
              {SKILLS.map((k) => (
                <td key={k} className="text-center">
                  <HeatCell score={s.skills[k]} />
                </td>
              ))}
              <td className="tabular-nums">{s.questsCompleted}</td>
              <td className="tabular-nums">
                {s.xp} {s.streakDays > 0 && <span title={t('game.streakHint')}>🔥{s.streakDays}</span>}
              </td>
              <td>{s.pendingReview > 0 ? <Badge tone="warn">{s.pendingReview}</Badge> : '—'}</td>
              <td>{s.inProgress > 0 ? <Badge tone="primary">{s.inProgress}</Badge> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function LearningPath({ d, courseId }: { d: ClassDetail; courseId: string }) {
  const { t } = useTranslation();
  const { L, lang } = useLocalized();
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<'quest' | 'exam'>('quest');
  const [refId, setRefId] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [order, setOrder] = useState(String((d.assignments.at(-1)?.order ?? 0) + 1));
  const [toDelete, setToDelete] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['teacher-class', courseId] });
  const create = useMutation({
    mutationFn: () => api.post('/api/teacher/assignments', { courseId, kind, refId, dueAt: due ? new Date(due).toISOString() : null, note, order: Number(order) || 0 }),
    onSuccess: () => {
      toast.success(t('teacher.assignmentCreated'));
      setRefId('');
      setNote('');
      setDue('');
      setOrder(String(Number(order) + 1));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const remove = useMutation({
    mutationFn: (aid: string) => api.delete(`/api/teacher/assignments/${aid}`),
    onSuccess: () => {
      setToDelete(null);
      toast.success(t('teacher.assignmentDeleted'));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const titleOf = (k: string, id: string) => (k === 'quest' ? L(d.quests.find((q) => q.id === id)?.title) : L(d.exams.find((e) => e.id === id)?.title)) || id;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (refId) create.mutate();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <SectionTitle>🗺️ {t('teacher.path')}</SectionTitle>
        {d.assignments.length === 0 ? (
          <EmptyState icon="🗺️" title={t('teacher.noAssignments')} />
        ) : (
          <ol className="space-y-2">
            {d.assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft font-bold text-primary tabular-nums">{a.order}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    <Badge className="mr-1">{t(`teacher.kind.${a.kind}`)}</Badge>
                    <span className="font-mono text-xs">{a.refId}</span> {titleOf(a.kind, a.refId)}
                  </div>
                  <div className="text-xs text-muted">
                    {a.dueAt ? t('world.due', { date: formatDate(a.dueAt, lang) }) : t('teacher.noDue')} · {t('teacher.completedBy', { count: a.completedBy, total: d.students.length })}
                    {a.note && ` · ${a.note}`}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setToDelete(a.id)} aria-label={`${t('common.delete')} ${a.refId}`}>
                  🗑️
                </Button>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card>
        <SectionTitle>➕ {t('teacher.addAssignment')}</SectionTitle>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label={t('teacher.kindLabel')}>
            {(fid) => (
              <Select
                id={fid}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as 'quest' | 'exam');
                  setRefId('');
                }}
              >
                <option value="quest">{t('teacher.kind.quest')}</option>
                <option value="exam">{t('teacher.kind.exam')}</option>
              </Select>
            )}
          </Field>
          <Field label={kind === 'quest' ? t('teacher.kind.quest') : t('teacher.kind.exam')}>
            {(fid) => (
              <Select id={fid} value={refId} onChange={(e) => setRefId(e.target.value)} required>
                <option value="">—</option>
                {kind === 'quest'
                  ? d.quests.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.id} · {L(q.title)} ({q.level})
                      </option>
                    ))
                  : d.exams.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.id} · {L(e.title)}
                      </option>
                    ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('teacher.order')} hint={t('teacher.orderHint')}>
              {(fid) => <Input id={fid} type="number" min={0} max={999} value={order} onChange={(e) => setOrder(e.target.value)} />}
            </Field>
            <Field label={t('teacher.dueAt')}>{(fid) => <Input id={fid} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
          </div>
          <Field label={t('teacher.note')}>{(fid) => <Input id={fid} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}</Field>
          <Button type="submit" loading={create.isPending} disabled={!refId}>
            {t('teacher.assign')}
          </Button>
        </form>
      </Card>
      <ConfirmModal open={toDelete !== null} onClose={() => setToDelete(null)} onConfirm={() => toDelete && remove.mutate(toDelete)} loading={remove.isPending} title={t('teacher.deleteAssignment')} confirmLabel={t('common.delete')} tone="danger">
        <p>{t('teacher.deleteAssignmentBody')}</p>
      </ConfirmModal>
    </div>
  );
}

function Results({ d, courseId }: { d: ClassDetail; courseId: string }) {
  const { t } = useTranslation();
  const { L, lang } = useLocalized();
  const qc = useQueryClient();
  const toast = useToast();
  const [pendingOnly, setPendingOnly] = useState(false);
  const [mode, setMode] = useState('');
  const [releaseExam, setReleaseExam] = useState<string | null>(null);
  const release = useMutation({
    mutationFn: (examId: string) => api.post<{ released: number }>('/api/teacher/exams/release', { courseId, examId }),
    onSuccess: (r) => {
      setReleaseExam(null);
      toast.success(t('teacher.released', { count: r.released }));
      void qc.invalidateQueries({ queryKey: ['teacher-class', courseId] });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const list = d.results.filter((r) => (!pendingOnly || (r.pendingReview && !r.reviewed)) && (!mode || r.mode === mode));
  const unreleased = d.exams.map((e) => ({ ...e, count: d.results.filter((r) => r.mode === 'exam' && r.refId === e.id && r.answersReleased === false).length })).filter((e) => e.count > 0);
  return (
    <div className="space-y-4">
      {unreleased.length > 0 && (
        <Card className="space-y-2">
          <SectionTitle>🔓 {t('teacher.releaseTitle')}</SectionTitle>
          <p className="text-sm text-muted">{t('teacher.releaseHint')}</p>
          <ul className="flex flex-wrap gap-2">
            {unreleased.map((e) => (
              <li key={e.id}>
                <Button size="sm" onClick={() => setReleaseExam(e.id)} data-testid={`release-${e.id}`}>
                  {t('teacher.releaseFor', { title: L(e.title), count: e.count })}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label={t('history.mode')} className="w-44">
            {(fid) => (
              <Select id={fid} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="">{t('common.all')}</option>
                <option value="quest">{t('modes.quest')}</option>
                <option value="exam">{t('modes.exam')}</option>
                <option value="championship">{t('modes.championship')}</option>
              </Select>
            )}
          </Field>
          <Checkbox label={t('teacher.pendingOnly')} checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
        </div>
        {list.length === 0 ? (
          <EmptyState icon="📄" title={t('teacher.noResults')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('teacher.student')}</th>
                <th>{t('history.activity')}</th>
                <th>{t('results.score')}</th>
                <th>{t('teacher.skillsCol')}</th>
                <th>{t('history.status')}</th>
                <th>{t('teacher.date')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.attemptId}>
                  <td className="font-semibold">{r.studentName}</td>
                  <td>
                    <Link to={`/teacher/attempts/${r.attemptId}`} className="font-semibold text-primary hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted">{t(`modes.${r.mode}`)}</div>
                  </td>
                  <td className="tabular-nums">{r.score ?? '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {r.skills.map((s) => (
                        <span key={s.skill} className="text-xs" title={t(`skills.${s.skill}`)}>
                          {SKILL_META[s.skill].emoji}
                          {s.score ?? '—'}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {r.pendingReview && !r.reviewed && <Badge tone="warn">{t('teacher.needsReview')}</Badge>}
                      {r.reviewed && <Badge tone="success">{t(`results.review.${r.reviewed}`)}</Badge>}
                      {r.aiStatus === 'failed' && <Badge tone="danger">{t('teacher.aiFailed')}</Badge>}
                      {r.answersReleased === false && <Badge>{t('teacher.notReleased')}</Badge>}
                      {r.answersReleased === true && <Badge tone="primary">{t('teacher.releasedBadge')}</Badge>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(r.createdAt, lang)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <ConfirmModal open={releaseExam !== null} onClose={() => setReleaseExam(null)} onConfirm={() => releaseExam && release.mutate(releaseExam)} loading={release.isPending} title={t('teacher.releaseTitle')} confirmLabel={t('teacher.release')} confirmTestId="confirm-release">
        <p>{t('teacher.releaseConfirm')}</p>
      </ConfirmModal>
    </div>
  );
}

export default function ClassPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab: Tab = TABS.includes(sp.get('tab') as Tab) ? (sp.get('tab') as Tab) : 'overview';
  const [exporting, setExporting] = useState(false);
  const q = useQuery({ queryKey: ['teacher-class', id], queryFn: () => api.get<ClassDetail>(`/api/teacher/classes/${id}`) });
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.blob(`/api/teacher/export.csv${qs({ courseId: id })}`);
      downloadBlob(blob, `vstep-quest-results-${d.course.code}.csv`);
    } catch (e) {
      toast.error(errorMessage(t, e));
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="space-y-5">
      <ButtonLink to="/teacher" variant="ghost" size="sm" className="-ml-3">
        ← {t('teacher.title')}
      </ButtonLink>
      <PageHeader
        title={<span data-testid="class-title">{d.course.name}</span>}
        subtitle={`${d.course.code} · ${t('teacher.studentCount', { count: d.students.length })}`}
        actions={
          <>
            <ButtonLink to={`/teacher/review?courseId=${id}`} variant="secondary">
              📝 {t('nav.reviewQueue')} {d.stats.pendingReview > 0 && <Badge tone="warn">{d.stats.pendingReview}</Badge>}
            </ButtonLink>
            <Button variant="secondary" onClick={() => void exportCsv()} loading={exporting}>
              ⬇️ {t('teacher.exportCsv')}
            </Button>
          </>
        }
      />
      <nav className="-mx-4 overflow-x-auto px-4" aria-label={t('teacher.sections')}>
        <ul className="flex min-w-max gap-1 border-b border-line">
          {TABS.map((x) => (
            <li key={x}>
              <button
                type="button"
                data-testid={`class-tab-${x}`}
                aria-current={tab === x ? 'page' : undefined}
                onClick={() => setSp({ tab: x })}
                className={cx('-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap', tab === x ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg')}
              >
                {t(`teacher.tabs.${x}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {tab === 'overview' && <Overview d={d} courseId={id} />}
      {tab === 'students' && <Students d={d} />}
      {tab === 'path' && <LearningPath d={d} courseId={id} />}
      {tab === 'results' && <Results d={d} courseId={id} />}
    </div>
  );
}
