import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getScans, stopScan, deleteScan, rerunScan } from '../../api/scans';
import StatusBadge from '../common/StatusBadge';
import { toast } from '../../stores/toastStore';
import type { ScanListRow, RiskMatrix } from '../../types';

type FilterType = 'all' | 'running' | 'finished' | 'failed';

const ACTIVE = new Set(['RUNNING', 'STARTING', 'STARTED', 'INITIALIZING']);

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

function getTopRisk(riskMatrix: RiskMatrix | null | undefined): string | null {
  if (!riskMatrix) return null;
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  for (const level of order) {
    const count = (riskMatrix as unknown as Record<string, number>)[level];
    if (count && count > 0) return level;
  }
  return null;
}

const RISK_COLORS: Record<string, { border: string; label: string; bg: string }> = {
  CRITICAL: { border: '#FF3B30', label: '#FF3B30', bg: '#280A08' },
  HIGH:     { border: '#FF9F0A', label: '#FF9F0A', bg: '#271500' },
  MEDIUM:   { border: '#FFD60A', label: '#FFD60A', bg: '#1F1B00' },
  LOW:      { border: '#48484A', label: '#A1A1AA', bg: '#111418' },
  INFO:     { border: '#00B4FF', label: '#00B4FF', bg: '#001828' },
};

const FILTER_LABELS: Record<FilterType, string> = {
  all: 'ALL',
  running: 'ACTIVE',
  finished: 'FINISHED',
  failed: 'FAILED',
};

interface PendingAction {
  action: 'stop' | 'delete' | 'rerun';
  ids: string[];
}

function RiskPills({ riskMatrix }: { riskMatrix: RiskMatrix | null | undefined }) {
  if (!riskMatrix) return null;
  const levels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
  const entries = levels
    .map((l) => ({ level: l, count: (riskMatrix as unknown as Record<string, number>)[l] || 0 }))
    .filter((e) => e.count > 0);
  if (entries.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {entries.map(({ level, count }) => {
        const c = RISK_COLORS[level];
        return (
          <span
            key={level}
            style={{
              background: c.bg,
              color: c.label,
              border: `1px solid ${c.border}40`,
              borderRadius: '2px',
              padding: '1px 5px',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.08em',
            }}
          >
            {count} {level}
          </span>
        );
      })}
    </div>
  );
}

