/** TypeScript types matching the FastAPI Pydantic models. */

export interface RiskMatrix {
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  INFO: number;
}

export interface ScanCreate {
  scan_name: string;
  scan_target: string;
  module_list?: string;
  type_list?: string;
  use_case?: string;
}

export interface ModuleInfo {
  name: string;
  descr: string;
}

export interface EventTypeInfo {
  name: string;
  id: string;
}

export interface CorrelationRuleInfo {
  id: string;
  name: string;
  descr: string;
  risk: string;
}

export type ScanStatus =
  | 'INITIALIZING'
  | 'STARTING'
  | 'STARTED'
  | 'RUNNING'
  | 'ABORT-REQUESTED'
  | 'ABORTED'
  | 'FINISHED'
  | 'ERROR-FAILED';

/** Raw scan list row from API (array format for backward compat) */
export type ScanListRow = [
  string,    // id
  string,    // name
  string,    // target
  string,    // created
  string,    // started
  string,    // finished
  string,    // status
  number,    // numElements
  RiskMatrix // riskMatrix
];

/** Raw scan status from API */
export type ScanStatusRow = [
  string,    // name
  string,    // target
  string,    // created
  string,    // started
  string,    // ended
  string,    // status
  RiskMatrix // riskMatrix
];

// ── AI Analysis Types ────────────────────────────────────────────────────

export interface AiConfigStatus {
  provider: string;
  openai_key_set: boolean;
  anthropic_key_set: boolean;
  default_mode: string;
}

export interface AiAnalysisFinding {
  title: string;
  description: string;
  relevance: string;
  recommendation: string;
  related_events: string[];
}

export interface AiAnalysisCategory {
  name: string;
  priority: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  findings: AiAnalysisFinding[];
}

export interface AiAnalysisResult {
  executive_summary: string;
  risk_assessment: 'HIGH' | 'MEDIUM' | 'LOW';
  categories: AiAnalysisCategory[];
  target_profile: {
    summary: string;
    key_assets: string[];
    exposure_level: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

export interface AiAnalysisRecord {
  id: string;
  scan_instance_id: string;
  provider: string;
  model: string;
  mode: string;
  created: number;
  status: 'running' | 'completed' | 'failed';
  result: AiAnalysisResult | null;
  token_usage: number;
  error: string | null;
}

// ── AI Chat (Natural Language Query) Types ────────────────────────────

export interface AiToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface AiToolCallContent {
  tool_calls: AiToolCall[];
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string | AiToolCallContent;
  token_usage: number;
  created: number;
}

export interface AiChatResponse {
  message_id: string;
  answer: string;
  tool_calls_made: AiToolCall[];
  token_usage: number;
}

// ── Auth / User Types ────────────────────────────────────────────────

export interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface LoginResponse {
  token: string;
  token_type: string;
  user: UserInfo;
}

export interface UserRecord {
  id: string;
  username: string;
  display_name: string;
  email: string;
  is_active: boolean;
  roles: string[];
  created: number;
  updated: number;
}

export interface RoleInfo {
  id: string;
  name: string;
  description: string;
}

// ── Correlation Rules Types ───────────────────────────────────────────

export interface CorrelationRule {
  rule_id: string;
  name: string;
  description: string;
  risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  source: 'builtin' | 'user';
  enabled: boolean;
  yaml_content?: string;
  created?: number;
  updated?: number;
}

export interface AiRuleGenerateResponse {
  yaml_content: string;
  explanation: string;
  token_usage: number;
}
