import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getScanEventsPaged, getScanEventsUnique } from '../../api/results';

type ApiRow = Array<string | number | boolean | null>;

const PAGE_SIZE = 100;

interface EventBrowserProps {
  scanId: string;
  isRunning: boolean;
  initialEventType?: string;
  eventTypes?: string[]; // pre-populated from ScanInfo summary query
}

export default function EventBrowser({
  scanId,
  isRunning,
  initialEventType = 'ALL',
  eventTypes = [],
}: EventBrowserProps) {
  const [eventType, setEventType] = useState(initialEventType);
  const [filterFp, setFilterFp] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'unique'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sync when parent changes the initial event type (e.g. clicking from Summary tab)
  const [prevInitialEventType, setPrevInitialEventType] = useState(initialEventType);
  if (initialEventType !== prevInitialEventType) {
    setPrevInitialEventType(initialEventType);
    setEventType(initialEventType);
    setPage(0);
  }

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['scanEventsPaged', scanId, eventType, filterFp, searchQuery, page],
    queryFn: async () => {
      const { data } = await getScanEventsPaged(
        scanId, eventType, filterFp, searchQuery || undefined, PAGE_SIZE, page * PAGE_SIZE,
      );
      return data as { total: number; data: ApiRow[] };
    },
    enabled: viewMode === 'all',
    refetchInterval: isRunning ? 10000 : false,
  });

  const { data: uniqueEvents = [], isLoading: isLoadingUnique } = useQuery({
    queryKey: ['scanEventsUnique', scanId, eventType, filterFp],
    queryFn: async () => {
      const { data } = await getScanEventsUnique(scanId, eventType, filterFp);
      return data as ApiRow[];
    },
    enabled: viewMode === 'unique' && eventType !== 'ALL',
  });

  const events = pagedResult?.data ?? [];
  const total = pagedResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  function commitSearch() {
    setSearchQuery(searchInput);
    setPage(0);
  }

  return (
    <div>
      {/* ── Filters row ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Event type */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[var(--sf-text)]">Type:</label>
          <select
            value={eventType}
            onChange={(e) => { setEventType(e.target.value); setPage(0); }}
            className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 py-1.5 text-sm"
          >
            <option value="ALL">All Types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--sf-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search data…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitSearch()}
              className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] py-1.5 pl-8 pr-2 text-sm text-[var(--sf-text)] placeholder:text-[var(--sf-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-primary)] w-52"
            />
          </div>
          <button
            onClick={commitSearch}
            className="rounded-md bg-[var(--sf-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--sf-primary-hover)]"
          >
            Search
          </button>
          {searchQuery && (
            <button
              onClick={() => { setSearchInput(''); setSearchQuery(''); }}
              className="rounded-md border border-[var(--sf-border)] px-2 py-1.5 text-xs text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Hide FP */}
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={filterFp}
            onChange={(e) => { setFilterFp(e.target.checked); setPage(0); }}
            className="rounded"
          />
          Hide False Positives
        </label>

        {/* All / Unique toggle */}
        <div className="flex gap-1 rounded-md border border-[var(--sf-border)] p-0.5">
          <button
            onClick={() => setViewMode('all')}
            className={`rounded px-2 py-1 text-xs ${viewMode === 'all' ? 'bg-[var(--sf-primary)] text-white' : ''}`}
          >
            All Results
          </button>
          <button
            onClick={() => setViewMode('unique')}
            disabled={eventType === 'ALL'}
            className={`rounded px-2 py-1 text-xs disabled:opacity-50 ${viewMode === 'unique' ? 'bg-[var(--sf-primary)] text-white' : ''}`}
          >
            Unique
          </button>
        </div>

        {/* Result count */}
        <span className="ml-auto text-xs text-[var(--sf-text-muted)]">
          {viewMode === 'all'
            ? total > 0 ? `${from}–${to} of ${total.toLocaleString()}` : '0 results'
            : `${uniqueEvents.length} unique`}
        </span>
      </div>

      {/* ── Active search chip ── */}
      {searchQuery && (
        <div className="mb-3 flex items-center gap-2 text-xs text-[var(--sf-text-muted)]">
          <span>Filtered by:</span>
          <span className="rounded bg-[var(--sf-primary)]/10 px-2 py-0.5 text-[var(--sf-primary)] font-mono">
            "{searchQuery}"
          </span>
        </div>
      )}

      {/* ── Results table ── */}
      {(isLoading || isLoadingUnique) ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
        </div>
      ) : viewMode === 'all' ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--sf-border)]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
                <tr>
                  <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Last Seen</th>
                  <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Data</th>
                  <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Source</th>
                  <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Module</th>
                  <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Type</th>
                  <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">FP</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[var(--sf-text-muted)]">
                      {searchQuery ? `No results match "${searchQuery}"` : 'No events found.'}
                    </td>
                  </tr>
                ) : (
                  events.map((row: ApiRow, idx: number) => (
                    <tr key={idx} className="border-b border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--sf-text-muted)]">{row[0]}</td>
                      <td className="max-w-md truncate px-3 py-2 font-mono text-xs">{row[1]}</td>
                      <td className="max-w-xs truncate px-3 py-2 text-xs">{row[2]}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row[3]}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row[10]}</td>
                      <td className="px-3 py-2 text-xs">
                        {row[8] === 1 && (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">FP</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {total > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-[var(--sf-border)] px-3 py-1.5 text-xs text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)] disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-xs text-[var(--sf-text-muted)]">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-md border border-[var(--sf-border)] px-3 py-1.5 text-xs text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--sf-border)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
              <tr>
                <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Value</th>
                <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Count</th>
              </tr>
            </thead>
            <tbody>
              {uniqueEvents.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-8 text-center text-[var(--sf-text-muted)]">
                    {eventType === 'ALL' ? 'Select a specific event type to view unique values.' : 'No unique events found.'}
                  </td>
                </tr>
              ) : (
                uniqueEvents.map((row: ApiRow, idx: number) => (
                  <tr key={idx} className="border-b border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]">
                    <td className="max-w-lg truncate px-3 py-2 font-mono text-xs">{row[0]}</td>
                    <td className="px-3 py-2 text-xs">{row[1]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
