import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getScanEvents, getScanEventsUnique } from '../../api/results';

interface EventBrowserProps {
  scanId: string;
  isRunning: boolean;
  initialEventType?: string;
}

export default function EventBrowser({ scanId, isRunning, initialEventType = 'ALL' }: EventBrowserProps) {
  const [eventType, setEventType] = useState(initialEventType);

  useEffect(() => {
    setEventType(initialEventType);
  }, [initialEventType]);
  const [filterFp, setFilterFp] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'unique'>('all');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['scanEvents', scanId, eventType, filterFp],
    queryFn: async () => {
      const { data } = await getScanEvents(scanId, eventType, filterFp);
      return data;
    },
    enabled: viewMode === 'all',
    refetchInterval: isRunning ? 5000 : false,
  });

  const { data: uniqueEvents = [], isLoading: isLoadingUnique } = useQuery({
    queryKey: ['scanEventsUnique', scanId, eventType, filterFp],
    queryFn: async () => {
      const { data } = await getScanEventsUnique(scanId, eventType, filterFp);
      return data;
    },
    enabled: viewMode === 'unique' && eventType !== 'ALL',
  });

  // Extract unique event types from the events data for the filter dropdown
  // row[10] is the event type, row[3] is the module name
  const eventTypes = Array.from(new Set<string>(events.map((row: any[]) => String(row[10])))).sort();

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Event Type:</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 py-1.5 text-sm"
          >
            <option value="ALL">All Types</option>
            {eventTypes.map((t: string) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={filterFp}
            onChange={(e) => setFilterFp(e.target.checked)}
            className="rounded"
          />
          Hide False Positives
        </label>

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

        <span className="ml-auto text-xs text-[var(--sf-text-muted)]">
          {viewMode === 'all' ? events.length : uniqueEvents.length} results
        </span>
      </div>

      {/* Results table */}
      {(isLoading || isLoadingUnique) ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
        </div>
      ) : viewMode === 'all' ? (
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
                    No events found.
                  </td>
                </tr>
              ) : (
                events.map((row: any[], idx: number) => (
                  <tr key={idx} className="border-b border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--sf-text-muted)]">{row[0]}</td>
                    <td className="max-w-md truncate px-3 py-2 font-mono text-xs">{row[1]}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs">{row[2]}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row[3]}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row[10]}</td>
                    <td className="px-3 py-2 text-xs">
                      {row[8] === 1 && (
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200">FP</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                uniqueEvents.map((row: any[], idx: number) => (
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
