import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageSkeleton } from './components/ui';
import { HomeRedirect, RequireAuth, RequireRole } from './auth/guards';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import WorldPage from './pages/student/WorldPage';

const QuestPage = lazy(() => import('./pages/student/QuestPage'));
const PlayPage = lazy(() => import('./pages/student/PlayPage'));
const ExamsPage = lazy(() => import('./pages/student/ExamsPage'));
const ExamLobbyPage = lazy(() => import('./pages/student/ExamsPage').then((m) => ({ default: m.ExamLobbyPage })));
const ExamPage = lazy(() => import('./pages/student/ExamPage'));
const ResultsPage = lazy(() => import('./pages/student/ResultsPage'));
const ChampionshipsPage = lazy(() => import('./pages/student/ChampionshipsPage'));
const LeaderboardPage = lazy(() => import('./pages/student/ChampionshipsPage').then((m) => ({ default: m.LeaderboardPage })));
const ProfilePage = lazy(() => import('./pages/student/ProfilePage'));
const CoachPage = lazy(() => import('./pages/student/CoachPage'));
const HistoryPage = lazy(() => import('./pages/student/HistoryPage'));
const TeacherHome = lazy(() => import('./pages/teacher/TeacherHome'));
const ClassPage = lazy(() => import('./pages/teacher/ClassPage'));
const TeacherStudentPage = lazy(() => import('./pages/teacher/StudentPage'));
const AttemptReviewPage = lazy(() => import('./pages/teacher/AttemptReviewPage'));
const ReviewQueuePage = lazy(() => import('./pages/teacher/ReviewQueuePage'));
const TeacherChampionshipsPage = lazy(() => import('./pages/teacher/TeacherChampionshipsPage'));
const TeacherLeaderboardPage = lazy(() => import('./pages/teacher/TeacherChampionshipsPage').then((m) => ({ default: m.TeacherLeaderboardPage })));
const ContentBankPage = lazy(() => import('./pages/content/ContentBank'));
const ContentDetailPage = lazy(() => import('./pages/content/ContentDetailPage'));
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
              <Route path="world" element={<WorldPage />} />
              <Route path="quests/:id" element={<QuestPage />} />
              <Route path="play/:attemptId" element={<PlayPage />} />
              <Route path="exams" element={<ExamsPage />} />
              <Route path="exams/:examId" element={<ExamLobbyPage />} />
              <Route path="exam/:attemptId" element={<ExamPage />} />
              <Route path="results/:attemptId" element={<ResultsPage />} />
              <Route path="championships" element={<ChampionshipsPage />} />
              <Route path="championships/:id" element={<LeaderboardPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="history" element={<HistoryPage />} />
            </Route>
            <Route element={<RequireRole roles={['student']} />}>
              <Route path="coach" element={<CoachPage />} />
            </Route>
            <Route element={<RequireRole roles={[...STAFF]} />}>
              <Route path="teacher" element={<TeacherHome />} />
              <Route path="teacher/classes/:id" element={<ClassPage />} />
              <Route path="teacher/students/:uid" element={<TeacherStudentPage />} />
              <Route path="teacher/attempts/:id" element={<AttemptReviewPage />} />
              <Route path="teacher/review" element={<ReviewQueuePage />} />
              <Route path="teacher/championships" element={<TeacherChampionshipsPage />} />
              <Route path="teacher/championships/:id" element={<TeacherLeaderboardPage />} />
              <Route path="content" element={<ContentBankPage />} />
              <Route path="content/:kind/:id" element={<ContentDetailPage />} />
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
