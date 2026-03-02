import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getScanEvents } from '../../api/results';

type ApiRow = Array<string | number | boolean | null>;

interface CorrelationCardProps {
  scanId: string;
  correlation: ApiRow; // [id, title, ruleId, risk, ruleName, descr, logic, eventCount]
}

export default function CorrelationCard({ scanId, correlation }: CorrelationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const correlationId = correlation[0];
  const title = correlation[1];
  const risk = correlation[3];
  const description = correlation[5];
  const eventCount = correlation[7];
  const ruleId = correlation[2];

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['correlationEvents', scanId, correlationId],
    queryFn: async () => {
      const { data } = await getScanEvents(scanId, 'ALL', false, String(correlationId));
      return data;
    },
    enabled: isExpanded,
  });

  const riskColorClass =
    risk === 'HIGH'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
      : risk === 'MEDIUM'
        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
        : risk === 'LOW'
          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--sf-border)]">
      {/* Header - clickable */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex cursor-pointer items-center gap-2 p-4 transition-colors hover:bg-[var(--sf-bg-secondary)]"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-[var(--sf-text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        <span className={`rounded px-2 py-0.5 text-xs font-medium ${riskColorClass}`}>{risk}</span>
        <span className="font-medium">{title}</span>
        <span className="ml-auto shrink-0 text-xs text-[var(--sf-text-muted)]">{eventCount} events</span>
      </div>

      {/* Description */}
      <div className="px-4 pb-3 pl-10">
        <p className="text-sm text-[var(--sf-text-muted)]">{description}</p>
        <p className="mt-1 text-xs text-[var(--sf-text-muted)]">Rule: {ruleId}</p>
      </div>

      {/* Expanded event list */}
      {isExpanded && (
        <div className="border-t border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--sf-primary)] border-t-transparent" />
            </div>
          ) : events.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--sf-text-muted)]">No events found for this correlation.</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
                  <tr>
                    <th className="px-4 py-2 text-xs font-medium text-[var(--sf-text-muted)]">Data</th>
                    <th className="px-4 py-2 text-xs font-medium text-[var(--sf-text-muted)]">Source Data</th>
                    <th className="px-4 py-2 text-xs font-medium text-[var(--sf-text-muted)]">Module</th>
                    <th className="px-4 py-2 text-xs font-medium text-[var(--sf-text-muted)]">Identified</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((row: ApiRow, idx: number) => (
                    <tr key={idx} className="border-b border-[var(--sf-border)]">
                      <td className="max-w-xs truncate px-4 py-2 font-mono text-xs">{row[1]}</td>
                      <td className="max-w-xs truncate px-4 py-2 text-xs">{row[2]}</td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{row[3]}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-[var(--sf-text-muted)]">{row[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
