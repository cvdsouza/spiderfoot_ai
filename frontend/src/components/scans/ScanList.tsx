import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getScans, stopScan, deleteScan, rerunScan } from '../../api/scans';
import StatusBadge from '../common/StatusBadge';
import RiskBadges from '../common/RiskBadges';
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

interface PendingAction {
  action: 'stop' | 'delete' | 'rerun';
  ids: string[];
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

  // Bulk actions — show inline confirmation banner instead of window.confirm
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
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || `Failed to ${action} scans`);
    } finally {
      setPendingAction(null);
    }
  };

  // Per-row: stop / rerun execute immediately; delete uses inline row confirmation
  const handleRowAction = async (action: 'stop' | 'rerun', id: string) => {
    setErrorMsg(null);
    try {
      if (action === 'stop') await stopScan(id);
      else await rerunScan(id);
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      toast.success(action === 'stop' ? 'Scan stop requested.' : 'Scan re-run started.');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || `Failed to ${action} scan`);
    }
  };

  const confirmRowDelete = async (id: string) => {
    setRowPendingDelete(null);
    setErrorMsg(null);
    try {
      await deleteScan(id);
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      toast.success('Scan deleted.');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to delete scan');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scans</h1>
        <Link
          to="/newscan"
          className="rounded-md bg-[var(--sf-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--sf-primary-hover)]"
        >
          + New Scan
        </Link>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Inline confirmation banner for bulk actions */}
      {pendingAction && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-900/20">
          <span className="text-sm text-orange-800 dark:text-orange-300">
            {pendingAction.action === 'delete' && '⚠ '}
            Are you sure you want to <strong>{pendingAction.action}</strong> {pendingAction.ids.length} scan{pendingAction.ids.length !== 1 ? 's' : ''}?
          </span>
          <div className="flex gap-2">
            <button
              onClick={confirmBulkAction}
              className="rounded-md bg-orange-600 px-3 py-1 text-sm font-medium text-white hover:bg-orange-700"
            >
              Confirm
            </button>
            <button
              onClick={() => setPendingAction(null)}
              className="rounded-md border border-[var(--sf-border)] px-3 py-1 text-sm text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Status filter tabs */}
        <div className="flex gap-1 rounded-lg border border-[var(--sf-border)] p-1">
          {(['all', 'running', 'finished', 'failed'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-sm capitalize ${
                filter === f
                  ? 'bg-[var(--sf-primary)] text-white'
                  : 'text-[var(--sf-text-muted)] hover:bg-[var(--sf-bg-secondary)]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--sf-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search name or target…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] py-1.5 pl-8 pr-3 text-sm text-[var(--sf-text)] placeholder:text-[var(--sf-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-primary)]"
          />
        </div>

        {/* Bulk action buttons (only when rows are selected) */}
        {selected.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => requestBulkAction('stop')}
              className="rounded-md bg-orange-500 px-3 py-1 text-sm text-white hover:bg-orange-600"
            >
              Stop ({selected.size})
            </button>
            <button
              onClick={() => requestBulkAction('delete')}
              className="rounded-md bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
            >
              Delete ({selected.size})
            </button>
            <button
              onClick={() => requestBulkAction('rerun')}
              className="rounded-md bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
            >
              Re-run ({selected.size})
            </button>
          </div>
        )}

        <span className="ml-auto text-sm text-[var(--sf-text-muted)]">
          {filteredScans.length} scan{filteredScans.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {filteredScans.length === 0 ? (
        <div className="rounded-lg border border-[var(--sf-border)] p-12 text-center text-[var(--sf-text-muted)]">
          {search
            ? `No scans match "${search}"`
            : <><span>No scans found. </span><Link to="/newscan" className="text-[var(--sf-primary)]">Start a new scan</Link></>
          }
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--sf-border)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === filteredScans.length && filteredScans.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Name</th>
                <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Target</th>
                <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Status</th>
                <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Risk</th>
                <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Elements</th>
                <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Started</th>
                <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Finished</th>
                <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]"></th>
              </tr>
            </thead>
            <tbody>
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

                return (
                  <tr
                    key={id}
                    className="group border-b border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]"
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleSelect(id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        to={`/scaninfo/${id}`}
                        className="font-medium text-[var(--sf-primary)] hover:underline"
                      >
                        {name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-[var(--sf-text-muted)]">{target}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-3 py-3">
                      <RiskBadges riskMatrix={riskMatrix} />
                    </td>
                    <td className="px-3 py-3 text-[var(--sf-text-muted)]">
                      {Number(elements || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--sf-text-muted)]" title={started}>
                      {relativeTime(started)}
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--sf-text-muted)]" title={finished}>
                      {relativeTime(finished)}
                    </td>
                    {/* Per-row actions */}
                    <td className="px-3 py-3">
                      {rowPendingDelete === id ? (
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <button
                            onClick={() => confirmRowDelete(id)}
                            className="rounded px-2 py-0.5 text-xs bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setRowPendingDelete(null)}
                            className="rounded px-2 py-0.5 text-xs text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {isActive && (
                            <button
                              onClick={() => handleRowAction('stop', id)}
                              title="Stop scan"
                              className="rounded p-1 text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                                <rect x="6" y="6" width="12" height="12" rx="1" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleRowAction('rerun', id)}
                            title="Re-run scan"
                            className="rounded p-1 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                              <path d="M3 3v5h5" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setRowPendingDelete(id)}
                            title="Delete scan"
                            className="rounded p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
