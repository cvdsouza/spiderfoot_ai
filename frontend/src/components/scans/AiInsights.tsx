import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getAiConfig, getAiAnalyses, triggerAiAnalysis, deleteAiAnalysis } from '../../api/ai';
import type { AiConfigStatus, AiAnalysisRecord, AiAnalysisCategory } from '../../types';
import AiChat from './AiChat';
import SpideyIcon from '../common/SpideyIcon';

interface AiInsightsProps {
  scanId: string;
  scanStatus: string;
}

const SEVERITY_COLORS: Record<string, { active: string; inactive: string }> = {
  HIGH: {
    active: 'bg-red-600 text-white dark:bg-red-700',
    inactive: 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60',
  },
  MEDIUM: {
    active: 'bg-orange-600 text-white dark:bg-orange-700',
    inactive: 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60',
  },
  LOW: {
    active: 'bg-yellow-600 text-white dark:bg-yellow-700',
    inactive: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:hover:bg-yellow-900/60',
  },
  INFO: {
    active: 'bg-blue-600 text-white dark:bg-blue-700',
    inactive: 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60',
  },
};

export default function AiInsights({ scanId, scanStatus }: AiInsightsProps) {
  const queryClient = useQueryClient();
  const [activeMode, setActiveMode] = useState<'analysis' | 'chat'>('analysis');
  const [provider, setProvider] = useState('');
  const [mode, setMode] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Check AI configuration
  const { data: aiConfig } = useQuery({
    queryKey: ['aiConfig'],
    queryFn: async () => {
      const { data } = await getAiConfig();
      return data[1] as AiConfigStatus;
    },
  });

  // Fetch analyses for this scan
  const { data: analyses = [] } = useQuery({
    queryKey: ['aiAnalyses', scanId],
    queryFn: async () => {
      const { data } = await getAiAnalyses(scanId);
      return data as AiAnalysisRecord[];
    },
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.some((a: AiAnalysisRecord) => a.status === 'running');
      return hasRunning ? 3000 : false;
    },
  });

  const isConfigured = aiConfig && (aiConfig.openai_key_set || aiConfig.anthropic_key_set);
  const isTerminal = ['FINISHED', 'ABORTED', 'ERROR-FAILED'].includes(scanStatus);

  const handleAnalyze = async () => {
    setTriggering(true);
    try {
      await triggerAiAnalysis(scanId, provider || undefined, mode || undefined);
      queryClient.invalidateQueries({ queryKey: ['aiAnalyses', scanId] });
    } finally {
      setTriggering(false);
    }
  };

  const handleDelete = async (analysisId: string) => {
    await deleteAiAnalysis(scanId, analysisId);
    queryClient.invalidateQueries({ queryKey: ['aiAnalyses', scanId] });
    if (selectedAnalysisId === analysisId) {
      setSelectedAnalysisId(null);
    }
  };

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Select the most recent completed analysis, or first running one
  const activeAnalysis = selectedAnalysisId
    ? analyses.find((a) => a.id === selectedAnalysisId)
    : analyses.find((a) => a.status === 'completed') || analyses[0];

  // ── No API key configured ──
  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--sf-border)] py-16">
        <div className="mb-4 text-[var(--sf-text-muted)]">
          <SpideyIcon size={48} />
        </div>
        <h3 className="mb-2 text-lg font-medium">Spidey Not Configured</h3>
        <p className="mb-4 max-w-md text-center text-sm text-[var(--sf-text-muted)]">
          Configure an AI provider (OpenAI or Anthropic) in Settings to enable
          intelligent analysis of your scan results.
        </p>
        <Link
          to="/settings"
          className="rounded-md bg-[var(--sf-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--sf-primary-hover)]"
        >
          Configure AI Provider
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* ── Sub-tab bar ── */}
      <div className="mb-4 flex border-b border-[var(--sf-border)]">
        <button
          onClick={() => setActiveMode('analysis')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeMode === 'analysis'
              ? 'border-b-2 border-[var(--sf-primary)] text-[var(--sf-primary)]'
              : 'text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]'
          }`}
        >
          <SpideyIcon size={14} className="mr-1 inline-block" />Analysis
        </button>
        <button
          onClick={() => setActiveMode('chat')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeMode === 'chat'
              ? 'border-b-2 border-[var(--sf-primary)] text-[var(--sf-primary)]'
              : 'text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]'
          }`}
        >
          <SpideyIcon size={14} className="mr-1 inline-block" />Ask Spidey
        </button>
      </div>

      {activeMode === 'chat' ? (
        <AiChat scanId={scanId} scanStatus={scanStatus} />
      ) : (
      <>
      {/* ── Analyze Controls ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--sf-border)] p-3">
        <select
          value={provider || aiConfig?.provider || 'openai'}
          onChange={(e) => setProvider(e.target.value)}
          className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 py-1.5 text-sm"
        >
          {aiConfig?.openai_key_set && <option value="openai">OpenAI (GPT-4o)</option>}
          {aiConfig?.anthropic_key_set && <option value="anthropic">Anthropic (Claude)</option>}
        </select>

        <select
          value={mode || aiConfig?.default_mode || 'quick'}
          onChange={(e) => setMode(e.target.value)}
          className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 py-1.5 text-sm"
        >
          <option value="quick">Quick Summary</option>
          <option value="deep">Deep Analysis</option>
        </select>

        <button
          onClick={handleAnalyze}
          disabled={triggering || !isTerminal}
          className="rounded-md bg-[var(--sf-primary)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--sf-primary-hover)] disabled:opacity-50"
        >
          {triggering ? 'Starting...' : 'Analyze'}
        </button>

        {!isTerminal && (
          <span className="text-xs text-[var(--sf-text-muted)]">
            Scan must be completed before analysis
          </span>
        )}

        {/* Previous analyses selector */}
        {analyses.length > 1 && (
          <select
            value={activeAnalysis?.id || ''}
            onChange={(e) => setSelectedAnalysisId(e.target.value)}
            className="ml-auto rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 py-1.5 text-xs"
          >
            {analyses.map((a, i) => (
              <option key={a.id} value={a.id}>
                {a.provider} / {a.mode} — {new Date(a.created).toLocaleString()}
                {i === 0 ? ' (latest)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Running indicator ── */}
      {activeAnalysis?.status === 'running' && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg-secondary)] p-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--sf-primary)] border-t-transparent" />
          <div>
            <p className="text-sm font-medium">Analysis in progress...</p>
            <p className="text-xs text-[var(--sf-text-muted)]">
              {activeAnalysis.mode === 'deep' ? 'Deep analysis may take 1-2 minutes' : 'Usually completes in 15-30 seconds'}
            </p>
          </div>
        </div>
      )}

      {/* ── Failed indicator ── */}
      {activeAnalysis?.status === 'failed' && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Analysis Failed</p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{activeAnalysis.error}</p>
          <button
            onClick={() => handleDelete(activeAnalysis.id)}
            className="mt-2 text-xs text-red-600 underline hover:text-red-800 dark:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── No analyses yet ── */}
      {analyses.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--sf-border)] py-12">
          <p className="text-sm text-[var(--sf-text-muted)]">
            No AI analyses yet. Click "Analyze" to get started.
          </p>
        </div>
      )}

      {/* ── Analysis Results ── */}
      {activeAnalysis?.status === 'completed' && activeAnalysis.result && (
        <div className="space-y-4">
          {/* Executive Summary */}
          <div className="rounded-lg border border-[var(--sf-border)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold">Executive Summary</h3>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                activeAnalysis.result.risk_assessment === 'HIGH'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : activeAnalysis.result.risk_assessment === 'MEDIUM'
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              }`}>
                {activeAnalysis.result.risk_assessment} RISK
              </span>
            </div>
            <p className="text-sm leading-relaxed">{activeAnalysis.result.executive_summary}</p>
          </div>

          {/* Target Profile */}
          {activeAnalysis.result.target_profile && (
            <div className="rounded-lg border border-[var(--sf-border)] p-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold">Target Profile</h3>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                  activeAnalysis.result.target_profile.exposure_level === 'HIGH'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    : activeAnalysis.result.target_profile.exposure_level === 'MEDIUM'
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                }`}>
                  {activeAnalysis.result.target_profile.exposure_level} EXPOSURE
                </span>
              </div>
              <p className="mb-2 text-sm">{activeAnalysis.result.target_profile.summary}</p>
              {activeAnalysis.result.target_profile.key_assets?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activeAnalysis.result.target_profile.key_assets.map((asset, i) => (
                    <span key={i} className="rounded bg-[var(--sf-bg-secondary)] px-2 py-0.5 font-mono text-xs">
                      {asset}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Severity Filter Pills */}
          {activeAnalysis.result.categories?.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {(['HIGH', 'MEDIUM', 'LOW', 'INFO'] as const).map((level) => {
                const count = activeAnalysis.result!.categories.filter(
                  (c: AiAnalysisCategory) => c.severity === level
                ).length;
                if (count === 0) return null;
                const isActive = severityFilter === level;
                const colors = SEVERITY_COLORS[level];
                return (
                  <button
                    key={level}
                    onClick={() => setSeverityFilter(isActive ? null : level)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isActive ? colors.active : colors.inactive
                    }`}
                  >
                    {count} {level}
                  </button>
                );
              })}
              {severityFilter && (
                <button
                  onClick={() => setSeverityFilter(null)}
                  className="text-xs text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}

          {/* Category Cards */}
          <div className="space-y-3">
            {activeAnalysis.result.categories
              ?.filter((cat: AiAnalysisCategory) => !severityFilter || cat.severity === severityFilter)
              .sort((a: AiAnalysisCategory, b: AiAnalysisCategory) => a.priority - b.priority)
              .map((category: AiAnalysisCategory) => {
                const isExpanded = expandedCategories.has(category.name);
                const colors = SEVERITY_COLORS[category.severity] || SEVERITY_COLORS.INFO;

                return (
                  <div key={category.name} className="overflow-hidden rounded-lg border border-[var(--sf-border)]">
                    {/* Category Header */}
                    <div
                      onClick={() => toggleCategory(category.name)}
                      className="flex cursor-pointer items-center gap-2 p-4 transition-colors hover:bg-[var(--sf-bg-secondary)]"
                    >
                      <svg
                        className={`h-4 w-4 shrink-0 text-[var(--sf-text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${colors.inactive}`}>
                        {category.severity}
                      </span>
                      <span className="font-medium">{category.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-[var(--sf-text-muted)]">
                        P{category.priority} — {category.findings?.length || 0} findings
                      </span>
                    </div>

                    {/* Expanded Findings */}
                    {isExpanded && (
                      <div className="border-t border-[var(--sf-border)] bg-[var(--sf-bg-secondary)]">
                        {category.findings?.map((finding, idx) => (
                          <div key={idx} className="border-b border-[var(--sf-border)] p-4 last:border-b-0">
                            <h4 className="mb-1 text-sm font-medium">{finding.title}</h4>
                            <p className="mb-2 text-sm text-[var(--sf-text-muted)]">{finding.description}</p>

                            {finding.relevance && (
                              <div className="mb-2">
                                <span className="text-xs font-medium text-[var(--sf-text-muted)]">Relevance: </span>
                                <span className="text-xs">{finding.relevance}</span>
                              </div>
                            )}

                            {finding.recommendation && (
                              <div className="mb-2 rounded bg-blue-50 p-2 dark:bg-blue-900/20">
                                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Recommendation: </span>
                                <span className="text-xs text-blue-600 dark:text-blue-300">{finding.recommendation}</span>
                              </div>
                            )}

                            {finding.related_events?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {finding.related_events.map((evt, i) => (
                                  <span key={i} className="rounded bg-[var(--sf-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--sf-text-muted)]">
                                    {evt}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Analysis Metadata */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg-secondary)] px-4 py-3 text-xs text-[var(--sf-text-muted)]">
            <span>Provider: <span className="font-medium text-[var(--sf-text)]">{activeAnalysis.provider}</span></span>
            <span>Model: <span className="font-medium text-[var(--sf-text)]">{activeAnalysis.model}</span></span>
            <span>Mode: <span className="font-medium text-[var(--sf-text)]">{activeAnalysis.mode}</span></span>
            <span>Tokens: <span className="font-medium text-[var(--sf-text)]">{activeAnalysis.token_usage?.toLocaleString()}</span></span>
            <span>Analyzed: <span className="font-medium text-[var(--sf-text)]">{new Date(activeAnalysis.created).toLocaleString()}</span></span>
            <button
              onClick={() => handleDelete(activeAnalysis.id)}
              className="ml-auto text-xs text-red-500 hover:text-red-700"
            >
              Delete this analysis
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
