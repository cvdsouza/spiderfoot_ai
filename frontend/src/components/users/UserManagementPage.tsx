import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUsers, listRoles, createUser, updateUser, deleteUser, resetUserPassword } from '../../api/users';
import { useAuthStore } from '../../stores/authStore';
import UserForm from './UserForm';
import type { UserRecord, RoleInfo } from '../../types';

const inputStyle = {
  background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px',
  padding: '6px 10px', color: '#F4F4F5', fontSize: '11px', outline: 'none',
  fontFamily: 'inherit', width: '120px',
};

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
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);

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
        setSuccess('User created.');
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
        setSuccess('User updated.');
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
        setSuccess('User deactivated.');
        setDeletePendingId(null);
        queryClient.invalidateQueries({ queryKey: ['users'] });
      } else {
        setError(result[1]);
      }
    },
    onError: () => setError('Failed to disable user'),
  });

  const resetPwMutation = useMutation({
    mutationFn: ({ id, pw }: { id: string; pw: string }) => resetUserPassword(id, pw),
    onSuccess: (result) => {
      if (result[0] === 'SUCCESS') {
        setResetPwId(null);
        setNewPw('');
        setSuccess('Password reset.');
      } else {
        setError(result[1]);
      }
    },
    onError: () => setError('Failed to reset password'),
  });

  function startEdit(user: UserRecord) {
    setEditingId(user.id);
    const roleIds = user.roles
      .map((name) => roles.find((r) => r.name === name)?.id)
      .filter(Boolean) as string[];
    setEditRoles(roleIds);
  }

  function toggleEditRole(roleId: string) {
    setEditRoles((prev) => (prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]));
  }

  if (error || success) {
    setTimeout(() => { setError(''); setSuccess(''); }, 3000);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '4px' }}>
            ACCESS CONTROL
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#F4F4F5', letterSpacing: '0.05em' }}>
            USER MANAGEMENT
          </h1>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              background: '#00B4FF', color: '#000', padding: '8px 16px',
              borderRadius: '2px', fontSize: '11px', fontWeight: 700,
              letterSpacing: '0.12em', border: 'none', cursor: 'pointer',
            }}
          >
            + CREATE USER
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#280A08', borderLeft: '3px solid #FF3B30', fontSize: '11px', color: '#FF3B30' }}>
          ⚠ {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#001A08', borderLeft: '3px solid #32D74B', fontSize: '11px', color: '#32D74B' }}>
          ✓ {success}
        </div>
      )}

      {showForm && (
        <div style={{ marginBottom: '20px', background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px', padding: '16px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '12px' }}>CREATE NEW USER</div>
          <UserForm
            roles={roles}
            loading={createMutation.isPending}
            onSubmit={async (data) => { setError(''); await createMutation.mutateAsync(data); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {usersLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #00B4FF30', borderTopColor: '#00B4FF', animation: 'sf-spin 1.2s linear infinite' }} />
        </div>
      ) : (
        <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#060A0F', borderBottom: '1px solid #18181B' }}>
                {['USERNAME', 'DISPLAY NAME', 'ROLES', 'STATUS', 'ACTIONS'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #0D1117' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 12px', color: '#F4F4F5', fontWeight: 600 }}>{u.username}</td>
                  <td style={{ padding: '10px 12px', color: '#A1A1AA' }}>{u.display_name || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {editingId === u.id ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {roles.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => toggleEditRole(role.id)}
                            style={{
                              padding: '3px 8px', borderRadius: '2px',
                              fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
                              background: editRoles.includes(role.id) ? '#00B4FF' : '#060A0F',
                              color: editRoles.includes(role.id) ? '#000' : '#52525B',
                              border: `1px solid ${editRoles.includes(role.id) ? '#00B4FF' : '#27272A'}`,
                            }}
                          >
                            {role.name.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {u.roles.map((role) => (
                          <span
                            key={role}
                            style={{ background: '#001828', color: '#00B4FF', border: '1px solid #00B4FF30', borderRadius: '2px', padding: '2px 6px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em' }}
                          >
                            {role.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: u.is_active ? '#001A08' : '#280A08',
                      color: u.is_active ? '#32D74B' : '#FF3B30',
                      border: `1px solid ${u.is_active ? '#32D74B40' : '#FF3B3040'}`,
                      borderRadius: '2px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
                    }}>
                      {u.is_active ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {editingId === u.id ? (
                        <>
                          <button
                            onClick={() => updateMutation.mutate({ id: u.id, body: { role_ids: editRoles } })}
                            style={{ background: '#001A08', color: '#32D74B', border: '1px solid #32D74B40', padding: '4px 10px', borderRadius: '2px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}
                          >
                            SAVE
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            style={{ background: 'none', color: '#52525B', border: '1px solid #27272A', padding: '4px 10px', borderRadius: '2px', fontSize: '9px', cursor: 'pointer' }}
                          >
                            CANCEL
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(u)}
                            style={{ background: 'none', color: '#52525B', border: '1px solid #27272A', padding: '4px 10px', borderRadius: '2px', fontSize: '9px', letterSpacing: '0.08em', cursor: 'pointer' }}
                          >
                            ROLES
                          </button>
                          {resetPwId === u.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="password"
                                value={newPw}
                                onChange={(e) => setNewPw(e.target.value)}
                                placeholder="new password"
                                style={inputStyle}
                              />
                              <button
                                onClick={() => resetPwMutation.mutate({ id: u.id, pw: newPw })}
                                disabled={newPw.length < 8}
                                style={{ background: newPw.length < 8 ? '#060A0F' : '#00B4FF', color: newPw.length < 8 ? '#3F3F46' : '#000', border: 'none', padding: '6px 10px', borderRadius: '2px', fontSize: '9px', fontWeight: 700, cursor: newPw.length < 8 ? 'not-allowed' : 'pointer' }}
                              >
                                SET
                              </button>
                              <button onClick={() => { setResetPwId(null); setNewPw(''); }} style={{ background: 'none', color: '#52525B', border: 'none', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setResetPwId(u.id)}
                              style={{ background: 'none', color: '#52525B', border: '1px solid #27272A', padding: '4px 10px', borderRadius: '2px', fontSize: '9px', letterSpacing: '0.08em', cursor: 'pointer' }}
                            >
                              RESET PW
                            </button>
                          )}
                          {u.id !== currentUser?.id && u.is_active && (
                            deletePendingId === u.id ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => deleteMutation.mutate(u.id)} style={{ background: '#280A08', color: '#FF3B30', border: '1px solid #FF3B3040', padding: '4px 8px', borderRadius: '2px', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}>CONFIRM</button>
                                <button onClick={() => setDeletePendingId(null)} style={{ background: 'none', color: '#52525B', border: '1px solid #27272A', padding: '4px 8px', borderRadius: '2px', fontSize: '9px', cursor: 'pointer' }}>✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeletePendingId(u.id)}
                                style={{ background: 'none', color: '#FF3B3060', border: '1px solid #FF3B3020', padding: '4px 10px', borderRadius: '2px', fontSize: '9px', letterSpacing: '0.08em', cursor: 'pointer' }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#FF3B30'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#FF3B3050'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#FF3B3060'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#FF3B3020'; }}
                              >
                                DISABLE
                              </button>
                            )
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