export default function ScanList() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [rowPendingDelete, setRowPendingDelete] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: scans = [], isLoading } = useQuery({
    queryKey: ['scans'],
    queryFn: async () => {
      const { data } = await getScans();
      return data as ScanListRow[];
    },
    refetchInterval: 10000,
  });

  const filteredScans = scans.filter((scan) => {
    const status = scan[6];
    let matchesFilter = true;
    switch (filter) {
      case 'running': matchesFilter = ACTIVE.has(status); break;
      case 'finished': matchesFilter = status === 'FINISHED'; break;
      case 'failed': matchesFilter = ['ERROR-FAILED', 'ABORTED'].includes(status); break;
    }
    if (!matchesFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return String(scan[1]).toLowerCase().includes(q) || String(scan[2]).toLowerCase().includes(q);
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredScans.length) setSelected(new Set());
    else setSelected(new Set(filteredScans.map((s) => s[0])));
  };

  const requestBulkAction = (action: 'stop' | 'delete' | 'rerun') => {
    if (selected.size === 0) return;
    setPendingAction({ action, ids: Array.from(selected) });
  };

  const confirmBulkAction = async () => {
    if (!pendingAction) return;
    setErrorMsg(null);
    const { action, ids } = pendingAction;
    try {
      for (const id of ids) {
        if (action === 'stop') await stopScan(id);
        else if (action === 'delete') await deleteScan(id);
        else if (action === 'rerun') await rerunScan(id);
      }
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      const label = action === 'stop' ? 'stopped' : action === 'delete' ? 'deleted' : 're-run started for';
      toast.success(`${ids.length} scan${ids.length !== 1 ? 's' : ''} ${label}.`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErrorMsg(detail || `Failed to ${action} scans`);
    } finally {
      setPendingAction(null);
    }
  };

  const handleRowAction = async (action: 'stop' | 'rerun', id: string) => {
    setErrorMsg(null);
    try {
      if (action === 'stop') await stopScan(id);
      else await rerunScan(id);
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      toast.success(action === 'stop' ? 'Scan stop requested.' : 'Scan re-run started.');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErrorMsg(detail || `Failed to ${action} scan`);
    }
  };

  const confirmRowDelete = async (id: string) => {
    setRowPendingDelete(null);
    setErrorMsg(null);
    try {
      await deleteScan(id);
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      toast.success('Scan deleted.');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErrorMsg(detail || 'Failed to delete scan');
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          border: '2px solid #00B4FF40', borderTopColor: '#00B4FF',
          animation: 'sf-spin 1.2s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '4px' }}>
            INTELLIGENCE OPERATIONS
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#F4F4F5', letterSpacing: '0.05em' }}>
            SCAN QUEUE
          </h1>
        </div>
        <Link
          to="/newscan"
          style={{
            background: '#00B4FF', color: '#000', padding: '8px 16px',
            borderRadius: '2px', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.12em', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          + INITIATE SCAN
        </Link>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div style={{
          marginBottom: '16px', padding: '12px 16px',
          background: '#280A08', borderLeft: '3px solid #FF3B30',
          fontSize: '12px', color: '#FF3B30',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>⚠ {errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            style={{ background: 'none', border: 'none', color: '#FF3B30', cursor: 'pointer', fontSize: '12px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Bulk action confirmation */}
      {pendingAction && (
        <div style={{
          marginBottom: '16px', padding: '12px 16px',
          background: '#271500', borderLeft: '3px solid #FF9F0A',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '11px', color: '#FF9F0A', letterSpacing: '0.05em' }}>
            CONFIRM: {pendingAction.action.toUpperCase()} {pendingAction.ids.length} SCAN{pendingAction.ids.length !== 1 ? 'S' : ''}?
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={confirmBulkAction}
              style={{
                background: '#FF9F0A', color: '#000', border: 'none',
                padding: '4px 12px', borderRadius: '2px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
              }}
            >
              CONFIRM
            </button>
            <button
              onClick={() => setPendingAction(null)}
              style={{
                background: 'none', color: '#71717A', border: '1px solid #27272A',
                padding: '4px 12px', borderRadius: '2px',
                fontSize: '10px', letterSpacing: '0.1em', cursor: 'pointer',
              }}
            >
              ABORT
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '2px', background: '#060A0F', padding: '3px', borderRadius: '2px', border: '1px solid #18181B' }}>
          {(['all', 'running', 'finished', 'failed'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 12px',
                background: filter === f ? '#00B4FF' : 'transparent',
                color: filter === f ? '#000' : '#52525B',
                border: 'none',
                borderRadius: '2px',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
            color: '#52525B', fontSize: '10px', pointerEvents: 'none',
          }}>▷</span>
          <input
            type="text"
            placeholder="search targets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: '#060A0F', border: '1px solid #18181B',
              borderRadius: '2px', padding: '6px 10px 6px 26px',
              color: '#F4F4F5', fontSize: '11px', outline: 'none',
              width: '220px',
            }}
          />
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => requestBulkAction('stop')}
              style={{
                background: '#271500', color: '#FF9F0A', border: '1px solid #FF9F0A40',
                padding: '5px 10px', borderRadius: '2px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
              }}
            >
              STOP ({selected.size})
            </button>
            <button
              onClick={() => requestBulkAction('rerun')}
              style={{
                background: '#001828', color: '#00B4FF', border: '1px solid #00B4FF40',
                padding: '5px 10px', borderRadius: '2px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
              }}
            >
              RERUN ({selected.size})
            </button>
            <button
              onClick={() => requestBulkAction('delete')}
              style={{
                background: '#280A08', color: '#FF3B30', border: '1px solid #FF3B3040',
                padding: '5px 10px', borderRadius: '2px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
              }}
            >
              DELETE ({selected.size})
            </button>
          </div>
        )}

        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#52525B', letterSpacing: '0.1em' }}>
          {filteredScans.length} RECORD{filteredScans.length !== 1 ? 'S' : ''}
        </span>
      </div>

      {/* Scan list */}
      {filteredScans.length === 0 ? (
        <div style={{
          border: '1px solid #18181B', borderRadius: '2px',
          padding: '64px 0', textAlign: 'center',
        }}>
          <div style={{ fontSize: '28px', color: '#00B4FF20', marginBottom: '12px' }}>⬡</div>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#3F3F46' }}>
            {search ? `NO RECORDS MATCHING "${search.toUpperCase()}"` : 'NO ACTIVE OPERATIONS'}
          </div>
          {!search && (
            <Link
              to="/newscan"
              style={{ display: 'inline-block', marginTop: '16px', color: '#00B4FF', fontSize: '10px', letterSpacing: '0.15em' }}
            >
              → INITIATE FIRST SCAN
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '32px 1fr 180px 120px 180px 80px 90px 90px 80px',
            gap: '0 12px',
            padding: '6px 16px',
            borderBottom: '1px solid #18181B',
          }}>
            <div>
              <input
                type="checkbox"
                checked={selected.size === filteredScans.length && filteredScans.length > 0}
                onChange={toggleSelectAll}
                style={{ accentColor: '#00B4FF', cursor: 'pointer' }}
              />
            </div>
            {['OPERATION', 'TARGET', 'STATUS', 'RISK ASSESSMENT', 'EVENTS', 'STARTED', 'FINISHED', 'ACTIONS'].map((h) => (
              <div key={h} style={{ fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46' }}>{h}</div>
            ))}
          </div>

          {filteredScans.map((scan) => {
            const id = scan[0];
            const name = scan[1];
            const target = scan[2];
            const status = scan[6];
            const elements = scan[7];
            const riskMatrix = scan[8] as RiskMatrix;
            const started = scan[4];
            const finished = scan[5];
            const isActive = ACTIVE.has(status);
            const topRisk = getTopRisk(riskMatrix);
            const borderColor = topRisk ? RISK_COLORS[topRisk].border : '#18181B';

            return (
              <div
                key={id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr 180px 120px 180px 80px 90px 90px 80px',
                  gap: '0 12px',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#0A0E14',
                  borderLeft: `3px solid ${borderColor}`,
                  border: '1px solid #0A0E14',
                  borderLeftWidth: '3px',
                  borderLeftColor: borderColor,
                  transition: 'background 0.15s',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#0A0E14')}
              >
                {/* Checkbox */}
                <div>
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggleSelect(id)}
                    style={{ accentColor: '#00B4FF', cursor: 'pointer' }}
                  />
                </div>

                {/* Name */}
                <div>
                  <Link
                    to={`/scaninfo/${id}`}
                    style={{ color: '#00B4FF', fontSize: '12px', fontWeight: 600, letterSpacing: '0.02em', textDecoration: 'none' }}
                  >
                    {name}
                  </Link>
                  <div style={{ fontSize: '9px', color: '#52525B', marginTop: '2px', letterSpacing: '0.05em' }}>
                    ID: {id.slice(0, 8)}...
                  </div>
                </div>

                {/* Target */}
                <div style={{ fontSize: '11px', color: '#A1A1AA', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {target}
                </div>

                {/* Status */}
                <div>
                  <StatusBadge status={status} />
                </div>

                {/* Risk */}
                <div>
                  <RiskPills riskMatrix={riskMatrix} />
                </div>

                {/* Elements */}
                <div style={{ fontSize: '12px', color: '#71717A', textAlign: 'right' }}>
                  {Number(elements || 0).toLocaleString()}
                </div>

                {/* Started */}
                <div style={{ fontSize: '10px', color: '#52525B' }} title={started}>
                  {relativeTime(started)}
                </div>

                {/* Finished */}
                <div style={{ fontSize: '10px', color: '#52525B' }} title={finished}>
                  {relativeTime(finished)}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {rowPendingDelete === id ? (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => confirmRowDelete(id)}
                        style={{
                          background: '#280A08', color: '#FF3B30', border: '1px solid #FF3B3050',
                          padding: '3px 6px', borderRadius: '2px', fontSize: '9px',
                          fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
                        }}
                      >
                        DEL
                      </button>
                      <button
                        onClick={() => setRowPendingDelete(null)}
                        style={{
                          background: 'none', color: '#52525B', border: '1px solid #27272A',
                          padding: '3px 6px', borderRadius: '2px', fontSize: '9px',
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      {isActive && (
                        <button
                          onClick={() => handleRowAction('stop', id)}
                          title="Stop scan"
                          style={{
                            background: 'none', color: '#FF9F0A', border: '1px solid #FF9F0A40',
                            width: '24px', height: '24px', borderRadius: '2px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', fontSize: '10px',
                          }}
                        >
                          ■
                        </button>
                      )}
                      <button
                        onClick={() => handleRowAction('rerun', id)}
                        title="Re-run scan"
                        style={{
                          background: 'none', color: '#00B4FF', border: '1px solid #00B4FF40',
                          width: '24px', height: '24px', borderRadius: '2px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', fontSize: '10px',
                        }}
                      >
                        ↺
                      </button>
                      <button
                        onClick={() => setRowPendingDelete(id)}
                        title="Delete scan"
                        style={{
                          background: 'none', color: '#52525B', border: '1px solid #27272A',
                          width: '24px', height: '24px', borderRadius: '2px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', fontSize: '10px',
                        }}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
