import type { RiskMatrix } from '../../types';

interface RiskBadgesProps {
  riskMatrix: RiskMatrix;
  onRiskClick?: (risk: string) => void;
}

export default function RiskBadges({ riskMatrix, onRiskClick }: RiskBadgesProps) {
  const clickable = !!onRiskClick;
  const base = clickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : '';

  return (
    <div className="flex gap-1">
      {riskMatrix.HIGH > 0 && (
        <span
          onClick={() => onRiskClick?.('HIGH')}
          className={`inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300 ${base}`}
        >
          {riskMatrix.HIGH} HIGH
        </span>
      )}
      {riskMatrix.MEDIUM > 0 && (
        <span
          onClick={() => onRiskClick?.('MEDIUM')}
          className={`inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 ${base}`}
        >
          {riskMatrix.MEDIUM} MED
        </span>
      )}
      {riskMatrix.LOW > 0 && (
        <span
          onClick={() => onRiskClick?.('LOW')}
          className={`inline-flex items-center rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 ${base}`}
        >
          {riskMatrix.LOW} LOW
        </span>
      )}
      {riskMatrix.INFO > 0 && (
        <span
          onClick={() => onRiskClick?.('INFO')}
          className={`inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ${base}`}
        >
          {riskMatrix.INFO} INFO
        </span>
      )}
    </div>
  );
}
