import { useQuery } from '@tanstack/react-query';
import { getScanLog, getScanErrors } from '../../api/scans';
import { useState } from 'react';

type ApiRow = Array<string | number | boolean | null>;

interface ScanLogProps {
  scanId: string;
  isRunning: boolean;
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  ERROR: 'text-red-600 dark:text-red-400',
  WARNING: 'text-orange-600 dark:text-orange-400',
  INFO: 'text-blue-600 dark:text-blue-400',
  DEBUG: 'text-gray-500 dark:text-gray-400',
};

export default function ScanLog({ scanId, isRunning }: ScanLogProps) {
  const [showErrors, setShowErrors] = useState(false);
  const [logLimit, setLogLimit] = useState(200);

  const { data: logEntries = [], isLoading: isLoadingLog } = useQuery({
    queryKey: ['scanLog', scanId, logLimit],
    queryFn: async () => {
      const { data } = await getScanLog(scanId, logLimit);
      return data;
    },
    refetchInterval: isRunning ? 5000 : false,
  });

  const { data: errorEntries = [], isLoading: isLoadingErrors } = useQuery({
    queryKey: ['scanErrors', scanId],
    queryFn: async () => {
      const { data } = await getScanErrors(scanId);
      return data;
    },
    enabled: showErrors,
    refetchInterval: isRunning ? 5000 : false,
  });

  const isLoading = showErrors ? isLoadingErrors : isLoadingLog;
  const entries = showErrors ? errorEntries : logEntries;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex gap-1 rounded-md border border-[var(--sf-border)] p-0.5">
          <button
            onClick={() => setShowErrors(false)}
            className={`rounded px-2 py-1 text-xs ${!showErrors ? 'bg-[var(--sf-primary)] text-white' : ''}`}
          >
            Log
          </button>
          <button
            onClick={() => setShowErrors(true)}
            className={`rounded px-2 py-1 text-xs ${showErrors ? 'bg-[var(--sf-primary)] text-white' : ''}`}
          >
            Errors
          </button>
        </div>

        {!showErrors && (
          <select
            value={logLimit}
            onChange={(e) => setLogLimit(Number(e.target.value))}
            className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 py-1 text-sm"
          >
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
            <option value={500}>Last 500</option>
            <option value={1000}>Last 1000</option>
          </select>
        )}

        <span className="ml-auto text-xs text-[var(--sf-text-muted)]">
          {entries.length} entries
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-[var(--sf-text-muted)]">
          {showErrors ? 'No errors recorded.' : 'No log entries yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--sf-border)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
              <tr>
                <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Time</th>
                {!showErrors && <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Level</th>}
                <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Module</th>
                <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Message</th>
              </tr>
            </thead>
            <tbody>
              {(entries as ApiRow[]).map((row: ApiRow, idx: number) => (
                <tr key={idx} className="border-b border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]">
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs text-[var(--sf-text-muted)]">{row[0]}</td>
                  {!showErrors && (
                    <td className={`px-3 py-1.5 text-xs font-medium ${LOG_LEVEL_COLORS[String(row[1])] || ''}`}>
                      {row[1]}
                    </td>
                  )}
                  <td className="px-3 py-1.5 font-mono text-xs">{showErrors ? row[1] : row[2]}</td>
                  <td className="max-w-xl truncate px-3 py-1.5 text-xs">{showErrors ? row[2] : row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
