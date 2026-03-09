import { useQuery } from '@tanstack/react-query';
import { getScanLog, getScanErrors } from '../../api/scans';
import { useState } from 'react';

type ApiRow = Array<string | number | boolean | null>;

interface ScanLogProps {
  scanId: string;
  isRunning: boolean;
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  ERROR:   '#FF3B30',
  WARNING: '#FF9F0A',
  INFO:    '#00B4FF',
  DEBUG:   '#52525B',
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
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '2px', background: '#060A0F', padding: '3px', borderRadius: '2px', border: '1px solid #18181B' }}>
          <button
            onClick={() => setShowErrors(false)}
            style={{
              padding: '5px 12px', background: !showErrors ? '#00B4FF' : 'transparent',
              color: !showErrors ? '#000' : '#52525B', border: 'none', borderRadius: '2px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
            }}
          >
            LOG
          </button>
          <button
            onClick={() => setShowErrors(true)}
            style={{
              padding: '5px 12px', background: showErrors ? '#FF3B30' : 'transparent',
              color: showErrors ? '#000' : '#52525B', border: 'none', borderRadius: '2px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
            }}
          >
            ERRORS
          </button>
        </div>

        {!showErrors && (
          <select
            value={logLimit}
            onChange={(e) => setLogLimit(Number(e.target.value))}
            style={{
              background: '#060A0F', border: '1px solid #18181B',
              borderRadius: '2px', padding: '5px 8px',
              color: '#A1A1AA', fontSize: '10px', cursor: 'pointer',
            }}
          >
            <option value={100}>LAST 100</option>
            <option value={200}>LAST 200</option>
            <option value={500}>LAST 500</option>
            <option value={1000}>LAST 1000</option>
          </select>
        )}

        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#52525B', letterSpacing: '0.1em' }}>
          {entries.length} ENTRIES
        </span>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%',
            border: '2px solid #00B4FF30', borderTopColor: '#00B4FF',
            animation: 'sf-spin 1.2s linear infinite',
          }} />
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', fontSize: '9px', letterSpacing: '0.2em', color: '#3F3F46' }}>
          {showErrors ? 'NO ERRORS RECORDED' : 'NO LOG ENTRIES YET'}
        </div>
      ) : (
        <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#060A0F', borderBottom: '1px solid #18181B' }}>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700 }}>TIME</th>
                {!showErrors && <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700 }}>LEVEL</th>}
                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700 }}>MODULE</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700 }}>MESSAGE</th>
              </tr>
            </thead>
            <tbody>
              {(entries as ApiRow[]).map((row: ApiRow, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid #0D1117' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '5px 12px', whiteSpace: 'nowrap', color: '#52525B', fontFamily: 'monospace', fontSize: '10px' }}>{row[0]}</td>
                  {!showErrors && (
                    <td style={{ padding: '5px 12px', fontWeight: 700, fontSize: '10px', color: LOG_LEVEL_COLORS[String(row[1])] || '#71717A', letterSpacing: '0.05em' }}>
                      {row[1]}
                    </td>
                  )}
                  <td style={{ padding: '5px 12px', fontFamily: 'monospace', color: '#00B4FF', fontSize: '10px' }}>{showErrors ? row[1] : row[2]}</td>
                  <td style={{ padding: '5px 12px', color: '#A1A1AA', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{showErrors ? row[2] : row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
