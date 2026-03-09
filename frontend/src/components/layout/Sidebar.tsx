import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useSidebarStore } from '../../stores/sidebarStore';
import { logout as apiLogout } from '../../api/auth';

// ── ICONS ─────────────────────────────────────────────────────────────────────
// Minimal geometric SVG icons in the Nexus style

function IcHome()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16,flexShrink:0}}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>; }
function IcScans()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16,flexShrink:0}}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>; }
function IcNewScan() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16,flexShrink:0}}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>; }
function IcRules()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16,flexShrink:0}}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>; }
function IcSettings(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16,flexShrink:0}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function IcUsers()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16,flexShrink:0}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IcWorkers() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16,flexShrink:0}}><rect x="2" y="2" width="20" height="8" rx="1"/><rect x="2" y="14" width="20" height="8" rx="1"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>; }
function IcLogout()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14,flexShrink:0}}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function IcPin({ pinned }: { pinned: boolean }) { return <svg viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14,flexShrink:0}}><path d="M12 17v5"/><path d="M9 10.76V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5.24a8 8 0 1 1 8 0z"/></svg>; }

// ── NAV ITEM ──────────────────────────────────────────────────────────────────
function NavItem({ to, icon, label, expanded }: { to: string; icon: React.ReactNode; label: string; expanded: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={!expanded ? label : undefined}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px 8px 14px',
        margin: '1px 6px',
        borderRadius: '2px',
        borderLeft: `2px solid ${isActive ? 'var(--sf-primary)' : 'transparent'}`,
        background: isActive ? 'var(--sf-sidebar-active-bg)' : 'transparent',
        color: isActive ? 'var(--sf-sidebar-text-active)' : 'var(--sf-sidebar-text)',
        textDecoration: 'none',
        transition: 'all 0.12s ease',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      })}
      onMouseEnter={e => { if (!(e.currentTarget as HTMLElement).style.borderLeft.includes('primary')) { (e.currentTarget as HTMLElement).style.background = 'var(--sf-sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--sf-sidebar-text-active)'; } }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; if (!el.classList.contains('active')) { el.style.background = 'transparent'; el.style.color = 'var(--sf-sidebar-text)'; } }}
    >
      {icon}
      <span style={{
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        overflow: 'hidden',
        maxWidth: expanded ? '120px' : '0px',
        opacity: expanded ? 1 : 0,
        transition: 'max-width 0.2s ease, opacity 0.15s ease',
      }}>
        {label.toUpperCase()}
      </span>
    </NavLink>
  );
}

function GroupLabel({ label, expanded }: { label: string; expanded: boolean }) {
  return (
    <div style={{
      padding: expanded ? '12px 18px 4px' : '8px 0 4px',
      fontSize: '7px',
      fontWeight: 700,
      letterSpacing: '0.2em',
      color: 'var(--sf-sidebar-group)',
      overflow: 'hidden',
      maxHeight: expanded ? '32px' : '0px',
      opacity: expanded ? 1 : 0,
      transition: 'max-height 0.2s ease, opacity 0.15s ease, padding 0.2s ease',
      whiteSpace: 'nowrap',
    }}>
      {label.toUpperCase()}
    </div>
  );
}

