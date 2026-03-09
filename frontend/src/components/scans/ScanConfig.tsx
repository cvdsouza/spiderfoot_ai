import { useQuery } from '@tanstack/react-query';
import { getScanConfig } from '../../api/scans';
import { useState } from 'react';

interface ScanConfigProps {
  scanId: string;
}

export default function ScanConfig({ scanId }: ScanConfigProps) {
  const [filter, setFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['scanConfig', scanId],
    queryFn: async () => {
      const { data } = await getScanConfig(scanId);
      return data;
    },
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '50%',
          border: '2px solid #00B4FF30', borderTopColor: '#00B4FF',
          animation: 'sf-spin 1.2s linear infinite',
        }} />
      </div>
    );
  }

  if (!data) {
    return <p style={{ color: '#52525B', fontSize: '11px' }}>No configuration data available.</p>;
  }

  const meta = data.meta || [];
  const config = data.config || {};
  const configDesc = data.configdesc || {};

  const configKeys = Object.keys(config)
    .filter((key) => {
      if (!filter) return true;
      const lf = filter.toLowerCase();
      return key.toLowerCase().includes(lf) || String(config[key]).toLowerCase().includes(lf);
    })
    .sort();

  const enabledModules = config['_modulesenabled']
    ? String(config['_modulesenabled']).split(',').filter(Boolean)
    : [];

  const metaRows = [
    ['NAME', meta[0]],
    ['TARGET', meta[1]],
    ['CREATED', meta[2]],
    ['STARTED', meta[3]],
    ['ENDED', meta[4]],
    ['STATUS', meta[5]],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Scan metadata */}
      <div style={{ background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px', padding: '16px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '12px' }}>SCAN METADATA</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {metaRows.map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
              <span style={{ fontSize: '9px', color: '#3F3F46', letterSpacing: '0.12em', fontWeight: 700, flexShrink: 0 }}>{label}:</span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#A1A1AA' }}>{String(value || '—')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Enabled modules */}
      {enabledModules.length > 0 && (
        <div style={{ background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px', padding: '16px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '12px' }}>
            ENABLED MODULES ({enabledModules.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {enabledModules.sort().map((mod) => (
              <span
                key={mod}
                style={{
                  background: '#060A0F', border: '1px solid #18181B',
                  borderRadius: '2px', padding: '2px 8px',
                  fontFamily: 'monospace', fontSize: '10px', color: '#00B4FF',
                }}
              >
                {mod}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Config options */}
      <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: '1px solid #18181B', background: '#060A0F',
        }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B' }}>CONFIGURATION OPTIONS</div>
          <input
            type="text"
            placeholder="filter options..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px',
              padding: '4px 8px', color: '#A1A1AA', fontSize: '11px', outline: 'none',
            }}
          />
        </div>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#060A0F', position: 'sticky', top: 0 }}>
                {['OPTION', 'VALUE', 'DESCRIPTION'].map((h) => (
                  <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700, borderBottom: '1px solid #18181B' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {configKeys
                .filter((key) => key !== '_modulesenabled')
                .map((key) => (
                  <tr key={key} style={{ borderBottom: '1px solid #0D1117' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '6px 12px', fontFamily: 'monospace', color: '#00B4FF', fontSize: '10px' }}>{key}</td>
                    <td style={{ padding: '6px 12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#A1A1AA' }}>{String(config[key])}</td>
                    <td style={{ padding: '6px 12px', color: '#52525B', fontSize: '10px' }}>{configDesc[key] || ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
