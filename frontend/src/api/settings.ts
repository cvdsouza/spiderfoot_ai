import api from './client';

export const getSettings = () => api.get('/settings');
export const saveSettings = (allopts: Record<string, unknown>) => api.put('/settings', allopts);
export const exportSettings = (pattern?: string) => api.get('/settings/export', { params: { pattern }, responseType: 'blob' });
export const importSettings = (file: File) => {
  const formData = new FormData();
  formData.append('config_file', file);
  return api.post('/settings/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const resetSettings = () => api.post('/settings/reset');
export const getModules = () => api.get('/modules');
export const getEventTypes = () => api.get('/event-types');
export const ping = () => api.get('/ping');
