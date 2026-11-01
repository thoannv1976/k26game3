import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ComponentProps, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Level } from '@vq/shared';
import { errorMessage } from '../i18n/errors';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* ---------------- Button ---------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90 dark:text-black',
  success: 'bg-success text-white hover:opacity-90 dark:text-black',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const SIZES = {
  sm: 'min-h-11 sm:min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

export function buttonClass(variant: Variant = 'primary', size: 'sm' | 'md' | 'lg' = 'md', className?: string) {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function ButtonLink({ variant = 'primary', size = 'md', className, ...rest }: LinkProps & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Layout pieces ---------------- */
export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'> & { 'data-testid'?: string }) {
  return (
    <As className={cx('rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5', className)} {...rest}>
      {children}
    </As>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{children}</h2>
      {actions}
    </div>
  );
}

/* ---------------- Badges ---------------- */
type Tone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}>{children}</span>;
}

export function LevelBadge({ level }: { level: Level }) {
  return <Badge tone={level === 'B2' ? 'warn' : 'primary'}>{level}</Badge>;
}

/* ---------------- States ---------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-surface-2', className)} aria-hidden="true" />;
}

export function PageSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" role="status" aria-label={t('common.loading')}>
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function EmptyState({ title, children, icon = '🔎', action }: { title: ReactNode; children?: ReactNode; icon?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <div className="text-3xl" aria-hidden="true">
        {icon}
      </div>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-danger">
      <span>{errorMessage(t, error)}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'warn', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-xl px-4 py-3 text-sm', TONES[tone], className)}>
      {children}
    </div>
  );
}

export function ProgressBar({ value, max, label, tone = 'primary', marker }: { value: number; max: number; label?: string; tone?: 'primary' | 'warn' | 'danger' | 'success'; marker?: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = { primary: 'bg-primary', warn: 'bg-warn', danger: 'bg-danger', success: 'bg-success' }[tone];
  return (
    <div className="relative h-2.5 w-full overflow-visible rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      {marker !== undefined && <div className="absolute -top-1 h-4.5 w-0.5 bg-fg/60" style={{ left: `${Math.min(100, marker * 100)}%` }} aria-hidden="true" />}
    </div>
  );
}

/* ---------------- Form fields ---------------- */
const inputCls =
  'w-full min-h-11 rounded-xl border border-line bg-surface px-3 py-2 text-fg placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60';

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={cx(inputCls, props.className)} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-24', props.className)} />;
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-9">
      <input type="checkbox" {...props} className="h-5 w-5 rounded accent-[var(--vq-primary)]" />
      <span>{label}</span>
    </label>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissable = true,
  side = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
  /** Render as a drawer on the right (desktop) / bottom sheet (mobile). */
  side?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Keep the latest onClose without re-running the focus effect on every parent render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusable = el?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close]), [tabindex]:not([tabindex="-1"])');
    (focusable ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) closeRef.current();
      if (e.key === 'Tab' && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, dismissable]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return createPortal(
    <div
      className={cx('fixed inset-0 z-50 flex bg-slate-950/50', side ? 'items-end justify-end sm:items-stretch' : 'items-end justify-center p-0 sm:items-center sm:p-4')}
      onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'flex w-full flex-col border border-line bg-surface shadow-xl',
          side ? 'max-h-[92vh] rounded-t-2xl sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-2xl' : cx('max-h-[92vh] rounded-t-2xl sm:rounded-2xl', widths[size]),
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {dismissable && (
            <button data-close type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-surface-2" aria-label="Close">
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation dialog; when `confirmText` is set the user must type it to enable the button. */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  tone = 'primary',
  loading,
  confirmText,
  confirmTestId = 'confirm-ok',
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: ReactNode;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  confirmText?: string;
  confirmTestId?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const typed = useRef<HTMLInputElement>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={tone}
            loading={loading}
            disabled={disabled}
            data-testid={confirmTestId}
            onClick={() => {
              if (confirmText && typed.current?.value.trim() !== confirmText) {
                typed.current?.focus();
                return;
              }
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">{children}</div>
      {confirmText && (
        <Field label={t('common.typeToConfirm', { text: confirmText })} className="mt-3">
          {(id) => <Input id={id} ref={typed} autoComplete="off" />}
        </Field>
      )}
    </Modal>
  );
}

/* ---------------- Tables ---------------- */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('-mx-4 overflow-x-auto sm:mx-0', className)}>
      <table className="w-full min-w-[560px] border-collapse text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-muted [&_th]:uppercase">
        {children}
      </table>
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** One-time secret display (temporary passwords). */
export function SecretBox({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2">
      <code className="font-mono text-base break-all text-fg">{value}</code>
      <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(value).catch(() => undefined)}>
        {t('common.copy')}
      </Button>
    </div>
  );
}
