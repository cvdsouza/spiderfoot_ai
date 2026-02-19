interface SpideyIconProps {
  className?: string;
  size?: number;
}

export default function SpideyIcon({ className = '', size = 16 }: SpideyIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Spider body */}
      <ellipse cx="12" cy="11" rx="3" ry="3.5" />
      {/* Spider head */}
      <circle cx="12" cy="6" r="2" />
      {/* Left legs */}
      <path d="M9 9 L4 5" />
      <path d="M9 11 L3 10" />
      <path d="M9 13 L4 17" />
      <path d="M9.5 14.5 L5 21" />
      {/* Right legs */}
      <path d="M15 9 L20 5" />
      <path d="M15 11 L21 10" />
      <path d="M15 13 L20 17" />
      <path d="M14.5 14.5 L19 21" />
    </svg>
  );
}
