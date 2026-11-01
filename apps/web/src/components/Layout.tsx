import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vq/shared';
import { useAuth, useSetMeUser, homePathForRole } from '../auth/AuthProvider';
import { api } from '../api/client';
import { isTenantUser, type MeUser } from '../api/types';
import { currentLocale, setLocale, type Locale } from '../i18n';
import { cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

function navFor(role: Role | null, t: ReturnType<typeof useTranslation>['t']): NavItem[] {
  const student: NavItem[] = [
    { to: '/office', label: t('nav.office') },
    { to: '/academy', label: t('nav.academy') },
  ];
  const teacher: NavItem[] = [
    { to: '/teacher', label: t('nav.classes'), end: true },
    { to: '/teacher/cases', label: t('nav.caseBank') },
    { to: '/office', label: t('nav.office') },
  ];
  switch (role) {
    case 'student':
      return student;
    case 'teacher':
      return teacher;
    case 'school_admin':
      return [{ to: '/admin', label: t('nav.admin') }, ...teacher.filter((n) => n.to !== '/teacher/cases')];
    case 'platform_admin':
      return [{ to: '/platform', label: t('nav.platform') }];
    default:
      return [];
  }
}

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const setMeUser = useSetMeUser();
  const lang = i18n.language === 'en' ? 'en' : 'vi';
  const change = (l: Locale) => {
    if (l === currentLocale()) return;
    setLocale(l);
    if (isTenantUser(me?.user)) {
      void api
        .patch<{ user: MeUser }>('/api/me', { locale: l })
        .then((r) => setMeUser(r.user))
        .catch(() => undefined);
    }
  };
  return (
    <div className="flex rounded-xl border border-line bg-surface p-0.5" role="group" aria-label={t('common.language')}>
      {(['vi', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => change(l)}
          aria-pressed={lang === l}
          className={cx('min-h-10 min-w-11 rounded-lg px-2 text-xs font-bold uppercase', lang === l ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function AppHeader() {
  const { t } = useTranslation();
  const { role, me, signOut, firebaseUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = navFor(role, t);
  const name = me?.user?.displayName ?? firebaseUser?.email ?? '';
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        <Link to={homePathForRole(role)} className="flex min-h-11 items-center gap-2 font-bold tracking-tight">
          <Logo />
          <span className="hidden font-serif text-lg sm:inline">English Detective</span>
          <span className="font-serif sm:hidden">Detective</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label={t('nav.main')}>
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:text-fg')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle />
          {firebaseUser && (
            <>
              <span className="hidden max-w-40 truncate text-sm text-muted lg:inline" title={name}>
                {name}
              </span>
              <button type="button" onClick={() => void signOut()} className="hidden min-h-10 rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg md:inline-flex md:items-center">
                {t('nav.signOut')}
              </button>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-xl border border-line md:hidden"
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                aria-label={t('nav.menu')}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
      {menuOpen && firebaseUser && (
        <nav id="mobile-nav" className="border-t border-line px-4 py-2 md:hidden" aria-label={t('nav.main')}>
          <ul className="flex flex-col">
            {nav.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => cx('flex min-h-11 items-center rounded-lg px-3 font-medium', isActive ? 'bg-primary-soft text-primary' : 'text-fg')}
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
            <li className="mt-1 border-t border-line pt-1">
              <div className="px-3 py-1 text-xs text-muted">{name}</div>
              <button type="button" onClick={() => void signOut()} className="flex min-h-11 w-full items-center rounded-lg px-3 font-medium text-danger">
                {t('nav.signOut')}
              </button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

/** Agency badge: magnifying glass over a case file. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1f3550" />
      <path d="M12 20h16l4 4h20v26a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="#e8cf92" />
      <circle cx="30" cy="36" r="9" fill="#fffdf7" stroke="#1f3550" strokeWidth="3.5" />
      <path d="M37 43l8 8" stroke="#1f3550" strokeWidth="5" strokeLinecap="round" />
      <path d="M26 36h8" stroke="#c0392b" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const loc = useLocation();
  const wide = loc.pathname.startsWith('/investigate') || loc.pathname.startsWith('/office');
  const workspace = loc.pathname.startsWith('/investigate');
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        {t('nav.skip')}
      </a>
      <AppHeader />
      <main id="main" className={cx('mx-auto w-full min-w-0 flex-1 px-4', workspace ? 'pt-3 pb-24 lg:pb-6' : 'py-5 sm:py-8', wide ? 'max-w-7xl' : 'max-w-6xl')}>
        <Outlet />
      </main>
      {!workspace && <footer className="border-t border-line py-4 text-center text-xs text-muted">English Detective · {t('footer.note')}</footer>}
    </div>
  );
}
