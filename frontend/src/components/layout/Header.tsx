import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import { logout as apiLogout } from '../../api/auth';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useThemeStore();
  const { user, logout, hasPermission, hasRole } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const navItems: { to: string; label: string; show: boolean }[] = [
    { to: '/scans', label: 'Scans', show: true },
    { to: '/newscan', label: 'New Scan', show: hasPermission('scans', 'create') },
    { to: '/correlation-rules', label: 'Rules', show: true },
    { to: '/settings', label: 'Settings', show: hasPermission('settings', 'read') },
    { to: '/users', label: 'Users', show: hasRole('administrator') },
    { to: '/workers', label: 'Workers', show: hasRole('administrator') },
  ];

  async function handleLogout() {
    setMenuOpen(false);
    await apiLogout();
    logout();
    navigate('/login');
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--sf-border)] bg-[var(--sf-bg)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-bold text-[var(--sf-primary)]">
            SpiderFoot
          </Link>
          <nav className="flex gap-1">
            {navItems
              .filter((item) => item.show)
              .map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    location.pathname === item.to
                      ? 'bg-[var(--sf-primary)] text-white'
                      : 'text-[var(--sf-text-muted)] hover:bg-[var(--sf-bg-secondary)] hover:text-[var(--sf-text)]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            className="rounded-md p-2 text-[var(--sf-text-muted)] hover:bg-[var(--sf-bg-secondary)]"
            aria-label="Toggle theme"
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)] transition-colors"
            >
              <span className="font-medium">{user?.display_name || user?.username || 'User'}</span>
              <span className="text-xs text-[var(--sf-accent)] capitalize bg-[var(--sf-accent)]/10 px-1.5 py-0.5 rounded">
                {user?.roles?.[0] ?? ''}
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-card)] shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-[var(--sf-border)]">
                  <div className="text-sm font-medium text-[var(--sf-text)]">{user?.username}</div>
                  <div className="text-xs text-[var(--sf-text-secondary)]">{user?.email || 'No email'}</div>
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)]"
                >
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[var(--sf-bg-secondary)]"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
