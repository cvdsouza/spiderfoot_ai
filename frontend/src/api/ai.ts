import api from './client';

export const getAiConfig = () => api.get('/ai/config');

export const saveAiConfig = (data: {
  provider?: string;
  openai_key?: string;
  anthropic_key?: string;
  default_mode?: string;
}) => api.put('/ai/config', data);

export const testAiKey = (provider: string, apiKey: string) =>
  api.post('/ai/config/test', { provider, api_key: apiKey });

export const triggerAiAnalysis = (scanId: string, provider?: string, mode?: string) =>
  api.post(`/scans/${scanId}/ai-analysis`, { provider, mode });

export const getAiAnalyses = (scanId: string) =>
  api.get(`/scans/${scanId}/ai-analysis`);

export const deleteAiAnalysis = (scanId: string, analysisId: string) =>
  api.delete(`/scans/${scanId}/ai-analysis/${analysisId}`);

// ── AI Chat (Natural Language Query) ──────────────────────────────────

export const sendChatMessage = (scanId: string, question: string) =>
  api.post(`/scans/${scanId}/ai-chat`, { question });

export const getChatHistory = (scanId: string) =>
  api.get(`/scans/${scanId}/ai-chat`);

export const clearChatHistory = (scanId: string) =>
  api.delete(`/scans/${scanId}/ai-chat`);
