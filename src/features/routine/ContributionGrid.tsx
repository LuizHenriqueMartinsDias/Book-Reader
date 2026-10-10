import { useLayoutEffect, useRef } from 'react';
import type { GridWeek } from '../../lib/routine/calendar';

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const LABEL_W = 26;
const MONTH_H = 16;
/** Room after the last column for a month name that starts there. */
const MONTH_TAIL = 14;

/** How a day's square looks: a shade, a day off (hollow), and what it says on hover. */
export interface Cell {
  fill?: string;
  off?: boolean;
  label: string;
}

interface Props {
  weeks: GridWeek[];
  cell: (day: string) => Cell;
  today: string;
  /** A tap on a day: its detail, to see and fix it. */
  onPick?: (day: string) => void;
  /** Month and weekday names around it (the year grid; the small ones go without). */
  labels?: boolean;
  /** What the grid shows, for screen readers. */
  title: string;
}

/**
 * GitHub-style grid of days: a column per week, Sunday on top. Days off are hollow, today has a
 * ring. Too wide for the screen, it scrolls and opens on today.
 */
export default function ContributionGrid({ weeks, cell, today, onPick, labels = false, title }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const top = labels ? MONTH_H : 0;
  const left = labels ? LABEL_W : 0;
  const width = left + weeks.length * STEP - GAP + (labels ? MONTH_TAIL : 0);
  const height = top + 7 * STEP - GAP;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks.length]);

  return (
    <div ref={scroller} className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
      <svg width={width} height={height} role="img" aria-label={title} className="block">
        {labels && (
          <g className="fill-[var(--muted)] text-[10px]">
            {weeks.map((w, i) => w.month && <text key={i} x={left + i * STEP} y={10}>{w.month}</text>)}
            {['Seg', 'Qua', 'Sex'].map((d, i) => (
              <text key={d} x={0} y={top + (1 + i * 2) * STEP + CELL - 2}>
                {d}
              </text>
            ))}
          </g>
        )}
        {weeks.map((w, i) =>
          w.days.map((day, d) => {
            if (!day) return null;
            const c = cell(day);
            const x = left + i * STEP;
            const y = top + d * STEP;
            return (
              <rect
                key={day}
                x={c.off ? x + 0.75 : x}
                y={c.off ? y + 0.75 : y}
                width={c.off ? CELL - 1.5 : CELL}
                height={c.off ? CELL - 1.5 : CELL}
                rx={c.off ? 2.25 : 3}
                fill={c.off ? 'none' : c.fill}
                stroke={day === today ? 'var(--app-fg)' : c.off ? 'var(--muted)' : undefined}
                strokeOpacity={day === today ? 1 : 0.5}
                strokeWidth={day === today ? 2 : 1.5}
                className={onPick ? 'cursor-pointer' : undefined}
                onClick={onPick && (() => onPick(day))}
              >
                <title>{c.label}</title>
              </rect>
            );
          }),
        )}
      </svg>
    </div>
  );
}

/** "Menos ▢▢▢▢▢ Mais · ▢ Folga" under a grid. */
export function GridLegend({ shades }: { shades: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
      <span className="flex items-center gap-[3px]">
        Menos
        {shades.map((s) => (
          <span key={s} className="inline-block size-[11px] rounded-[2px]" style={{ background: s }} />
        ))}
        Mais
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-[11px] rounded-[2px] border-[1.5px] border-[var(--muted)] opacity-60" /> Folga
      </span>
    </div>
  );
}
