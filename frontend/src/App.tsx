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
import BiAnalyticsPage from './pages/BiAnalyticsPage';
import AppSidebarLayout from './components/AppSidebar';
import { FilterProvider } from './shared/context/FilterContext';

function WithSidebar({ children }: { children: React.ReactNode }) {
  return (
    <FilterProvider>
      <AppSidebarLayout>{children}</AppSidebarLayout>
    </FilterProvider>
  );
}

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
          <Route path="/admin/clients" element={<WithSidebar><AdminClientsPage /></WithSidebar>} />
          <Route path="/admin/notifications" element={<WithSidebar><AdminNotificationsPage /></WithSidebar>} />
          <Route path="/admin/analytics/:accountId" element={<WithSidebar><BiAnalyticsPage /></WithSidebar>} />
          <Route path="/admin/bi/:accountId" element={<WithSidebar><BiAnalyticsPage /></WithSidebar>} />
          <Route path="/admin/stats/:accountId" element={<WithSidebar><BiAnalyticsPage defaultTab="time_stages" /></WithSidebar>} />
          <Route path="/admin/stage/:stageId" element={<WithSidebar><StageLeadsPage /></WithSidebar>} />
          <Route path="/admin/lead/:leadId" element={<WithSidebar><LeadDetailPage /></WithSidebar>} />
          <Route path="/admin/search/:accountId" element={<WithSidebar><SearchPage /></WithSidebar>} />
        </>
      )}
      {role === 'viewer' && (
        <>
          <Route path="/analytics" element={<WithSidebar><BiAnalyticsPage /></WithSidebar>} />
          <Route path="/bi" element={<WithSidebar><BiAnalyticsPage /></WithSidebar>} />
          <Route path="/stats" element={<WithSidebar><BiAnalyticsPage defaultTab="time_stages" /></WithSidebar>} />
          <Route path="/stage/:stageId" element={<WithSidebar><StageLeadsPage /></WithSidebar>} />
          <Route path="/lead/:leadId" element={<WithSidebar><LeadDetailPage /></WithSidebar>} />
          <Route path="/search" element={<WithSidebar><SearchPage /></WithSidebar>} />
        </>
      )}
      <Route
        path="*"
        element={<Navigate to={role === 'admin' ? '/admin/clients' : role === 'viewer' ? '/bi' : '/login'} replace />}
      />
    </Routes>
  );
}
