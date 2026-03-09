import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getScanSummary, stopScan } from '../../api/scans';
import { getScanCorrelations } from '../../api/results';
import { useScanStatus } from '../../hooks/useScanStatus';
import StatusBadge from '../common/StatusBadge';
import EventBrowser from './EventBrowser';
import ScanLog from './ScanLog';
import ScanConfig from './ScanConfig';
import GraphView from './GraphView';
import AiInsights from './AiInsights';
import type { RiskMatrix } from '../../types';
import CorrelationCard from './CorrelationCard';
import { useState } from 'react';
import SpideyIcon from '../common/SpideyIcon';

type ApiRow = Array<string | number | boolean | null>;

type TabType = 'summary' | 'correlations' | 'browse' | 'log' | 'graph' | 'config' | 'ai-insights';

const RISK_COLORS: Record<string, { label: string; bg: string; border: string }> = {
  CRITICAL: { label: '#FF3B30', bg: '#280A08', border: '#FF3B30' },
  HIGH:     { label: '#FF9F0A', bg: '#271500', border: '#FF9F0A' },
  MEDIUM:   { label: '#FFD60A', bg: '#1F1B00', border: '#FFD60A' },
  LOW:      { label: '#A1A1AA', bg: '#111418', border: '#48484A' },
  INFO:     { label: '#00B4FF', bg: '#001828', border: '#00B4FF' },
};

function RiskPills({ riskMatrix, onRiskClick }: { riskMatrix: RiskMatrix; onRiskClick?: (r: string) => void }) {
  const levels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {levels.map((level) => {
        const count = (riskMatrix as unknown as Record<string, number>)[level] || 0;
        if (!count) return null;
        const c = RISK_COLORS[level];
        return (
          <button
            key={level}
            onClick={() => onRiskClick?.(level)}
            style={{
              background: c.bg, color: c.label,
              border: `1px solid ${c.border}40`,
              borderRadius: '2px', padding: '2px 7px',
              fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
              cursor: onRiskClick ? 'pointer' : 'default',
            }}
          >
            {count} {level}
          </button>
        );
      })}
    </div>
  );
}

const TAB_LABELS: Record<TabType, string> = {
  summary: 'SUMMARY',
  correlations: 'CORRELATIONS',
  browse: 'BROWSE',
  graph: 'GRAPH',
  'ai-insights': 'SPIDEY',
  log: 'LOG',
  config: 'CONFIG',
};

const CORRELATION_FILTER_COLORS: Record<string, { label: string; bg: string; border: string }> = {
  HIGH:   { label: '#FF3B30', bg: '#280A08', border: '#FF3B30' },
  MEDIUM: { label: '#FF9F0A', bg: '#271500', border: '#FF9F0A' },
  LOW:    { label: '#FFD60A', bg: '#1F1B00', border: '#FFD60A' },
  INFO:   { label: '#00B4FF', bg: '#001828', border: '#00B4FF' },
};

