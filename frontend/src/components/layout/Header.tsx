import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { logout as apiLogout } from '../../api/auth';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/scans': 'Scans',
  '/newscan': 'New Scan',
  '/correlation-rules': 'Correlation Rules',
  '/settings': 'Settings',
  '/users': 'Users',
  '/workers': 'Workers',
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pageTitle = location.pathname.startsWith('/scaninfo/')
    ? 'Scan Details'
    : PAGE_TITLES[location.pathname] ?? 'SpiderFoot AI';

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

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
      {/* Page title */}
      <h1 className="text-base font-semibold text-[var(--sf-text)]">{pageTitle}</h1>

      {/* Right side: user menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[var(--sf-text)] hover:bg-[var(--sf-bg)] transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-[var(--sf-primary)] flex items-center justify-center text-white text-xs font-bold">
            {(user?.display_name || user?.username || 'U')
              .split(' ')
              .map((w) => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <span className="font-medium hidden sm:block">{user?.display_name || user?.username}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-[var(--sf-text-muted)]">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg-card)] shadow-lg py-1 z-50">
            <div className="px-3 py-2.5 border-b border-[var(--sf-border)]">
              <div className="text-sm font-medium text-[var(--sf-text)]">
                {user?.display_name || user?.username}
              </div>
              <div className="text-xs text-[var(--sf-text-muted)] capitalize">
                {user?.roles?.[0] ?? ''}
              </div>
            </div>
            <button
              onClick={() => { setMenuOpen(false); navigate('/settings'); }}
              className="w-full text-left px-3 py-2 text-sm text-[var(--sf-text)] hover:bg-[var(--sf-bg)] transition-colors"
            >
              Change Password
            </button>
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[var(--sf-bg)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
