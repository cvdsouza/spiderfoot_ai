import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getScanSummary } from '../../api/scans';
import { getScanCorrelations } from '../../api/results';
import { useScanStatus } from '../../hooks/useScanStatus';
import StatusBadge from '../common/StatusBadge';
import RiskBadges from '../common/RiskBadges';
import EventBrowser from './EventBrowser';
import ScanLog from './ScanLog';
import ScanConfig from './ScanConfig';
import GraphView from './GraphView';
import AiInsights from './AiInsights';
import type { RiskMatrix } from '../../types';
import CorrelationCard from './CorrelationCard';
import { useState } from 'react';
import SpideyIcon from '../common/SpideyIcon';

type TabType = 'summary' | 'correlations' | 'browse' | 'log' | 'graph' | 'config' | 'ai-insights';

export default function ScanInfo() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [browseEventType, setBrowseEventType] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string | null>(null);

  const handleEventTypeClick = (eventType: string) => {
    setBrowseEventType(eventType);
    setActiveTab('browse');
  };

  const handleRiskClick = (risk: string) => {
    setRiskFilter(risk);
    setActiveTab('correlations');
  };

  const { data: statusData } = useScanStatus(id!);

  const { data: summaryData = [] } = useQuery({
    queryKey: ['scanSummary', id],
    queryFn: async () => {
      const { data } = await getScanSummary(id!);
      return data;
    },
    enabled: !!id,
    refetchInterval: statusData?.[5] === 'RUNNING' ? 5000 : false,
  });

  const { data: correlations = [] } = useQuery({
    queryKey: ['scanCorrelations', id],
    queryFn: async () => {
      const { data } = await getScanCorrelations(id!);
      return data;
    },
    enabled: !!id && activeTab === 'correlations',
    refetchInterval: activeTab === 'correlations' && statusData?.[5] === 'RUNNING' ? 5000 : false,
  });

  if (!statusData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
      </div>
    );
  }

  const scanName = statusData[0] as string;
  const scanTarget = statusData[1] as string;
  const status = statusData[5] as string;
  const riskMatrix = statusData[6] as RiskMatrix;

  const tabs: { key: TabType; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'correlations', label: 'Correlations' },
    { key: 'browse', label: 'Browse' },
    { key: 'graph', label: 'Graph' },
    { key: 'ai-insights', label: 'Spidey' },
    { key: 'log', label: 'Log' },
    { key: 'config', label: 'Config' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]">
            &larr; Scans
          </Link>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <h1 className="text-2xl font-bold">{scanName}</h1>
          <StatusBadge status={status} />
        </div>
        <div className="mt-1 flex items-center gap-4 text-sm text-[var(--sf-text-muted)]">
          <span className="font-mono">{scanTarget}</span>
          {riskMatrix && <RiskBadges riskMatrix={riskMatrix} onRiskClick={handleRiskClick} />}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-[var(--sf-border)]">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${
                activeTab === tab.key
                  ? 'border-[var(--sf-primary)] text-[var(--sf-primary)]'
                  : 'border-transparent text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]'
              }`}
            >
              {tab.key === 'ai-insights' && <SpideyIcon size={14} className="mr-1 inline-block" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'summary' && (
          <div>
            {summaryData.length === 0 ? (
              <p className="text-[var(--sf-text-muted)]">No data yet...</p>
            ) : (
              <>
                {/* Bar chart overview */}
                <div className="mb-4 rounded-lg border border-[var(--sf-border)] p-4">
                  <h3 className="mb-3 text-sm font-medium text-[var(--sf-text-muted)]">Data Distribution</h3>
                  <div className="space-y-1.5">
                    {(() => {
                      const sorted = [...summaryData].sort((a: any[], b: any[]) => b[3] - a[3]);
                      const top = sorted.slice(0, 15);
                      const maxTotal = top.length > 0 ? top[0][3] : 1;
                      return top.map((row: any[], idx: number) => (
                        <div
                          key={idx}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--sf-bg-secondary)]"
                          onClick={() => handleEventTypeClick(row[0])}
                        >
                          <span className="w-44 shrink-0 truncate text-xs font-mono text-[var(--sf-primary)]">{row[0]}</span>
                          <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--sf-bg-secondary)]">
                            <div
                              className="h-full rounded bg-[var(--sf-primary)] opacity-70"
                              style={{ width: `${maxTotal > 0 ? (row[3] / maxTotal) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="w-14 shrink-0 text-right text-xs text-[var(--sf-text-muted)]">{row[3]}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Summary table */}
                <div className="overflow-x-auto rounded-lg border border-[var(--sf-border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
                      <tr>
                        <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Event Type</th>
                        <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Description</th>
                        <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Last Seen</th>
                        <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Total</th>
                        <th className="px-3 py-3 font-medium text-[var(--sf-text-muted)]">Unique</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryData.map((row: any[], idx: number) => (
                        <tr
                          key={idx}
                          onClick={() => handleEventTypeClick(row[0])}
                          className="cursor-pointer border-b border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]"
                        >
                          <td className="px-3 py-2 font-mono text-xs text-[var(--sf-primary)]">{row[0]}</td>
                          <td className="px-3 py-2">{row[1]}</td>
                          <td className="px-3 py-2 text-xs text-[var(--sf-text-muted)]">{row[2]}</td>
                          <td className="px-3 py-2">{row[3]}</td>
                          <td className="px-3 py-2">{row[4]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'correlations' && (
          <div>
            {/* Risk level filter pills */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {['HIGH', 'MEDIUM', 'LOW', 'INFO'].map((level) => {
                const count = correlations.filter((r: any[]) => r[3] === level).length;
                if (count === 0) return null;
                const isActive = riskFilter === level;
                const colorMap: Record<string, string> = {
                  HIGH: isActive
                    ? 'bg-red-600 text-white dark:bg-red-700'
                    : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50',
                  MEDIUM: isActive
                    ? 'bg-orange-600 text-white dark:bg-orange-700'
                    : 'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:hover:bg-orange-900/50',
                  LOW: isActive
                    ? 'bg-yellow-600 text-white dark:bg-yellow-700'
                    : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:hover:bg-yellow-900/50',
                  INFO: isActive
                    ? 'bg-blue-600 text-white dark:bg-blue-700'
                    : 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50',
                };
                return (
                  <button
                    key={level}
                    onClick={() => setRiskFilter(isActive ? null : level)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${colorMap[level]}`}
                  >
                    {count} {level}
                  </button>
                );
              })}
              {riskFilter && (
                <button
                  onClick={() => setRiskFilter(null)}
                  className="text-xs text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]"
                >
                  Clear filter
                </button>
              )}
            </div>

            {correlations.length === 0 ? (
              <p className="text-[var(--sf-text-muted)]">No correlations found.</p>
            ) : (
              <div className="space-y-3">
                {correlations
                  .filter((row: any[]) => !riskFilter || row[3] === riskFilter)
                  .map((row: any[], idx: number) => (
                    <CorrelationCard key={row[0] || idx} scanId={id!} correlation={row} />
                  ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'browse' && (
          <EventBrowser scanId={id!} isRunning={status === 'RUNNING'} initialEventType={browseEventType} />
        )}

        {activeTab === 'graph' && (
          <GraphView scanId={id!} />
        )}

        {activeTab === 'log' && (
          <ScanLog scanId={id!} isRunning={status === 'RUNNING'} />
        )}

        {activeTab === 'ai-insights' && (
          <AiInsights scanId={id!} scanStatus={status} />
        )}

        {activeTab === 'config' && (
          <ScanConfig scanId={id!} />
        )}
      </div>
    </div>
  );
}