export default function ScanInfo() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [browseEventType, setBrowseEventType] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleEventTypeClick = (eventType: string) => {
    setBrowseEventType(eventType);
    setActiveTab('browse');
  };

  const handleRiskClick = (risk: string) => {
    setRiskFilter(risk);
    setActiveTab('correlations');
  };

  const scanId = id ?? '';

  const stopMutation = useMutation({
    mutationFn: () => stopScan(scanId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scanStatus', scanId] }),
  });

  const { data: statusData } = useScanStatus(scanId);

  const { data: summaryData = [] } = useQuery({
    queryKey: ['scanSummary', scanId],
    queryFn: async () => {
      const { data } = await getScanSummary(scanId);
      return data;
    },
    enabled: !!id,
    refetchInterval: statusData?.[5] === 'RUNNING' ? 5000 : false,
  });

  const { data: correlations = [] } = useQuery({
    queryKey: ['scanCorrelations', scanId],
    queryFn: async () => {
      const { data } = await getScanCorrelations(scanId);
      return data;
    },
    enabled: !!id && activeTab === 'correlations',
    refetchInterval: activeTab === 'correlations' && statusData?.[5] === 'RUNNING' ? 5000 : false,
  });

  if (!id || !statusData) {
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

  const scanName = statusData[0] as string;
  const scanTarget = statusData[1] as string;
  const status = statusData[5] as string;
  const riskMatrix = statusData[6] as RiskMatrix;

  const isActive = ['RUNNING', 'STARTING', 'STARTED', 'INITIALIZING'].includes(status);
  const isStopping = status === 'ABORT-REQUESTED';

  const tabs: { key: TabType }[] = [
    { key: 'summary' },
    { key: 'correlations' },
    { key: 'browse' },
    { key: 'graph' },
    { key: 'ai-insights' },
    { key: 'log' },
    { key: 'config' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Link
          to="/scans"
          style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#52525B', textDecoration: 'none' }}
        >
          ← SCAN QUEUE
        </Link>

        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '4px' }}>
              ACTIVE OPERATION
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#F4F4F5', letterSpacing: '0.05em' }}>
                {scanName}
              </h1>
              <StatusBadge status={status} />
            </div>
            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '11px', color: '#71717A', fontFamily: 'monospace' }}>{scanTarget}</span>
              {riskMatrix && <RiskPills riskMatrix={riskMatrix} onRiskClick={handleRiskClick} />}
            </div>
          </div>

          {(isActive || isStopping) && (
            <button
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending || isStopping}
              style={{
                background: '#271500', color: '#FF9F0A',
                border: '1px solid #FF9F0A50',
                padding: '8px 16px', borderRadius: '2px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
                cursor: stopMutation.isPending || isStopping ? 'not-allowed' : 'pointer',
                opacity: stopMutation.isPending || isStopping ? 0.5 : 1,
              }}
            >
              {isStopping ? '⬛ TERMINATING...' : '■ ABORT SCAN'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #18181B', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid #00B4FF' : '2px solid transparent',
                color: activeTab === tab.key ? '#00B4FF' : '#52525B',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'color 0.15s',
                marginBottom: '-1px',
              }}
            >
              {tab.key === 'ai-insights' && <SpideyIcon size={12} />}
              {TAB_LABELS[tab.key]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'summary' && (
          <div>
            {summaryData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#3F3F46' }}>
                  NO DATA COLLECTED YET
                </div>
              </div>
            ) : (
              <>
                {/* Bar chart */}
                <div style={{
                  marginBottom: '16px', padding: '16px',
                  background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px',
                }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#52525B', marginBottom: '12px' }}>
                    DATA DISTRIBUTION
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {(() => {
                      const sorted = [...summaryData as ApiRow[]].sort((a, b) => Number(b[3]) - Number(a[3]));
                      const top = sorted.slice(0, 15);
                      const maxTotal = top.length > 0 ? Number(top[0][3]) : 1;
                      return top.map((row: ApiRow, idx: number) => (
                        <div
                          key={idx}
                          onClick={() => handleEventTypeClick(String(row[0]))}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '3px 6px', borderRadius: '2px' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ width: '180px', flexShrink: 0, fontSize: '10px', color: '#00B4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row[0]}
                          </span>
                          <div style={{ flex: 1, height: '6px', background: '#060A0F', borderRadius: '1px', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', background: '#00B4FF',
                              width: `${maxTotal > 0 ? (Number(row[3]) / maxTotal) * 100 : 0}%`,
                              opacity: 0.7,
                            }} />
                          </div>
                          <span style={{ width: '50px', flexShrink: 0, textAlign: 'right', fontSize: '10px', color: '#71717A' }}>
                            {row[3]}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Summary table */}
                <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#060A0F', borderBottom: '1px solid #18181B' }}>
                        {['EVENT TYPE', 'DESCRIPTION', 'LAST SEEN', 'TOTAL', 'UNIQUE'].map((h) => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(summaryData as ApiRow[]).map((row: ApiRow, idx: number) => (
                        <tr
                          key={idx}
                          onClick={() => handleEventTypeClick(String(row[0]))}
                          style={{ borderBottom: '1px solid #0D1117', cursor: 'pointer' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '8px 12px', color: '#00B4FF', fontFamily: 'monospace', fontSize: '10px' }}>{row[0]}</td>
                          <td style={{ padding: '8px 12px', color: '#A1A1AA', fontSize: '11px' }}>{row[1]}</td>
                          <td style={{ padding: '8px 12px', color: '#52525B', fontSize: '10px' }}>{row[2]}</td>
                          <td style={{ padding: '8px 12px', color: '#F4F4F5', fontSize: '11px' }}>{row[3]}</td>
                          <td style={{ padding: '8px 12px', color: '#71717A', fontSize: '11px' }}>{row[4]}</td>
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
            {/* Risk filter */}
            <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
              {(['HIGH', 'MEDIUM', 'LOW', 'INFO'] as const).map((level) => {
                const count = (correlations as ApiRow[]).filter((r: ApiRow) => r[3] === level).length;
                if (count === 0) return null;
                const isActiveFilter = riskFilter === level;
                const c = CORRELATION_FILTER_COLORS[level];
                return (
                  <button
                    key={level}
                    onClick={() => setRiskFilter(isActiveFilter ? null : level)}
                    style={{
                      background: isActiveFilter ? c.label : c.bg,
                      color: isActiveFilter ? '#000' : c.label,
                      border: `1px solid ${c.border}50`,
                      padding: '4px 12px', borderRadius: '2px',
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
                      cursor: 'pointer',
                    }}
                  >
                    {count} {level}
                  </button>
                );
              })}
              {riskFilter && (
                <button
                  onClick={() => setRiskFilter(null)}
                  style={{ background: 'none', border: 'none', color: '#52525B', fontSize: '10px', letterSpacing: '0.1em', cursor: 'pointer' }}
                >
                  CLEAR FILTER
                </button>
              )}
            </div>

            {correlations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', fontSize: '9px', letterSpacing: '0.2em', color: '#3F3F46' }}>
                NO CORRELATIONS FOUND
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(correlations as ApiRow[])
                  .filter((row: ApiRow) => !riskFilter || row[3] === riskFilter)
                  .map((row: ApiRow, idx: number) => (
                    <CorrelationCard key={String(row[0]) || String(idx)} scanId={id} correlation={row} />
                  ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'browse' && (
          <EventBrowser
            scanId={id}
            isRunning={status === 'RUNNING'}
            initialEventType={browseEventType}
            eventTypes={(summaryData as ApiRow[]).map((row: ApiRow) => String(row[0])).sort()}
          />
        )}

        {activeTab === 'graph' && (
          <GraphView scanId={id} />
        )}

        {activeTab === 'log' && (
          <ScanLog scanId={id} isRunning={status === 'RUNNING'} />
        )}

        {activeTab === 'ai-insights' && (
          <AiInsights scanId={id} scanStatus={status} />
        )}

        {activeTab === 'config' && (
          <ScanConfig scanId={id} />
        )}
      </div>
    </div>
  );
}
