import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { logout as apiLogout } from '../../api/auth';

const PAGE_TITLES: Record<string, string> = {
  '/':                  'DASHBOARD',
  '/scans':             'SCAN QUEUE',
  '/newscan':           'NEW SCAN',
  '/correlation-rules': 'CORRELATION RULES',
  '/settings':          'SETTINGS',
  '/users':             'USER MANAGEMENT',
  '/workers':           'WORKER NODES',
};

function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2, '0');
      const m = String(now.getUTCMinutes()).padStart(2, '0');
      const s = String(now.getUTCSeconds()).padStart(2, '0');
      setTime(`${h}:${m}:${s} UTC`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ fontSize: '10px', color: 'var(--sf-text-dim)', letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums', minWidth: '80px', textAlign: 'right' }}>
      {time}
    </span>
  );
}

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pageTitle = location.pathname.startsWith('/scaninfo/')
    ? 'SCAN DETAIL'
    : PAGE_TITLES[location.pathname] ?? 'SPIDERFOOT AI';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await apiLogout();
    logout();
    navigate('/login');
  }

  const initials = (user?.display_name || user?.username || 'U')
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header
      className="sf-scanline"
      style={{
        height: '44px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'var(--sf-bg-surface)',
        borderBottom: '1px solid var(--sf-border)',
        position: 'relative',
      }}
    >
      {/* Page title */}
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--sf-text-dim)', letterSpacing: '0.22em' }}>
        {pageTitle}
      </span>

      {/* Right: clock + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <LiveClock />

        {/* User menu */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: `1px solid ${menuOpen ? 'var(--sf-border-dim)' : 'transparent'}`,
              borderRadius: '2px',
              padding: '4px 8px',
              cursor: 'pointer',
              color: 'var(--sf-text-muted)',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{
              width: '20px', height: '20px',
              borderRadius: '2px',
              background: 'var(--sf-primary-dim)',
              border: '1px solid var(--sf-primary)40',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '8px', fontWeight: 700, color: 'var(--sf-primary)',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <span style={{ fontSize: '9px', letterSpacing: '0.08em', color: 'var(--sf-text-dim)' }}>
              {(user?.display_name || user?.username || '').toUpperCase()}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '10px', height: '10px', color: 'var(--sf-text-faint)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 4px)',
              width: '200px',
              background: 'var(--sf-bg-card)',
              border: '1px solid var(--sf-border-dim)',
              borderRadius: '2px',
              zIndex: 50,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--sf-border)' }}>
                <div style={{ fontSize: '9px', color: 'var(--sf-text)', fontWeight: 700, letterSpacing: '0.1em' }}>
                  {(user?.display_name || user?.username || '').toUpperCase()}
                </div>
                <div style={{ fontSize: '8px', color: 'var(--sf-text-dim)', letterSpacing: '0.08em', marginTop: '1px' }}>
                  {(user?.roles?.[0] ?? '').toUpperCase()}
                </div>
              </div>
              <button
                onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '9px', letterSpacing: '0.08em', color: 'var(--sf-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'block' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                CHANGE PASSWORD
              </button>
              <button
                onClick={handleLogout}
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '9px', letterSpacing: '0.08em', color: 'var(--sf-error)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'block', borderTop: '1px solid var(--sf-border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-critical-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                SIGN OUT
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
