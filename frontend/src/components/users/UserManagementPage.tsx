import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUsers, listRoles, createUser, updateUser, deleteUser, resetUserPassword } from '../../api/users';
import { useAuthStore } from '../../stores/authStore';
import UserForm from './UserForm';
import type { UserRecord, RoleInfo } from '../../types';

export default function UserManagementPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [resetPwId, setResetPwId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');

  const { data: users = [], isLoading: usersLoading } = useQuery<UserRecord[]>({
    queryKey: ['users'],
    queryFn: listUsers,
  });

  const { data: roles = [] } = useQuery<RoleInfo[]>({
    queryKey: ['roles'],
    queryFn: listRoles,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createUser>[0]) => createUser(data),
    onSuccess: (result) => {
      if (result[0] === 'SUCCESS') {
        setShowForm(false);
        setSuccess('User created successfully');
        queryClient.invalidateQueries({ queryKey: ['users'] });
      } else {
        setError(result[1] as string);
      }
    },
    onError: () => setError('Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateUser>[1] }) => updateUser(id, body),
    onSuccess: (result) => {
      if (result[0] === 'SUCCESS') {
        setEditingId(null);
        setSuccess('User updated');
        queryClient.invalidateQueries({ queryKey: ['users'] });
      } else {
        setError(result[1] as string);
      }
    },
    onError: () => setError('Failed to update user'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: (result) => {
      if (result[0] === 'SUCCESS') {
        setSuccess('User deactivated');
        queryClient.invalidateQueries({ queryKey: ['users'] });
      } else {
        setError(result[1]);
      }
    },
    onError: () => setError('Failed to delete user'),
  });

  const resetPwMutation = useMutation({
    mutationFn: ({ id, pw }: { id: string; pw: string }) => resetUserPassword(id, pw),
    onSuccess: (result) => {
      if (result[0] === 'SUCCESS') {
        setResetPwId(null);
        setNewPw('');
        setSuccess('Password reset successfully');
      } else {
        setError(result[1]);
      }
    },
    onError: () => setError('Failed to reset password'),
  });

  function startEdit(user: UserRecord) {
    setEditingId(user.id);
    // Map role names to role IDs
    const roleIds = user.roles
      .map((name) => roles.find((r) => r.name === name)?.id)
      .filter(Boolean) as string[];
    setEditRoles(roleIds);
  }

  function toggleEditRole(roleId: string) {
    setEditRoles((prev) => (prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]));
  }

  function saveEdit(user: UserRecord) {
    updateMutation.mutate({ id: user.id, body: { role_ids: editRoles } });
  }

  // Clear messages after 3 seconds
  if (error || success) {
    setTimeout(() => {
      setError('');
      setSuccess('');
    }, 3000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--sf-text)]">User Management</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded font-medium bg-[var(--sf-accent)] text-white hover:opacity-90 transition-opacity"
          >
            Create User
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded px-3 py-2">
          {success}
        </div>
      )}

      {showForm && (
        <div className="mb-6 bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold text-[var(--sf-text)] mb-4">Create New User</h2>
          <UserForm
            roles={roles}
            loading={createMutation.isPending}
            onSubmit={async (data) => {
              setError('');
              await createMutation.mutateAsync(data);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {usersLoading ? (
        <div className="text-[var(--sf-text-secondary)]">Loading users...</div>
      ) : (
        <div className="bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--sf-border)]">
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Username</th>
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Display Name</th>
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Roles</th>
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Status</th>
                <th className="text-right px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--sf-border)] last:border-0">
                  <td className="px-4 py-3 text-[var(--sf-text)] font-medium">{u.username}</td>
                  <td className="px-4 py-3 text-[var(--sf-text)]">{u.display_name || '-'}</td>
                  <td className="px-4 py-3">
                    {editingId === u.id ? (
                      <div className="flex flex-wrap gap-1">
                        {roles.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => toggleEditRole(role.id)}
                            className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                              editRoles.includes(role.id)
                                ? 'bg-[var(--sf-accent)] text-white border-[var(--sf-accent)]'
                                : 'border-[var(--sf-border)] text-[var(--sf-text-secondary)]'
                            }`}
                          >
                            {role.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((role) => (
                          <span
                            key={role}
                            className="text-xs font-medium px-2 py-0.5 rounded bg-[var(--sf-accent)]/10 text-[var(--sf-accent)] capitalize"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        u.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editingId === u.id ? (
                        <>
                          <button
                            onClick={() => saveEdit(u)}
                            className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs px-2 py-1 rounded bg-[var(--sf-bg-secondary)] text-[var(--sf-text-secondary)]"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(u)}
                            className="text-xs px-2 py-1 rounded text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-secondary)]"
                          >
                            Edit Roles
                          </button>
                          {resetPwId === u.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="password"
                                value={newPw}
                                onChange={(e) => setNewPw(e.target.value)}
                                placeholder="New password"
                                className="w-28 px-2 py-1 text-xs rounded border border-[var(--sf-border)] bg-[var(--sf-bg)] text-[var(--sf-text)]"
                              />
                              <button
                                onClick={() => resetPwMutation.mutate({ id: u.id, pw: newPw })}
                                disabled={newPw.length < 8}
                                className="text-xs px-2 py-1 rounded bg-[var(--sf-accent)] text-white disabled:opacity-50"
                              >
                                Set
                              </button>
                              <button
                                onClick={() => {
                                  setResetPwId(null);
                                  setNewPw('');
                                }}
                                className="text-xs px-2 py-1 rounded text-[var(--sf-text-secondary)]"
                              >
                                X
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setResetPwId(u.id)}
                              className="text-xs px-2 py-1 rounded text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-secondary)]"
                            >
                              Reset PW
                            </button>
                          )}
                          {u.id !== currentUser?.id && u.is_active && (
                            <button
                              onClick={() => {
                                if (confirm(`Deactivate user "${u.username}"?`)) {
                                  deleteMutation.mutate(u.id);
                                }
                              }}
                              className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-500/10"
                            >
                              Disable
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
