import { useId, useLayoutEffect, useRef } from 'react';
import type { GridWeek } from '../../lib/routine/calendar';

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const LABEL_W = 26;
const MONTH_H = 16;
/** Room after the last column for a month name that starts there. */
const MONTH_TAIL = 14;
/** Room around the squares for today's ring, which sits outside its square. */
const PAD = 2;

/** How a day's square looks: a shade, a day off (striped), and what it says on hover. */
export interface Cell {
  fill?: string;
  off?: boolean;
  label: string;
}

interface Props {
  weeks: GridWeek[];
  cell: (day: string) => Cell;
  today: string;
  /** Color of the ring around today: the grid's own (amber, or the habit's). */
  ring: string;
  /** A tap on a day: its detail, to see and fix it. */
  onPick?: (day: string) => void;
  /** Month and weekday names around it (the year grid; the small ones go without). */
  labels?: boolean;
  /** What the grid shows, for screen readers. */
  title: string;
}

/**
 * GitHub-style grid of days: a column per week, Sunday on top. Days off are striped, today has a
 * ring around it. Too wide for the screen, it scrolls and opens on today.
 */
export default function ContributionGrid({ weeks, cell, today, ring, onPick, labels = false, title }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stripes = `off-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const top = PAD + (labels ? MONTH_H : 0);
  const left = PAD + (labels ? LABEL_W : 0);
  const width = left + weeks.length * STEP - GAP + PAD + (labels ? MONTH_TAIL : 0);
  const height = top + 7 * STEP - GAP + PAD;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks.length]);

  return (
    <div ref={scroller} className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
      <svg width={width} height={height} role="img" aria-label={title} className="block">
        <defs>
          <pattern id={stripes} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={1} height={4} style={{ fill: 'var(--grid-off)' }} />
          </pattern>
        </defs>
        {labels && (
          <g className="fill-[var(--muted)] text-[10px]">
            {weeks.map((w, i) => w.month && <text key={i} x={left + i * STEP} y={PAD + 10}>{w.month}</text>)}
            {['Seg', 'Qua', 'Sex'].map((d, i) => (
              <text key={d} x={PAD} y={top + (1 + i * 2) * STEP + CELL - 2}>
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
              <g key={day} className={onPick ? 'cursor-pointer' : undefined} onClick={onPick && (() => onPick(day))}>
                {/* Outside the square, so its shade still shows whole. */}
                {day === today && <rect x={x - 1} y={y - 1} width={CELL + 2} height={CELL + 2} rx={4} fill="none" stroke={ring} strokeWidth={2} />}
                <rect
                  x={c.off ? x + 0.5 : x}
                  y={c.off ? y + 0.5 : y}
                  width={c.off ? CELL - 1 : CELL}
                  height={c.off ? CELL - 1 : CELL}
                  rx={c.off ? 2.5 : 3}
                  fill={c.off ? `url(#${stripes})` : c.fill}
                  style={c.off ? { stroke: 'var(--grid-off)' } : undefined}
                >
                  <title>{c.label}</title>
                </rect>
              </g>
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
        <span
          className="inline-block size-[11px] rounded-[2px] border border-[var(--grid-off)]"
          style={{ background: 'repeating-linear-gradient(135deg, var(--grid-off) 0 1px, transparent 1px 4px)' }}
        />{' '}
        Folga
      </span>
    </div>
  );
}
