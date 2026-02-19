import { useAuthStore } from '../stores/authStore';

export function usePermission(resource: string, action: string): boolean {
  return useAuthStore((s) => s.hasPermission)(resource, action);
}

export function useRole(role: string): boolean {
  return useAuthStore((s) => s.hasRole)(role);
}
