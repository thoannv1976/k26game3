import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ItemSchema, type ContentKind, type Item, type MockExam, type Quest } from '@vq/shared';
import { api } from '../../api/client';
import type { ContentCheck, ContentDetail, ContentSaveResult, ContentVersion } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { useLocalized } from '../../i18n';
import { errorMessage, validationIssues } from '../../i18n/errors';
import { formatDate } from '../../lib/format';
import { Alert, Badge, Button, Card, ConfirmModal, ErrorBox, Field, Input, PageSkeleton, SectionTitle, Textarea, cx } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ContentStatusBadge, KINDS } from './ContentBank';
import { ItemPreview } from './ItemPreview';

type VersionAudio = { rendered: boolean; segments: { index: number; seconds: number }[]; source?: 'tts' | 'upload' } | null | undefined;

function CheckList({ check }: { check: ContentCheck }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" data-testid="check-result">
      <Badge tone={check.ok ? 'success' : 'danger'}>{check.ok ? `✓ ${t('content.checkOk')}` : `✗ ${t('content.checkFailed', { count: check.errors.length })}`}</Badge>
      {check.errors.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-danger">
          {check.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {check.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-warn">
          {check.warnings.map((e, i) => (
            <li key={i}>⚠ {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SegmentPlayer({ id, version, index, seconds }: { id: string; version: number; index: number; seconds: number }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-16 text-muted">#{index + 1}</span>
      <span className="w-14 text-xs text-muted tabular-nums">~{seconds}s</span>
      {src ? (
        <audio src={src} controls autoPlay className="h-9 max-w-full" />
      ) : (
        <Button
          size="sm"
          variant="secondary"
          loading={state === 'loading'}
          onClick={async () => {
            setState('loading');
            try {
              const b = await api.blob(`/api/admin/content/item/${id}/versions/${version}/audio/${index}`);
              setSrc(URL.createObjectURL(b));
              setState('idle');
            } catch {
              setState('error');
            }
          }}
        >
          🎧 {state === 'error' ? t('content.audio.loadFailed') : t('content.audio.listen')}
        </Button>
      )}
    </li>
  );
}

/** Teachers listen to listening audio before publishing: TTS preview, playback, or upload of a real recording. */
function AudioReview({ id, v, onChanged }: { id: string; v: ContentVersion; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const audio = (v as { audio?: VersionAudio }).audio;
  const file = useRef<HTMLInputElement>(null);
  const [seconds, setSeconds] = useState('');
  const [offline, setOffline] = useState(false);
  const render = useMutation({
    mutationFn: () => api.post<{ rendered: boolean; segments: unknown }>(`/api/admin/content/item/${id}/versions/${v.version}/audio/render`),
    onSuccess: (r) => {
      setOffline(!r.rendered);
      if (r.rendered) toast.success(t('content.audio.rendered'));
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const upload = useMutation({
    mutationFn: async () => {
      const f = file.current?.files?.[0];
      if (!f) throw new Error(t('content.audio.chooseFile'));
      const form = new FormData();
      form.append('audio', f, f.name);
      if (seconds) form.append('seconds', seconds);
      return api.post(`/api/admin/content/item/${id}/versions/${v.version}/audio`, form);
    },
    onSuccess: () => {
      toast.success(t('content.audio.uploaded'));
      if (file.current) file.current.value = '';
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const segs = audio?.rendered ? [...audio.segments].sort((a, b) => a.index - b.index) : [];
  return (
    <div className="space-y-3 rounded-2xl border border-listening/40 bg-listening-soft/50 p-3" data-testid="audio-review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">🎧 {t('content.audio.title')}</h3>
        {audio?.rendered && <Badge tone="success">{audio.source === 'upload' ? t('content.audio.sourceUpload') : t('content.audio.sourceTts')}</Badge>}
      </div>
      {segs.length > 0 ? (
        <ul className="space-y-1.5">
          {segs.map((s) => (
            <SegmentPlayer key={s.index} id={id} version={v.version} index={s.index} seconds={s.seconds} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t('content.audio.none')}</p>
      )}
      {offline && <Alert tone="warn">{t('content.audio.offline')}</Alert>}
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => render.mutate()} loading={render.isPending} data-testid="audio-render">
          🔊 {t('content.audio.generate')}
        </Button>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">{t('content.audio.uploadTitle')}</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="sr-only">{t('content.audio.chooseFile')}</span>
            <input ref={file} type="file" accept="audio/mpeg,.mp3" className="text-sm" />
          </label>
          <Field label={t('content.audio.seconds')} className="w-32">
            {(fid) => <Input id={fid} type="number" min={1} max={600} value={seconds} onChange={(e) => setSeconds(e.target.value)} />}
          </Field>
          <Button size="sm" onClick={() => upload.mutate()} loading={upload.isPending}>
            ⬆️ {t('content.audio.upload')}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted">{t('content.audio.uploadHint')}</p>
      </details>
    </div>
  );
}

function Preview({ kind, content }: { kind: ContentKind; content: unknown }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  if (kind === 'item') {
    const r = ItemSchema.safeParse(content);
    if (!r.success) return <Alert tone="warn">{t('content.previewUnavailable')}</Alert>;
    return <ItemPreview item={r.data as Item} />;
  }
  if (kind === 'quest') {
    const q = content as Partial<Quest>;
    return (
      <div className="space-y-2 text-sm">
        <h3 className="font-display text-lg font-extrabold">{q.title ? L(q.title) : q.id}</h3>
        {q.summary && <p>{L(q.summary)}</p>}
        <p className="text-muted">
          {q.skill} · {q.level} · {q.xpReward} XP · {t('quest.pass')} {q.passPercent}% · {t('quest.requires')} {(q.requires ?? []).join(', ') || '—'}
        </p>
        <ol className="list-decimal pl-5">
          {(q.challenges ?? []).map((c) => (
            <li key={c.id}>
              {c.title} –{' '}
              <Link to={`/content/item/${c.itemId}`} className="font-mono text-primary hover:underline">
                {c.itemId}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  const e = (content as { exam?: Partial<MockExam>; blueprint?: { name?: string; conversion?: { min: number; max: number; label: string }[] } }) ?? {};
  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-display text-lg font-extrabold">{e.exam?.title ? L(e.exam.title) : e.exam?.id}</h3>
      <p className="text-muted">{e.blueprint?.name}</p>
      <ol className="list-decimal pl-5">
        {(e.exam?.sections ?? []).map((s) => (
          <li key={s.skill}>
            {t(`skills.${s.skill}`)} · {t('common.minutes', { count: s.timeMinutes })} ·{' '}
            {s.itemIds.map((i) => (
              <Link key={i} to={`/content/item/${i}`} className="mr-1 font-mono text-primary hover:underline">
                {i}
              </Link>
            ))}
          </li>
        ))}
      </ol>
      {e.exam?.disclaimer && <Alert tone="warn">{L(e.exam.disclaimer)}</Alert>}
      {(e.blueprint?.conversion ?? []).length > 0 && (
        <p className="text-muted">
          {t('content.conversion')}: {e.blueprint!.conversion!.map((c) => `${c.min}–${c.max} → ${c.label}`).join('; ')}
        </p>
      )}
    </div>
  );
}

export default function ContentDetailPage() {
  const { kind: k = 'item', id = '' } = useParams();
  const kind = (KINDS.includes(k as ContentKind) ? k : 'item') as ContentKind;
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const { role } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [sel, setSel] = useState<number | null>(null);
  const [tab, setTab] = useState<'preview' | 'json'>('preview');
  const [json, setJson] = useState('');
  const [note, setNote] = useState('');
  const [check, setCheck] = useState<ContentCheck | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'approve' | 'archive' | null>(null);
  const key = ['content-detail', kind, id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<ContentDetail>(`/api/admin/content/${kind}/${id}`) });
  const versions = q.data?.versions ?? [];
  const v = versions.find((x) => x.version === sel) ?? versions[0];

  useEffect(() => {
    if (v) {
      setJson(JSON.stringify(v.content, null, 2));
      setCheck(null);
      setParseError(null);
    }
  }, [v?.version, q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['content', kind] });
  };
  const parse = (): unknown | undefined => {
    try {
      setParseError(null);
      return JSON.parse(json);
    } catch (e) {
      setParseError((e as Error).message);
      return undefined;
    }
  };
  const doCheck = useMutation({
    mutationFn: (content: unknown) => api.post<ContentCheck>(`/api/admin/content/${kind}/check`, { content }),
    onSuccess: setCheck,
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const save = useMutation({
    mutationFn: (content: unknown) => api.put<ContentSaveResult>(`/api/admin/content/${kind}/${id}`, { content, note }),
    onSuccess: (r) => {
      toast.success(t('content.draftSaved', { version: r.version }));
      setNote('');
      setSel(r.version);
      setCheck(r.check);
      refresh();
    },
  });
  const approve = useMutation({
    mutationFn: (version: number) => api.post(`/api/admin/content/${kind}/${id}/approve`, { version }),
    onSuccess: () => {
      setConfirm(null);
      toast.success(t('content.approved'));
      refresh();
    },
    onError: (e) => {
      setConfirm(null);
      toast.error(errorMessage(t, e));
    },
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.post(`/api/admin/content/${kind}/${id}/archive`, { archived }),
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const doc = q.data.doc;
  const canApprove = kind !== 'exam' || role === 'school_admin';
  const isListening = kind === 'item' && (v?.content as { skill?: string } | undefined)?.skill === 'listening';

  return (
    <div className="space-y-4">
      <Link to={`/content?kind=${kind}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
        ← {t('content.title')}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-bold text-muted">
            {t(`content.kinds.${kind}`)} · {doc.id}
          </p>
          <h1 className="text-2xl font-bold" lang="en">
            {doc.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <ContentStatusBadge row={doc} />
            <span className="text-muted">
              {t('content.approvedV', { v: doc.approvedVersion || '–' })} · {t('content.latestV', { v: doc.latestVersion })} · {t(`content.sources.${doc.source}`)}
            </span>
          </div>
        </div>
        {role === 'school_admin' && (
          <Button variant="secondary" onClick={() => (doc.status === 'archived' ? archive.mutate(false) : setConfirm('archive'))} loading={archive.isPending}>
            {doc.status === 'archived' ? t('content.unarchive') : t('content.archive')}
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="p-3 sm:p-3">
          <SectionTitle>{t('content.versions')}</SectionTitle>
          <ul className="space-y-1.5">
            {versions.map((x) => (
              <li key={x.version}>
                <button
                  type="button"
                  onClick={() => setSel(x.version)}
                  aria-current={x.version === v?.version ? 'true' : undefined}
                  className={cx('w-full rounded-xl border-2 px-3 py-2 text-left text-sm', x.version === v?.version ? 'border-primary bg-primary-soft' : 'border-line hover:border-primary/40')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">v{x.version}</span>
                    <Badge tone={x.status === 'approved' ? 'success' : x.status === 'superseded' ? 'neutral' : 'warn'}>{t(`content.vstatus.${x.status}`)}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {formatDate(x.createdAt, lang, true)} · {x.check.ok ? '✓' : `✗ ${x.check.errors.length}`}
                  </div>
                  {x.note && <div className="mt-0.5 truncate text-xs">{x.note}</div>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {v && (
          <div className="min-w-0 space-y-4">
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  v{v.version} <span className="text-sm font-normal text-muted">· {t(`content.sources.${v.source}`)}</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {v.status !== 'approved' && (
                    <Button onClick={() => setConfirm('approve')} disabled={!v.check.ok || !canApprove} data-testid="approve-version" title={!canApprove ? t('content.examAdminOnly') : undefined}>
                      ✓ {t('content.approve')}
                    </Button>
                  )}
                </div>
              </div>
              {!canApprove && v.status !== 'approved' && <p className="text-xs text-muted">{t('content.examAdminOnly')}</p>}
              <CheckList check={v.check} />
              {isListening && <AudioReview id={id} v={v} onChanged={refresh} />}
            </Card>
            <Card className="space-y-3">
              <div className="flex gap-1 border-b border-line" role="tablist">
                {(['preview', 'json'] as const).map((x) => (
                  <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={cx('-mb-px min-h-11 border-b-2 px-3 text-sm font-semibold', tab === x ? 'border-primary text-primary' : 'border-transparent text-muted')}>
                    {t(`content.tabs.${x}`)}
                  </button>
                ))}
              </div>
              {tab === 'preview' ? (
                <Preview kind={kind} content={v.content} />
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted">{t('content.jsonHint')}</p>
                  <Textarea aria-label={t('content.jsonEditor')} value={json} onChange={(e) => setJson(e.target.value)} className="min-h-[28rem] font-mono text-xs leading-relaxed" spellCheck={false} data-testid="json-editor" />
                  <Field label={t('content.note')}>{(fid) => <Input id={fid} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}</Field>
                  {parseError && <Alert tone="danger">JSON: {parseError}</Alert>}
                  {check && <CheckList check={check} />}
                  {save.isError && (
                    <Alert tone="danger">
                      {errorMessage(t, save.error)}
                      <ul className="mt-1 list-disc pl-5 text-xs">
                        {validationIssues(save.error).slice(0, 20).map((i, n) => (
                          <li key={n}>{i.message}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const c = parse();
                        if (c !== undefined) doCheck.mutate(c);
                      }}
                      loading={doCheck.isPending}
                    >
                      🔎 {t('content.check')}
                    </Button>
                    <Button
                      onClick={() => {
                        const c = parse();
                        if (c !== undefined) save.mutate(c);
                      }}
                      loading={save.isPending}
                    >
                      💾 {t('content.saveDraft')}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
      <ConfirmModal
        open={confirm === 'approve'}
        onClose={() => setConfirm(null)}
        onConfirm={() => v && approve.mutate(v.version)}
        loading={approve.isPending}
        title={t('content.approveTitle', { v: v?.version ?? '' })}
        confirmLabel={t('content.approve')}
      >
        <p>{t('content.approveBody')}</p>
        {isListening && <p className="text-muted">{t('content.audio.approveNote')}</p>}
      </ConfirmModal>
      <ConfirmModal open={confirm === 'archive'} onClose={() => setConfirm(null)} onConfirm={() => archive.mutate(true)} loading={archive.isPending} title={t('content.archive')} confirmLabel={t('content.archive')} tone="danger">
        <p>{t('content.archiveBody')}</p>
      </ConfirmModal>
    </div>
  );
}
