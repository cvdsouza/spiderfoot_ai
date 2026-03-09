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

const RISK_COLORS: Record<string, { label: string; bg: string; border: string }> = {
  HIGH:   { label: '#FF3B30', bg: '#280A08', border: '#FF3B30' },
  MEDIUM: { label: '#FF9F0A', bg: '#271500', border: '#FF9F0A' },
  LOW:    { label: '#FFD60A', bg: '#1F1B00', border: '#FFD60A' },
  INFO:   { label: '#00B4FF', bg: '#001828', border: '#00B4FF' },
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

  const { data: aiConfig } = useQuery({
    queryKey: ['aiConfig'],
    queryFn: async () => {
      const { data } = await getAiConfig();
      return data[1] as AiConfigStatus;
    },
  });

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
    if (selectedAnalysisId === analysisId) setSelectedAnalysisId(null);
  };

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const activeAnalysis = selectedAnalysisId
    ? analyses.find((a) => a.id === selectedAnalysisId)
    : analyses.find((a) => a.status === 'completed') || analyses[0];

  if (!isConfigured) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: '1px solid #18181B', borderRadius: '2px', padding: '64px 0',
      }}>
        <div style={{ color: '#00B4FF', marginBottom: '16px', opacity: 0.4 }}>
          <SpideyIcon size={48} />
        </div>
        <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '8px' }}>
          AI ENGINE NOT CONFIGURED
        </div>
        <p style={{ maxWidth: '360px', textAlign: 'center', fontSize: '11px', color: '#71717A', marginBottom: '16px', lineHeight: 1.6 }}>
          Configure an AI provider (OpenAI or Anthropic) in Settings to enable intelligent analysis of scan results.
        </p>
        <Link
          to="/settings"
          style={{
            background: '#00B4FF', color: '#000', padding: '8px 16px',
            borderRadius: '2px', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.12em', textDecoration: 'none',
          }}
        >
          CONFIGURE AI PROVIDER
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #18181B', marginBottom: '16px' }}>
        {(['analysis', 'chat'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setActiveMode(m)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none',
              borderBottom: activeMode === m ? '2px solid #00B4FF' : '2px solid transparent',
              color: activeMode === m ? '#00B4FF' : '#52525B',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              marginBottom: '-1px',
            }}
          >
            <SpideyIcon size={12} />
            {m === 'analysis' ? 'ANALYSIS' : 'ASK SPIDEY'}
          </button>
        ))}
      </div>

      {activeMode === 'chat' ? (
        <AiChat scanId={scanId} scanStatus={scanStatus} />
      ) : (
        <>
          {/* Controls */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px',
            background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px',
            padding: '12px 16px', marginBottom: '16px',
          }}>
            <select
              value={provider || aiConfig?.provider || 'openai'}
              onChange={(e) => setProvider(e.target.value)}
              style={{ background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px', padding: '6px 10px', color: '#A1A1AA', fontSize: '10px', cursor: 'pointer' }}
            >
              {aiConfig?.openai_key_set && <option value="openai">OPENAI (GPT-4o)</option>}
              {aiConfig?.anthropic_key_set && <option value="anthropic">ANTHROPIC (CLAUDE)</option>}
            </select>

            <select
              value={mode || aiConfig?.default_mode || 'quick'}
              onChange={(e) => setMode(e.target.value)}
              style={{ background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px', padding: '6px 10px', color: '#A1A1AA', fontSize: '10px', cursor: 'pointer' }}
            >
              <option value="quick">QUICK SUMMARY</option>
              <option value="deep">DEEP ANALYSIS</option>
            </select>

            <button
              onClick={handleAnalyze}
              disabled={triggering || !isTerminal}
              style={{
                background: triggering || !isTerminal ? '#060A0F' : '#00B4FF',
                color: triggering || !isTerminal ? '#3F3F46' : '#000',
                border: `1px solid ${triggering || !isTerminal ? '#27272A' : '#00B4FF'}`,
                padding: '6px 16px', borderRadius: '2px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
                cursor: triggering || !isTerminal ? 'not-allowed' : 'pointer',
              }}
            >
              {triggering ? '◈ ANALYZING...' : '◈ ANALYZE'}
            </button>

            {!isTerminal && (
              <span style={{ fontSize: '10px', color: '#52525B', letterSpacing: '0.05em' }}>
                SCAN MUST COMPLETE BEFORE ANALYSIS
              </span>
            )}

            {analyses.length > 1 && (
              <select
                value={activeAnalysis?.id || ''}
                onChange={(e) => setSelectedAnalysisId(e.target.value)}
                style={{ marginLeft: 'auto', background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px', padding: '5px 8px', color: '#A1A1AA', fontSize: '10px', cursor: 'pointer' }}
              >
                {analyses.map((a, i) => (
                  <option key={a.id} value={a.id}>
                    {a.provider} / {a.mode} — {new Date(a.created).toLocaleString()}{i === 0 ? ' (latest)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Running */}
          {activeAnalysis?.status === 'running' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: '#001828', border: '1px solid #00B4FF30', borderRadius: '2px',
              padding: '16px', marginBottom: '16px',
            }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #00B4FF30', borderTopColor: '#00B4FF', animation: 'sf-spin 1.2s linear infinite', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '11px', color: '#00B4FF', fontWeight: 600, letterSpacing: '0.05em' }}>ANALYSIS IN PROGRESS</div>
                <div style={{ fontSize: '10px', color: '#52525B', marginTop: '2px' }}>
                  {activeAnalysis.mode === 'deep' ? 'Deep analysis — 1-2 minutes' : 'Quick summary — 15-30 seconds'}
                </div>
              </div>
            </div>
          )}

          {/* Failed */}
          {activeAnalysis?.status === 'failed' && (
            <div style={{
              background: '#280A08', border: '1px solid #FF3B3030', borderRadius: '2px',
              borderLeft: '3px solid #FF3B30', padding: '16px', marginBottom: '16px',
            }}>
              <div style={{ fontSize: '11px', color: '#FF3B30', fontWeight: 600, letterSpacing: '0.05em' }}>ANALYSIS FAILED</div>
              <div style={{ fontSize: '10px', color: '#71717A', marginTop: '4px' }}>{activeAnalysis.error}</div>
              <button
                onClick={() => handleDelete(activeAnalysis.id)}
                style={{ marginTop: '8px', background: 'none', border: 'none', color: '#FF3B30', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline', letterSpacing: '0.05em' }}
              >
                DISMISS
              </button>
            </div>
          )}

          {/* Empty */}
          {analyses.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', border: '1px solid #18181B', borderRadius: '2px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#3F3F46' }}>
                NO ANALYSES YET — CLICK ANALYZE TO BEGIN
              </div>
            </div>
          )}

          {/* Results */}
          {activeAnalysis?.status === 'completed' && activeAnalysis.result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Executive Summary */}
              <div style={{ background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B' }}>EXECUTIVE SUMMARY</div>
                  {(() => {
                    const r = activeAnalysis.result!.risk_assessment;
                    const c = RISK_COLORS[r] || RISK_COLORS.INFO;
                    return (
                      <span style={{ background: c.bg, color: c.label, border: `1px solid ${c.border}50`, borderRadius: '2px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em' }}>
                        {r} RISK
                      </span>
                    );
                  })()}
                </div>
                <p style={{ fontSize: '12px', color: '#A1A1AA', lineHeight: 1.7 }}>
                  {activeAnalysis.result.executive_summary}
                </p>
              </div>

              {/* Target Profile */}
              {activeAnalysis.result.target_profile && (
                <div style={{ background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B' }}>TARGET PROFILE</div>
                    {(() => {
                      const exp = activeAnalysis.result!.target_profile.exposure_level;
                      const c = RISK_COLORS[exp] || RISK_COLORS.INFO;
                      return (
                        <span style={{ background: c.bg, color: c.label, border: `1px solid ${c.border}50`, borderRadius: '2px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em' }}>
                          {exp} EXPOSURE
                        </span>
                      );
                    })()}
                  </div>
                  <p style={{ fontSize: '12px', color: '#A1A1AA', lineHeight: 1.6, marginBottom: '10px' }}>
                    {activeAnalysis.result.target_profile.summary}
                  </p>
                  {activeAnalysis.result.target_profile.key_assets?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {activeAnalysis.result.target_profile.key_assets.map((asset: string, i: number) => (
                        <span key={i} style={{ background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px', padding: '2px 8px', fontFamily: 'monospace', fontSize: '10px', color: '#A1A1AA' }}>
                          {asset}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Severity filter */}
              {activeAnalysis.result.categories?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                  {(['HIGH', 'MEDIUM', 'LOW', 'INFO'] as const).map((level) => {
                    const count = activeAnalysis.result!.categories.filter(
                      (c: AiAnalysisCategory) => c.severity === level
                    ).length;
                    if (count === 0) return null;
                    const isActive = severityFilter === level;
                    const c = RISK_COLORS[level];
                    return (
                      <button
                        key={level}
                        onClick={() => setSeverityFilter(isActive ? null : level)}
                        style={{
                          background: isActive ? c.label : c.bg,
                          color: isActive ? '#000' : c.label,
                          border: `1px solid ${c.border}50`,
                          padding: '4px 12px', borderRadius: '2px',
                          fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
                        }}
                      >
                        {count} {level}
                      </button>
                    );
                  })}
                  {severityFilter && (
                    <button onClick={() => setSeverityFilter(null)} style={{ background: 'none', border: 'none', color: '#52525B', fontSize: '10px', letterSpacing: '0.1em', cursor: 'pointer' }}>
                      CLEAR
                    </button>
                  )}
                </div>
              )}

              {/* Category cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {activeAnalysis.result.categories
                  ?.filter((cat: AiAnalysisCategory) => !severityFilter || cat.severity === severityFilter)
                  .sort((a: AiAnalysisCategory, b: AiAnalysisCategory) => a.priority - b.priority)
                  .map((category: AiAnalysisCategory) => {
                    const isExpanded = expandedCategories.has(category.name);
                    const c = RISK_COLORS[category.severity] || RISK_COLORS.INFO;
                    return (
                      <div key={category.name} style={{ borderLeft: `3px solid ${c.border}`, background: '#0A0E14', border: '1px solid #18181B', borderLeftWidth: '3px', borderLeftColor: c.border }}>
                        <div
                          onClick={() => toggleCategory(category.name)}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', cursor: 'pointer' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ color: '#52525B', fontSize: '10px', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
                          <span style={{ background: c.bg, color: c.label, border: `1px solid ${c.border}50`, borderRadius: '2px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0 }}>
                            {category.severity}
                          </span>
                          <span style={{ fontSize: '12px', color: '#F4F4F5', fontWeight: 500, flex: 1 }}>{category.name}</span>
                          <span style={{ fontSize: '9px', color: '#52525B', flexShrink: 0, letterSpacing: '0.05em' }}>
                            P{category.priority} — {category.findings?.length || 0} FINDINGS
                          </span>
                        </div>

                        {isExpanded && (
                          <div style={{ borderTop: '1px solid #18181B', background: '#060A0F' }}>
                            {category.findings?.map((finding: { title: string; description: string; relevance?: string; recommendation?: string; related_events?: string[] }, idx: number) => (
                              <div key={idx} style={{ borderBottom: '1px solid #0D1117', padding: '14px 16px' }}>
                                <div style={{ fontSize: '12px', color: '#F4F4F5', fontWeight: 600, marginBottom: '6px' }}>{finding.title}</div>
                                <p style={{ fontSize: '11px', color: '#71717A', lineHeight: 1.6, marginBottom: '8px' }}>{finding.description}</p>

                                {finding.relevance && (
                                  <div style={{ marginBottom: '6px', fontSize: '10px', color: '#52525B' }}>
                                    <span style={{ letterSpacing: '0.1em', color: '#3F3F46' }}>RELEVANCE: </span>
                                    <span style={{ color: '#71717A' }}>{finding.relevance}</span>
                                  </div>
                                )}

                                {finding.recommendation && (
                                  <div style={{ background: '#001828', border: '1px solid #00B4FF20', borderRadius: '2px', padding: '8px 10px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '9px', color: '#00B4FF', letterSpacing: '0.1em', fontWeight: 700 }}>RECOMMENDATION: </span>
                                    <span style={{ fontSize: '11px', color: '#71717A' }}>{finding.recommendation}</span>
                                  </div>
                                )}

                                {(finding.related_events?.length ?? 0) > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {(finding.related_events ?? []).map((evt: string, i: number) => (
                                      <span key={i} style={{ background: '#0A0E14', border: '1px solid #18181B', borderRadius: '2px', padding: '1px 6px', fontFamily: 'monospace', fontSize: '9px', color: '#52525B' }}>
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

              {/* Metadata */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px', padding: '10px 16px' }}>
                {[
                  ['PROVIDER', activeAnalysis.provider],
                  ['MODEL', activeAnalysis.model],
                  ['MODE', activeAnalysis.mode],
                  ['TOKENS', activeAnalysis.token_usage?.toLocaleString()],
                  ['ANALYZED', new Date(activeAnalysis.created).toLocaleString()],
                ].map(([label, value]) => (
                  <span key={label} style={{ fontSize: '9px', color: '#3F3F46', letterSpacing: '0.1em' }}>
                    {label}: <span style={{ color: '#71717A' }}>{value}</span>
                  </span>
                ))}
                <button
                  onClick={() => handleDelete(activeAnalysis.id)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#FF3B3060', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.05em' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#FF3B30')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#FF3B3060')}
                >
                  DELETE ANALYSIS
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
