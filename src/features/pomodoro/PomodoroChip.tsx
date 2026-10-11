import { Pause } from 'lucide-react';
import { useRef, useState } from 'react';
import { clock, phaseMs, remaining } from '../../lib/routine/pomodoro';
import { openPomodoro, usePomodoro } from '../../store/pomodoro';
import { useNow } from './useNow';
import Ring, { PHASES } from './Ring';

/** Kept clear of the top bars and of the bars and buttons at the bottom of every screen. */
const MIN_BOTTOM = 72;
const TOP_GAP = 64;
const EDGE = 12;
const HEIGHT = 44;
/** A press that moves less than this is a tap. */
const SLOP = 6;

/** Distance from the bottom that keeps the clock on screen (the window may have shrunk or turned). */
const fit = (bottom: number) => Math.max(MIN_BOTTOM, Math.min(bottom, window.innerHeight - HEIGHT - TOP_GAP));

/**
 * The pomodoro's small clock, floating on a side of every screen while it's on. A tap opens the
 * panel; dragging moves it, and it settles against the nearer side.
 */
export default function PomodoroChip() {
  const timer = usePomodoro((s) => s.timer);
  const prefs = usePomodoro((s) => s.prefs);
  const spot = usePomodoro((s) => s.spot);
  const now = useNow(timer.status === 'running');
  const drag = useRef<{ x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const [held, setHeld] = useState<{ left: number; top: number } | null>(null);

  const { label, color } = PHASES[timer.phase];
  const ended = timer.status === 'ended';
  const left = remaining(timer, prefs, now);
  const progress = ended ? 0 : 1 - left / phaseMs(timer.phase, prefs);

  const place: React.CSSProperties = held
    ? { left: held.left, top: held.top }
    : { [spot.side]: EDGE, bottom: fit(spot.bottom) };

  return (
    <button
      className={`fixed z-40 flex h-11 touch-none items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] pr-3.5 pl-1.5 text-[var(--app-fg)] shadow-lg select-none ${
        held ? 'cursor-grabbing shadow-2xl' : ''
      }`}
      style={place}
      aria-label={ended ? `Pomodoro: ${label.toLowerCase()} a seguir` : `Pomodoro: ${label.toLowerCase()}, faltam ${clock(left)}`}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        drag.current = { x: e.clientX, y: e.clientY, dx: r.left - e.clientX, dy: r.top - e.clientY, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < SLOP) return;
        d.moved = true;
        setHeld({ left: e.clientX + d.dx, top: e.clientY + d.dy });
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d?.moved) return;
        dragged.current = true;
        const r = e.currentTarget.getBoundingClientRect();
        usePomodoro.getState().set({ spot: { side: r.left + r.width / 2 < window.innerWidth / 2 ? 'left' : 'right', bottom: fit(window.innerHeight - r.bottom) } });
        setHeld(null);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setHeld(null);
      }}
      onClick={() => {
        if (dragged.current) dragged.current = false;
        else openPomodoro();
      }}
    >
      <Ring size={32} width={3.5} progress={progress} color={color}>
        {timer.status === 'paused' ? (
          <Pause className="size-3.5 text-[var(--muted)]" />
        ) : (
          <span className={`rounded-full ${ended ? 'size-3 animate-pulse' : 'size-2'}`} style={{ background: color }} />
        )}
      </Ring>
      {ended ? (
        <span className="text-sm font-semibold">{label}?</span>
      ) : (
        <span className={`text-[15px] font-semibold tabular-nums ${timer.status === 'paused' ? 'text-[var(--muted)]' : ''}`}>{clock(left)}</span>
      )}
    </button>
  );
}
