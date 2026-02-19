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
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-[var(--sf-text-muted)]">No configuration data available.</p>;
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

  // Extract enabled modules
  const enabledModules = config['_modulesenabled']
    ? String(config['_modulesenabled']).split(',').filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      {/* Scan metadata */}
      <div className="rounded-lg border border-[var(--sf-border)] p-4">
        <h3 className="mb-3 text-sm font-semibold">Scan Metadata</h3>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          {[
            ['Name', meta[0]],
            ['Target', meta[1]],
            ['Created', meta[2]],
            ['Started', meta[3]],
            ['Ended', meta[4]],
            ['Status', meta[5]],
          ].map(([label, value]) => (
            <div key={label as string} className="flex gap-2">
              <span className="font-medium text-[var(--sf-text-muted)]">{label}:</span>
              <span className="font-mono text-xs">{value || '-'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Enabled modules */}
      {enabledModules.length > 0 && (
        <div className="rounded-lg border border-[var(--sf-border)] p-4">
          <h3 className="mb-3 text-sm font-semibold">
            Enabled Modules ({enabledModules.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {enabledModules.sort().map((mod) => (
              <span
                key={mod}
                className="rounded bg-[var(--sf-bg-secondary)] px-2 py-0.5 font-mono text-xs"
              >
                {mod}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Configuration options */}
      <div className="rounded-lg border border-[var(--sf-border)]">
        <div className="flex items-center justify-between border-b border-[var(--sf-border)] px-4 py-3">
          <h3 className="text-sm font-semibold">Configuration Options</h3>
          <input
            type="text"
            placeholder="Filter options..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 py-1 text-sm"
          />
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
              <tr>
                <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Option</th>
                <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Value</th>
                <th className="px-3 py-2 font-medium text-[var(--sf-text-muted)]">Description</th>
              </tr>
            </thead>
            <tbody>
              {configKeys
                .filter((key) => key !== '_modulesenabled')
                .map((key) => (
                  <tr key={key} className="border-b border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]">
                    <td className="px-3 py-1.5 font-mono text-xs">{key}</td>
                    <td className="max-w-xs truncate px-3 py-1.5 text-xs">{String(config[key])}</td>
                    <td className="px-3 py-1.5 text-xs text-[var(--sf-text-muted)]">{configDesc[key] || ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
