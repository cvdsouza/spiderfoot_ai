import { useQuery } from '@tanstack/react-query';
import { getScanStatus } from '../api/scans';

const TERMINAL_STATES = ['FINISHED', 'ABORTED', 'ERROR-FAILED'];

export function useScanStatus(scanId: string) {
  return useQuery({
    queryKey: ['scanStatus', scanId],
    queryFn: async () => {
      const { data } = await getScanStatus(scanId);
      return data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.[5];
      if (status && TERMINAL_STATES.includes(status)) return false;
      return 5000;
    },
    enabled: !!scanId,
  });
}
