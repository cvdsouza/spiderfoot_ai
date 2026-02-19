import api from './client';

export const getCorrelationRules = () => api.get('/correlation-rules');

export const getCorrelationRule = (ruleId: string) =>
  api.get(`/correlation-rules/${ruleId}`);

export const createCorrelationRule = (ruleId: string, yamlContent: string) =>
  api.post('/correlation-rules', { rule_id: ruleId, yaml_content: yamlContent });

export const updateCorrelationRule = (ruleId: string, yamlContent: string) =>
  api.put(`/correlation-rules/${ruleId}`, { yaml_content: yamlContent });

export const deleteCorrelationRule = (ruleId: string) =>
  api.delete(`/correlation-rules/${ruleId}`);

export const toggleCorrelationRule = (ruleId: string) =>
  api.post(`/correlation-rules/${ruleId}/toggle`);

export const validateCorrelationRule = (yamlContent: string) =>
  api.post('/correlation-rules/validate', { yaml_content: yamlContent });

export const aiGenerateRule = (prompt: string, existingYaml?: string) =>
  api.post('/correlation-rules/ai-generate', { prompt, existing_yaml: existingYaml });
