import api from './client';

export interface WorkerRecord {
  id: string;
  name: string;
  host: string;
  queue_type: 'fast' | 'slow';
  status: 'idle' | 'busy' | 'offline';
  current_scan: string;
  last_seen: number;
  registered: number;
}

export async function listWorkers(): Promise<WorkerRecord[]> {
  const { data } = await api.get<WorkerRecord[]>('/workers');
  return data;
}

export async function getWorker(workerId: string): Promise<WorkerRecord> {
  const { data } = await api.get<WorkerRecord>(`/workers/${workerId}`);
  return data;
}
