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
          className={`inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200 ${base}`}
        >
          {riskMatrix.HIGH} HIGH
        </span>
      )}
      {riskMatrix.MEDIUM > 0 && (
        <span
          onClick={() => onRiskClick?.('MEDIUM')}
          className={`inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900 dark:text-orange-200 ${base}`}
        >
          {riskMatrix.MEDIUM} MED
        </span>
      )}
      {riskMatrix.LOW > 0 && (
        <span
          onClick={() => onRiskClick?.('LOW')}
          className={`inline-flex items-center rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 ${base}`}
        >
          {riskMatrix.LOW} LOW
        </span>
      )}
      {riskMatrix.INFO > 0 && (
        <span
          onClick={() => onRiskClick?.('INFO')}
          className={`inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200 ${base}`}
        >
          {riskMatrix.INFO} INFO
        </span>
      )}
    </div>
  );
}
