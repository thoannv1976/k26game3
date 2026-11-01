import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import { homePathForRole, useAuth } from '../auth/AuthProvider';
import { Alert, Button, Field, Input } from '../components/ui';
import { LanguageToggle, Logo } from '../components/Layout';

function authErrorKey(code: string | undefined) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'login.errors.invalid' as const;
    case 'auth/user-disabled':
      return 'login.errors.disabled' as const;
    case 'auth/too-many-requests':
      return 'login.errors.tooMany' as const;
    case 'auth/network-request-failed':
      return 'login.errors.network' as const;
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    default:
      return 'login.errors.generic' as const;
  }
}

export function LoginPage() {
  const { t } = useTranslation();
  const { firebaseUser, initializing, role, me } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'google' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!initializing && firebaseUser) {
    const from = (location.state as { from?: string } | null)?.from;
    // Wait for /api/me to know the role (RequireAuth handles errors / not provisioned).
    if (me?.user) return <Navigate to={from && from !== '/login' ? from : homePathForRole(role)} replace />;
    return <Navigate to={from ?? '/'} replace />;
  }

  const fail = (e: unknown) => {
    const key = authErrorKey((e as { code?: string }).code);
    if (key) setError(t(key));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy('password');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setError(null);
    setBusy('google');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError(t('login.enterEmailFirst'));
      return;
    }
    setBusy('reset');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo(t('login.resetSent'));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,var(--ed-primary-soft),transparent_45%),radial-gradient(circle_at_80%_90%,var(--ed-manila),transparent_40%)]" />
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={56} />
          <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">English Detective</h1>
          <p className="font-mono text-xs font-semibold tracking-[0.3em] text-string uppercase">AI Mystery Challenge</p>
          <p className="text-muted">{t('login.tagline')}</p>
        </div>
        <form onSubmit={onSubmit} className="paper-plain space-y-4 rounded-2xl border border-line p-5 sm:p-6" noValidate>
          <h2 className="text-lg font-semibold">{t('login.title')}</h2>
          {error && <Alert tone="danger">{error}</Alert>}
          {info && <Alert tone="success">{info}</Alert>}
          <Field label={t('login.email')}>
            {(id) => (
              <Input id={id} data-testid="login-email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
          <Field label={t('login.password')}>
            {(id) => (
              <Input id={id} data-testid="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </Field>
          <Button data-testid="login-submit" type="submit" className="w-full" size="lg" loading={busy === 'password'} disabled={!email || !password || busy !== null}>
            {t('login.submit')}
          </Button>
          <div className="flex justify-end">
            <button type="button" onClick={() => void reset()} disabled={busy !== null} className="min-h-11 text-sm font-medium text-primary hover:underline">
              {t('login.forgot')}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            {t('login.or')}
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="secondary" className="w-full" onClick={() => void google()} loading={busy === 'google'} disabled={busy !== null}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {t('login.google')}
          </Button>
          <p className="text-center text-xs text-muted">{t('login.accountNote')}</p>
        </form>
      </div>
    </div>
  );
}
