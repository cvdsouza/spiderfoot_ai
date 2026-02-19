import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getScans, stopScan, deleteScan, rerunScan } from '../../api/scans';
import StatusBadge from '../common/StatusBadge';
import RiskBadges from '../common/RiskBadges';
import type { ScanListRow, RiskMatrix } from '../../types';

type FilterType = 'all' | 'running' | 'finished' | 'failed';

export default function ScanList() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    switch (filter) {
      case 'running':
        return ['RUNNING', 'STARTING', 'STARTED', 'INITIALIZING'].includes(status);
      case 'finished':
        return status === 'FINISHED';
      case 'failed':
        return ['ERROR-FAILED', 'ABORTED'].includes(status);
      default:
        return true;
    }
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
    if (selected.size === filteredScans.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredScans.map((s) => s[0])));
    }
  };

  const handleBulkAction = async (action: 'stop' | 'delete' | 'rerun') => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const confirmed = confirm(
      `Are you sure you want to ${action} ${ids.length} scan(s)?`
    );
    if (!confirmed) return;

    try {
      for (const id of ids) {
        if (action === 'stop') await stopScan(id);
        else if (action === 'delete') await deleteScan(id);
        else if (action === 'rerun') await rerunScan(id);
      }
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['scans'] });
    } catch (err: any) {
      alert(err.response?.data?.detail || `Failed to ${action} scans`);
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

      {/* Filters */}
      <div className="mb-4 flex items-center gap-4">
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

        {selected.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkAction('stop')}
              className="rounded-md bg-orange-500 px-3 py-1 text-sm text-white hover:bg-orange-600"
            >
              Stop ({selected.size})
            </button>
            <button
              onClick={() => handleBulkAction('delete')}
              className="rounded-md bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
            >
              Delete ({selected.size})
            </button>
            <button
              onClick={() => handleBulkAction('rerun')}
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
          No scans found. <Link to="/newscan" className="text-[var(--sf-primary)]">Start a new scan</Link>
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

                return (
                  <tr
                    key={id}
                    className="border-b border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]"
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
                    <td className="px-3 py-3 font-mono text-xs">{target}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-3 py-3">
                      <RiskBadges riskMatrix={riskMatrix} />
                    </td>
                    <td className="px-3 py-3 text-[var(--sf-text-muted)]">{elements}</td>
                    <td className="px-3 py-3 text-xs text-[var(--sf-text-muted)]">{started}</td>
                    <td className="px-3 py-3 text-xs text-[var(--sf-text-muted)]">{finished}</td>
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
