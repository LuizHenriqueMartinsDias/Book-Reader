import { dayKey } from './calendar';

/** How often the clock ticks, and the longest gap one tick may count (a sleeping tablet wakes up late). */
export const TICK_MS = 15_000;
const MAX_TICK_MS = 2 * TICK_MS;

/**
 * Time actually spent on something: it counts while the page is visible and there was input
 * (a scroll, a page turn, a stroke…) in the last `idleMs`. Seconds pile up and come out by day,
 * so time around midnight goes to the right day.
 */
export class ActiveTime {
  private lastInput = -Infinity;
  private lastTick: number;
  private pending = 0;
  private pendingDay: string | null = null;

  constructor(
    private readonly idleMs: number,
    now: number,
  ) {
    this.lastTick = now;
  }

  input(now: number) {
    this.lastInput = now;
  }

  /** Counts the time since the last tick; returns what's ready to save (a minute or more, or a finished day). */
  tick(now: number, visible: boolean): { day: string; seconds: number }[] {
    const elapsed = Math.min(Math.max(0, now - this.lastTick), MAX_TICK_MS);
    this.lastTick = now;
    const out: { day: string; seconds: number }[] = [];
    const day = dayKey(new Date(now));
    if (this.pendingDay && this.pendingDay !== day) out.push(...this.flush());
    if (visible && now - this.lastInput <= this.idleMs) {
      this.pending += elapsed / 1000;
      this.pendingDay = day;
    }
    if (this.pending >= 60) out.push(...this.flush());
    return out;
  }

  /** Everything not saved yet (when the page hides or closes). */
  flush(): { day: string; seconds: number }[] {
    const out = this.pendingDay && this.pending >= 1 ? [{ day: this.pendingDay, seconds: Math.round(this.pending) }] : [];
    this.pending = 0;
    this.pendingDay = null;
    return out;
  }
}
