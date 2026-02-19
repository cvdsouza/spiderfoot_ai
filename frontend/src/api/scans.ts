import api from './client';
import type { ScanCreate } from '../types';

export const getScans = () => api.get('/scans');
export const getScanStatus = (id: string) => api.get(`/scans/${id}/status`);
export const getScanConfig = (id: string) => api.get(`/scans/${id}/config`);
export const getScanSummary = (id: string, by: string = 'type') =>
  api.get(`/scans/${id}/summary`, { params: { by } });
export const getScanLog = (id: string, limit?: number) =>
  api.get(`/scans/${id}/log`, { params: { limit } });
export const getScanErrors = (id: string) => api.get(`/scans/${id}/errors`);
export const getScanHistory = (id: string) => api.get(`/scans/${id}/history`);
export const createScan = (data: ScanCreate) => api.post('/scans', data);
export const stopScan = (id: string) => api.post(`/scans/${id}/stop`);
export const deleteScan = (id: string) => api.delete(`/scans/${id}`);
export const rerunScan = (id: string) => api.post(`/scans/${id}/rerun`);
