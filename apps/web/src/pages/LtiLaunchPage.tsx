import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '../firebase';
import { api, isApiError } from '../api/client';
import { Alert, Spinner } from '../components/ui';
import { Logo } from '../components/Layout';

/**
 * Entry point for launches from the LMS through UniGame Hub (LTI 1.3).
 * The Hub sends the browser here with a one-time signed ticket in the URL fragment (#ticket=...).
 */
export function LtiLaunchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const started = useRef(false); // StrictMode runs effects twice; the ticket is single use.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const m = /(?:^#|&)ticket=([^&]+)/.exec(window.location.hash);
    // Drop the ticket from the address bar and history right away.
    window.history.replaceState(null, '', window.location.pathname);
    if (!m) {
      setError(t('lti.noTicket'));
      return;
    }
    void (async () => {
      try {
        const r = await api.post<{ customToken: string; redirect: string }>('/api/lti/launch', { ticket: decodeURIComponent(m[1]!) });
        if (auth.currentUser) await signOut(auth); // another account may be signed in on this browser
        qc.clear();
        await signInWithCustomToken(auth, r.customToken);
        navigate(r.redirect, { replace: true });
      } catch (e) {
        setError(isApiError(e) && e.status === 401 ? t('lti.expired') : t('lti.failed'));
      }
    })();
  }, [navigate, qc, t]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <div className="flex justify-center">
          <Logo size={48} />
        </div>
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <div className="flex items-center justify-center gap-3 text-muted">
            <Spinner />
            <span>{t('lti.signingIn')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
