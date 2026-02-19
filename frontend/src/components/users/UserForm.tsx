import { useState, type FormEvent } from 'react';
import type { RoleInfo } from '../../types';

interface UserFormProps {
  roles: RoleInfo[];
  onSubmit: (data: {
    username: string;
    password: string;
    display_name: string;
    email: string;
    role_ids: string[];
  }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export default function UserForm({ roles, onSubmit, onCancel, loading }: UserFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({
      username,
      password,
      display_name: displayName,
      email,
      role_ids: selectedRoles,
    });
  }

  function toggleRole(roleId: string) {
    setSelectedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId],
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--sf-text-secondary)] mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            pattern="^[a-zA-Z0-9_.\-]+$"
            className="w-full px-3 py-2 rounded border border-[var(--sf-border)] bg-[var(--sf-bg)] text-[var(--sf-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-accent)]/50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--sf-text-secondary)] mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 rounded border border-[var(--sf-border)] bg-[var(--sf-bg)] text-[var(--sf-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-accent)]/50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--sf-text-secondary)] mb-1">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 rounded border border-[var(--sf-border)] bg-[var(--sf-bg)] text-[var(--sf-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-accent)]/50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--sf-text-secondary)] mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded border border-[var(--sf-border)] bg-[var(--sf-bg)] text-[var(--sf-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-accent)]/50"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--sf-text-secondary)] mb-2">Roles</label>
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => toggleRole(role.id)}
              className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                selectedRoles.includes(role.id)
                  ? 'bg-[var(--sf-accent)] text-white border-[var(--sf-accent)]'
                  : 'border-[var(--sf-border)] text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)]'
              }`}
            >
              {role.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || !username || !password}
          className="px-4 py-2 rounded font-medium bg-[var(--sf-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? 'Creating...' : 'Create User'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded font-medium border border-[var(--sf-border)] text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
