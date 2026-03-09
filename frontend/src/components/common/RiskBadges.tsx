import type { RiskMatrix } from '../../types';

const RISK_CFG = {
  HIGH:   { color: '#FF3B30', bg: '#280A08', border: '#FF3B3040' },
  MEDIUM: { color: '#FF9F0A', bg: '#271500', border: '#FF9F0A40' },
  LOW:    { color: '#FFD60A', bg: '#1F1B00', border: '#FFD60A40' },
  INFO:   { color: '#00B4FF', bg: '#001828', border: '#00B4FF40' },
};

interface RiskBadgesProps {
  riskMatrix: RiskMatrix;
  onRiskClick?: (risk: string) => void;
}

export default function RiskBadges({ riskMatrix, onRiskClick }: RiskBadgesProps) {
  const clickable = !!onRiskClick;

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {(Object.entries(RISK_CFG) as [keyof RiskMatrix, typeof RISK_CFG.HIGH][]).map(([level, cfg]) => {
        const count = riskMatrix[level];
        if (!count) return null;
        return (
          <span
            key={level}
            onClick={() => onRiskClick?.(level)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 5px',
              fontSize: '8px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              borderRadius: '2px',
              border: `1px solid ${cfg.border}`,
              background: cfg.bg,
              color: cfg.color,
              cursor: clickable ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
              transition: 'opacity 0.15s',
            }}
            title={clickable ? `Filter by ${level}` : undefined}
          >
            {count} {level}
          </span>
        );
      })}
    </div>
  );
}
