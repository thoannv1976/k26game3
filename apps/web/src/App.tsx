import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageSkeleton } from './components/ui';
import { HomeRedirect, RequireAuth, RequireRole } from './auth/guards';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OfficePage } from './pages/OfficePage';
import { CaseBriefingPage } from './pages/CaseBriefingPage';

const InvestigatePage = lazy(() => import('./pages/investigate/InvestigatePage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const AcademyPage = lazy(() => import('./pages/AcademyPage'));
const TeacherHome = lazy(() => import('./pages/teacher/TeacherHome'));
const ClassPage = lazy(() => import('./pages/teacher/ClassPage'));
const TeacherStudentPage = lazy(() => import('./pages/teacher/StudentPage'));
const SessionReviewPage = lazy(() => import('./pages/teacher/SessionReviewPage'));
const TeacherCasesPage = lazy(() => import('./pages/teacher/TeacherCasesPage'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const PlatformPage = lazy(() => import('./pages/platform/PlatformPage'));

const MEMBERS = ['student', 'teacher', 'school_admin'] as const;
const STAFF = ['teacher', 'school_admin'] as const;

export function App() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl p-6"><PageSkeleton /></div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<HomeRedirect />} />
            <Route element={<RequireRole roles={[...MEMBERS]} />}>
              <Route path="office" element={<OfficePage />} />
              <Route path="student" element={<Navigate to="/office" replace />} />
              <Route path="cases/:id" element={<CaseBriefingPage />} />
              <Route path="investigate/:sessionId" element={<InvestigatePage />} />
              <Route path="results/:sessionId" element={<ResultsPage />} />
              <Route path="academy" element={<AcademyPage />} />
            </Route>
            <Route element={<RequireRole roles={[...STAFF]} />}>
              <Route path="teacher" element={<TeacherHome />} />
              <Route path="teacher/classes/:id" element={<ClassPage />} />
              <Route path="teacher/students/:uid" element={<TeacherStudentPage />} />
              <Route path="teacher/sessions/:id" element={<SessionReviewPage />} />
              <Route path="teacher/cases" element={<TeacherCasesPage />} />
            </Route>
            <Route element={<RequireRole roles={['school_admin']} />}>
              <Route path="admin" element={<Navigate to="/admin/overview" replace />} />
              <Route path="admin/:tab" element={<AdminPage />} />
            </Route>
            <Route element={<RequireRole roles={['platform_admin']} />}>
              <Route path="platform" element={<PlatformPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
