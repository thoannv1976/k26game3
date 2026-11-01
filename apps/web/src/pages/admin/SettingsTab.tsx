import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AiConfig, QuotaConfig } from '@vq/shared';
import { api } from '../../api/client';
import type { AdminSettings, AiHealth } from '../../api/types';
import { errorMessage, validationIssues } from '../../i18n/errors';
import { Alert, Button, Card, ErrorBox, Field, Input, PageSkeleton, SectionTitle, Select } from '../../components/ui';
import { useToast } from '../../components/Toast';

function Issues({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  const issues = validationIssues(error);
  return (
    <Alert tone="danger">
      {errorMessage(t, error)}
      {issues.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {issues.map((i, n) => (
            <li key={n}>
              {i.path}: {i.message}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, hint }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => <Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} required />}
    </Field>
  );
}

export function SettingsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<AdminSettings>('/api/admin/settings') });
  const [ai, setAi] = useState<AiConfig | null>(null);
  const [quotas, setQuotas] = useState<QuotaConfig | null>(null);
  const [health, setHealth] = useState<AiHealth | null>(null);

  useEffect(() => {
    if (q.data) {
      setAi(q.data.aiConfig);
      setQuotas(q.data.quotas);
    }
  }, [q.data]);

  const saveAi = useMutation({
    mutationFn: (body: AiConfig) => api.put('/api/admin/ai-config', body),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['admin-settings'] });
    },
  });
  const saveQuotas = useMutation({
    mutationFn: (body: QuotaConfig) => api.put('/api/admin/quotas', body),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['admin-settings'] });
    },
  });
  const test = useMutation({
    mutationFn: () => api.post<AiHealth>('/api/admin/health/ai'),
    onSuccess: setHealth,
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  if (q.isPending || !ai || !quotas) return q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : <PageSkeleton />;

  const setP = (k: keyof AiConfig['pricing'], v: number) => setAi({ ...ai, pricing: { ...ai.pricing, [k]: v } });
  const setQ = <K extends keyof QuotaConfig>(k: K, v: QuotaConfig[K]) => setQuotas({ ...quotas, [k]: v });
  const onAi = (e: FormEvent) => {
    e.preventDefault();
    saveAi.mutate(ai);
  };
  const onQuotas = (e: FormEvent) => {
    e.preventDefault();
    saveQuotas.mutate(quotas);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <SectionTitle
          actions={
            <Button variant="secondary" size="sm" data-testid="ai-test" onClick={() => test.mutate()} loading={test.isPending}>
              🔌 {t('admin.ai.test')}
            </Button>
          }
        >
          {t('admin.ai.title')}
        </SectionTitle>
        {q.data?.modelOverride && <Alert className="mb-3">{t('admin.ai.override', { model: q.data.modelOverride })}</Alert>}
        {health && (
          <Alert tone={health.ok ? 'success' : 'danger'} className="mb-3">
            {health.ok ? '✓' : '✗'} {health.provider} · {health.model} · {health.latencyMs} ms
            {health.reply && <div className="mt-1 text-xs">“{health.reply}”</div>}
            {health.error && <div className="mt-1 text-xs">{health.error}</div>}
          </Alert>
        )}
        <form onSubmit={onAi} className="grid gap-3 sm:grid-cols-2">
          <Field label={t('admin.ai.model')}>{(id) => <Input id={id} value={ai.model} minLength={3} onChange={(e) => setAi({ ...ai, model: e.target.value })} required />}</Field>
          <Field label={t('admin.ai.assessmentModel')}>{(id) => <Input id={id} value={ai.assessmentModel} minLength={3} onChange={(e) => setAi({ ...ai, assessmentModel: e.target.value })} required />}</Field>
          <NumberField label={t('admin.ai.temperature')} value={ai.temperature} min={0} max={1.5} step={0.05} onChange={(v) => setAi({ ...ai, temperature: v })} />
          <NumberField label={t('admin.ai.audioRetention')} hint={t('admin.ai.audioRetentionHint')} value={ai.audioRetentionDays} min={0} max={365} onChange={(v) => setAi({ ...ai, audioRetentionDays: v })} />
          <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">{t('admin.ai.pricing')}</legend>
            <NumberField label={t('admin.ai.inputTokens')} value={ai.pricing.inputTokensPer1M} min={0} step={0.01} onChange={(v) => setP('inputTokensPer1M', v)} />
            <NumberField label={t('admin.ai.outputTokens')} value={ai.pricing.outputTokensPer1M} min={0} step={0.01} onChange={(v) => setP('outputTokensPer1M', v)} />
            <NumberField label={t('admin.ai.sttPerMinute')} value={ai.pricing.sttPerMinute} min={0} step={0.001} onChange={(v) => setP('sttPerMinute', v)} />
            <NumberField label={t('admin.ai.ttsPer1MChars')} value={ai.pricing.ttsPer1MChars} min={0} step={0.01} onChange={(v) => setP('ttsPer1MChars', v)} />
          </fieldset>
          <div className="sm:col-span-2">
            <Issues error={saveAi.error} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={saveAi.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <SectionTitle>{t('admin.quotas.title')}</SectionTitle>
        <form onSubmit={onQuotas} className="grid gap-3 sm:grid-cols-2">
          <NumberField label={t('admin.quotas.aiCalls')} value={quotas.aiCallsPerStudentPerDay} min={0} max={5000} onChange={(v) => setQ('aiCallsPerStudentPerDay', v)} />
          <NumberField label={t('admin.quotas.attempts')} value={quotas.attemptsPerQuestPerDay} min={1} max={50} onChange={(v) => setQ('attemptsPerQuestPerDay', v)} />
          <NumberField label={t('admin.quotas.mockExams')} value={quotas.mockExamsPerStudentPerMonth} min={0} max={50} onChange={(v) => setQ('mockExamsPerStudentPerMonth', v)} />
          <NumberField label={t('admin.quotas.explanations')} value={quotas.explanationsPerStudentPerDay} min={0} max={500} onChange={(v) => setQ('explanationsPerStudentPerDay', v)} />
          <NumberField label={t('admin.quotas.coach')} value={quotas.coachMessagesPerStudentPerDay} min={0} max={500} onChange={(v) => setQ('coachMessagesPerStudentPerDay', v)} />
          <NumberField label={t('admin.quotas.grading')} value={quotas.aiGradingsPerSubmission} min={1} max={5} onChange={(v) => setQ('aiGradingsPerSubmission', v)} />
          <NumberField label={t('admin.quotas.recordSeconds')} value={quotas.maxRecordSeconds} min={20} max={300} onChange={(v) => setQ('maxRecordSeconds', v)} />
          <NumberField label={t('admin.quotas.outputTokens')} value={quotas.maxOutputTokens} min={256} max={8192} onChange={(v) => setQ('maxOutputTokens', v)} />
          <NumberField label={t('admin.quotas.budget')} value={quotas.monthlyBudgetUsd} min={0} max={100000} step={0.01} onChange={(v) => setQ('monthlyBudgetUsd', v)} />
          <NumberField label={t('admin.quotas.warnRatio')} hint={t('admin.quotas.warnRatioHint')} value={quotas.warnRatio} min={0.1} max={1} step={0.05} onChange={(v) => setQ('warnRatio', v)} />
          <Field label={t('admin.quotas.onExceeded')}>
            {(id) => (
              <Select id={id} value={quotas.onBudgetExceeded} onChange={(e) => setQ('onBudgetExceeded', e.target.value as QuotaConfig['onBudgetExceeded'])}>
                <option value="block">{t('admin.quotas.block')}</option>
                <option value="warn_only">{t('admin.quotas.warnOnly')}</option>
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Issues error={saveQuotas.error} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={saveQuotas.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
