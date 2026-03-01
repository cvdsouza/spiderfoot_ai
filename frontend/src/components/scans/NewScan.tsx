import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createScan } from '../../api/scans';
import { getModules, getEventTypes } from '../../api/settings';
import type { ModuleInfo, ScanCreate } from '../../types';

type SelectionMode = 'usecase' | 'types' | 'modules';

export default function NewScan() {
  const navigate = useNavigate();
  const [scanName, setScanName] = useState('');
  const [scanTarget, setScanTarget] = useState('');
  const [mode, setMode] = useState<SelectionMode>('usecase');
  const [useCase, setUseCase] = useState('all');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { data: modules = [] } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => {
      const { data } = await getModules();
      return data as ModuleInfo[];
    },
  });

  const { data: eventTypes = [] } = useQuery({
    queryKey: ['eventTypes'],
    queryFn: async () => {
      const { data } = await getEventTypes();
      return data as [string, string][];
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!scanName.trim() || !scanTarget.trim()) {
      setError('Scan name and target are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: ScanCreate = {
        scan_name: scanName,
        scan_target: scanTarget,
      };

      if (mode === 'usecase') {
        payload.use_case = useCase;
      } else if (mode === 'modules') {
        payload.module_list = Array.from(selectedModules).join(',');
      } else if (mode === 'types') {
        payload.type_list = Array.from(selectedTypes).join(',');
      }

      const { data } = await createScan(payload);
      if (data[0] === 'SUCCESS') {
        navigate(`/scaninfo/${data[1]}`);
      } else {
        setError(data[1] || 'Failed to start scan');
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail || 'Failed to start scan');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold">New Scan</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Scan Name</label>
            <input
              type="text"
              value={scanName}
              onChange={(e) => setScanName(e.target.value)}
              placeholder="My Scan"
              className="w-full rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Target</label>
            <input
              type="text"
              value={scanTarget}
              onChange={(e) => setScanTarget(e.target.value)}
              placeholder="example.com, 1.2.3.4, user@email.com"
              className="w-full rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Selection mode tabs */}
        <div>
          <div className="mb-3 flex gap-1 rounded-lg border border-[var(--sf-border)] p-1">
            {[
              { key: 'usecase' as SelectionMode, label: 'By Use Case' },
              { key: 'types' as SelectionMode, label: 'By Data Type' },
              { key: 'modules' as SelectionMode, label: 'By Module' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMode(tab.key)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  mode === tab.key
                    ? 'bg-[var(--sf-primary)] text-white'
                    : 'text-[var(--sf-text-muted)] hover:bg-[var(--sf-bg-secondary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === 'usecase' && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {[
                { value: 'all', label: 'All', desc: 'Run all modules' },
                { value: 'Footprint', label: 'Footprint', desc: 'Passive and active recon' },
                { value: 'Investigate', label: 'Investigate', desc: 'Investigate a target' },
                { value: 'Passive', label: 'Passive', desc: 'Passive reconnaissance only' },
              ].map((uc) => (
                <label
                  key={uc.value}
                  className={`cursor-pointer rounded-lg border p-3 ${
                    useCase === uc.value
                      ? 'border-[var(--sf-primary)] bg-blue-50 dark:bg-blue-900/20'
                      : 'border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="usecase"
                    value={uc.value}
                    checked={useCase === uc.value}
                    onChange={(e) => setUseCase(e.target.value)}
                    className="sr-only"
                  />
                  <div className="font-medium">{uc.label}</div>
                  <div className="text-xs text-[var(--sf-text-muted)]">{uc.desc}</div>
                </label>
              ))}
            </div>
          )}

          {mode === 'modules' && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--sf-border)] p-3">
              <div className="mb-2 flex gap-2">
                <button type="button" onClick={() => setSelectedModules(new Set(modules.map((m) => m.name)))} className="text-xs text-[var(--sf-primary)]">Select All</button>
                <button type="button" onClick={() => setSelectedModules(new Set())} className="text-xs text-[var(--sf-primary)]">Deselect All</button>
              </div>
              <div className="grid gap-1">
                {modules.map((mod) => (
                  <label key={mod.name} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedModules.has(mod.name)}
                      onChange={(e) => {
                        const next = new Set(selectedModules);
                        if (e.target.checked) next.add(mod.name);
                        else next.delete(mod.name);
                        setSelectedModules(next);
                      }}
                      className="rounded"
                    />
                    <span className="font-mono text-xs">{mod.name}</span>
                    <span className="text-xs text-[var(--sf-text-muted)]">{mod.descr}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {mode === 'types' && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--sf-border)] p-3">
              <div className="mb-2 flex gap-2">
                <button type="button" onClick={() => setSelectedTypes(new Set(eventTypes.map((t) => t[1])))} className="text-xs text-[var(--sf-primary)]">Select All</button>
                <button type="button" onClick={() => setSelectedTypes(new Set())} className="text-xs text-[var(--sf-primary)]">Deselect All</button>
              </div>
              <div className="grid gap-1">
                {eventTypes.map((t) => (
                  <label key={t[1]} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTypes.has(t[1])}
                      onChange={(e) => {
                        const next = new Set(selectedTypes);
                        if (e.target.checked) next.add(t[1]);
                        else next.delete(t[1]);
                        setSelectedTypes(next);
                      }}
                      className="rounded"
                    />
                    <span>{t[0]}</span>
                    <span className="font-mono text-xs text-[var(--sf-text-muted)]">({t[1]})</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-[var(--sf-primary)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--sf-primary-hover)] disabled:opacity-50"
        >
          {isSubmitting ? 'Starting...' : 'Start Scan'}
        </button>
      </form>
    </div>
  );
}
