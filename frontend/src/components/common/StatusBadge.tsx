// Nexus-style terminal status badges

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; label?: string }> = {
  RUNNING:          { color: '#00B4FF', bg: '#001828', border: '#00B4FF40', label: 'RUNNING' },
  STARTING:         { color: '#00B4FF', bg: '#001828', border: '#00B4FF40', label: 'STARTING' },
  STARTED:          { color: '#00B4FF', bg: '#001828', border: '#00B4FF40', label: 'STARTING' },
  INITIALIZING:     { color: '#00B4FF', bg: '#001828', border: '#00B4FF40', label: 'INIT' },
  FINISHED:         { color: '#32D74B', bg: '#001A08', border: '#32D74B40', label: 'FINISHED' },
  ABORTED:          { color: '#FF9F0A', bg: '#271500', border: '#FF9F0A40', label: 'ABORTED' },
  'ABORT-REQUESTED':{ color: '#FF9F0A', bg: '#271500', border: '#FF9F0A40', label: 'STOPPING' },
  'ERROR-FAILED':   { color: '#FF3B30', bg: '#280A08', border: '#FF3B3040', label: 'ERROR' },
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? { color: '#52525B', bg: '#111418', border: '#3F3F4640' };
  const label = cfg.label ?? status;
  const isLive = ['RUNNING', 'STARTING', 'STARTED', 'INITIALIZING'].includes(status);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '2px 7px',
        fontSize: '8px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        borderRadius: '2px',
        border: `1px solid ${cfg.border}`,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      {isLive && (
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: cfg.color,
            boxShadow: `0 0 5px ${cfg.color}`,
            animation: 'sf-blink 0.8s infinite',
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}
