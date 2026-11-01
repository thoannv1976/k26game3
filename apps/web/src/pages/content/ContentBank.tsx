import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { ContentKind, ContentRow, ContentSaveResult } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { useLocalized } from '../../i18n';
import { errorMessage, validationIssues } from '../../i18n/errors';
import { formatDate } from '../../lib/format';
import { SkillChip } from '../../components/game';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, ErrorBox, Field, Input, Modal, PageSkeleton, Select, Table, Textarea, cx } from '../../components/ui';
import { useToast } from '../../components/Toast';

export const KINDS: ContentKind[] = ['item', 'quest', 'exam'];

export function ContentStatusBadge({ row }: { row: Pick<ContentRow, 'status' | 'approvedVersion' | 'latestVersion'> }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={row.status === 'approved' ? 'success' : row.status === 'archived' ? 'neutral' : 'warn'}>{t(`content.status.${row.status}`)}</Badge>
      {row.latestVersion > row.approvedVersion && row.status !== 'archived' && <Badge tone="warn">{t('content.pendingApproval')}</Badge>}
    </span>
  );
}

function Issues({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <Alert tone="danger">
      {errorMessage(t, error)}
      <ul className="mt-1 list-disc pl-5 text-xs">
        {validationIssues(error).slice(0, 20).map((i, n) => (
          <li key={n}>{i.message}</li>
        ))}
      </ul>
    </Alert>
  );
}

function GeneratorModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ id: '', skill: 'reading', level: 'B1', topic: '', objective: '', difficulty: 3, questionCount: 5, notes: '' });
  const gen = useMutation({
    mutationFn: () => api.post<ContentSaveResult>('/api/admin/content/generate', f),
    onSuccess: (r) => {
      toast.success(t('content.generated', { version: r.version }));
      void qc.invalidateQueries({ queryKey: ['content', 'item'] });
      onClose();
      nav(`/content/item/${f.id}`);
    },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    gen.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`🤖 ${t('content.generator')}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="gen-form" loading={gen.isPending}>
            {t('content.generate')}
          </Button>
        </>
      }
    >
      <form id="gen-form" onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <p className="text-sm text-muted sm:col-span-2">{t('content.generatorHint')}</p>
        <Field label={t('content.newId')} hint={t('content.idHint')}>
          {(id) => <Input id={id} required pattern="^[A-Z]{1,3}\d{0,2}_[a-z0-9_]+$" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="R03_campus_news" />}
        </Field>
        <Field label={t('content.skill')}>
          {(id) => (
            <Select id={id} value={f.skill} onChange={(e) => setF({ ...f, skill: e.target.value })}>
              {['listening', 'reading', 'writing', 'speaking'].map((s) => (
                <option key={s} value={s}>
                  {t(`skills.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('content.level')}>
          {(id) => (
            <Select id={id} value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
              <option>B1</option>
              <option>B2</option>
            </Select>
          )}
        </Field>
        <Field label={t('content.difficulty')}>{(id) => <Input id={id} type="number" min={1} max={5} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: Number(e.target.value) })} />}</Field>
        <Field label={t('content.topic')}>{(id) => <Input id={id} required minLength={3} maxLength={80} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />}</Field>
        <Field label={t('content.questionCount')}>{(id) => <Input id={id} type="number" min={0} max={10} value={f.questionCount} onChange={(e) => setF({ ...f, questionCount: Number(e.target.value) })} />}</Field>
        <Field label={t('content.objective')} className="sm:col-span-2">
          {(id) => <Input id={id} required minLength={5} maxLength={300} value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })} />}
        </Field>
        <Field label={t('content.notes')} className="sm:col-span-2">
          {(id) => <Textarea id={id} maxLength={800} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}
        </Field>
        {gen.isPending && <Alert tone="neutral" className="sm:col-span-2">{t('content.generating')}</Alert>}
        {gen.isError && (
          <div className="sm:col-span-2">
            <Issues error={gen.error} />
          </div>
        )}
      </form>
    </Modal>
  );
}

function NewDraftModal({ kind, onClose }: { kind: ContentKind; onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: ({ id, content }: { id: string; content: unknown }) => api.put<ContentSaveResult>(`/api/admin/content/${kind}/${id}`, { content, note }),
    onSuccess: (r, v) => {
      toast.success(t('content.draftSaved', { version: r.version }));
      void qc.invalidateQueries({ queryKey: ['content', kind] });
      onClose();
      nav(`/content/${kind}/${v.id}`);
    },
  });
  const submit = () => {
    setParseError(null);
    try {
      const content = JSON.parse(text) as { id?: string; exam?: { id?: string } };
      const id = kind === 'exam' ? content.exam?.id : content.id;
      if (!id) throw new Error(t('content.missingId'));
      save.mutate({ id, content });
    } catch (e) {
      setParseError((e as Error).message);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('content.newDraft', { kind: t(`content.kinds.${kind}`) })}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {t('content.saveDraft')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('content.newDraftHint')}</p>
        <Textarea aria-label="JSON" value={text} onChange={(e) => setText(e.target.value)} className="min-h-80 font-mono text-xs" spellCheck={false} />
        <Field label={t('content.note')}>{(id) => <Input id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}</Field>
        {parseError && <Alert tone="danger">{parseError}</Alert>}
        {save.isError && <Issues error={save.error} />}
      </div>
    </Modal>
  );
}

