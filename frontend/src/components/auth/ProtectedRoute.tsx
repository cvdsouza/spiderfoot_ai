import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

interface ProtectedRouteProps {
  requiredPermission?: { resource: string; action: string };
}

export default function ProtectedRoute({ requiredPermission }: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission.resource, requiredPermission.action)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
