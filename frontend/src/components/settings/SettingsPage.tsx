import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, saveSettings } from '../../api/settings';
import { getAiConfig, saveAiConfig, testAiKey } from '../../api/ai';
import type { AiConfigStatus } from '../../types';
import SpideyIcon from '../common/SpideyIcon';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('global');
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // AI-specific state
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
    onError: () => {
      setSaveStatus('error');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
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
      if (data[0] === 'SUCCESS') {
        setTestStatus((s) => ({ ...s, [provider]: 'success' }));
        setTestMessage((s) => ({ ...s, [provider]: data[1] }));
      } else {
        setTestStatus((s) => ({ ...s, [provider]: 'error' }));
        setTestMessage((s) => ({ ...s, [provider]: data[1] }));
      }
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        {activeSection !== 'ai' && (
          <div className="flex items-center gap-3">
            {saveStatus === 'saved' && (
              <span className="text-sm text-green-600">Settings saved!</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-sm text-red-600">Failed to save</span>
            )}
            <button
              onClick={handleSave}
              disabled={Object.keys(editedValues).length === 0}
              className="rounded-md bg-[var(--sf-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--sf-primary-hover)] disabled:opacity-50"
            >
              Save Settings
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0">
          <div className="sticky top-20 max-h-[calc(100vh-120px)] overflow-y-auto rounded-lg border border-[var(--sf-border)]">
            <button
              onClick={() => setActiveSection('global')}
              className={`w-full px-3 py-2 text-left text-sm ${
                activeSection === 'global' ? 'bg-[var(--sf-primary)] text-white' : 'hover:bg-[var(--sf-bg-secondary)]'
              }`}
            >
              Global
            </button>
            <button
              onClick={() => setActiveSection('ai')}
              className={`w-full border-b border-[var(--sf-border)] px-3 py-2 text-left text-sm font-medium ${
                activeSection === 'ai' ? 'bg-[var(--sf-primary)] text-white' : 'hover:bg-[var(--sf-bg-secondary)]'
              }`}
            >
              <SpideyIcon size={14} className="mr-1 inline-block" /> Spidey
            </button>
            {Array.from(sections)
              .filter((s) => s !== 'global')
              .sort()
              .map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`w-full px-3 py-2 text-left text-xs ${
                    activeSection === section ? 'bg-[var(--sf-primary)] text-white' : 'hover:bg-[var(--sf-bg-secondary)]'
                  }`}
                >
                  {section}
                </button>
              ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeSection === 'ai' ? (
            /* ── AI Configuration Form ── */
            <div className="space-y-6">
              <div className="rounded-lg border border-[var(--sf-border)] p-5">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <SpideyIcon size={22} /> Spidey Configuration
                </h2>
                <p className="mb-5 text-sm text-[var(--sf-text-muted)]">
                  Configure AI providers to power Spidey, your intelligent scan analysis assistant.
                  API keys are encrypted before storage.
                </p>

                {/* Default Provider */}
                <div className="mb-5">
                  <label className="mb-1.5 block text-sm font-medium">Default Provider</label>
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-2 text-sm"
                  >
                    <option value="openai">OpenAI (GPT-4o)</option>
                    <option value="anthropic">Anthropic (Claude Sonnet)</option>
                  </select>
                </div>

                {/* Default Mode */}
                <div className="mb-5">
                  <label className="mb-1.5 block text-sm font-medium">Default Analysis Mode</label>
                  <select
                    value={aiDefaultMode}
                    onChange={(e) => setAiDefaultMode(e.target.value)}
                    className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-2 text-sm"
                  >
                    <option value="quick">Quick Summary — single API call, fast and cost-effective</option>
                    <option value="deep">Deep Analysis — per-category analysis, more thorough</option>
                  </select>
                </div>

                <hr className="my-5 border-[var(--sf-border)]" />

                {/* OpenAI Key */}
                <div className="mb-5">
                  <label className="mb-1.5 block text-sm font-medium">OpenAI API Key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder={aiConfigResponse?.openai_key_set ? '••••••••••• (key configured)' : 'sk-...'}
                      value={aiOpenaiKey}
                      onChange={(e) => setAiOpenaiKey(e.target.value)}
                      className="flex-1 rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => handleTestKey('openai')}
                      disabled={!aiOpenaiKey || testStatus.openai === 'testing'}
                      className="whitespace-nowrap rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-2 text-xs font-medium hover:bg-[var(--sf-bg-secondary)] disabled:opacity-50"
                    >
                      {testStatus.openai === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                  {testMessage.openai && (
                    <p className={`mt-1.5 text-xs ${testStatus.openai === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                      {testMessage.openai}
                    </p>
                  )}
                  {aiConfigResponse?.openai_key_set && !aiOpenaiKey && (
                    <p className="mt-1.5 text-xs text-green-600">Key is configured and encrypted</p>
                  )}
                </div>

                {/* Anthropic Key */}
                <div className="mb-5">
                  <label className="mb-1.5 block text-sm font-medium">Anthropic API Key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder={aiConfigResponse?.anthropic_key_set ? '••••••••••• (key configured)' : 'sk-ant-...'}
                      value={aiAnthropicKey}
                      onChange={(e) => setAiAnthropicKey(e.target.value)}
                      className="flex-1 rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => handleTestKey('anthropic')}
                      disabled={!aiAnthropicKey || testStatus.anthropic === 'testing'}
                      className="whitespace-nowrap rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-2 text-xs font-medium hover:bg-[var(--sf-bg-secondary)] disabled:opacity-50"
                    >
                      {testStatus.anthropic === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                  {testMessage.anthropic && (
                    <p className={`mt-1.5 text-xs ${testStatus.anthropic === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                      {testMessage.anthropic}
                    </p>
                  )}
                  {aiConfigResponse?.anthropic_key_set && !aiAnthropicKey && (
                    <p className="mt-1.5 text-xs text-green-600">Key is configured and encrypted</p>
                  )}
                </div>

                <hr className="my-5 border-[var(--sf-border)]" />

                {/* Save */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAiSave}
                    disabled={aiSaveStatus === 'saving'}
                    className="rounded-md bg-[var(--sf-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--sf-primary-hover)] disabled:opacity-50"
                  >
                    {aiSaveStatus === 'saving' ? 'Saving...' : 'Save AI Settings'}
                  </button>
                  {aiSaveStatus === 'saved' && (
                    <span className="text-sm text-green-600">AI settings saved!</span>
                  )}
                  {aiSaveStatus === 'error' && (
                    <span className="text-sm text-red-600">Failed to save</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── Standard Settings Form ── */
            <div className="space-y-4">
              {sectionKeys.map((key) => {
                const value = editedValues[key] ?? settings[key];
                const isBoolean = typeof value === 'boolean';

                return (
                  <div key={key} className="rounded-lg border border-[var(--sf-border)] p-4">
                    <label className="mb-1 block text-sm font-medium font-mono">{key}</label>
                    {isBoolean ? (
                      <select
                        value={String(value)}
                        onChange={(e) => setEditedValues({ ...editedValues, [key]: e.target.value === 'true' })}
                        className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-1.5 text-sm"
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={String(value ?? '')}
                        onChange={(e) => setEditedValues({ ...editedValues, [key]: e.target.value })}
                        className="w-full rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-1.5 text-sm"
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
