import api from './client';
import type { LoginResponse, UserInfo } from '../types';

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { username, password });
  return data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Ignore errors on logout — client will clear token regardless
  }
}

export async function getMe(): Promise<UserInfo> {
  const { data } = await api.get<UserInfo>('/auth/me');
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<[string, string]> {
  const { data } = await api.put<[string, string]>('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
}
