import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const authLogin = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resp = await login(username, password);
      authLogin(resp.token, resp.user);
      navigate('/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--sf-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* Logo */}
          <div className="flex justify-center mb-4">
            <img
              src="/logo.svg"
              alt="SpiderFoot AI"
              className="w-24 h-24 animate-pulse-subtle"
            />
          </div>

          <h1 className="text-3xl font-bold text-[var(--sf-text)]">
            <span className="text-[var(--sf-accent)]">Spider</span>Foot <span className="text-[var(--sf-accent)] text-xl">AI</span>
          </h1>
          <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
            Open Source Intelligence Automation
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-[var(--sf-text)] text-center">Sign In</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-[var(--sf-text-secondary)] mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              className="w-full px-3 py-2 rounded border border-[var(--sf-border)] bg-[var(--sf-bg)] text-[var(--sf-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-accent)]/50 focus:border-[var(--sf-accent)]"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--sf-text-secondary)] mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded border border-[var(--sf-border)] bg-[var(--sf-bg)] text-[var(--sf-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-accent)]/50 focus:border-[var(--sf-accent)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-2 px-4 rounded font-medium bg-[var(--sf-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