function SeedButton() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [approve, setApprove] = useState(true);
  const [approveExams, setApproveExams] = useState(false);
  const seed = useMutation({
    mutationFn: () => api.post<{ created: number }>('/api/admin/content/seed', { approve, approveExams }),
    onSuccess: (r) => {
      setOpen(false);
      toast.success(t('content.seeded', { count: r.created }));
      void qc.invalidateQueries({ queryKey: ['content'] });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        🌱 {t('content.seed')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('content.seed')}
        size="sm"
        footer={
          <Button onClick={() => seed.mutate()} loading={seed.isPending}>
            {t('content.seedRun')}
          </Button>
        }
      >
        <p className="mb-2 text-sm text-muted">{t('content.seedHint')}</p>
        <Checkbox label={t('content.seedApprove')} checked={approve} onChange={(e) => setApprove(e.target.checked)} />
        <Checkbox label={t('content.seedApproveExams')} checked={approveExams} onChange={(e) => setApproveExams(e.target.checked)} />
      </Modal>
    </>
  );
}

/** Question bank, quests and mock exams with versions, checks and approval (teachers + school admins). */
export function ContentBank() {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const { role } = useAuth();
  const [sp, setSp] = useSearchParams();
  const kind = (KINDS.includes(sp.get('kind') as ContentKind) ? sp.get('kind') : 'item') as ContentKind;
  const [skill, setSkill] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'gen' | 'new' | null>(null);
  const q = useQuery({ queryKey: ['content', kind], queryFn: () => api.get<{ items: ContentRow[] }>(`/api/admin/content/${kind}`) });
  const rows = (q.data?.items ?? []).filter(
    (r) =>
      (!skill || r.skill === skill) &&
      (!level || r.level === level) &&
      (!status || (status === 'pending' ? r.pendingApproval : r.status === status)) &&
      (!search || `${r.id} ${r.title}`.toLowerCase().includes(search.toLowerCase())),
  );
  const levels = [...new Set((q.data?.items ?? []).map((r) => r.level))].sort();
  return (
    <div className="space-y-4" data-testid="content-bank">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label={t('content.kind')}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === kind}
              onClick={() => setSp({ kind: k })}
              className={cx('min-h-10 rounded-xl px-3 text-sm font-semibold', k === kind ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-fg')}
              data-testid={`content-kind-${k}`}
            >
              {t(`content.kinds.${k}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {kind === 'item' && (
            <Button variant="secondary" onClick={() => setModal('gen')} data-testid="open-generator">
              🤖 {t('content.generator')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setModal('new')}>
            + {t('content.newDraftShort')}
          </Button>
          {role === 'school_admin' && <SeedButton />}
        </div>
      </div>
      <Card>
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('common.search')}>{(id) => <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} />}</Field>
          {kind !== 'exam' && (
            <Field label={t('content.skill')}>
              {(id) => (
                <Select id={id} value={skill} onChange={(e) => setSkill(e.target.value)}>
                  <option value="">{t('common.all')}</option>
                  {['listening', 'reading', 'writing', 'speaking'].map((s) => (
                    <option key={s} value={s}>
                      {t(`skills.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label={t('content.level')}>
            {(id) => (
              <Select id={id} value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">{t('common.all')}</option>
                {levels.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('content.statusLabel')}>
            {(id) => (
              <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t('common.all')}</option>
                <option value="approved">{t('content.status.approved')}</option>
                <option value="draft">{t('content.status.draft')}</option>
                <option value="pending">{t('content.pendingApproval')}</option>
                <option value="archived">{t('content.status.archived')}</option>
              </Select>
            )}
          </Field>
        </div>
        {q.isPending ? (
          <PageSkeleton />
        ) : q.isError ? (
          <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon="📚" title={t('content.empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('content.titleCol')}</th>
                <th>{t('content.skill')}</th>
                <th>{t('content.level')}</th>
                <th>{t('content.statusLabel')}</th>
                <th>{t('content.versions')}</th>
                <th>{t('content.source')}</th>
                <th>{t('content.updated')}</th>
              </tr>
            </thead>
            <tbody data-testid="content-rows">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/content/${kind}/${r.id}`} className="font-mono font-semibold text-primary hover:underline">
                      {r.id}
                    </Link>
                  </td>
                  <td lang="en">{r.title}</td>
                  <td>{r.skill ? <SkillChip skill={r.skill} /> : '—'}</td>
                  <td>{r.level}</td>
                  <td>
                    <ContentStatusBadge row={r} />
                  </td>
                  <td className="tabular-nums">
                    v{r.approvedVersion || '–'} / v{r.latestVersion}
                  </td>
                  <td>{t(`content.sources.${r.source}`)}</td>
                  <td className="whitespace-nowrap">{formatDate(r.updatedAt, lang)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {modal === 'gen' && <GeneratorModal onClose={() => setModal(null)} />}
      {modal === 'new' && <NewDraftModal kind={kind} onClose={() => setModal(null)} />}
    </div>
  );
}

export default function ContentBankPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">📚 {t('content.title')}</h1>
        <p className="mt-1 text-muted">{t('content.subtitle')}</p>
      </div>
      <ContentBank />
    </div>
  );
}
