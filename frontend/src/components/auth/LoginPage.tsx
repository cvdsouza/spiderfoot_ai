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
        'AUTH FAILED — CHECK CREDENTIALS';
      setError(msg.toUpperCase());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--sf-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient background */}
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 20%, #071428 0%, #030508 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: '15%', left: '10%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, #00B4FF08 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none', animation: 'sf-float 9s ease-in-out infinite' }} />
      <div className="sf-grid" style={{ position: 'fixed', inset: 0, opacity: 0.06, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '360px' }}>
        {/* Logo block */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '52px', height: '52px',
            background: 'var(--sf-primary-dim)',
            border: '1px solid rgba(0,180,255,0.25)',
            borderRadius: '4px',
            fontSize: '26px',
            color: 'var(--sf-primary)',
            marginBottom: '16px',
            animation: 'sf-glow 3s ease-in-out infinite',
          }}>
            ⬡
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--sf-text)', letterSpacing: '0.3em', lineHeight: 1 }}>SPIDERFOOT</div>
          <div style={{ fontSize: '9px', color: 'var(--sf-primary)', letterSpacing: '0.35em', marginTop: '4px' }}>AI OSINT PLATFORM</div>
        </div>

        {/* Login card */}
        <div style={{
          background: 'var(--sf-bg-surface)',
          border: '1px solid var(--sf-border-dim)',
          borderTop: '1px solid rgba(0,180,255,0.2)',
          borderRadius: '3px',
          padding: '28px',
        }}>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--sf-text-dim)', marginBottom: '20px', textAlign: 'center' }}>
            AUTHENTICATION REQUIRED
          </div>

          {error && (
            <div style={{
              background: 'var(--sf-critical-bg)',
              border: '1px solid rgba(255,59,48,0.3)',
              borderLeft: '2px solid var(--sf-critical)',
              borderRadius: '2px',
              padding: '8px 10px',
              fontSize: '9px',
              letterSpacing: '0.06em',
              color: 'var(--sf-critical)',
              marginBottom: '16px',
            }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '8px', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--sf-text-faint)', marginBottom: '5px' }}>
                USERNAME
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'var(--sf-bg)',
                  border: '1px solid var(--sf-border-dim)',
                  borderRadius: '2px',
                  color: 'var(--sf-text)',
                  fontSize: '11px',
                  letterSpacing: '0.04em',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--sf-primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--sf-border-dim)')}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '8px', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--sf-text-faint)', marginBottom: '5px' }}>
                PASSWORD
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'var(--sf-bg)',
                  border: '1px solid var(--sf-border-dim)',
                  borderRadius: '2px',
                  color: 'var(--sf-text)',
                  fontSize: '11px',
                  letterSpacing: '0.04em',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--sf-primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--sf-border-dim)')}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              style={{
                width: '100%',
                padding: '10px',
                background: loading || !username || !password ? 'var(--sf-primary-dim)' : 'rgba(0,180,255,0.12)',
                border: `1px solid ${loading || !username || !password ? 'rgba(0,180,255,0.2)' : 'var(--sf-primary)'}`,
                borderRadius: '2px',
                color: loading || !username || !password ? 'var(--sf-text-dim)' : 'var(--sf-primary)',
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                cursor: loading || !username || !password ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {loading && <span style={{ display: 'inline-block', animation: 'sf-spin 1s linear infinite' }}>◌</span>}
              {loading ? 'AUTHENTICATING...' : 'ACCESS PLATFORM'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '8px', color: 'var(--sf-text-faint)', letterSpacing: '0.1em' }}>
          SPIDERFOOT AI · OPEN SOURCE INTELLIGENCE
        </div>
      </div>
    </div>
  );
}
