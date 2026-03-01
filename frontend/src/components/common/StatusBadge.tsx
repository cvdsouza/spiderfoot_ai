const STATUS_COLORS: Record<string, string> = {
  RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  STARTING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  STARTED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  INITIALIZING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  FINISHED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  ABORTED: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'ABORT-REQUESTED': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'ERROR-FAILED': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colorClasses = STATUS_COLORS[status] || 'bg-gray-100 text-gray-800';

  const labels: Record<string, string> = {
    'ABORT-REQUESTED': 'Stopping...',
    ABORTED: 'User Stopped',
  };
  const label = labels[status] ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClasses}`}
    >
      {status === 'RUNNING' && (
        <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
      )}
      {label}
    </span>
  );
}
