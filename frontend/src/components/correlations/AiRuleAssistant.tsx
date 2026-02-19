import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiGenerateRule } from '../../api/correlationRules';
import SpideyIcon from '../common/SpideyIcon';

interface AiRuleAssistantProps {
  currentYaml: string;
  onApplyYaml: (yaml: string) => void;
}

const QUICK_ACTIONS = [
  { label: 'Generate new rule', prompt: '', needsYaml: false },
  { label: 'Explain this rule', prompt: 'Explain what this rule does in plain language.', needsYaml: true },
  { label: 'Improve this rule', prompt: 'Suggest improvements to this rule.', needsYaml: true },
];

export default function AiRuleAssistant({ currentYaml, onApplyYaml }: AiRuleAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState<{
    explanation: string;
    yaml_content: string;
    token_usage: number;
  } | null>(null);
  const [error, setError] = useState('');

  const generateMutation = useMutation({
    mutationFn: async ({ userPrompt, existingYaml }: { userPrompt: string; existingYaml?: string }) => {
      const { data } = await aiGenerateRule(userPrompt, existingYaml);
      return data;
    },
    onMutate: () => {
      setError('');
      setResponse(null);
    },
    onSuccess: (data) => {
      if (data[0] === 'SUCCESS') {
        setResponse(data[1]);
      } else {
        setError(data[1]);
      }
    },
    onError: () => {
      setError('Request failed. Please try again.');
    },
  });

  const handleSubmit = (actionPrompt?: string, needsYaml?: boolean) => {
    const userPrompt = actionPrompt || prompt;
    if (!userPrompt.trim()) return;

    const existingYaml = needsYaml ? currentYaml : undefined;
    generateMutation.mutate({ userPrompt, existingYaml });

    if (!actionPrompt) setPrompt('');
  };

  return (
    <div className="flex flex-col rounded-lg border border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20">
      {/* Header */}
      <div className="border-b border-purple-200 px-4 py-3 dark:border-purple-800">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-purple-800 dark:text-purple-200">
          <SpideyIcon size={18} /> Spidey
        </h3>
        <p className="mt-0.5 text-xs text-purple-600 dark:text-purple-400">
          Describe what you want to detect and Spidey will generate a rule.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1.5 border-b border-purple-200 px-4 py-2.5 dark:border-purple-800">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => {
              if (action.label === 'Generate new rule') {
                // Focus the prompt input
                return;
              }
              handleSubmit(action.prompt, action.needsYaml);
            }}
            disabled={generateMutation.isPending || (action.needsYaml && !currentYaml.trim())}
            className="rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Prompt input */}
      <div className="border-b border-purple-200 p-4 dark:border-purple-800">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Describe what you want to detect... e.g., 'Find hosts that appear on multiple malware blocklists'"
          className="w-full resize-none rounded-md border border-purple-200 bg-white p-2.5 text-sm placeholder:text-purple-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400 dark:border-purple-700 dark:bg-purple-950/30 dark:placeholder:text-purple-600"
          rows={3}
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => handleSubmit()}
            disabled={generateMutation.isPending || !prompt.trim()}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {generateMutation.isPending ? 'Generating...' : 'Generate'}
          </button>
          {currentYaml.trim() && (
            <label className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400">
              <input
                type="checkbox"
                onChange={(e) => {
                  if (e.target.checked && prompt) {
                    // Handled in submit
                  }
                }}
                className="rounded border-purple-300"
              />
              Include current YAML as context
            </label>
          )}
        </div>
      </div>

      {/* Response */}
      <div className="flex-1 overflow-auto p-4">
        {generateMutation.isPending && (
          <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
            Spidey is generating...
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {response && (
          <div className="space-y-3">
            {/* Explanation */}
            {response.explanation && (
              <div className="text-sm text-[var(--sf-text)]">
                {response.explanation.split('\n').map((line, i) => (
                  <p key={i} className={line.trim() ? '' : 'h-2'}>
                    {line}
                  </p>
                ))}
              </div>
            )}

            {/* Generated YAML */}
            {response.yaml_content && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                    Generated YAML
                  </span>
                  <button
                    onClick={() => onApplyYaml(response.yaml_content)}
                    className="rounded-md bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700"
                  >
                    Apply to Editor
                  </button>
                </div>
                <pre className="max-h-64 overflow-auto rounded-md bg-gray-900 p-3 font-mono text-xs text-green-400">
                  {response.yaml_content}
                </pre>
              </div>
            )}

            {/* Token usage */}
            {response.token_usage > 0 && (
              <p className="text-xs text-[var(--sf-text-muted)]">
                Tokens used: {response.token_usage}
              </p>
            )}
          </div>
        )}

        {!generateMutation.isPending && !error && !response && (
          <p className="text-center text-xs text-purple-500 dark:text-purple-600">
            Type a description above or use a quick action to get started.
          </p>
        )}
      </div>
    </div>
  );
}
