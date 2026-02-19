import api from './client';

export const getScanEvents = (id: string, eventType?: string, filterfp: boolean = false, correlationId?: string) =>
  api.get(`/scans/${id}/events`, { params: { eventType, filterfp, correlationId } });

export const getScanEventsUnique = (id: string, eventType: string, filterfp: boolean = false) =>
  api.get(`/scans/${id}/events/unique`, { params: { eventType, filterfp } });

export const getScanCorrelations = (id: string) => api.get(`/scans/${id}/correlations`);

export const getScanGraph = (id: string, gexf: string = '0') =>
  api.get(`/scans/${id}/graph`, { params: { gexf } });

export const getScanDiscovery = (id: string, eventType: string) =>
  api.get(`/scans/${id}/discovery`, { params: { eventType } });

export const searchResults = (id?: string, eventType?: string, value?: string) =>
  api.get('/search', { params: { id, eventType, value } });

export const setFalsePositive = (id: string, resultids: string[], fp: string) =>
  api.put(`/scans/${id}/false-positives`, null, { params: { resultids: JSON.stringify(resultids), fp } });
