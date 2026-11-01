import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, qs } from '../../api/client';
import type { ClassDetail } from '../../api/types';
import { useLocalized } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { downloadBlob, formatDate } from '../../lib/format';
import { Badge, Button, ButtonLink, Card, Checkbox, ConfirmModal, EmptyState, ErrorBox, Field, Input, LevelBadge, PageHeader, PageSkeleton, SectionTitle, Select, Table } from '../../components/ui';
import { useToast } from '../../components/Toast';

export default function ClassPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { L, lang } = useLocalized();
  const qc = useQueryClient();
  const toast = useToast();
  const [pendingOnly, setPendingOnly] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const q = useQuery({ queryKey: ['teacher-class', id], queryFn: () => api.get<ClassDetail>(`/api/teacher/classes/${id}`) });

  const create = useMutation({
    mutationFn: () => api.post('/api/teacher/assignments', { courseId: id, caseId, dueAt: due ? new Date(due).toISOString() : null, note }),
    onSuccess: () => {
      toast.success(t('teacher.assignmentCreated'));
      setCaseId('');
      setDue('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['teacher-class', id] });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const remove = useMutation({
    mutationFn: (aid: string) => api.delete(`/api/teacher/assignments/${aid}`),
    onSuccess: () => {
      setToDelete(null);
      toast.success(t('teacher.assignmentDeleted'));
      void qc.invalidateQueries({ queryKey: ['teacher-class', id] });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const titleOf = (cid: string) => L(d.cases.find((c) => c.id === cid)?.title) || cid;
  const results = pendingOnly ? d.results.filter((r) => !r.reviewed) : d.results;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.blob(`/api/teacher/export.csv${qs({ courseId: id })}`);
      downloadBlob(blob, `detective-results-${d.course.code}.csv`);
    } catch (e) {
      toast.error(errorMessage(t, e));
    } finally {
      setExporting(false);
    }
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (caseId) create.mutate();
  };

  return (
    <div className="space-y-6">
      <ButtonLink to="/teacher" variant="ghost" size="sm" className="-ml-3">
        ← {t('teacher.title')}
      </ButtonLink>
      <PageHeader
        title={d.course.name}
        subtitle={`${d.course.code} · ${t('teacher.studentCount', { count: d.students.length })}`}
        actions={
          <Button data-testid="export-csv" variant="secondary" onClick={() => void exportCsv()} loading={exporting}>
            ⬇ {t('teacher.exportCsv')}
          </Button>
        }
      />

      <Card>
        <SectionTitle>{t('teacher.students')}</SectionTitle>
        {d.students.length === 0 ? (
          <EmptyState icon="👩‍🎓" title={t('teacher.noStudents')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('teacher.code')}</th>
                <th>{t('common.name')}</th>
                <th>{t('teacher.level')}</th>
                <th>{t('teacher.dp')}</th>
                <th>{t('teacher.solved')}</th>
                <th>{t('teacher.reports')}</th>
                <th>{t('teacher.average')}</th>
                <th>{t('teacher.pendingReview')}</th>
                <th>{t('teacher.inProgress')}</th>
              </tr>
            </thead>
            <tbody>
              {d.students.map((s) => (
                <tr key={s.uid} className="hover:bg-surface-2">
                  <td className="font-mono text-xs">{s.studentCode || '—'}</td>
                  <td>
                    <Link to={`/teacher/students/${s.uid}`} className="font-medium text-primary hover:underline">
                      {s.displayName}
                    </Link>
                    <div className="text-xs text-muted">{s.email}</div>
                  </td>
                  <td>
                    <LevelBadge level={s.level} />
                  </td>
                  <td className="tabular-nums">{s.detectivePoints}</td>
                  <td className="tabular-nums">{s.casesSolved}</td>
                  <td className="tabular-nums">{s.reports}</td>
                  <td className="tabular-nums">{s.averagePercent === null ? '—' : `${s.averagePercent}%`}</td>
                  <td>{s.pendingReview > 0 ? <Badge tone="warn">{s.pendingReview}</Badge> : <span className="text-muted">0</span>}</td>
                  <td className="tabular-nums">{s.inProgress}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <SectionTitle>🔎 {t('teacher.inProgressTitle')}</SectionTitle>
        {d.inProgress.length === 0 ? (
          <p className="text-sm text-muted">{t('teacher.noInProgress')}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('teacher.case')}</th>
                <th>{t('teacher.docsOpened')}</th>
                <th>{t('teacher.questions')}</th>
                <th>{t('teacher.evidence')}</th>
                <th>{t('teacher.facts')}</th>
                <th>{t('teacher.interviews')}</th>
                <th>{t('teacher.hints')}</th>
                <th>{t('teacher.conclusion')}</th>
                <th>{t('teacher.lastActivity')}</th>
              </tr>
            </thead>
            <tbody>
              {d.inProgress.map((s) => (
                <tr key={s.sessionId}>
                  <td>
                    <Link to={`/teacher/sessions/${s.sessionId}`} className="font-medium text-primary hover:underline">
                      {s.studentName}
                    </Link>
                  </td>
                  <td className="font-mono text-xs">{s.caseId}</td>
                  <td className="tabular-nums">{s.documentsOpened}</td>
                  <td className="tabular-nums">{s.questionsAnswered}</td>
                  <td className="tabular-nums">{s.evidenceCollected}</td>
                  <td className="tabular-nums">{s.factsRevealed}</td>
                  <td className="tabular-nums">{s.interviews}</td>
                  <td className="tabular-nums">{s.hintsUsed}</td>
                  <td>{s.conclusionChosen ? '✓' : '—'}</td>
                  <td className="text-xs whitespace-nowrap">{formatDate(s.lastActivityAt, lang, true)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <SectionTitle>📋 {t('teacher.assignments')}</SectionTitle>
        <form onSubmit={onCreate} className="mb-4 grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_2fr_auto] lg:items-end">
          <Field label={t('teacher.case')}>
            {(fid) => (
              <Select id={fid} data-testid="assignment-case" value={caseId} onChange={(e) => setCaseId(e.target.value)} required>
                <option value="">{t('teacher.pickCase')}</option>
                {d.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {L(c.title)} ({c.level})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('teacher.dueDate')}>{(fid) => <Input id={fid} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
          <Field label={t('teacher.note')}>{(fid) => <Input id={fid} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}</Field>
          <Button type="submit" data-testid="assignment-create" loading={create.isPending} disabled={!caseId}>
            {t('teacher.assign')}
          </Button>
        </form>
        {d.assignments.length === 0 ? (
          <p className="text-sm text-muted">{t('teacher.noAssignments')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {a.caseId} · {titleOf(a.caseId)}
                  </div>
                  <div className="text-xs text-muted">
                    {t('teacher.due')}: {a.dueAt ? formatDate(a.dueAt, lang, true) : t('teacher.noDue')} · {t('teacher.submittedBy', { count: a.submittedBy, total: d.students.length })}
                    {a.note && ` · ${a.note}`}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => setToDelete(a.id)}>
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle actions={<Checkbox label={t('teacher.pendingOnly')} checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />}>📊 {t('teacher.results')}</SectionTitle>
        {results.length === 0 ? (
          <EmptyState icon="📊" title={pendingOnly ? t('teacher.noPending') : t('teacher.noResults')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('teacher.date')}</th>
                <th>{t('common.name')}</th>
                <th>{t('teacher.case')}</th>
                <th>{t('teacher.solvedCol')}</th>
                <th>AI %</th>
                <th>{t('teacher.final')}</th>
                <th>{t('teacher.aiStatus')}</th>
                <th>{t('teacher.review')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.sessionId} className="hover:bg-surface-2">
                  <td className="text-xs whitespace-nowrap">{formatDate(r.createdAt, lang, true)}</td>
                  <td>{r.studentName}</td>
                  <td>
                    {r.caseId} <LevelBadge level={r.level} />
                  </td>
                  <td>{r.solved ? '✓' : '—'}</td>
                  <td className="tabular-nums">{r.percent}%</td>
                  <td className="font-semibold tabular-nums">{r.finalPercent}%</td>
                  <td>
                    <Badge tone={r.aiStatus === 'ok' ? 'neutral' : 'warn'}>{t(`teacher.aiStatusValue.${r.aiStatus}`)}</Badge>
                  </td>
                  <td>
                    <Link to={`/teacher/sessions/${r.sessionId}`} data-testid={`review-link-${r.sessionId}`} className="inline-flex min-h-9 items-center font-semibold text-primary hover:underline">
                      {r.reviewed ? <Badge tone="success">✓ {t(`teacher.reviewStatus.${r.reviewed}`)}</Badge> : <Badge tone="warn">{t('teacher.toReview')}</Badge>}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        title={t('teacher.deleteAssignment')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={remove.isPending}
      >
        <p>{t('teacher.deleteAssignmentBody')}</p>
      </ConfirmModal>
    </div>
  );
}
