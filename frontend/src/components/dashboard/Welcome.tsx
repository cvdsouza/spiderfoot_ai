import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { usePermission } from '../../hooks/usePermission';
import api from '../../api/client';
import type { ScanListRow } from '../../types';

export default function Welcome() {
  const user = useAuthStore((s) => s.user);
  const canCreateScan = usePermission('scans', 'create');

  const { data: scans } = useQuery<ScanListRow[]>({
    queryKey: ['scans'],
    queryFn: async () => {
      const { data } = await api.get('/scans');
      return data;
    },
  });

  const totalScans = scans?.length ?? 0;
  const runningScans = scans?.filter((s) => ['RUNNING', 'STARTING', 'STARTED', 'INITIALIZING'].includes(s[6])).length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--sf-text)] mb-6">
        Welcome, {user?.display_name || user?.username || 'User'}
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg p-4">
          <div className="text-sm text-[var(--sf-text-secondary)]">Total Scans</div>
          <div className="text-2xl font-bold text-[var(--sf-text)]">{totalScans}</div>
        </div>
        <div className="bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg p-4">
          <div className="text-sm text-[var(--sf-text-secondary)]">Running</div>
          <div className="text-2xl font-bold text-green-400">{runningScans}</div>
        </div>
        <div className="bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg p-4">
          <div className="text-sm text-[var(--sf-text-secondary)]">Your Role</div>
          <div className="text-lg font-semibold text-[var(--sf-accent)] capitalize">{user?.roles?.[0] ?? 'N/A'}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        {canCreateScan && (
          <Link
            to="/newscan"
            className="px-4 py-2 rounded font-medium bg-[var(--sf-accent)] text-white hover:opacity-90 transition-opacity"
          >
            New Scan
          </Link>
        )}
        <Link
          to="/scans"
          className="px-4 py-2 rounded font-medium border border-[var(--sf-border)] text-[var(--sf-text)] hover:bg-[var(--sf-card)] transition-colors"
        >
          View Scans
        </Link>
        <Link
          to="/correlation-rules"
          className="px-4 py-2 rounded font-medium border border-[var(--sf-border)] text-[var(--sf-text)] hover:bg-[var(--sf-card)] transition-colors"
        >
          Rules
        </Link>
      </div>

      {/* Recent Scans */}
      {scans && scans.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--sf-text)] mb-3">Recent Scans</h2>
          <div className="bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--sf-border)]">
                  <th className="text-left px-4 py-2 text-[var(--sf-text-secondary)] font-medium">Name</th>
                  <th className="text-left px-4 py-2 text-[var(--sf-text-secondary)] font-medium">Target</th>
                  <th className="text-left px-4 py-2 text-[var(--sf-text-secondary)] font-medium">Status</th>
                  <th className="text-left px-4 py-2 text-[var(--sf-text-secondary)] font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {scans.slice(0, 5).map((scan) => (
                  <tr key={scan[0]} className="border-b border-[var(--sf-border)] last:border-0">
                    <td className="px-4 py-2">
                      <Link to={`/scaninfo/${scan[0]}`} className="text-[var(--sf-accent)] hover:underline">
                        {scan[1]}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[var(--sf-text)]">{scan[2]}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          scan[6] === 'FINISHED'
                            ? 'bg-green-500/10 text-green-400'
                            : scan[6] === 'RUNNING'
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-yellow-500/10 text-yellow-400'
                        }`}
                      >
                        {scan[6]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[var(--sf-text-secondary)]">{scan[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
