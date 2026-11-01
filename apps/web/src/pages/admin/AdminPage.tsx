import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider';
import { PageHeader, cx } from '../../components/ui';
import { CaseBank } from '../cases/CaseBank';
import { OverviewTab } from './OverviewTab';
import { UsersTab } from './UsersTab';
import { CoursesTab } from './CoursesTab';
import { SettingsTab } from './SettingsTab';
import { UsageTab } from './UsageTab';
import { AuditTab } from './AuditTab';
import { SchoolTab } from './SchoolTab';

const TABS = ['overview', 'users', 'courses', 'cases', 'ai', 'usage', 'audit', 'school'] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const { tab } = useParams();
  const { t } = useTranslation();
  const { me } = useAuth();
  if (!TABS.includes(tab as Tab)) return <Navigate to="/admin/overview" replace />;
  const current = tab as Tab;
  return (
    <div>
      <PageHeader title={t('admin.title')} subtitle={me?.tenant?.name} />
      <nav className="-mx-4 mb-6 overflow-x-auto px-4" aria-label={t('admin.title')}>
        <ul className="flex min-w-max gap-1 border-b border-line">
          {TABS.map((x) => (
            <li key={x}>
              <NavLink
                to={`/admin/${x}`}
                data-testid={`admin-tab-${x}`}
                className={({ isActive }) =>
                  cx('-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap', isActive ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg')
                }
              >
                {t(`admin.tabs.${x}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {current === 'overview' && <OverviewTab />}
      {current === 'users' && <UsersTab />}
      {current === 'courses' && <CoursesTab />}
      {current === 'cases' && <CaseBank canAdmin />}
      {current === 'ai' && <SettingsTab />}
      {current === 'usage' && <UsageTab />}
      {current === 'audit' && <AuditTab />}
      {current === 'school' && <SchoolTab />}
    </div>
  );
}
