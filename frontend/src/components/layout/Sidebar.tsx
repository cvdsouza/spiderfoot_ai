import { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useSidebarStore } from '../../stores/sidebarStore';
import { useThemeStore } from '../../stores/themeStore';
import { logout as apiLogout } from '../../api/auth';

// ── SVG Icons ──────────────────────────────────────────────────────────────────

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconScans() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconNewScan() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
      <path d="M11 8v6M8 11h6" />
    </svg>
  );
}

function IconRules() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconWorkers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function IconPin({ pinned }: { pinned: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M12 17v5" />
      <path d="M9 10.76V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5.24a8 8 0 1 1 8 0z" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// ── Nav item ───────────────────────────────────────────────────────────────────

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
}

function NavItem({ to, icon, label, expanded }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={!expanded ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg mx-2 transition-all duration-150 group relative ${
          isActive
            ? 'bg-[var(--sf-sidebar-active-bg)] text-[var(--sf-sidebar-text-active)] border-l-2 border-[var(--sf-sidebar-accent)] pl-[10px]'
            : 'text-[var(--sf-sidebar-text)] hover:bg-[var(--sf-sidebar-hover)] hover:text-[var(--sf-sidebar-text-active)] border-l-2 border-transparent pl-[10px]'
        }`
      }
    >
      {icon}
      <span
        className="text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-200"
        style={{ width: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
      >
        {label}
      </span>
    </NavLink>
  );
}

// ── Group label ────────────────────────────────────────────────────────────────

function GroupLabel({ label, expanded }: { label: string; expanded: boolean }) {
  return (
    <div
      className="px-5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest transition-all duration-200 overflow-hidden whitespace-nowrap"
      style={{
        color: 'var(--sf-sidebar-group)',
        opacity: expanded ? 1 : 0,
        height: expanded ? 'auto' : 0,
        paddingTop: expanded ? undefined : 0,
        paddingBottom: expanded ? undefined : 0,
      }}
    >
      {label}
    </div>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="mx-3 my-2 border-t border-white/8" />;
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const [isHovered, setIsHovered] = useState(false);
  const { isPinned, togglePin } = useSidebarStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { user, hasPermission, hasRole, logout } = useAuthStore();
  const navigate = useNavigate();

  const isExpanded = isPinned || isHovered;

  async function handleLogout() {
    await apiLogout();
    logout();
    navigate('/login');
  }

  const initials = (user?.display_name || user?.username || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: isExpanded ? 220 : 56,
        minWidth: isExpanded ? 220 : 56,
        backgroundColor: 'var(--sf-sidebar-bg)',
        transition: 'width 200ms ease, min-width 200ms ease',
      }}
      className="flex flex-col h-screen overflow-hidden z-40 shrink-0"
    >
      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 px-3 py-4 h-14 shrink-0 hover:opacity-90 transition-opacity">
        <div className="w-8 h-8 rounded-lg bg-[var(--sf-sidebar-accent)] flex items-center justify-center shrink-0 text-white font-bold text-sm">
          SF
        </div>
        <span
          className="text-white font-semibold text-sm whitespace-nowrap overflow-hidden transition-all duration-200"
          style={{ opacity: isExpanded ? 1 : 0, width: isExpanded ? 'auto' : 0 }}
        >
          SpiderFoot AI
        </span>
      </Link>

      <Divider />

      {/* Home */}
      <NavItem to="/" icon={<IconHome />} label="Dashboard" expanded={isExpanded} />

      <Divider />

      {/* Intelligence group */}
      <GroupLabel label="Intelligence" expanded={isExpanded} />
      <NavItem to="/scans" icon={<IconScans />} label="Scans" expanded={isExpanded} />
      {hasPermission('scans', 'create') && (
        <NavItem to="/newscan" icon={<IconNewScan />} label="New Scan" expanded={isExpanded} />
      )}

      <Divider />

      {/* Analysis group */}
      <GroupLabel label="Analysis" expanded={isExpanded} />
      <NavItem to="/correlation-rules" icon={<IconRules />} label="Rules" expanded={isExpanded} />

      {/* Platform group — settings/admin items */}
      {(hasPermission('settings', 'read') || hasRole('administrator')) && (
        <>
          <Divider />
          <GroupLabel label="Platform" expanded={isExpanded} />
          {hasPermission('settings', 'read') && (
            <NavItem to="/settings" icon={<IconSettings />} label="Settings" expanded={isExpanded} />
          )}
          {hasRole('administrator') && (
            <>
              <NavItem to="/users" icon={<IconUsers />} label="Users" expanded={isExpanded} />
              <NavItem to="/workers" icon={<IconWorkers />} label="Workers" expanded={isExpanded} />
            </>
          )}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      <Divider />

      {/* Bottom controls */}
      <div className="flex flex-col gap-1 px-2 pb-3">
        {/* Pin toggle */}
        <button
          onClick={togglePin}
          title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[var(--sf-sidebar-text)] hover:bg-[var(--sf-sidebar-hover)] hover:text-[var(--sf-sidebar-text-active)] transition-colors"
        >
          <IconPin pinned={isPinned} />
          <span
            className="text-xs whitespace-nowrap overflow-hidden transition-all duration-200"
            style={{ opacity: isExpanded ? 1 : 0, width: isExpanded ? 'auto' : 0 }}
          >
            {isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
          </span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[var(--sf-sidebar-text)] hover:bg-[var(--sf-sidebar-hover)] hover:text-[var(--sf-sidebar-text-active)] transition-colors"
        >
          {isDark ? <IconSun /> : <IconMoon />}
          <span
            className="text-xs whitespace-nowrap overflow-hidden transition-all duration-200"
            style={{ opacity: isExpanded ? 1 : 0, width: isExpanded ? 'auto' : 0 }}
          >
            {isDark ? 'Light mode' : 'Dark mode'}
          </span>
        </button>

        <Divider />

        {/* User section */}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-[var(--sf-sidebar-accent)] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          <div
            className="flex-1 min-w-0 overflow-hidden transition-all duration-200"
            style={{ opacity: isExpanded ? 1 : 0, width: isExpanded ? 'auto' : 0 }}
          >
            <div className="text-xs font-medium text-[var(--sf-sidebar-text-active)] truncate">
              {user?.display_name || user?.username}
            </div>
            <div className="text-[10px] text-[var(--sf-sidebar-text)] capitalize truncate">
              {user?.roles?.[0] ?? ''}
            </div>
          </div>
          {isExpanded && (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-[var(--sf-sidebar-text)] hover:text-red-400 transition-colors shrink-0"
            >
              <IconLogout />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
