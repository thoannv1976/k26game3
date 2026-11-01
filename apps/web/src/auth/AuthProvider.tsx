import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@vq/shared';
import { auth } from '../firebase';
import { api, refreshIdToken } from '../api/client';
import { isTenantUser, type MeResponse, type MeUser } from '../api/types';
import { setLocale } from '../i18n';

interface AuthState {
  firebaseUser: User | null;
  initializing: boolean;
  me: MeResponse | undefined;
  meLoading: boolean;
  meError: unknown;
  role: Role | null;
  refetchMe: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** GET /api/me, refreshing the ID token once when the server just provisioned the account. */
async function fetchMe(): Promise<MeResponse> {
  let r = await api.get<MeResponse>('/api/me');
  for (let i = 0; i < 2 && r.refreshToken; i++) {
    await refreshIdToken();
    r = await api.get<MeResponse>('/api/me');
  }
  return r;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [initializing, setInitializing] = useState(true);

  useEffect(
    () =>
      onIdTokenChanged(auth, (u) => {
        setFirebaseUser((prev) => {
          if (prev?.uid !== u?.uid) qc.clear();
          return u;
        });
        setInitializing(false);
      }),
    [qc],
  );

  const meQuery = useQuery({
    queryKey: ['me', firebaseUser?.uid ?? null],
    queryFn: fetchMe,
    enabled: Boolean(firebaseUser),
    staleTime: 60_000,
    retry: (count, err) => count < 2 && (err as { code?: string }).code === 'NETWORK',
  });

  const me = meQuery.data;
  useEffect(() => {
    if (isTenantUser(me?.user) && me.user.locale) setLocale(me.user.locale);
  }, [me]);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    qc.clear();
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({
      firebaseUser,
      initializing,
      me,
      meLoading: meQuery.isPending && Boolean(firebaseUser),
      meError: meQuery.error,
      role: (me?.user as MeUser | null | undefined)?.role ?? null,
      refetchMe: () => void meQuery.refetch(),
      signOut,
    }),
    [firebaseUser, initializing, me, meQuery, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Updates the cached /api/me user after PATCH /api/me. */
export function useSetMeUser() {
  const qc = useQueryClient();
  const { firebaseUser } = useAuth();
  return useCallback(
    (user: MeUser) => {
      qc.setQueryData<MeResponse>(['me', firebaseUser?.uid ?? null], (old) => (old ? { ...old, user } : { user, tenant: null }));
    },
    [qc, firebaseUser],
  );
}

export function homePathForRole(role: Role | null): string {
  switch (role) {
    case 'student':
      return '/world';
    case 'teacher':
    case 'school_admin':
      return '/teacher';
    case 'platform_admin':
      return '/platform';
    default:
      return '/login';
  }
}
