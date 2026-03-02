import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCorrelationRule,
  createCorrelationRule,
  updateCorrelationRule,
  validateCorrelationRule,
} from '../../api/correlationRules';
import AiRuleAssistant from './AiRuleAssistant';
import SpideyIcon from '../common/SpideyIcon';

interface RuleEditorProps {
  ruleId?: string;
  mode: 'view' | 'create' | 'edit';
  onClose: () => void;
}

const TEMPLATE_YAML = `id: my_new_rule
version: 1
meta:
  name: My new correlation rule
  description: >
    Describe what this rule detects and why it matters.
  risk: MEDIUM
collections:
  - collect:
      - method: exact
        field: type
        value: INTERNET_NAME
aggregation:
  field: data
analysis:
  - method: threshold
    field: data
    minimum: 2
headline: "Descriptive headline: {data}"
`;

/** Returns the modal title string for the given editor mode. */
function getRuleTitle(mode: 'view' | 'create' | 'edit'): string {
  if (mode === 'create') return 'New Correlation Rule';
  if (mode === 'edit') return 'Edit Correlation Rule';
  return 'View Correlation Rule';
}

/** Validates and dispatches the save API call for create or edit mode. */
function buildSaveCall(
  yaml: string,
  mode: 'view' | 'create' | 'edit',
  ruleId: string | undefined,
) {
  const idMatch = yaml.match(/^id:\s*(\S+)/m);
  const extractedId = idMatch ? idMatch[1] : '';
  if (!extractedId) throw new Error('YAML must contain an "id" field');
  return mode === 'create'
    ? createCorrelationRule(extractedId, yaml)
    : updateCorrelationRule(ruleId ?? '', yaml);
}

interface RuleEditorActionsProps {
  isReadOnly: boolean;
  yaml: string;
  validationStatus: 'idle' | 'validating' | 'valid' | 'invalid';
  validationError: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string;
  onValidate: () => void;
  onSave: () => void;
  onDuplicate: () => void;
}

/** Action bar with Validate/Save/Duplicate buttons and status feedback. */
function RuleEditorActions({
  isReadOnly, yaml, validationStatus, validationError,
  saveStatus, saveError, onValidate, onSave, onDuplicate,
}: RuleEditorActionsProps) {
  return (
    <div className="flex items-center gap-3">
      {!isReadOnly && (
        <>
          <button
            onClick={onValidate}
            disabled={validationStatus === 'validating' || !yaml.trim()}
            className="rounded-md bg-[var(--sf-bg-secondary)] px-4 py-2 text-sm font-medium hover:bg-[var(--sf-border)] disabled:opacity-50"
          >
            {validationStatus === 'validating' ? 'Validating...' : 'Validate'}
          </button>
          <button
            onClick={onSave}
            disabled={saveStatus === 'saving' || !yaml.trim()}
            className="rounded-md bg-[var(--sf-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save'}
          </button>
        </>
      )}
      {isReadOnly && (
        <button
          onClick={onDuplicate}
          className="rounded-md bg-[var(--sf-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Duplicate as User Rule
        </button>
      )}
      {validationStatus === 'valid' && (
        <span className="text-sm text-green-600 dark:text-green-400">Rule is valid</span>
      )}
      {validationStatus === 'invalid' && (
        <span className="text-sm text-red-600 dark:text-red-400">{validationError}</span>
      )}
      {saveStatus === 'saved' && (
        <span className="text-sm text-green-600 dark:text-green-400">Saved!</span>
      )}
      {saveStatus === 'error' && (
        <span className="text-sm text-red-600 dark:text-red-400">{saveError}</span>
      )}
    </div>
  );
}

