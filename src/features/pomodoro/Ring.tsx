import type { Phase } from '../../lib/routine/pomodoro';

export const PHASES: Record<Phase, { label: string; color: string }> = {
  focus: { label: 'Foco', color: '#f59e0b' },
  short: { label: 'Pausa', color: '#22c55e' },
  long: { label: 'Pausa longa', color: '#14b8a6' },
};

/** How far a phase has gone, as a ring filling clockwise from the top. */
export default function Ring({ size, width, progress, color, children }: { size: number; width: number; progress: number; color: string; children?: React.ReactNode }) {
  const r = (size - width) / 2;
  const length = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={width} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - Math.min(1, Math.max(0, progress)))}
        />
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  );
}
