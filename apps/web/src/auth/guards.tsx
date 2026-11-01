import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vq/shared';
import { isApiError } from '../api/client';
import { Button, ErrorBox, Spinner } from '../components/ui';
import { AppHeader } from '../components/Layout';
import { homePathForRole, useAuth } from './AuthProvider';

function FullPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">{children}</main>
    </div>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh place-items-center text-muted" role="status">
      <div className="flex items-center gap-3">
        <Spinner />
        <span>{t('common.loading')}</span>
      </div>
    </div>
  );
}

export function NotProvisionedPage({ disabled = false }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const { signOut, firebaseUser, refetchMe } = useAuth();
  return (
    <FullPage>
      <div className="text-5xl" aria-hidden="true">
        🧭
      </div>
      <h1 className="text-2xl font-bold">{disabled ? t('auth.disabledTitle') : t('auth.notProvisionedTitle')}</h1>
      <p className="text-muted">{disabled ? t('auth.disabledBody') : t('auth.notProvisionedBody', { email: firebaseUser?.email ?? '' })}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {!disabled && (
          <Button variant="secondary" onClick={refetchMe}>
            {t('common.retry')}
          </Button>
        )}
        <Button onClick={() => void signOut()}>{t('nav.signOut')}</Button>
      </div>
    </FullPage>
  );
}

export function RequireAuth() {
  const { firebaseUser, initializing, me, meLoading, meError, refetchMe, signOut } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  if (initializing) return <Loading />;
  if (!firebaseUser) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (meLoading) return <Loading />;
  if (meError) {
    if (isApiError(meError, 'NOT_PROVISIONED')) return <NotProvisionedPage />;
    if (isApiError(meError, 'FORBIDDEN')) return <NotProvisionedPage disabled />;
    return (
      <FullPage>
        <ErrorBox error={meError} onRetry={refetchMe} />
        <Button variant="secondary" onClick={() => void signOut()}>
          {t('nav.signOut')}
        </Button>
      </FullPage>
    );
  }
  if (!me?.user) return <NotProvisionedPage />;
  return <Outlet />;
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const { role } = useAuth();
  if (!role || !roles.includes(role)) return <Navigate to={homePathForRole(role)} replace />;
  return <Outlet />;
}

export function HomeRedirect() {
  const { role } = useAuth();
  return <Navigate to={homePathForRole(role)} replace />;
}
