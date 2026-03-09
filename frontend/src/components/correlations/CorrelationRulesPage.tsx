import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCorrelationRules, toggleCorrelationRule, deleteCorrelationRule } from '../../api/correlationRules';
import type { CorrelationRule } from '../../types';
import RuleEditor from './RuleEditor';

type SourceFilter = 'all' | 'builtin' | 'user';
type RiskFilter = 'all' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

const RISK_COLORS: Record<string, { label: string; bg: string; border: string }> = {
  HIGH:   { label: '#FF3B30', bg: '#280A08', border: '#FF3B30' },
  MEDIUM: { label: '#FF9F0A', bg: '#271500', border: '#FF9F0A' },
  LOW:    { label: '#FFD60A', bg: '#1F1B00', border: '#FFD60A' },
  INFO:   { label: '#00B4FF', bg: '#001828', border: '#00B4FF' },
};

const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'ALL', builtin: 'BUILT-IN', user: 'USER',
};

const RISK_FILTER_LABELS: RiskFilter[] = ['all', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export default function CorrelationRulesPage() {
  const queryClient = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<{
    open: boolean;
    mode: 'view' | 'create' | 'edit';
    ruleId?: string;
  }>({ open: false, mode: 'view' });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['correlationRules'],
    queryFn: async () => {
      const { data } = await getCorrelationRules();
      return data as CorrelationRule[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (ruleId: string) => toggleCorrelationRule(ruleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['correlationRules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deleteCorrelationRule(ruleId),
    onSuccess: () => {
      setDeletePendingId(null);
      queryClient.invalidateQueries({ queryKey: ['correlationRules'] });
    },
  });

  const filteredRules = rules.filter((r) => {
    if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
    if (riskFilter !== 'all' && r.risk !== riskFilter) return false;
    return true;
  });

  const builtinCount = rules.filter((r) => r.source === 'builtin').length;
  const userCount = rules.filter((r) => r.source === 'user').length;

  if (editorState.open) {
    return (
      <RuleEditor
        ruleId={editorState.ruleId}
        mode={editorState.mode}
        onClose={() => {
          setEditorState({ open: false, mode: 'view' });
          queryClient.invalidateQueries({ queryKey: ['correlationRules'] });
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: '1000px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52525B', marginBottom: '4px' }}>
            THREAT INTELLIGENCE
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#F4F4F5', letterSpacing: '0.05em' }}>
            CORRELATION RULES
          </h1>
          <p style={{ marginTop: '4px', fontSize: '10px', color: '#52525B', letterSpacing: '0.05em' }}>
            {rules.length} RULES — {builtinCount} BUILT-IN / {userCount} USER-DEFINED
          </p>
        </div>
        <button
          onClick={() => setEditorState({ open: true, mode: 'create' })}
          style={{
            background: '#00B4FF', color: '#000', padding: '8px 16px',
            borderRadius: '2px', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.12em', border: 'none', cursor: 'pointer',
          }}
        >
          + NEW RULE
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        {/* Source filter */}
        <div style={{ display: 'flex', gap: '2px', background: '#060A0F', padding: '3px', border: '1px solid #18181B', borderRadius: '2px' }}>
          {(['all', 'builtin', 'user'] as SourceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              style={{
                padding: '5px 12px', background: sourceFilter === f ? '#00B4FF' : 'transparent',
                color: sourceFilter === f ? '#000' : '#52525B', border: 'none', borderRadius: '2px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
              }}
            >
              {SOURCE_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Risk filter */}
        <div style={{ display: 'flex', gap: '2px', background: '#060A0F', padding: '3px', border: '1px solid #18181B', borderRadius: '2px' }}>
          {RISK_FILTER_LABELS.map((f) => {
            const c = f !== 'all' ? RISK_COLORS[f] : null;
            return (
              <button
                key={f}
                onClick={() => setRiskFilter(f)}
                style={{
                  padding: '5px 10px',
                  background: riskFilter === f ? (c ? c.label : '#00B4FF') : 'transparent',
                  color: riskFilter === f ? '#000' : (c ? c.label : '#52525B'),
                  border: 'none', borderRadius: '2px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
                }}
              >
                {f === 'all' ? 'ALL RISK' : f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rules list */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #00B4FF30', borderTopColor: '#00B4FF', animation: 'sf-spin 1.2s linear infinite' }} />
        </div>
      ) : filteredRules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', fontSize: '9px', letterSpacing: '0.2em', color: '#3F3F46' }}>
          {rules.length === 0 ? 'NO CORRELATION RULES FOUND' : 'NO RULES MATCH CURRENT FILTERS'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filteredRules.map((rule) => {
            const c = RISK_COLORS[rule.risk] || RISK_COLORS.INFO;
            return (
              <div
                key={rule.rule_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', background: '#0A0E14',
                  border: '1px solid #18181B',
                  borderLeft: `3px solid ${rule.enabled !== false ? c.border : '#27272A'}`,
                  opacity: rule.enabled === false ? 0.5 : 1,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#0A0E14')}
              >
                {/* Risk badge */}
                <span style={{
                  background: c.bg, color: c.label, border: `1px solid ${c.border}40`,
                  borderRadius: '2px', padding: '2px 7px', fontSize: '9px',
                  fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0,
                }}>
                  {rule.risk}
                </span>

                {/* Name + description */}
                <div
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => setEditorState({
                    open: true,
                    mode: rule.source === 'user' ? 'edit' : 'view',
                    ruleId: rule.rule_id,
                  })}
                >
                  <div style={{ fontSize: '12px', color: '#F4F4F5', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rule.name}
                  </div>
                  {rule.description && (
                    <div style={{ fontSize: '10px', color: '#52525B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                      {rule.description}
                    </div>
                  )}
                </div>

                {/* Source badge */}
                <span style={{
                  flexShrink: 0, borderRadius: '2px', padding: '2px 7px', fontSize: '9px',
                  fontWeight: 700, letterSpacing: '0.08em',
                  ...(rule.source === 'user'
                    ? { background: '#001A08', color: '#32D74B', border: '1px solid #32D74B40' }
                    : { background: '#0D1117', color: '#52525B', border: '1px solid #27272A' }),
                }}>
                  {rule.source.toUpperCase()}
                </span>

                {/* Toggle + delete for user rules */}
                {rule.source === 'user' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {/* Toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(rule.rule_id); }}
                      title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                      style={{
                        position: 'relative', width: '32px', height: '18px', borderRadius: '9px',
                        background: rule.enabled ? '#00B4FF' : '#27272A',
                        border: 'none', cursor: 'pointer', transition: 'background 0.15s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '2px', left: rule.enabled ? '16px' : '2px',
                        width: '14px', height: '14px', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.15s',
                      }} />
                    </button>

                    {/* Delete */}
                    {deletePendingId === rule.rule_id ? (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(rule.rule_id); }}
                          style={{ background: '#280A08', color: '#FF3B30', border: '1px solid #FF3B3040', padding: '3px 8px', borderRadius: '2px', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          DEL
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletePendingId(null); }}
                          style={{ background: 'none', color: '#52525B', border: '1px solid #27272A', padding: '3px 6px', borderRadius: '2px', fontSize: '9px', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletePendingId(rule.rule_id); }}
                        title="Delete rule"
                        style={{
                          background: 'none', color: '#52525B', border: '1px solid #27272A',
                          width: '24px', height: '24px', borderRadius: '2px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', fontSize: '12px',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#FF3B30'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#FF3B3040'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#52525B'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#27272A'; }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
