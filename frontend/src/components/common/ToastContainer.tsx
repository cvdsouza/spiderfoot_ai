import { useToastStore } from '../../stores/toastStore';
import type { ToastType } from '../../stores/toastStore';

const TOAST_CFG: Record<ToastType, { color: string; bg: string; border: string; icon: string }> = {
  success: { color: '#32D74B', bg: '#001A08', border: '#32D74B30', icon: '✓' },
  error:   { color: '#FF3B30', bg: '#280A08', border: '#FF3B3030', icon: '✕' },
  warning: { color: '#FF9F0A', bg: '#271500', border: '#FF9F0A30', icon: '⚠' },
  info:    { color: '#00B4FF', bg: '#001828', border: '#00B4FF30', icon: '◈' },
};

export default function ToastContainer() {
  const { toasts, remove } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: '16px', right: '16px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '6px', pointerEvents: 'none' }}>
      {toasts.map((t) => {
        const cfg = TOAST_CFG[t.type];
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'all',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: '260px',
              maxWidth: '380px',
              padding: '10px 12px',
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderLeft: `2px solid ${cfg.color}`,
              borderRadius: '2px',
              animation: 'sf-slide 0.2s ease',
            }}
          >
            <span style={{ fontSize: '11px', color: cfg.color, flexShrink: 0 }}>{cfg.icon}</span>
            <span style={{ flex: 1, fontSize: '10px', color: '#E4E4E7', letterSpacing: '0.02em', lineHeight: 1.4 }}>{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3F3F46', flexShrink: 0, fontSize: '11px', padding: '0 2px', lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#71717A')}
              onMouseLeave={e => (e.currentTarget.style.color = '#3F3F46')}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
