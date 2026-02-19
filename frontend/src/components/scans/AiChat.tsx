import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sendChatMessage, getChatHistory, clearChatHistory } from '../../api/ai';
import type { AiChatMessage, AiToolCall, AiToolCallContent } from '../../types';
import SpideyIcon from '../common/SpideyIcon';

const STARTER_QUESTIONS = [
  'What did this scan find? Give me a high-level summary.',
  'Are there any security threats or vulnerabilities?',
  'What IP addresses and domains were discovered?',
  'Were any email addresses found?',
  'Show me all open ports detected.',
];

const TOOL_LABELS: Record<string, string> = {
  get_scan_info: 'Scan Info',
  get_scan_summary: 'Event Summary',
  get_events_by_type: 'Events',
  get_unique_values: 'Unique Values',
  get_correlations: 'Correlations',
  search_events: 'Search',
};

interface AiChatProps {
  scanId: string;
  scanStatus: string;
}

export default function AiChat({ scanId }: AiChatProps) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<AiChatMessage[]>([]);
  const [lastToolCalls, setLastToolCalls] = useState<AiToolCall[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: chatHistory = [] } = useQuery({
    queryKey: ['aiChat', scanId],
    queryFn: async () => {
      const { data } = await getChatHistory(scanId);
      return data as AiChatMessage[];
    },
  });

  // Combine persisted + optimistic messages, filtering out tool_call/tool_result for display
  const displayMessages = [...chatHistory, ...pendingMessages].filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );

  // Find tool calls associated with each assistant message
  const allMessages = [...chatHistory, ...pendingMessages];
  const toolCallsMap = new Map<string, AiToolCall[]>();
  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    if (msg.role === 'tool_call') {
      // Associate tool calls with the next assistant message
      for (let j = i + 1; j < allMessages.length; j++) {
        if (allMessages[j].role === 'assistant') {
          const content = msg.content as AiToolCallContent;
          if (content?.tool_calls) {
            toolCallsMap.set(allMessages[j].id, content.tool_calls);
          }
          break;
        }
      }
    }
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, sending]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSend = async (question?: string) => {
    const q = (question || input).trim();
    if (!q || sending) return;
    setInput('');
    setSending(true);
    setLastToolCalls([]);

    // Optimistic user message
    const optimisticUser: AiChatMessage = {
      id: `pending-user-${Date.now()}`,
      role: 'user',
      content: q,
      token_usage: 0,
      created: Date.now(),
    };
    setPendingMessages((prev) => [...prev, optimisticUser]);

    try {
      const { data } = await sendChatMessage(scanId, q);
      if (data[0] === 'SUCCESS') {
        setLastToolCalls(data[1].tool_calls_made || []);
        queryClient.invalidateQueries({ queryKey: ['aiChat', scanId] });
        setPendingMessages([]);
      } else {
        setPendingMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${data[1]}`,
            token_usage: 0,
            created: Date.now(),
          },
        ]);
      }
    } catch {
      setPendingMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Failed to send message. Please try again.',
          token_usage: 0,
          created: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear all chat history for this scan?')) return;
    await clearChatHistory(scanId);
    queryClient.invalidateQueries({ queryKey: ['aiChat', scanId] });
    setPendingMessages([]);
    setLastToolCalls([]);
  };

  const isEmpty = displayMessages.length === 0 && !sending;

  return (
    <div className="flex h-[calc(100vh-280px)] min-h-[400px] flex-col rounded-lg border border-[var(--sf-border)]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="mb-4 opacity-30"><SpideyIcon size={48} /></div>
            <h3 className="mb-2 text-lg font-medium text-[var(--sf-text-muted)]">
              Ask Spidey anything about this scan
            </h3>
            <p className="mb-6 text-sm text-[var(--sf-text-muted)]">
              Spidey will query the scan database to answer your questions
            </p>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="rounded-full border border-[var(--sf-border)] px-3 py-1.5 text-xs text-[var(--sf-text-muted)] transition-colors hover:border-[var(--sf-primary)] hover:text-[var(--sf-primary)]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {displayMessages.map((msg, idx) => (
              <MessageBubble
                key={msg.id || idx}
                message={msg}
                toolCalls={toolCallsMap.get(msg.id) || (
                  // For the most recent assistant message, use lastToolCalls
                  msg.role === 'assistant' && idx === displayMessages.length - 1 && lastToolCalls.length > 0
                    ? lastToolCalls
                    : undefined
                )}
              />
            ))}
            {sending && (
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--sf-primary)] text-white">
                  <SpideyIcon size={16} />
                </div>
                <div className="rounded-lg rounded-tl-none bg-[var(--sf-bg-secondary)] px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-[var(--sf-text-muted)] [animation-delay:0ms]" />
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-[var(--sf-text-muted)] [animation-delay:150ms]" />
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-[var(--sf-text-muted)] [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--sf-border)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about this scan..."
            disabled={sending}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-2 text-sm focus:border-[var(--sf-primary)] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            className="rounded-lg bg-[var(--sf-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--sf-primary-hover)] disabled:opacity-50"
          >
            Send
          </button>
          {displayMessages.length > 0 && (
            <button
              onClick={handleClear}
              disabled={sending}
              className="rounded-lg border border-[var(--sf-border)] px-3 py-2 text-xs text-[var(--sf-text-muted)] hover:bg-[var(--sf-bg-secondary)] disabled:opacity-50"
              title="Clear chat history"
            >
              Clear
            </button>
          )}
        </div>
        <div className="mt-1 text-xs text-[var(--sf-text-muted)]">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}


// ── Message Bubble ───────────────────────────────────────────────────

function MessageBubble({ message, toolCalls }: {
  message: AiChatMessage;
  toolCalls?: AiToolCall[];
}) {
  const isUser = message.role === 'user';
  const content = typeof message.content === 'string' ? message.content : '';

  if (isUser) {
    return (
      <div className="flex items-start justify-end gap-3">
        <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[var(--sf-primary)] px-4 py-3 text-sm text-white">
          {content}
        </div>
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--sf-bg-secondary)] text-xs font-bold">
          U
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--sf-primary)] text-white">
        <SpideyIcon size={16} />
      </div>
      <div className="max-w-[80%]">
        <div className="rounded-lg rounded-tl-none bg-[var(--sf-bg-secondary)] px-4 py-3 text-sm">
          <MarkdownContent content={content} />
        </div>
        {toolCalls && toolCalls.length > 0 && (
          <ToolCallDetails toolCalls={toolCalls} />
        )}
      </div>
    </div>
  );
}


// ── Simple Markdown Renderer ─────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown rendering: bold, italic, code, headers, bullets, tables
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="my-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--sf-border)]">
                {tableRows[0].map((cell, ci) => (
                  <th key={ci} className="px-2 py-1 font-semibold">{cell.trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, ri) => (
                <tr key={ri} className="border-b border-[var(--sf-border)] last:border-0">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1">{cell.trim()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="my-2 overflow-x-auto rounded bg-[var(--sf-bg)] p-2 text-xs">
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushTable();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Table rows
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      // Skip separator rows (|---|---|)
      if (/^\|[\s-:|]+\|$/.test(line.trim())) continue;
      const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (!inTable) inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="mb-1 mt-3 text-sm font-semibold">{formatInline(line.slice(4))}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="mb-1 mt-3 font-semibold">{formatInline(line.slice(3))}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="mb-1 mt-3 text-lg font-semibold">{formatInline(line.slice(2))}</h2>);
    }
    // Bullet points
    else if (line.match(/^[-*]\s/)) {
      elements.push(
        <div key={i} className="ml-3 flex gap-1.5">
          <span className="text-[var(--sf-text-muted)]">&#8226;</span>
          <span>{formatInline(line.slice(2))}</span>
        </div>
      );
    }
    // Numbered lists
    else if (line.match(/^\d+\.\s/)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="ml-3 flex gap-1.5">
            <span className="text-[var(--sf-text-muted)]">{match[1]}.</span>
            <span>{formatInline(match[2])}</span>
          </div>
        );
      }
    }
    // Empty line
    else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    }
    // Regular text
    else {
      elements.push(<p key={i}>{formatInline(line)}</p>);
    }
  }

  flushTable();

  return <div className="space-y-0.5">{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  // Handle bold, italic, inline code
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining) {
    // Inline code
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(formatBoldItalic(codeMatch[1], keyIdx++));
      parts.push(
        <code key={`c${keyIdx++}`} className="rounded bg-[var(--sf-bg)] px-1 py-0.5 text-xs font-mono">
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }
    parts.push(formatBoldItalic(remaining, keyIdx++));
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function formatBoldItalic(text: string, key: number): React.ReactNode {
  // **bold** and *italic*
  const boldParts = text.split(/\*\*(.+?)\*\*/g);
  if (boldParts.length > 1) {
    return (
      <span key={key}>
        {boldParts.map((part, i) =>
          i % 2 === 1 ? <strong key={i}>{part}</strong> : part
        )}
      </span>
    );
  }
  return text;
}


// ── Tool Call Details ────────────────────────────────────────────────

function ToolCallDetails({ toolCalls }: { toolCalls: AiToolCall[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-[var(--sf-text-muted)] hover:text-[var(--sf-text)] hover:underline"
      >
        {expanded ? 'Hide' : 'Show'} data queries ({toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''})
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg)] p-2">
          {toolCalls.map((tc, i) => (
            <div key={i} className="text-xs">
              <span className="font-mono font-semibold text-[var(--sf-primary)]">
                {TOOL_LABELS[tc.name] || tc.name}
              </span>
              {Object.keys(tc.arguments).length > 0 && (
                <span className="ml-1 text-[var(--sf-text-muted)]">
                  ({Object.entries(tc.arguments).map(([k, v]) => `${k}: ${v}`).join(', ')})
                </span>
              )}
              {tc.result && (
                <span className="ml-1 text-[var(--sf-text-muted)]">
                  {tc.result.total_types !== undefined && ` → ${tc.result.total_types} types`}
                  {tc.result.returned !== undefined && ` → ${tc.result.returned} results`}
                  {tc.result.total !== undefined && ` → ${tc.result.total} items`}
                  {tc.result.name !== undefined && ` → ${tc.result.name as string}`}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
