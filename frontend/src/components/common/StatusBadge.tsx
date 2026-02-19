const STATUS_COLORS: Record<string, string> = {
  RUNNING: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  STARTING: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  STARTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  INITIALIZING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  FINISHED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  ABORTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'ABORT-REQUESTED': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'ERROR-FAILED': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colorClasses = STATUS_COLORS[status] || 'bg-gray-100 text-gray-800';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClasses}`}
    >
      {status === 'RUNNING' && (
        <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
      )}
      {status}
    </span>
  );
}
