import api from './client';
import type { UserRecord, RoleInfo } from '../types';

export async function listUsers(): Promise<UserRecord[]> {
  const { data } = await api.get<UserRecord[]>('/users');
  return data;
}

export async function getUser(userId: string): Promise<UserRecord> {
  const { data } = await api.get<UserRecord>(`/users/${userId}`);
  return data;
}

export async function createUser(body: {
  username: string;
  password: string;
  display_name?: string;
  email?: string;
  role_ids?: string[];
}): Promise<[string, UserRecord | string]> {
  const { data } = await api.post<[string, UserRecord | string]>('/users', body);
  return data;
}

export async function updateUser(
  userId: string,
  body: {
    display_name?: string;
    email?: string;
    is_active?: boolean;
    role_ids?: string[];
  },
): Promise<[string, UserRecord | string]> {
  const { data } = await api.put<[string, UserRecord | string]>(`/users/${userId}`, body);
  return data;
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<[string, string]> {
  const { data } = await api.put<[string, string]>(`/users/${userId}/password`, {
    new_password: newPassword,
  });
  return data;
}

export async function deleteUser(userId: string): Promise<[string, string]> {
  const { data } = await api.delete<[string, string]>(`/users/${userId}`);
  return data;
}

export async function listRoles(): Promise<RoleInfo[]> {
  const { data } = await api.get<RoleInfo[]>('/roles');
  return data;
}
