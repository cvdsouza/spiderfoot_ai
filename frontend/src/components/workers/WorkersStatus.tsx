import { useQuery } from '@tanstack/react-query';
import { listWorkers } from '../../api/workers';
import type { WorkerRecord } from '../../api/workers';

function statusBadge(status: WorkerRecord['status']) {
  const styles: Record<WorkerRecord['status'], string> = {
    idle:    'bg-green-500/10 text-green-400',
    busy:    'bg-yellow-500/10 text-yellow-400',
    offline: 'bg-red-500/10 text-red-400',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${styles[status]}`}>
      {status}
    </span>
  );
}

function queueBadge(queueType: string) {
  const style = queueType === 'slow'
    ? 'bg-orange-500/10 text-orange-400'
    : 'bg-blue-500/10 text-blue-400';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${style}`}>
      {queueType}
    </span>
  );
}

function relativeTime(ts: number): string {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function WorkersStatus() {
  const { data: workers = [], isLoading, error } = useQuery<WorkerRecord[]>({
    queryKey: ['workers'],
    queryFn: listWorkers,
    refetchInterval: 15_000,  // refresh every 15 s to match heartbeat cadence
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--sf-text)]">Workers</h1>
        <span className="text-sm text-[var(--sf-text-secondary)]">
          Auto-refreshes every 15 s
        </span>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded px-3 py-2">
          Failed to load workers
        </div>
      )}

      {isLoading ? (
        <div className="text-[var(--sf-text-secondary)]">Loading workers…</div>
      ) : workers.length === 0 ? (
        <div className="bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg p-8 text-center">
          <p className="text-[var(--sf-text-secondary)] mb-2">No workers registered</p>
          <p className="text-xs text-[var(--sf-text-secondary)]">
            Start a worker with:{' '}
            <code className="font-mono bg-[var(--sf-bg-secondary)] px-1 py-0.5 rounded">
              docker compose -f docker-compose.yml -f docker-compose-worker.yml up
            </code>
          </p>
        </div>
      ) : (
        <div className="bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--sf-border)]">
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Name</th>
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Host</th>
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Queue</th>
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Status</th>
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Current Scan</th>
                <th className="text-left px-4 py-3 text-[var(--sf-text-secondary)] font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="border-b border-[var(--sf-border)] last:border-0">
                  <td className="px-4 py-3 text-[var(--sf-text)] font-medium">{w.name}</td>
                  <td className="px-4 py-3 text-[var(--sf-text-secondary)] font-mono text-xs">{w.host}</td>
                  <td className="px-4 py-3">{queueBadge(w.queue_type)}</td>
                  <td className="px-4 py-3">{statusBadge(w.status)}</td>
                  <td className="px-4 py-3 text-[var(--sf-text-secondary)] font-mono text-xs">
                    {w.current_scan || '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--sf-text-secondary)] text-xs">
                    {relativeTime(w.last_seen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
