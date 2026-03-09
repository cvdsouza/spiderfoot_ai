import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createScan } from '../../api/scans';
import { getModules, getEventTypes } from '../../api/settings';
import type { ModuleInfo, ScanCreate } from '../../types';

type SelectionMode = 'usecase' | 'types' | 'modules';

const inputStyle = {
  background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px',
  padding: '10px 12px', color: '#F4F4F5', fontSize: '12px', outline: 'none', width: '100%',
  fontFamily: 'inherit',
};

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
      const payload: ScanCreate = { scan_name: scanName, scan_target: scanTarget };
      if (mode === 'usecase') payload.use_case = useCase;
      else if (mode === 'modules') payload.module_list = Array.from(selectedModules).join(',');
      else if (mode === 'types') payload.type_list = Array.from(selectedTypes).join(',');

      const { data } = await createScan(payload);
      if (data[0] === 'SUCCESS') navigate(`/scaninfo/${data[1]}`);
      else setError(data[1] || 'Failed to start scan');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail || 'Failed to start scan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const USE_CASES = [
    { value: 'all',         label: 'ALL MODULES',  desc: 'Run all enabled modules' },
    { value: 'Footprint',   label: 'FOOTPRINT',    desc: 'Passive and active recon' },
    { value: 'Investigate', label: 'INVESTIGATE',  desc: 'Investigate a target' },
    { value: 'Passive',     label: 'PASSIVE',      desc: 'Passive reconnaissance only' },
  ];

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '4px' }}>
          INTELLIGENCE OPERATIONS
        </div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#F4F4F5', letterSpacing: '0.05em' }}>
          INITIATE SCAN
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{
            marginBottom: '16px', padding: '12px 16px',
            background: '#280A08', borderLeft: '3px solid #FF3B30',
            fontSize: '11px', color: '#FF3B30',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Name + Target */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#52525B', marginBottom: '6px' }}>
              OPERATION NAME
            </div>
            <input
              type="text"
              value={scanName}
              onChange={(e) => setScanName(e.target.value)}
              placeholder="my-scan-2024"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#00B4FF')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#18181B')}
            />
          </div>
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#52525B', marginBottom: '6px' }}>
              TARGET
            </div>
            <input
              type="text"
              value={scanTarget}
              onChange={(e) => setScanTarget(e.target.value)}
              placeholder="example.com, 1.2.3.4, user@email.com"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#00B4FF')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#18181B')}
            />
          </div>
        </div>

        {/* Mode selection */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#52525B', marginBottom: '10px' }}>
            MODULE SELECTION
          </div>
          <div style={{ display: 'flex', gap: '2px', background: '#060A0F', padding: '3px', border: '1px solid #18181B', borderRadius: '2px', marginBottom: '12px' }}>
            {([
              { key: 'usecase' as SelectionMode, label: 'USE CASE' },
              { key: 'types' as SelectionMode,   label: 'DATA TYPE' },
              { key: 'modules' as SelectionMode, label: 'MODULE' },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMode(tab.key)}
                style={{
                  padding: '6px 14px', background: mode === tab.key ? '#00B4FF' : 'transparent',
                  color: mode === tab.key ? '#000' : '#52525B', border: 'none', borderRadius: '2px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === 'usecase' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {USE_CASES.map((uc) => (
                <label
                  key={uc.value}
                  style={{
                    display: 'block', padding: '12px',
                    background: useCase === uc.value ? '#001828' : '#0A0E14',
                    border: `1px solid ${useCase === uc.value ? '#00B4FF' : '#18181B'}`,
                    borderRadius: '2px', cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <input type="radio" name="usecase" value={uc.value} checked={useCase === uc.value} onChange={(e) => setUseCase(e.target.value)} style={{ display: 'none' }} />
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: useCase === uc.value ? '#00B4FF' : '#F4F4F5', marginBottom: '4px' }}>
                    {uc.label}
                  </div>
                  <div style={{ fontSize: '10px', color: '#52525B' }}>{uc.desc}</div>
                </label>
              ))}
            </div>
          )}

          {mode === 'modules' && (
            <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: '12px', padding: '8px 12px', background: '#060A0F', borderBottom: '1px solid #18181B' }}>
                <button type="button" onClick={() => setSelectedModules(new Set(modules.map((m) => m.name)))} style={{ background: 'none', border: 'none', color: '#00B4FF', fontSize: '10px', letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'inherit' }}>SELECT ALL</button>
                <button type="button" onClick={() => setSelectedModules(new Set())} style={{ background: 'none', border: 'none', color: '#52525B', fontSize: '10px', letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'inherit' }}>CLEAR</button>
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#52525B' }}>{selectedModules.size} SELECTED</span>
              </div>
              <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '8px 0' }}>
                {modules.map((mod) => (
                  <label key={mod.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 12px', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModules.has(mod.name)}
                      onChange={(e) => {
                        const next = new Set(selectedModules);
                        if (e.target.checked) next.add(mod.name);
                        else next.delete(mod.name);
                        setSelectedModules(next);
                      }}
                      style={{ accentColor: '#00B4FF', cursor: 'pointer' }}
                    />
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#00B4FF', width: '180px', flexShrink: 0 }}>{mod.name}</span>
                    <span style={{ fontSize: '10px', color: '#71717A' }}>{mod.descr}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {mode === 'types' && (
            <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: '12px', padding: '8px 12px', background: '#060A0F', borderBottom: '1px solid #18181B' }}>
                <button type="button" onClick={() => setSelectedTypes(new Set(eventTypes.map((t) => t[1])))} style={{ background: 'none', border: 'none', color: '#00B4FF', fontSize: '10px', letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'inherit' }}>SELECT ALL</button>
                <button type="button" onClick={() => setSelectedTypes(new Set())} style={{ background: 'none', border: 'none', color: '#52525B', fontSize: '10px', letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'inherit' }}>CLEAR</button>
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#52525B' }}>{selectedTypes.size} SELECTED</span>
              </div>
              <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '8px 0' }}>
                {eventTypes.map((t) => (
                  <label key={t[1]} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 12px', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTypes.has(t[1])}
                      onChange={(e) => {
                        const next = new Set(selectedTypes);
                        if (e.target.checked) next.add(t[1]);
                        else next.delete(t[1]);
                        setSelectedTypes(next);
                      }}
                      style={{ accentColor: '#00B4FF', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '11px', color: '#A1A1AA', flex: 1 }}>{t[0]}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '9px', color: '#52525B' }}>{t[1]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            background: isSubmitting ? '#060A0F' : '#00B4FF',
            color: isSubmitting ? '#3F3F46' : '#000',
            border: `1px solid ${isSubmitting ? '#27272A' : '#00B4FF'}`,
            padding: '10px 24px', borderRadius: '2px',
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? '◈ INITIALIZING...' : '◈ LAUNCH SCAN'}
        </button>
      </form>
    </div>
  );
}
