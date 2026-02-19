import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/layout/Layout';
import LoginPage from './components/auth/LoginPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Welcome from './components/dashboard/Welcome';
import ScanList from './components/scans/ScanList';
import ScanInfo from './components/scans/ScanInfo';
import NewScan from './components/scans/NewScan';
import CorrelationRulesPage from './components/correlations/CorrelationRulesPage';
import SettingsPage from './components/settings/SettingsPage';
import UserManagementPage from './components/users/UserManagementPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Welcome />} />
              <Route path="/scans" element={<ScanList />} />
              <Route path="/newscan" element={<NewScan />} />
              <Route path="/scaninfo/:id" element={<ScanInfo />} />
              <Route path="/correlation-rules" element={<CorrelationRulesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/users" element={<UserManagementPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
