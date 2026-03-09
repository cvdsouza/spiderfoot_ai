import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAuthStore } from '../../stores/authStore';
import { usePermission } from '../../hooks/usePermission';
import api from '../../api/client';
import type { ScanListRow, RiskMatrix } from '../../types';

const ACTIVE_STATUSES = new Set(['RUNNING', 'STARTING', 'STARTED', 'INITIALIZING']);
const RISK_COLORS = { HIGH: '#FF3B30', MEDIUM: '#FF9F0A', LOW: '#FFD60A', INFO: '#00B4FF' };

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
  if (m < 1) return 'JUST NOW';
  if (m < 60) return `${m}M AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H AGO`;
  return `${Math.floor(h / 24)}D AGO`;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--sf-bg-card)',
      border: '1px solid var(--sf-border)',
      borderRadius: '3px',
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: '7px', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--sf-text-faint)', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: color ?? 'var(--sf-text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '8px', color: 'var(--sf-text-dim)', marginTop: '5px', letterSpacing: '0.06em' }}>{sub.toUpperCase()}</div>}
    </div>
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const color =
    status === 'FINISHED' ? '#32D74B' :
    ACTIVE_STATUSES.has(status) ? '#00B4FF' :
    status === 'ABORTED' || status === 'ABORT-REQUESTED' ? '#FF9F0A' :
    '#FF3B30';
  const isLive = ACTIVE_STATUSES.has(status);
  return (
    <span style={{
      display: 'inline-block',
      width: '6px', height: '6px',
      borderRadius: '50%',
      background: color,
      boxShadow: isLive ? `0 0 5px ${color}` : 'none',
      animation: isLive ? 'sf-blink 0.8s infinite' : 'none',
      flexShrink: 0,
    }} />
  );
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

  const totalScans = scans.length;
  const runningScans = scans.filter((s) => ACTIVE_STATUSES.has(s[6]));
  const finishedScans = scans.filter((s) => s[6] === 'FINISHED').length;
  const risk = sumRisk(scans);
  const totalFindings = risk.HIGH + risk.MEDIUM + risk.LOW + risk.INFO;

  const riskData = (Object.entries(risk) as [keyof RiskMatrix, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, value: v, color: RISK_COLORS[k] }));

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

  const sectionHeader = (title: string, sub?: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
      <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--sf-text-dim)' }}>{title}</div>
      {sub && <span style={{ fontSize: '8px', color: 'var(--sf-text-faint)', letterSpacing: '0.06em' }}>{sub}</span>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '9px', color: 'var(--sf-text-faint)', letterSpacing: '0.15em', marginBottom: '3px' }}>
            OPERATOR
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--sf-text)', letterSpacing: '0.1em' }}>
            {(user?.display_name || user?.username || '').toUpperCase()}
          </div>
        </div>
        {canCreateScan && (
          <Link
            to="/newscan"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px',
              background: 'rgba(0,180,255,0.08)',
              border: '1px solid var(--sf-primary)',
              borderRadius: '2px',
              color: 'var(--sf-primary)',
              fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em',
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
          >
            + NEW SCAN
          </Link>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        <StatCard label="TOTAL SCANS" value={totalScans} />
        <StatCard
          label="ACTIVE"
          value={runningScans.length}
          color={runningScans.length > 0 ? '#00B4FF' : 'var(--sf-text)'}
          sub={runningScans.length > 0 ? '● LIVE' : 'IDLE'}
        />
        <StatCard label="COMPLETE" value={finishedScans} color="#32D74B" />
        <StatCard
          label="TOTAL FINDINGS"
          value={totalFindings.toLocaleString()}
          sub={risk.HIGH > 0 ? `${risk.HIGH} HIGH RISK` : 'NO HIGH RISK'}
          color={risk.HIGH > 0 ? '#FF3B30' : 'var(--sf-text)'}
        />
      </div>

      {/* Charts */}
      {totalScans > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {/* Risk donut */}
          <div style={{ background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', borderRadius: '3px', padding: '16px 18px' }}>
            {sectionHeader('RISK DISTRIBUTION')}
            {totalFindings > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={riskData} cx="50%" cy="50%" innerRadius={42} outerRadius={64} dataKey="value" strokeWidth={0}>
                      {riskData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', borderRadius: 2, fontSize: 10, color: 'var(--sf-text)', fontFamily: 'inherit' }}
                      formatter={(value) => [(value ?? 0).toLocaleString()]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(Object.entries(RISK_COLORS) as [keyof RiskMatrix, string][]).map(([level, color]) => (
                    <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '1px', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: '8px', color: 'var(--sf-text-dim)', width: '48px', letterSpacing: '0.06em' }}>{level}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--sf-text)' }}>{risk[level].toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '9px', color: 'var(--sf-text-faint)' }}>NO FINDINGS YET</p>
            )}
          </div>

          {/* Status bar chart */}
          <div style={{ background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', borderRadius: '3px', padding: '16px 18px' }}>
            {sectionHeader('SCANS BY STATUS')}
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sf-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--sf-text-dim)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--sf-text-dim)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip contentStyle={{ background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', borderRadius: 2, fontSize: 10, color: 'var(--sf-text)', fontFamily: 'inherit' }} cursor={{ fill: 'var(--sf-border)', opacity: 0.3 }} />
                  <Bar dataKey="count" fill="var(--sf-primary)" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: '9px', color: 'var(--sf-text-faint)' }}>NO SCANS YET</p>
            )}
          </div>
        </div>
      )}

      {/* Active scans */}
      {runningScans.length > 0 && (
        <div style={{ background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', borderTop: '1px solid rgba(0,180,255,0.2)', borderRadius: '3px', padding: '16px 18px' }}>
          {sectionHeader('ACTIVE SCANS', `${runningScans.length} RUNNING`)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
            {runningScans.map((scan) => (
              <Link
                key={scan[0]}
                to={`/scaninfo/${scan[0]}`}
                style={{
                  display: 'flex', flexDirection: 'column', gap: '6px',
                  padding: '10px 12px',
                  background: 'var(--sf-bg-elevated)',
                  border: '1px solid var(--sf-border)',
                  borderLeft: '2px solid #00B4FF',
                  borderRadius: '2px',
                  textDecoration: 'none',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--sf-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scan[1]}</span>
                  <StatusDot status={scan[6]} />
                </div>
                <div style={{ fontSize: '9px', color: 'var(--sf-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{scan[2]}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--sf-text-faint)', letterSpacing: '0.04em' }}>
                  <span>{scan[7].toLocaleString()} EVENTS</span>
                  <span>{relativeTime(scan[4])}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent scans table */}
      {recentScans.length > 0 && (
        <div style={{ background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--sf-border)' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--sf-text-dim)' }}>RECENT SCANS</div>
            <Link to="/scans" style={{ fontSize: '8px', color: 'var(--sf-primary)', letterSpacing: '0.08em', textDecoration: 'none' }}>VIEW ALL →</Link>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--sf-border)' }}>
                {['NAME', 'TARGET', 'STATUS', 'FINDINGS', 'STARTED'].map((col) => (
                  <th key={col} style={{ textAlign: 'left', padding: '8px 18px', fontSize: '7px', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--sf-text-faint)' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentScans.map((scan) => {
                const r = scan[8];
                const findings = r.HIGH + r.MEDIUM + r.LOW + r.INFO;
                return (
                  <tr key={scan[0]} style={{ borderBottom: '1px solid var(--sf-border)' }}>
                    <td style={{ padding: '10px 18px' }}>
                      <Link to={`/scaninfo/${scan[0]}`} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--sf-primary)', textDecoration: 'none', letterSpacing: '0.02em' }}>
                        {scan[1]}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 18px', fontSize: '9px', color: 'var(--sf-text-muted)', fontFamily: 'inherit' }}>{scan[2]}</td>
                    <td style={{ padding: '10px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <StatusDot status={scan[6]} />
                        <span style={{ fontSize: '8px', color: 'var(--sf-text-dim)', letterSpacing: '0.06em' }}>{scan[6]}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 18px' }}>
                      {findings > 0 ? (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: r.HIGH > 0 ? '#FF3B30' : 'var(--sf-text)' }}>{findings.toLocaleString()}</span>
                      ) : <span style={{ fontSize: '9px', color: 'var(--sf-text-faint)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 18px', fontSize: '8px', color: 'var(--sf-text-faint)', letterSpacing: '0.04em' }}>{relativeTime(scan[4])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {totalScans === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', borderRadius: '3px' }}>
          <div style={{ fontSize: '36px', color: 'var(--sf-primary)', marginBottom: '14px', animation: 'sf-glow 3s ease-in-out infinite' }}>⬡</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sf-text)', letterSpacing: '0.15em', marginBottom: '8px' }}>NO SCANS DETECTED</div>
          <div style={{ fontSize: '9px', color: 'var(--sf-text-muted)', letterSpacing: '0.08em', marginBottom: '24px' }}>INITIATE A SCAN TO BEGIN INTELLIGENCE GATHERING</div>
          {canCreateScan && (
            <Link
              to="/newscan"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px',
                background: 'rgba(0,180,255,0.08)',
                border: '1px solid var(--sf-primary)',
                borderRadius: '2px',
                color: 'var(--sf-primary)',
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em',
                textDecoration: 'none',
              }}
            >
              + INITIATE SCAN
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
