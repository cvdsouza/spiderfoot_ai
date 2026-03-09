import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getScanEvents } from '../../api/results';

type ApiRow = Array<string | number | boolean | null>;

interface CorrelationCardProps {
  scanId: string;
  correlation: ApiRow;
}

const RISK_COLORS: Record<string, { label: string; bg: string; border: string }> = {
  HIGH:   { label: '#FF3B30', bg: '#280A08', border: '#FF3B30' },
  MEDIUM: { label: '#FF9F0A', bg: '#271500', border: '#FF9F0A' },
  LOW:    { label: '#FFD60A', bg: '#1F1B00', border: '#FFD60A' },
  INFO:   { label: '#00B4FF', bg: '#001828', border: '#00B4FF' },
};

export default function CorrelationCard({ scanId, correlation }: CorrelationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const correlationId = correlation[0];
  const title = correlation[1];
  const risk = String(correlation[3] || 'INFO');
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

  const c = RISK_COLORS[risk] || RISK_COLORS.INFO;

  return (
    <div style={{
      borderLeft: `3px solid ${c.border}`,
      background: '#0A0E14',
      border: '1px solid #18181B',
      borderLeftWidth: '3px',
      borderLeftColor: c.border,
    }}>
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', cursor: 'pointer',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ color: '#52525B', fontSize: '10px', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <span style={{
          background: c.bg, color: c.label, border: `1px solid ${c.border}50`,
          borderRadius: '2px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
          flexShrink: 0,
        }}>
          {risk}
        </span>
        <span style={{ fontSize: '12px', color: '#F4F4F5', fontWeight: 500, flex: 1 }}>{title}</span>
        <span style={{ fontSize: '9px', color: '#52525B', flexShrink: 0, letterSpacing: '0.05em' }}>
          {eventCount} EVENTS
        </span>
      </div>

      {/* Description */}
      <div style={{ padding: '0 16px 12px 42px' }}>
        <p style={{ fontSize: '11px', color: '#71717A', lineHeight: 1.5 }}>{description}</p>
        <p style={{ marginTop: '4px', fontSize: '9px', color: '#3F3F46', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
          RULE: {ruleId}
        </p>
      </div>

      {/* Expanded events */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #18181B', background: '#060A0F' }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                border: '2px solid #00B4FF30', borderTopColor: '#00B4FF',
                animation: 'sf-spin 1.2s linear infinite',
              }} />
            </div>
          ) : events.length === 0 ? (
            <p style={{ padding: '12px 16px', fontSize: '11px', color: '#52525B' }}>
              No events found for this correlation.
            </p>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ background: '#060A0F', position: 'sticky', top: 0 }}>
                    {['DATA', 'SOURCE DATA', 'MODULE', 'IDENTIFIED'].map((h) => (
                      <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700, borderBottom: '1px solid #18181B' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(events as ApiRow[]).map((row: ApiRow, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #0D1117' }}>
                      <td style={{ padding: '6px 12px', fontFamily: 'monospace', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#A1A1AA' }}>{row[1]}</td>
                      <td style={{ padding: '6px 12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#71717A' }}>{row[2]}</td>
                      <td style={{ padding: '6px 12px', fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#00B4FF' }}>{row[3]}</td>
                      <td style={{ padding: '6px 12px', whiteSpace: 'nowrap', color: '#52525B' }}>{row[0]}</td>
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
