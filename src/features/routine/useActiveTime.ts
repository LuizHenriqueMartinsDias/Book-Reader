import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { addActivity } from '../../db/habits';
import type { ActivityKind } from '../../db/schema';
import { ActiveTime, TICK_MS } from '../../lib/routine/activity';
import { studyRunning } from '../../store/pomodoro';
import { useSplit, type Pane } from '../split/splitStore';

/** How long without input still counts: a dense page can take a while to read. */
const IDLE_MS: Record<ActivityKind, number> = { reading: 5 * 60_000, study: 3 * 60_000 };
/** The side of "study side by side" each one is on. */
const PANE: Record<ActivityKind, Pane> = { reading: 'reader', study: 'notes' };
const INPUTS = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;

/**
 * Counts the time spent reading (or studying) on this screen for the routine: while the app is
 * visible and there's input inside `scope`. Side by side, only the side in use (the last one
 * touched) counts.
 * Returns `poke`, for input the scope doesn't see (a page turned in an EPUB's own frame).
 */
export function useActiveTime(kind: ActivityKind, scope: RefObject<HTMLElement | null>) {
  const clock = useRef<ActiveTime | null>(null);
  const poke = useCallback(() => clock.current?.input(Date.now()), []);

  useEffect(() => {
    const c = new ActiveTime(IDLE_MS[kind], Date.now());
    clock.current = c;
    c.input(Date.now()); // opening the book or notebook is using it
    const save = (ready: { day: string; seconds: number }[]) => ready.forEach(({ day, seconds }) => addActivity(kind, day, seconds).catch(() => {}));
    // Up to now the page was visible: count that (if this side was the one in use), then save what's left.
    const leave = () => {
      save(c.tick(Date.now(), inPane()));
      save(c.flush());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave();
      // Back: the time away doesn't count.
      else c.tick(Date.now(), false);
    };
    const onInput = () => c.input(Date.now());
    const el = scope.current ?? document;
    for (const ev of INPUTS) el.addEventListener(ev, onInput, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    // While the pomodoro counts as study (a focus, or a break if set so), the notebook would count it twice.
    const covered = () => kind === 'study' && studyRunning();
    const inPane = () => {
      const { active } = useSplit.getState();
      return !covered() && (!active || active === PANE[kind]);
    };
    const inUse = () => inPane() && document.visibilityState === 'visible';
    const timer = setInterval(() => save(c.tick(Date.now(), inUse())), TICK_MS);
    return () => {
      for (const ev of INPUTS) el.removeEventListener(ev, onInput, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      clearInterval(timer);
      if (document.visibilityState === 'visible') leave();
      clock.current = null;
    };
  }, [kind, scope]);

  return poke;
}
