import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

type ToastTone = 'info' | 'success' | 'error' | 'warn';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: ReactNode;
}

interface ToastApi {
  show: (message: ReactNode, tone?: ToastTone) => void;
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (message: ReactNode, tone: ToastTone = 'info') => {
      const id = next.current++;
      setItems((xs) => [...xs.slice(-3), { id, tone, message }]);
      setTimeout(() => remove(id), tone === 'error' ? 7000 : 3500);
    },
    [remove],
  );
  const api = useMemo<ToastApi>(() => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error') }), [show]);
  const tones: Record<ToastTone, string> = {
    info: 'border-line bg-surface text-fg',
    success: 'border-success/40 bg-success-soft text-success',
    error: 'border-danger/40 bg-danger-soft text-danger',
    warn: 'border-warn/40 bg-warn-soft text-warn',
  };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end sm:px-0" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={cx('pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg', tones[t.tone])}>
            <span className="flex-1">{t.message}</span>
            <button type="button" className="-my-1 -mr-1 grid h-8 w-8 place-items-center rounded-lg opacity-70 hover:opacity-100" onClick={() => remove(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
