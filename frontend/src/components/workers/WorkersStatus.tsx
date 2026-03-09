import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listWorkers, cleanupOfflineWorkers } from '../../api/workers';
import type { WorkerRecord } from '../../api/workers';

function relativeTime(ts: number): string {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const STATUS_STYLES: Record<WorkerRecord['status'], { label: string; bg: string; border: string; dot: string }> = {
  idle:    { label: '#32D74B', bg: '#001A08', border: '#32D74B', dot: '#32D74B' },
  busy:    { label: '#00B4FF', bg: '#001828', border: '#00B4FF', dot: '#00B4FF' },
  offline: { label: '#FF3B30', bg: '#280A08', border: '#FF3B30', dot: '#FF3B30' },
};

const QUEUE_STYLES: Record<string, { label: string; bg: string; border: string }> = {
  fast: { label: '#00B4FF', bg: '#001828', border: '#00B4FF' },
  slow: { label: '#FF9F0A', bg: '#271500', border: '#FF9F0A' },
};

export default function WorkersStatus() {
  const queryClient = useQueryClient();

  const { data: workers = [], isLoading, error } = useQuery<WorkerRecord[]>({
    queryKey: ['workers'],
    queryFn: listWorkers,
    refetchInterval: 15_000,
  });

  const cleanupMutation = useMutation({
    mutationFn: cleanupOfflineWorkers,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workers'] }),
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '4px' }}>
            DISTRIBUTED INFRASTRUCTURE
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#F4F4F5', letterSpacing: '0.05em' }}>
            WORKER NODES
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '10px', color: '#52525B', letterSpacing: '0.08em' }}>AUTO-REFRESH: 15S</span>
          <button
            onClick={() => cleanupMutation.mutate()}
            disabled={cleanupMutation.isPending}
            style={{
              background: cleanupMutation.isPending ? '#060A0F' : '#001828',
              color: cleanupMutation.isPending ? '#3F3F46' : '#00B4FF',
              border: `1px solid ${cleanupMutation.isPending ? '#27272A' : '#00B4FF40'}`,
              padding: '8px 14px', borderRadius: '2px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
              cursor: cleanupMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {cleanupMutation.isPending ? 'REFRESHING...' : '↺ REFRESH & CLEANUP'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#280A08', borderLeft: '3px solid #FF3B30', fontSize: '11px', color: '#FF3B30' }}>
          ⚠ FAILED TO LOAD WORKERS
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #00B4FF30', borderTopColor: '#00B4FF', animation: 'sf-spin 1.2s linear infinite' }} />
        </div>
      ) : workers.length === 0 ? (
        <div style={{ border: '1px solid #18181B', borderRadius: '2px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#3F3F46', marginBottom: '12px' }}>
            NO WORKER NODES REGISTERED
          </div>
          <p style={{ fontSize: '10px', color: '#52525B', marginBottom: '8px' }}>Start a distributed worker with:</p>
          <code style={{ fontSize: '10px', color: '#00B4FF', fontFamily: 'monospace', background: '#001828', padding: '4px 8px', borderRadius: '2px' }}>
            docker compose -f docker-compose.yml -f docker-compose-worker.yml up
          </code>
        </div>
      ) : (
        <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#060A0F', borderBottom: '1px solid #18181B' }}>
                {['NODE', 'HOST', 'QUEUE', 'STATUS', 'CURRENT SCAN', 'LAST HEARTBEAT'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const ss = STATUS_STYLES[w.status];
                const qs = QUEUE_STYLES[w.queue_type] || QUEUE_STYLES.fast;
                return (
                  <tr key={w.id} style={{ borderBottom: '1px solid #0D1117' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', color: '#F4F4F5', fontWeight: 600 }}>{w.name}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#71717A', fontSize: '10px' }}>{w.host}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: qs.bg, color: qs.label, border: `1px solid ${qs.border}40`, borderRadius: '2px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em' }}>
                        {w.queue_type.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ss.dot, display: 'inline-block', animation: w.status !== 'offline' ? 'sf-blink 2s infinite' : 'none' }} />
                        <span style={{ background: ss.bg, color: ss.label, border: `1px solid ${ss.border}40`, borderRadius: '2px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em' }}>
                          {w.status.toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#52525B', fontSize: '10px' }}>
                      {w.current_scan || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#52525B', fontSize: '10px' }}>
                      {relativeTime(w.last_seen)}
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
