import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAuthStore } from '../../stores/authStore';
import { usePermission } from '../../hooks/usePermission';
import api from '../../api/client';
import type { ScanListRow, RiskMatrix } from '../../types';

// ── Helpers ────────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(['RUNNING', 'STARTING', 'STARTED', 'INITIALIZING']);
const RISK_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e', INFO: '#06b6d4' };

function sumRisk(scans: ScanListRow[]): RiskMatrix {
  return scans.reduce(
    (acc, s) => {
      const r = s[8];
      return { HIGH: acc.HIGH + r.HIGH, MEDIUM: acc.MEDIUM + r.MEDIUM, LOW: acc.LOW + r.LOW, INFO: acc.INFO + r.INFO };
    },
    { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
  );
}

function relativeTime(dateStr: string): string {
  if (!dateStr || dateStr === 'Not yet') return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color, sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div className="bg-[var(--sf-bg-card)] border border-[var(--sf-border)] rounded-xl p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--sf-text-muted)] mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color ?? 'text-[var(--sf-text)]'}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--sf-text-muted)] mt-1">{sub}</div>}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'FINISHED' ? 'bg-green-400' :
    ACTIVE_STATUSES.has(status) ? 'bg-blue-400 animate-pulse' :
    status === 'ABORTED' || status === 'ABORT-REQUESTED' ? 'bg-orange-400' :
    'bg-red-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Welcome() {
  const user = useAuthStore((s) => s.user);
  const canCreateScan = usePermission('scans', 'create');

  const { data: scans = [] } = useQuery<ScanListRow[]>({
    queryKey: ['scans'],
    queryFn: async () => (await api.get('/scans')).data,
    refetchInterval: 10000,
  });

  // Derived stats
  const totalScans = scans.length;
  const runningScans = scans.filter((s) => ACTIVE_STATUSES.has(s[6]));
  const finishedScans = scans.filter((s) => s[6] === 'FINISHED').length;
  const risk = sumRisk(scans);
  const totalFindings = risk.HIGH + risk.MEDIUM + risk.LOW + risk.INFO;

  // Risk donut data (only include non-zero slices)
  const riskData = (Object.entries(risk) as [keyof RiskMatrix, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, value: v, color: RISK_COLORS[k] }));

  // Scan status breakdown for bar chart
  const statusCounts = scans.reduce<Record<string, number>>((acc, s) => {
    const grp =
      s[6] === 'FINISHED' ? 'Finished' :
      ACTIVE_STATUSES.has(s[6]) ? 'Running' :
      s[6] === 'ABORTED' || s[6] === 'ABORT-REQUESTED' ? 'Aborted' :
      'Failed';
    acc[grp] = (acc[grp] ?? 0) + 1;
    return acc;
  }, {});
  const barData = Object.entries(statusCounts).map(([name, count]) => ({ name, count }));

  const recentScans = [...scans].slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[var(--sf-text-muted)] text-sm">
            Welcome back, <span className="text-[var(--sf-text)] font-medium">{user?.display_name || user?.username}</span>
          </p>
        </div>
        {canCreateScan && (
          <Link
            to="/newscan"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--sf-primary)] text-white text-sm font-medium hover:bg-[var(--sf-primary-hover)] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Scan
          </Link>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Scans" value={totalScans} />
        <StatCard
          label="Running"
          value={runningScans.length}
          color={runningScans.length > 0 ? 'text-blue-400' : 'text-[var(--sf-text)]'}
          sub={runningScans.length > 0 ? 'active now' : 'none active'}
        />
        <StatCard label="Finished" value={finishedScans} color="text-green-400" />
        <StatCard
          label="Total Findings"
          value={totalFindings.toLocaleString()}
          sub={risk.HIGH > 0 ? `${risk.HIGH} HIGH` : undefined}
          color={risk.HIGH > 0 ? 'text-red-400' : 'text-[var(--sf-text)]'}
        />
      </div>

      {/* Charts row */}
      {totalScans > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Risk distribution donut */}
          <div className="bg-[var(--sf-bg-card)] border border-[var(--sf-border)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[var(--sf-text)] mb-4">Risk Distribution</h2>
            {totalFindings > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={riskData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} dataKey="value" strokeWidth={0}>
                      {riskData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', borderRadius: 8, fontSize: 12, color: 'var(--sf-text)' }}
                      formatter={(value) => [(value ?? 0).toLocaleString()]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {(Object.entries(RISK_COLORS) as [keyof RiskMatrix, string][]).map(([level, color]) => (
                    <div key={level} className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
                      <span className="text-[var(--sf-text-muted)] w-14">{level}</span>
                      <span className="font-semibold text-[var(--sf-text)]">{risk[level].toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--sf-text-muted)]">No findings yet.</p>
            )}
          </div>

          {/* Scan status bar chart */}
          <div className="bg-[var(--sf-bg-card)] border border-[var(--sf-border)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[var(--sf-text)] mb-4">Scans by Status</h2>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sf-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--sf-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--sf-text-muted)' }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip
                    contentStyle={{ background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', borderRadius: 8, fontSize: 12, color: 'var(--sf-text)' }}
                    cursor={{ fill: 'var(--sf-border)', opacity: 0.4 }}
                  />
                  <Bar dataKey="count" fill="var(--sf-primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-[var(--sf-text-muted)]">No scans yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Running scans */}
      {runningScans.length > 0 && (
        <div className="bg-[var(--sf-bg-card)] border border-[var(--sf-border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--sf-text)] mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Active Scans
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {runningScans.map((scan) => (
              <Link
                key={scan[0]}
                to={`/scaninfo/${scan[0]}`}
                className="flex flex-col gap-1.5 p-3 rounded-lg border border-[var(--sf-border)] hover:border-[var(--sf-primary)] hover:bg-[var(--sf-bg)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--sf-text)] truncate">{scan[1]}</span>
                  <StatusDot status={scan[6]} />
                </div>
                <div className="text-xs text-[var(--sf-text-muted)] truncate">{scan[2]}</div>
                <div className="flex items-center justify-between text-xs text-[var(--sf-text-muted)]">
                  <span>{scan[7].toLocaleString()} events</span>
                  <span>{relativeTime(scan[4])}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent scans table */}
      {recentScans.length > 0 && (
        <div className="bg-[var(--sf-bg-card)] border border-[var(--sf-border)] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sf-border)]">
            <h2 className="text-sm font-semibold text-[var(--sf-text)]">Recent Scans</h2>
            <Link to="/scans" className="text-xs text-[var(--sf-primary)] hover:underline">
              View all →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--sf-border)]">
                {['Name', 'Target', 'Status', 'Findings', 'Started'].map((col) => (
                  <th key={col} className="text-left px-5 py-2.5 text-xs font-semibold text-[var(--sf-text-muted)] uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentScans.map((scan) => {
                const r = scan[8];
                const findings = r.HIGH + r.MEDIUM + r.LOW + r.INFO;
                return (
                  <tr key={scan[0]} className="border-b border-[var(--sf-border)] last:border-0 hover:bg-[var(--sf-bg)] transition-colors">
                    <td className="px-5 py-3">
                      <Link to={`/scaninfo/${scan[0]}`} className="text-[var(--sf-primary)] hover:underline font-medium">
                        {scan[1]}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-[var(--sf-text-muted)] font-mono text-xs">{scan[2]}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot status={scan[6]} />
                        <span className="text-xs text-[var(--sf-text-muted)]">{scan[6]}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[var(--sf-text-muted)] text-xs">
                      {findings > 0 ? (
                        <span className={r.HIGH > 0 ? 'text-red-400 font-semibold' : ''}>
                          {findings.toLocaleString()}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-[var(--sf-text-muted)] text-xs">{relativeTime(scan[4])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {totalScans === 0 && (
        <div className="text-center py-20 bg-[var(--sf-bg-card)] border border-[var(--sf-border)] rounded-xl">
          <div className="text-4xl mb-3">🕷️</div>
          <h3 className="text-lg font-semibold text-[var(--sf-text)] mb-1">No scans yet</h3>
          <p className="text-[var(--sf-text-muted)] text-sm mb-6">Run your first scan to start gathering intelligence.</p>
          {canCreateScan && (
            <Link
              to="/newscan"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--sf-primary)] text-white text-sm font-medium hover:bg-[var(--sf-primary-hover)] transition-colors"
            >
              Start a Scan
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
