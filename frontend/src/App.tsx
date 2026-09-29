import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { useLanguage } from './i18n/LanguageContext';
import LoginPage from './pages/LoginPage';
import AdminClientsPage from './pages/AdminClientsPage';
import AdminNotificationsPage from './pages/AdminNotificationsPage';
import StatsPage from './pages/StatsPage';
import StageLeadsPage from './pages/StageLeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import SearchPage from './pages/SearchPage';

export default function App() {
  const { role, loading } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 p-8 flex items-center justify-center">
        {t('loading')}
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {role === 'admin' && (
        <>
          <Route path="/admin/clients" element={<AdminClientsPage />} />
          <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
          <Route path="/admin/stats/:accountId" element={<StatsPage />} />
          <Route path="/admin/stage/:stageId" element={<StageLeadsPage />} />
          <Route path="/admin/lead/:leadId" element={<LeadDetailPage />} />
          <Route path="/admin/search/:accountId" element={<SearchPage />} />
        </>
      )}
      {role === 'viewer' && (
        <>
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/stage/:stageId" element={<StageLeadsPage />} />
          <Route path="/lead/:leadId" element={<LeadDetailPage />} />
          <Route path="/search" element={<SearchPage />} />
        </>
      )}
      <Route
        path="*"
        element={<Navigate to={role === 'admin' ? '/admin/clients' : role === 'viewer' ? '/stats' : '/login'} replace />}
      />
    </Routes>
  );
}