function Divider() {
  return <div style={{ margin: '6px 8px', borderTop: '1px solid var(--sf-border)', opacity: 0.5 }} />;
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const [isHovered, setIsHovered] = useState(false);
  const { isPinned, togglePin } = useSidebarStore();
  const { user, hasPermission, hasRole, logout } = useAuthStore();
  const navigate = useNavigate();

  const isExpanded = isPinned || isHovered;

  async function handleLogout() {
    await apiLogout();
    logout();
    navigate('/login');
  }

  const initials = (user?.display_name || user?.username || 'U')
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: isExpanded ? 220 : 52,
        minWidth: isExpanded ? 220 : 52,
        background: 'var(--sf-sidebar-bg)',
        borderRight: '1px solid var(--sf-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 40,
        transition: 'width 0.18s ease, min-width 0.18s ease',
      }}
    >
      {/* Logo */}
      <div style={{
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 14px',
        borderBottom: '1px solid var(--sf-border)',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {/* Hexagon logo mark */}
        <div style={{
          width: '24px', height: '24px',
          background: 'var(--sf-primary-dim)',
          border: '1px solid var(--sf-primary)50',
          borderRadius: '3px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontSize: '11px',
          color: 'var(--sf-primary)',
          fontWeight: 700,
        }}>
          ⬡
        </div>
        <div style={{
          overflow: 'hidden',
          maxWidth: isExpanded ? '140px' : '0px',
          opacity: isExpanded ? 1 : 0,
          transition: 'max-width 0.18s ease, opacity 0.15s ease',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sf-text)', letterSpacing: '0.2em' }}>SPIDERFOOT</div>
          <div style={{ fontSize: '7px', color: 'var(--sf-text-faint)', letterSpacing: '0.25em', marginTop: '-1px' }}>AI OSINT PLATFORM</div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: '6px' }}>
        <NavItem to="/" icon={<IcHome />} label="Dashboard" expanded={isExpanded} />

        <Divider />
        <GroupLabel label="Intelligence" expanded={isExpanded} />
        <NavItem to="/scans" icon={<IcScans />} label="Scans" expanded={isExpanded} />
        {hasPermission('scans', 'create') && (
          <NavItem to="/newscan" icon={<IcNewScan />} label="New Scan" expanded={isExpanded} />
        )}

        <Divider />
        <GroupLabel label="Analysis" expanded={isExpanded} />
        <NavItem to="/correlation-rules" icon={<IcRules />} label="Rules" expanded={isExpanded} />

        {(hasPermission('settings', 'read') || hasRole('administrator')) && (
          <>
            <Divider />
            <GroupLabel label="Platform" expanded={isExpanded} />
            {hasPermission('settings', 'read') && (
              <NavItem to="/settings" icon={<IcSettings />} label="Settings" expanded={isExpanded} />
            )}
            {hasRole('administrator') && (
              <>
                <NavItem to="/users" icon={<IcUsers />} label="Users" expanded={isExpanded} />
                <NavItem to="/workers" icon={<IcWorkers />} label="Workers" expanded={isExpanded} />
              </>
            )}
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{ borderTop: '1px solid var(--sf-border)', padding: '6px 0 8px', flexShrink: 0 }}>
        {/* Pin toggle */}
        <button
          onClick={togglePin}
          title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            width: '100%', padding: '7px 14px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: isPinned ? 'var(--sf-primary)' : 'var(--sf-text-faint)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--sf-text-dim)')}
          onMouseLeave={e => (e.currentTarget.style.color = isPinned ? 'var(--sf-primary)' : 'var(--sf-text-faint)')}
        >
          <IcPin pinned={isPinned} />
          <span style={{ fontSize: '8px', letterSpacing: '0.1em', maxWidth: isExpanded ? '120px' : '0', opacity: isExpanded ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'max-width 0.18s ease, opacity 0.15s ease' }}>
            {isPinned ? 'UNPIN SIDEBAR' : 'PIN SIDEBAR'}
          </span>
        </button>

        <Divider />

        {/* User + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px' }}>
          <div style={{
            width: '22px', height: '22px', flexShrink: 0,
            borderRadius: '2px',
            background: 'var(--sf-primary-dim)',
            border: '1px solid var(--sf-primary)30',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '8px', fontWeight: 700, color: 'var(--sf-primary)',
          }}>
            {initials}
          </div>
          <div style={{
            flex: 1, minWidth: 0, overflow: 'hidden',
            maxWidth: isExpanded ? '120px' : '0',
            opacity: isExpanded ? 1 : 0,
            transition: 'max-width 0.18s ease, opacity 0.15s ease',
          }}>
            <div style={{ fontSize: '9px', color: 'var(--sf-text-dim)', fontWeight: 700, letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(user?.display_name || user?.username || '').toUpperCase()}
            </div>
            <div style={{ fontSize: '7px', color: 'var(--sf-text-faint)', letterSpacing: '0.1em' }}>
              {(user?.roles?.[0] ?? '').toUpperCase()}
            </div>
          </div>
          {isExpanded && (
            <button
              onClick={handleLogout}
              title="Sign out"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sf-text-faint)', flexShrink: 0, padding: '2px' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--sf-error)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--sf-text-faint)')}
            >
              <IcLogout />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
