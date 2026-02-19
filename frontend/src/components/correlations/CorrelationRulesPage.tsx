import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCorrelationRules, toggleCorrelationRule, deleteCorrelationRule } from '../../api/correlationRules';
import type { CorrelationRule } from '../../types';
import RuleEditor from './RuleEditor';

type SourceFilter = 'all' | 'builtin' | 'user';
type RiskFilter = 'all' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export default function CorrelationRulesPage() {
  const queryClient = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['correlationRules'] }),
  });

  const filteredRules = rules.filter((r) => {
    if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
    if (riskFilter !== 'all' && r.risk !== riskFilter) return false;
    return true;
  });

  const builtinCount = rules.filter((r) => r.source === 'builtin').length;
  const userCount = rules.filter((r) => r.source === 'user').length;

  const riskColorClass = (risk: string) => {
    switch (risk) {
      case 'HIGH': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
      case 'MEDIUM': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200';
      case 'LOW': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200';
      default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200';
    }
  };

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
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Correlation Rules</h1>
          <p className="mt-1 text-sm text-[var(--sf-text-muted)]">
            {rules.length} rules ({builtinCount} built-in, {userCount} user-defined)
          </p>
        </div>
        <button
          onClick={() => setEditorState({ open: true, mode: 'create' })}
          className="rounded-md bg-[var(--sf-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + New Rule
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {(['all', 'builtin', 'user'] as SourceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                sourceFilter === f
                  ? 'bg-[var(--sf-primary)] text-white'
                  : 'bg-[var(--sf-bg-secondary)] text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'builtin' ? 'Built-in' : 'User'}
            </button>
          ))}
        </div>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
          className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-1.5 text-xs"
        >
          <option value="all">All risks</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
          <option value="INFO">INFO</option>
        </select>
      </div>

      {/* Rules list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
        </div>
      ) : filteredRules.length === 0 ? (
        <p className="py-8 text-center text-[var(--sf-text-muted)]">
          {rules.length === 0 ? 'No correlation rules found.' : 'No rules match the current filters.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredRules.map((rule) => (
            <div
              key={rule.rule_id}
              className="flex items-center gap-3 rounded-lg border border-[var(--sf-border)] p-3 transition-colors hover:bg-[var(--sf-bg-secondary)]"
            >
              {/* Risk badge */}
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${riskColorClass(rule.risk)}`}>
                {rule.risk}
              </span>

              {/* Name + description (clickable) */}
              <div
                className="min-w-0 flex-1 cursor-pointer"
                onClick={() => setEditorState({
                  open: true,
                  mode: rule.source === 'user' ? 'edit' : 'view',
                  ruleId: rule.rule_id,
                })}
              >
                <div className="truncate font-medium">{rule.name}</div>
                {rule.description && (
                  <div className="mt-0.5 truncate text-xs text-[var(--sf-text-muted)]">{rule.description}</div>
                )}
              </div>

              {/* Source badge */}
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                rule.source === 'user'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}>
                {rule.source}
              </span>

              {/* Actions for user rules */}
              {rule.source === 'user' && (
                <div className="flex shrink-0 items-center gap-2">
                  {/* Enable/disable toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMutation.mutate(rule.rule_id);
                    }}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      rule.enabled ? 'bg-[var(--sf-primary)]' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      rule.enabled ? 'left-[18px]' : 'left-0.5'
                    }`} />
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete rule "${rule.name}"?`)) {
                        deleteMutation.mutate(rule.rule_id);
                      }
                    }}
                    className="rounded p-1 text-[var(--sf-text-muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
                    title="Delete rule"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