export default function RuleEditor({ ruleId, mode, onClose }: RuleEditorProps) {
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [yaml, setYaml] = useState(mode === 'create' ? TEMPLATE_YAML : '');
  const [showAi, setShowAi] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [validationError, setValidationError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

  // Load existing rule data
  const { data: ruleData, isLoading } = useQuery({
    queryKey: ['correlationRule', ruleId],
    queryFn: async () => {
      const { data } = await getCorrelationRule(ruleId!);
      return data;
    },
    enabled: !!ruleId,
  });

  // Initialize yaml when rule data loads (derived state from server response)
  const [prevRuleData, setPrevRuleData] = useState(ruleData);
  if (ruleData !== prevRuleData) {
    setPrevRuleData(ruleData);
    if (ruleData?.yaml_content) setYaml(ruleData.yaml_content);
  }

  const validateMutation = useMutation({
    mutationFn: () => validateCorrelationRule(yaml),
    onMutate: () => {
      setValidationStatus('validating');
      setValidationError('');
    },
    onSuccess: ({ data }) => {
      if (data[0] === 'SUCCESS') {
        setValidationStatus('valid');
      } else {
        setValidationStatus('invalid');
        setValidationError(data[1]);
      }
    },
    onError: () => {
      setValidationStatus('invalid');
      setValidationError('Validation request failed');
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => buildSaveCall(yaml, mode, ruleId),
    onMutate: () => {
      setSaveStatus('saving');
      setSaveError('');
    },
    onSuccess: ({ data }) => {
      if (data[0] === 'SUCCESS') {
        setSaveStatus('saved');
        queryClient.invalidateQueries({ queryKey: ['correlationRules'] });
        setTimeout(() => onClose(), 500);
      } else {
        setSaveStatus('error');
        setSaveError(data[1]);
      }
    },
    onError: (err: Error) => {
      setSaveStatus('error');
      setSaveError(err.message || 'Save failed');
    },
  });

  // Handle tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = yaml.substring(0, start) + '  ' + yaml.substring(end);
      setYaml(newValue);
      // Restore cursor position after state update
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  const isReadOnly = mode === 'view' && ruleData?.source === 'builtin';
  const title = getRuleTitle(mode);

  if (isLoading && ruleId) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--sf-text-muted)] hover:bg-[var(--sf-bg-secondary)]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">{title}</h1>
          {ruleData?.source && (
            <span className={`rounded px-2 py-0.5 text-xs ${
              ruleData.source === 'user'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {ruleData.source}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAi(!showAi)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            showAi
              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
              : 'bg-[var(--sf-bg-secondary)] text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]'
          }`}
        >
          <SpideyIcon size={16} className="inline-block" /> Spidey {showAi ? '(hide)' : ''}
        </button>
      </div>

      {/* Main content */}
      <div className={`flex gap-4 ${showAi ? '' : ''}`}>
        {/* YAML Editor */}
        <div className="flex-1 space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={yaml}
              onChange={(e) => {
                setYaml(e.target.value);
                setValidationStatus('idle');
                setSaveStatus('idle');
              }}
              onKeyDown={handleKeyDown}
              readOnly={isReadOnly}
              placeholder="Enter YAML correlation rule..."
              className={`min-h-[500px] w-full resize-y rounded-lg border p-4 font-mono text-sm leading-relaxed ${
                isReadOnly
                  ? 'border-[var(--sf-border)] bg-[var(--sf-bg-secondary)] text-[var(--sf-text-muted)]'
                  : 'border-[var(--sf-border)] bg-[var(--sf-bg)] text-[var(--sf-text)] focus:border-[var(--sf-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-primary)]'
              }`}
              spellCheck={false}
            />
            {isReadOnly && (
              <div className="absolute right-3 top-3">
                <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  Read-only
                </span>
              </div>
            )}
          </div>

          {/* Action bar */}
          <RuleEditorActions
            isReadOnly={isReadOnly}
            yaml={yaml}
            validationStatus={validationStatus}
            validationError={validationError}
            saveStatus={saveStatus}
            saveError={saveError}
            onValidate={() => validateMutation.mutate()}
            onSave={() => saveMutation.mutate()}
            onDuplicate={() => {
              const modifiedYaml = yaml.replace(
                /^id:\s*(\S+)/m,
                (_, id) => `id: ${id}_custom`
              );
              setYaml(modifiedYaml);
              onClose();
            }}
          />
        </div>

        {/* AI Assistant Panel */}
        {showAi && (
          <div className="w-96 shrink-0">
            <AiRuleAssistant
              currentYaml={yaml}
              onApplyYaml={(newYaml) => {
                setYaml(newYaml);
                setValidationStatus('idle');
                setSaveStatus('idle');
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
