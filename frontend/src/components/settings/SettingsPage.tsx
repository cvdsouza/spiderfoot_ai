import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, saveSettings } from '../../api/settings';
import { getAiConfig, saveAiConfig, testAiKey } from '../../api/ai';
import type { AiConfigStatus } from '../../types';
import SpideyIcon from '../common/SpideyIcon';

const inputStyle = {
  background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px',
  padding: '8px 12px', color: '#F4F4F5', fontSize: '11px', outline: 'none',
  fontFamily: 'inherit', width: '100%',
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('global');
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [aiProvider, setAiProvider] = useState('openai');
  const [aiOpenaiKey, setAiOpenaiKey] = useState('');
  const [aiAnthropicKey, setAiAnthropicKey] = useState('');
  const [aiDefaultMode, setAiDefaultMode] = useState('quick');
  const [aiSaveStatus, setAiSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});
  const [testMessage, setTestMessage] = useState<Record<string, string>>({});

  const { data: settingsResponse, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await getSettings();
      return data;
    },
  });

  const { data: aiConfigResponse } = useQuery({
    queryKey: ['aiConfig'],
    queryFn: async () => {
      const { data } = await getAiConfig();
      const cfg = data[1] as AiConfigStatus;
      setAiProvider(cfg.provider || 'openai');
      setAiDefaultMode(cfg.default_mode || 'quick');
      return cfg;
    },
  });

  const saveMutation = useMutation({
    mutationFn: (opts: Record<string, unknown>) => saveSettings(opts),
    onSuccess: () => {
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: () => setSaveStatus('error'),
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #00B4FF30', borderTopColor: '#00B4FF', animation: 'sf-spin 1.2s linear infinite' }} />
      </div>
    );
  }

  const settings = settingsResponse?.[1]?.data || {};
  const sections = new Set<string>();
  for (const key of Object.keys(settings)) {
    const section = key.split('.')[0] === 'global' ? 'global' : key.split('.')[1] || 'global';
    sections.add(section);
  }

  const sectionKeys = Object.keys(settings).filter((key) => {
    if (activeSection === 'global') return key.startsWith('global.');
    return key.startsWith(`module.${activeSection}.`);
  });

  const handleSave = () => {
    setSaveStatus('saving');
    saveMutation.mutate({ ...settings, ...editedValues });
  };

  const handleAiSave = async () => {
    setAiSaveStatus('saving');
    try {
      await saveAiConfig({
        provider: aiProvider,
        openai_key: aiOpenaiKey || undefined,
        anthropic_key: aiAnthropicKey || undefined,
        default_mode: aiDefaultMode,
      });
      setAiSaveStatus('saved');
      setAiOpenaiKey('');
      setAiAnthropicKey('');
      queryClient.invalidateQueries({ queryKey: ['aiConfig'] });
      setTimeout(() => setAiSaveStatus('idle'), 3000);
    } catch {
      setAiSaveStatus('error');
    }
  };

  const handleTestKey = async (provider: string) => {
    const key = provider === 'openai' ? aiOpenaiKey : aiAnthropicKey;
    if (!key) return;
    setTestStatus((s) => ({ ...s, [provider]: 'testing' }));
    setTestMessage((s) => ({ ...s, [provider]: '' }));
    try {
      const { data } = await testAiKey(provider, key);
      const ok = data[0] === 'SUCCESS';
      setTestStatus((s) => ({ ...s, [provider]: ok ? 'success' : 'error' }));
      setTestMessage((s) => ({ ...s, [provider]: data[1] }));
    } catch {
      setTestStatus((s) => ({ ...s, [provider]: 'error' }));
      setTestMessage((s) => ({ ...s, [provider]: 'Connection failed' }));
    }
    setTimeout(() => {
      setTestStatus((s) => ({ ...s, [provider]: 'idle' }));
      setTestMessage((s) => ({ ...s, [provider]: '' }));
    }, 5000);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '4px' }}>
            PLATFORM CONFIGURATION
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#F4F4F5', letterSpacing: '0.05em' }}>
            SETTINGS
          </h1>
        </div>
        {activeSection !== 'ai' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {saveStatus === 'saved' && <span style={{ fontSize: '10px', color: '#32D74B', letterSpacing: '0.08em' }}>✓ SAVED</span>}
            {saveStatus === 'error' && <span style={{ fontSize: '10px', color: '#FF3B30', letterSpacing: '0.08em' }}>⚠ ERROR</span>}
            <button
              onClick={handleSave}
              disabled={Object.keys(editedValues).length === 0 || saveStatus === 'saving'}
              style={{
                background: Object.keys(editedValues).length === 0 ? '#060A0F' : '#00B4FF',
                color: Object.keys(editedValues).length === 0 ? '#3F3F46' : '#000',
                border: `1px solid ${Object.keys(editedValues).length === 0 ? '#27272A' : '#00B4FF'}`,
                padding: '8px 16px', borderRadius: '2px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
                cursor: Object.keys(editedValues).length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {saveStatus === 'saving' ? 'SAVING...' : 'SAVE SETTINGS'}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Section nav */}
        <div style={{ width: '180px', flexShrink: 0 }}>
          <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden', position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
            {[
              { key: 'global', label: 'GLOBAL' },
              { key: 'ai', label: 'SPIDEY AI', icon: true },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  width: '100%', padding: '10px 12px', textAlign: 'left',
                  background: activeSection === s.key ? '#001828' : 'transparent',
                  color: activeSection === s.key ? '#00B4FF' : '#71717A',
                  borderLeft: activeSection === s.key ? '2px solid #00B4FF' : '2px solid transparent',
                  border: 'none', borderBottom: '1px solid #18181B',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
                  cursor: 'pointer',
                }}
              >
                {s.icon && <SpideyIcon size={12} />}
                {s.label}
              </button>
            ))}
            {Array.from(sections)
              .filter((s) => s !== 'global')
              .sort()
              .map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  style={{
                    display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
                    background: activeSection === section ? '#001828' : 'transparent',
                    color: activeSection === section ? '#00B4FF' : '#52525B',
                    borderLeft: activeSection === section ? '2px solid #00B4FF' : '2px solid transparent',
                    border: 'none', borderBottom: '1px solid #0D1117',
                    fontSize: '9px', letterSpacing: '0.08em', cursor: 'pointer',
                  }}
                >
                  {section}
                </button>
              ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {activeSection === 'ai' ? (
            <div style={{ background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <SpideyIcon size={20} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#F4F4F5', letterSpacing: '0.05em' }}>SPIDEY AI CONFIGURATION</div>
              </div>
              <p style={{ fontSize: '11px', color: '#71717A', lineHeight: 1.6, marginBottom: '20px' }}>
                Configure AI providers for intelligent scan analysis. API keys are encrypted before storage.
              </p>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#52525B', marginBottom: '6px' }}>DEFAULT PROVIDER</div>
                <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}
                  style={{ background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px', padding: '8px 12px', color: '#A1A1AA', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <option value="openai">OPENAI (GPT-4o)</option>
                  <option value="anthropic">ANTHROPIC (CLAUDE)</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#52525B', marginBottom: '6px' }}>DEFAULT ANALYSIS MODE</div>
                <select value={aiDefaultMode} onChange={(e) => setAiDefaultMode(e.target.value)}
                  style={{ background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px', padding: '8px 12px', color: '#A1A1AA', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <option value="quick">QUICK — single API call, fast and cost-effective</option>
                  <option value="deep">DEEP — per-category analysis, more thorough</option>
                </select>
              </div>

              <div style={{ height: '1px', background: '#18181B', margin: '20px 0' }} />

              {/* OpenAI Key */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#52525B', marginBottom: '6px' }}>OPENAI API KEY</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="password"
                    placeholder={aiConfigResponse?.openai_key_set ? '••••••••••• (configured)' : 'sk-...'}
                    value={aiOpenaiKey}
                    onChange={(e) => setAiOpenaiKey(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#00B4FF')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '#18181B')}
                  />
                  <button
                    onClick={() => handleTestKey('openai')}
                    disabled={!aiOpenaiKey || testStatus.openai === 'testing'}
                    style={{
                      background: 'none', color: '#00B4FF', border: '1px solid #00B4FF40',
                      padding: '8px 12px', borderRadius: '2px', fontSize: '10px', fontWeight: 700,
                      letterSpacing: '0.1em', cursor: !aiOpenaiKey ? 'not-allowed' : 'pointer',
                      opacity: !aiOpenaiKey ? 0.4 : 1, whiteSpace: 'nowrap',
                    }}
                  >
                    {testStatus.openai === 'testing' ? 'TESTING...' : 'TEST'}
                  </button>
                </div>
                {testMessage.openai && (
                  <div style={{ marginTop: '6px', fontSize: '10px', color: testStatus.openai === 'success' ? '#32D74B' : '#FF3B30' }}>
                    {testStatus.openai === 'success' ? '✓ ' : '⚠ '}{testMessage.openai}
                  </div>
                )}
                {aiConfigResponse?.openai_key_set && !aiOpenaiKey && (
                  <div style={{ marginTop: '6px', fontSize: '10px', color: '#32D74B' }}>✓ KEY CONFIGURED AND ENCRYPTED</div>
                )}
              </div>

              {/* Anthropic Key */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#52525B', marginBottom: '6px' }}>ANTHROPIC API KEY</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="password"
                    placeholder={aiConfigResponse?.anthropic_key_set ? '••••••••••• (configured)' : 'sk-ant-...'}
                    value={aiAnthropicKey}
                    onChange={(e) => setAiAnthropicKey(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#00B4FF')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '#18181B')}
                  />
                  <button
                    onClick={() => handleTestKey('anthropic')}
                    disabled={!aiAnthropicKey || testStatus.anthropic === 'testing'}
                    style={{
                      background: 'none', color: '#00B4FF', border: '1px solid #00B4FF40',
                      padding: '8px 12px', borderRadius: '2px', fontSize: '10px', fontWeight: 700,
                      letterSpacing: '0.1em', cursor: !aiAnthropicKey ? 'not-allowed' : 'pointer',
                      opacity: !aiAnthropicKey ? 0.4 : 1, whiteSpace: 'nowrap',
                    }}
                  >
                    {testStatus.anthropic === 'testing' ? 'TESTING...' : 'TEST'}
                  </button>
                </div>
                {testMessage.anthropic && (
                  <div style={{ marginTop: '6px', fontSize: '10px', color: testStatus.anthropic === 'success' ? '#32D74B' : '#FF3B30' }}>
                    {testStatus.anthropic === 'success' ? '✓ ' : '⚠ '}{testMessage.anthropic}
                  </div>
                )}
                {aiConfigResponse?.anthropic_key_set && !aiAnthropicKey && (
                  <div style={{ marginTop: '6px', fontSize: '10px', color: '#32D74B' }}>✓ KEY CONFIGURED AND ENCRYPTED</div>
                )}
              </div>

              <div style={{ height: '1px', background: '#18181B', marginBottom: '20px' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={handleAiSave}
                  disabled={aiSaveStatus === 'saving'}
                  style={{
                    background: '#00B4FF', color: '#000', border: 'none',
                    padding: '8px 20px', borderRadius: '2px',
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
                    cursor: aiSaveStatus === 'saving' ? 'not-allowed' : 'pointer',
                    opacity: aiSaveStatus === 'saving' ? 0.7 : 1,
                  }}
                >
                  {aiSaveStatus === 'saving' ? 'SAVING...' : 'SAVE AI SETTINGS'}
                </button>
                {aiSaveStatus === 'saved' && <span style={{ fontSize: '10px', color: '#32D74B', letterSpacing: '0.08em' }}>✓ SAVED</span>}
                {aiSaveStatus === 'error' && <span style={{ fontSize: '10px', color: '#FF3B30', letterSpacing: '0.08em' }}>⚠ FAILED TO SAVE</span>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sectionKeys.map((key) => {
                const value = editedValues[key] ?? settings[key];
                const isBoolean = typeof value === 'boolean';
                return (
                  <div key={key} style={{ background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.1em', color: '#52525B', marginBottom: '6px', fontFamily: 'monospace' }}>{key}</div>
                    {isBoolean ? (
                      <select
                        value={String(value)}
                        onChange={(e) => setEditedValues({ ...editedValues, [key]: e.target.value === 'true' })}
                        style={{ background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px', padding: '6px 10px', color: '#A1A1AA', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        <option value="true">TRUE</option>
                        <option value="false">FALSE</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={String(value ?? '')}
                        onChange={(e) => setEditedValues({ ...editedValues, [key]: e.target.value })}
                        style={{ ...inputStyle, borderColor: editedValues[key] !== undefined ? '#00B4FF40' : '#18181B' }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = '#00B4FF')}
                        onBlur={(e) => (e.currentTarget.style.borderColor = editedValues[key] !== undefined ? '#00B4FF40' : '#18181B')}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
